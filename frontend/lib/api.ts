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

function isNetworkFetchFailure(e: unknown): boolean {
  if (e instanceof TypeError) return true
  if (e instanceof Error && /failed to fetch/i.test(e.message)) return true
  return false
}

function networkFailureHelp(): string {
  const base = getApiBaseUrl() || "(NEXT_PUBLIC_API_BASE_URL not set)"
  return (
    `Cannot reach the NapFi API (${base}). ` +
    `Start the API in another terminal: cd server && npm run dev. ` +
    `If the site URL uses 127.0.0.1, open http://localhost:3000 instead (or add that origin to CORS_ORIGIN in server/.env).`
  )
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (isNetworkFetchFailure(e)) {
      throw new Error(networkFailureHelp())
    }
    throw e
  }
}

export type ApiFrequency = "daily" | "weekly" | "monthly"

export type SetupRequest = {
  userAddress: string
  goalAmountUSDC: number
  frequency: ApiFrequency
  yieldEnabled: boolean
}

export type FlowScheduleInfo = {
  initTxId?: string
  scheduleTxId?: string
  delaySeconds: number
  scheduledAtISO: string
  lastRescheduleAtISO?: string
  flowNetwork?: "testnet"
}

export type AutomationReceipt = {
  at: string
  amountUSDC: number
  sepoliaTxHash: string
  flowTimestamp: string
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
  flowSchedule?: FlowScheduleInfo
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
  flowSchedule?: FlowScheduleInfo
  automationReceipts?: AutomationReceipt[]
}

export async function postSetup(body: SetupRequest): Promise<SetupResponse> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set")
  }
  const res = await apiFetch(`${base}/api/setup`, {
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

export async function getReceipts(agentId: number): Promise<AutomationReceipt[]> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set")
  }
  const res = await apiFetch(`${base}/api/receipts/${agentId}`)
  const data = (await res.json().catch(() => ({}))) as {
    receipts?: AutomationReceipt[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error || `getReceipts failed (${res.status})`)
  }
  return data.receipts ?? []
}

export async function getAgent(userAddress: string): Promise<AgentResponse | null> {
  const base = getApiBaseUrl()
  if (!base) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not set")
  }
  const res = await apiFetch(`${base}/api/agent/${encodeURIComponent(userAddress)}`)
  if (res.status === 404) return null
  const data = (await res.json().catch(() => ({}))) as AgentResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `getAgent failed (${res.status})`)
  }
  return data
}

/** Thrown by demo helpers when the API returns a non-2xx status (check `.status`). */
export class ApiHttpError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiHttpError"
    this.status = status
  }
}

export type DemoScheduleResponse = {
  nextExecutionISO: string
  scheduleTxId: string
  initTxId?: string
  delaySeconds: number
  flowSchedule?: FlowScheduleInfo
}

export async function postDemoScheduleOneMinute(
  userAddress: string
): Promise<DemoScheduleResponse> {
  const base = getApiBaseUrl()
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set")
  const res = await apiFetch(`${base}/api/demo/schedule-one-minute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress }),
  })
  const data = (await res.json().catch(() => ({}))) as DemoScheduleResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new ApiHttpError(data.error || `Demo schedule failed (${res.status})`, res.status)
  }
  return data
}

export type DemoExecuteResponse = {
  sepoliaTxHash: string
  totalExecutions: number
  nextExecutionISO: string
}

export async function postDemoExecuteDeposit(
  userAddress: string
): Promise<DemoExecuteResponse> {
  const base = getApiBaseUrl()
  if (!base) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set")
  const res = await apiFetch(`${base}/api/demo/execute-deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress }),
  })
  const data = (await res.json().catch(() => ({}))) as DemoExecuteResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new ApiHttpError(data.error || `Demo execute failed (${res.status})`, res.status)
  }
  return data
}
