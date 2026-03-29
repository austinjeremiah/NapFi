declare module "@onflow/fcl" {
  export function config(cfg?: Record<string, string>): void
  export function events(eventType: string): {
    subscribe: (cb: (event: { data: Record<string, unknown>; type: string }) => void) => () => void
  }
  export function mutate(opts: {
    cadence: string
    args?: (arg: typeof fcl_arg, t: typeof fcl_t) => unknown[]
    proposer?: unknown
    payer?: unknown
    authorizations?: unknown[]
    limit?: number
  }): Promise<string>
  export function tx(txId: string): {
    onceSealed: () => Promise<{ status: number; events: unknown[] }>
  }
  export const arg: (value: unknown, type: unknown) => unknown
  export const t: {
    String: unknown
    UFix64: unknown
    UInt64: unknown
    Address: unknown
    Bool: unknown
    UInt8: unknown
    Optional: (t: unknown) => unknown
  }
}
