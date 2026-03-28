# NapFi — Full Technical Specification

**Project:** Confidential DeFi savings agent
**Team size:** 3 people
**All development:** Testnet only
**Tracks:** Flow (Consumer DeFi) + Zama (Confidential Finance) + ERC-8004 (Agents with Receipts)

---

## Table of Contents

1. What We Are Building
2. The Problem We Solve
3. Full System Architecture
4. Complete Step-by-Step User Flow
5. Smart Contracts — Person 1
6. Off-Chain Agent and Cadence Automation — Person 2
7. Frontend — Person 3
8. How All Three Parts Connect
9. Docs Reference Per Integration
10. Team Split Summary
11. Build Order Day by Day

---

## 1. What We Are Building

NapFi is a DeFi savings automation app where:

- A user signs in with Google or email — no wallet, no seed phrase required
- They set a savings goal in plain English — for example "save 10 USDC every week"
- An on-chain AI agent, registered with a verifiable identity, automatically executes that goal on a schedule
- The agent deposits go into an encrypted vault where the balance is hidden from everyone — no one can see how much is inside, not even the app developers
- After every execution the agent writes a receipt on-chain proving it did what it was supposed to do

The user never touches gas, never signs a transaction manually, never sees a blockchain. They just see a savings dashboard.

---

## 2. The Problem We Solve

**Problem 1 — Everything on DeFi is public**

When you deposit into any DeFi protocol today, your balance, your deposit amount, and your strategy are visible to anyone on a block explorer. This lets people frontrun your trades, copy your strategy, or target you based on holdings. Zama fhEVM solves this — all values stay encrypted on-chain using Fully Homomorphic Encryption.

**Problem 2 — You cannot verify if an agent did what it promised**

If you give an AI agent control over your money, there is currently no standard way to verify on-chain that it executed correctly or that it has a trustworthy history. ERC-8004 solves this — every agent gets an on-chain identity (minted as an ERC-721 NFT) and every execution gets a reputation receipt posted to the ReputationRegistry.

**Problem 3 — DeFi automation still requires wallets and gas knowledge**

Even the simplest DeFi action requires a wallet setup, gas management, and transaction signing. Flow solves this — walletless onboarding via social login, sponsored gas so users pay nothing, and native scheduled transactions that fire automatically without the user doing anything.

**Why removing any one piece breaks the product:**

- Without Zama: balances are visible, strategies can be frontrun, privacy claim is false
- Without ERC-8004: no on-chain proof the agent is trustworthy or actually executed
- Without Flow: user still needs a wallet, still pays gas, automation is not native

---

## 3. Full System Architecture

```
USER
  |
  | (Google / email login — no wallet required)
  v
WEB3AUTH
  - Creates one private key using MPC key generation
  - Works on both Flow EVM Testnet and Ethereum Sepolia simultaneously
  - User never sees a private key or seed phrase
  |
  +------------------------------+
  |                              |
  v                              v
FLOW EVM TESTNET             ETHEREUM SEPOLIA
Chain ID: 545                Chain ID: 11155111
  |                              |
  Flow Actions:                  EncryptedVault contract (Zama fhEVM)
  Source > Swapper > Sink        ERC-8004 IdentityRegistry
  Scheduled Transactions         ERC-8004 ReputationRegistry
  Gasless via Flow Wallet        ERC-7984 confidential token balances
  |                              |
  +------------------------------+
                |
  OFF-CHAIN AGENT (Node.js)
  - Listens to Flow scheduled tx trigger events
  - Encrypts deposit amount using fhEVM relayer SDK
  - Calls EncryptedVault.deposit() on Sepolia with encrypted amount
  - Uploads execution log to IPFS
  - Posts reputation receipt to ERC-8004 ReputationRegistry
                |
  FRONTEND (React + wagmi + Web3Auth)
  - Shows user their savings goal status
  - Decrypts and shows only the user their balance
  - Shows agent on-chain receipt history
  - All gasless, all walletless
```

---

## 4. Complete Step-by-Step User Flow

### Step 1 — User lands on the app

The user opens the app and sees a clean landing page. No wallet connection button. Just a "Get Started" button and three plain-language benefit statements.

### Step 2 — Social login

User clicks Get Started. Web3Auth modal opens. User logs in with Google or email. Behind the scenes, Web3Auth creates a wallet using MPC key generation distributed across Web3Auth nodes. The user never sees a private key or seed phrase. The same wallet works on both Flow EVM Testnet (Chain ID 545) and Ethereum Sepolia (Chain ID 11155111).

### Step 3 — First time setup

After login, the frontend calls the backend to check if the user already has a vault registered in `AgentRegistry.sol`. If not, the user is shown the onboarding screen where they set:

- How much to save per execution (in USDC)
- How often (daily, weekly, monthly)
- Whether to auto-swap to a yield-bearing token first

This information is stored in the backend database against their wallet address. No on-chain transaction happens at this step.

### Step 4 — Agent registration (automated, user does not see this)

When the user clicks "Create My Agent", the backend agent automatically:

1. Builds an Agent Registration File in JSON format per the ERC-8004 specification
2. Uploads this JSON to IPFS using Pinata — gets back an IPFS URI
3. Calls `IdentityRegistry.register(ipfsURI)` on Sepolia at address `0x8004A818BFB912233c491871b3d84c89A494BD9e`
4. This mints an ERC-721 NFT — the returned `agentId` is the agent's permanent on-chain identity
5. Calls `setAgentWallet(agentId, operatorWallet, deadline, eip712Signature)` to cryptographically link the agent's operator wallet to its identity

