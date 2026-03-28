import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import type { InterfaceAbi } from "ethers"

const __dirname = dirname(fileURLToPath(import.meta.url))

const REPO_ROOT = join(__dirname, "../../..")

export type ContractsConfig = {
  chainId: number
  encryptedVault: string
  agentRegistry: string
  erc8004IdentityRegistry: string
  erc8004ReputationRegistry: string
}

export function loadContractsConfig(): ContractsConfig {
  const raw = readFileSync(join(REPO_ROOT, "contracts.json"), "utf8")
  const data = JSON.parse(raw) as {
    ethereumSepolia: {
      chainId: number
      contracts: Omit<ContractsConfig, "chainId">
    }
  }
  const c = data.ethereumSepolia.contracts
  return {
    chainId: data.ethereumSepolia.chainId,
    encryptedVault: c.encryptedVault,
    agentRegistry: c.agentRegistry,
    erc8004IdentityRegistry: c.erc8004IdentityRegistry,
    erc8004ReputationRegistry: c.erc8004ReputationRegistry,
  }
}

export function loadAgentRegistryAbi(): InterfaceAbi {
  const raw = readFileSync(
    join(REPO_ROOT, "onchain/artifacts/contracts/AgentRegistry.sol/AgentRegistry.json"),
    "utf8"
  )
  return JSON.parse(raw).abi as InterfaceAbi
}

function abiFromArtifactOrArray(raw: string): InterfaceAbi {
  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) {
    return parsed as InterfaceAbi
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    "abi" in parsed &&
    Array.isArray((parsed as { abi: unknown }).abi)
  ) {
    return (parsed as { abi: InterfaceAbi }).abi
  }
  throw new Error("ABI file must be a JSON array or a Hardhat artifact with an .abi array")
}

export function loadIdentityRegistryAbi(): InterfaceAbi {
  const raw = readFileSync(join(__dirname, "../abis/IdentityRegistry.json"), "utf8")
  return abiFromArtifactOrArray(raw)
}
