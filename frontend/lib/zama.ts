"use client"

import { createInstance, SepoliaConfig, type FhevmInstance } from "@zama-fhe/relayer-sdk/web"
import type { Eip1193Provider } from "ethers"

let instance: FhevmInstance | null = null

/**
 * Returns a singleton FhevmInstance for Sepolia.
 * Pass the Web3Auth provider (EIP-1193) on first call.
 */
export async function getZamaInstance(provider?: Eip1193Provider): Promise<FhevmInstance> {
  if (instance) return instance

  instance = await createInstance({
    ...SepoliaConfig,
    network: provider as Eip1193Provider,
  })

  return instance
}

/**
 * Decrypt a public balance handle returned by vault.getBalanceHandle(user).
 * Returns the cleartext value as a number (USDC with 6 decimals — divide by 1e6).
 */
export async function decryptBalance(
  handle: `0x${string}`,
  provider: Eip1193Provider
): Promise<number> {
  const fhevm = await getZamaInstance(provider)
  const results = await fhevm.publicDecrypt([handle])
  const value = (Object.values(results)[0] as unknown) as bigint
  return Number(value)
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
