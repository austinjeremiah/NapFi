// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NapFiUsdcVault
 * @notice Holds user USDC in shares, supplies underlying to Aave V3 Pool.
 *         Compatible with existing frontend: depositUSDC / withdrawUSDC / getUsdcBalance.
 *
 *         getUsdcBalance(user) returns the user's pro-rata claim on total assets (idle USDC + aUSDC).
 */
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev Minimal Aave V3 Pool
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

contract NapFiUsdcVault {
    IERC20 public immutable usdc;
    IAavePool public immutable pool;
    IERC20 public immutable aToken;

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;

    bool private _locked;

    event DepositUSDC(address indexed user, uint256 amount);
    event WithdrawUSDC(address indexed user, uint256 amount);

    modifier nonReentrant() {
        require(!_locked, "reentrancy");
        _locked = true;
        _;
        _locked = false;
    }

    /// @param _aToken USDC aToken on this chain (Pool.getReserveData(usdc).aTokenAddress)
    constructor(address _usdc, address _pool, address _aToken) {
        require(_usdc != address(0) && _pool != address(0) && _aToken != address(0), "zero addr");
        usdc = IERC20(_usdc);
        pool = IAavePool(_pool);
        aToken = IERC20(_aToken);
    }

    /// @notice Idle USDC in vault + aToken balance (underlying-denominated).
    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this)) + aToken.balanceOf(address(this));
    }

    /// @notice User's claim on underlying USDC (pro-rata of shares).
    function getUsdcBalance(address user) external view returns (uint256) {
        uint256 ts = totalShares;
        if (ts == 0) return 0;
        return (sharesOf[user] * totalAssets()) / ts;
    }

    /// @dev Pull USDC, mint shares, supply to Aave.
    function depositUSDC(uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        uint256 taBefore = totalAssets();
        usdc.transferFrom(msg.sender, address(this), amount);

        uint256 shares;
        if (totalShares == 0) {
            shares = amount;
        } else {
            require(taBefore > 0, "ta");
            shares = (amount * totalShares) / taBefore;
        }
        require(shares > 0, "shares");
        totalShares += shares;
        sharesOf[msg.sender] += shares;

        _supplyToAave(amount);
        emit DepositUSDC(msg.sender, amount);
    }

    function _supplyToAave(uint256 amount) internal {
        usdc.approve(address(pool), 0);
        require(usdc.approve(address(pool), amount), "approve");
        pool.supply(address(usdc), amount, address(this), 0);
    }

    /// @notice Withdraw underlying USDC to msg.sender (pulls from Aave if needed).
    function withdrawUSDC(uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        uint256 ts = totalShares;
        require(ts > 0, "empty");

        uint256 userSh = sharesOf[msg.sender];
        require(userSh > 0, "no shares");

        uint256 ta = totalAssets();
        uint256 maxOut = (userSh * ta) / ts;
        require(amount <= maxOut, "exceeds");

        uint256 sharesBurn = (amount * ts + ta - 1) / ta;
        if (sharesBurn > userSh) sharesBurn = userSh;

        sharesOf[msg.sender] = userSh - sharesBurn;
        totalShares = ts - sharesBurn;

        uint256 idle = usdc.balanceOf(address(this));
        if (idle < amount) {
            pool.withdraw(address(usdc), amount - idle, address(this));
        }

        require(usdc.transfer(msg.sender, amount), "xfer");
        emit WithdrawUSDC(msg.sender, amount);
    }
}
