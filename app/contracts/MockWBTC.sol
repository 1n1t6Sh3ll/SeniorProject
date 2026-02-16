// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockWBTC
 * @dev Mock Wrapped Bitcoin token for testing on testnet
 * Includes a faucet function for users to obtain test tokens
 */
contract MockWBTC is ERC20, Ownable {
    // 8 decimals to match real WBTC
    uint8 private constant DECIMALS = 8;
    uint256 public constant FAUCET_AMOUNT = 1 * 10**DECIMALS; // 1 WBTC per request
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address => uint256) public lastFaucetRequest;

    event FaucetUsed(address indexed user, uint256 amount);

    constructor() ERC20("Mock Wrapped Bitcoin", "WBTC") Ownable(msg.sender) {
        // Mint initial supply to owner for distribution
        _mint(msg.sender, 1000 * 10**DECIMALS); // 1000 WBTC
    }

    /**
     * @dev Returns 8 decimals to match real WBTC
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @dev Faucet function - users can request test WBTC once per day
     */
    function faucet() external {
        require(
            block.timestamp >= lastFaucetRequest[msg.sender] + FAUCET_COOLDOWN,
            "Faucet cooldown active"
        );
        
        lastFaucetRequest[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
        
        emit FaucetUsed(msg.sender, FAUCET_AMOUNT);
    }

    /**
     * @dev Owner can mint additional tokens for testing
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
