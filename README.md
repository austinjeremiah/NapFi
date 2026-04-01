<div align="center">

<pre>
 /$$   /$$                      /$$$$$$  /$$
| $$$ | $$                     /$$__  $$|__/
| $$$$| $$  /$$$$$$   /$$$$$$ | $$  \__/ /$$
| $$ $$ $$ |____  $$ /$$__  $$| $$$$    | $$
| $$  $$$$  /$$$$$$$| $$  \ $$| $$_/    | $$
| $$\  $$$ /$$__  $$| $$  | $$| $$      | $$
| $$ \  $$|  $$$$$$$| $$$$$$$/| $$      | $$
|__/  \__/ \_______/| $$____/ |__/      |__/
                    | $$                    
                    | $$                    
                    |__/                    
</pre>

</div>

#  Napfi - Trusted Savings App with ERC-8004

NapFi is a **confidential DeFi savings agent** on **Ethereum Sepolia**. Users sign in with Google or email (no wallet or seed phrase required), set a savings goal, and an on-chain ERC-8004 agent automatically deposits USDC into a **Zama fhEVM** encrypted vault — with **Uniswap v3 liquidity provision**. Scheduling is handled via **Flow Actions(Cadence) testnet** or a time-based server scheduler. Every automated execution posts a verifiable reputation receipt on-chain.

---

## The Problem We Solve

| Problem | Solution |
|---------|----------|
| All DeFi balances are public — anyone can see your deposits and copy your strategy | Zama fhEVM: all balances stored as FHE-encrypted `euint64` on-chain; only the user can decrypt |
| No way to verify an AI agent actually executed what it promised | ERC-8004: agent minted as ERC-721 NFT with on-chain identity; every deposit posts a reputation receipt to `ReputationRegistry` |
| DeFi automation requires wallets, gas knowledge, and manual signing | Web3Auth: social login creates a wallet via MPC — user never sees a seed phrase; Flow Scheduler fires deposits automatically |

---

## System Architecture

```
USER (Google / email login)
        |
        v
   WEB3AUTH (MPC wallet — no seed phrase)
        |
   +----|------------------------------------+
   |                                         |
   v                                         v
FLOW TESTNET (Chain ID: 545)         ETHEREUM SEPOLIA (Chain ID: 11155111)
AgentScheduler.cdc                   EncryptedVault.sol  (Zama fhEVM)
FlowTransactionScheduler             NapFiUniswapVault.sol (Uniswap v3 + FHE)
Scheduled execution trigger          AgentRegistry.sol
Emits DepositTriggered event         ERC-8004 IdentityRegistry
        |                            ERC-8004 ReputationRegistry
        v
   EXPRESS SERVER (Node.js, port 3001)
   - Listens for DepositTriggered events (or time-based scheduler)
   - Encrypts USDC amount via @zama-fhe/relayer-sdk
   - Calls EncryptedVault.deposit() / NapFiUniswapVault.depositUSDC()
   - Pins execution log to IPFS
   - Posts reputation receipt to ERC-8004 ReputationRegistry
        |
        v
   NEXT.JS FRONTEND (port 3000)
   - Dashboard: balance, goal, deposit/withdraw, countdown
   - Receipts: history of automated executions + Etherscan links
   - Settings: update goal, frequency, yield toggle
   - FHE decryption: user decrypts only their own balance via Zama SDK
```

---

## Repository Layout

```
NapFi/
├── frontend/        Next.js app — dashboard, onboarding, receipts, settings
├── server/          Express API — agent lifecycle, Flow listener, Sepolia executor
├── onchain/         Hardhat — EncryptedVault, NapFiUniswapVault, AgentRegistry
├── cadence/         Flow testnet — AgentScheduler contract, scheduling transactions
└── contracts.json   Shared Sepolia + Flow testnet addresses
```

---

## Contract Addresses

### Ethereum Sepolia (Chain ID: 11155111)

#### ERC-8004 Agent Identity & Reputation

| Contract | Address |
|----------|---------|
| ERC-8004 Identity Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ERC-8004 Reputation Registry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| NapFi AgentRegistry | `0x7ca0388C3A895278D2f1F0161919Ab7D189f062F` |

#### Zama fhEVM Vaults

| Contract | Address | Notes |
|----------|---------|-------|
| EncryptedVault | `0x939F26Cd46B4A039C512EBE949F8C10D6545227e` | Pure FHE encrypted USDC balance vault |
| NapFiUniswapVault | `0x00708ec2B50d785d6717Ef8192bF89b62aB28348` | Uniswap v3 LP + FHE encrypted balances |
| NapFiUsdcVault (alt) | `0x1BED91De1ae0D03ba088E34FbA2412102CA5Ab8a` | Alternate deployment |

