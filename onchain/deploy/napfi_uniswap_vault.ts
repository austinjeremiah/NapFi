/**
 * Deploy NapFiUniswapVault to Sepolia and ensure a USDC/WETH 0.3% pool exists.
 *
 * Addresses from:
 *   https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
 *
 * Usage:
 *   cd onchain && npx hardhat deploy --network sepolia --tags NapFiUniswapVault
 */
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// ── Sepolia addresses (from Uniswap v3 Ethereum Deployments page) ────────────
const USDC_CIRCLE_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const NPM_SEPOLIA = "0x1238536071E1c677A632429e3655c799b22cDA52";
const SWAP_ROUTER_02_SEPOLIA = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
const FACTORY_SEPOLIA = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c";

const POOL_FEE = 3000; // 0.3 %

// ── Helpers: compute sqrtPriceX96 for pool initialization ─────────────────────

function sqrtBigInt(value: bigint): bigint {
  if (value === 0n) return 0n;
  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
}

/** sqrtPriceX96 = sqrt(reserve1 / reserve0) * 2^96  (Uniswap v3 convention) */
function encodePriceSqrt(reserve1: bigint, reserve0: bigint): bigint {
  return sqrtBigInt((reserve1 * 2n ** 192n) / reserve0);
}

// ── Deploy function ───────────────────────────────────────────────────────────

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "sepolia") {
    console.log(
      `NapFiUniswapVault: Sepolia only — skipping on "${hre.network.name}".`
    );
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const { ethers } = hre;

  // ── 1. Deploy the vault ───────────────────────────────────────────────────
  const result = await deploy("NapFiUniswapVault", {
    from: deployer,
    args: [
      USDC_CIRCLE_SEPOLIA,
      WETH_SEPOLIA,
      NPM_SEPOLIA,
      SWAP_ROUTER_02_SEPOLIA,
      deployer, // agentOperator — same pattern as EncryptedVault
    ],
    log: true,
  });
  console.log(`\nNapFiUniswapVault deployed: ${result.address}`);
  console.log(`  USDC (Circle Sepolia):        ${USDC_CIRCLE_SEPOLIA}`);
  console.log(`  WETH (Sepolia):               ${WETH_SEPOLIA}`);
  console.log(`  NonfungiblePositionManager:    ${NPM_SEPOLIA}`);
  console.log(`  SwapRouter02:                  ${SWAP_ROUTER_02_SEPOLIA}`);
  console.log(`  agentOperator:                 ${deployer}`);

  // ── 2. Ensure USDC/WETH 0.3% pool exists ─────────────────────────────────
  const signer = await ethers.provider.getSigner(deployer);

  const factoryABI = [
    "function getPool(address,address,uint24) view returns (address)",
  ];
  const factory = new ethers.Contract(FACTORY_SEPOLIA, factoryABI, signer);

  // token0 must be the lower address
  const [t0, t1] =
    BigInt(USDC_CIRCLE_SEPOLIA) < BigInt(WETH_SEPOLIA)
      ? [USDC_CIRCLE_SEPOLIA, WETH_SEPOLIA]
      : [WETH_SEPOLIA, USDC_CIRCLE_SEPOLIA];

  const existingPool: string = await factory.getPool(t0, t1, POOL_FEE);

  if (existingPool === ethers.ZeroAddress) {
    console.log("\nNo USDC/WETH 0.3% pool on Sepolia — creating one…");

    // 1 ETH ≈ 2000 USDC (demo price)
    // token0 = USDC (6 dec), token1 = WETH (18 dec)
    // price = reserve1 / reserve0 in raw: 1e18 / 2000e6
    const sqrtPriceX96 = encodePriceSqrt(1n * 10n ** 18n, 2000n * 10n ** 6n);
    console.log(`  sqrtPriceX96 (1 ETH = 2000 USDC): ${sqrtPriceX96}`);

    const npmABI = [
      "function createAndInitializePoolIfNecessary(address,address,uint24,uint160) payable returns (address)",
    ];
    const npm = new ethers.Contract(NPM_SEPOLIA, npmABI, signer);
    const tx = await npm.createAndInitializePoolIfNecessary(
      t0,
      t1,
      POOL_FEE,
      sqrtPriceX96
    );
    const receipt = await tx.wait();
    console.log(`  Pool created — tx: ${receipt.hash}`);

    const newPool = await factory.getPool(t0, t1, POOL_FEE);
    console.log(`  Pool address: ${newPool}`);
  } else {
    console.log(`\nUSDC/WETH 0.3% pool already exists: ${existingPool}`);
  }

  // ── 3. Next steps ─────────────────────────────────────────────────────────
  console.log("\n── Next steps to make the vault usable ──");
  console.log(
    "1. Wrap some Sepolia ETH → WETH:"
  );
  console.log(
    `     cast send ${WETH_SEPOLIA} "deposit()" --value 0.001ether --rpc-url $SEPOLIA_RPC_URL --private-key $KEY`
  );
  console.log(
    "2. Approve USDC + WETH to the vault, then call initializePosition(usdcAmt, wethAmt)."
  );
  console.log(
    "3. After that, any user can depositUSDC / withdraw."
  );
};

export default func;
func.id = "deploy_napfi_uniswap_vault";
func.tags = ["NapFiUniswapVault"];
