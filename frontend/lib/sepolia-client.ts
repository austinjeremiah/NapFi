import { createPublicClient, http } from "viem"
import { sepolia } from "viem/chains"

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
})
