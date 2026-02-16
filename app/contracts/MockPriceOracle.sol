// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPriceOracle
 * @dev Simple price oracle for testnet with admin-updatable prices
 * Returns prices in USD with 8 decimal precision (e.g., $2000.00 = 200000000000)
 */
contract MockPriceOracle is Ownable {
    uint8 public constant DECIMALS = 8;

    // Asset address => USD price (8 decimals)
    mapping(address => uint256) public prices;

    event PriceUpdated(address indexed asset, uint256 newPrice);

    constructor() Ownable(msg.sender) {
        // Set initial prices (in USD with 8 decimals)
        // ETH: $2000
        prices[address(0)] = 2000 * 10**DECIMALS;
        // These will be updated with actual token addresses after deployment
    }

    /**
     * @dev Get the latest price for an asset
     * @param asset Address of the asset (use address(0) for ETH)
     * @return price USD price with 8 decimals
     */
    function getLatestPrice(address asset) external view returns (uint256) {
        uint256 price = prices[asset];
        require(price > 0, "Price not set for asset");
        return price;
    }

    /**
     * @dev Update price for an asset (only owner)
     * @param asset Address of the asset
     * @param newPrice New USD price with 8 decimals
     */
    function updatePrice(address asset, uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "Price must be greater than 0");
        prices[asset] = newPrice;
        emit PriceUpdated(asset, newPrice);
    }

    /**
     * @dev Batch update prices
     * @param assets Array of asset addresses
     * @param newPrices Array of new prices
     */
    function updatePrices(
        address[] calldata assets,
        uint256[] calldata newPrices
    ) external onlyOwner {
        require(assets.length == newPrices.length, "Array length mismatch");
        
        for (uint256 i = 0; i < assets.length; i++) {
            require(newPrices[i] > 0, "Price must be greater than 0");
            prices[assets[i]] = newPrices[i];
            emit PriceUpdated(assets[i], newPrices[i]);
        }
    }
}
