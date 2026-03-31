// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Uniswap v3 — Ethereum Sepolia (testnet) deployment addresses
 * @notice Values below are **Sepolia-only**, from Uniswap’s official deployments reference.
 * @dev Source (verify before production):  
 *      https://docs.uniswap.org/contracts/v3/reference/deployments/ethereum-deployments  
 *      “Integrators should no longer assume that they are deployed to the same addresses across chains.”
 *
 *      **WETH** is listed under “Wrapped Native Token Addresses” on that page.  
 *      **USDC** is *not* on the deployments table — use the ERC-20 you actually pool against.
 *      For the common Sepolia **USDC / WETH** demo, Circle’s test USDC is widely used (`0x1c7D…`).
 */
library UniswapV3SepoliaConstants {
    // --- Core protocol (Ethereum Sepolia column) ---

    /// @dev UniswapV3Factory — docs: Ethereum Deployments table
    address internal constant UNISWAP_V3_FACTORY =
        0x0227628f3F023bb0B980b67D528571c95c6DaC1c;

    /// @dev NonfungiblePositionManager — mint/burn/increase liquidity positions (ERC-721)
    address internal constant NONFUNGIBLE_POSITION_MANAGER =
        0x1238536071E1c677A632429e3655c799b22cDA52;

    /// @dev SwapRouter02 — periphery swap router (see also Universal Router below)
    address internal constant SWAP_ROUTER_02 =
        0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;

    /// @dev QuoterV2 — off-chain style quotes (`quoteExactInputSingle`, etc.)
    address internal constant QUOTER_V2 =
        0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3;

    /// @dev Universal Router — preferred entrypoint for swaps per Uniswap docs section on the same page
    address internal constant UNIVERSAL_ROUTER =
        0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b;

    /// @dev Permit2 — same address on mainnet and Sepolia per docs
    address internal constant PERMIT2 =
        0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // --- Wrapped native (Ethereum Sepolia) — from “Wrapped Native Token Addresses” ---

    /// @dev WETH9 on Sepolia (chainId 11155111)
    address internal constant WETH9 =
        0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    // --- Pair leg: USDC (not in Uniswap deployments table; standard Circle test token on Sepolia) ---

    /// @notice Circle Sepolia test USDC — common counterparty for USDC/WETH pools on testnets.
    address internal constant SEPOLIA_USDC_CIRCLE =
        0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    /// @dev Uniswap v3 fee tiers (basis points of 1e6): 100 = 0.01%, 500 = 0.05%, 3000 = 0.3%, 10000 = 1%
    uint24 internal constant FEE_LOWEST = 100;
    uint24 internal constant FEE_LOW = 500;
    uint24 internal constant FEE_MEDIUM = 3000;
    uint24 internal constant FEE_HIGH = 10000;
}

/// @notice Minimal factory — pool lookup per Uniswap docs (`getPool`)
interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}