The user sees a single message: "Your personal agent is ready."

### Step 5 — Scheduled transaction is created on Flow

The backend creates a Cadence scheduled transaction on Flow using the `FlowTransactionScheduler` contract at testnet address `0x8c5303eaa26202d6`. This transaction will fire automatically at the user's chosen interval. The scheduling fee is paid by the app — the user pays nothing.

When it fires, the scheduled transaction runs the Flow Actions pipeline:

1. A `Source` connector pulls the user's USDC from their Flow wallet using `withdrawAvailable(maxAmount)`
2. A `Swapper` connector optionally converts it to a better yield token using `swap(quote, inVault)`
3. A `Sink` connector routes the result to the bridge relay endpoint using `depositCapacity(from)`
4. An event is emitted that the off-chain agent is listening for

### Step 6 — Scheduled transaction fires automatically

On the user's chosen interval, `FlowTransactionScheduler` executes the Cadence transaction without any user action. The user does not get a notification. The agent handles everything from this point.

### Step 7 — Off-chain agent executes encrypted deposit on Sepolia

When the agent backend receives the Flow event:

1. It reads the plaintext deposit amount from the event data
2. It uses `@zama-fhe/relayer-sdk` to create an fhEVM instance pointing at Sepolia
3. It calls `createEncryptedInput(vaultAddress, userAddress)` and passes the USDC amount as a uint64
4. It calls `.encrypt()` which produces an `externalEuint64` ciphertext handle and an `inputProof`
5. It sends a transaction to Sepolia calling `EncryptedVault.deposit(encryptedHandle, inputProof)` using the agent's operator wallet
6. The vault contract unpacks the input using `FHE.fromExternal()`, adds it to the user's encrypted balance using `FHE.add()`, and calls `FHE.allowThis()` and `FHE.allow(userAddress)` so only the user can later decrypt their balance

The deposit is complete. The balance is stored as a `euint64` ciphertext on Sepolia. Nobody can read it except the authorized user.

### Step 8 — Agent posts receipt on-chain

After the Sepolia deposit confirms:

1. Agent builds an execution log JSON containing: timestamp, userAddress, depositAmountUSDC, sepoliaTxHash, flowTxHash, status
2. Uploads this JSON to IPFS — gets back a CID
3. Computes `keccak256` hash of the log content
4. Calls `ReputationRegistry.giveFeedback()` on Sepolia at `0x8004B663056A597Dffe9eCcC1965A193B7388713` with the agentId, a positive score value, tag "deposit_executed", the IPFS URI, and the content hash

This receipt is now permanently on-chain. Anyone can verify the agent executed by checking its reputation history. The IPFS log provides the full proof of execution.

### Step 9 — User checks their dashboard

When the user opens the app:

1. The frontend fetches the encrypted balance handle from `vault.balanceOf(userAddress)` — this returns a ciphertext handle, not a readable number
2. The user signs a gasless message to call `FHE.makePubliclyDecryptable()` — this is the only on-chain interaction they ever perform, and it only needs to happen once per session
3. The relayer SDK is called client-side: `instance.publicDecrypt([handleHex])` — this returns the cleartext BigInt only because the user's address is in the ACL (access control list)
4. The dashboard shows: "Your balance: $47.20 USDC" with a lock icon confirming it is privately stored
5. The receipts section shows the history of all agent executions fetched from ERC-8004 ReputationRegistry

---

## 5. Smart Contracts — Person 1

### What Person 1 Owns

- `EncryptedVault.sol` — the privacy layer on Sepolia using Zama fhEVM
- `AgentRegistry.sol` — a lookup contract mapping users to agents and vaults
- Hardhat project setup, deployment scripts, and tests
- Deploying both contracts to Sepolia and sharing addresses with the team

### EncryptedVault.sol — Design

This contract stores every user's balance as a `euint64` — a 64-bit unsigned integer in ciphertext form. Nobody can read it without the ACL permission.

**What it needs to handle:**

Deposits — Accept an `externalEuint64` handle and `inputProof` from the caller. Call `FHE.fromExternal()` to unpack the encrypted amount. Add it to the user's existing encrypted balance using `FHE.add()`. After updating the balance in storage, always call `FHE.allowThis()` so the contract can read the ciphertext in future transactions, and `FHE.allow(msg.sender)` so the user can decrypt. Also call `FHE.allow(agentOperatorAddress)` so the agent can read balances.

Withdrawals — Accept an encrypted amount the user wants to withdraw. Use `FHE.le()` to compare whether the withdrawal amount is less than or equal to the balance — this comparison stays encrypted and returns an `ebool`. Use `FHE.select(enoughFunds, requestedAmount, FHE.asEuint64(0))` to safely return zero if funds are insufficient, without ever revealing the actual balance. Subtract the result from the balance.

Balance reads — The `balanceOf()` function returns the raw `euint64` ciphertext handle, not a readable number. The frontend uses this handle with the relayer SDK to decrypt client-side.

**Critical fhEVM v0.9 rules Person 1 must follow:**

Use `FHE.*` prefix everywhere — the old `TFHE.*` prefix is deprecated in v0.9. Import from `@fhevm/solidity/lib/FHE.sol` and `@fhevm/solidity/config/ZamaConfig.sol`. Inherit from `ZamaEthereumConfig` so the contract knows the deployed addresses of the ACL, KMS Verifier, and FHE Executor on Sepolia.

Every time a `euint64` is written to storage, call `FHE.allowThis()` immediately. If you forget this, the contract will not be able to read the value in subsequent transactions and the vault will be broken.

