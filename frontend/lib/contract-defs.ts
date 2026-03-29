/**
 * Pure constants — no ethers. Import from here in dashboard / hooks so Turbopack
 * does not bundle ethers for those routes.
 */

export const CONTRACT_ADDRESSES = {
  EncryptedVault: "0x939F26Cd46B4A039C512EBE949F8C10D6545227e",
  AgentRegistry: "0x7ca0388C3A895278D2f1F0161919Ab7D189f062F",
} as const

export const ENCRYPTED_VAULT_ABI = [
  { inputs: [{ internalType: "address", name: "_agentOperator", type: "address" }], stateMutability: "nonpayable", type: "constructor" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "balanceOf", outputs: [{ internalType: "euint64", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "getBalanceHandle", outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "hasBalance", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "makeBalanceDecryptable", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "externalEuint64", name: "encryptedAmount", type: "bytes32" }, { internalType: "bytes", name: "inputProof", type: "bytes" }, { internalType: "address", name: "user", type: "address" }], name: "deposit", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "externalEuint64", name: "encryptedAmount", type: "bytes32" }, { internalType: "bytes", name: "inputProof", type: "bytes" }], name: "withdraw", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [], name: "agentOperator", outputs: [{ internalType: "address", name: "", type: "address" }], stateMutability: "view", type: "function" },
] as const

export const AGENT_REGISTRY_ABI = [
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "lookup", outputs: [{ internalType: "uint256", name: "agentId", type: "uint256" }, { internalType: "address", name: "vaultAddress", type: "address" }, { internalType: "bool", name: "registrationStatus", type: "bool" }, { internalType: "uint256", name: "registeredAt", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "getAgentId", outputs: [{ internalType: "uint256", name: "agentId", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "getVaultAddress", outputs: [{ internalType: "address", name: "vault", type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }], name: "isRegistered", outputs: [{ internalType: "bool", name: "", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "user", type: "address" }, { internalType: "uint256", name: "agentId", type: "uint256" }, { internalType: "address", name: "vault", type: "address" }], name: "registerUserAgent", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const

export const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"
export const VAULT_ADDRESS = "0x9045d16F64FA58EaEf8d1F62A16edA55121EBd1E"
export const USDC_DECIMALS = 6
