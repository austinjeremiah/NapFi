# NapFi

NapFi is a **confidential DeFi savings demo** on **Ethereum Sepolia**: users onboard an **ERC-8004 agent**, schedule automation via **Flow (Cadence) testnet**, and move **USDC** into a **Zama fhEVM** vault that can pair with **Uniswap v3** liquidity. A small **Express API** coordinates IPFS registration, on-chain setup, optional Flow scheduling, a **pending-deposit queue** (wallet-signed USDC), and **reputation receipts** on the ERC-8004 reputation registry.

This document summarizes **what the stack does**, **HTTP API routes**, **Sepolia contract addresses**, **ERC-8004 agent registration**, and **Uniswap v3 + vault mechanics**.

---

## Repository layout

| Area | Role |
|------|------|
| `frontend/` | Next.js app (dashboard, Web3Auth, USDC deposit/withdraw, FHE balance decrypt) |
| `server/` | Express JSON API (`napfi-api`), Flow listener, Sepolia executor, IPFS pinning |
| `onchain/` | Hardhat: `EncryptedVault`, `NapFiUniswapVault`, `AgentRegistry`, Uniswap constants |
| `cadence/` | Flow testnet: `AgentScheduler`, `initHandler`, `scheduleDeposit`, scripts |
| `contracts.json` | Shared Sepolia addresses for ERC-8004 registries and default vault |

Each of **`cadence/`**, **`frontend/`**, **`onchain/`**, and **`server/`** has its own **`README.md`** with folder-specific detail.

---

## Sepolia contract addresses

Values below match the repo’s `contracts.json` and `frontend/lib/contract-defs.ts` unless you override with env vars.

### ERC-8004 (agent identity & reputation)

