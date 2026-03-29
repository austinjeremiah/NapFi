"use client"

import { useEffect, useState } from "react"
import { sepoliaClient } from "@/lib/sepolia-client"
import { AGENT_REGISTRY_ABI, ENCRYPTED_VAULT_ABI, CONTRACT_ADDRESSES } from "@/lib/contract-defs"

interface AgentData {
  agentId: string
  vaultAddress: string
  isRegistered: boolean
  registeredAt: Date | null
  hasBalance: boolean
  loading: boolean
}

const DEFAULT: AgentData = {
  agentId: "",
  vaultAddress: "",
  isRegistered: false,
  registeredAt: null,
  hasBalance: false,
  loading: true,
}

export function useAgentData(userAddress?: string): AgentData {
  const [data, setData] = useState<AgentData>(DEFAULT)

  useEffect(() => {
    if (!userAddress) return

    const address = userAddress as `0x${string}`

    Promise.all([
      sepoliaClient.readContract({
        address: CONTRACT_ADDRESSES.AgentRegistry,
        abi: AGENT_REGISTRY_ABI,
        functionName: "lookup",
        args: [address],
      }),
      sepoliaClient.readContract({
        address: CONTRACT_ADDRESSES.EncryptedVault,
        abi: ENCRYPTED_VAULT_ABI,
        functionName: "hasBalance",
        args: [address],
      }),
    ])
      .then(([lookup, hasBalance]) => {
        const [agentId, vaultAddress, registrationStatus, registeredAt] = lookup as [bigint, string, boolean, bigint]
        setData({
          agentId: agentId.toString(),
          vaultAddress,
          isRegistered: registrationStatus,
          registeredAt: registeredAt > 0n ? new Date(Number(registeredAt) * 1000) : null,
          hasBalance: hasBalance as boolean,
          loading: false,
        })
      })
      .catch(() => setData((d) => ({ ...d, loading: false })))
  }, [userAddress])

  return data
}
