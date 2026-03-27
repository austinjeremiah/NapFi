"use client"

import { useState } from "react"
import { ScrambleText } from "@/components/ui/scramble-text"
import { DotPattern } from "@/components/ui/dot-pattern"
import { CheckCircle, ExternalLink, ChevronDown } from "lucide-react"

// ─── Placeholder data (replace with GET /api/receipts/:agentId) ──────────────
const MOCK_SUMMARY = {
  totalDeposits: 12,
  totalSaved: "120.40",
  trustScore: 94,
}

const MOCK_RECEIPTS = [
  { date: "Mar 27, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc1...def1", ipfs: "https://ipfs.io/ipfs/placeholder1" },
  { date: "Mar 20, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc2...def2", ipfs: "https://ipfs.io/ipfs/placeholder2" },
  { date: "Mar 13, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc3...def3", ipfs: "https://ipfs.io/ipfs/placeholder3" },
  { date: "Mar 06, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc4...def4", ipfs: "https://ipfs.io/ipfs/placeholder4" },
  { date: "Feb 27, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc5...def5", ipfs: "https://ipfs.io/ipfs/placeholder5" },
  { date: "Feb 20, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc6...def6", ipfs: "https://ipfs.io/ipfs/placeholder6" },
  { date: "Feb 13, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc7...def7", ipfs: "https://ipfs.io/ipfs/placeholder7" },
  { date: "Feb 06, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc8...def8", ipfs: "https://ipfs.io/ipfs/placeholder8" },
  { date: "Jan 30, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabc9...def9", ipfs: "https://ipfs.io/ipfs/placeholder9" },
  { date: "Jan 23, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabca...defa", ipfs: "https://ipfs.io/ipfs/placeholder10" },
  { date: "Jan 16, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabcb...defb", ipfs: "https://ipfs.io/ipfs/placeholder11" },
  { date: "Jan 09, 2026", action: "Scheduled Deposit", amount: "10 USDC", status: "Success", tx: "0xabcc...defc", ipfs: "https://ipfs.io/ipfs/placeholder12" },
]
const PAGE_SIZE = 20
// ─────────────────────────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const [visible, setVisible] = useState(PAGE_SIZE)

  const shown = MOCK_RECEIPTS.slice(0, visible)
  const hasMore = visible < MOCK_RECEIPTS.length

  return (
    <main className="relative min-h-screen bg-background px-4 py-12">
      <DotPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-30" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-8">

        {/* Header */}
        <div className="border-l-2 border-foreground pl-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">NapFi / Receipts</p>
          <h1 className="mt-1 font-pixel text-2xl font-bold text-foreground">
            <ScrambleText text="RECEIPT HISTORY" />
          </h1>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Deposits", value: `${MOCK_SUMMARY.totalDeposits}` },
            { label: "Total Saved", value: `$${MOCK_SUMMARY.totalSaved}` },
            { label: "Trust Score", value: `${MOCK_SUMMARY.trustScore}/100` },
          ].map((item) => (
            <div key={item.label} className="border border-border bg-background/95 p-5 space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{item.label}</p>
              <p className="font-mono text-2xl font-bold text-foreground">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        {MOCK_RECEIPTS.length === 0 ? (
          <div className="border border-border bg-background/95 p-10 text-center">
            <p className="font-mono text-sm text-muted-foreground">
              No executions yet. Your first deposit will run on your next scheduled date.
            </p>
          </div>
        ) : (
          <div className="border border-border bg-background/95">
            {/* Table header */}
            <div className="grid grid-cols-6 border-b border-border px-5 py-3">
              {["Date", "Action", "Amount", "Status", "Sepolia TX", "Log"].map((h) => (
                <p key={h} className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{h}</p>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-border">
              {shown.map((r, i) => (
                <div key={i} className="grid grid-cols-6 items-center px-5 py-4">
                  <p className="font-mono text-sm text-muted-foreground">{r.date}</p>
                  <p className="font-mono text-sm text-foreground">{r.action}</p>
                  <p className="font-mono text-sm text-foreground">{r.amount}</p>
                  <div className="flex items-center gap-2">
                    <CheckCircle size={13} className="text-green-500 shrink-0" />
                    <span className="font-mono text-sm text-foreground">{r.status}</span>
                  </div>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${r.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {r.tx} <ExternalLink size={10} />
                  </a>
                  <a
                    href={r.ipfs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View Log <ExternalLink size={10} />
                  </a>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="border-t border-border px-5 py-4">
                <button
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="flex items-center gap-2 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Load more <ChevronDown size={14} />
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  )
}
