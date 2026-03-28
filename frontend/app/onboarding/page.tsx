"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { useWeb3Auth } from "@web3auth/modal/react"
import { postSetup, type ApiFrequency } from "@/lib/api"

type Frequency = "Daily" | "Weekly" | "Monthly"

const LOADING_STEPS = [
  "Setting up your private vault...",
  "Registering your agent on-chain...",
  "Almost there...",
]

function toApiFrequency(f: Frequency): ApiFrequency {
  const m: Record<Frequency, ApiFrequency> = {
    Daily: "daily",
    Weekly: "weekly",
    Monthly: "monthly",
  }
  return m[f]
}

export default function OnboardingPage() {
  const router = useRouter()
  const { provider, isConnected } = useWeb3Auth()

  const [step, setStep] = useState(1)
  const [amount, setAmount] = useState("")
  const [frequency, setFrequency] = useState<Frequency>("Weekly")
  const [yieldEnabled, setYieldEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [apiError, setApiError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setApiError(null)

    if (!isConnected || !provider) {
      setApiError("Connect your wallet from the home page, then continue setup.")
      return
    }

    const accounts = (await provider.request({ method: "eth_accounts" })) as string[]
    const userAddress = accounts?.[0]
    if (!userAddress) {
      setApiError("No wallet address. Try connecting again.")
      return
    }

    setLoading(true)
    setLoadingStep(0)

    const stepInterval = window.setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 600)

    try {
      const result = await postSetup({
        userAddress,
        goalAmountUSDC: Number(amount),
        frequency: toApiFrequency(frequency),
        yieldEnabled,
      })

      if (result.txHashes) {
        console.log("\n✅ Agent created successfully!")
        console.log("Agent ID       :", result.agentId)
        console.log("Vault          :", result.vaultAddress)
        console.log("IPFS URI       :", result.ipfsUri)
        console.log("TX register    :", `https://sepolia.etherscan.io/tx/${result.txHashes.register}`)
        console.log("TX setWallet   :", `https://sepolia.etherscan.io/tx/${result.txHashes.setAgentWallet}`)
        console.log("TX registerUA  :", `https://sepolia.etherscan.io/tx/${result.txHashes.registerUserAgent}`)
      }

      localStorage.setItem(
        `napfi_setup_${userAddress.toLowerCase()}`,
        JSON.stringify({
          agentId: result.agentId,
          vaultAddress: result.vaultAddress,
          ipfsUri: result.ipfsUri,
          txHashes: result.txHashes,
        })
      )

      router.push("/dashboard")
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Setup failed"
      setApiError(msg)
    } finally {
      clearInterval(stepInterval)
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="mb-10 border-l-2 border-foreground pl-4">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            NapFi / Setup
          </p>
          <h1 className="mt-1 font-pixel text-2xl font-bold text-foreground">
            Configure your agent
          </h1>
        </div>

        {!isConnected && (
          <div className="mb-6 border border-border p-4 font-mono text-xs text-muted-foreground">
            Connect your wallet from the home page first.{" "}
            <Link href="/" className="text-foreground underline underline-offset-2">
              Back to home
            </Link>
          </div>
        )}

        {apiError && (
          <div className="mb-6 border border-destructive/50 bg-destructive/10 p-4 font-mono text-xs text-destructive">
            {apiError}
          </div>
        )}

        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-3">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`flex h-6 w-6 items-center justify-center border font-mono text-[10px] transition-all duration-300 ${
                  step === s
                    ? "border-foreground bg-foreground text-background"
                    : step > s
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {step > s ? "✓" : s}
              </div>
              {s < 3 && (
                <div
                  className={`h-[1px] w-12 transition-all duration-300 ${
                    step > s ? "bg-foreground" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          {/* Step 1 — Amount */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Step 1 of 3
                </p>
                <h2 className="font-pixel text-xl text-foreground mb-1">
                  How much do you want to save each time?
                </h2>
                <p className="font-mono text-xs text-muted-foreground">
                  This will be deposited into your private vault.
                </p>
              </div>

              <div className="flex items-center border border-border focus-within:border-foreground transition-colors">
                <input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-transparent px-4 py-3 font-mono text-2xl text-foreground outline-none placeholder:text-muted-foreground/40"
                />
                <span className="border-l border-border px-4 py-3 font-mono text-sm text-muted-foreground">
                  USDC
                </span>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!amount || Number(amount) <= 0}
                className="mt-2 border border-foreground bg-foreground px-6 py-3 font-mono text-sm text-background transition-all hover:bg-transparent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue {"->"}
              </button>
            </motion.div>
          )}

          {/* Step 2 — Frequency */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Step 2 of 3
                </p>
                <h2 className="font-pixel text-xl text-foreground mb-1">
                  How often?
                </h2>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(["Daily", "Weekly", "Monthly"] as Frequency[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFrequency(f)}
                    className={`border py-4 font-mono text-sm transition-all duration-200 ${
                      frequency === f
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="border border-border px-6 py-3 font-mono text-sm text-muted-foreground transition-all hover:border-foreground hover:text-foreground"
                >
                  {"<-"} Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 border border-foreground bg-foreground px-6 py-3 font-mono text-sm text-background transition-all hover:bg-transparent hover:text-foreground"
                >
                  Continue {"->"}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3 — Yield toggle */}
          {step === 3 && !loading && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-6"
            >
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
                  Step 3 of 3
                </p>
                <h2 className="font-pixel text-xl text-foreground mb-1">
                  Automatically find the best rate for your savings?
                </h2>
              </div>

              <button
                onClick={() => setYieldEnabled(!yieldEnabled)}
                className={`flex items-center justify-between border px-5 py-4 transition-all duration-200 ${
                  yieldEnabled ? "border-foreground" : "border-border"
                }`}
              >
                <span className="font-mono text-sm text-foreground">
                  Yield optimisation
                </span>
                <div
                  className={`flex h-6 w-11 items-center rounded-none border transition-all duration-300 ${
                    yieldEnabled ? "border-foreground bg-foreground" : "border-border bg-transparent"
                  }`}
                >
                  <div
                    className={`h-4 w-4 border transition-all duration-300 ${
                      yieldEnabled
                        ? "translate-x-6 border-background bg-background"
                        : "translate-x-1 border-foreground bg-foreground"
                    }`}
                  />
                </div>
              </button>

              <p className="font-mono text-xs text-muted-foreground">
                {yieldEnabled
                  ? "Your agent will route savings to the highest available yield automatically."
                  : "Your savings will sit in the vault without yield routing."}
              </p>

              {/* Summary */}
              <div className="border border-border p-4 font-mono text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Amount</span>
                  <span className="text-foreground">{amount} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span>Frequency</span>
                  <span className="text-foreground">{frequency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Yield</span>
                  <span className="text-foreground">{yieldEnabled ? "On" : "Off"}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="border border-border px-6 py-3 font-mono text-sm text-muted-foreground transition-all hover:border-foreground hover:text-foreground"
                >
                  {"<-"} Back
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 border border-foreground bg-foreground px-6 py-3 font-mono text-sm text-background transition-all hover:bg-transparent hover:text-foreground"
                >
                  Create My Agent
                </button>
              </div>
            </motion.div>
          )}

          {/* Loading state */}
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-start gap-6 py-4"
            >
              <div className="flex flex-col gap-3">
                {LOADING_STEPS.map((msg, i) => (
                  <div key={i} className="flex items-center gap-3 font-mono text-sm">
                    <span
                      className={`transition-all duration-300 ${
                        i < loadingStep
                          ? "text-foreground"
                          : i === loadingStep
                          ? "text-foreground"
                          : "text-muted-foreground/30"
                      }`}
                    >
                      {i < loadingStep ? "✓" : i === loadingStep ? "›" : "·"}
                    </span>
                    <span
                      className={`transition-all duration-300 ${
                        i <= loadingStep ? "text-foreground" : "text-muted-foreground/30"
                      }`}
                    >
                      {msg}
                    </span>
                    {i === loadingStep && (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="text-foreground"
                      >
                        _
                      </motion.span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
