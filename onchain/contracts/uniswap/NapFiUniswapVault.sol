// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title  NapFiUniswapVault
 * @notice Confidential Uniswap v3 LP vault using Zama fhEVM for encrypted balance tracking.
 *         Users deposit USDC; the vault swaps half to WETH internally, provides full-range
 *         USDC/WETH liquidity on Uniswap v3, and tracks user shares as encrypted euint64.
 *
 *         Follows the same encryption pattern as EncryptedVault.sol:
 *           - balanceOf / getBalanceHandle / hasBalance / makeBalanceDecryptable
 *           - FHE.add on deposit, FHE.sub on withdraw
 *           - FHE.allow / FHE.allowThis for ACL permissions
 *           - agentOperator for balance verification
 *
 *         Uniswap v3 Sepolia addresses from:
 *         https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments
 *
 * @dev    Demo / testnet. Not audited.
 */

// ── Minimal interfaces ───────────────────────────────────────────────────────

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata) external payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function increaseLiquidity(IncreaseLiquidityParams calldata) external payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1);
    function decreaseLiquidity(DecreaseLiquidityParams calldata) external
        returns (uint256 amount0, uint256 amount1);
    function collect(CollectParams calldata) external payable
        returns (uint256 amount0, uint256 amount1);
    function positions(uint256 tokenId) external view
        returns (
            uint96, address, address, address, uint24, int24, int24, uint128,
            uint256, uint256, uint128, uint128
        );
    function createAndInitializePoolIfNecessary(
        address token0, address token1, uint24 fee, uint160 sqrtPriceX96
    ) external payable returns (address pool);
}

/// @dev SwapRouter02 / IV3SwapRouter (Sepolia: 0x3bFA…) — no deadline in struct
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata) external payable
        returns (uint256 amountOut);
}

// ── Vault ────────────────────────────────────────────────────────────────────

