"use client"

import { motion } from "framer-motion"

const TECH_ITEMS = [
  "Zama fhEVM",
  "Flow EVM",
  "Ethereum Sepolia",
  "ERC-8004",
  "ERC-721",
  "Cadence",
  "IPFS + Pinata",
  "euint64 Ciphertext",
  "FHE.add()",
  "keccak256",
  "wagmi v2",
  "Web3Auth Modal v10",
  "Next.js 15",
  "Solidity 0.8.28",
  "Chain ID 545",
  "Chain ID 11155111",
]

export function TechTicker() {
  return (
    <div className="overflow-hidden border-y border-border py-3" aria-label="Technology stack ticker">
      <motion.div
        className="flex gap-8 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{
          duration: 30,
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {[...TECH_ITEMS, ...TECH_ITEMS].map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="font-mono text-xs text-muted-foreground"
          >
            {item}
            <span className="ml-8 text-border">{"///"}</span>
          </span>
        ))}
      </motion.div>
    </div>
  )
}
