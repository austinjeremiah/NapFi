"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Lock, CheckCircle, ExternalLink, ChevronRight, Wallet } from "lucide-react"
import Link from "next/link"
import { useWeb3Auth } from "@web3auth/modal/react"
import { format, parseISO } from "date-fns"
import { DotPattern } from "@/components/ui/dot-pattern"
import { ScrambleText } from "@/components/ui/scramble-text"
import {
  getAgent,
  ApiHttpError,
  postDemoScheduleOneMinute,
  postDemoExecuteDeposit,
  getFlowDepositPending,
  postFlowDepositComplete,
  type AgentResponse,
  type ApiFrequency,
  type AutomationReceipt,
} from "@/lib/api"
import type { Eip1193Provider } from "ethers"
import { VAULT_ADDRESS } from "@/lib/contract-defs"
import {
  depositUsdcFromWallet,
  fetchDecryptedUsdcBalance,
  getVaultUsdcBalance,
  getWalletUsdcBalance,
  withdrawUsdcFromVault,
  getVaultLPInfo,
  type VaultLPInfo,
} from "@/lib/contracts"


function freqLabel(f: ApiFrequency): string {
  if (f === "daily") return "day"
  if (f === "weekly") return "week"
  return "month"
}

function freqChallengeLabel(f: ApiFrequency): string {
  if (f === "daily") return "Daily"
  if (f === "weekly") return "Weekly"
  return "Monthly"
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function flowscanTxUrl(txId: string) {
  return `https://flowscan.org/testnet/transaction/${txId}`
}

/** Live countdown until target (updates every second from parent). */
function formatCountdownTo(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return "Due now"
  const totalSec = Math.floor(ms / 1000)
  const days = Math.floor(totalSec / 86_400)
  const h = Math.floor((totalSec % 86_400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (days > 0) return `${days}d ${h}h ${m}m ${s}s`
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

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
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)

  const [walletUsdc, setWalletUsdc] = useState<string | null>(null)
  const [plainVaultUsdc, setPlainVaultUsdc] = useState<string | null>(null)
  const [usdcLoading, setUsdcLoading] = useState(false)
  const [depositAmount, setDepositAmount] = useState("10")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [depositBusy, setDepositBusy] = useState(false)
  const [withdrawBusy, setWithdrawBusy] = useState(false)
  const [usdcActionError, setUsdcActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [balanceRevealed, setBalanceRevealed] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState("")
  const [balance, setBalance] = useState<number | null>(null)
  const [fheExpanded, setFheExpanded] = useState(false)

  const [demoScheduleBusy, setDemoScheduleBusy] = useState(false)
  const [demoScheduleError, setDemoScheduleError] = useState<string | null>(null)
  const [demoSimulatedNote, setDemoSimulatedNote] = useState<string | null>(null)
  const [demoFallbackUntil, setDemoFallbackUntil] = useState<number | null>(null)
  /** After successful Demo 1m (Flow path): force UI to exactly 60s from click. */
  const [demoOneMinuteUntil, setDemoOneMinuteUntil] = useState<number | null>(null)

  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const hasTarget =
      Boolean(agent?.nextExecutionISO) ||
      demoFallbackUntil != null ||
      demoOneMinuteUntil != null
    if (!hasTarget) return
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [agent?.nextExecutionISO, demoFallbackUntil, demoOneMinuteUntil])

  const mergeCachedAgent = useCallback(
    (row: AgentResponse | null): AgentResponse | null => {
      if (!row || !walletAddress) return row
      const cached = loadCachedSetup(walletAddress)
      return {
        ...row,
        ipfsUri: row.ipfsUri ?? cached?.ipfsUri,
        txHashes: row.txHashes ?? cached?.txHashes,
      }
    },
    [walletAddress]
  )

  const refreshAgent = useCallback(async () => {
    if (!walletAddress) return
    const row = await getAgent(walletAddress)
    setAgent(mergeCachedAgent(row))
  }, [walletAddress, mergeCachedAgent])

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
        const merged = mergeCachedAgent(row)

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
  }, [walletAddress, mergeCachedAgent])

  const refreshUsdcBalances = useCallback(() => {
    if (!walletAddress) {
      setWalletUsdc(null)
      setPlainVaultUsdc(null)
      return
    }
    setUsdcLoading(true)
    Promise.all([
      getWalletUsdcBalance(walletAddress).catch(() => "—"),
      getVaultUsdcBalance(walletAddress).catch(() => "—"),
    ])
      .then(([w, v]) => {
        setWalletUsdc(w)
        setPlainVaultUsdc(v)
      })
      .finally(() => setUsdcLoading(false))
  }, [walletAddress])

  useEffect(() => {
    refreshUsdcBalances()
  }, [refreshUsdcBalances])

  // ── Uniswap v3 LP info ──
  const [lpInfo, setLpInfo] = useState<VaultLPInfo | null>(null)
  const [lpLoading, setLpLoading] = useState(false)

  const refreshLpInfo = useCallback(() => {
    if (!walletAddress) {
      setLpInfo(null)
      return
    }
    setLpLoading(true)
    getVaultLPInfo(walletAddress)
      .then(setLpInfo)
      .catch(() => setLpInfo(null))
      .finally(() => setLpLoading(false))
  }, [walletAddress])

  useEffect(() => {
    refreshLpInfo()
    const id = window.setInterval(refreshLpInfo, 15_000)
    return () => window.clearInterval(id)
  }, [refreshLpInfo])

  useEffect(() => {
    if (demoFallbackUntil == null || !walletAddress) return
    const ms = Math.max(0, demoFallbackUntil - Date.now())
    const t = window.setTimeout(() => {
      setDemoFallbackUntil(null)
      setDemoSimulatedNote(null)
      void postDemoExecuteDeposit(walletAddress)
        .then(() => {
          void refreshAgent()
          refreshUsdcBalances()
          refreshLpInfo()
        })
        .catch((e) => {
          setDemoScheduleError(e instanceof Error ? e.message : String(e))
        })
    }, ms)
    return () => window.clearTimeout(t)
  }, [demoFallbackUntil, walletAddress, refreshAgent, refreshUsdcBalances])

  const revealBalance = async () => {
    if (!provider || !walletAddress) return
    setBalanceLoading(true)
    setBalanceError("")
    try {
      // `fetchDecryptedUsdcBalance`: hasBalance → getBalanceHandle on VAULT_ADDRESS then EncryptedVault; decryptBalance + optional makeBalanceDecryptable
      const cleartext = await fetchDecryptedUsdcBalance(walletAddress, provider as Eip1193Provider)
      setBalance(cleartext)
      setBalanceRevealed(true)
    } catch (e) {
      console.error("[revealBalance]", e)
      setBalanceError("Could not decrypt balance. Try again.")
    } finally {
      setBalanceLoading(false)
    }
  }

  const nextDepositTargetMs = useMemo(() => {
    if (demoOneMinuteUntil != null) return demoOneMinuteUntil
    if (demoFallbackUntil != null) return demoFallbackUntil
    if (!agent?.nextExecutionISO) return null
    return parseISO(agent.nextExecutionISO).getTime()
  }, [agent?.nextExecutionISO, demoFallbackUntil, demoOneMinuteUntil])

  const isDemoCountdown =
    demoOneMinuteUntil != null || demoFallbackUntil != null

  const nextDepositCountdown = useMemo(() => {
    if (nextDepositTargetMs == null) return "—"
    const target = new Date(nextDepositTargetMs)
    const now = new Date(nowMs)
    if (target.getTime() <= now.getTime()) {
      if (isDemoCountdown) return "Due now"
      return "Overdue · waiting for Flow on-chain"
    }
    return formatCountdownTo(target, now)
  }, [nextDepositTargetMs, nowMs, isDemoCountdown])

  const showFlowOverdueHint = useMemo(() => {
    if (nextDepositTargetMs == null) return false
    if (isDemoCountdown) return false
    return nowMs >= nextDepositTargetMs
  }, [nextDepositTargetMs, nowMs, isDemoCountdown])

  const nextDepositAbsolute = useMemo(() => {
    if (nextDepositTargetMs == null) return null
    return format(new Date(nextDepositTargetMs), "MMM d, yyyy · HH:mm")
  }, [nextDepositTargetMs])

  /** When Flow demo timer hits 0, refresh agent + balances (listener deposits on Sepolia). */
  useEffect(() => {
    if (demoOneMinuteUntil == null) return
    if (nowMs < demoOneMinuteUntil) return
    setDemoOneMinuteUntil(null)
    setDemoSimulatedNote(null)
    void refreshAgent()
    refreshUsdcBalances()
    refreshLpInfo()
  }, [nowMs, demoOneMinuteUntil, refreshAgent, refreshUsdcBalances, refreshLpInfo])

  const handleDemoOneMinute = async () => {
    if (!walletAddress) return
    setDemoScheduleBusy(true)
    setDemoScheduleError(null)
    setDemoSimulatedNote(null)
    setDemoFallbackUntil(null)
    setDemoOneMinuteUntil(null)
    try {
      await postDemoScheduleOneMinute(walletAddress)
      setDemoOneMinuteUntil(Date.now() + 60_000)
      setDemoSimulatedNote(
        "Demo: 1:00 until Flow fires → then Sepolia encrypted deposit (same as production)."
      )
      await refreshAgent()
    } catch (e) {
      if (e instanceof ApiHttpError) {
        if (e.status === 503) {
          setDemoFallbackUntil(Date.now() + 60_000)
          setDemoSimulatedNote(
            "Flow not configured — at 0:00 the API runs the Sepolia encrypted deposit (demo)."
          )
        } else {
          // 403/422/500 and real 404 (wrong URL) — show API message
          setDemoScheduleError(e.message)
        }
      } else {
        setDemoScheduleError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setDemoScheduleBusy(false)
    }
  }

  const target = 500
  const totalSavedNum = agent?.goalAmountUSDC ? agent.goalAmountUSDC * 3 : 0
  const progress = Math.min((totalSavedNum / target) * 100, 100)

  const vaultMismatch =
    Boolean(agent?.vaultAddress) &&
    agent!.vaultAddress.toLowerCase() !== VAULT_ADDRESS.toLowerCase()

  const handleDepositUsdc = async () => {
    if (!provider || !walletAddress) return
    const n = Number(depositAmount)
    if (!Number.isFinite(n) || n <= 0) {
      setUsdcActionError("Enter a positive USDC amount.")
      return
    }
    setUsdcActionError(null)
    setDepositBusy(true)
    try {
      await depositUsdcFromWallet(provider as never, n)
      refreshUsdcBalances()
      refreshLpInfo()
      setDepositAmount(String(n))
    } catch (e) {
      setUsdcActionError(e instanceof Error ? e.message : "Deposit failed")
    } finally {
      setDepositBusy(false)
    }
  }

  const handleWithdrawUsdc = async () => {
    if (!provider || !walletAddress) return
    const n = Number(withdrawAmount)
    if (!Number.isFinite(n) || n <= 0) {
      setUsdcActionError("Enter a positive USDC amount to withdraw.")
      return
    }
    setUsdcActionError(null)
    setWithdrawBusy(true)
    try {
      await withdrawUsdcFromVault(provider as never, n)
      refreshUsdcBalances()
      refreshLpInfo()
      setWithdrawAmount("")
    } catch (e) {
      setUsdcActionError(e instanceof Error ? e.message : "Withdraw failed")
    } finally {
      setWithdrawBusy(false)
    }
  }

  // ── Flow auto-deposit: poll for queued deposits, call depositUsdcFromWallet (same as Deposit button) ──

  const flowDepositBusyRef = useRef(false)
  const completedFlowIdsRef = useRef(new Set<string>())

  const tryConsumeQueuedFlowDeposit = useCallback(async () => {
    if (!walletAddress || !provider) return
    if (flowDepositBusyRef.current) return
    flowDepositBusyRef.current = true
    try {
      const { pending } = await getFlowDepositPending(walletAddress)
      if (!pending) return
      if (completedFlowIdsRef.current.has(pending.id)) return

      const scheduledUsdc = pending.amountUSDC
      console.log(
        `[Flow Auto] Depositing ${scheduledUsdc} USDC from embedded wallet (same as manual Deposit button)…`
      )

      const { txHash } = await depositUsdcFromWallet(
        provider as never,
        scheduledUsdc
      )

      console.log(`[Flow Auto] USDC deposit confirmed: ${txHash}`)

      await postFlowDepositComplete({
        id: pending.id,
        userAddress: walletAddress,
        sepoliaTxHash: txHash,
      })

      completedFlowIdsRef.current.add(pending.id)
      console.log(`[Flow Auto] Flow deposit complete id=${pending.id}`)
      refreshUsdcBalances()
      refreshLpInfo()
      void refreshAgent()
    } catch (e) {
      console.error("[Flow Auto] Error:", e)
    } finally {
      flowDepositBusyRef.current = false
    }
  }, [walletAddress, provider, refreshUsdcBalances, refreshLpInfo, refreshAgent])

  useEffect(() => {
    if (!walletAddress || !provider) return
    void tryConsumeQueuedFlowDeposit()
    const id = window.setInterval(() => {
      void tryConsumeQueuedFlowDeposit()
    }, 2500)
    return () => window.clearInterval(id)
  }, [walletAddress, provider, tryConsumeQueuedFlowDeposit])

  const copyAddress = () => {
    if (!walletAddress) return
    void navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

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

        {vaultMismatch && (
          <div className="border border-yellow-500/50 bg-yellow-500/10 p-4 font-mono text-xs text-foreground space-y-2">
            <p className="uppercase tracking-widest text-yellow-600 dark:text-yellow-400">
              Registry vault ≠ USDC vault
            </p>
            <p className="text-muted-foreground">
              Agent registry points to{" "}
              <span className="text-foreground">{shortAddr(agent?.vaultAddress ?? "")}</span>.
              USDC deposit/withdraw uses the NapFi vault{" "}
              <span className="text-foreground">{shortAddr(VAULT_ADDRESS)}</span> (Uniswap v3 LP + Zama encrypted balances).
            </p>
          </div>
        )}

        {/* ── Wallet + Sepolia USDC ─────────────────────────────────── */}
        {isConnected && walletAddress && (
          <div className="border border-border bg-background/95 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Wallet &amp; USDC (Sepolia)
              </p>
              <Wallet size={14} className="text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Your address</p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`https://sepolia.etherscan.io/address/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-foreground underline underline-offset-2 break-all"
                >
                  {walletAddress}
                </a>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-wider hover:border-foreground transition-colors"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  Wallet USDC
                </p>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {usdcLoading ? "…" : walletUsdc ?? "—"}{" "}
                  <span className="text-sm font-normal text-muted-foreground">USDC</span>
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  In NapFi USDC vault
                </p>
                <p className="font-mono text-2xl font-bold text-foreground">
                  {usdcLoading ? "…" : plainVaultUsdc ?? "—"}{" "}
                  <span className="text-sm font-normal text-muted-foreground">USDC</span>
                </p>
              </div>
            </div>

            {/* ── Uniswap v3 LP Yield ────────────────────────── */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Uniswap v3 LP Yield (Sepolia)
                </p>
                <a
                  href={`https://sepolia.etherscan.io/address/${VAULT_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  Vault <ExternalLink size={10} />
                </a>
              </div>

              {lpLoading && !lpInfo ? (
                <p className="font-mono text-xs text-muted-foreground">Loading LP data…</p>
              ) : lpInfo ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                        Vault Total
                      </p>
                      <p className="font-mono text-lg font-bold text-foreground">
                        {lpInfo.totalSharesUsdc}{" "}
                        <span className="text-xs font-normal text-muted-foreground">USDC</span>
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                        Your Shares
                      </p>
                      <p className="font-mono text-lg font-bold text-foreground">
                        {lpInfo.userSharesUsdc}{" "}
                        <span className="text-xs font-normal text-muted-foreground">USDC</span>
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground">
                        {lpInfo.userSharesBps}% of vault
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                        LP Position
                      </p>
                      <p className="font-mono text-lg font-bold text-foreground">
                        #{lpInfo.positionTokenId}
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground">
                        USDC/WETH 0.3%
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                        Liquidity
                      </p>
                      <p className="font-mono text-lg font-bold text-green-500">
                        {lpInfo.liquidity !== "0" ? lpInfo.liquidity : "—"}
                      </p>
                      <p className="font-mono text-[9px] text-muted-foreground">
                        Uniswap v3 pool
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-border/50 pt-3 mt-1">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                      Uncollected Fees (real yield from swaps)
                    </p>
                    <div className="flex items-baseline gap-6">
                      <p className="font-mono text-lg font-bold text-green-500">
                        {lpInfo.feesUsdc}{" "}
                        <span className="text-xs font-normal text-muted-foreground">USDC</span>
                      </p>
                      <p className="font-mono text-lg font-bold text-green-500">
                        {lpInfo.feesWeth}{" "}
                        <span className="text-xs font-normal text-muted-foreground">WETH</span>
                      </p>
                    </div>
                    <p className="font-mono text-[9px] text-muted-foreground mt-1">
                      Earned from 0.3% swap fees. Collected automatically on withdraw.
                    </p>
                  </div>
                </>
              ) : (
                <p className="font-mono text-xs text-muted-foreground">
                  Connect wallet to view LP yield data.
                </p>
              )}
            </div>

            {usdcActionError && (
              <p className="font-mono text-xs text-destructive border border-destructive/30 p-3">{usdcActionError}</p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-4">
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Deposit USDC</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="flex-1 border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-foreground"
                  />
                  <button
                    type="button"
                    disabled={depositBusy || !provider}
                    onClick={handleDepositUsdc}
                    className="border border-foreground bg-foreground px-4 py-2 font-mono text-xs text-background hover:bg-transparent hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {depositBusy ? "Signing…" : "Deposit"}
                  </button>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Approve + deposit into {shortAddr(VAULT_ADDRESS)} on Sepolia.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Withdraw USDC</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Amount"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="flex-1 border border-border bg-transparent px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-foreground"
                  />
                  <button
                    type="button"
                    disabled={withdrawBusy || !provider}
                    onClick={handleWithdrawUsdc}
                    className="border border-border px-4 py-2 font-mono text-xs text-foreground hover:border-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {withdrawBusy ? "Signing…" : "Withdraw"}
                  </button>
                </div>
              </div>
            </div>
          </div>
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
              <p className="font-mono text-5xl font-bold text-foreground">
                {balance !== null ? `$${balance.toFixed(2)}` : "$0.00"}
              </p>
              {balanceError && (
                <p className="font-mono text-xs text-red-500">{balanceError}</p>
              )}
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
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                      Next deposit
                    </p>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => void handleDemoOneMinute()}
                        disabled={demoScheduleBusy || agentLoading}
                        className="text-left font-mono border border-border px-2 py-1.5 rounded hover:bg-muted/40 disabled:opacity-40 transition-colors leading-tight"
                        title="Schedules Flow in 60s, then Sepolia deposit. Non-production API enables demo by default."
                      >
                        {demoScheduleBusy ? "…" : "For 1m"}
                      </button>
                      <span className="font-mono text-[8px] text-muted-foreground normal-case max-w-[7rem] text-right">
                        for demo purpose
                      </span>
                    </div>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {freqChallengeLabel(agent.frequency)} · next run
                    {isDemoCountdown ? " (demo 1:00)" : ""}
                  </p>
                  <p className="font-mono text-base text-foreground tabular-nums tracking-tight">
                    {nextDepositCountdown}
                  </p>
                  {nextDepositAbsolute && (
                    <p className="font-mono text-[10px] text-muted-foreground">{nextDepositAbsolute}</p>
                  )}
                  {showFlowOverdueHint && (
                    <p className="font-mono text-[10px] text-muted-foreground leading-snug">
                      When <code className="text-foreground/90">nextExecutionISO</code> is in the past, the API
                      (default <code className="text-foreground/90">NAPFI_DEPOSIT_QUEUE_SOURCE=time</code>)
                      enqueues the USDC deposit; this page polls and calls{" "}
                      <code className="text-foreground/90">depositUsdcFromWallet</code> (same as Deposit).
                      Keep this tab open. Server log:{" "}
                      <code className="text-foreground/90">[NapFi][ScheduleTime] Queued USDC deposit</code>.
                    </p>
                  )}
                  {demoSimulatedNote && (
                    <p className="font-mono text-[10px] text-muted-foreground leading-snug">{demoSimulatedNote}</p>
                  )}
                  {demoScheduleError && (
                    <p className="font-mono text-[10px] text-red-500 leading-snug">{demoScheduleError}</p>
                  )}
                  {agent.flowSchedule && !demoSimulatedNote && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Flow interval: {agent.flowSchedule.delaySeconds}s
                      {agent.flowSchedule.flowNetwork === "testnet" ? " (testnet)" : ""}
                    </p>
                  )}
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

              {agent.flowSchedule &&
                (agent.flowSchedule.initTxId || agent.flowSchedule.scheduleTxId) && (
                  <div className="border-t border-border pt-4 space-y-2">
                    <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
                      Flow (automation)
                    </p>
                    {agent.flowSchedule.initTxId && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            initHandler
                          </p>
                          <p className="font-mono text-[11px] text-foreground truncate">
                            {agent.flowSchedule.initTxId}
                          </p>
                        </div>
                        <a
                          href={flowscanTxUrl(agent.flowSchedule.initTxId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Flowscan <ExternalLink size={9} />
                        </a>
                      </div>
                    )}
                    {agent.flowSchedule.scheduleTxId && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            scheduleDeposit
                          </p>
                          <p className="font-mono text-[11px] text-foreground truncate">
                            {agent.flowSchedule.scheduleTxId}
                          </p>
                        </div>
                        <a
                          href={flowscanTxUrl(agent.flowSchedule.scheduleTxId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Flowscan <ExternalLink size={9} />
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
            {(agent?.automationReceipts?.length
              ? agent.automationReceipts
              : []
            ).map((r: AutomationReceipt, i: number) => (
              <div key={`${r.sepoliaTxHash}-${i}`} className="flex items-center justify-between py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <CheckCircle size={13} className="text-green-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-mono text-base text-foreground">
                      Automated deposit {r.amountUSDC} USDC
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {format(parseISO(r.at), "MMM d, yyyy · HH:mm")}
                    </p>
                  </div>
                </div>
                <a
                  href={`https://sepolia.etherscan.io/tx/${r.sepoliaTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sepolia <ExternalLink size={10} />
                </a>
              </div>
            ))}
            {(!agent?.automationReceipts || agent.automationReceipts.length === 0) && (
              <p className="py-6 font-mono text-sm text-muted-foreground text-center">
                No automation runs recorded yet. After Flow triggers a deposit, the Sepolia tx appears here.
              </p>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