| Contract | Address | Notes |
|----------|---------|--------|
| **ERC-8004 Identity Registry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Mints agent NFT; `register(agentURI)` |
| **ERC-8004 Reputation Registry** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | `giveFeedback` after successful deposits (see [Reputation](#reputation-after-deposit)) |
| **NapFi AgentRegistry** | `0x7ca0388C3A895278D2f1F0161919Ab7D189f062F` | Maps user EOA → `agentId` + vault via `lookup` / `registerUserAgent` |

### Zama fhEVM vaults

| Contract | Address | Notes |
|----------|---------|--------|
| **EncryptedVault** (reference / default in `contracts.json`) | `0x939F26Cd46B4A039C512EBE949F8C10D6545227e` | Classic encrypted USDC balance vault (backend executor ABI targets this artifact unless overridden) |
| **NapFiUniswapVault** (USDC + Uniswap v3 LP UI) | `0x00708ec2B50d785d6717Ef8192bF89b62aB28348` | Default `VAULT_ADDRESS` / `NAPFI_UNISWAP_VAULT_ADDRESS` in `contract-defs.ts`; override with `NEXT_PUBLIC_USDC_VAULT_ADDRESS` |

### Other deployments

| Artifact | Address | Notes |
|----------|---------|--------|
| **NapFiUsdcVault** (alternate deployment) | `0x1BED91De1ae0D03ba088E34FbA2412102CA5Ab8a` | See `onchain/deployments/sepolia/NapFiUsdcVault.json` |
| **Sepolia USDC (Circle test token)** | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | Used by the Uniswap vault and dashboard |

**Chain ID:** `11155111` (Ethereum Sepolia).

---

## ERC-8004 agent: what is implemented

[EIP-8004](https://eips.ethereum.org/EIPS/eip-8004) describes **trustless agents** with on-chain identity and optional reputation. NapFi’s **first-time setup** (`POST /api/setup` when the user is not already registered) does the following (see `server/src/lib/onchainSetup.ts`):

1. **Build registration JSON** — includes `type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"`, app metadata, NapFi-specific fields (`goalAmountUSDC`, `frequency`, `yieldEnabled`, etc.).
2. **Pin to IPFS** — Lighthouse or Pinata (`server/src/lib/ipfsPin.ts`).
3. **`IdentityRegistry.register(ipfsUri)`** — backend wallet sends the tx; an **`agentId`** (NFT token id) is read from the `Registered` event.
4. **`setAgentWallet`** — operator signs **EIP-712** (`AgentWalletSet`); backend submits `setAgentWallet(agentId, operator, deadline, signature)` so the **operator** matches `EncryptedVault.agentOperator` for automated deposits.
5. **`AgentRegistry.registerUserAgent(user, agentId, vault)`** — links the **user’s EOA** to that **`agentId`** and **vault address**.

The **frontend** reads the user’s agent via **`AgentRegistry.lookup`** (see `frontend/lib/contract-defs.ts` ABIs) and displays **ERC-8004 ID**, vault link, and automation state.

### Reputation after deposit

After a successful vault deposit, the server can post a **reputation receipt** (`server/src/lib/reputationPoster.ts`):

- Build a small execution log JSON (user, amount, Sepolia tx hash, Flow timestamp).
- Pin to IPFS.
- **`ReputationRegistry.giveFeedback(agentId, …)`** with tags, `endpoint` set to the vault address, and IPFS URI.

**Env:** requires `SEPOLIA_RPC_URL`, `BACKEND_PRIVATE_KEY`, and **`AGENT_ID`** (see `server/.env.example`). In multi-user demos, note that a single global `AGENT_ID` does not map 1:1 to every user’s minted agent unless you extend the server to pass per-user `agentId` from the in-memory record.

---

## Uniswap v3: technical overview (NapFiUniswapVault)

`onchain/contracts/uniswap/NapFiUniswapVault.sol` implements a **confidential LP vault** on fhEVM:

### Protocol integration

- **Tokens:** USDC (`SEPOLIA_USDC_CIRCLE`) and **WETH9** on Sepolia.
- **NonfungiblePositionManager (NPM):** mints the ERC-721 **position NFT**, `increaseLiquidity` / `decreaseLiquidity` / `collect` — the vault holds the position and aggregates user capital.
- **SwapRouter (`exactInputSingle`):** converts part of user USDC to WETH before adding liquidity, so deposits can be **single-sided USDC** from the user’s perspective.
- **Constants** are centralized in `UniswapV3SepoliaConstants.sol` (factory, NPM, SwapRouter02, QuoterV2, Universal Router, Permit2, WETH) — aligned with [Uniswap’s Sepolia deployment table](https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments).

### Two layers of accounting

1. **Plaintext** — `totalShares` and `sharesOf` for Uniswap LP math (amounts in/out of the pool must be computed in clear text on-chain for the periphery contracts).
2. **Encrypted (FHE)** — `mapping(address => euint64) encryptedBalances` mirrors `EncryptedVault.sol`: user **share balances** are **euint64** handles; `FHE.add` / `FHE.sub` on deposit/withdraw; `makeBalanceDecryptable` / user decrypt in the UI.

So: **Uniswap v3** provides **AMM liquidity and fee economics**; **Zama fhEVM** provides **private balance handles** for user positions in that vault.

### Fee tiers

The constants library documents standard v3 fees: `100` (0.01%), `500`, `3000` (0.3%), `10000` (1%). The vault uses the pool/NPM configuration chosen at deployment (USDC/WETH **0.3%** is typical for test demos).

---

## HTTP API (`server/src/index.ts`)

Base URL is usually `http://localhost:3001`. The frontend expects **`NEXT_PUBLIC_API_BASE_URL`** (see `frontend/lib/api.ts`). CORS is controlled by **`CORS_ORIGIN`** in `server/.env`.

### Discovery & health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service name, link to Next.js app, lists main endpoints, `onchain` readiness, `depositQueueSource` |
| `GET` | `/health` | `{ ok, onchainReady, depositQueueSource }` |

### Agent lifecycle

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/setup` | Body: `userAddress`, `goalAmountUSDC`, `frequency` (`daily` \| `weekly` \| `monthly`), `yieldEnabled`. First-time: IPFS + ERC-8004 register + `setAgentWallet` + `registerUserAgent`; optional Flow `scheduleFlowDeposit`. If user already has `agentId` in RAM: updates goal only. If already on-chain but not in RAM: hydrates from chain. **503** if first-time on-chain deps missing. |
| `GET` | `/api/agent/:userAddress` | Returns stored agent (goal, `nextExecutionISO`, `flowSchedule`, `automationReceipts`, …). If not in memory, tries **on-chain `AgentRegistry.lookup`**. **404** if no agent. |

### Automation receipts (in-memory)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/receipts/:agentId` | Returns `{ receipts }` from API RAM for that `agentId` (automation runs after deposits). |

### Flow ↔ dashboard (pending USDC deposit)

When Flow (or the time-based scheduler) decides a deposit should run, the server exposes a **pending queue**; the **dashboard** signs `USDC.transfer` / vault deposit with the user’s wallet, then notifies the API.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/flow-deposit-pending/:userAddress` | Returns `{ pending: null \| { id, amountUSDC, flowTimestamp, vaultAddress } }`. `vaultAddress` uses `VAULT_CONTRACT_ADDRESS` or default from `contracts.json`. |
| `POST` | `/api/flow-deposit-complete` | Body: `id`, `userAddress`, `sepoliaTxHash`. Completes the head of the queue, triggers `notifyFlowDepositCompleted` (updates receipts, reschedules `nextExecutionISO`, optional Flow reschedule). |

### Demo endpoints

Guarded by **`NAPFI_DEMO_ENDPOINTS`** (default on; set to `false` to disable).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/demo/schedule-one-minute` | Body: `{ userAddress }`. Schedules next Flow run in **60s** and aligns `nextExecutionISO`. Requires Flow env; **503** if Flow not configured. |
| `POST` | `/api/demo/execute-deposit` | Body: `{ userAddress }`. Runs **backend** `executeEncryptedDeposit` + reputation **without** Flow (for environments without Flow). Requires on-chain + IPFS env. |

### Cron (optional)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/cron/enqueue-schedule-deposits` | Header: `Authorization: Bearer <NAPFI_CRON_SECRET>`. Runs the same enqueue pass as the schedule-time watcher. Only valid when **`NAPFI_DEPOSIT_QUEUE_SOURCE=time`**. |

### Deposit queue source

- **`time` (default):** when wall-clock passes `nextExecutionISO`, the server can enqueue a pending deposit (poll interval `NAPFI_SCHEDULE_TIME_POLL_MS`).
- **`chain`:** enqueue only when Flow emits **DepositTriggered** (see logs in `server/src/lib/flowListener.ts`).

---

## Backend execution path (Sepolia)

`server/src/lib/sepoliaExecutor.ts` uses **@zama-fhe/relayer-sdk** to build real ciphertexts and calls the vault’s **`deposit`** as **`agentOperator`**. The vault address used is **`VAULT_CONTRACT_ADDRESS`** or `contracts.json` → `encryptedVault`. For production NapFi USDC + Uniswap UI, set **`VAULT_CONTRACT_ADDRESS`** to the deployed **`NapFiUniswapVault`** so executor and UI agree.

---

## Environment variables

See **`server/.env.example`** for:

- Sepolia RPC, backend key, optional operator key  
- IPFS (Lighthouse / Pinata)  
- Optional **`VAULT_CONTRACT_ADDRESS`**  
- Flow testnet (`FLOW_ACCESS_NODE`, `FLOW_ACCOUNT_ADDRESS`, `FLOW_PRIVATE_KEY`, `AGENT_SCHEDULER_ADDRESS`)  
- Demo flags, deposit queue source, cron secret, **`AGENT_ID`**

Frontend: **`NEXT_PUBLIC_API_BASE_URL`**, optional **`NEXT_PUBLIC_USDC_VAULT_ADDRESS`** for vault override.

---

## Running locally

1. **API:** `cd server && npm install && npm run dev` (port **3001** by default).  
2. **Frontend:** `cd frontend && npm install && npm run dev` (typically **3000**).  
3. Point **`NEXT_PUBLIC_API_BASE_URL=http://localhost:3001`** in `frontend/.env.local`.

---

## References

- [EIP-8004 Agent Specification](https://eips.ethereum.org/EIPS/eip-8004)  
- [Uniswap v3 deployments — Ethereum Sepolia](https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments)  
- [Zama fhEVM](https://docs.zama.ai/) — FHE contracts and relayer SDK  

---

*This README reflects the repository layout and contracts as checked in. Always verify addresses on [Sepolia Etherscan](https://sepolia.etherscan.io/) before mainnet or production use.*
