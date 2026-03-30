/**
 * sepoliaExecutor.ts
 * Encrypts a USDC amount using Zama fhEVM relayer SDK and calls
 * EncryptedVault.deposit() on Sepolia.
 *
 * Requires real Zama encryption (same as browser): use SepoliaConfig + EIP-1193 RPC.
 * Mock ciphertexts are rejected by FHE.fromExternal on-chain.
 *
 * Env: SEPOLIA_RPC_URL, BACKEND_PRIVATE_KEY, optional VAULT_CONTRACT_ADDRESS
 */

import {
  Contract,
  getAddress,
  hexlify,
  JsonRpcProvider,
  Wallet,
  type Eip1193Provider,
} from "ethers"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node"
import { loadContractsConfig } from "./contracts.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadVaultAbi() {
  const raw = readFileSync(
    join(
      __dirname,
      "../../../onchain/artifacts/contracts/EncryptedVault.sol/EncryptedVault.json"
    ),
    "utf8"
  )
  return JSON.parse(raw).abi
}

/** ethers JsonRpcProvider → EIP-1193 for @zama-fhe/relayer-sdk createInstance */
function jsonRpcToEip1193(provider: JsonRpcProvider): Eip1193Provider {
  return {
    request: async (args: {
      method: string
      params?: readonly unknown[] | undefined
    }) => {
      const params =
        args.params === undefined ? [] : [...args.params]
      return provider.send(args.method, params)
    },
  } as Eip1193Provider
}

export type DepositResult = {
  sepoliaTxHash: string
}

export async function executeEncryptedDeposit(params: {
  userEVMAddress: string
  amountUSDC: number
}): Promise<DepositResult> {
  const rpc = process.env.SEPOLIA_RPC_URL?.trim()
  const pk = process.env.BACKEND_PRIVATE_KEY?.trim()

  if (!rpc) throw new Error("SEPOLIA_RPC_URL is not set")
  if (!pk) throw new Error("BACKEND_PRIVATE_KEY is not set")

  const cfg = loadContractsConfig()
  const vaultAddr = getAddress(
    process.env.VAULT_CONTRACT_ADDRESS?.trim() || cfg.encryptedVault
  )
  const provider = new JsonRpcProvider(rpc, cfg.chainId)
  const operator = new Wallet(pk, provider)
  const vaultAbi = loadVaultAbi()
  const vault = new Contract(vaultAddr, vaultAbi, operator)
  const userAddr = getAddress(params.userEVMAddress)
  const operatorAddr = getAddress(operator.address)

  const microUsdc = BigInt(Math.round(params.amountUSDC * 1_000_000))

  const instance = await createInstance({
    ...SepoliaConfig,
    network: jsonRpcToEip1193(provider),
  })

  // fhEVM verifyInput passes msg.sender (deposit caller) as EIP712 userAddress — must match
  // this second arg. The vault still credits `user` from deposit(..., user).
  const input = instance.createEncryptedInput(vaultAddr, operatorAddr)
  input.add64(microUsdc)
  const encrypted = await input.encrypt()
  const encryptedHandle = encrypted.handles[0]
  const inputProof = encrypted.inputProof

  console.log(
    `[Zama] Encrypted ${params.amountUSDC} USDC → handle ${hexlify(encryptedHandle).slice(0, 18)}…`
  )

  const tx = await vault.deposit(encryptedHandle, inputProof, userAddr)
  const receipt = await tx.wait()
  if (!receipt) throw new Error("EncryptedVault.deposit() receipt missing")

  console.log(
    `[NapFi][Sepolia] EncryptedVault.deposit confirmed | tx: ${receipt.hash} | user: ${userAddr}`
  )

  return { sepoliaTxHash: receipt.hash as string }
}
