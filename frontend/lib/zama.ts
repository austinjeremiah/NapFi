"use client"

import {
  createInstance,
  initSDK,
  SepoliaConfigV2,
  type FhevmInstance,
} from "@zama-fhe/relayer-sdk/web"
import { BrowserProvider, getAddress } from "ethers"
import type { Eip1193Provider } from "ethers"

let instance: FhevmInstance | null = null
let wasmInit: Promise<void> | null = null

/** Stable Sepolia JSON-RPC for SDK host-chain reads (ACL, etc.). Wallet EIP-1193 often breaks batching / key fetch. */
function sepoliaRpcUrl(): string {
  const fromEnv =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim()
  return fromEnv || "https://ethereum-sepolia.publicnode.com"
}

async function ensureWasm(): Promise<void> {
  if (wasmInit) return wasmInit
  wasmInit = initSDK({}).catch((e) => {
    wasmInit = null
    throw e
  })
  return wasmInit
}

/**
 * Returns a singleton FhevmInstance for Sepolia.
 * Uses explicit relayer `/v2` + public RPC for `network` (Zama docs). Web3Auth as `network`
 * often triggers "wrong relayer url" / Failed to fetch from batched RPC.
 */
export async function getZamaInstance(_provider?: Eip1193Provider): Promise<FhevmInstance> {
  if (instance) return instance

  await ensureWasm()

  const relayerOverride =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_ZAMA_RELAYER_URL?.trim()

  instance = await createInstance({
    ...SepoliaConfigV2,
    ...(relayerOverride ? { relayerUrl: relayerOverride } : {}),
    network: sepoliaRpcUrl(),
  })

  return instance
}

/**
 * Decrypt a balance handle from vault.getBalanceHandle(user) via KMS userDecrypt
 * (EIP-712 signed by the wallet). Vault ACL only allows user decryption, not publicDecrypt.
 * Returns the cleartext value as a number (USDC with 6 decimals — divide by 1e6).
 */
export async function decryptBalance(
  handle: `0x${string}`,
  vaultAddress: string,
  userAddress: string,
  provider: Eip1193Provider
): Promise<number> {
  const fhevm = await getZamaInstance(provider)
  const vault = getAddress(vaultAddress)
  const user = getAddress(userAddress)

  const keypair = fhevm.generateKeypair()
  const startTimestamp = Math.floor(Date.now() / 1000)
  const durationDays = 7
  const contractAddresses = [vault]

  const eip712 = fhevm.createEIP712(
    keypair.publicKey,
    contractAddresses,
    startTimestamp,
    durationDays
  )

  const browserProvider = new BrowserProvider(provider)
  const signer = await browserProvider.getSigner()
  if (getAddress(await signer.getAddress()) !== user) {
    throw new Error("Connected wallet must match the vault user address")
  }

  const signature = await signer.signTypedData(
    eip712.domain,
    {
      UserDecryptRequestVerification: [
        ...eip712.types.UserDecryptRequestVerification,
      ],
    },
    { ...eip712.message }
  )

  const results = await fhevm.userDecrypt(
    [{ handle, contractAddress: vault }],
    keypair.privateKey,
    keypair.publicKey,
    signature,
    contractAddresses,
    user,
    startTimestamp,
    durationDays
  )

  const raw = Object.values(results)[0]
  if (raw === undefined) {
    throw new Error("userDecrypt returned no clear value")
  }
  if (typeof raw !== "bigint") {
    throw new Error(`Unexpected decrypted type: ${typeof raw}`)
  }
  return Number(raw) / 1e6
}

/**
 * Encrypt a uint64 amount for vault.withdraw(encryptedAmount, inputProof).
 * Returns { encryptedAmount, inputProof } ready to pass to the contract.
 */
export async function encryptWithdrawAmount(
  amount: number,
  vaultAddress: string,
  userAddress: string,
  provider: Eip1193Provider
): Promise<{ encryptedAmount: Uint8Array; inputProof: Uint8Array }> {
  const fhevm = await getZamaInstance(provider)
  const input = fhevm.createEncryptedInput(vaultAddress, userAddress)
  input.add64(BigInt(amount))
  const encrypted = await input.encrypt()
  return {
    encryptedAmount: encrypted.handles[0],
    inputProof: encrypted.inputProof,
  }
}
