/**
 * flowListener.ts
 * Watches AgentScheduler.DepositTriggered on Flow testnet and enqueues pending deposits.
 * The dashboard polls for pending items and calls depositUsdcFromWallet (same as the manual
 * Deposit button — embedded wallet signs silently, no popup).
 *
 * When NAPFI_DEPOSIT_QUEUE_SOURCE=time (default), deposits are queued by scheduleTimeDepositQueue
 * when nextExecutionISO passes; this listener still logs DepositTriggered but does not enqueue.
 *
 * Uses HTTP polling (getEventsAtBlockHeightRange) instead of fcl.events().subscribe() because
 * @onflow/transport-http's WebSocket client does not attach an "error" listener; TLS resets
 * (ECONNRESET) then become unhandled "error" events and crash Node.
 *
 * Env:
 *   FLOW_ACCESS_NODE          — e.g. https://rest-testnet.onflow.org
 *   AGENT_SCHEDULER_ADDRESS   — AgentScheduler contract address on testnet
 *   FLOW_EVENTS_POLL_MS         — optional, default 10000
 *   FLOW_EVENTS_LOOKBACK_BLOCKS — optional, default 4000 (first poll scans this far back)
 */

import * as fcl from "@onflow/fcl"
import { configureFlowFcl } from "./flowFclConfig.js"
import { flowEventsShouldQueueDeposit } from "./depositQueueSource.js"
import { enqueueFlowPendingDeposit } from "./flowPendingDeposits.js"

/** @onflow/fcl typings omit send/decode/builders used at runtime */
const fclPoll = fcl as unknown as {
  send: (args: unknown[]) => Promise<unknown>
  decode: (response: unknown) => unknown
  getBlockHeader: (finalized: boolean) => unknown
  getEventsAtBlockHeightRange: (
    eventType: string,
    from: number,
    to: number
  ) => unknown
}

export type DepositTriggeredEvent = {
  userEVMAddress: string
  amount: string
  timestamp: string
}

let listenerStarted = false

/** Inclusive range length must be ≤ 250 per Access API; use to = from + 249. */
const MAX_BLOCK_SPAN = 249

function lookbackBlocks(): number {
  const n = Number.parseInt(process.env.FLOW_EVENTS_LOOKBACK_BLOCKS ?? "4000", 10)
  if (!Number.isFinite(n) || n < 0) return 4000
  return Math.min(n, 50_000)
}

function eventDataObject(ev: Record<string, unknown>): Record<string, unknown> | null {
  const d = ev.data
  if (d && typeof d === "object" && !Array.isArray(d)) {
    return d as Record<string, unknown>
  }
  const p = ev.payload
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return p as Record<string, unknown>
  }
  if (typeof ev.userEVMAddress === "string") {
    return ev as Record<string, unknown>
  }
  return null
}

function cadenceScalarToString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === "bigint") return v.toString()
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v === "string") return v
  return String(v)
}

function asDepositTriggered(raw: Record<string, unknown>): DepositTriggeredEvent | null {
  const addrRaw = raw.userEVMAddress
  const userEVMAddress =
    typeof addrRaw === "string" ? addrRaw.trim() : cadenceScalarToString(addrRaw)?.trim()
  if (!userEVMAddress || !/^0x[a-fA-F0-9]{40}$/.test(userEVMAddress)) {
    return null
  }
  const amount = cadenceScalarToString(raw.amount)
  const timestamp = cadenceScalarToString(raw.timestamp)
  if (amount == null || timestamp == null) return null
  return {
    userEVMAddress,
    amount,
    timestamp,
  }
}

function decodedEventRows(decoded: unknown): Record<string, unknown>[] {
  if (Array.isArray(decoded)) {
    return decoded.filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
  }
  if (decoded && typeof decoded === "object" && Array.isArray((decoded as { events?: unknown }).events)) {
    const evs = (decoded as { events: unknown[] }).events
    return evs.filter((r): r is Record<string, unknown> => r != null && typeof r === "object")
  }
  return []
}

