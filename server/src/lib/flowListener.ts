/**
 * flowListener.ts
 * Subscribes to AgentScheduler.DepositTriggered events on Flow testnet.
 * When an event fires, it calls sepoliaExecutor → reputationPoster.
 *
 * Env vars required:
 *   FLOW_ACCESS_NODE          — e.g. https://rest-testnet.onflow.org
 *   AGENT_SCHEDULER_ADDRESS   — deployed AgentScheduler contract address on testnet
 */

import * as fcl from "@onflow/fcl"
import { configureFlowFcl } from "./flowFclConfig.js"
import { executeEncryptedDeposit } from "./sepoliaExecutor.js"
import { postReputationReceipt } from "./reputationPoster.js"
import { notifyFlowDepositCompleted } from "./flowExecutionBridge.js"

export type DepositTriggeredEvent = {
  userEVMAddress: string
  amount: string        // UFix64 as string e.g. "10.00000000"
  timestamp: string
}

let listenerStarted = false

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

  // Event type: A.<ADDRESS>.AgentScheduler.DepositTriggered
  const eventType = `A.${schedulerAddr.replace("0x", "")}.AgentScheduler.DepositTriggered`

  console.log(`[Flow] Listening for events: ${eventType}`)

  fcl.events(eventType).subscribe(async (event: { data: Record<string, unknown>; type: string }) => {
    const raw = event.data as unknown as DepositTriggeredEvent
    const { userEVMAddress, amount, timestamp } = raw
    const amountUSDC = parseFloat(amount)

    console.log(
      `\n[NapFi][Flow] DepositTriggered — user: ${userEVMAddress} | amount: ${amountUSDC} USDC | ts: ${timestamp}`
    )
    console.log(
      "[NapFi] Pipeline: Flow event received → Sepolia EncryptedVault.deposit (Zama encrypt) → reputation…"
    )

    try {
      // 1. Encrypt amount and call EncryptedVault.deposit() on Sepolia
      const { sepoliaTxHash } = await executeEncryptedDeposit({
        userEVMAddress,
        amountUSDC,
      })

      console.log(`[NapFi][Flow→Sepolia] EncryptedVault deposit confirmed | tx: ${sepoliaTxHash}`)

      // 2. Post ERC-8004 receipt to ReputationRegistry
      await postReputationReceipt({
        userEVMAddress,
        amountUSDC,
        sepoliaTxHash,
        flowTimestamp: timestamp,
      })

      console.log(`[NapFi][Flow→Sepolia] Reputation receipt posted for agent.`)

      await notifyFlowDepositCompleted({
        userEVMAddress,
        amountUSDC,
        sepoliaTxHash,
        flowTimestamp: timestamp,
      })
    } catch (err) {
      console.error("[Flow] Error processing DepositTriggered event:", err)
    }
  })

  console.log("[Flow] Listener active.")
}
