"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useWeb3Auth } from "@web3auth/modal/react"

export function HeroSection() {
  const router = useRouter()
  const [motionEnabled, setMotionEnabled] = useState(true)
  const { web3Auth, isConnected, status } = useWeb3Auth()
  const isConnecting = status === "connecting"

  useEffect(() => {
    if (isConnected) {
      router.push("/onboarding")
    }
  }, [isConnected, router])

  const handleConnect = () => {
    if (isConnected) {
      web3Auth?.logout()
    } else {
      web3Auth?.connect()
    }
  }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setMotionEnabled(!mq.matches)
    const handler = (e: MediaQueryListEvent) => setMotionEnabled(!e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <style>{`
        @keyframes moneyShine {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>
      {/* Scanline overlay */}
      {motionEnabled && (
        <div
          className="animate-scanline pointer-events-none absolute inset-0 z-10 h-[2px] w-full bg-foreground/5"
          aria-hidden="true"
        />
      )}

      {/* Video Background */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover opacity-80"
        >
          <source src="/91260-628462870_medium.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay so text stays readable */}
        <div className="absolute inset-0 bg-background/60" />
      </div>

      {/* Main Content */}
      <div className="relative z-20 flex max-w-4xl flex-col items-start gap-8 text-left -translate-y-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex flex-col items-start gap-6"
        >
          <div className="inline-flex items-center gap-2 border border-border bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 bg-foreground" />
            <span>NapFi-CONFIDENTIAL SAVINGS</span>
          </div>

          <h1 className="font-pixel-line text-5xl font-bold leading-none tracking-tight text-foreground text-balance md:text-7xl lg:text-9xl">
            Your <span
                style={{
                  background: "linear-gradient(90deg, #1a7a3f 0%, #1a7a3f 30%, #4ade80 50%, #1a7a3f 70%, #1a7a3f 100%)",
                  backgroundSize: "200% 100%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  animation: "moneyShine 2.5s linear infinite",
                }}
              >money</span> $aves itself.
            <br />
            <span className="text-muted-foreground">Privately.</span>
          </h1>

          <p className="max-w-prose font-mono text-sm leading-relaxed text-muted-foreground md:text-base">
            Yes, your balance is on a public blockchain. No, nobody can read it. Flow runs the deposits. Zama keeps the secret. You just set a goal.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="flex flex-col items-start gap-4 sm:flex-row"
        >
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="group flex items-center gap-2 border border-foreground bg-foreground px-6 py-3 font-mono text-sm text-background transition-all duration-200 hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Sleeeeeep"}
            {!isConnecting && (
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                {"->"}
              </span>
            )}
          </button>
          
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Scroll to Explore
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          className="h-4 w-[1px] bg-muted-foreground"
        />
      </motion.div>
    </section>
  )
}
