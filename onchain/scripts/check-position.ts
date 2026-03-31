import { ethers } from "hardhat";

async function main() {
  const VAULT = "0x00708ec2B50d785d6717Ef8192bF89b62aB28348";
  const NPM = "0x1238536071E1c677A632429e3655c799b22cDA52";

  const vaultAbi = [
    "function positionTokenId() view returns (uint256)",
    "function totalShares() view returns (uint256)",
    "function getPositionLiquidity() view returns (uint128)",
  ];
  const npmAbi = [
    "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  ];

  const vault = new ethers.Contract(VAULT, vaultAbi, ethers.provider);
  const npm = new ethers.Contract(NPM, npmAbi, ethers.provider);

  const tokenId = await vault.positionTokenId();
  const totalShares = await vault.totalShares();
  const liq = await vault.getPositionLiquidity();

  console.log("Position Token ID:", tokenId.toString());
  console.log("Total Shares:", ethers.formatUnits(totalShares, 6), "USDC");
  console.log("Liquidity:", liq.toString());

  if (tokenId > 0n) {
    const p = await npm.positions(tokenId);
    console.log("\n--- Uniswap Position Data ---");
    console.log("token0:", p[2]);
    console.log("token1:", p[3]);
    console.log("fee:", p[4].toString());
    console.log("liquidity:", p[7].toString());
    console.log("tokensOwed0 (USDC fees):", ethers.formatUnits(p[10], 6));
    console.log("tokensOwed1 (WETH fees):", ethers.formatUnits(p[11], 18));
  }
}

main().catch(console.error);
