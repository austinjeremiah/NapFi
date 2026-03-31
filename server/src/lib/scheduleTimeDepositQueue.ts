/**
 * Enqueues Flow-style pending deposits when the API's scheduled time (nextExecutionISO)
 * has passed — same queue as /api/flow-deposit-pending, consumed by the dashboard via
 * depositUsdcFromWallet. Use when Flow DepositTriggered is unreliable or disabled for queuing.
 */

import { getAddress } from "ethers"
import { enqueueFlowPendingDeposit, peekFlowPendingDeposit } from "./flowPendingDeposits.js"

export type MinimalUserForSchedule = {
  userAddress: string
  goalAmountUSDC: number
  nextExecutionISO: string
}

/** One pass over all users; returns how many new queue entries were added. */
export function runScheduleTimeDepositEnqueuePass(
  allUsers: Iterable<MinimalUserForSchedule>
): number {
  const now = Date.now()
  let added = 0
  for (const u of allUsers) {
    if (!u.goalAmountUSDC || u.goalAmountUSDC <= 0) continue
    const due = new Date(u.nextExecutionISO).getTime()
    if (!Number.isFinite(due) || now < due) continue
    let addr: string
    try {
      addr = getAddress(u.userAddress)
    } catch {
      continue
    }
    if (peekFlowPendingDeposit(addr)) continue
    try {
      const q = enqueueFlowPendingDeposit({
        userEVMAddress: addr,
        amountUSDC: u.goalAmountUSDC,
        flowTimestamp: u.nextExecutionISO,
      })
      added++
      console.log(
        `[NapFi][ScheduleTime] Queued USDC deposit id=${q.id} for ${addr} — amount ${u.goalAmountUSDC} USDC (nextExecutionISO ${u.nextExecutionISO})`
      )
    } catch (e) {
      console.error("[NapFi][ScheduleTime] enqueue failed:", e)
    }
  }
  return added
}
