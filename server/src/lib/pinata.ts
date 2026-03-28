/**
 * Pin JSON to IPFS via Pinata (JWT v3).
 * Env: PINATA_JWT
 */
export async function pinJsonWithPinata(content: Record<string, unknown>, name = "napfi-agent.json"): Promise<string> {
  const jwt = process.env.PINATA_JWT?.trim()
  if (!jwt) {
    throw new Error("PINATA_JWT is not set (Pinata → API keys → JWT)")
  }

  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: { name },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Pinata pin failed (${res.status}): ${text.slice(0, 500)}`)
  }

  const data = (await res.json()) as { IpfsHash: string }
  if (!data.IpfsHash) {
    throw new Error("Pinata response missing IpfsHash")
  }

  return `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`
}
