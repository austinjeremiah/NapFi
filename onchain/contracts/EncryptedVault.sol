// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title EncryptedVault
 * @notice Confidential DeFi savings vault using Zama fhEVM
 * @dev All balances are stored as encrypted euint64 values
 * 
 * Key Features:
 * - Deposits are encrypted and added to user balances
 * - Withdrawals use encrypted comparisons to prevent overdrafts
 * - Only authorized addresses can decrypt their own balance
 * - Agent operators can read balances to verify execution
 */
contract EncryptedVault is ZamaEthereumConfig {
    
    // Mapping from user address to their encrypted balance
    mapping(address => euint64) private balances;
    
    // Agent operator address - can read all balances for verification
    address public agentOperator;
    
    // Events
    event Deposit(address indexed user, bytes32 encryptedAmountHandle);
    event Withdrawal(address indexed user, bytes32 encryptedAmountHandle);
    event AgentOperatorUpdated(address indexed oldOperator, address indexed newOperator);
    
    /**
     * @notice Constructor sets the initial agent operator
     * @param _agentOperator Address that can read encrypted balances
     */
    constructor(address _agentOperator) {
        require(_agentOperator != address(0), "Invalid operator address");
        agentOperator = _agentOperator;
    }
    
    /**
     * @notice Deposit encrypted amount into vault
     * @dev Anyone can call this to deposit for any user (agent deposits on behalf of users)
     * @param encryptedAmount The encrypted amount handle (externalEuint64)
     * @param inputProof The proof from FHE.createEncryptedInput
     * @param user The user whose balance should be credited
     */
    function deposit(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        address user
    ) external {
        require(user != address(0), "Invalid user address");
        
        // Convert the external encrypted input to internal euint64
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        
        // Get current balance (will be 0 if first deposit)
        euint64 currentBalance = balances[user];
        
        // Add the encrypted amount to existing balance
        // FHE.add performs homomorphic addition on encrypted values
        euint64 newBalance;
        if (FHE.isInitialized(currentBalance)) {
            newBalance = FHE.add(currentBalance, amount);
        } else {
            newBalance = amount;
        }
        
        // Store the new encrypted balance
        balances[user] = newBalance;
        
        // CRITICAL: Grant ACL permissions
        // Allow this contract to read the balance in future transactions
        FHE.allowThis(newBalance);
        
        // Allow the user to decrypt their own balance
        FHE.allow(newBalance, user);
        
        // Allow the agent operator to read balances for verification
        FHE.allow(newBalance, agentOperator);
        
        emit Deposit(user, externalEuint64.unwrap(encryptedAmount));
    }
    
    /**
     * @notice Withdraw encrypted amount from vault
     * @dev Uses encrypted comparison to prevent overdrafts without revealing balance
     * @param encryptedAmount The encrypted withdrawal amount
     * @param inputProof The proof from FHE.createEncryptedInput
     */
    function withdraw(
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external {
        address user = msg.sender;
        
        // Convert the external encrypted input to internal euint64
        euint64 requestedAmount = FHE.fromExternal(encryptedAmount, inputProof);
        
        // Get current balance
        euint64 currentBalance = balances[user];
        require(FHE.isInitialized(currentBalance), "No balance found");
        
        // Check if balance >= requested amount (encrypted comparison)
        // This returns an encrypted boolean (ebool)
        ebool hasEnoughFunds = FHE.le(requestedAmount, currentBalance);
        
        // If sufficient funds, subtract requested amount. Otherwise subtract 0
        // This prevents revealing the actual balance during failure
        euint64 zero = FHE.asEuint64(0);
        euint64 amountToWithdraw = FHE.select(hasEnoughFunds, requestedAmount, zero);
        
        // Subtract from balance
        euint64 newBalance = FHE.sub(currentBalance, amountToWithdraw);
        
        // Update storage
        balances[user] = newBalance;
        
        // Grant ACL permissions for new balance
        FHE.allowThis(newBalance);
        FHE.allow(newBalance, user);
        FHE.allow(newBalance, agentOperator);
        
        emit Withdrawal(user, externalEuint64.unwrap(encryptedAmount));
        
        // NOTE: In production, you would trigger actual token transfer here
        // For testnet demo, this just updates the encrypted accounting
    }
    
    /**
     * @notice Get encrypted balance for a user
     * @dev Returns the ciphertext handle - cannot be read without decryption
     * @param user Address to query
     * @return The encrypted balance as a euint64 handle
     */
    function balanceOf(address user) external view returns (euint64) {
        return balances[user];
    }
    
    /**
     * @notice Get the raw encrypted balance handle for client-side decryption
     * @dev Frontend uses this with relayer SDK to decrypt
     * @param user Address to query
     * @return handle The raw bytes32 handle of the encrypted balance
     */
    function getBalanceHandle(address user) external view returns (bytes32) {
        euint64 balance = balances[user];
        require(FHE.isInitialized(balance), "No balance initialized");
        
        // Convert euint64 to bytes32 handle for frontend
        return euint64.unwrap(balance);
    }
    
    /**
     * @notice Update the agent operator address
     * @dev Only current operator can update (for security during demo)
     * @param newOperator New operator address
     */
    function updateAgentOperator(address newOperator) external {
        require(msg.sender == agentOperator, "Only operator can update");
        require(newOperator != address(0), "Invalid operator address");
        
        address oldOperator = agentOperator;
        agentOperator = newOperator;
        
        emit AgentOperatorUpdated(oldOperator, newOperator);
    }
    
    /**
     * @notice Check if a balance is initialized for a user
     * @param user Address to check
     * @return True if user has a balance entry
     */
    function hasBalance(address user) external view returns (bool) {
        return FHE.isInitialized(balances[user]);
    }
    
    /**
     * @notice Emergency function to allow a user to make their balance decryptable
     * @dev This is a convenience function for the frontend
     * User must call this once per session to decrypt their balance
     */
    function makeBalanceDecryptable(address user) external {
        require(msg.sender == user || msg.sender == agentOperator, "Not authorized");
        euint64 balance = balances[user];
        require(FHE.isInitialized(balance), "No balance found");
        
        // Re-grant permission (in case ACL was reset)
        FHE.allow(balance, user);
    }
}
