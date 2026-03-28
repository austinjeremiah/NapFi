import { Contract, getAddress, JsonRpcProvider, Wallet } from "ethers"
import { pinJsonToIpfs } from "./ipfsPin.js"
import {
  loadAgentRegistryAbi,
  loadContractsConfig,
  loadIdentityRegistryAbi,
} from "./contracts.js"

export type OnchainSetupResult = {
  agentId: number
  vaultAddress: string
  ipfsUri: string
  txHashes: {
    register: string
    setAgentWallet: string
    registerUserAgent: string
  }
}

function buildAgentRegistrationJson(params: {
  userAddress: string
  goalAmountUSDC: number
  frequency: string
  yieldEnabled: boolean
}): Record<string, unknown> {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "NapFi-PrivyAgent",
    description:
      "Confidential DeFi savings agent — encrypted vault deposits on schedule (NapFi testnet demo).",
    image: "https://napfi.app/icon.svg",
    active: true,
    supportedTrust: ["reputation"],
    services: [{ name: "web", endpoint: "https://napfi.app" }],
    napfi: {
      userAddress: params.userAddress,
      goalAmountUSDC: params.goalAmountUSDC,
      frequency: params.frequency,
      yieldEnabled: params.yieldEnabled,
    },
  }
}

/**
 * 1) Pin registration JSON → URI
 * 2) IdentityRegistry.register(agentURI) — minter = backend (owner of NFT)
 * 3) setAgentWallet — operator signs EIP-712; backend submits tx
 * 4) AgentRegistry.registerUserAgent(user, agentId, vault)
 */
export async function runNapFiOnchainSetup(params: {
  userAddress: string
  goalAmountUSDC: number
  frequency: string
  yieldEnabled: boolean
}): Promise<OnchainSetupResult> {
  const rpc = process.env.SEPOLIA_RPC_URL?.trim()
  const pk = process.env.BACKEND_PRIVATE_KEY?.trim()
  const operatorPk = process.env.OPERATOR_PRIVATE_KEY?.trim() || pk

  if (!rpc) throw new Error("SEPOLIA_RPC_URL is not set")
  if (!pk) throw new Error("BACKEND_PRIVATE_KEY is not set (funded Sepolia wallet)")
  if (!operatorPk) throw new Error("OPERATOR_PRIVATE_KEY or BACKEND_PRIVATE_KEY is required")

  const cfg = loadContractsConfig()
  const provider = new JsonRpcProvider(rpc, cfg.chainId)
  const backend = new Wallet(pk, provider)
  const operator = new Wallet(operatorPk, provider)

  const identityAbi = loadIdentityRegistryAbi()
  const agentRegAbi = loadAgentRegistryAbi()

  const identity = new Contract(cfg.erc8004IdentityRegistry, identityAbi, backend)
  const agentRegistry = new Contract(cfg.agentRegistry, agentRegAbi, backend)

  const vaultAddress =
    process.env.VAULT_CONTRACT_ADDRESS?.trim() || cfg.encryptedVault

  const meta = buildAgentRegistrationJson(params)
  const ipfsUri = await pinJsonToIpfs(meta, "napfi-agent-registration.json")

  const regFn = identity.getFunction("register(string)")
  const txReg = await regFn(ipfsUri)
  const receiptReg = await txReg.wait()
  if (!receiptReg) throw new Error("register() receipt missing")

  let agentId: bigint | undefined
  const idAddr = cfg.erc8004IdentityRegistry.toLowerCase()
  for (const log of receiptReg.logs) {
    if (log.address.toLowerCase() !== idAddr) continue
    try {
      const ev = identity.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      })
      if (ev?.name === "Registered") {
        agentId = ev.args.agentId as bigint
        break
      }
    } catch {
      /* skip */
    }
  }
  if (agentId === undefined) {
    throw new Error("Could not parse agentId from Registered event")
  }

  const eip = await identity.eip712Domain()
  const name = eip.name as string
  const version = eip.version as string
  const chainId = BigInt(eip.chainId as bigint)
  const verifyingContract = eip.verifyingContract as string
  const salt = eip.salt as string

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 4 * 60)
  const ownerAddr = await identity.ownerOf(agentId)

  const domain: {
    name: string
    version: string
    chainId: bigint
    verifyingContract: string
    salt?: string
  } = {
    name,
    version,
    chainId,
    verifyingContract,
  }
  if (salt && BigInt(salt) !== 0n) {
    domain.salt = salt
  }

  const types = {
    AgentWalletSet: [
      { name: "agentId", type: "uint256" },
      { name: "newWallet", type: "address" },
      { name: "owner", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
  }

  const value = {
    agentId,
    newWallet: operator.address,
    owner: ownerAddr,
    deadline,
  }

  const signature = await operator.signTypedData(domain, types, value)

  const setWalletFn = identity.getFunction(
    "setAgentWallet(uint256,address,uint256,bytes)"
  )
  const txWallet = await setWalletFn(agentId, operator.address, deadline, signature)
  const receiptWallet = await txWallet.wait()
  if (!receiptWallet) throw new Error("setAgentWallet receipt missing")

  const userChecksummed = getAddress(params.userAddress)
  const regUserFn = agentRegistry.getFunction(
    "registerUserAgent(address,uint256,address)"
  )
  const txAr = await regUserFn(userChecksummed, agentId, vaultAddress)
  const receiptAr = await txAr.wait()
  if (!receiptAr) throw new Error("registerUserAgent receipt missing")

  return {
    agentId: Number(agentId),
    vaultAddress,
    ipfsUri,
    txHashes: {
      register: receiptReg.hash,
      setAgentWallet: receiptWallet.hash,
      registerUserAgent: receiptAr.hash,
    },
  }
}
