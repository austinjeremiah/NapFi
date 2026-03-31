/**
 * How pending USDC deposits get onto the server queue for the dashboard to sign.
 *
 * - "time" (default): when wall clock passes user.nextExecutionISO, the schedule-time
 *   watcher enqueues (no reliance on Flow DepositTriggered).
 * - "chain": only Flow DepositTriggered enqueues (legacy).
 */

export type DepositQueueSource = "chain" | "time"

export function getDepositQueueSource(): DepositQueueSource {
  const v = process.env.NAPFI_DEPOSIT_QUEUE_SOURCE?.trim().toLowerCase()
  if (v === "chain") return "chain"
  return "time"
}

export function flowEventsShouldQueueDeposit(): boolean {
  return getDepositQueueSource() === "chain"
}
