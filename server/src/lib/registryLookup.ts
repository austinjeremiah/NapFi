import { Contract, getAddress, JsonRpcProvider } from "ethers"
import { loadAgentRegistryAbi, loadContractsConfig } from "./contracts.js"

export type RegistryLookupRow = {
  agentId: number
  vaultAddress: string
  registeredAt: number
}

export async function lookupUserOnChain(userAddress: string): Promise<RegistryLookupRow | null> {
  const rpc = process.env.SEPOLIA_RPC_URL?.trim()
  if (!rpc) return null

  const cfg = loadContractsConfig()
  const provider = new JsonRpcProvider(rpc, cfg.chainId)
  const abi = loadAgentRegistryAbi()
  const c = new Contract(cfg.agentRegistry, abi, provider)
  const addr = getAddress(userAddress)
  const row = await c.lookup(addr)
  const [agentId, vaultAddress, registrationStatus, registeredAt] = row as [
    bigint,
    string,
    boolean,
    bigint,
  ]
  if (!registrationStatus) return null
  return {
    agentId: Number(agentId),
    vaultAddress,
    registeredAt: Number(registeredAt),
  }
}
