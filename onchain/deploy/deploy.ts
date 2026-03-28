import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHECounter = await deploy("FHECounter", {
    from: deployer,
    log: true,
  });

  const deployedAgentRegistry = await deploy("AgentRegistry", {
    from: deployer,
    log: true,
  });

  const deployedEncryptedVault = await deploy("EncryptedVault", {
    from: deployer,
    args: [deployer],
    log: true,
  });

  console.log(`FHECounter contract: `, deployedFHECounter.address);
  console.log(`AgentRegistry contract: `, deployedAgentRegistry.address);
  console.log(`EncryptedVault contract: `, deployedEncryptedVault.address);
};

export default func;
func.id = "deploy_fheCounter"; // id required to prevent reexecution
func.tags = ["FHECounter"];