There is no encrypted division. `FHE.div()` only accepts plaintext divisors. Design all math using only addition, subtraction, multiplication, and comparisons.

Solidity version must be 0.8.28 and Hardhat config must set `evmVersion: "cancun"` — fhEVM uses EIP-1153 transient storage which requires the Cancun EVM version.

### AgentRegistry.sol — Design

A simple state contract that stores:

- Mapping from user address to their agentId (ERC-8004 token ID)
- Mapping from user address to their vault address
- A function `registerUserAgent(address user, uint256 agentId, address vault)` that the backend calls once during setup
- A function `lookup(address user)` that returns both the agentId and vault address

This is a convenience contract for the frontend to discover vault addresses without hard-coding them.

### Hardhat Project Setup

Clone the template from `github.com/zama-ai/fhevm-hardhat-template`. This template already includes the correct Hardhat plugin, test helpers for mocked FHE mode, and deployment scripts.

Folder structure after setup:

```
contracts/
  EncryptedVault.sol
  AgentRegistry.sol
deploy/
  001_deploy_vault.ts
  002_deploy_registry.ts
test/
  EncryptedVault.test.ts
hardhat.config.ts
.env
```

The `.env` file needs `ALCHEMY_API_KEY` for Sepolia RPC and `MNEMONIC` for the deployer wallet.

Testing strategy: during development, use mocked FHE mode which runs in seconds and does not need real encryption. The template has three modes — mock, local Hardhat node, and Sepolia. Use mock for unit tests, Sepolia for final integration testing before submission.

### Sepolia Addresses Person 1 Will Use

| Contract | Address |
|---|---|
| ACL | 0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D |
| KMS Verifier | 0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A |
| Input Verifier | 0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0 |
| Decryption Gateway | 0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478 |
| FHE Executor | 0x92C920834Ec8941d2C77D188936E1f7A6f49c127 |
| ERC-8004 IdentityRegistry | 0x8004A818BFB912233c491871b3d84c89A494BD9e |
| ERC-8004 ReputationRegistry | 0x8004B663056A597Dffe9eCcC1965A193B7388713 |

### Primary Docs for Person 1

- Getting started: docs.zama.org/protocol/solidity-guides/getting-started/overview
- v0.9 migration guide (read this first): docs.zama.org/protocol/solidity-guides/development-guide/migration
- Encrypted inputs: docs.zama.org/protocol/solidity-guides/smart-contract/inputs
- ACL patterns: docs.zama.org/protocol/solidity-guides/v0.8/smart-contract/acl/acl_examples
- Decryption model: docs.zama.org/protocol/solidity-guides/smart-contract/oracle
- Hardhat template: github.com/zama-ai/fhevm-hardhat-template
- ERC-8004 contracts: github.com/erc-8004/erc-8004-contracts
- ERC-8004 EIP full spec: eips.ethereum.org/EIPS/eip-8004

---

## 6. Off-Chain Agent and Cadence Automation — Person 2

### What Person 2 Owns

- Cadence contracts and transactions on Flow (the autopilot layer)
- Node.js off-chain agent that bridges Flow events to Sepolia executions
- ERC-8004 agent registration and reputation posting
- Express API server that the frontend calls

### Part A — Cadence on Flow

Person 2 works in Cadence for the automation logic. Cadence runs on the native Flow VM — it is completely separate from Flow EVM. Web3Auth handles the EVM side. Person 2 handles the Cadence side.

Install Flow CLI: `brew install flow-cli` on macOS. Initialize project: `flow init privy-agent-cadence`.

Folder structure:

```
cadence/
  contracts/
    AgentScheduler.cdc
  transactions/
    scheduleDeposit.cdc
    executeDeposit.cdc
  scripts/
    getScheduledJobs.cdc
flow.json
```

**AgentScheduler.cdc**

This Cadence contract implements the `TransactionHandler` resource interface defined by `FlowTransactionScheduler` at testnet address `0x8c5303eaa26202d6`.

The `executeTransaction(id, data)` function is what runs automatically when the scheduled time arrives. Inside this function:

Step 1 — Use a `VaultSource` connector from `FungibleTokenConnectors` to withdraw the user's USDC from their Flow account. Call `withdrawAvailable(maxAmount: UFix64)` which returns a `FungibleToken.Vault` resource.

Step 2 — Optionally use a `Swapper` connector (use `IncrementFiSwapConnectors.Swapper` if available on testnet, otherwise skip and treat USDC as-is). The swapper's `swap(quote, inVault)` converts the input vault to a different token vault.

Step 3 — Use a `VaultSink` connector to send funds to the bridge relay account or emit an event. The event must contain the user address and the deposit amount in USDC as a number so the off-chain agent can read it.

Step 4 — Emit a `DepositTriggered(userAddress: Address, amount: UFix64, timestamp: UFix64)` event.

**Scheduling the transaction**

When a user sets up their goal, the backend (Node.js) sends a Cadence transaction that calls `FlowTransactionScheduler.schedule()` with the handler resource, the next execution timestamp, a small FLOW fee from the app's fee wallet, and priority level Medium (5x base rate).

Use `github.com/onflow/scheduledtransactions-scaffold` as the starting point — it already has the boilerplate for registering handlers and scheduling.

Test locally with: `flow emulator --scheduled-transactions --block-time 1s`

**Flow Actions scaffold**

Use `github.com/onflow/flow-actions-scaffold` for the Source, Sink, and Swapper connector implementations. These are already written and just need to be imported and composed.

### Part B — Off-Chain Agent (Node.js)

