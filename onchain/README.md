# Onchain (Hardhat + FHEVM)

**NapFi** smart contracts for **Ethereum Sepolia**, built on the **Zama FHEVM** Hardhat stack (`@fhevm/solidity`, `@fhevm/hardhat-plugin`). Contracts use **homomorphic types** (`euint64`) for encrypted balances where applicable.

---

## Prerequisites

- **Node.js** ≥ 20  
- **npm** ≥ 7  

---

## Install & compile

```bash
cd onchain
npm install
npm run compile
```

Artifacts land in **`artifacts/`**; Typechain types in **`types/`** when enabled.

---

## Main contracts (`contracts/`)

| Contract | Path | Purpose |
|----------|------|---------|
| **EncryptedVault** | `EncryptedVault.sol` | Reference fhEVM vault: encrypted per-user balances, `deposit` / `withdraw` with external ciphertext + proof, **`agentOperator`** |
| **AgentRegistry** | `AgentRegistry.sol` | Maps user → **`agentId`** + **vault** (`registerUserAgent`, `lookup`) for ERC-8004 wiring |
| **NapFiUniswapVault** | `uniswap/NapFiUniswapVault.sol` | USDC → partial swap to WETH, **Uniswap v3** NPM mint/increase/decrease/**collect**, plaintext **shares** + **encrypted** `encryptedBalances` (Zama pattern like `EncryptedVault`) |
| **UniswapV3SepoliaConstants** | `uniswap/UniswapV3SepoliaConstants.sol` | Sepolia addresses: factory, NPM, SwapRouter02, QuoterV2, WETH, Circle test USDC, fee tier constants |
| **NapFiUsdcVault** | `NapFiUsdcVault.sol` | Alternate / legacy vault variant (see deployments) |
| **FHECounter** | `FHECounter.sol` | Template-style FHE demo counter |

Shared **`contracts.json`** at the **repo root** lists Sepolia addresses for **`encryptedVault`**, **`agentRegistry`**, ERC-8004 **Identity** and **Reputation** registries (used by server + docs).

---

## Deployments

Hardhat-deploy scripts live in **`deploy/`** (e.g. vaults). Checkpoints:

- **`deployments/sepolia/`** — JSON with **`address`** + ABI for deployed contracts (e.g. `NapFiUniswapVault.json`, `NapFiUsdcVault.json`).

Frontend default vault: **`frontend/lib/contract-defs.ts`** (`NAPFI_UNISWAP_VAULT_ADDRESS`).

---

## NPM scripts

| Script | Description |
|--------|-------------|
| `npm run compile` | Compile contracts |
| `npm run test` | Hardhat tests |
| `npm run deploy:sepolia` | `hardhat deploy --network sepolia` |
| `npm run deploy:localhost` | Local deploy |
| `npm run verify:sepolia` | Etherscan verify (after deploy) |
| `npm run uniswap:sepolia-pool` | Helper script for USDC/WETH pool tooling |
| `npm run lint` | Solhint + ESLint + Prettier check |
| `npm run clean` | Remove artifacts / cache |

---

## Configuration

- **`hardhat.config.ts`** — networks (e.g. Sepolia), Solidity version, FHEVM plugin.  
- Use **`npx hardhat vars set`** for `MNEMONIC`, **`INFURA_API_KEY`**, **`ETHERSCAN_API_KEY`** as needed (see Zama FHEVM template patterns).

---

## Security note

Contracts are **testnet / demo** oriented. Review **`NapFiUniswapVault`** (slippage, oracle usage, operator roles) before any mainnet use.

---

## Documentation

- [Zama FHEVM docs](https://docs.zama.ai/fhevm)  
- [Uniswap v3 deployments (Sepolia)](https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments)  
