import "dotenv/config"
import cors from "cors"
import express from "express"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { runNapFiOnchainSetup } from "./lib/onchainSetup.js"
import { lookupUserOnChain } from "./lib/registryLookup.js"
import { startFlowListener } from "./lib/flowListener.js"
import {
  scheduleFlowDeposit,
  scheduleNextFlowDeposit,
  scheduleNextFlowDepositWithDelay,
  hasFlowEnv,
  getFlowScheduleDelaySeconds,
} from "./lib/flowScheduler.js"
import { setFlowDepositCompletedHandler } from "./lib/flowExecutionBridge.js"
import { executeEncryptedDeposit } from "./lib/sepoliaExecutor.js"
import { postReputationReceipt } from "./lib/reputationPoster.js"
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
  /** Flow testnet txs from initHandler + scheduleDeposit (and later re-schedules). */
  flowSchedule?: {
    initTxId?: string
    scheduleTxId?: string
    delaySeconds: number
    scheduledAtISO: string
    lastRescheduleAtISO?: string
    flowNetwork?: "testnet"
  }
  /** Automation runs: Flow → FHE vault deposit on Sepolia (+ reputation). */
  automationReceipts?: Array<{
    at: string
    amountUSDC: number
    sepoliaTxHash: string
    flowTimestamp: string
  }>
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

function findUserByAgentId(agentId: number): UserRecord | undefined {
  for (const u of users.values()) {
    if (u.agentId === agentId) return u
  }
  return undefined
}

