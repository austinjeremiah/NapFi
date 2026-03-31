# NapFi — architecture, flows, and how to run

This document describes how **Flow (Cadence)**, **Ethereum Sepolia**, **Zama fhEVM**, **Uniswap v3**, and the **Express API** fit together, with **flowcharts** you can render in GitHub or any Mermaid-capable viewer.

---

## 1. High-level system context

```mermaid
flowchart TB
  subgraph user["User"]
    U[Browser — Next.js dashboard]
  end

  subgraph flow["Flow testnet"]
    FTS[Flow Transaction Scheduler]
    AS[AgentScheduler.cdc — Handler]
    Evt[DepositTriggered event]
    FTS --> AS
    AS --> Evt
  end

  subgraph api["NapFi API — Express"]
    S[index.ts — routes]
    L[flowListener — polls events]
    T[scheduleTimeDepositQueue — time-based enqueue]
    Q[(pending deposit queue — RAM)]
    S --> Q
    L --> Q
    T --> Q
  end

  subgraph sepolia["Ethereum Sepolia"]
    V[NapFiUniswapVault / EncryptedVault]
    U3[Uniswap v3 NPM + pool]
    Z[Zama fhEVM — encrypted balances]
    R[ERC-8004 Identity + Reputation + AgentRegistry]
    V --> U3
    V --> Z
  end

  U <-->|HTTP JSON| S
  Evt -.->|HTTP Access API| L
  U <-->|wallet tx| V
  Q -->|poll + sign| U
```

**Roles in one sentence:** Flow **schedules** when something should happen; the API **queues** work and tracks goals; the user’s wallet (or operator) **signs** Sepolia transactions into a **Zama**-aware vault that may use **Uniswap v3** for liquidity; **ERC-8004** ties identity and reputation to the agent.

---

## 2. Onboarding and first schedule (no deposit yet)

After the user completes **`POST /api/setup`**, the backend may run **Cadence** transactions via FCL:

1. **`initHandler.cdc`** — save `AgentScheduler.Handler` under the Flow app account; publish capabilities.
2. **`scheduleDeposit.cdc`** — pay FLOW fees, schedule `executeTransaction` on the handler at `now + delay`.

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant API as Express API
  participant IPFS as IPFS — Lighthouse/Pinata
  participant ID as ERC-8004 IdentityRegistry
  participant AR as AgentRegistry
  participant FCL as Flow — FCL signer

  FE->>API: POST /api/setup — goal, frequency, userAddress
  API->>IPFS: pin agent registration JSON
  API->>ID: register(uri) — mint agentId
  API->>ID: setAgentWallet — EIP-712
  API->>AR: registerUserAgent(user, agentId, vault)
  opt Flow env configured
    API->>FCL: initHandler + scheduleDeposit
    FCL-->>API: initTxId, scheduleTxId, delaySeconds
  end
  API-->>FE: agentId, vaultAddress, nextExecutionISO, flowSchedule
```

---

## 3. Two ways a “deposit run” enters the queue

The server can enqueue a **pending USDC deposit** (same structure Flow would trigger) in two modes — see **`NAPFI_DEPOSIT_QUEUE_SOURCE`** in `server/.env.example`.

### 3a. Time-based queue (default: `time`)

When **`Date.now() >= nextExecutionISO`**, **`scheduleTimeDepositQueue.ts`** enqueues one pending item per due user (if none already pending). **No Flow event is required** for enqueueing in this mode.

```mermaid
flowchart LR
  A[User record in API RAM — nextExecutionISO] --> B{now ≥ due?}
  B -->|yes| C[enqueueFlowPendingDeposit]
  B -->|no| D[wait — poll every NAPFI_SCHEDULE_TIME_POLL_MS]
  C --> E[GET /api/flow-deposit-pending/:addr returns payload]
