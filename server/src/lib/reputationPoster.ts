/**
 * reputationPoster.ts
 * After a successful EncryptedVault.deposit():
 *   1. Builds an execution log JSON
 *   2. Pins it to IPFS (Lighthouse / Pinata)
 *   3. Calls ReputationRegistry.giveFeedback() on Sepolia
 *
 * Env vars required:
 *   SEPOLIA_RPC_URL
 *   BACKEND_PRIVATE_KEY
 *   AGENT_ID               — the ERC-8004 token ID minted during setup
 */

import { Contract, JsonRpcProvider, keccak256, toUtf8Bytes, Wallet } from "ethers"
import { loadContractsConfig, loadReputationRegistryAbi } from "./contracts.js"
import { pinJsonToIpfs } from "./ipfsPin.js"

export type ReceiptParams = {
  userEVMAddress: string
  amountUSDC:     number
  sepoliaTxHash:  string
  flowTimestamp:  string
}

export async function postReputationReceipt(params: ReceiptParams): Promise<void> {
  const rpc     = process.env.SEPOLIA_RPC_URL?.trim()
  const pk      = process.env.BACKEND_PRIVATE_KEY?.trim()
  const agentId = process.env.AGENT_ID?.trim()

  if (!rpc || !pk) {
    console.warn("[Reputation] SEPOLIA_RPC_URL or BACKEND_PRIVATE_KEY not set — skipping.")
    return
  }
  if (!agentId) {
    console.warn("[Reputation] AGENT_ID not set — skipping receipt post.")
    return
  }

  // ── 1. Build execution log ────────────────────────────────────────────────
  const log = {
    timestamp:        new Date().toISOString(),
    userAddress:      params.userEVMAddress,
    depositAmountUSDC: params.amountUSDC,
    sepoliaTxHash:    params.sepoliaTxHash,
    flowTimestamp:    params.flowTimestamp,
    status:           "success",
  }

  // ── 2. Pin to IPFS ────────────────────────────────────────────────────────
  const ipfsUri = await pinJsonToIpfs(log, `napfi-receipt-${Date.now()}.json`)
  const cid     = ipfsUri.split("/ipfs/")[1] ?? ipfsUri

  // ── 3. Compute content hash ───────────────────────────────────────────────
  const feedbackHash = keccak256(toUtf8Bytes(JSON.stringify(log)))

  // ── 4. Call ReputationRegistry.giveFeedback() ─────────────────────────────
  const cfg      = loadContractsConfig()
  const provider = new JsonRpcProvider(rpc, cfg.chainId)
  const signer   = new Wallet(pk, provider)
  const repAbi   = loadReputationRegistryAbi()
  const registry = new Contract(cfg.erc8004ReputationRegistry, repAbi, signer)

  const fn = registry.getFunction("giveFeedback")
  const tx = await fn(
    BigInt(agentId),          // agentId
    BigInt(100),              // value  (positive score)
    BigInt(0),                // valueDecimals
    "deposit_executed",       // tag1
    "success",                // tag2
    cfg.encryptedVault,       // endpoint  (vault address as context)
    `ipfs://${cid}`,          // feedbackURI
    feedbackHash              // feedbackHash (bytes32)
  )

  const receipt = await tx.wait()
  if (!receipt) throw new Error("giveFeedback receipt missing")

  console.log(
    `[Reputation] Receipt posted | tx: ${receipt.hash} | ipfs: ipfs://${cid}`
  )
}
