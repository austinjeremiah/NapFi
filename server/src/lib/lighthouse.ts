/**
 * Pin JSON to IPFS via Lighthouse (uploadText → CID).
 * Env: LIGHTHOUSE_API_KEY
 */
import lighthouse from "@lighthouse-web3/sdk"

export async function pinJsonWithLighthouse(
  content: Record<string, unknown>,
  name = "napfi-agent-registration.json"
): Promise<string> {
  const apiKey = process.env.LIGHTHOUSE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("LIGHTHOUSE_API_KEY is not set (Lighthouse dashboard → API key)")
  }

  const text = JSON.stringify(content)
  const response = await lighthouse.uploadText(text, apiKey, name)

  const hash = (response as { data?: { Hash?: string } }).data?.Hash
  if (!hash) {
    throw new Error("Lighthouse upload response missing data.Hash")
  }

  return `https://gateway.lighthouse.storage/ipfs/${hash}`
}