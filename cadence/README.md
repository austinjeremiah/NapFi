# Cadence (Flow)

This folder holds **Flow Cadence** sources for **NapFi automation** on **Flow testnet**. The on-chain piece implements a **`FlowTransactionScheduler.TransactionHandler`** that fires on a schedule and emits **`DepositTriggered`**. The **Node.js server** (`server/`) subscribes to that event via **FCL** and coordinates the user’s **Sepolia** USDC deposit (see `server/src/lib/flowListener.ts` and `server/src/lib/flowScheduler.ts`).

---

## Layout

| Path | Purpose |
|------|---------|
| `contracts/AgentScheduler.cdc` | Contract defining the `Handler` resource and `DepositTriggered` event |
| `transactions/initHandler.cdc` | One-time: save `Handler` to storage, publish capabilities for the scheduler |
| `transactions/scheduleDeposit.cdc` | Schedule the handler to run at `now + delaySeconds` (pays FLOW fees, uses `FlowTransactionSchedulerUtils.Manager`) |
| `scripts/getScheduledJobs.cdc` | Read scheduled job IDs from an account’s public manager capability |

---

## `AgentScheduler` contract

- **Imports:** `FlowTransactionScheduler` (handler interface used by the network scheduler).
- **`DepositTriggered`** — fields: `userEVMAddress` (Sepolia `0x…` string), `amount` (UFix64 USDC target), `timestamp`, `executionId` (scheduler job id).
- **`Handler` resource** — stores `userEVMAddress` and `depositAmount`; **`executeTransaction`** emits `DepositTriggered` (demo path). Comments in the contract describe a future **Flow Actions** pipeline (VaultSource / Swapper / VaultSink) before the event.
- **Factory:** `createHandler(userEVMAddress, depositAmount)` returns a new handler resource.
- **Storage paths:** `/storage/NapFiAgentSchedulerHandler`, `/public/NapFiAgentSchedulerHandler`.

The contract must be **deployed to Flow testnet**; the server uses **`AGENT_SCHEDULER_ADDRESS`** in `.env` when sending transactions.

---

## Transactions

### `initHandler.cdc`

**Arguments:** `userEVMAddress: String`, `depositAmount: UFix64`

- Runs in the **signer’s** account `prepare`.
- If no handler exists at `AgentScheduler.HandlerStoragePath`, creates one, saves it, issues an **entitled** storage capability (`auth(FlowTransactionScheduler.Execute)`), and publishes a **public** capability for scripts.

**Prerequisite:** Deployed `AgentScheduler` and correct import addresses on testnet.

### `scheduleDeposit.cdc`

**Arguments:** `delaySeconds: UFix64`, `executionEffort: UInt64`

- Ensures `FlowTransactionSchedulerUtils.Manager` exists in storage (creates if missing).
- Computes scheduler **fee** via `FlowTransactionScheduler.calculateFee`, withdraws **FLOW** from `/storage/flowTokenVault`.
- Resolves the **handler capability** from the account’s capability controllers.
- Calls **`manager.schedule(...)`** with the future timestamp, priority, effort, and fee vault.

**Prerequisite:** `initHandler` already run for this account; Flow account funded with FLOW for fees.

---

## Scripts

### `getScheduledJobs.cdc`

**Argument:** `account: Address`

- Borrows the public `FlowTransactionSchedulerUtils.Manager` and returns **`[UInt64]`** job IDs (or empty if no manager).

---

## Relation to the NapFi server

- **`flowScheduler.ts`** loads Cadence from disk (paths next to `server/`), sends **`initHandler`** then **`scheduleDeposit`** after `POST /api/setup` when Flow env is configured.
- **`flowListener.ts`** watches for **`DepositTriggered`** and enqueues work for the dashboard / Sepolia path.
- Env vars: `FLOW_ACCESS_NODE`, `FLOW_ACCOUNT_ADDRESS`, `FLOW_PRIVATE_KEY`, `FLOW_KEY_INDEX`, **`AGENT_SCHEDULER_ADDRESS`**.

---

## References

- [Flow Transaction Scheduler](https://developers.flow.com/build/tools/flow-transaction-scheduler) (concept; contract addresses differ by network)
- [Cadence language reference](https://cadence-lang.org/docs)