The agent is a Node.js TypeScript process. It runs as a long-lived server process.

**File structure:**

```
agent/
  src/
    index.ts               (startup, registers agent identity on first run)
    flowListener.ts        (subscribes to Flow events)
    sepoliaExecutor.ts     (encrypts and deposits on Sepolia)
    reputationPoster.ts    (posts ERC-8004 receipt after execution)
    agentRegistration.ts   (one-time ERC-8004 setup)
    ipfsUploader.ts        (uploads logs to IPFS via Pinata)
    api.ts                 (Express server for frontend)
  package.json
  tsconfig.json
  .env
```

**agentRegistration.ts — runs once on first startup**

1. Build the Agent Registration File JSON:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "PrivyAgent-DeFiSaver",
  "description": "Confidential DeFi savings agent that executes encrypted deposits on schedule",
  "image": "https://yourapp.com/agent-logo.png",
  "services": [
    {
      "name": "web",
      "endpoint": "https://yourapp.com/agent"
    }
  ],
  "active": true,
  "supportedTrust": ["reputation"]
}
```

2. Upload this JSON to IPFS using `@pinata/sdk` — store the returned IPFS URI
3. Use ethers.js to call `IdentityRegistry.register(ipfsURI)` on Sepolia using the agent's operator private key
4. Read the returned `agentId` from the transaction receipt event logs
5. Build an EIP-712 typed data signature over `{ agentId, newWallet, deadline }` using the operator private key
6. Call `IdentityRegistry.setAgentWallet(agentId, operatorWallet, deadline, signature)` to link the wallet to the identity
7. Save `agentId` to a local config file — it is needed for all future reputation calls

**flowListener.ts — runs continuously**

Use `@onflow/fcl` to subscribe to Flow events on testnet. Configure FCL with:

```
accessNode.api: "https://rest-testnet.onflow.org"
```

Subscribe to the `AgentScheduler.DepositTriggered` event type. When an event arrives, extract `userAddress` and `amount` from the event data. Pass both to `sepoliaExecutor.ts`.

**sepoliaExecutor.ts — called for each Flow event**

1. Import `createInstance` from `@zama-fhe/relayer-sdk`
2. Initialize the fhEVM instance pointed at Sepolia using the SepoliaConfig
3. Call `instance.createEncryptedInput(vaultContractAddress, userAddress)`
4. Call `.add64(amount)` on the input builder to add the deposit amount
5. Call `.encrypt()` — returns an object with `handles[0]` (the `externalEuint64`) and `inputProof`
6. Use ethers.js with the agent's operator wallet to call `vault.deposit(handles[0], inputProof)` on Sepolia
7. Wait for transaction confirmation
8. Return the Sepolia transaction hash to the caller

**reputationPoster.ts — called after successful deposit**

1. Build an execution log object: `{ timestamp, userAddress, amountUSDC, sepoliaTxHash, flowEventId, status: "success" }`
2. Upload it to IPFS using Pinata — get back the CID
3. Compute `keccak256(JSON.stringify(logObject))` using ethers.js `keccak256` and `toUtf8Bytes`
4. Call `ReputationRegistry.giveFeedback()` on Sepolia with:
   - `agentId`: the stored agent identity token ID
   - `value`: 100 (positive score)
   - `valueDecimals`: 0
   - `tag1`: "deposit_executed"
   - `tag2`: "success"
   - `endpoint`: the vault contract address
   - `feedbackURI`: "ipfs://CID"
   - `feedbackHash`: the keccak256 hash computed above

**api.ts — Express server for frontend**

Three endpoints:

`POST /api/setup` — body contains `{ userAddress, goalAmount, frequency }`. This creates the scheduled transaction on Flow and registers the user's vault in `AgentRegistry.sol`. Returns `{ agentId, nextExecutionTime }`.

`GET /api/agent/:userAddress` — returns `{ agentId, vaultAddress, nextExecutionTime, totalExecutions, status }`. Reads from the local database and from AgentRegistry on Sepolia.

`GET /api/receipts/:agentId` — queries `ReputationRegistry.readAllFeedback(agentId)` on Sepolia and returns the list of all execution receipts. Each item includes the feedbackURI and feedbackHash for the frontend to fetch and display the IPFS log.

### Primary Docs for Person 2

- Flow Actions intro: developers.flow.com/blockchain-development-tutorials/forte/flow-actions/intro-to-flow-actions
- Flow Actions connectors: developers.flow.com/blockchain-development-tutorials/forte/flow-actions/connectors
- Scheduled transactions: developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions
- Scheduled tx scaffold: github.com/onflow/scheduledtransactions-scaffold
- Flow Actions scaffold: github.com/onflow/flow-actions-scaffold
- Gasless on Flow: developers.flow.com/blockchain-development-tutorials/gasless-transactions/sponsored-transactions-evm-endpoint
- FCL docs: docs.onflow.org/fcl
- Zama relayer SDK: docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/initialization
- ERC-8004 EIP: eips.ethereum.org/EIPS/eip-8004
- ERC-8004 contracts repo: github.com/erc-8004/erc-8004-contracts
- nuwa ERC-8004 reference: github.com/nuwa-protocol/nuwa-8004

---

## 7. Frontend — Person 3

### What Person 3 Owns

- All 5 React pages
- Web3Auth integration (social login, chain switching)
- Balance decryption display
- Receipt history from ERC-8004
- API calls to Person 2's backend
- Overall design and user experience

### Tech Stack

- React with TypeScript
- Vite as the build tool
- Web3Auth Modal v10 for walletless login
- wagmi v2 for contract reads and writes
- @tanstack/react-query for data fetching and caching
- ethers.js v6 for Sepolia contract interaction
- @zama-fhe/relayer-sdk for client-side balance decryption
- @onflow/fcl for reading Flow chain state
- Tailwind CSS for styling

Install all at once:

```
npm install @web3auth/modal wagmi @tanstack/react-query ethers @zama-fhe/relayer-sdk @onflow/fcl tailwindcss
```

### Web3Auth Dashboard Setup (do this first)

Go to dashboard.web3auth.io. Create a new project. Select Sapphire Devnet. Enable Google login and Email Passwordless. Under Networks, add both Ethereum Sepolia (Chain ID 11155111) and Flow EVM Testnet (Chain ID 545). Copy the clientId — this goes into the app's environment variable `VITE_WEB3AUTH_CLIENT_ID`.

The main App wrapper needs `Web3AuthProvider` wrapping `WagmiProvider` wrapping `QueryClientProvider`. Chain configs for both networks are set either in the dashboard or as code-side override objects. See the tech reference document for exact config shapes.

### Page 1 — Landing Page

URL: `/`

Purpose: First impression. Explains what the app does without any blockchain terminology.

Layout from top to bottom:

App name and tagline — large, centered. Tagline: "Your money saves itself. Privately."

Three feature blocks in a row (or stacked on mobile):
- Block 1: Shield icon — "Your balance is hidden from everyone, including us. Not even we can see your savings."
- Block 2: Clock icon — "Set it once. Your agent saves for you automatically, every week."
- Block 3: Checkmark icon — "Every action is permanently recorded on-chain. Verifiable by anyone."

Single CTA button below: "Get Started" — navigates to /onboarding.

Design tone: Clean, minimal, dark or light fintech aesthetic. Think Revolut or Cash App. No crypto logos, no wallet imagery, no chain names.

### Page 2 — Onboarding

URL: `/onboarding`

This page has two states — Login and Goal Setup.

**State 1 — Login**

Centered card with:
- "Create your account" heading
- "Sign in with Google" button (calls Web3Auth login)
- "Sign in with Email" button (calls Web3Auth email passwordless)
- Small note: "No wallet needed. Your account is created automatically."

After login, check with the backend `GET /api/agent/:userAddress` whether the user already has a vault. If yes, redirect to /dashboard. If no, show State 2.

**State 2 — Goal Setup**

A step-by-step form, one question per screen or all on one screen:

Step 1 — Amount: "How much do you want to save each time?" — number input with USDC label. Show a note: "This will be deposited into your private vault."

Step 2 — Frequency: "How often?" — three large buttons: Daily / Weekly / Monthly. Selected state highlighted.

Step 3 — Yield toggle: "Automatically find the best rate for your savings?" — toggle switch, Yes by default.

Submit button: "Create My Agent"

On submit: call `POST /api/setup` with the form data. Show a loading state with a simple animation: "Setting up your private vault... Registering your agent on-chain..." Wait for the API response. On success, redirect to /dashboard.

### Page 3 — Dashboard

URL: `/dashboard`

This is the main page the user spends time on. Four sections.

**Section 1 — Balance card (top, most prominent)**

A large card showing the user's current balance. When the page loads:

1. Fetch encrypted handle from `vault.balanceOf(userAddress)` using wagmi `useReadContract`
2. If the user has not yet made the handle publicly decryptable in this session, prompt a one-time gasless signature. Show: "Tap to reveal your balance — only you can see this."
3. Call `@zama-fhe/relayer-sdk` to decrypt client-side using `instance.publicDecrypt([handle])`
4. Display: "Your balance: $47.20" in large text
5. Lock icon with tooltip: "This number is stored encrypted on-chain. Nobody else can see it."
6. A small "How?" link that expands to explain FHE in one plain-language sentence

While loading: show a blurred placeholder with "Decrypting your balance..."

**Section 2 — Agent status card**

Shows:
- Agent name: "Your PrivyAgent"
- Agent ID: the ERC-8004 token ID (shown as a short identifier)
- Status indicator: green dot with "Active" or yellow dot with "Paused"
- Next execution: "Next deposit in 3 days"
- Reputation: "X successful executions"

**Section 3 — Goal summary**

Shows the user's configured goal:
- "Saving 10 USDC every week"
- "Total saved: $120.40" (decrypted from vault, same flow as balance card)
- "Running since: March 15, 2026"
- A simple progress bar if the user has set a target amount

**Section 4 — Recent receipts**

A condensed list showing the last 5 agent executions:
- Each row: date, "Deposit 10 USDC", green checkmark, "View proof" link
- "View proof" opens the IPFS execution log in a new tab
- "See all" link navigates to /receipts

### Page 4 — Receipt History

URL: `/receipts`

Full audit trail of every agent execution.

**Header section:**
- "Your agent's history" title
- Summary row: "X total deposits | $Y total saved | Trust score: Z/100"
- The trust score is derived from the on-chain reputation data — average of all feedback values

**Table:**

Columns: Date | Action | Amount | Status | Sepolia TX | Log

Each row maps to one `giveFeedback()` call in the ReputationRegistry. Data is fetched by calling `ReputationRegistry.readAllFeedback(agentId)` using wagmi `useReadContract`. For each entry, the `feedbackURI` is an IPFS link to the full log — fetch it lazily when the user clicks "View Log".

Sorted newest first. Show 20 per page with a "Load more" button.

**Empty state:** "No executions yet. Your first deposit will run on [next scheduled date]."

**How receipt data is fetched:**

Option A (simpler for demo): Call `GET /api/receipts/:agentId` on Person 2's backend which returns already-fetched and formatted data.

Option B (more decentralized): Call the ReputationRegistry contract directly from the frontend using wagmi.

Use Option A for the hackathon to avoid rate limiting on Sepolia RPC calls.

### Page 5 — Settings

URL: `/settings`

**Goal section:**
- Edit amount per execution
- Edit frequency
- Toggle yield optimization
- Save changes button — calls `POST /api/setup` with updated params (this reschedules the Flow transaction)

**Vault section:**
- "Withdraw my savings" button — shows a confirmation modal, then calls `vault.withdraw()` with the full balance amount (user must encrypt the withdrawal amount client-side using relayer SDK before sending)
- Shows the vault contract address on Sepolia as a short address with Etherscan link

**Account section:**
- Shows the user's wallet address (shortened to first 6 + last 4 chars) with a copy button
- "Sign out" button — calls Web3Auth logout, clears session, redirects to landing page

### Frontend Data Flow Summary

Reading balance:
1. `vault.balanceOf(userAddress)` returns `euint64` ciphertext handle
2. Call `vault.makePubliclyDecryptable(handle)` once per session (gasless Sepolia signature)
3. `instance.publicDecrypt([handleHex])` from relayer SDK returns BigInt cleartext
4. Display as USDC amount

Reading receipts:
1. Call `GET /api/receipts/:agentId` from Person 2's API
2. Each item has feedbackURI pointing to IPFS
3. Fetch IPFS JSON for full log details on demand

Chain switching:
- Default: Flow EVM Testnet (Chain ID 545) — gasless
- Switch to Sepolia for vault reads, vault writes, ERC-8004 reads
- Use `useSwitchChain()` from `@web3auth/modal/react` before Sepolia calls
- Switch back to Flow EVM after the call

### Primary Docs for Person 3

- Web3Auth React SDK: web3auth.io/docs/sdk/web/react
- Web3Auth dashboard: dashboard.web3auth.io
- Social login setup: web3auth.io/docs/auth-provider-setup/social-providers/google
- Multi-chain: web3auth.io/docs/connect-blockchain/multi-chain
- useSwitchChain: web3auth.io/docs/sdk/web/react/hooks/useSwitchChain
- Aggregate verifier (same wallet for Google + email): web3auth.io/docs/auth-provider-setup/aggregate-verifier
- Zama relayer SDK (frontend decryption): docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/initialization
- wagmi docs: wagmi.sh
- Flow EVM network info: developers.flow.com/build/evm/networks
- FCL: docs.onflow.org/fcl

---

## 8. How All Three Parts Connect

### Shared contract addresses

Person 1 deploys `EncryptedVault.sol` and `AgentRegistry.sol` to Sepolia. The deployed addresses go into a shared `contracts.json` file committed to the repo root. Both Person 2 and Person 3 read from this file to know which addresses to call.

ERC-8004 contracts are already deployed — no deployment needed by anyone. Use the fixed addresses: IdentityRegistry at `0x8004A818BFB912233c491871b3d84c89A494BD9e` and ReputationRegistry at `0x8004B663056A597Dffe9eCcC1965A193B7388713`.

### Backend API contract between Person 2 and Person 3

Person 2 runs an Express server. Person 3 calls it from the React frontend. The three endpoints:

`POST /api/setup`
- Request body: `{ userAddress: string, goalAmountUSDC: number, frequency: "daily" | "weekly" | "monthly" }`
- Response: `{ agentId: number, vaultAddress: string, nextExecutionISO: string }`
- What it does: registers agent on ERC-8004, registers vault in AgentRegistry, creates Flow scheduled transaction

`GET /api/agent/:userAddress`
- Response: `{ agentId: number, vaultAddress: string, nextExecutionISO: string, totalExecutions: number, status: "active" | "paused" }`
- What it does: reads from local database and from AgentRegistry contract

`GET /api/receipts/:agentId`
- Response: `{ receipts: Array<{ timestamp, amountUSDC, sepoliaTxHash, flowEventId, ipfsURI, status }> }`
- What it does: calls ReputationRegistry.readAllFeedback() and formats the results

### Shared environment variables

All three people share one `.env.example` in the repo root:

```
# Person 1 — fill in after deploying
VAULT_CONTRACT_ADDRESS=
AGENT_REGISTRY_ADDRESS=

