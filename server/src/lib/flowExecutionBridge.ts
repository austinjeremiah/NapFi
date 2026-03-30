/**
 * Breaks the circular dependency between flowListener and index:
 * index registers a handler; the listener invokes it after a successful Sepolia deposit.
 */

export type FlowDepositCompletedPayload = {
  userEVMAddress: string
  amountUSDC: number
  sepoliaTxHash: string
  flowTimestamp: string
}

type Handler = (p: FlowDepositCompletedPayload) => void | Promise<void>

let handler: Handler | null = null

export function setFlowDepositCompletedHandler(h: Handler): void {
  handler = h
}

export async function notifyFlowDepositCompleted(
  p: FlowDepositCompletedPayload
): Promise<void> {
  await handler?.(p)
}
