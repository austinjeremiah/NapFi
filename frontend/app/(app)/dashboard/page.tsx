"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, CheckCircle, ExternalLink, ChevronRight } from "lucide-react"
import Link from "next/link"
import { useWeb3Auth } from "@web3auth/modal/react"
import { formatDistanceToNow, parseISO } from "date-fns"
import { DotPattern } from "@/components/ui/dot-pattern"
import { ScrambleText } from "@/components/ui/scramble-text"
import { getAgent, type AgentResponse, type ApiFrequency } from "@/lib/api"

const MOCK_BALANCE = "47.20"

function freqLabel(f: ApiFrequency): string {
  if (f === "daily") return "day"
  if (f === "weekly") return "week"
  return "month"
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

const MOCK_RECEIPTS = [
  { date: "Mar 27, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder1" },
  { date: "Mar 20, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder2" },
  { date: "Mar 13, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder3" },
  { date: "Mar 06, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder4" },
  { date: "Feb 27, 2026", action: "Deposit 10 USDC", ipfs: "https://ipfs.io/ipfs/placeholder5" },
]

type CachedSetup = {
  agentId: number
  vaultAddress: string
  ipfsUri?: string
  txHashes?: AgentResponse["txHashes"]
}

function loadCachedSetup(address: string): CachedSetup | null {
  try {
    const raw = localStorage.getItem(`napfi_setup_${address.toLowerCase()}`)
    return raw ? (JSON.parse(raw) as CachedSetup) : null
  } catch {
    return null
  }
}

export default function DashboardPage() {
  const { provider, isConnected } = useWeb3Auth()
  const [walletAddress, setWalletAddress] = useState("")
  const [agent, setAgent] = useState<AgentResponse | null>(null)
  const [agentLoading, setAgentLoading] = useState(true)
  const [agentError, setAgentError] = useState<string | null>(null)

  const [balanceRevealed, setBalanceRevealed] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [fheExpanded, setFheExpanded] = useState(false)

  useEffect(() => {
    if (!provider || !isConnected) {
      setWalletAddress("")
      setAgent(null)
      setAgentLoading(false)
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
      setAgentLoading(false)
      return
    }
    setAgentLoading(true)
    setAgentError(null)
    getAgent(walletAddress)
      .then((row) => {
        const cached = loadCachedSetup(walletAddress)
        const merged: AgentResponse | null = row
          ? {
              ...row,
              ipfsUri: row.ipfsUri ?? cached?.ipfsUri,
              txHashes: row.txHashes ?? cached?.txHashes,
            }
          : null

        if (merged?.txHashes) {
          console.log("\n✅ NapFi Agent Transactions")
          console.log("Agent ID       :", merged.agentId)
          console.log("Vault          :", merged.vaultAddress)
          console.log("IPFS URI       :", merged.ipfsUri)
          console.log(
            "TX register    :",
            `https://sepolia.etherscan.io/tx/${merged.txHashes.register}`
          )
          console.log(
            "TX setWallet   :",
            `https://sepolia.etherscan.io/tx/${merged.txHashes.setAgentWallet}`
          )
          console.log(
            "TX registerUA  :",
            `https://sepolia.etherscan.io/tx/${merged.txHashes.registerUserAgent}`
          )
        }

        setAgent(merged)
      })
      .catch((e) => {
        setAgentError(e instanceof Error ? e.message : "Failed to load agent")
        setAgent(null)
      })
      .finally(() => setAgentLoading(false))
  }, [walletAddress])

  const revealBalance = async () => {
    setBalanceLoading(true)
    await new Promise((r) => setTimeout(r, 1800))
    setBalanceLoading(false)
    setBalanceRevealed(true)
  }

  const nextDepositLabel = agent?.nextExecutionISO
    ? formatDistanceToNow(parseISO(agent.nextExecutionISO), { addSuffix: true })
    : "—"

  const target = 500
  const totalSavedNum = agent?.goalAmountUSDC ? agent.goalAmountUSDC * 3 : 0
  const progress = Math.min((totalSavedNum / target) * 100, 100)

  return (
    <main className="relative min-h-screen bg-background px-4 py-12">
      <DotPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-30" />
      <div className="relative z-10 mx-auto max-w-6xl space-y-6">

        <div className="border-l-2 border-foreground pl-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">NapFi / Dashboard</p>
          <h1 className="mt-1 font-pixel text-2xl font-bold text-foreground">
            <ScrambleText text="OVERVIEW" />
          </h1>
        </div>

        {!isConnected && (
          <p className="font-mono text-sm text-muted-foreground border border-border p-4">
            Connect your wallet to load your agent and vault info.
          </p>
        )}

        {agentError && (
          <p className="font-mono text-sm text-destructive border border-destructive/30 p-4">{agentError}</p>
        )}

        {agent?.chainOnly && agent.note && (
          <p className="font-mono text-xs text-muted-foreground border border-border p-3">{agent.note}</p>
        )}

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

          {agentLoading ? (
            <p className="font-mono text-sm text-muted-foreground">Loading agent…</p>
          ) : agent ? (
            <>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="font-pixel text-lg font-bold text-foreground">Your NapFi Agent</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    ERC-8004 ID: <span className="text-foreground">{String(agent.agentId)}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    Vault:{" "}
                    <a
                      href={`https://sepolia.etherscan.io/address/${agent.vaultAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline underline-offset-2"
                    >
                      {shortAddr(agent.vaultAddress)}
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      agent.status === "active" ? "bg-green-500" : "bg-yellow-400"
                    }`}
                  />
                  <span className="font-mono text-base text-foreground capitalize">{agent.status}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Next deposit</p>
                  <p className="font-mono text-base text-foreground">{nextDepositLabel}</p>
                </div>
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Reputation</p>
                  <p className="font-mono text-base text-foreground">
                    {agent.totalExecutions} successful executions
                  </p>
                </div>
              </div>

              {/* Tx hashes inline in agent status */}
              {agent.txHashes && (
                <div className="border-t border-border pt-4 space-y-2">
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
                    On-chain Transactions
                  </p>
                  {[
                    { label: "Register (ERC-8004)", hash: agent.txHashes.register },
                    { label: "Set Agent Wallet",    hash: agent.txHashes.setAgentWallet },
                    { label: "Register User Agent", hash: agent.txHashes.registerUserAgent },
                  ].map(({ label, hash }) => (
                    <div key={hash} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
                        <p className="font-mono text-[11px] text-foreground truncate">{hash}</p>
                      </div>
                      <a
                        href={`https://sepolia.etherscan.io/tx/${hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View <ExternalLink size={9} />
                      </a>
                    </div>
                  ))}
                  {agent.ipfsUri && (
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">IPFS Metadata</p>
                        <p className="font-mono text-[11px] text-foreground truncate">{agent.ipfsUri}</p>
                      </div>
                      <a
                        href={agent.ipfsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View <ExternalLink size={9} />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">
              No agent yet.{" "}
              <Link href="/onboarding" className="text-foreground underline">
                Complete setup
              </Link>
            </p>
          )}
        </div>

        {/* ── Section 3: Goal summary ────────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Savings Goal</p>

          {agent && agent.goalAmountUSDC > 0 ? (
            <>
              <p className="font-pixel text-xl font-bold text-foreground">
                Saving {agent.goalAmountUSDC} USDC every {freqLabel(agent.frequency)}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Yield optimisation: {agent.yieldEnabled ? "On" : "Off"}
              </p>
            </>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">
              Goal details appear after you run setup from this session, or set them in Settings.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Total saved</p>
              <p className="font-mono text-base text-foreground">${totalSavedNum.toFixed(2)}</p>
            </div>
            <div className="space-y-1">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Progress</p>
              <p className="font-mono text-base text-foreground">{progress.toFixed(0)}% to ${target}</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>${totalSavedNum.toFixed(2)} saved</span>
              <span>Target ${target}</span>
            </div>
            <div className="h-1.5 w-full bg-border">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-foreground"
              />
            </div>
          </div>
        </div>

        {/* ── Section 4: On-chain transactions ──────────────────────── */}
        {agent?.txHashes && (
          <div className="border border-border bg-background/95 p-6 space-y-4">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Agent Creation Transactions
            </p>
            <div className="divide-y divide-border">
              {[
                { label: "Register (ERC-8004 mint)", hash: agent.txHashes.register },
                { label: "Set Agent Wallet", hash: agent.txHashes.setAgentWallet },
                { label: "Register User Agent", hash: agent.txHashes.registerUserAgent },
              ].map(({ label, hash }) => (
                <div key={hash} className="flex items-center justify-between py-3 gap-4">
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-mono text-xs text-foreground">{label}</p>
                    <p className="font-mono text-[10px] text-muted-foreground truncate">{hash}</p>
                  </div>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Etherscan <ExternalLink size={10} />
                  </a>
                </div>
              ))}
            </div>
            {agent.ipfsUri && (
              <div className="border-t border-border pt-3 flex items-center justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <p className="font-mono text-xs text-foreground">Agent Metadata (IPFS)</p>
                  <p className="font-mono text-[10px] text-muted-foreground truncate">{agent.ipfsUri}</p>
                </div>
                <a
                  href={agent.ipfsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View <ExternalLink size={10} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── Section 5: Recent receipts ─────────────────────────────── */}
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