# Person 2 — agent operator wallet
AGENT_PRIVATE_KEY=
ALCHEMY_API_KEY=
PINATA_API_KEY=
PINATA_SECRET_KEY=
FLOW_PRIVATE_KEY=
FLOW_ACCOUNT_ADDRESS=
PORT=3001

# Person 3 — frontend
VITE_WEB3AUTH_CLIENT_ID=
VITE_API_BASE_URL=http://localhost:3001
VITE_VAULT_ADDRESS=  (same as VAULT_CONTRACT_ADDRESS)
```

### Repo folder structure

```
privy-agent/
  contracts/           (Person 1)
    contracts/
    deploy/
    test/
    hardhat.config.ts
    package.json
  cadence/             (Person 2 — Cadence side)
    contracts/
    transactions/
    scripts/
    flow.json
  agent/               (Person 2 — Node.js side)
    src/
      index.ts
      flowListener.ts
      sepoliaExecutor.ts
      reputationPoster.ts
      agentRegistration.ts
      ipfsUploader.ts
      api.ts
    package.json
  frontend/            (Person 3)
    src/
      pages/
        Landing.tsx
        Onboarding.tsx
        Dashboard.tsx
        Receipts.tsx
        Settings.tsx
      components/
        BalanceCard.tsx
        AgentStatus.tsx
        ReceiptTable.tsx
        GoalSummary.tsx
      hooks/
        useEncryptedBalance.ts
        useAgentReceipts.ts
        useChainSwitch.ts
      lib/
        web3auth.ts
        zamaRelayer.ts
        contracts.ts
        api.ts
    package.json
  contracts.json        (shared — filled in by Person 1 after deploy)
  .env.example
  README.md
