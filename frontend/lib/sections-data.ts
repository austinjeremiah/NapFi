export interface TechSection {
  id: string
  number: string
  title: string
  subtitle: string
  description: string
  ascii: string
  specs: { label: string; value: string }[]
  commands: string[]
}

export const techSections: TechSection[] = [
  {
    id: "encrypted-vault",
    number: "01",
    title: "Encrypted Vault",
    subtitle: "Zama fhEVM on Sepolia",
    description:
      "Yes, your balance is on a public blockchain. No, nobody can read it. Vault stores every deposit as a euint64 ciphertext using Zama fhEVM. FHE.add() runs arithmetic on encrypted values — the contract never sees the number, and neither does anyone else except you.",
    ascii: `
    deposit(encHandle, inputProof)
            │
    ┌───────▼────────────────┐
    │  FHE.fromExternal()     │
    │  unpack externalEuint64 │
    └───────┬────────────────┘
            │
    ┌───────▼────────────────┐
    │  FHE.add(balance, amt)  │
    │  result stays encrypted │
    └───────┬────────────────┘
            │
    ┌───────▼────────────────┐
    │  FHE.allowThis()        │
    │  FHE.allow(userAddr)    │
    │  write euint64 storage  │
    └────────────────────────┘`,
    specs: [
      { label: "Storage type", value: "euint64 ciphertext" },
      { label: "Network", value: "Ethereum Sepolia" },
      { label: "FHE version", value: "fhEVM v0.9" },
      { label: "Solidity", value: "0.8.28 + evmVersion cancun" },
    ],
    commands: [
      "$ vault.balanceOf(userAddress)",
      "→ euint64 handle (good luck reading that)",
      "$ instance.createEncryptedInput(vault, user)",
      "→ .add64(amount).encrypt()",
      "→ { handles[0], inputProof }",
      "$ vault.deposit(handles[0], inputProof) [OK]",
    ],
  },
  {
    id: "graphics-pipelines",
    number: "02",
    title: "Flow Scheduler",
    subtitle: "Scheduled transactions on Flow EVM",
    description:
      "FlowTransactionScheduler fires a Cadence tx on Flow testnet (Chain ID 545) at the user's set interval. Pulls USDC via VaultSource.withdrawAvailable(), emits DepositTriggered(userAddr, amount, ts). Nobody asked the user. Nobody told them either.",
    ascii: `
    Vertices ──> Vertex Shader
                     │
              Primitive Assembly
                     │
               Rasterization
                     │
              Fragment Shader
                     │
              ┌──────┴──────┐
              │  Framebuffer │
              │  ┌──┬──┬──┐ │
              │  │░░│▓▓│██│ │
              │  ├──┼──┼──┤ │
              │  │▓▓│░░│▓▓│ │
              │  └──┴──┴──┘ │
              └─────────────┘`,
    specs: [
      { label: "Goal Set", value: "User sets interval" },
      { label: "Scheduler", value: "Cadence tx fires" },
      { label: "VaultSource", value: "withdrawAvailable()" },
      { label: "DepositTriggered", value: "Off-chain picks up" },
    ],
    commands: [
      "$ gpu-info --capabilities",
      "Compute Units: 80 | VRAM: 16GB",
      "$ render --scene cornell-box.gltf",
      "Triangles: 12,450 | FPS: 144",
      "$ shader compile fragment.glsl",
      "Fragment shader: 128 ALU ops",
    ],
  },
  {
    id: "logic-synthesis",
    number: "03",
    title: "ERC-8004 Agent",
    subtitle: "On-chain agent identity and receipts",
    description:
      "The agent registers as an ERC-721 NFT in IdentityRegistry on Sepolia. After every deposit it uploads the execution log to IPFS, computes keccak256 of the JSON, and calls ReputationRegistry.giveFeedback(). Permanent. Verifiable. Nobody can fake it.",
    ascii: `
        A ──┐
            ├──[AND]──┐
        B ──┘         │
                      ├──[OR]── Q
        C ──┐         │
            ├──[AND]──┘
        D ──┘`,
    specs: [
      { label: "Agent type", value: "ERC-8004 Identity" },
      { label: "Token standard", value: "ERC-721" },
      { label: "Receipt storage", value: "IPFS via Pinata" },
      { label: "Receipt hash", value: "keccak256(JSON)" },
    ],
    commands: [
      "$ registry.register('ipfs://Qm...') → agentId: 42",
      "$ pinata.upload(executionLog) → CID: Qm3x9...",
      "$ keccak256(JSON.stringify(log))",
      "→ 0x7f3a...b12c",
      "$ reputationRegistry.giveFeedback(42, 100, ...)",
      "Receipt posted on-chain [OK]",
    ],
  },
  
]

export const navLinks = techSections.map((s) => ({
  id: s.id,
  number: s.number,
  title: s.title,
}))
