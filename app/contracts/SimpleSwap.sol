// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPriceOracle {
    function getLatestPrice(address asset) external view returns (uint256);
}

/**
 * @title SimpleSwap
 * @dev Oracle-based swap contract for ETH <-> WBTC swaps
 * Uses MockPriceOracle for pricing (not AMM). 0.3% fee on all swaps.
 */
contract SimpleSwap is Ownable, ReentrancyGuard {
    IPriceOracle public oracle;
    IERC20 public wbtc;

    uint256 public constant FEE_BPS = 30; // 0.3% = 30 basis points
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint8 public constant ORACLE_DECIMALS = 8;
    uint8 public constant WBTC_DECIMALS = 8;

    event Swapped(
        address indexed user,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOut
    );
    event LiquidityAdded(address indexed token, uint256 amount);

    constructor(address _oracle, address _wbtc) Ownable(msg.sender) {
        oracle = IPriceOracle(_oracle);
        wbtc = IERC20(_wbtc);
    }

    /**
     * @dev Swap ETH for WBTC. User sends ETH, receives WBTC at oracle rate minus fee.
     */
    function swapETHForWBTC() external payable nonReentrant {
        require(msg.value > 0, "Must send ETH");

        uint256 ethPrice = oracle.getLatestPrice(address(0));
        uint256 wbtcPrice = oracle.getLatestPrice(address(wbtc));

        // Calculate WBTC output: (ethAmount * ethPrice / wbtcPrice) adjusted for decimals
        // ETH has 18 decimals, WBTC has 8 decimals, oracle prices have 8 decimals
        // output = msg.value * ethPrice / wbtcPrice / 10^(18-8)
        uint256 wbtcOut = (msg.value * ethPrice) / wbtcPrice / (10 ** (18 - WBTC_DECIMALS));

        // Deduct fee
        uint256 fee = (wbtcOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 wbtcAfterFee = wbtcOut - fee;

        require(wbtcAfterFee > 0, "Output too small");
        require(wbtc.balanceOf(address(this)) >= wbtcAfterFee, "Insufficient WBTC liquidity");

        wbtc.transfer(msg.sender, wbtcAfterFee);

        emit Swapped(msg.sender, address(0), address(wbtc), msg.value, wbtcAfterFee);
    }

    /**
     * @dev Swap WBTC for ETH. User sends WBTC, receives ETH at oracle rate minus fee.
     * User must approve this contract for WBTC first.
     */
    function swapWBTCForETH(uint256 wbtcAmount) external nonReentrant {
        require(wbtcAmount > 0, "Amount must be > 0");

        uint256 ethPrice = oracle.getLatestPrice(address(0));
        uint256 wbtcPrice = oracle.getLatestPrice(address(wbtc));

        // Calculate ETH output: (wbtcAmount * wbtcPrice / ethPrice) adjusted for decimals
        // WBTC has 8 decimals, ETH has 18 decimals
        // output = wbtcAmount * wbtcPrice * 10^(18-8) / ethPrice
        uint256 ethOut = (wbtcAmount * wbtcPrice * (10 ** (18 - WBTC_DECIMALS))) / ethPrice;

        // Deduct fee
        uint256 fee = (ethOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 ethAfterFee = ethOut - fee;

        require(ethAfterFee > 0, "Output too small");
        require(address(this).balance >= ethAfterFee, "Insufficient ETH liquidity");

        wbtc.transferFrom(msg.sender, address(this), wbtcAmount);

        (bool sent, ) = payable(msg.sender).call{value: ethAfterFee}("");
        require(sent, "ETH transfer failed");

        emit Swapped(msg.sender, address(wbtc), address(0), wbtcAmount, ethAfterFee);
    }

    /**
     * @dev Get a quote for a swap (view function, no state changes).
     * @param fromToken address(0) for ETH, or WBTC address
     * @param toToken address(0) for ETH, or WBTC address
     * @param amountIn Amount of input token (in its native decimals)
     * @return amountOut Amount of output token after fee
     */
    function getQuote(
        address fromToken,
        address toToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut) {
        require(amountIn > 0, "Amount must be > 0");
        require(fromToken != toToken, "Same token");

        uint256 fromPrice = oracle.getLatestPrice(fromToken);
        uint256 toPrice = oracle.getLatestPrice(toToken);

        if (fromToken == address(0) && toToken == address(wbtc)) {
            // ETH -> WBTC
            amountOut = (amountIn * fromPrice) / toPrice / (10 ** (18 - WBTC_DECIMALS));
        } else if (fromToken == address(wbtc) && toToken == address(0)) {
            // WBTC -> ETH
            amountOut = (amountIn * fromPrice * (10 ** (18 - WBTC_DECIMALS))) / toPrice;
        } else {
            revert("Unsupported pair");
        }

        // Deduct fee
        uint256 feeAmount = (amountOut * FEE_BPS) / BPS_DENOMINATOR;
        amountOut = amountOut - feeAmount;
    }

    /**
     * @dev Owner can add ETH liquidity to the pool.
     */
    function addETHLiquidity() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");
        emit LiquidityAdded(address(0), msg.value);
    }

    /**
     * @dev Owner can add WBTC liquidity. Must approve first.
     */
    function addWBTCLiquidity(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        wbtc.transferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(address(wbtc), amount);
    }

    /**
     * @dev View pool reserves.
     */
    function getReserves() external view returns (uint256 ethReserve, uint256 wbtcReserve) {
        ethReserve = address(this).balance;
        wbtcReserve = wbtc.balanceOf(address(this));
    }

    // Accept ETH sent directly
    receive() external payable {}
}