function processDepositTriggered(raw: DepositTriggeredEvent): void {
  const { userEVMAddress, amount, timestamp } = raw
  const amountUSDC = parseFloat(amount)

  console.log(
    `\n[NapFi][Flow] DepositTriggered — user: ${userEVMAddress} | amount: ${amountUSDC} USDC | ts: ${timestamp}`
  )

  if (!flowEventsShouldQueueDeposit()) {
    console.log(
      "[NapFi][Flow] NAPFI_DEPOSIT_QUEUE_SOURCE=time — not enqueueing from chain event; schedule-time watcher enqueues when nextExecutionISO passes."
    )
    return
  }

  try {
    const q = enqueueFlowPendingDeposit({
      userEVMAddress,
      amountUSDC,
      flowTimestamp: timestamp,
    })
    console.log(
      `[NapFi] Queued Flow deposit id=${q.id} — dashboard auto-deposits USDC from embedded wallet (same as manual Deposit button, no popup).`
    )
  } catch (err) {
    console.error("[Flow] Error queueing DepositTriggered:", err)
  }
}

export function startFlowListener(): void {
  const accessNode = process.env.FLOW_ACCESS_NODE?.trim()
  const schedulerAddr = process.env.AGENT_SCHEDULER_ADDRESS?.trim()

  if (!accessNode || !schedulerAddr) {
    console.warn(
      "[Flow] FLOW_ACCESS_NODE or AGENT_SCHEDULER_ADDRESS not set — Flow listener disabled."
    )
    return
  }

  if (listenerStarted) return
  listenerStarted = true

  configureFlowFcl(accessNode)

  const eventType = `A.${schedulerAddr.replace("0x", "")}.AgentScheduler.DepositTriggered`
  const pollMs = Math.max(
    3000,
    Number.parseInt(process.env.FLOW_EVENTS_POLL_MS ?? "10000", 10) || 10000
  )

  console.log(
    `[Flow] Polling for events (HTTP, ${pollMs}ms): ${eventType}`
  )

  let lastEndHeight = -1
  let pollInFlight = false
  const lookback = lookbackBlocks()

  const poll = async (): Promise<void> => {
    if (pollInFlight) return
    pollInFlight = true
    try {
      const header = fclPoll.decode(
        await fclPoll.send([fclPoll.getBlockHeader(true)])
      ) as { height: number | string }
      const latest = Number(header.height)
      if (!Number.isFinite(latest) || latest < 0) return

      if (lastEndHeight < 0) {
        // Scan back so we do not miss DepositTriggered if the listener started after the job fired.
        lastEndHeight = Math.max(0, latest - lookback) - 1
        console.log(
          `[Flow] First poll: scanning blocks from height ${lastEndHeight + 1} through ${latest} (lookback ≤ ${lookback})`
        )
      }

      while (lastEndHeight < latest) {
        const from = lastEndHeight + 1
        const to = Math.min(latest, from + MAX_BLOCK_SPAN)
        const decoded = fclPoll.decode(
          await fclPoll.send([
            fclPoll.getEventsAtBlockHeightRange(eventType, from, to),
          ])
        )

        const rows = decodedEventRows(decoded)
        for (const row of rows) {
          const obj = eventDataObject(row)
          const deposit = obj ? asDepositTriggered(obj) : null
          if (deposit) {
            processDepositTriggered(deposit)
          } else if (typeof row.type === "string" && row.type.includes("DepositTriggered")) {
            console.warn(
              "[Flow] DepositTriggered-shaped event could not be parsed; raw keys:",
              Object.keys(row),
              "data keys:",
              obj ? Object.keys(obj) : "(no data)"
            )
          }
        }
        lastEndHeight = to
      }
    } catch (err) {
      console.error("[Flow] Event poll error:", err)
    } finally {
      pollInFlight = false
    }
  }

  void poll()
  setInterval(() => {
    void poll()
  }, pollMs)

  console.log("[Flow] Listener active (HTTP polling).")
}
