# Frontend (Next.js)

The **NapFi** web app: **Next.js 16** (App Router), **Web3Auth** for embedded wallets, **ethers** / **viem** for Sepolia, and **@zama-fhe/relayer-sdk** for decrypting **fhEVM** vault balances. It talks to the **Express API** via `NEXT_PUBLIC_API_BASE_URL`.

---

## Tech stack

- **Framework:** Next.js (`app/`), React 19, TypeScript  
- **Styling:** Tailwind CSS v4, Radix UI primitives, Framer Motion, GSAP (marketing sections)  
- **Wallet:** `@web3auth/modal`  
- **Chain:** Ethereum **Sepolia** (chain id `11155111`)  
- **FHE:** Zama relayer SDK — `userDecrypt` / balance handles from the vault  

---

## Environment

Create **`frontend/.env.local`** (not committed):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the NapFi API (e.g. `http://localhost:3001`) |
| `NEXT_PUBLIC_USDC_VAULT_ADDRESS` | Optional override for **`NapFiUniswapVault`**; defaults in `lib/contract-defs.ts` |

If the API URL is wrong or CORS blocks the origin, the app shows a clear error from `lib/api.ts`.

---

## App routes (`app/`)

| Route | File | Role |
|-------|------|------|
| Landing | `app/page.tsx` | Marketing / entry |
| Onboarding | `app/onboarding/page.tsx` | Create agent: goal, frequency, calls **`POST /api/setup`** |
| Dashboard | `app/(app)/dashboard/page.tsx` | Wallet USDC, **NapFiUniswapVault** deposit/withdraw, LP stats, next deposit countdown, Flow demo controls, pending deposit polling |
| Settings | `app/(app)/settings/page.tsx` | Agent / goal updates |
| Receipts | `app/receipts/page.tsx` | Automation receipts (API-backed) |
| App shell | `app/(app)/layout.tsx` | Wraps authenticated views with **`AppNav`** |

---

## Libraries (`lib/`)

| Module | Role |
|--------|------|
| **`api.ts`** | Typed clients: `postSetup`, `getAgent`, `getReceipts`, Flow pending deposit (`getFlowDepositPending`, `postFlowDepositComplete`), demo schedule / execute |
| **`contract-defs.ts`** | Pure constants: `CONTRACT_ADDRESSES`, `ENCRYPTED_VAULT_ABI`, `AGENT_REGISTRY_ABI`, **`VAULT_ADDRESS`** / `NAPFI_UNISWAP_VAULT_ADDRESS`, Sepolia USDC |
| **`contracts.ts`** | ethers read/write: USDC balance, vault deposit/withdraw, `getVaultLPInfo`, fee helpers, Web3Auth provider usage |
| **`zama.ts`** | fhEVM instance + **`userDecrypt`** for encrypted USDC balance |
| **`uniswap-v3-sepolia.ts`** | Sepolia Uniswap periphery addresses used by LP UI |
| **`web3auth-config.ts`** | Web3Auth client configuration |
| **`sepolia-client.ts`** | Shared Sepolia provider helpers |

---

## User flows (high level)

1. **Connect** — Web3Auth modal → EVM address on Sepolia.  
2. **Onboarding** — User submits goal + frequency → API runs ERC-8004 setup + optional Flow schedule → dashboard loads **`getAgent`**.  
3. **Deposit / withdraw** — User signs ERC-20 **`transferFrom`** / vault tx against **`VAULT_ADDRESS`** (Uniswap vault).  
4. **Encrypted balance** — “Reveal” uses Zama SDK + vault handles (`makeBalanceDecryptable` as needed).  
5. **Automation** — Server may enqueue **`/api/flow-deposit-pending`**; dashboard signs USDC and calls **`/api/flow-deposit-complete`**.  
6. **Demo “For 1m”** — Calls **`/api/demo/schedule-one-minute`** or falls back if Flow is unavailable (see dashboard logic).  

---

## Scripts

```bash
npm install
npm run dev          # next dev --webpack (default)
npm run dev:turbo    # optional turbopack
npm run build
npm start
npm run lint
```

---

## Related

- Root **`README.md`** — full-stack overview and Sepolia addresses  
- **`server/README.md`** — API and Flow integration  
