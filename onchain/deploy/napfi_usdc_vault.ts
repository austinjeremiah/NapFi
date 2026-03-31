import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Aave V3 Sepolia — underlying USDC listed in the pool (NOT Circle test USDC 0x1c7D…).
 * @see https://github.com/bgd-labs/aave-address-book/blob/main/src/ts/AaveV3Sepolia.ts
 */
const AAVE_SEPOLIA_USDC_UNDERLYING =
  "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const AAVE_SEPOLIA_AUSDC = "0x16dA4541aD1807f4443d92D26044C1147406EB80";
/** Aave V3 Pool Sepolia */
const AAVE_POOL_SEPOLIA = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name !== "sepolia") {
    console.log(
      "\n[NapFiUsdcVault] Not deployed: this script only runs on Sepolia (real Aave V3 Pool + USDC).\n" +
        "Use: npx hardhat deploy --network sepolia --tags NapFiUsdcVault\n"
    );
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedUsdcVault = await deploy("NapFiUsdcVault", {
    from: deployer,
    args: [AAVE_SEPOLIA_USDC_UNDERLYING, AAVE_POOL_SEPOLIA, AAVE_SEPOLIA_AUSDC],
    log: true,
  });
  console.log(`NapFiUsdcVault (USDC → Aave V3): `, deployedUsdcVault.address);
  console.log(`  Aave USDC (underlying): ${AAVE_SEPOLIA_USDC_UNDERLYING}`);
  console.log(`  aUSDC: ${AAVE_SEPOLIA_AUSDC}`);
};

export default func;
func.id = "deploy_napfi_usdc_vault";
func.tags = ["NapFiUsdcVault"];
