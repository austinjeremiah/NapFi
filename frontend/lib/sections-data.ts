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
    id: "distributed-ledger",
    number: "01",
    title: "Distributed Ledger",
    subtitle: "Consensus architecture",
    description:
      "Decentralized systems where trust is computed, not assumed. Examining consensus mechanisms, Merkle trees, and the cryptographic primitives that secure distributed state.",
    ascii: `
    Block #1021        Block #1022
    ┌──────────┐      ┌──────────┐
    │ Hash: 0xA│─────>│ Hash: 0xB│
    │ Prev: 0x9│      │ Prev: 0xA│
    │ Nonce: 42│      │ Nonce: 87│
    │ Tx: 12   │      │ Tx: 8    │
    └──────────┘      └──────────┘
         │                  │
    ┌────┴────┐        ┌────┴────┐
    │ Merkle  │        │ Merkle  │
    │  Root   │        │  Root   │
    └─────────┘        └─────────┘`,
    specs: [
      { label: "Consensus", value: "Proof of Stake" },
      { label: "Block Time", value: "~12 seconds" },
      { label: "Hash Function", value: "SHA-256" },
      { label: "Finality", value: "2 epochs (~12.8 min)" },
    ],
    commands: [
      "$ ledger query --block latest",
      "Block #1022 | Hash: 0xB3F...A2",
      "$ ledger verify --merkle-root",
      "Root: 0x7D2...F1 [VALID]",
      "$ ledger peers --count",
      "Active Peers: 12,847",
    ],
  },
  {
    id: "graphics-pipelines",
    number: "02",
    title: "Graphics Pipelines",
    subtitle: "Rendering architecture",
    description:
      "From vertices to pixels, the graphics pipeline transforms mathematical abstractions into visual reality. Shaders, rasterization, and GPU compute redefine what screens can display.",
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
      { label: "API", value: "Vulkan / WebGPU" },
      { label: "Shading", value: "PBR (Cook-Torrance)" },
      { label: "Resolution", value: "4K @ 120Hz" },
      { label: "Draw Calls", value: "< 1000 / frame" },
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
    title: "Logic Synthesis",
    subtitle: "Digital design",
    description:
      "Where Boolean algebra meets silicon. Logic gates, flip-flops, and RTL design form the bridge between abstract computation theory and physical circuit implementation.",
    ascii: `
        A ──┐
            ├──[AND]──┐
        B ──┘         │
                      ├──[OR]── Q
        C ──┐         │
            ├──[AND]──┘
        D ──┘

    Truth Table:
    A B C D │ Q
    0 0 0 0 │ 0
    1 1 0 0 │ 1
    0 0 1 1 │ 1
    1 1 1 1 │ 1`,
    specs: [
      { label: "HDL", value: "SystemVerilog" },
      { label: "Process", value: "5nm FinFET" },
      { label: "Clock", value: "3.2 GHz" },
      { label: "Gates", value: "~10B transistors" },
    ],
    commands: [
      "$ synth --target fpga design.sv",
      "LUTs: 4,200 | FFs: 1,800",
      "$ simulate --cycles 1000",
      "All assertions passed [1000/1000]",
      "$ timing-report --critical-path",
      "Slack: +0.3ns [TIMING MET]",
    ],
  },
  {
    id: "hardware-abstraction",
    number: "04",
    title: "Hardware Abstraction",
    subtitle: "Interface layers",
    description:
      "The invisible translators between software intent and hardware capability. HALs, device drivers, and firmware form the contract that makes portable computing possible.",
    ascii: `
    ┌─────────────────────────┐
    │     APPLICATION          │
    ├─────────────────────────┤
    │     OS / RUNTIME         │
    ├─────────────────────────┤
    │     HAL INTERFACE        │
    │  ┌─────┐ ┌─────┐       │
    │  │ GPU │ │ NIC │ ...   │
    │  └──┬──┘ └──┬──┘       │
    ├─────┼───────┼───────────┤
    │     │  SILICON │         │
    │     └────┬────┘         │
    │        [HW]              │
    └─────────────────────────┘`,
    specs: [
      { label: "Interface", value: "MMIO / PIO" },
      { label: "Bus", value: "PCIe Gen5 x16" },
      { label: "DMA", value: "IOMMU Protected" },
      { label: "Firmware", value: "UEFI 2.10" },
    ],
    commands: [
      "$ lspci -v | head -4",
      "00:02.0 VGA: Device [ACCEL]",
      "  Memory at 0xFE000000 (64-bit)",
      "$ hal query --device gpu0",
      "Status: ACTIVE | Driver: v12.1",
      "$ dmesg | grep firmware",
      "Firmware loaded: hal-core v3.2.1",
    ],
  },
]

export const navLinks = techSections.map((s) => ({
  id: s.id,
  number: s.number,
  title: s.title,
}))
