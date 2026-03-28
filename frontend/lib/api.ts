/**
 * NapFi backend (Express). Set NEXT_PUBLIC_API_BASE_URL in .env.local (e.g. http://localhost:3001).
 */
export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL
  if (!base?.trim()) {
    return ""
  }
  return base.replace(/\/$/, "")
}

export type ApiFrequency = "daily" | "weekly" | "monthly"

export type SetupRequest = {
  userAddress: string
  goalAmountUSDC: number
  frequency: ApiFrequency
  yieldEnabled: boolean
}

export type SetupResponse = {
  agentId: number
  vaultAddress: string
  nextExecutionISO: string
  ipfsUri?: string
  txHashes?: {
    register: string
    setAgentWallet: string
    registerUserAgent: string
  }
  updated?: boolean
  note?: string
}

export type AgentResponse = {
  agentId: number
  vaultAddress: string
  nextExecutionISO: string
  totalExecutions: number
  status: "active" | "paused"
  goalAmountUSDC: number
  frequency: ApiFrequency
  yieldEnabled: boolean
  ipfsUri?: string
  txHashes?: {
    register: string
    setAgentWallet: string
    registerUserAgent: string
  }
  chainOnly?: boolean
  note?: string
}

export async function postSetup(body: SetupRequest): Promise<SetupResponse> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set")
  }
  const res = await fetch(`${base}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as SetupResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `Setup failed (${res.status})`)
  }
  return data
}

export async function getAgent(userAddress: string): Promise<AgentResponse | null> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set")
  }
  const res = await fetch(`${base}/api/agent/${encodeURIComponent(userAddress)}`)
  if (res.status === 404) return null
  const data = (await res.json().catch(() => ({}))) as AgentResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `getAgent failed (${res.status})`)
  }
  return data
}
