/**
 * FIFO queue of Flow-automation deposits waiting for the dashboard's embedded wallet
 * to call depositUsdcFromWallet (same as the manual Deposit button — no popup).
 */

import { randomUUID } from "crypto"
import { getAddress } from "ethers"

export type FlowPendingDeposit = {
  id: string
  userEVMAddress: string
  amountUSDC: number
  flowTimestamp: string
  createdAt: string
}

const queues = new Map<string, FlowPendingDeposit[]>()

export function enqueueFlowPendingDeposit(params: {
  userEVMAddress: string
  amountUSDC: number
  flowTimestamp: string
}): FlowPendingDeposit {
  const k = getAddress(params.userEVMAddress).toLowerCase()
  const item: FlowPendingDeposit = {
    id: randomUUID(),
    userEVMAddress: getAddress(params.userEVMAddress),
    amountUSDC: params.amountUSDC,
    flowTimestamp: params.flowTimestamp,
    createdAt: new Date().toISOString(),
  }
  const q = queues.get(k) ?? []
  q.push(item)
  queues.set(k, q)
  return item
}

export function peekFlowPendingDeposit(
  userAddress: string
): FlowPendingDeposit | null {
  const k = getAddress(userAddress).toLowerCase()
  const q = queues.get(k)
  return q?.[0] ?? null
}

export function consumeFlowPendingDeposit(
  userAddress: string,
  id: string
): FlowPendingDeposit | null {
  const k = getAddress(userAddress).toLowerCase()
  const q = queues.get(k)
  if (!q?.length) return null
  const idx = q.findIndex((d) => d.id === id)
  if (idx < 0) return null
  const [consumed] = q.splice(idx, 1)
  if (q.length === 0) queues.delete(k)
  else queues.set(k, q)
  return consumed
}
