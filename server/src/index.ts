import "dotenv/config"
import cors from "cors"
import express from "express"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { runNapFiOnchainSetup } from "./lib/onchainSetup.js"
import { lookupUserOnChain } from "./lib/registryLookup.js"
import { getAddress } from "ethers"

const __dirname = dirname(fileURLToPath(import.meta.url))

type Frequency = "daily" | "weekly" | "monthly"

type UserRecord = {
  userAddress: string
  goalAmountUSDC: number
  frequency: Frequency
  yieldEnabled: boolean
  agentId: number
  vaultAddress: string
  nextExecutionISO: string
  totalExecutions: number
  status: "active" | "paused"
  updatedAt: string
  ipfsUri?: string
  txHashes?: {
    register: string
    setAgentWallet: string
    registerUserAgent: string
  }
  chainOnly?: boolean
}

function loadVaultFromContracts(): string {
  const path = join(__dirname, "../../contracts.json")
  const raw = readFileSync(path, "utf8")
  const data = JSON.parse(raw) as {
    ethereumSepolia: { contracts: { encryptedVault: string } }
  }
  return data.ethereumSepolia.contracts.encryptedVault
}

const VAULT_DEFAULT = loadVaultFromContracts()

/** In-memory store (goal + flags). Key = lowercase address */
const users = new Map<string, UserRecord>()

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase()
}

function frequencyFromUI(f: string): Frequency {
  const m: Record<string, Frequency> = {
    daily: "daily",
    weekly: "weekly",
    monthly: "monthly",
    Daily: "daily",
    Weekly: "weekly",
    Monthly: "monthly",
  }
  const v = m[f]
  if (!v) throw new Error("Invalid frequency")
  return v
}

function nextExecutionISO(f: Frequency): string {
  const d = new Date()
  if (f === "daily") d.setDate(d.getDate() + 1)
  else if (f === "weekly") d.setDate(d.getDate() + 7)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString()
}

function hasIpfsCredential(): boolean {
  return Boolean(
    process.env.LIGHTHOUSE_API_KEY?.trim() || process.env.PINATA_JWT?.trim()
  )
}

function hasOnchainEnv(): boolean {
  return Boolean(
    process.env.SEPOLIA_RPC_URL?.trim() &&
      process.env.BACKEND_PRIVATE_KEY?.trim() &&
      hasIpfsCredential()
  )
}

const PORT = Number(process.env.PORT) || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000"

const app = express()
app.use(cors({ origin: CORS_ORIGIN, credentials: true }))
app.use(express.json())

app.get("/", (_req, res) => {
  res.json({
    service: "napfi-api",
    message:
      "JSON API only — open the app at http://localhost:3000 (Next.js). This port has no HTML UI.",
    endpoints: {
      health: "GET /health",
      setup: "POST /api/setup",
      agent: "GET /api/agent/:userAddress",
      receipts: "GET /api/receipts/:agentId",
    },
    onchain: hasOnchainEnv(),
  })
})

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "napfi-api", onchainReady: hasOnchainEnv() })
})

/**
 * POST /api/setup — Pin IPFS → ERC-8004 register → setAgentWallet → AgentRegistry.registerUserAgent
 */
