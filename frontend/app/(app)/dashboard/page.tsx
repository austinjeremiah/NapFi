"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, Zap, CheckCircle, ExternalLink, ChevronRight } from "lucide-react"
import Link from "next/link"
import { DotPattern } from "@/components/ui/dot-pattern"
import { ScrambleText } from "@/components/ui/scramble-text"

// ─── Placeholder data (replace with real contract/API calls) ─────────────────
const MOCK_BALANCE = "47.20"
const MOCK_AGENT = {
  name: "Your NapFi Agent",
  id: "0x4e61...8004",
  status: "Active" as "Active" | "Paused",
  nextExecution: "3 days",
  successfulRuns: 12,
}
const MOCK_GOAL = {
  amount: 10,
  frequency: "week",
  totalSaved: "120.40",
  since: "March 15, 2026",
  target: 500,
}
const MOCK_RECEIPTS = [
  { date: "Mar 27, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder1" },
  { date: "Mar 20, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder2" },
  { date: "Mar 13, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder3" },
  { date: "Mar 06, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder4" },
  { date: "Feb 27, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder5" },
]
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [balanceRevealed, setBalanceRevealed] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [fheExpanded, setFheExpanded] = useState(false)

  const revealBalance = async () => {
    setBalanceLoading(true)
    // TODO: call vault.balanceOf(userAddress) → instance.publicDecrypt([handle])
    await new Promise((r) => setTimeout(r, 1800))
    setBalanceLoading(false)
    setBalanceRevealed(true)
  }

  const progress = Math.min(
    (parseFloat(MOCK_GOAL.totalSaved) / MOCK_GOAL.target) * 100,
    100
  )

  return (
    <main className="relative min-h-screen bg-background px-4 py-12">
      <DotPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-30" />
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">

        {/* Page header */}
        <div className="border-l-2 border-foreground pl-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">NapFi / Dashboard</p>
          <h1 className="mt-1 font-pixel text-2xl font-bold text-foreground">
            <ScrambleText text="OVERVIEW" />
          </h1>
        </div>

        {/* ── Section 1: Balance ─────────────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Encrypted Vault Balance</p>
            <Lock size={14} className="text-muted-foreground" />
          </div>

          {!balanceRevealed ? (
            <div className="space-y-4">
              {balanceLoading ? (
                <div className="space-y-2">
                  <div className="h-12 w-48 animate-pulse bg-foreground/10" />
                  <p className="font-mono text-xs text-muted-foreground">Decrypting your balance...</p>
                </div>
              ) : (
                <>
                  <div className="select-none blur-sm font-mono text-5xl font-bold text-foreground">
                    $••••••
                  </div>
                  <button
                    onClick={revealBalance}
                    className="flex items-center gap-2 border border-foreground bg-foreground px-4 py-2 font-mono text-xs text-background transition-all hover:bg-transparent hover:text-foreground"
                  >
                    <Lock size={12} />
                    Tap to reveal your balance — only you can see this
                  </button>
                </>
              )}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <p className="font-mono text-5xl font-bold text-foreground">${MOCK_BALANCE}</p>
              <div className="flex items-center gap-2">
                <Lock size={11} className="text-muted-foreground" />
                <p className="font-mono text-xs text-muted-foreground">
                  Stored encrypted on-chain. Nobody else can see it.
                </p>
              </div>
            </motion.div>
          )}

          {/* How? expandable */}
          <div>
            <button
              onClick={() => setFheExpanded(!fheExpanded)}
              className="font-mono text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              How?
            </button>
            <AnimatePresence>
              {fheExpanded && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 font-mono text-xs leading-relaxed text-muted-foreground border-l border-border pl-3"
                >
                  Your balance is stored as a ciphertext on Sepolia using Zama&apos;s fhEVM — a version of the EVM where numbers stay encrypted even during computation. Only your wallet can authorize decryption.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Section 2: Agent status ────────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Agent Status</p>

          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="font-pixel text-lg font-bold text-foreground">{MOCK_AGENT.name}</p>
              <p className="font-mono text-xs text-muted-foreground">ID: {MOCK_AGENT.id}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  MOCK_AGENT.status === "Active" ? "bg-green-500" : "bg-yellow-400"
                }`}
              />
              <span className="font-mono text-base text-foreground">{MOCK_AGENT.status}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Next deposit</p>
              <p className="font-mono text-base text-foreground">In {MOCK_AGENT.nextExecution}</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Reputation</p>
              <p className="font-mono text-base text-foreground">{MOCK_AGENT.successfulRuns} successful executions</p>
            </div>
          </div>
        </div>

        {/* ── Section 3: Goal summary ────────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Savings Goal</p>

          <p className="font-pixel text-xl font-bold text-foreground">
            Saving {MOCK_GOAL.amount} USDC every {MOCK_GOAL.frequency}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Total saved</p>
              <p className="font-mono text-base text-foreground">${MOCK_GOAL.totalSaved}</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Running since</p>
              <p className="font-mono text-base text-foreground">{MOCK_GOAL.since}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>${MOCK_GOAL.totalSaved} saved</span>
              <span>Target ${MOCK_GOAL.target}</span>
            </div>
            <div className="h-1.5 w-full bg-border">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-foreground"
              />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{progress.toFixed(0)}% to goal</p>
          </div>
        </div>

        {/* ── Section 4: Recent receipts ─────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Recent Receipts</p>
            <Link
              href="/receipts"
              className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              See all <ChevronRight size={10} />
            </Link>
          </div>

          <div className="divide-y divide-border">
            {MOCK_RECEIPTS.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle size={13} className="text-green-500 shrink-0" />
                  <div>
                    <p className="font-mono text-base text-foreground">{r.action}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.date}</p>
                  </div>
                </div>
                <a
                  href={r.ipfs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View proof <ExternalLink size={10} />
                </a>
              </div>
            ))}
          </div>
        </div>

      </div>
    </main>
  )
}