```

### 3b. Chain-based queue (`chain`)

**`flowListener.ts`** polls Flow Access API for **`AgentScheduler.DepositTriggered`**. When **`depositQueueSource` allows chain enqueue**, a matching event **enqueues** the same pending structure.

```mermaid
flowchart LR
  F[Flow block range poll] --> G[DepositTriggered — userEVMAddress, amount, timestamp]
  G --> H[enqueueFlowPendingDeposit]
  H --> E[GET /api/flow-deposit-pending/:addr]
```

**Note:** If mode is **`time`**, the listener may still **log** `DepositTriggered` but **does not** enqueue from chain (see comments in `flowListener.ts`).

---

## 4. Dashboard → Sepolia: pending deposit completion

The queue only holds **intent**. The **user wallet** approves/spends **USDC** and calls the vault — same path as a manual **Deposit** on the dashboard.

```mermaid
sequenceDiagram
  participant FE as Dashboard
  participant API as Express API
  participant USDC as USDC ERC-20
  participant V as NapFiUniswapVault

  loop Poll
    FE->>API: GET /api/flow-deposit-pending/:userAddress
    API-->>FE: pending — id, amountUSDC, vaultAddress
  end
  FE->>USDC: approve / transferFrom as required
  FE->>V: deposit — encrypted amount + proof — fhEVM
  FE->>API: POST /api/flow-deposit-complete — id, sepoliaTxHash
  API->>API: notifyFlowDepositCompleted — receipts, nextExecutionISO, optional Flow reschedule
```

---

## 5. Zama fhEVM in this stack

**What it does:** User **balances** in the vault are represented as **FHE ciphertext handles** (`euint64` style) on-chain. Outsiders see ciphertext, not cleartext balances.

**Contract surface (mirrors `EncryptedVault` patterns):** `balanceOf` / `getBalanceHandle`, `hasBalance`, `makeBalanceDecryptable`, `deposit` / `withdraw` with **external ciphertext + input proof** from the Zama relayer SDK.

**Where it runs:** **Ethereum Sepolia** with Zama’s **fhEVM** coprocessor configuration (see `@fhevm/solidity` / `ZamaEthereumConfig` in contracts).

```mermaid
flowchart TB
  subgraph client["Client — relayer SDK"]
    R[createInstance — SepoliaConfig]
    E[encrypt amount — input handle + proof]
    D[userDecrypt — after makeBalanceDecryptable]
  end

  subgraph chain["Sepolia — fhEVM"]
    V[Vault — FHE.add / FHE.sub on balances]
  end

  R --> E
  E -->|tx| V
  V --> D
```

**Dual accounting in `NapFiUniswapVault`:** Uniswap **NPM** needs **plaintext** token amounts for `mint` / `increaseLiquidity` / `collect`. The contract therefore keeps **plaintext shares** (`totalShares`, `sharesOf`) for LP math **and** **encrypted per-user balances** for the confidential UX aligned with Zama.

---

## 6. Uniswap v3 in `NapFiUniswapVault`

**Goal:** Aggregate user USDC, swap part to **WETH**, provide **USDC/WETH** liquidity in a **v3** pool, hold the **position NFT**, route swap fees / liquidity through the vault logic.

**On-chain dependencies (Sepolia constants — `UniswapV3SepoliaConstants.sol`):**

| Component | Role |
|-----------|------|
| **UniswapV3Factory** | `getPool(token0, token1, fee)` |
| **NonfungiblePositionManager** | `mint`, `increaseLiquidity`, `decreaseLiquidity`, `collect` — ERC-721 position |
| **SwapRouter02** | `exactInputSingle` — USDC → WETH for liquidity skew |
| **WETH9** | Wrapped ETH on Sepolia |
| **USDC** | Circle test USDC address |

**Typical fee tier:** **0.3% (3000)** for USDC/WETH test pools.

```mermaid
flowchart TB
  subgraph user["User action"]
    D[deposit USDC]
  end

  subgraph vault["NapFiUniswapVault"]
    S[swap portion to WETH via SwapRouter]
    M[mint / increase liquidity via NPM]
    FHE[update encrypted balance — euint64]
    P[plaintext shares — sharesOf / totalShares]
  end

  subgraph uni["Uniswap v3"]
    POOL[USDC/WETH pool]
    NFT[position NFT — vault is owner]
  end

  D --> S
  S --> M
  M --> POOL
  M --> NFT
  M --> FHE
  M --> P