/** Goal amount for hydrated / demo paths when goal is not in RAM (not stored on-chain). */
function defaultDemoGoalUsdc(): number {
  const n = Number(process.env.DEMO_DEFAULT_GOAL_USDC ?? "1")
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * If the API restarted, RAM is empty but the wallet may already be registered on Sepolia.
 * No LLM key is used — automation is Flow + Sepolia only.
 */
async function hydrateUserFromChainIfNeeded(
  userAddress: string
): Promise<UserRecord | null> {
  const key = normalizeAddress(userAddress)
  const existing = users.get(key)
  if (existing) return existing

  const on = await lookupUserOnChain(key)
  if (!on) return null

  const vault = process.env.VAULT_CONTRACT_ADDRESS?.trim() || VAULT_DEFAULT
  const goal = defaultDemoGoalUsdc()

  const record: UserRecord = {
    userAddress: key,
    goalAmountUSDC: goal,
    frequency: "weekly",
    yieldEnabled: false,
    agentId: on.agentId,
    vaultAddress: on.vaultAddress || vault,
    nextExecutionISO: new Date(Date.now() + 604_800_000).toISOString(),
    totalExecutions: 0,
    status: "active",
    updatedAt: new Date().toISOString(),
    chainOnly: true,
  }
  users.set(key, record)
  console.log(
    "\n[NapFi] Hydrated agent from Sepolia AgentRegistry (RAM was empty; not an LLM — Flow + Sepolia only)"
  )
  console.log(
    `   wallet=${key} agentId=${on.agentId} vault=${record.vaultAddress} demoGoal=${goal} USDC (DEMO_DEFAULT_GOAL_USDC)`
  )
  return record
}

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

setFlowDepositCompletedHandler(async (p) => {
  const key = normalizeAddress(p.userEVMAddress)
  const u = users.get(key)
  if (!u) return

  const prev = u.automationReceipts ?? []
  u.automationReceipts = [
    {
      at: new Date().toISOString(),
      amountUSDC: p.amountUSDC,
      sepoliaTxHash: p.sepoliaTxHash,
      flowTimestamp: p.flowTimestamp,
    },
    ...prev,
  ].slice(0, 50)

  u.totalExecutions = (u.totalExecutions ?? 0) + 1

  let delaySeconds: number
  try {
    delaySeconds = getFlowScheduleDelaySeconds(u.frequency)
  } catch {
    delaySeconds = 86_400
  }
  u.nextExecutionISO = new Date(Date.now() + delaySeconds * 1000).toISOString()

  if (hasFlowEnv()) {
    try {
      const { scheduleTxId, delaySeconds: d2 } =
        await scheduleNextFlowDeposit(u.frequency)
      u.flowSchedule = {
        ...(u.flowSchedule ?? { delaySeconds: d2, scheduledAtISO: u.updatedAt }),
        scheduleTxId,
        delaySeconds: d2,
        lastRescheduleAtISO: new Date().toISOString(),
        flowNetwork: "testnet",
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[Flow] scheduleNextFlowDeposit failed: ${msg}`)
    }
  }

  u.updatedAt = new Date().toISOString()
  users.set(key, u)
})

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

/** Demo routes default on so local/prod misconfig (NODE_ENV) does not break the button. Set NAPFI_DEMO_ENDPOINTS=false to disable. */
function demoEndpointsEnabled(): boolean {
  return process.env.NAPFI_DEMO_ENDPOINTS?.trim().toLowerCase() !== "false"
}

const DEMO_ONE_MINUTE_SECONDS = 60

const PORT = Number(process.env.PORT) || 3001
/** Comma-separated in .env — include every browser origin you use (localhost vs 127.0.0.1 differ for CORS). */
const CORS_ORIGINS = (process.env.CORS_ORIGIN ||
  "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean)

const app = express()
app.use(cors({ origin: CORS_ORIGINS, credentials: true }))
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
      demoScheduleOneMinute: "POST /api/demo/schedule-one-minute",
      demoExecuteDeposit: "POST /api/demo/execute-deposit",
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

    let flowSchedule: UserRecord["flowSchedule"] | undefined
    let nextRunISO = nextExecutionISO(frequency)

    if (hasFlowEnv()) {
      try {
        const flow = await scheduleFlowDeposit({
          userEVMAddress: getAddress(userAddress),
          depositAmountUSDC: goal,
          frequency,
        })
        console.log(`   Flow initHandler  : ${flow.initTxId}`)
        console.log(`   Flow schedule     : ${flow.scheduleTxId}`)
        const scheduledAt = new Date().toISOString()
        flowSchedule = {
          initTxId: flow.initTxId,
          scheduleTxId: flow.scheduleTxId,
          delaySeconds: flow.delaySeconds,
          scheduledAtISO: scheduledAt,
          flowNetwork: "testnet",
        }
        nextRunISO = new Date(Date.now() + flow.delaySeconds * 1000).toISOString()
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`[Flow] scheduleFlowDeposit failed: ${msg}`)
      }
    } else {
      console.log(
        "   [Flow] Scheduler skipped — set FLOW_ACCESS_NODE, FLOW_ACCOUNT_ADDRESS, FLOW_PRIVATE_KEY, AGENT_SCHEDULER_ADDRESS"
      )
    }

    const record: UserRecord = {
      userAddress,
      goalAmountUSDC: goal,
      frequency,
      yieldEnabled,
      agentId: onchain.agentId,
      vaultAddress: onchain.vaultAddress,
      nextExecutionISO: nextRunISO,
      totalExecutions: existing?.totalExecutions ?? 0,
      status: "active",
      updatedAt: new Date().toISOString(),
      ipfsUri: onchain.ipfsUri,
      txHashes: onchain.txHashes,
      chainOnly: false,
      flowSchedule,
      automationReceipts: existing?.automationReceipts,
    }

    users.set(userAddress, record)

    console.log(`\n✅ Agent created for ${userAddress}`)
    console.log(`   Agent ID  : ${onchain.agentId}`)
    console.log(`   Vault     : ${onchain.vaultAddress}`)
    console.log(`   IPFS URI  : ${onchain.ipfsUri}`)
    console.log(`   TX register        : https://sepolia.etherscan.io/tx/${onchain.txHashes.register}`)
    console.log(`   TX setAgentWallet  : https://sepolia.etherscan.io/tx/${onchain.txHashes.setAgentWallet}`)
    console.log(`   TX registerUserAgent: https://sepolia.etherscan.io/tx/${onchain.txHashes.registerUserAgent}\n`)

    res.json({
      agentId: record.agentId,
      vaultAddress: record.vaultAddress,
      nextExecutionISO: record.nextExecutionISO,
      ipfsUri: onchain.ipfsUri,
      txHashes: onchain.txHashes,
      flowSchedule: record.flowSchedule,
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
      flowSchedule: mem.flowSchedule,
      automationReceipts: mem.automationReceipts ?? [],
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

/**
 * Demo: schedule next Flow run in 60s and align API nextExecutionISO (real Flow → listener → vault).
 * Disabled only when NAPFI_DEMO_ENDPOINTS=false. Requires Flow env for this route (else 503 → client fallback).
 */
app.post("/api/demo/schedule-one-minute", async (req, res) => {
  if (!demoEndpointsEnabled()) {
    res.status(403).json({
      error:
        "Demo endpoints are disabled (NAPFI_DEMO_ENDPOINTS=false). Remove that line or set it to true.",
    })
    return
  }
  const userAddress = normalizeAddress(String(req.body?.userAddress ?? ""))
  if (!/^0x[a-f0-9]{40}$/.test(userAddress)) {
    res.status(400).json({ error: "Invalid userAddress" })
    return
  }
  let u = users.get(userAddress)
  if (!u) {
    u = (await hydrateUserFromChainIfNeeded(userAddress)) ?? undefined
  }
  if (!u) {
    res.status(422).json({
      error:
        "No agent registered for this wallet on Sepolia. Complete onboarding (Create Agent) first.",
    })
    return
  }
  if (!hasFlowEnv()) {
    res.status(503).json({
      error:
        "Flow is not configured on this server (FLOW_ACCESS_NODE, FLOW_ACCOUNT_ADDRESS, FLOW_PRIVATE_KEY, AGENT_SCHEDULER_ADDRESS).",
    })
    return
  }
  try {
    console.log(
      `\n[NapFi] Demo schedule-one-minute — wallet=${userAddress} chainOnly=${Boolean(u.chainOnly)}`
    )

    if (u.chainOnly) {
      console.log(
        "[NapFi] Flow: initHandler + scheduleDeposit (60s) for hydrated registered agent"
      )
      const flow = await scheduleFlowDeposit({
        userEVMAddress: getAddress(userAddress),
        depositAmountUSDC: u.goalAmountUSDC,
        frequency: u.frequency,
        scheduleDelaySecondsOverride: DEMO_ONE_MINUTE_SECONDS,
      })
      const nextISO = new Date(Date.now() + flow.delaySeconds * 1000).toISOString()
      u.nextExecutionISO = nextISO
      u.chainOnly = false
      u.flowSchedule = {
        initTxId: flow.initTxId,
        scheduleTxId: flow.scheduleTxId,
        delaySeconds: flow.delaySeconds,
        scheduledAtISO: new Date().toISOString(),
        flowNetwork: "testnet",
      }
      u.updatedAt = new Date().toISOString()
      users.set(userAddress, u)
      console.log(
        `[NapFi] Flow testnet — initHandler: ${flow.initTxId} | scheduleDeposit: ${flow.scheduleTxId} (sealed)`
      )
      console.log(
        `[NapFi] In ~${flow.delaySeconds}s: Flow emits DepositTriggered → this server → Sepolia EncryptedVault.deposit (see [Flow→Sepolia] / [Sepolia])`
      )
      res.json({
        nextExecutionISO: nextISO,
        initTxId: flow.initTxId,
        scheduleTxId: flow.scheduleTxId,
        delaySeconds: flow.delaySeconds,
        flowSchedule: u.flowSchedule,
      })
    } else {
      const { scheduleTxId, delaySeconds } =
        await scheduleNextFlowDepositWithDelay(DEMO_ONE_MINUTE_SECONDS)
      const nextISO = new Date(Date.now() + delaySeconds * 1000).toISOString()
      u.nextExecutionISO = nextISO
      u.flowSchedule = {
        ...(u.flowSchedule ?? {
          delaySeconds,
          scheduledAtISO: new Date().toISOString(),
        }),
        scheduleTxId,
        delaySeconds,
        lastRescheduleAtISO: new Date().toISOString(),
        flowNetwork: "testnet",
      }
      u.updatedAt = new Date().toISOString()
      users.set(userAddress, u)
      console.log(
        `[NapFi] Flow testnet — scheduleDeposit: ${scheduleTxId} (${delaySeconds}s to DepositTriggered)`
      )
      console.log(
        "[NapFi] Then: listener → Sepolia EncryptedVault.deposit — watch for [Flow→Sepolia] and [Sepolia]"
      )
      res.json({
        nextExecutionISO: nextISO,
        scheduleTxId,
        delaySeconds,
        flowSchedule: u.flowSchedule,
      })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Schedule failed"
    console.error("[POST /api/demo/schedule-one-minute]", e)
    res.status(500).json({ error: msg })
  }
})

/**
 * Demo fallback: run the same EncryptedVault deposit + reputation as the Flow listener,
 * without Flow (for when Flow is not configured). Guarded by NAPFI_DEMO_ENDPOINTS.
 */
app.post("/api/demo/execute-deposit", async (req, res) => {
  if (!demoEndpointsEnabled()) {
    res.status(403).json({
      error:
        "Demo endpoints are disabled (NAPFI_DEMO_ENDPOINTS=false). Remove that line or set it to true.",
    })
    return
  }
  if (!hasOnchainEnv()) {
    res.status(503).json({
      error:
        "On-chain env not configured (SEPOLIA_RPC_URL, BACKEND_PRIVATE_KEY, IPFS).",
    })
    return
  }
  const userAddress = normalizeAddress(String(req.body?.userAddress ?? ""))
  if (!/^0x[a-f0-9]{40}$/.test(userAddress)) {
    res.status(400).json({ error: "Invalid userAddress" })
    return
  }
  let u = users.get(userAddress)
  if (!u) {
    u = (await hydrateUserFromChainIfNeeded(userAddress)) ?? undefined
  }
  if (!u) {
    res.status(422).json({
      error:
        "No agent registered for this wallet on Sepolia. Complete onboarding (Create Agent) first.",
    })
    return
  }
  try {
    console.log(
      `\n[NapFi] Demo execute-deposit (no Flow) — wallet=${userAddress} agentId=${u.agentId}`
    )
    const evm = getAddress(userAddress)
    const { sepoliaTxHash } = await executeEncryptedDeposit({
      userEVMAddress: evm,
      amountUSDC: u.goalAmountUSDC,
    })
    await postReputationReceipt({
      userEVMAddress: evm,
      amountUSDC: u.goalAmountUSDC,
      sepoliaTxHash,
      flowTimestamp: new Date().toISOString(),
    })
    const prev = u.automationReceipts ?? []
    u.automationReceipts = [
      {
        at: new Date().toISOString(),
        amountUSDC: u.goalAmountUSDC,
        sepoliaTxHash,
        flowTimestamp: "demo (no Flow)",
      },
      ...prev,
    ].slice(0, 50)
    u.totalExecutions = (u.totalExecutions ?? 0) + 1
    let delaySeconds: number
    try {
      delaySeconds = getFlowScheduleDelaySeconds(u.frequency)
    } catch {
      delaySeconds = 86_400
    }
    u.nextExecutionISO = new Date(Date.now() + delaySeconds * 1000).toISOString()
    u.updatedAt = new Date().toISOString()
    users.set(userAddress, u)
    console.log(`[NapFi] Sepolia demo complete — tx: ${sepoliaTxHash}`)
    res.json({
      sepoliaTxHash,
      totalExecutions: u.totalExecutions,
      nextExecutionISO: u.nextExecutionISO,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Execute failed"
    console.error("[POST /api/demo/execute-deposit]", e)
    res.status(500).json({ error: msg })
  }
})

app.get("/api/receipts/:agentId", (req, res) => {
  const agentId = Number(req.params.agentId)
  if (!Number.isFinite(agentId)) {
    res.status(400).json({ error: "Invalid agentId" })
    return
  }
  const u = findUserByAgentId(agentId)
  res.json({ receipts: u?.automationReceipts ?? [] })
})

const server = app.listen(PORT, () => {
  console.log(`NapFi API listening on http://localhost:${PORT}`)
  console.log(`CORS origins: ${CORS_ORIGINS.join(", ")}`)
  console.log(
    `On-chain setup ready: ${hasOnchainEnv()} (needs SEPOLIA_RPC_URL, BACKEND_PRIVATE_KEY, LIGHTHOUSE_API_KEY or PINATA_JWT)`
  )
  console.log(
    "Automation stack: Flow (Cadence) + Sepolia (fhEVM) — no LLM API key required for deposits."
  )
  console.log(`Default vault from contracts.json: ${process.env.VAULT_CONTRACT_ADDRESS || VAULT_DEFAULT}`)
  console.log(`Flow scheduler ready: ${hasFlowEnv()}`)
  console.log(
    `Demo endpoints: ${demoEndpointsEnabled()} (set NAPFI_DEMO_ENDPOINTS=false to disable)`
  )

  // Start listening for Flow DepositTriggered events
  startFlowListener()
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
