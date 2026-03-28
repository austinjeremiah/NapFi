"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Copy, Check, ExternalLink, LogOut, AlertTriangle } from "lucide-react"
import { useWeb3Auth } from "@web3auth/modal/react"
import { BrowserProvider, Contract } from "ethers"
import { ScrambleText } from "@/components/ui/scramble-text"
import { DotPattern } from "@/components/ui/dot-pattern"
import { getAgent, postSetup, type ApiFrequency } from "@/lib/api"
import { encryptWithdrawAmount } from "@/lib/zama"
import { ENCRYPTED_VAULT_ABI, CONTRACT_ADDRESSES } from "@/lib/contracts"

type Frequency = "Daily" | "Weekly" | "Monthly"

function toApiFrequency(f: Frequency): ApiFrequency {
  const m: Record<Frequency, ApiFrequency> = {
    Daily: "daily",
    Weekly: "weekly",
    Monthly: "monthly",
  }
  return m[f]
}

function apiToUiFrequency(f: ApiFrequency): Frequency {
  const m: Record<ApiFrequency, Frequency> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
  }
  return m[f]
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function SettingsPage() {
  const router = useRouter()
  const { web3Auth, provider, isConnected } = useWeb3Auth()
  const [walletAddress, setWalletAddress] = useState("")
  const [vaultAddress, setVaultAddress] = useState("")
  const [agentLoadError, setAgentLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!provider || !isConnected) return
    ;(provider.request({ method: "eth_accounts" }) as Promise<string[]>)
      .then((accounts) => { if (accounts?.[0]) setWalletAddress(accounts[0]) })
      .catch(() => {})
  }, [provider, isConnected])

  // Goal state
  const [amount, setAmount] = useState("10")
  const [frequency, setFrequency] = useState<Frequency>("Weekly")
  const [yieldEnabled, setYieldEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!walletAddress) return
    setAgentLoadError(null)
    getAgent(walletAddress)
      .then((a) => {
        if (!a) return
        setVaultAddress(a.vaultAddress)
        if (a.goalAmountUSDC > 0) {
          setAmount(String(a.goalAmountUSDC))
          setFrequency(apiToUiFrequency(a.frequency))
          setYieldEnabled(a.yieldEnabled)
        }
      })
      .catch((e) => {
        setAgentLoadError(e instanceof Error ? e.message : "Failed to load agent")
      })
  }, [walletAddress])

  // Copy state
  const [copied, setCopied] = useState(false)

  // Withdraw modal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawError, setWithdrawError] = useState<string | null>(null)

  const handleSaveGoal = async () => {
    if (!walletAddress) {
      setSaveError("Connect your wallet first.")
      return
    }
    setSaveError(null)
    setSaving(true)
    try {
      const res = await postSetup({
        userAddress: walletAddress,
        goalAmountUSDC: Number(amount),
        frequency: toApiFrequency(frequency),
        yieldEnabled,
      })
      setVaultAddress(res.vaultAddress)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleWithdraw = async () => {
    if (!provider || !walletAddress || !withdrawAmount || Number(withdrawAmount) <= 0) return
    setWithdrawError(null)
    setWithdrawing(true)
    try {
      const vault = vaultAddress || CONTRACT_ADDRESSES.EncryptedVault
      const rawAmount = Math.round(Number(withdrawAmount) * 1_000_000) // USDC 6 decimals
      const { encryptedAmount, inputProof } = await encryptWithdrawAmount(
        rawAmount,
        vault,
        walletAddress,
        provider as Parameters<typeof encryptWithdrawAmount>[3]
      )
      const ethersProvider = new BrowserProvider(provider as never)
      const signer = await ethersProvider.getSigner()
      const contract = new Contract(vault, ENCRYPTED_VAULT_ABI, signer)
      const tx = await contract.withdraw(encryptedAmount, inputProof)
      await tx.wait()
      setShowWithdrawModal(false)
      setWithdrawAmount("")
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : "Withdrawal failed")
    } finally {
      setWithdrawing(false)
    }
  }

  const handleSignOut = async () => {
    await web3Auth?.logout()
    router.push("/")
  }

  return (
    <main className="relative min-h-screen bg-background px-4 py-12">
      <DotPattern className="pointer-events-none absolute inset-0 h-full w-full opacity-30" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="border-l-2 border-foreground pl-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">NapFi / Settings</p>
          <h1 className="mt-1 font-pixel text-2xl font-bold text-foreground">
            <ScrambleText text="SETTINGS" />
          </h1>
        </div>

        {/* ── Goal section ──────────────────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-6">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Savings Goal</p>

          {agentLoadError && (
            <p className="font-mono text-xs text-destructive">{agentLoadError}</p>
          )}
          {saveError && (
            <p className="font-mono text-xs text-destructive">{saveError}</p>
          )}

          <div className="space-y-2">
            <p className="font-mono text-xs text-muted-foreground">Amount per execution</p>
            <div className="flex items-center border border-border focus-within:border-foreground transition-colors">
              <input
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent px-4 py-3 font-mono text-lg text-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <span className="border-l border-border px-4 py-3 font-mono text-sm text-muted-foreground">USDC</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-mono text-xs text-muted-foreground">Frequency</p>
            <div className="grid grid-cols-3 gap-3">
              {(["Daily", "Weekly", "Monthly"] as Frequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`border py-3 font-mono text-sm transition-all duration-200 ${
                    frequency === f
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setYieldEnabled(!yieldEnabled)}
            className={`flex w-full items-center justify-between border px-5 py-4 transition-all duration-200 ${
              yieldEnabled ? "border-foreground" : "border-border"
            }`}
          >
            <div className="text-left">
              <p className="font-mono text-sm text-foreground">Yield optimisation</p>
              <p className="font-mono text-xs text-muted-foreground">Automatically find the best rate for your savings</p>
            </div>
            <div className={`flex h-6 w-11 items-center border transition-all duration-300 ${yieldEnabled ? "border-foreground bg-foreground" : "border-border bg-transparent"}`}>
              <div className={`h-4 w-4 border transition-all duration-300 ${yieldEnabled ? "translate-x-6 border-background bg-background" : "translate-x-1 border-foreground bg-foreground"}`} />
            </div>
          </button>

          <button
            onClick={handleSaveGoal}
            disabled={saving || !amount || Number(amount) <= 0}
            className="flex items-center gap-2 border border-foreground bg-foreground px-6 py-3 font-mono text-sm text-background transition-all hover:bg-transparent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved ✓" : "Save Changes"}
          </button>
        </div>

        {/* ── Vault section ─────────────────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-5">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Vault</p>

          <div className="space-y-1">
            <p className="font-mono text-xs text-muted-foreground">Contract address (Sepolia)</p>
            <a
              href={
                vaultAddress
                  ? `https://sepolia.etherscan.io/address/${vaultAddress}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 font-mono text-sm text-foreground hover:text-muted-foreground transition-colors ${!vaultAddress ? "pointer-events-none opacity-50" : ""}`}
            >
              {vaultAddress ? shortAddress(vaultAddress) : "— load agent or save goal —"}
              <ExternalLink size={12} />
            </a>
          </div>

          <button
            onClick={() => setShowWithdrawModal(true)}
            className="border border-border px-6 py-3 font-mono text-sm text-muted-foreground transition-all hover:border-red-500 hover:text-red-500"
          >
            Withdraw my savings
          </button>
        </div>

        {/* ── Account section ───────────────────────────────────────── */}
        <div className="border border-border bg-background/95 p-6 space-y-5">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Account</p>

          <div className="space-y-1">
            <p className="font-mono text-xs text-muted-foreground">Wallet address</p>
            <div className="flex items-center gap-3">
              <p className="font-mono text-sm text-foreground break-all">{walletAddress}</p>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 border border-border px-6 py-3 font-mono text-sm text-muted-foreground transition-all hover:border-foreground hover:text-foreground"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>

      </div>

      {/* ── Withdraw confirmation modal ────────────────────────────── */}
      <AnimatePresence>
        {showWithdrawModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full max-w-md border border-border bg-background p-8 space-y-6"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-pixel text-base font-bold text-foreground">Withdraw your savings</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground leading-relaxed">
                    Amount is encrypted client-side before calling <span className="text-foreground">vault.withdraw()</span> on Sepolia.
                  </p>
                </div>
              </div>

              <div className="flex items-center border border-border focus-within:border-foreground transition-colors">
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  placeholder="0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="flex-1 bg-transparent px-4 py-3 font-mono text-lg text-foreground outline-none placeholder:text-muted-foreground/40"
                />
                <span className="border-l border-border px-4 py-3 font-mono text-sm text-muted-foreground">USDC</span>
              </div>

              {withdrawError && (
                <p className="font-mono text-xs text-red-500">{withdrawError}</p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowWithdrawModal(false); setWithdrawError(null); setWithdrawAmount("") }}
                  disabled={withdrawing}
                  className="flex-1 border border-border px-4 py-3 font-mono text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing || !withdrawAmount || Number(withdrawAmount) <= 0}
                  className="flex-1 border border-red-500 px-4 py-3 font-mono text-sm text-red-500 hover:bg-red-500 hover:text-background transition-all disabled:opacity-50"
                >
                  {withdrawing ? "Processing..." : "Confirm Withdraw"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
