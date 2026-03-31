import {
  BrowserProvider,
  Contract,
  formatUnits,
  getAddress,
  JsonRpcProvider,
  parseUnits,
} from "ethers"
import type { Eip1193Provider } from "ethers"
import { SEPOLIA_USDC, USDC_DECIMALS, VAULT_ADDRESS } from "./contract-defs"

export {
  AGENT_REGISTRY_ABI,
  CONTRACT_ADDRESSES,
  ENCRYPTED_VAULT_ABI,
  SEPOLIA_USDC,
  USDC_DECIMALS,
  VAULT_ADDRESS,
} from "./contract-defs"

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"

function sepoliaReadProvider(): JsonRpcProvider {
  const url =
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() ||
    "https://ethereum-sepolia.publicnode.com"
  return new JsonRpcProvider(url, 11155111, { staticNetwork: true })
}

function sepoliaRpcForWallet(): string {
  return (
    process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL?.trim() ||
    "https://ethereum-sepolia.publicnode.com"
  )
}

export async function ensureSepoliaChain(p: Eip1193Provider): Promise<void> {
  const id = ((await p.request({ method: "eth_chainId" })) as string).toLowerCase()
  if (id === SEPOLIA_CHAIN_ID_HEX) return

  try {
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    })
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code
    if (code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: "Sepolia",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [sepoliaRpcForWallet()],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      })
      return
    }
    throw new Error(
      "Switch to Sepolia in your wallet. NapFi USDC only works on Ethereum Sepolia (chain 11155111)."
    )
  }
}

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
]

const VAULT_ABI = [
  "function depositUSDC(uint256 amount) external",
  "function withdrawUSDC(uint256 shares) external",
  "function getUsdcBalance(address user) external view returns (uint256)",
  "function totalShares() external view returns (uint256)",
  "function sharesOf(address user) external view returns (uint256)",
  "function positionTokenId() external view returns (uint256)",
  "function getPositionLiquidity() external view returns (uint128)",
  "event DepositUSDC(address indexed user, uint256 amount)",
  "event WithdrawUSDC(address indexed user, uint256 sharesBurned, uint256 usdcReturned)",
]

function getSigner(web3authProvider: Eip1193Provider) {
  const browserProvider = new BrowserProvider(web3authProvider)
  return browserProvider.getSigner()
}

export async function getWalletUsdcBalance(userAddress: string): Promise<string> {
  const usdc = new Contract(SEPOLIA_USDC, ERC20_ABI, sepoliaReadProvider())
  const raw: bigint = await usdc.balanceOf(getAddress(userAddress))
  return formatUnits(raw, USDC_DECIMALS)
}

export async function getVaultUsdcBalance(userAddress: string): Promise<string> {
  const vault = getAddress(VAULT_ADDRESS)
  const c = new Contract(vault, VAULT_ABI, sepoliaReadProvider())
  const raw: bigint = await c.getUsdcBalance(getAddress(userAddress))
  return formatUnits(raw, USDC_DECIMALS)
}

export async function depositUsdcFromWallet(
  web3authProvider: Eip1193Provider,
  amountUsdc: number
): Promise<{ txHash: string }> {
  await ensureSepoliaChain(web3authProvider)

  const vault = getAddress(VAULT_ADDRESS)
  const signer = await getSigner(web3authProvider)
  const signerAddress = await signer.getAddress()

  const usdc = new Contract(SEPOLIA_USDC, ERC20_ABI, signer)
  const vaultContract = new Contract(vault, VAULT_ABI, signer)

  const microUsdc = parseUnits(amountUsdc.toString(), USDC_DECIMALS)

  const walletBalance: bigint = await new Contract(
    SEPOLIA_USDC,
    ERC20_ABI,
    sepoliaReadProvider()
  ).balanceOf(signerAddress)
  if (walletBalance < microUsdc) {
    const have = formatUnits(walletBalance, USDC_DECIMALS)
    throw new Error(
      `Insufficient USDC. Wallet has ${have} USDC, need ${amountUsdc}. ` +
        `Get Circle Sepolia USDC from https://faucet.circle.com`
    )
  }

  const currentAllowance: bigint = await usdc.allowance(signerAddress, vault)
  if (currentAllowance < microUsdc) {
    console.log(`[Deposit] Approving ${amountUsdc} USDC for vault...`)
    const approveTx = await usdc.approve(vault, microUsdc)
    await approveTx.wait()
    console.log(`[Deposit] Approval confirmed`)
  }

  console.log(`[Deposit] Depositing ${amountUsdc} USDC into vault ${vault}...`)
  const depositTx = await vaultContract.depositUSDC(microUsdc)
  const receipt = await depositTx.wait()

  console.log(`[Deposit] Confirmed: ${receipt.hash}`)
  return { txHash: receipt.hash as string }
}