app.post("/api/setup", async (req, res) => {
  try {
    const body = req.body as {
      userAddress?: string
      goalAmountUSDC?: number
      frequency?: string
      yieldEnabled?: boolean
    }

    const userAddress = body.userAddress ? normalizeAddress(body.userAddress) : ""
    if (!userAddress || !/^0x[a-f0-9]{40}$/.test(userAddress)) {
      res.status(400).json({ error: "Invalid or missing userAddress" })
      return
    }

    const goal =
      typeof body.goalAmountUSDC === "number"
        ? body.goalAmountUSDC
        : Number(body.goalAmountUSDC)
    if (!Number.isFinite(goal) || goal <= 0) {
      res.status(400).json({ error: "goalAmountUSDC must be a positive number" })
      return
    }

    const frequency = frequencyFromUI(String(body.frequency ?? "weekly"))
    const yieldEnabled = Boolean(body.yieldEnabled)

    const existing = users.get(userAddress)

    /** Update goal only — no second IdentityRegistry mint (e.g. Settings save). */
    if (existing != null && existing.agentId > 0) {
      const record: UserRecord = {
        ...existing,
        goalAmountUSDC: goal,
        frequency,
        yieldEnabled,
        nextExecutionISO: nextExecutionISO(frequency),
        updatedAt: new Date().toISOString(),
      }
      users.set(userAddress, record)
      res.json({
        agentId: record.agentId,
        vaultAddress: record.vaultAddress,
        nextExecutionISO: record.nextExecutionISO,
        ipfsUri: record.ipfsUri,
        txHashes: record.txHashes,
        updated: true,
      })
      return
    }

    let chainRow: Awaited<ReturnType<typeof lookupUserOnChain>> = null
    try {
      chainRow = await lookupUserOnChain(userAddress)
    } catch {
      chainRow = null
    }

    if (chainRow) {
      const vault =
        process.env.VAULT_CONTRACT_ADDRESS?.trim() || loadVaultFromContracts()
      const record: UserRecord = {
        userAddress,
        goalAmountUSDC: goal,
        frequency,
        yieldEnabled,
        agentId: chainRow.agentId,
        vaultAddress: chainRow.vaultAddress || vault,
        nextExecutionISO: nextExecutionISO(frequency),
        totalExecutions: 0,
        status: "active",
        updatedAt: new Date().toISOString(),
        chainOnly: true,
      }
      users.set(userAddress, record)
      res.json({
        agentId: record.agentId,
        vaultAddress: record.vaultAddress,
        nextExecutionISO: record.nextExecutionISO,
        updated: true,
        note: "Goal updated in API; agent already registered on-chain.",
      })
      return
    }

    if (!hasOnchainEnv()) {
      res.status(503).json({
        error:
          "First-time on-chain setup requires SEPOLIA_RPC_URL, BACKEND_PRIVATE_KEY, and either LIGHTHOUSE_API_KEY or PINATA_JWT in server/.env",
      })
      return
    }

    const onchain = await runNapFiOnchainSetup({
      userAddress: getAddress(userAddress),
      goalAmountUSDC: goal,
      frequency,
      yieldEnabled,
    })

    const record: UserRecord = {
      userAddress,
      goalAmountUSDC: goal,
      frequency,
      yieldEnabled,
      agentId: onchain.agentId,
      vaultAddress: onchain.vaultAddress,
      nextExecutionISO: nextExecutionISO(frequency),
      totalExecutions: existing?.totalExecutions ?? 0,
      status: "active",
      updatedAt: new Date().toISOString(),
      ipfsUri: onchain.ipfsUri,
      txHashes: onchain.txHashes,
      chainOnly: false,
    }

    users.set(userAddress, record)

    res.json({
      agentId: record.agentId,
      vaultAddress: record.vaultAddress,
      nextExecutionISO: record.nextExecutionISO,
      ipfsUri: onchain.ipfsUri,
      txHashes: onchain.txHashes,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Setup failed"
    console.error("[POST /api/setup]", e)
    res.status(400).json({ error: msg })
  }
})

/**
 * GET /api/agent/:userAddress — memory first, then on-chain AgentRegistry.lookup
 */
app.get("/api/agent/:userAddress", async (req, res) => {
  const userAddress = normalizeAddress(req.params.userAddress)
  if (!/^0x[a-f0-9]{40}$/.test(userAddress)) {
    res.status(400).json({ error: "Invalid address" })
    return
  }

  const mem = users.get(userAddress)
  if (mem) {
    res.json({
      agentId: mem.agentId,
      vaultAddress: mem.vaultAddress,
      nextExecutionISO: mem.nextExecutionISO,
      totalExecutions: mem.totalExecutions,
      status: mem.status,
      goalAmountUSDC: mem.goalAmountUSDC,
      frequency: mem.frequency,
      yieldEnabled: mem.yieldEnabled,
      ipfsUri: mem.ipfsUri,
      txHashes: mem.txHashes,
      chainOnly: mem.chainOnly ?? false,
    })
    return
  }

  try {
    const on = await lookupUserOnChain(userAddress)
    if (!on) {
      res.status(404).json({ error: "No agent setup for this address" })
      return
    }

    res.json({
      agentId: on.agentId,
      vaultAddress: on.vaultAddress,
      nextExecutionISO: new Date().toISOString(),
      totalExecutions: 0,
      status: "active" as const,
      goalAmountUSDC: 0,
      frequency: "weekly" as Frequency,
      yieldEnabled: false,
      chainOnly: true,
      note:
        "Goal amounts are not stored on-chain; complete setup again in the app or rely on a persistent API database.",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed"
    res.status(500).json({ error: msg })
  }
})

app.get("/api/receipts/:agentId", (req, res) => {
  const agentId = Number(req.params.agentId)
  if (!Number.isFinite(agentId)) {
    res.status(400).json({ error: "Invalid agentId" })
    return
  }
  res.json({ receipts: [] as unknown[] })
})

const server = app.listen(PORT, () => {
  console.log(`NapFi API listening on http://localhost:${PORT}`)
  console.log(`CORS origin: ${CORS_ORIGIN}`)
  console.log(
    `On-chain setup ready: ${hasOnchainEnv()} (needs SEPOLIA_RPC_URL, BACKEND_PRIVATE_KEY, LIGHTHOUSE_API_KEY or PINATA_JWT)`
  )
  console.log(`Default vault from contracts.json: ${process.env.VAULT_CONTRACT_ADDRESS || VAULT_DEFAULT}`)
})

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use (another napfi-api or app is running).\n` +
        `Stop it: Task Manager → end "node", or run:\n` +
        `  netstat -ano | findstr :${PORT}\n` +
        `  taskkill /PID <pid> /F\n` +
        `Or set a different port: PORT=3002 in server/.env\n`
    )
  }
  throw err
})
