import { pinJsonWithLighthouse } from "./lighthouse.js"
import { pinJsonWithPinata } from "./pinata.js"

function ipfsErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * Prefer Lighthouse when LIGHTHOUSE_API_KEY is set; falls back to Pinata if Lighthouse
 * fails (e.g. trial expired) and PINATA_JWT is set. Otherwise Pinata only.
 */
export async function pinJsonToIpfs(
  content: Record<string, unknown>,
  name = "napfi-agent-registration.json"
): Promise<string> {
  const hasLh = Boolean(process.env.LIGHTHOUSE_API_KEY?.trim())
  const hasPinata = Boolean(process.env.PINATA_JWT?.trim())

  if (hasLh) {
    try {
      return await pinJsonWithLighthouse(content, name)
    } catch (e) {
      const msg = ipfsErrorMessage(e)
      if (hasPinata) {
        console.warn("[ipfs] Lighthouse upload failed, using Pinata:", msg)
        return pinJsonWithPinata(content, name)
      }
      throw new Error(
        `Lighthouse IPFS failed: ${msg}. ` +
          `Renew or upgrade Lighthouse, or add PINATA_JWT to server/.env (Pinata) as an alternative.`
      )
    }
  }

  if (hasPinata) {
    return pinJsonWithPinata(content, name)
  }

  throw new Error("Set LIGHTHOUSE_API_KEY or PINATA_JWT in server/.env")
}