contract NapFiUniswapVault is ZamaEthereumConfig {

    // ── Encrypted balances (Zama fhEVM — mirrors EncryptedVault.sol) ─────────
    mapping(address => euint64) private encryptedBalances;
    address public agentOperator;

    // ── Plaintext share accounting (needed for Uniswap LP math) ────────────
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    // ── Uniswap v3 ──────────────────────────────────────────────────────────
    IERC20  public immutable usdc;
    IERC20  public immutable weth;
    INonfungiblePositionManager public immutable npm;
    ISwapRouter public immutable swapRouter;

    address public immutable token0;
    address public immutable token1;
    bool    public immutable usdcIsToken0;

    uint24  public constant POOL_FEE   = 3000;     // 0.3 %
    int24   public constant TICK_LOWER = -887220;   // full-range (tickSpacing = 60)
    int24   public constant TICK_UPPER =  887220;

    uint256 public positionTokenId;
    address public owner;

    bool private _locked;

    // ── Events ──────────────────────────────────────────────────────────────
    event DepositUSDC(address indexed user, uint256 usdcAmount);
    event WithdrawUSDC(address indexed user, uint256 sharesBurned, uint256 usdcReturned);
    event PositionInitialized(uint256 tokenId, uint128 liquidity);
    event AgentOperatorUpdated(address indexed oldOperator, address indexed newOperator);

    // ── Modifiers ───────────────────────────────────────────────────────────
    modifier nonReentrant() {
        require(!_locked, "reentrancy");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // ── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _usdc,
        address _weth,
        address _npm,
        address _swapRouter,
        address _agentOperator
    ) {
        require(
            _usdc != address(0) && _weth != address(0) &&
            _npm  != address(0) && _swapRouter != address(0) &&
            _agentOperator != address(0),
            "zero addr"
        );
        usdc       = IERC20(_usdc);
        weth       = IERC20(_weth);
        npm        = INonfungiblePositionManager(_npm);
        swapRouter = ISwapRouter(_swapRouter);
        agentOperator = _agentOperator;
        owner      = msg.sender;

        if (uint160(_usdc) < uint160(_weth)) {
            token0       = _usdc;
            token1       = _weth;
            usdcIsToken0 = true;
        } else {
            token0       = _weth;
            token1       = _usdc;
            usdcIsToken0 = false;
        }
    }

    /// @notice Required so the vault can receive Uniswap v3 position NFTs.
    function onERC721Received(address, address, uint256, bytes calldata)
        external pure returns (bytes4)
    {
        return this.onERC721Received.selector;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Owner: seed initial LP position with USDC + WETH (no swap needed)
    // ═══════════════════════════════════════════════════════════════════════════

    function initializePosition(uint256 usdcAmount, uint256 wethAmount)
        external onlyOwner nonReentrant
    {
        require(positionTokenId == 0, "already init");
        require(usdcAmount > 0 && wethAmount > 0, "amounts");

        usdc.transferFrom(msg.sender, address(this), usdcAmount);
        weth.transferFrom(msg.sender, address(this), wethAmount);

        (uint256 a0, uint256 a1) = usdcIsToken0
            ? (usdcAmount, wethAmount) : (wethAmount, usdcAmount);

        _safeApprove(token0, address(npm), a0);
        _safeApprove(token1, address(npm), a1);

        (uint256 tokenId, uint128 liquidity, , ) = npm.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0, token1: token1, fee: POOL_FEE,
                tickLower: TICK_LOWER, tickUpper: TICK_UPPER,
                amount0Desired: a0, amount1Desired: a1,
                amount0Min: 0, amount1Min: 0,
                recipient: address(this), deadline: block.timestamp
            })
        );

        positionTokenId = tokenId;

        // Plaintext shares
        totalShares = usdcAmount;
        sharesOf[msg.sender] = usdcAmount;

        // Encrypted balance (same pattern as EncryptedVault.deposit)
        euint64 encAmount = FHE.asEuint64(uint64(usdcAmount));
        encryptedBalances[msg.sender] = encAmount;
        FHE.allowThis(encAmount);
        FHE.allow(encAmount, msg.sender);
        FHE.allow(encAmount, agentOperator);

        emit PositionInitialized(tokenId, liquidity);
        emit DepositUSDC(msg.sender, usdcAmount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  User: deposit USDC → swap half to WETH → increase LP → encrypted balance
    // ═══════════════════════════════════════════════════════════════════════════

    function depositUSDC(uint256 amount) external nonReentrant {
        require(positionTokenId != 0, "not init");
        require(amount > 0, "amount");

        usdc.transferFrom(msg.sender, address(this), amount);

        // Swap half USDC → WETH (user never touches WETH)
        uint256 half      = amount / 2;
        uint256 usdcForLP = amount - half;

        _safeApprove(address(usdc), address(swapRouter), half);
        uint256 wethOut = swapRouter.exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn:  address(usdc), tokenOut: address(weth),
                fee: POOL_FEE, recipient: address(this),
                amountIn: half, amountOutMinimum: 0, sqrtPriceLimitX96: 0
            })
        );

        // Increase Uniswap v3 LP position
        (uint256 a0, uint256 a1) = usdcIsToken0
            ? (usdcForLP, wethOut) : (wethOut, usdcForLP);

        _safeApprove(token0, address(npm), a0);
        _safeApprove(token1, address(npm), a1);

        npm.increaseLiquidity(
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: positionTokenId,
                amount0Desired: a0, amount1Desired: a1,
                amount0Min: 0, amount1Min: 0,
                deadline: block.timestamp
            })
        );

        // ── Update plaintext shares ──
        totalShares += amount;
        sharesOf[msg.sender] += amount;

        // ── Update encrypted balance (mirrors EncryptedVault.deposit) ──
        euint64 encAmount = FHE.asEuint64(uint64(amount));
        euint64 current   = encryptedBalances[msg.sender];
        euint64 newBalance;
        if (FHE.isInitialized(current)) {
            newBalance = FHE.add(current, encAmount);
        } else {
            newBalance = encAmount;
        }
        encryptedBalances[msg.sender] = newBalance;
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, msg.sender);
        FHE.allow(newBalance, agentOperator);

        emit DepositUSDC(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  User: withdraw shares → remove LP → swap WETH → return USDC
    // ═══════════════════════════════════════════════════════════════════════════

    function withdrawUSDC(uint256 shares) external nonReentrant {
        require(shares > 0 && sharesOf[msg.sender] >= shares, "shares");
        require(positionTokenId != 0, "no pos");

        // ── Decrease proportional liquidity ──
        (, , , , , , , uint128 totalLiq, , , , ) = npm.positions(positionTokenId);
        uint128 liqToRemove = uint128((uint256(totalLiq) * shares) / totalShares);

        if (liqToRemove > 0) {
            npm.decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: positionTokenId, liquidity: liqToRemove,
                    amount0Min: 0, amount1Min: 0, deadline: block.timestamp
                })
            );
        }

        // ── Collect removed tokens + accrued fees ──
        (uint256 c0, uint256 c1) = npm.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: positionTokenId, recipient: address(this),
                amount0Max: type(uint128).max, amount1Max: type(uint128).max
            })
        );

        // ── Update plaintext shares ──
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;

        // ── Update encrypted balance (mirrors EncryptedVault.withdraw) ──
        euint64 encShares  = FHE.asEuint64(uint64(shares));
        euint64 current    = encryptedBalances[msg.sender];
        euint64 newBalance = FHE.sub(current, encShares);
        encryptedBalances[msg.sender] = newBalance;
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, msg.sender);
        FHE.allow(newBalance, agentOperator);

        // ── Swap WETH portion back to USDC ──
        (uint256 userUsdc, uint256 userWeth) = usdcIsToken0
            ? (c0, c1) : (c1, c0);

        if (userWeth > 0) {
            _safeApprove(address(weth), address(swapRouter), userWeth);
            userUsdc += swapRouter.exactInputSingle(
                ISwapRouter.ExactInputSingleParams({
                    tokenIn:  address(weth), tokenOut: address(usdc),
                    fee: POOL_FEE, recipient: address(this),
                    amountIn: userWeth, amountOutMinimum: 0, sqrtPriceLimitX96: 0
                })
            );
        }

        require(usdc.transfer(msg.sender, userUsdc), "xfer");
        emit WithdrawUSDC(msg.sender, shares, userUsdc);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Encrypted balance views (same API as EncryptedVault.sol)
    // ═══════════════════════════════════════════════════════════════════════════

    /// @notice Plaintext share balance (USDC-denominated; does not include unrealized fees/IL).
    function getUsdcBalance(address user) external view returns (uint256) {
        return sharesOf[user];
    }

    function balanceOf(address user) external view returns (euint64) {
        return encryptedBalances[user];
    }

    function getBalanceHandle(address user) external view returns (bytes32) {
        euint64 balance = encryptedBalances[user];
        require(FHE.isInitialized(balance), "No balance initialized");
        return euint64.unwrap(balance);
    }

    function hasBalance(address user) external view returns (bool) {
        return FHE.isInitialized(encryptedBalances[user]);
    }

    function makeBalanceDecryptable(address user) external {
        require(msg.sender == user || msg.sender == agentOperator, "Not authorized");
        euint64 balance = encryptedBalances[user];
        require(FHE.isInitialized(balance), "No balance found");
        FHE.allow(balance, user);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════════════════════════════════════

    function updateAgentOperator(address newOperator) external {
        require(msg.sender == agentOperator, "Only operator");
        require(newOperator != address(0), "zero addr");
        address old = agentOperator;
        agentOperator = newOperator;
        emit AgentOperatorUpdated(old, newOperator);
    }

    function getPositionLiquidity() external view returns (uint128) {
        if (positionTokenId == 0) return 0;
        (, , , , , , , uint128 liq, , , , ) = npm.positions(positionTokenId);
        return liq;
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _safeApprove(address token, address spender, uint256 amount) internal {
        IERC20(token).approve(spender, 0);
        IERC20(token).approve(spender, amount);
    }
}