#### Tokens

| Token | Address |
|-------|---------|
| USDC (Circle testnet) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| WETH9 | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |

#### Uniswap v3 (Sepolia)

| Contract | Address |
|----------|---------|
| Factory | `0x0227628f3F023bb0B980b67D528571c95c6DaC1c` |
| NonfungiblePositionManager | `0x1238536071E1c677A632429e3655c799b22cDA52` |
| SwapRouter02 | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` |
| QuoterV2 | `0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

### Flow Testnet

| Contract | Address |
|----------|---------|
| FlowTransactionScheduler | `0x8c5303eaa26202d6` |
| AgentScheduler (NapFi) | `0xc4d59c93cd6c2c43` |
| FungibleToken | `0x9a0766d93b6608b7` |
| FlowToken | `0x7e60df042a9c0868` |

---

## Smart Contracts

### EncryptedVault.sol
Confidential USDC savings vault on Zama fhEVM.

- Stores balances as encrypted `euint64` using Fully Homomorphic Encryption
- `deposit(externalEuint64, proof, user)` — adds to encrypted balance with `FHE.add()`
- `withdraw(externalEuint64, proof)` — encrypted comparison `FHE.le()` prevents overdrafts without revealing balance; subtracts with `FHE.select()`
- `makeBalanceDecryptable()` — grants user ACL permission to decrypt their own balance
- Agent operator can verify but not read raw balances

### NapFiUniswapVault.sol
Confidential Uniswap v3 LP vault — single-sided USDC deposit with FHE balance tracking.

- User deposits USDC; vault swaps half to WETH via `SwapRouter.exactInputSingle()`, then adds both to the Uniswap v3 USDC/WETH 0.3% pool via `NonfungiblePositionManager`
- **Two-layer accounting:**
  - Plaintext: `totalShares` and `sharesOf` for Uniswap LP math (required by periphery)
  - Encrypted: `mapping(address => euint64) encryptedBalances` — mirrors EncryptedVault pattern
- User earns LP fees; position is aggregated in the vault
- `initializePosition(usdcAmount, wethAmount)` — owner seeds initial liquidity

### AgentRegistry.sol
On-chain lookup table: user EOA → ERC-8004 agent ID + vault address.

- `registerUserAgent(user, agentId, vault)` — called by server after ERC-8004 minting
- `lookup(user)` → returns `(agentId, vaultAddress, isRegistered, registeredAt)`
- `batchLookup(users[])` — multi-user fetch

---

## ERC-8004 Agent Registration

On first setup, the server (`server/src/lib/onchainSetup.ts`) automatically:

1. Builds a registration JSON per the EIP-8004 spec (includes goal, frequency, yieldEnabled)
2. Pins it to IPFS via Lighthouse or Pinata
3. Calls `IdentityRegistry.register(ipfsUri)` → mints agent NFT, reads `agentId` from `Registered` event
4. Signs EIP-712 `AgentWalletSet` message, calls `setAgentWallet(agentId, operator, deadline, sig)`
5. Calls `AgentRegistry.registerUserAgent(user, agentId, vault)`

After every successful vault deposit, a reputation receipt is posted (`server/src/lib/reputationPoster.ts`):
- Builds execution log JSON (user, amount, tx hash, timestamp)
- Pins to IPFS
- Calls `ReputationRegistry.giveFeedback(agentId, tags, vaultAddress, ipfsUri)`

---

## Flow (Cadence) Automation

**cadence/contracts/AgentScheduler.cdc** — Implements `FlowTransactionScheduler.TransactionHandler`. When fired by the scheduler, emits a `DepositTriggered` event with the user's Sepolia address and deposit amount.

**cadence/transactions/initHandler.cdc** — Saves the `AgentScheduler.Handler` resource to a user's Flow account storage once, enabling the scheduler to call it.

**cadence/transactions/scheduleDeposit.cdc** — Creates a scheduled job on `FlowTransactionScheduler` at the user's chosen interval (daily = 86400s, weekly = 604800s, monthly = 2592000s). Withdraws the scheduling fee from the user's FLOW balance.

**cadence/scripts/getScheduledJobs.cdc** — Returns all scheduled job IDs for an account.

The server's Flow listener (`server/src/lib/flowListener.ts`) polls for `DepositTriggered` events and enqueues a pending deposit. The frontend polls `/api/flow-deposit-pending/:userAddress`, signs the USDC transfer with the embedded Web3Auth wallet, and reports the Sepolia tx hash back to `/api/flow-deposit-complete`.

---

## HTTP API

