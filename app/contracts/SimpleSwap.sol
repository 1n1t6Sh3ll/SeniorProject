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
 * @dev Oracle-based swap contract for ETH <-> WBTC <-> USDX swaps
 * Uses MockPriceOracle for pricing (not AMM). 0.3% fee on all swaps.
 */
contract SimpleSwap is Ownable, ReentrancyGuard {
    IPriceOracle public oracle;
    IERC20 public wbtc;
    IERC20 public usdx;

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

    constructor(address _oracle, address _wbtc, address _usdx) Ownable(msg.sender) {
        oracle = IPriceOracle(_oracle);
        wbtc = IERC20(_wbtc);
        usdx = IERC20(_usdx);
    }

    // ========== ETH <-> WBTC ==========

    function swapETHForWBTC() external payable nonReentrant {
        require(msg.value > 0, "Must send ETH");
        uint256 ethPrice = oracle.getLatestPrice(address(0));
        uint256 wbtcPrice = oracle.getLatestPrice(address(wbtc));
        uint256 wbtcOut = (msg.value * ethPrice) / wbtcPrice / (10 ** (18 - WBTC_DECIMALS));
        uint256 fee = (wbtcOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 wbtcAfterFee = wbtcOut - fee;
        require(wbtcAfterFee > 0, "Output too small");
        require(wbtc.balanceOf(address(this)) >= wbtcAfterFee, "Insufficient WBTC liquidity");
        wbtc.transfer(msg.sender, wbtcAfterFee);
        emit Swapped(msg.sender, address(0), address(wbtc), msg.value, wbtcAfterFee);
    }

    function swapWBTCForETH(uint256 wbtcAmount) external nonReentrant {
        require(wbtcAmount > 0, "Amount must be > 0");
        uint256 ethPrice = oracle.getLatestPrice(address(0));
        uint256 wbtcPrice = oracle.getLatestPrice(address(wbtc));
        uint256 ethOut = (wbtcAmount * wbtcPrice * (10 ** (18 - WBTC_DECIMALS))) / ethPrice;
        uint256 fee = (ethOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 ethAfterFee = ethOut - fee;
        require(ethAfterFee > 0, "Output too small");
        require(address(this).balance >= ethAfterFee, "Insufficient ETH liquidity");
        wbtc.transferFrom(msg.sender, address(this), wbtcAmount);
        (bool sent, ) = payable(msg.sender).call{value: ethAfterFee}("");
        require(sent, "ETH transfer failed");
        emit Swapped(msg.sender, address(wbtc), address(0), wbtcAmount, ethAfterFee);
    }

    // ========== ETH <-> USDX ==========

    function swapETHForUSDX() external payable nonReentrant {
        require(msg.value > 0, "Must send ETH");
        uint256 ethPrice = oracle.getLatestPrice(address(0));
        uint256 usdxPrice = oracle.getLatestPrice(address(usdx));
        // ETH (18 dec) -> USDX (18 dec): same decimals, direct conversion
        uint256 usdxOut = (msg.value * ethPrice) / usdxPrice;
        uint256 fee = (usdxOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 usdxAfterFee = usdxOut - fee;
        require(usdxAfterFee > 0, "Output too small");
        require(usdx.balanceOf(address(this)) >= usdxAfterFee, "Insufficient USDX liquidity");
        usdx.transfer(msg.sender, usdxAfterFee);
        emit Swapped(msg.sender, address(0), address(usdx), msg.value, usdxAfterFee);
    }

    function swapUSDXForETH(uint256 usdxAmount) external nonReentrant {
        require(usdxAmount > 0, "Amount must be > 0");
        uint256 ethPrice = oracle.getLatestPrice(address(0));
        uint256 usdxPrice = oracle.getLatestPrice(address(usdx));
        // USDX (18 dec) -> ETH (18 dec): same decimals, direct conversion
        uint256 ethOut = (usdxAmount * usdxPrice) / ethPrice;
        uint256 fee = (ethOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 ethAfterFee = ethOut - fee;
        require(ethAfterFee > 0, "Output too small");
        require(address(this).balance >= ethAfterFee, "Insufficient ETH liquidity");
        usdx.transferFrom(msg.sender, address(this), usdxAmount);
        (bool sent, ) = payable(msg.sender).call{value: ethAfterFee}("");
        require(sent, "ETH transfer failed");
        emit Swapped(msg.sender, address(usdx), address(0), usdxAmount, ethAfterFee);
    }

    // ========== WBTC <-> USDX ==========

    function swapWBTCForUSDX(uint256 wbtcAmount) external nonReentrant {
        require(wbtcAmount > 0, "Amount must be > 0");
        uint256 wbtcPrice = oracle.getLatestPrice(address(wbtc));
        uint256 usdxPrice = oracle.getLatestPrice(address(usdx));
        // WBTC (8 dec) -> USDX (18 dec): multiply by 10^10
        uint256 usdxOut = (wbtcAmount * wbtcPrice * (10 ** (18 - WBTC_DECIMALS))) / usdxPrice;
        uint256 fee = (usdxOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 usdxAfterFee = usdxOut - fee;
        require(usdxAfterFee > 0, "Output too small");
        require(usdx.balanceOf(address(this)) >= usdxAfterFee, "Insufficient USDX liquidity");
        wbtc.transferFrom(msg.sender, address(this), wbtcAmount);
        usdx.transfer(msg.sender, usdxAfterFee);
        emit Swapped(msg.sender, address(wbtc), address(usdx), wbtcAmount, usdxAfterFee);
    }

    function swapUSDXForWBTC(uint256 usdxAmount) external nonReentrant {
        require(usdxAmount > 0, "Amount must be > 0");
        uint256 wbtcPrice = oracle.getLatestPrice(address(wbtc));
        uint256 usdxPrice = oracle.getLatestPrice(address(usdx));
        // USDX (18 dec) -> WBTC (8 dec): divide by 10^10
        uint256 wbtcOut = (usdxAmount * usdxPrice) / wbtcPrice / (10 ** (18 - WBTC_DECIMALS));
        uint256 fee = (wbtcOut * FEE_BPS) / BPS_DENOMINATOR;
        uint256 wbtcAfterFee = wbtcOut - fee;
        require(wbtcAfterFee > 0, "Output too small");
        require(wbtc.balanceOf(address(this)) >= wbtcAfterFee, "Insufficient WBTC liquidity");
        usdx.transferFrom(msg.sender, address(this), usdxAmount);
        wbtc.transfer(msg.sender, wbtcAfterFee);
        emit Swapped(msg.sender, address(usdx), address(wbtc), usdxAmount, wbtcAfterFee);
    }

    // ========== Quotes ==========

    function getQuote(
        address fromToken,
        address toToken,
        uint256 amountIn
    ) external view returns (uint256 amountOut) {
        require(amountIn > 0, "Amount must be > 0");
        require(fromToken != toToken, "Same token");

        uint256 fromPrice = oracle.getLatestPrice(fromToken);
        uint256 toPrice = oracle.getLatestPrice(toToken);

        uint8 fromDec = _getDecimals(fromToken);
        uint8 toDec = _getDecimals(toToken);

        if (fromDec == toDec) {
            // Same decimals (ETH<->USDX): direct
            amountOut = (amountIn * fromPrice) / toPrice;
        } else if (fromDec > toDec) {
            // e.g. ETH/USDX (18) -> WBTC (8): divide by 10^(18-8)
            amountOut = (amountIn * fromPrice) / toPrice / (10 ** (fromDec - toDec));
        } else {
            // e.g. WBTC (8) -> ETH/USDX (18): multiply by 10^(18-8)
            amountOut = (amountIn * fromPrice * (10 ** (toDec - fromDec))) / toPrice;
        }

        // Deduct fee
        uint256 feeAmount = (amountOut * FEE_BPS) / BPS_DENOMINATOR;
        amountOut = amountOut - feeAmount;
    }

    function _getDecimals(address token) internal view returns (uint8) {
        if (token == address(0)) return 18; // ETH
        if (token == address(usdx)) return 18; // USDX
        if (token == address(wbtc)) return WBTC_DECIMALS; // WBTC = 8
        return 18; // default
    }

    // ========== Liquidity ==========

    function addETHLiquidity() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");
        emit LiquidityAdded(address(0), msg.value);
    }

    function addWBTCLiquidity(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        wbtc.transferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(address(wbtc), amount);
    }

    function addUSDXLiquidity(uint256 amount) external onlyOwner {
        require(amount > 0, "Amount must be > 0");
        usdx.transferFrom(msg.sender, address(this), amount);
        emit LiquidityAdded(address(usdx), amount);
    }

    function getReserves() external view returns (uint256 ethReserve, uint256 wbtcReserve, uint256 usdxReserve) {
        ethReserve = address(this).balance;
        wbtcReserve = wbtc.balanceOf(address(this));
        usdxReserve = usdx.balanceOf(address(this));
    }

    // Accept ETH sent directly
    receive() external payable {}
}
