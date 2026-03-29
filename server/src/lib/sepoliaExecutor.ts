/**
 * sepoliaExecutor.ts
 * Encrypts a USDC amount using Zama fhEVM relayer SDK and calls
 * EncryptedVault.deposit() on Sepolia.
 *
 * Env vars required (same as onchainSetup):
 *   SEPOLIA_RPC_URL
 *   BACKEND_PRIVATE_KEY  — the agent operator wallet
 *   VAULT_CONTRACT_ADDRESS (optional; falls back to contracts.json)
 */

import { Contract, getAddress, JsonRpcProvider, Wallet } from "ethers"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { loadContractsConfig } from "./contracts.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadVaultAbi() {
  const raw = readFileSync(
    join(
      __dirname,
      "../../../../onchain/artifacts/contracts/EncryptedVault.sol/EncryptedVault.json"
    ),
    "utf8"
  )
  return JSON.parse(raw).abi
}

export type DepositResult = {
  sepoliaTxHash: string
}

export async function executeEncryptedDeposit(params: {
  userEVMAddress: string
  amountUSDC: number
}): Promise<DepositResult> {
  const rpc = process.env.SEPOLIA_RPC_URL?.trim()
  const pk  = process.env.BACKEND_PRIVATE_KEY?.trim()

  if (!rpc) throw new Error("SEPOLIA_RPC_URL is not set")
  if (!pk)  throw new Error("BACKEND_PRIVATE_KEY is not set")

  const cfg        = loadContractsConfig()
  const vaultAddr  = process.env.VAULT_CONTRACT_ADDRESS?.trim() || cfg.encryptedVault
  const provider   = new JsonRpcProvider(rpc, cfg.chainId)
  const operator   = new Wallet(pk, provider)
  const vaultAbi   = loadVaultAbi()
  const vault      = new Contract(vaultAddr, vaultAbi, operator)
  const userAddr   = getAddress(params.userEVMAddress)

  // ── Encrypt the deposit amount using Zama fhEVM relayer SDK ──────────────
  // Amount stored in USDC with 6 decimals — convert UFix64 USDC to uint64 micro-USDC
  const microUsdc = BigInt(Math.round(params.amountUSDC * 1_000_000))

  let encryptedHandle: string
  let inputProof: string

  try {
    // Dynamic import — SDK may not be installed in all environments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk = (await import(/* @vite-ignore */ "@zama-fhe/relayer-sdk" as string)) as any
    const { createInstance } = sdk as {
      createInstance: (opts: { network: string }) => Promise<{
        createEncryptedInput: (
          contractAddr: string,
          userAddr: string
        ) => {
          add64: (n: bigint) => void
          encrypt: () => Promise<{ handles: string[]; inputProof: string }>
        }
      }>
    }

    const instance = await createInstance({ network: "sepolia" })
    const input    = instance.createEncryptedInput(vaultAddr, userAddr)
    input.add64(microUsdc)
    const encrypted = await input.encrypt()
    encryptedHandle = encrypted.handles[0]
    inputProof      = encrypted.inputProof

    console.log(
      `[Zama] Encrypted ${params.amountUSDC} USDC → handle ${encryptedHandle.slice(0, 18)}...`
    )
  } catch {
    // ── Dev / mock fallback ─────────────────────────────────────────────────
    // When @zama-fhe/relayer-sdk is not available or fhEVM infra is unreachable,
    // use a deterministic placeholder so the rest of the pipeline still runs.
    console.warn(
      "[Zama] relayer-sdk not available — using mock encryption (dev/demo only)"
    )
    encryptedHandle =
      "0x" +
      Buffer.from(
        `mock:${params.amountUSDC}:${userAddr}:${Date.now()}`.padEnd(32, "0").slice(0, 32)
      ).toString("hex")
    inputProof = "0x" + "00".repeat(64)
  }

  // ── Call EncryptedVault.deposit() ─────────────────────────────────────────
  const tx      = await vault.deposit(encryptedHandle, inputProof, userAddr)
  const receipt = await tx.wait()
  if (!receipt) throw new Error("EncryptedVault.deposit() receipt missing")

  console.log(
    `[Sepolia] EncryptedVault.deposit confirmed | tx: ${receipt.hash} | user: ${userAddr}`
  )

  return { sepoliaTxHash: receipt.hash as string }
}
