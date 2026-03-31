/**
 * Uniswap v3 — Ethereum Sepolia (testnet) addresses for USDC / WETH integration.
 *
 * **Source of truth:** Uniswap Labs docs (Ethereum Deployments — use Sepolia column only):
 * https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
 *
 * - Factory, SwapRouter02, QuoterV2, NonfungiblePositionManager, Universal Router, Permit2: from that page.
 * - **WETH:** “Wrapped Native Token Addresses” table on the same page (Sepolia).
 * - **USDC:** not listed on the deployments page; for the usual testnet **USDC/WETH** pair, use Circle’s
 *   Sepolia test USDC (`0x1c7D…`). If you use another USDC, call `getPool` yourself — pool may not exist.
 *
 * Pool lookup (Solidity / ethers): `IUniswapV3Factory.getPool(token0, token1, fee)` with `token0 < token1`.
 */

/** UniswapV3Factory — Sepolia */
export const UNISWAP_V3_FACTORY_SEPOLIA =
  "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as const

/** NonfungiblePositionManager — Sepolia */
export const NONFUNGIBLE_POSITION_MANAGER_SEPOLIA =
  "0x1238536071E1c677A632429e3655c799b22cDA52" as const

/** SwapRouter02 — Sepolia */
export const SWAP_ROUTER_02_SEPOLIA =
  "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as const

/** QuoterV2 — Sepolia */
export const QUOTER_V2_SEPOLIA =
  "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as const

/** Universal Router — Sepolia (preferred swap entrypoint per docs section on same page) */
export const UNIVERSAL_ROUTER_SEPOLIA =
  "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b" as const

/** Permit2 — same address mainnet/Sepolia per docs */
export const PERMIT2_ADDRESS =
  "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const

/** WETH9 — Sepolia (docs: Wrapped Native Token Addresses) */
export const WETH_SEPOLIA =
  "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const

/**
 * Circle Sepolia test USDC — typical `token0` for USDC/WETH when `USDC < WETH` by address sort.
 * Not from Uniswap deployments table; required for `getPool` / swaps.
 */
export const USDC_SEPOLIA_CIRCLE =
  "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const

export const UNISWAP_V3_FEE_TIER = {
  FEE_0_01_PERCENT: 100,
  FEE_0_05_PERCENT: 500,
  FEE_0_3_PERCENT: 3000,
  FEE_1_PERCENT: 10000,
} as const

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
] as const

/** Sort token addresses for Uniswap v3 `getPool` (token0 < token1). */
export function sortTokensForUniswapV3(a: string, b: string): [string, string] {
  const A = a.toLowerCase()
  const B = b.toLowerCase()
  return A < B ? [a, b] : [b, a]
}

export { FACTORY_ABI as UNISWAP_V3_FACTORY_ABI }