```

---

## 7. Flow Cadence side (summary)

| Artifact | Purpose |
|----------|---------|
| **`AgentScheduler.cdc`** | `TransactionHandler` — on schedule, **`executeTransaction`** emits **`DepositTriggered(userEVMAddress, amount, timestamp, executionId)`**. |
| **`initHandler.cdc`** | Install handler resource + capabilities once per Flow account. |
| **`scheduleDeposit.cdc`** | Create scheduler manager if needed, pay FLOW fee, **`schedule`** next fire time. |
| **`getScheduledJobs.cdc`** | Read scheduled job ids from public manager capability. |

**Server wiring:** **`flowScheduler.ts`** submits Cadence; **`flowListener.ts`** polls events (HTTP range polling — avoids WS crash on TLS reset).

---

## 8. End-to-end “automation tick” (conceptual)

```mermaid
flowchart TD
  START([Schedule fires — Flow time OR API nextExecutionISO]) --> Q{Pending queue}
  Q -->|has job| FE[User opens dashboard — wallet connected]
  FE --> TX[Sign USDC + vault deposit on Sepolia]
  TX --> DONE[POST flow-deposit-complete]
  DONE --> REP{Reputation env?}
  REP -->|yes| IPFS[Pin receipt JSON]
  IPFS --> GF[giveFeedback — ERC-8004 Reputation]
  DONE --> NEXT[Update nextExecutionISO + optional Flow reschedule]
```

---

## 9. How to start the server and the app

### 9.1 Prerequisites

- **Node.js** ≥ 20  
- **Sepolia** RPC and funded wallet keys as in **`server/.env.example`**  
- Optional: **Flow** testnet account with FLOW; **IPFS** key (Lighthouse or Pinata)  
- Frontend: **`NEXT_PUBLIC_API_BASE_URL`** pointing at the API  

### 9.2 API (Express)

```bash
cd server
cp .env.example .env
# Edit .env — at minimum SEPOLIA_RPC_URL, BACKEND_PRIVATE_KEY, CORS_ORIGIN,
# and either LIGHTHOUSE_API_KEY or PINATA_JWT for first-time setup.
npm install
npm run dev
```

Default listen: **`http://localhost:3001`**. Check **`GET http://localhost:3001/health`**.

### 9.3 Frontend (Next.js)

```bash
cd frontend
# Create .env.local with NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
npm install
npm run dev
```

Open **`http://localhost:3000`** (or `127.0.0.1` — ensure CORS includes that origin).

### 9.4 Optional: Flow scheduling

Set **`FLOW_ACCESS_NODE`**, **`FLOW_ACCOUNT_ADDRESS`**, **`FLOW_PRIVATE_KEY`**, **`FLOW_KEY_INDEX`**, **`AGENT_SCHEDULER_ADDRESS`** to match your deployed **`AgentScheduler`** on Flow testnet (see **`flow.json`** / **`cadence/README.md`**).

---

## 10. Related files

| Topic | Location |
|-------|----------|
| API routes | `server/src/index.ts` |
| Flow poll listener | `server/src/lib/flowListener.ts` |
| Time-based enqueue | `server/src/lib/scheduleTimeDepositQueue.ts` |
| Cadence send | `server/src/lib/flowScheduler.ts` |
| Uniswap + FHE vault | `onchain/contracts/uniswap/NapFiUniswapVault.sol` |
| Sepolia Uniswap constants | `onchain/contracts/uniswap/UniswapV3SepoliaConstants.sol` |
| Flow contracts | `cadence/contracts/AgentScheduler.cdc` |
| Addresses | `contracts.json`, `frontend/lib/contract-defs.ts` |

---

*Diagrams use [Mermaid](https://mermaid.js.org/). If a renderer fails, paste the fenced blocks into [mermaid.live](https://mermaid.live).*
