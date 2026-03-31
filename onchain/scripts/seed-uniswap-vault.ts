/**
 * Seed NapFiUniswapVault: wrap ETH → WETH, approve, call initializePosition.
 *
 * Usage:
 *   cd onchain && npx hardhat run scripts/seed-uniswap-vault.ts --network sepolia
 */
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const USDC_CIRCLE_SEPOLIA = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const USDC_SEED = 5_000000n;        // 5 USDC (6 decimals)
const ETH_TO_WRAP = ethers.parseEther("0.003"); // wrap 0.003 ETH → WETH

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Read deployed vault address from hardhat-deploy artifacts
  const deploymentPath = path.join(
    __dirname, "..", "deployments", "sepolia", "NapFiUniswapVault.json"
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("NapFiUniswapVault not deployed — run deploy first");
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const VAULT = deployment.address as string;
  console.log("Vault:", VAULT);

  const erc20ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ];
  const wethABI = [
    ...erc20ABI,
    "function deposit() payable",
  ];
  const vaultABI = [
    "function initializePosition(uint256,uint256) external",
    "function positionTokenId() view returns (uint256)",
    "function totalShares() view returns (uint256)",
  ];

  const usdcContract = new ethers.Contract(USDC_CIRCLE_SEPOLIA, erc20ABI, deployer);
  const wethContract = new ethers.Contract(WETH_SEPOLIA, wethABI, deployer);
  const vault = new ethers.Contract(VAULT, vaultABI, deployer);

  // Check if already initialized
  const existingPos = await vault.positionTokenId();
  if (existingPos > 0n) {
    console.log("Vault already initialized (positionTokenId =", existingPos.toString(), ")");
    return;
  }

  // Check USDC balance
  const usdcBal: bigint = await usdcContract.balanceOf(deployer.address);
  console.log(`USDC balance: ${ethers.formatUnits(usdcBal, 6)} USDC`);
  if (usdcBal < USDC_SEED) {
    throw new Error(
      `Need at least ${ethers.formatUnits(USDC_SEED, 6)} USDC. Have ${ethers.formatUnits(usdcBal, 6)}.`
    );
  }

  // 1. Wrap ETH → WETH
  console.log(`\n1. Wrapping ${ethers.formatEther(ETH_TO_WRAP)} ETH → WETH...`);
  const wrapTx = await wethContract.deposit({ value: ETH_TO_WRAP });
  await wrapTx.wait();
  const wethBal: bigint = await wethContract.balanceOf(deployer.address);
  console.log(`   WETH balance: ${ethers.formatEther(wethBal)} WETH`);

  // 2. Approve USDC to vault
  console.log(`\n2. Approving ${ethers.formatUnits(USDC_SEED, 6)} USDC to vault...`);
  const approveTx1 = await usdcContract.approve(VAULT, USDC_SEED);
  await approveTx1.wait();

  // 3. Approve WETH to vault
  const wethForSeed = wethBal < ETH_TO_WRAP ? wethBal : ETH_TO_WRAP;
  console.log(`3. Approving ${ethers.formatEther(wethForSeed)} WETH to vault...`);
  const approveTx2 = await wethContract.approve(VAULT, wethForSeed);
  await approveTx2.wait();

  // 4. Call initializePosition
  console.log(`\n4. Calling initializePosition(${ethers.formatUnits(USDC_SEED, 6)} USDC, ${ethers.formatEther(wethForSeed)} WETH)...`);
  const initTx = await vault.initializePosition(USDC_SEED, wethForSeed);
  const receipt = await initTx.wait();
  console.log(`   Tx confirmed: ${receipt.hash}`);

  const newPos = await vault.positionTokenId();
  const shares = await vault.totalShares();
  console.log(`\n   positionTokenId: ${newPos}`);
  console.log(`   totalShares:     ${ethers.formatUnits(shares, 6)} (USDC equiv)`);
  console.log("\nVault is seeded. Users can now call depositUSDC.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