// ── Uniswap v3 LP info ──────────────────────────────────────────────────

const NPM_SEPOLIA = "0x1238536071E1c677A632429e3655c799b22cDA52"
const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"
const WETH_DECIMALS = 18

const NPM_ABI = [
  "function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]

export type VaultLPInfo = {
  totalSharesUsdc: string
  userSharesUsdc: string
  userSharesBps: string
  positionTokenId: string
  liquidity: string
  feesUsdc: string
  feesWeth: string
}

export async function getVaultLPInfo(
  userAddress: string
): Promise<VaultLPInfo> {
  const provider = sepoliaReadProvider()
  const vault = getAddress(VAULT_ADDRESS)
  const v = new Contract(vault, VAULT_ABI, provider)

  const [totalShares, userShares, positionTokenId, liquidity] =
    await Promise.all([
      v.totalShares() as Promise<bigint>,
      v.sharesOf(getAddress(userAddress)) as Promise<bigint>,
      v.positionTokenId() as Promise<bigint>,
      v.getPositionLiquidity() as Promise<bigint>,
    ])

  const userSharesBps =
    totalShares > 0n ? (userShares * 10000n) / totalShares : 0n

  // Read uncollected fees from Uniswap NonfungiblePositionManager
  let feesUsdc = "0"
  let feesWeth = "0"
  if (positionTokenId > 0n) {
    try {
      const npm = new Contract(NPM_SEPOLIA, NPM_ABI, provider)
      const pos = await npm.positions(positionTokenId)
      // USDC (0x1c7D…) < WETH (0xfFf9…) → USDC is token0
      const tokensOwed0: bigint = pos.tokensOwed0
      const tokensOwed1: bigint = pos.tokensOwed1
      feesUsdc = formatUnits(tokensOwed0, USDC_DECIMALS)
      feesWeth = formatUnits(tokensOwed1, WETH_DECIMALS)
    } catch {
      // Position may not exist yet
    }
  }

  return {
    totalSharesUsdc: formatUnits(totalShares, USDC_DECIMALS),
    userSharesUsdc: formatUnits(userShares, USDC_DECIMALS),
    userSharesBps: (Number(userSharesBps) / 100).toFixed(2),
    positionTokenId: positionTokenId.toString(),
    liquidity: liquidity.toString(),
    feesUsdc,
    feesWeth,
  }
}

export async function withdrawUsdcFromVault(
  web3authProvider: Eip1193Provider,
  amountUsdc: number
): Promise<{ txHash: string }> {
  await ensureSepoliaChain(web3authProvider)

  const vault = getAddress(VAULT_ADDRESS)
  const signer = await getSigner(web3authProvider)
  const signerAddress = await signer.getAddress()

  const vaultContract = new Contract(vault, VAULT_ABI, signer)
  const microUsdc = parseUnits(amountUsdc.toString(), USDC_DECIMALS)

  const vaultBalance: bigint = await new Contract(vault, VAULT_ABI, sepoliaReadProvider()).getUsdcBalance(
    signerAddress
  )
  if (vaultBalance < microUsdc) {
    const have = formatUnits(vaultBalance, USDC_DECIMALS)
    throw new Error(`Insufficient vault balance. Have ${have} USDC, trying to withdraw ${amountUsdc}`)
  }

  console.log(`[Withdraw] Withdrawing ${amountUsdc} USDC from vault ${vault}...`)
  const tx = await vaultContract.withdrawUSDC(microUsdc)
  const receipt = await tx.wait()

  console.log(`[Withdraw] Confirmed: ${receipt.hash}`)
  return { txHash: receipt.hash as string }
}
