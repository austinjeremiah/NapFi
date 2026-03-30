"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useWeb3Auth } from "@web3auth/modal/react"
import { format, parseISO } from "date-fns"
import { ScrambleText } from "@/components/ui/scramble-text"
import { DotPattern } from "@/components/ui/dot-pattern"
import { CheckCircle, ExternalLink, ChevronDown } from "lucide-react"
import { getAgent, type AgentResponse, type AutomationReceipt } from "@/lib/api"

const PAGE_SIZE = 20

export default function ReceiptsPage() {
  const { provider, isConnected } = useWeb3Auth()
  const [walletAddress, setWalletAddress] = useState("")
  const [agent, setAgent] = useState<AgentResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => {
    if (!provider || !isConnected) {
      setWalletAddress("")
      return
    }
    ;(provider.request({ method: "eth_accounts" }) as Promise<string[]>)
      .then((accounts) => {
        if (accounts?.[0]) setWalletAddress(accounts[0])
      })
      .catch(() => {})
  }, [provider, isConnected])

  useEffect(() => {
    if (!walletAddress) {
      setAgent(null)
      return
    }
    setLoading(true)
    setError(null)
    getAgent(walletAddress)
      .then(setAgent)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load agent")
        setAgent(null)
      })
      .finally(() => setLoading(false))
  }, [walletAddress])

  const receipts: AutomationReceipt[] = agent?.automationReceipts ?? []
  const totalSaved = receipts.reduce((s, r) => s + r.amountUSDC, 0)
  const shown = receipts.slice(0, visible)
  const hasMore = visible < receipts.length

  return (
    <main className="relative min-h-screen bg-background px-4 py-12">
      <DotPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-30" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8">

        <div className="border-l-2 border-foreground pl-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">NapFi / Receipts</p>
          <h1 className="mt-1 font-pixel text-2xl font-bold text-foreground">
            <ScrambleText text="RECEIPT HISTORY" />
          </h1>
        </div>

        {!isConnected || !walletAddress ? (
          <div className="border border-border bg-background/95 p-10 text-center space-y-3">
            <p className="font-mono text-sm text-muted-foreground">
              Connect your wallet to see automation receipts from the API.
            </p>
            <Link href="/dashboard" className="font-mono text-sm text-foreground underline">
              Go to dashboard
            </Link>
          </div>
        ) : loading ? (
          <p className="font-mono text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="font-mono text-sm text-red-500">{error}</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Automation runs", value: String(agent?.totalExecutions ?? receipts.length) },
                { label: "USDC (automation)", value: `$${totalSaved.toFixed(2)}` },
                { label: "Agent ID", value: agent ? String(agent.agentId) : "—" },
              ].map((item) => (
                <div key={item.label} className="border border-border bg-background/95 p-5 space-y-1">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{item.label}</p>
                  <p className="font-mono text-2xl font-bold text-foreground">{item.value}</p>
                </div>
              ))}
            </div>

            {receipts.length === 0 ? (
              <div className="border border-border bg-background/95 p-10 text-center">
                <p className="font-mono text-sm text-muted-foreground">
                  No executions yet. When Flow fires <code className="text-foreground">DepositTriggered</code>, the
                  server records the Sepolia vault tx here.
                </p>
              </div>
            ) : (
              <div className="border border-border bg-background/95">
                <div className="grid grid-cols-5 border-b border-border px-5 py-3 gap-2">
                  {["Date", "Action", "Amount", "Flow time", "Sepolia TX"].map((h) => (
                    <p key={h} className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      {h}
                    </p>
                  ))}
                </div>

                <div className="divide-y divide-border">
                  {shown.map((r, i) => {
                    const shortTx = `${r.sepoliaTxHash.slice(0, 10)}…${r.sepoliaTxHash.slice(-6)}`
                    return (
                      <div key={`${r.sepoliaTxHash}-${i}`} className="grid grid-cols-5 items-center gap-2 px-5 py-4">
                        <p className="font-mono text-sm text-muted-foreground">
                          {format(parseISO(r.at), "MMM d, yyyy HH:mm")}
                        </p>
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle size={13} className="text-green-500 shrink-0" />
                          <span className="font-mono text-sm text-foreground truncate">Encrypted deposit</span>
                        </div>
                        <p className="font-mono text-sm text-foreground">{r.amountUSDC} USDC</p>
                        <p className="font-mono text-[11px] text-muted-foreground truncate" title={r.flowTimestamp}>
                          {r.flowTimestamp || "—"}
                        </p>
                        <a
                          href={`https://sepolia.etherscan.io/tx/${r.sepoliaTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {shortTx} <ExternalLink size={10} />
                        </a>
                      </div>
                    )
                  })}
                </div>

                {hasMore && (
                  <div className="border-t border-border px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setVisible((v) => v + PAGE_SIZE)}
                      className="flex items-center gap-2 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Load more <ChevronDown size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </main>
  )
}