```

---

## 9. Docs Reference Per Integration

### Zama fhEVM

| Topic | URL |
|---|---|
| Getting started overview | docs.zama.org/protocol/solidity-guides/getting-started/overview |
| v0.9 migration — read first | docs.zama.org/protocol/solidity-guides/development-guide/migration |
| Encrypted inputs | docs.zama.org/protocol/solidity-guides/smart-contract/inputs |
| ACL allow patterns | docs.zama.org/protocol/solidity-guides/v0.8/smart-contract/acl/acl_examples |
| Decryption model | docs.zama.org/protocol/solidity-guides/smart-contract/oracle |
| Relayer SDK | docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/initialization |
| Hardhat template | github.com/zama-ai/fhevm-hardhat-template |
| fhEVM Solidity library | github.com/zama-ai/fhevm-solidity |
| ERC-7984 example | docs.zama.org/protocol/examples/openzeppelin-confidential-contracts/erc7984 |
| OpenZeppelin confidential tokens | docs.openzeppelin.com/confidential-contracts/api/token |

### Flow Blockchain

| Topic | URL |
|---|---|
| EVM quickstart | developers.flow.com/build/evm/quickstart |
| EVM network info | developers.flow.com/build/evm/networks |
| Flow Actions intro | developers.flow.com/blockchain-development-tutorials/forte/flow-actions/intro-to-flow-actions |
| Flow Actions connectors | developers.flow.com/blockchain-development-tutorials/forte/flow-actions/connectors |
| Scheduled transactions | developers.flow.com/build/cadence/advanced-concepts/scheduled-transactions |
| Scheduled tx scaffold | github.com/onflow/scheduledtransactions-scaffold |
| Flow Actions scaffold | github.com/onflow/flow-actions-scaffold |
| Gasless sponsored EVM | developers.flow.com/blockchain-development-tutorials/gasless-transactions/sponsored-transactions-evm-endpoint |
| Walletless PWA guide | developers.flow.com/build/guides/mobile/walletless-pwa |
| Flow CLI | developers.flow.com/build/tools/flow-cli |
| Testnet faucet | developers.flow.com/ecosystem/faucets |
| FCL | docs.onflow.org/fcl |

### ERC-8004

| Topic | URL |
|---|---|
| EIP full specification | eips.ethereum.org/EIPS/eip-8004 |
| Official contracts repo | github.com/erc-8004/erc-8004-contracts |
| Awesome ERC-8004 list | github.com/sudeepb02/awesome-erc8004 |
| nuwa reference implementation | github.com/nuwa-protocol/nuwa-8004 |
| Integration guide on DEV.to | dev.to/hammertoe/making-services-discoverable-with-erc-8004-trustless-agent-registration-with-filecoin-pin-1al3 |

### Web3Auth

| Topic | URL |
|---|---|
| React SDK | web3auth.io/docs/sdk/web/react |
| Dashboard | dashboard.web3auth.io |
| Google social login | web3auth.io/docs/auth-provider-setup/social-providers/google |
| Multi-chain setup | web3auth.io/docs/connect-blockchain/multi-chain |
| useSwitchChain hook | web3auth.io/docs/sdk/web/react/hooks/useSwitchChain |
| Aggregate verifier | web3auth.io/docs/auth-provider-setup/aggregate-verifier |
| Ethereum integration | web3auth.io/docs/connect-blockchain/evm/ethereum/web |

---

## 10. Team Split Summary

### Person 1 — Smart Contracts

Owns everything in the `/contracts` folder. Solidity on Ethereum Sepolia.

Deliverables:
- EncryptedVault.sol deployed to Sepolia with verified deposit, withdraw, and balance functions
- AgentRegistry.sol deployed to Sepolia mapping users to agents and vaults
- Shared contracts.json with deployed addresses
- ABI files exported from Hardhat artifacts

Needs from others: nothing at start — fully independent from day 1

Gives to others: vault contract address, ABI, and AgentRegistry address

Primary tech: Solidity 0.8.28, Hardhat, @fhevm/solidity, @fhevm/hardhat-plugin

---

### Person 2 — Agent and Automation

Owns everything in `/cadence` and `/agent` folders. Cadence on Flow and Node.js backend.

Deliverables:
- AgentScheduler.cdc deployed on Flow testnet using Cadence
- Scheduled transaction registered for each user on Flow using FlowTransactionScheduler
- Node.js agent that listens for Flow events, encrypts amounts, deposits to Sepolia, posts ERC-8004 receipts
- Express API at PORT 3001 with three endpoints for the frontend

Needs from others: vault contract address and ABI from Person 1 (needed for sepoliaExecutor.ts)

Gives to others: API base URL and endpoint documentation

Primary tech: Cadence, Flow CLI, Node.js, TypeScript, @onflow/fcl, @zama-fhe/relayer-sdk, ethers.js, @pinata/sdk, Express

---

### Person 3 — Frontend

Owns everything in the `/frontend` folder. React app.

Deliverables:
- All 5 pages fully functional: Landing, Onboarding, Dashboard, Receipts, Settings
- Web3Auth social login working end to end
- Balance decryption display showing the user their encrypted vault balance
- Receipt history table populated from ERC-8004 on-chain data via Person 2's API
- Chain switching working transparently between Flow EVM and Sepolia

Needs from others:
- From Person 1: vault contract address and ABI
- From Person 2: API base URL

Primary tech: React, TypeScript, Vite, Web3Auth v10, wagmi v2, @zama-fhe/relayer-sdk, Tailwind CSS

---

## 11. Build Order Day by Day

### Day 1 — Setup and independent foundations

**Person 1:**
Clone the fhevm-hardhat-template. Set up Hardhat with cancun EVM version and Solidity 0.8.28. Write EncryptedVault.sol with deposit and withdraw logic. Run tests in mocked FHE mode — no Sepolia RPC needed. Get familiar with the FHE.allow() pattern before writing anything else.

**Person 2:**
Install Flow CLI and initialize the Cadence project. Set up the Node.js agent project with TypeScript config. Write AgentScheduler.cdc implementing the TransactionHandler interface. Test the scheduled transaction firing locally using `flow emulator --scheduled-transactions --block-time 1s`. Set up Pinata account and test IPFS upload.

**Person 3:**
Create React + Vite project. Set up Web3Auth dashboard — create project, enable Google login, add both chains. Wire up Web3AuthProvider and WagmiProvider in main.tsx. Build the Landing page and the Login state of the Onboarding page. Verify Google social login works and returns a wallet address.

### Day 2 — Core integrations

**Person 1:**
Write AgentRegistry.sol. Deploy both contracts to Sepolia. Commit contracts.json with deployed addresses. Export ABIs. Share with team via the repo.

**Person 2:**
Implement the Flow Actions pipeline in Cadence — Source and Sink at minimum. Implement flowListener.ts using FCL to subscribe to Flow testnet events. Implement sepoliaExecutor.ts — use Person 1's deployed vault address to test a manual encrypted deposit. Test the whole chain: emit a mock Flow event, watch sepoliaExecutor deposit to Sepolia.

**Person 3:**
Build the Goal Setup state of the Onboarding page with form validation. Build the Dashboard page layout with placeholder data. Implement useChainSwitch.ts hook. Call wagmi useReadContract to read the raw encrypted balance handle from the vault (display the hex — real decryption in Day 3).

### Day 3 — Connect everything end to end

**Person 1:**
Run final integration tests on Sepolia with real fhEVM (not mocked). Verify that `FHE.allow(agentOperatorAddress)` is correctly set so Person 2's agent can read encrypted values. Help Person 3 with ABI integration if there are issues.

**Person 2:**
Implement agentRegistration.ts — register the agent on ERC-8004 Identity registry once. Implement reputationPoster.ts — IPFS upload and giveFeedback call. Start the Express API server with all three endpoints. Run the complete end-to-end flow: simulate a user goal setup, watch the scheduled transaction fire on Flow emulator, watch the Sepolia deposit happen, watch the ERC-8004 receipt appear on-chain.

**Person 3:**
Implement real encrypted balance decryption using @zama-fhe/relayer-sdk in useEncryptedBalance.ts. Call POST /api/setup from the Onboarding form. Implement receipt history fetching from GET /api/receipts/:agentId. Build the Receipts page and Settings page.

### Day 4 — End-to-end demo and polish

**All three together:**
Run the full demo: log in with Google, go through onboarding, watch the scheduled transaction fire on Flow testnet, watch the deposit appear encrypted in the vault on Sepolia, watch the receipt appear in the ERC-8004 registry, see the decrypted balance on the dashboard. Fix any broken handoffs between parts. Write the README with setup instructions and a clear description of what each track does. Record the demo video. Submit.

---

## Key Technical Caveats

**Zama fhEVM v0.9 breaking changes**

Many tutorials and examples online still use the old v0.8 API which has `TFHE.*` prefix. The current v0.9 uses `FHE.*`. If any tutorial shows `TFHE.add()`, `TFHE.allow()`, or `TFHE.asEuint64()`, it is outdated. Check the migration guide at docs.zama.org/protocol/solidity-guides/development-guide/migration before starting any Solidity work.

**ERC-8004 Validation Registry is not deployed on Sepolia**

Only the Identity and Reputation registries are live. Do not attempt to use the Validation Registry — it does not exist yet on testnet. The project only needs Identity (for agent registration) and Reputation (for receipts) — both of which are confirmed deployed.

**Flow Actions FLIP 339 is still under review**

The interfaces are defined and the scaffold repo exists with working implementations. Use the scaffold as the starting implementation. Do not wait for a final published spec — it is not needed to build with it.

**Web3Auth v10 requires dashboard configuration first**

In v10, chains must be enabled in the dashboard at dashboard.web3auth.io before they are available in the app. Person 3 must do this setup before writing any chain-switching code. The code-side config objects are only needed for custom RPC overrides.

**No encrypted division in fhEVM**

`FHE.div()` only accepts plaintext divisors — you cannot divide one `euint64` by another `euint64`. Any interest rate or percentage logic must be restructured. For a hackathon, avoid this entirely and keep the vault as a simple add/subtract accumulator.

**Flow EVM and Flow Cadence are completely separate environments**

Flow EVM (Chain ID 545) runs Solidity exactly like any EVM chain. Flow Cadence is a completely different runtime using the Cadence language. Web3Auth and wagmi handle the EVM side. FCL and Flow CLI handle the Cadence side. Person 2 must work in both, and must not confuse EVM contract calls with Cadence transaction calls — they use different tools and different wallet connections.
