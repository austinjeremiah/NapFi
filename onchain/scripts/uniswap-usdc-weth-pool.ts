/**
 * Resolve USDC / WETH Uniswap v3 pool address on Sepolia via `IUniswapV3Factory.getPool`.
 *
 * Docs (deployments + `getPool` example):
 * https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
 *
 * Usage:
 *   cd onchain && npx hardhat run scripts/uniswap-usdc-weth-pool.ts --network sepolia
 */
import { ethers } from "hardhat";

const FACTORY = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as const;
/** WETH — Wrapped Native Token Addresses (Sepolia) on same docs page */
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const;
/** USDC — not on Uniswap deployments table; Circle Sepolia test USDC for typical USDC/WETH demos */
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
] as const;

const FEES = [
  { name: "0.01%", fee: 100n },
  { name: "0.05%", fee: 500n },
  { name: "0.3%", fee: 3000n },
  { name: "1%", fee: 10000n },
] as const;

function sortTokens(a: string, b: string): [string, string] {
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  return A < B ? [a, b] : [b, a];
}

async function main() {
  const [signer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  if (net.chainId !== 11155111n) {
    console.warn("Warning: expected Sepolia (11155111). Current chainId:", net.chainId.toString());
  }

  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, signer);
  const [token0, token1] = sortTokens(USDC, WETH);

  console.log("Uniswap v3 — Ethereum Sepolia (see docs link in script header)");
  console.log("Factory:", FACTORY);
  console.log("token0 (sorted):", token0);
  console.log("token1 (sorted):", token1);
  console.log("");

  for (const { name, fee } of FEES) {
    const pool: string = await factory.getPool(token0, token1, fee);
    const exists = pool !== ethers.ZeroAddress;
    console.log(`fee ${name} (${fee}):`, exists ? pool : "(no pool)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
