// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title USDX
 * @dev Stablecoin token for the credit protocol
 * Only the CreditProtocol contract can mint and burn tokens
 */
contract USDX is ERC20, Ownable {
    address public creditProtocol;

    event CreditProtocolUpdated(address indexed newProtocol);

    constructor() ERC20("USDX Stablecoin", "USDX") Ownable(msg.sender) {}

    /**
     * @dev Set the credit protocol address (only owner)
     * @param _creditProtocol Address of the credit protocol contract
     */
    function setCreditProtocol(address _creditProtocol) external onlyOwner {
        require(_creditProtocol != address(0), "Invalid address");
        creditProtocol = _creditProtocol;
        emit CreditProtocolUpdated(_creditProtocol);
    }

    /**
     * @dev Mint tokens (only credit protocol)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == creditProtocol, "Only protocol can mint");
        _mint(to, amount);
    }

    /**
     * @dev Burn tokens (only credit protocol)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external {
        require(msg.sender == creditProtocol, "Only protocol can burn");
        _burn(from, amount);
    }
}