Base URL: `http://localhost:3001` (set `NEXT_PUBLIC_API_BASE_URL` in frontend env).

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Service info, on-chain readiness, deposit queue source |
| `GET` | `/health` | `{ ok, onchainReady, depositQueueSource }` |

### Agent Lifecycle

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/setup` | Body: `userAddress, goalAmountUSDC, frequency, yieldEnabled`. First-time: IPFS + ERC-8004 + vault register + optional Flow schedule. Existing: update goal only. |
| `GET` | `/api/agent/:userAddress` | Returns agent state (goal, frequency, next execution, receipts). Falls back to on-chain lookup. **404** if none. |

### Receipts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/receipts/:agentId` | Returns array of automation execution receipts |

### Flow ↔ Dashboard Deposit Queue

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/flow-deposit-pending/:userAddress` | Returns `{ pending: null \| { id, amountUSDC, flowTimestamp, vaultAddress } }` |
| `POST` | `/api/flow-deposit-complete` | Body: `id, userAddress, sepoliaTxHash`. Completes deposit, updates receipts, reschedules. |

### Demo Endpoints

Enabled by default (`NAPFI_DEMO_ENDPOINTS=true`).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/demo/schedule-one-minute` | Body: `{ userAddress }`. Schedules next Flow deposit in 60 seconds. |
| `POST` | `/api/demo/execute-deposit` | Body: `{ userAddress }`. Runs encrypted Sepolia deposit directly without Flow (for non-Flow demos). |

### Cron (optional)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/cron/enqueue-schedule-deposits` | `Authorization: Bearer <NAPFI_CRON_SECRET>`. Manually triggers time-based deposit enqueue. Only valid when `NAPFI_DEPOSIT_QUEUE_SOURCE=time`. |

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — hero, feature overview |
| `/onboarding` | 3-step setup: USDC goal → frequency → yield toggle → agent creation |
| `/dashboard` | Main app: wallet + vault balance, deposit/withdraw, countdown to next execution, Flow deposit signing |
| `/receipts` | Automation history: date, amount, Sepolia tx hash (Etherscan links), total saved |
| `/settings` | Update savings goal, frequency, yield toggle; vault address; logout |

---

## Running Locally

**1. Server**
```bash
cd server
npm install
cp .env.example .env   # fill in SEPOLIA_RPC_URL, BACKEND_PRIVATE_KEY, IPFS keys
npm run dev            # port 3001
```

**2. Frontend**
```bash
cd frontend
pnpm install
# create frontend/.env.local with:
# NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
pnpm dev               # port 3000
```

**3. Onchain (optional redeploy)**
```bash
cd onchain
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia
```

---

## Environment Variables

### Server (`server/.env`)

| Variable | Description |
|----------|-------------|
| `SEPOLIA_RPC_URL` | Ethereum Sepolia RPC (Alchemy / Infura) |
| `BACKEND_PRIVATE_KEY` | Operator wallet private key for on-chain txs |
| `LIGHTHOUSE_API_KEY` or `PINATA_JWT` | IPFS pinning |
| `VAULT_CONTRACT_ADDRESS` | Override default vault (uses `contracts.json` if unset) |
| `FLOW_ACCESS_NODE` | Flow testnet access node URL |
| `FLOW_ACCOUNT_ADDRESS` | Flow account that deployed AgentScheduler |
| `FLOW_PRIVATE_KEY` | Flow account private key |
| `AGENT_SCHEDULER_ADDRESS` | `0xc4d59c93cd6c2c43` |
| `NAPFI_DEPOSIT_QUEUE_SOURCE` | `flow` (event-driven) or `time` (interval-based) |
| `NAPFI_DEMO_ENDPOINTS` | `true` / `false` (default: `true`) |
| `NAPFI_CRON_SECRET` | Bearer token for cron endpoint |
| `AGENT_ID` | ERC-8004 agent ID for reputation posting |
| `CORS_ORIGIN` | Allowed frontend origin |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Server URL, e.g. `http://localhost:3001` |
| `NEXT_PUBLIC_USDC_VAULT_ADDRESS` | Override vault address (optional) |

---

## References

- [EIP-8004 — On-chain Agent Identity & Reputation](https://eips.ethereum.org/EIPS/eip-8004)
- [Zama fhEVM Documentation](https://docs.zama.ai/)
- [Uniswap v3 — Ethereum Sepolia Deployments](https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments)
- [Flow Transaction Scheduler](https://developers.flow.com/)
- [Web3Auth Docs](https://web3auth.io/docs/)

---

*All contracts are deployed on testnets only. Verify addresses on [Sepolia Etherscan](https://sepolia.etherscan.io/) before any production use.*
