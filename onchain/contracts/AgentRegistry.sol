// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentRegistry
 * @notice Registry mapping users to their ERC-8004 agents and encrypted vaults
 * @dev Permissionless registration - anyone can register vault mappings
 * 
 * This contract serves as a lookup table for the frontend to discover:
 * - Which ERC-8004 agent ID belongs to a user
 * - Which EncryptedVault address stores their funds
 */
contract AgentRegistry {
    
    // User data structure
    struct UserAgent {
        uint256 agentId;        // ERC-8004 token ID from IdentityRegistry
        address vaultAddress;   // EncryptedVault contract address
        bool isRegistered;      // Registration status
        uint256 registeredAt;   // Timestamp of registration
    }
    
    // Mapping from user address to their agent data
    mapping(address => UserAgent) private userAgents;
    
    // Reverse lookup: agent ID to user address
    mapping(uint256 => address) private agentToUser;
    
    // Events
    event AgentRegistered(
        address indexed user,
        uint256 indexed agentId,
        address vaultAddress,
        uint256 timestamp
    );
    
    event AgentUpdated(
        address indexed user,
        uint256 oldAgentId,
        uint256 newAgentId,
        address newVaultAddress
    );
    
    /**
     * @notice Register a user's agent and vault mapping
     * @dev Permissionless - backend or user can call this
     * @param user The user address to register
     * @param agentId The ERC-8004 agent token ID
     * @param vault The EncryptedVault contract address
     */
    function registerUserAgent(
        address user,
        uint256 agentId,
        address vault
    ) external {
        require(user != address(0), "Invalid user address");
        require(vault != address(0), "Invalid vault address");
        require(agentId > 0, "Invalid agent ID");
        
        UserAgent storage userAgent = userAgents[user];
        
        if (userAgent.isRegistered) {
            // Update existing registration
            uint256 oldAgentId = userAgent.agentId;
            
            // Clear old reverse mapping
            delete agentToUser[oldAgentId];
            
            // Update with new data
            userAgent.agentId = agentId;
            userAgent.vaultAddress = vault;
            
            // Set new reverse mapping
            agentToUser[agentId] = user;
            
            emit AgentUpdated(user, oldAgentId, agentId, vault);
        } else {
            // New registration
            userAgents[user] = UserAgent({
                agentId: agentId,
                vaultAddress: vault,
                isRegistered: true,
                registeredAt: block.timestamp
            });
            
            // Set reverse mapping
            agentToUser[agentId] = user;
            
            emit AgentRegistered(user, agentId, vault, block.timestamp);
        }
    }
    
    /**
     * @notice Lookup agent and vault for a user
     * @param user User address to query
     * @return agentId The ERC-8004 agent token ID
     * @return vaultAddress The EncryptedVault contract address
    * @return registrationStatus Whether the user has registered
     * @return registeredAt Timestamp of registration
     */
    function lookup(address user) external view returns (
        uint256 agentId,
        address vaultAddress,
        bool registrationStatus,
        uint256 registeredAt
    ) {
        UserAgent memory userAgent = userAgents[user];
        return (
            userAgent.agentId,
            userAgent.vaultAddress,
            userAgent.isRegistered,
            userAgent.registeredAt
        );
    }
    
    /**
     * @notice Get user address from agent ID
     * @param agentId ERC-8004 agent token ID
     * @return user The user address associated with this agent
     */
    function getUserByAgent(uint256 agentId) external view returns (address user) {
        return agentToUser[agentId];
    }
    
    /**
     * @notice Get vault address for a user
     * @param user User address
     * @return vault The EncryptedVault contract address
     */
    function getVaultAddress(address user) external view returns (address vault) {
        require(userAgents[user].isRegistered, "User not registered");
        return userAgents[user].vaultAddress;
    }
    
    /**
     * @notice Get agent ID for a user
     * @param user User address
     * @return agentId The ERC-8004 agent token ID
     */
    function getAgentId(address user) external view returns (uint256 agentId) {
        require(userAgents[user].isRegistered, "User not registered");
        return userAgents[user].agentId;
    }
    
    /**
     * @notice Check if a user is registered
     * @param user User address to check
     * @return True if registered
     */
    function isRegistered(address user) external view returns (bool) {
        return userAgents[user].isRegistered;
    }
    
    /**
     * @notice Batch lookup for multiple users
     * @param users Array of user addresses
     * @return agentIds Array of agent IDs
     * @return vaultAddresses Array of vault addresses
     * @return registrationStatuses Array of registration statuses
     */
    function batchLookup(address[] calldata users) external view returns (
        uint256[] memory agentIds,
        address[] memory vaultAddresses,
        bool[] memory registrationStatuses
    ) {
        uint256 length = users.length;
        agentIds = new uint256[](length);
        vaultAddresses = new address[](length);
        registrationStatuses = new bool[](length);
        
        for (uint256 i = 0; i < length; i++) {
            UserAgent memory userAgent = userAgents[users[i]];
            agentIds[i] = userAgent.agentId;
            vaultAddresses[i] = userAgent.vaultAddress;
            registrationStatuses[i] = userAgent.isRegistered;
        }
        
        return (agentIds, vaultAddresses, registrationStatuses);
    }
}
