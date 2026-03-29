/**
 * flowScheduler.ts
 * Sends two Cadence transactions to Flow testnet after agent setup:
 *   1. initHandler    — saves AgentScheduler.Handler to the app's Flow account
 *   2. scheduleDeposit — schedules the first recurring execution
 *
 * Signing: ECDSA_P256 + SHA3_256  (matches the faucet-created testnet account)
 *
 * Env vars required:
 *   FLOW_ACCESS_NODE        — e.g. https://rest-testnet.onflow.org
 *   FLOW_ACCOUNT_ADDRESS    — app's Flow account address
 *   FLOW_PRIVATE_KEY        — hex private key for that account
 *   FLOW_KEY_INDEX          — (optional) key index, defaults to 0
 *   AGENT_SCHEDULER_ADDRESS — deployed AgentScheduler contract on testnet
 */

import * as fcl from "@onflow/fcl"
// @ts-ignore — elliptic has types via @types/elliptic
import EC from "elliptic"
// @ts-ignore — sha3 ships its own types
import { SHA3 } from "sha3"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Frequency → delay in seconds for the FIRST scheduled execution
const FREQUENCY_DELAY: Record<string, number> = {
  daily:   86_400,
  weekly:  604_800,
  monthly: 2_592_000,
}

function getFlowEnv() {
  const accessNode    = process.env.FLOW_ACCESS_NODE?.trim()
  const accountAddr   = process.env.FLOW_ACCOUNT_ADDRESS?.trim()
  const privateKeyHex = process.env.FLOW_PRIVATE_KEY?.trim()
  const keyIndex      = Number(process.env.FLOW_KEY_INDEX ?? "0")
  const schedulerAddr = process.env.AGENT_SCHEDULER_ADDRESS?.trim()

  if (!accessNode || !accountAddr || !privateKeyHex || !schedulerAddr) {
    return null
  }
  return { accessNode, accountAddr, privateKeyHex, keyIndex, schedulerAddr }
}

export function hasFlowEnv(): boolean {
  return Boolean(getFlowEnv())
}

/**
 * Hash a hex-encoded message with SHA3-256.
 * Flow's signing protocol: SHA3_256(rawTxBytes) → sign with ECDSA_P256
 */
function hashMsg(msgHex: string): Buffer {
  const sha = new SHA3(256)
  sha.update(Buffer.from(msgHex, "hex"))
  return sha.digest() as Buffer
}

/**
 * Build an FCL authz function that signs with ECDSA_P256 + SHA3_256.
 * This matches the key algorithm used when creating the account via the Flow faucet.
 */
function makeAuthz(accountAddr: string, privateKeyHex: string, keyIndex: number) {
  // @ts-ignore
  const ec  = new EC.ec("p256")
  const key = ec.keyFromPrivate(privateKeyHex, "hex")

  return async (account: Record<string, unknown>) => {
    return {
      ...account,
      addr:  accountAddr,
      keyId: keyIndex,
      signingFunction: async (signable: { message: string }) => {
        const hash = hashMsg(signable.message)
        const sig  = key.sign(hash)
        const n    = 32
        const r    = sig.r.toArrayLike(Buffer, "be", n)
        const s    = sig.s.toArrayLike(Buffer, "be", n)
        const signature = Buffer.concat([r, s]).toString("hex")

        return {
          addr:      accountAddr,
          keyId:     keyIndex,
          signature,
        }
      },
    }
  }
}

/**
 * Read a Cadence transaction file from the cadence/transactions/ folder.
 */
function loadCadenceTx(filename: string): string {
  const txPath = join(__dirname, "../../../../cadence/transactions", filename)
  return readFileSync(txPath, "utf8")
}

export async function scheduleFlowDeposit(params: {
  userEVMAddress: string
  depositAmountUSDC: number
  frequency: string
}): Promise<{ initTxId: string; scheduleTxId: string }> {
  const env = getFlowEnv()
  if (!env) {
    throw new Error(
      "Flow env not configured. Set FLOW_ACCESS_NODE, FLOW_ACCOUNT_ADDRESS, " +
        "FLOW_PRIVATE_KEY, AGENT_SCHEDULER_ADDRESS in server/.env"
    )
  }

  const { accessNode, accountAddr, privateKeyHex, keyIndex } = env

  fcl.config({
    "accessNode.api": accessNode,
    "flow.network":   "testnet",
  })

  const authz      = makeAuthz(accountAddr, privateKeyHex, keyIndex)
  const delaySecs  = FREQUENCY_DELAY[params.frequency] ?? FREQUENCY_DELAY.weekly
  const execEffort = 1000

  // ── Step 1: initHandler ────────────────────────────────────────────────────
  // Saves AgentScheduler.Handler resource to the app's Flow account.
  // Only runs once per userEVMAddress (contract guards against duplicates).
  const initCode = loadCadenceTx("initHandler.cdc")

  console.log(`[Flow] Sending initHandler for user ${params.userEVMAddress}...`)

  const initTxId = await fcl.mutate({
    cadence: initCode,
    args: (arg: typeof fcl.arg, t: typeof fcl.t) => [
      arg(params.userEVMAddress,               t.String),
      arg(params.depositAmountUSDC.toFixed(8), t.UFix64),
    ],
    proposer:       authz,
    payer:          authz,
    authorizations: [authz],
    limit:          999,
  })

  console.log(`[Flow] initHandler tx submitted: ${initTxId}`)
  await fcl.tx(initTxId).onceSealed()
  console.log(`[Flow] initHandler sealed ✓`)

  // ── Step 2: scheduleDeposit ────────────────────────────────────────────────
  // Schedules the handler to fire at (now + delaySecs).
  // Flow network will auto-execute AgentScheduler.executeTransaction() at that time,
  // emitting DepositTriggered → flowListener picks it up → Sepolia vault deposit.
  const scheduleCode = loadCadenceTx("scheduleDeposit.cdc")

  console.log(
    `[Flow] Scheduling deposit — delay: ${delaySecs}s (${params.frequency})...`
  )

  const scheduleTxId = await fcl.mutate({
    cadence: scheduleCode,
    args: (arg: typeof fcl.arg, t: typeof fcl.t) => [
      arg(delaySecs.toFixed(8), t.UFix64),
      arg(String(execEffort),   t.UInt64),
    ],
    proposer:       authz,
    payer:          authz,
    authorizations: [authz],
    limit:          999,
  })

  console.log(`[Flow] scheduleDeposit tx submitted: ${scheduleTxId}`)
  await fcl.tx(scheduleTxId).onceSealed()
  console.log(`[Flow] scheduleDeposit sealed ✓`)

  console.log(
    `[Flow] Done — deposit for ${params.userEVMAddress} scheduled every ${params.frequency}`
  )

  return { initTxId, scheduleTxId }
}
