# Server (napfi-api)

**Express** JSON API for NapFi: **ERC-8004** onboarding (IPFS + Sepolia txs), **in-memory** agent state, optional **Flow testnet** scheduling (**Cadence** txs + event listener), **Zama**-backed **Sepolia deposits** from the backend operator, **reputation** posts, and **pending deposit** handoff so the **frontend** wallet signs USDC.

- **Entry:** `src/index.ts`  
- **Port:** `PORT` or **3001**  
- **Module type:** ESM (`"type": "module"`)

---

## Requirements

- **Node.js** ≥ 20  
- Dependencies: **express**, **ethers**, **@onflow/fcl**, **@zama-fhe/relayer-sdk**, **cors**, **dotenv**, **@lighthouse-web3/sdk**, etc.

---

## Run

```bash
cd server
npm install
cp .env.example .env   # edit values
npm run dev            # tsx watch src/index.ts
```

Production-style: `npm run build` then `npm start` (runs `dist/index.js`).

---

## Environment (summary)

See **`server/.env.example`** for the full list. Critical groups:

| Group | Variables |
|-------|-----------|
| **HTTP** | `PORT`, `CORS_ORIGIN` (comma-separated; match the browser origin, e.g. `localhost` vs `127.0.0.1`) |
| **Sepolia** | `SEPOLIA_RPC_URL`, `BACKEND_PRIVATE_KEY`, optional `OPERATOR_PRIVATE_KEY`, optional **`VAULT_CONTRACT_ADDRESS`** (defaults to repo `contracts.json` → `encryptedVault`) |
| **IPFS** | `LIGHTHOUSE_API_KEY` and/or `PINATA_JWT` — required for first-time **`POST /api/setup`** |
| **Flow** | `FLOW_ACCESS_NODE`, `FLOW_ACCOUNT_ADDRESS`, `FLOW_PRIVATE_KEY`, `FLOW_KEY_INDEX`, **`AGENT_SCHEDULER_ADDRESS`** (deployed **`AgentScheduler`** on Flow testnet) |
| **Demo** | `NAPFI_DEMO_ENDPOINTS` (default on), `DEMO_DEFAULT_GOAL_USDC` |
| **Queue** | `NAPFI_DEPOSIT_QUEUE_SOURCE` (`time` \| `chain`), `NAPFI_SCHEDULE_TIME_POLL_MS`, `NAPFI_CRON_SECRET` |
| **Reputation** | `AGENT_ID` — ERC-8004 agent id used in **`giveFeedback`** (see `reputationPoster.ts`) |

Shared contract addresses are read from repo root **`contracts.json`** via `src/lib/contracts.ts`.

---

## HTTP API (implemented in `src/index.ts`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service info + endpoint index |
| `GET` | `/health` | Liveness + `onchainReady`, `depositQueueSource` |
| `POST` | `/api/setup` | Create or update agent: IPFS + IdentityRegistry + setAgentWallet + AgentRegistry; optional Flow schedule |
| `GET` | `/api/agent/:userAddress` | Agent record from memory or chain-only fallback |
| `GET` | `/api/receipts/:agentId` | In-memory automation receipts |
| `GET` | `/api/flow-deposit-pending/:userAddress` | Pending deposit for wallet to sign |
| `POST` | `/api/flow-deposit-complete` | Finalize after Sepolia tx |
| `POST` | `/api/demo/schedule-one-minute` | Demo: schedule Flow in 60s |
| `POST` | `/api/demo/execute-deposit` | Demo: backend deposit without Flow |
| `POST` | `/api/cron/enqueue-schedule-deposits` | Bearer `NAPFI_CRON_SECRET`; only for `depositQueueSource=time` |

---

## Library modules (`src/lib/`)

| File | Role |
|------|------|
| **`onchainSetup.ts`** | `runNapFiOnchainSetup`: pin agent JSON → `register` → EIP-712 **`setAgentWallet`** → **`registerUserAgent`** |
| **`registryLookup.ts`** | Read **`AgentRegistry`** for hydration |
| **`sepoliaExecutor.ts`** | Operator **`EncryptedVault.deposit`** via relayer SDK + ciphertext |
| **`reputationPoster.ts`** | Pin receipt JSON → **`ReputationRegistry.giveFeedback`** |
| **`flowScheduler.ts`** | FCL: sign **`initHandler`** / **`scheduleDeposit`** Cadence (see `../cadence/`) |
| **`flowListener.ts`** | Subscribe to **`DepositTriggered`** → enqueue pending deposit |
| **`flowPendingDeposits.ts`** | In-memory queue keyed by user |
| **`flowExecutionBridge.ts`** | Callbacks after deposit completion (receipts, reschedule) |
| **`depositQueueSource.ts`** | `time` vs `chain` |
| **`scheduleTimeDepositQueue.ts`** | Timer-based enqueue when `nextExecutionISO` passes |
| **`ipfsPin.ts`** | Lighthouse / Pinata upload |
| **`flowFclConfig.ts`** | FCL access node + address |

---

## Scripts

| Script | Command |
|--------|---------|
| Dev | `npm run dev` |
| Build | `npm run build` |
| Start | `npm start` |
| Cron helper | `npm run trigger-due-deposits` (see `scripts/`) |

---

## Related folders

- **`../cadence/README.md`** — Flow contracts and transactions used by **`flowScheduler`** / **`flowListener`**  
- **`../frontend/README.md`** — Dashboard and API client  
