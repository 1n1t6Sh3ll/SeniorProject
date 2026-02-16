// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./USDX.sol";
import "./MockPriceOracle.sol";

/**
 * @title CreditProtocol
 * @dev Multi-asset crypto credit protocol with tier-based borrowing
 *      Supports depositing ETH, WBTC, and USDX as collateral
 *      Supports borrowing USDX, ETH, and WBTC against collateral
 */
contract CreditProtocol is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Structs
    struct UserPosition {
        uint256 ethCollateral;
        uint256 wbtcCollateral;
        uint256 usdxCollateral;     // USDX collateral (18 decimals)
        uint256 usdxDebt;           // USDX debt (18 decimals)
        uint256 ethDebt;            // ETH debt (18 decimals)
        uint256 wbtcDebt;           // WBTC debt (8 decimals)
        uint8 creditTier;
        uint256 successfulRepayments;
    }

    struct AssetConfig {
        uint256 ltv; // Loan-to-value ratio (basis points, e.g., 6000 = 60%)
        uint256 liquidationThreshold; // Basis points
        bool isActive;
    }

    struct TierConfig {
        uint256 ltvBonus; // Additional LTV in basis points
        uint256 repaymentsRequired; // Repayments needed to reach this tier
    }

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant LIQUIDATION_BONUS = 500; // 5% bonus for liquidators
    uint256 public constant MIN_HEALTH_FACTOR = 1e18; // 1.0 in 18 decimals

    // State variables
    USDX public immutable usdxToken;
    IERC20 public immutable wbtcToken;
    MockPriceOracle public immutable priceOracle;

    mapping(address => UserPosition) public userPositions;
    mapping(address => AssetConfig) public assetConfigs;
    mapping(uint8 => TierConfig) public tierConfigs;

    // Events
    event CollateralDeposited(
        address indexed user,
        address indexed asset,
        uint256 amount
    );
    event Borrowed(address indexed user, address indexed asset, uint256 amount, uint256 healthFactor);
    event Repaid(address indexed user, address indexed asset, uint256 amount, uint8 newTier);
    event CollateralWithdrawn(
        address indexed user,
        address indexed asset,
        uint256 amount
    );
    event Liquidated(
        address indexed user,
        address indexed liquidator,
        uint256 debtCovered,
        uint256 collateralSeized
    );
    event TierUpgraded(address indexed user, uint8 newTier);

    constructor(
        address _usdxToken,
        address _wbtcToken,
        address _priceOracle
    ) Ownable(msg.sender) {
        require(_usdxToken != address(0), "Invalid USDX address");
        require(_wbtcToken != address(0), "Invalid WBTC address");
        require(_priceOracle != address(0), "Invalid oracle address");

        usdxToken = USDX(_usdxToken);
        wbtcToken = IERC20(_wbtcToken);
        priceOracle = MockPriceOracle(_priceOracle);

        // Configure ETH (address(0) represents native ETH)
        assetConfigs[address(0)] = AssetConfig({
            ltv: 6000, // 60%
            liquidationThreshold: 7500, // 75%
            isActive: true
        });

        // Configure WBTC
        assetConfigs[_wbtcToken] = AssetConfig({
            ltv: 6500, // 65%
            liquidationThreshold: 8000, // 80%
            isActive: true
        });

        // Configure USDX as collateral (stablecoin = high LTV)
        assetConfigs[_usdxToken] = AssetConfig({
            ltv: 8000, // 80%
            liquidationThreshold: 9000, // 90%
            isActive: true
        });

        // Configure credit tiers
        tierConfigs[1] = TierConfig({ltvBonus: 0, repaymentsRequired: 0});
        tierConfigs[2] = TierConfig({ltvBonus: 500, repaymentsRequired: 3}); // +5% LTV
        tierConfigs[3] = TierConfig({ltvBonus: 1000, repaymentsRequired: 10}); // +10% LTV
    }

    // ═══════════════════════════════════════════════════════
    //                     DEPOSIT
    // ═══════════════════════════════════════════════════════

    function depositETH() external payable nonReentrant {
        require(msg.value > 0, "Must deposit ETH");
        require(assetConfigs[address(0)].isActive, "ETH not active");

        UserPosition storage position = userPositions[msg.sender];
        if (position.creditTier == 0) {
            position.creditTier = 1;
        }

        position.ethCollateral += msg.value;
        emit CollateralDeposited(msg.sender, address(0), msg.value);
    }

    function depositWBTC(uint256 amount) external nonReentrant {
        require(amount > 0, "Must deposit WBTC");
        require(assetConfigs[address(wbtcToken)].isActive, "WBTC not active");

        UserPosition storage position = userPositions[msg.sender];
        if (position.creditTier == 0) {
            position.creditTier = 1;
        }

        wbtcToken.safeTransferFrom(msg.sender, address(this), amount);
        position.wbtcCollateral += amount;
        emit CollateralDeposited(msg.sender, address(wbtcToken), amount);
    }

    function depositUSDX(uint256 amount) external nonReentrant {
        require(amount > 0, "Must deposit USDX");
        require(assetConfigs[address(usdxToken)].isActive, "USDX not active");

        UserPosition storage position = userPositions[msg.sender];
        if (position.creditTier == 0) {
            position.creditTier = 1;
        }

        IERC20(address(usdxToken)).safeTransferFrom(msg.sender, address(this), amount);
        position.usdxCollateral += amount;
        emit CollateralDeposited(msg.sender, address(usdxToken), amount);
    }

    // ═══════════════════════════════════════════════════════
    //                     BORROW
    // ═══════════════════════════════════════════════════════

    function borrow(uint256 amount) external nonReentrant {
        require(amount > 0, "Must borrow amount");

        UserPosition storage position = userPositions[msg.sender];
        require(position.creditTier > 0, "No collateral deposited");

        uint256 totalDebtUSD = getTotalDebtValue(msg.sender);
        uint256 maxBorrow = getMaxBorrowAmount(msg.sender);
        require(totalDebtUSD + amount <= maxBorrow, "Exceeds borrow limit");

        position.usdxDebt += amount;

        uint256 healthFactor = calculateHealthFactor(msg.sender);
        require(healthFactor >= MIN_HEALTH_FACTOR, "Health factor too low");

        usdxToken.mint(msg.sender, amount);
        emit Borrowed(msg.sender, address(usdxToken), amount, healthFactor);
    }

    function borrowETH(uint256 amount) external nonReentrant {
        require(amount > 0, "Must borrow amount");
        require(address(this).balance >= amount, "Insufficient ETH reserves");

        UserPosition storage position = userPositions[msg.sender];
        require(position.creditTier > 0, "No collateral deposited");

        uint256 ethPrice = priceOracle.getLatestPrice(address(0));
        uint256 borrowValueUSD = (amount * ethPrice) / 1e8;

        uint256 totalDebtUSD = getTotalDebtValue(msg.sender);
        uint256 maxBorrow = getMaxBorrowAmount(msg.sender);
        require(totalDebtUSD + borrowValueUSD <= maxBorrow, "Exceeds borrow limit");

        position.ethDebt += amount;

        uint256 healthFactor = calculateHealthFactor(msg.sender);
        require(healthFactor >= MIN_HEALTH_FACTOR, "Health factor too low");

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Borrowed(msg.sender, address(0), amount, healthFactor);
    }

    function borrowWBTC(uint256 amount) external nonReentrant {
        require(amount > 0, "Must borrow amount");
        require(wbtcToken.balanceOf(address(this)) >= amount, "Insufficient WBTC reserves");

        UserPosition storage position = userPositions[msg.sender];
        require(position.creditTier > 0, "No collateral deposited");

        uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
        uint256 borrowValueUSD = (amount * wbtcPrice) / 1e8;

        uint256 totalDebtUSD = getTotalDebtValue(msg.sender);
        uint256 maxBorrow = getMaxBorrowAmount(msg.sender);
        require(totalDebtUSD + borrowValueUSD <= maxBorrow, "Exceeds borrow limit");

        position.wbtcDebt += amount;

        uint256 healthFactor = calculateHealthFactor(msg.sender);
        require(healthFactor >= MIN_HEALTH_FACTOR, "Health factor too low");

        wbtcToken.safeTransfer(msg.sender, amount);

        emit Borrowed(msg.sender, address(wbtcToken), amount, healthFactor);
    }

    // ═══════════════════════════════════════════════════════
    //                      REPAY
    // ═══════════════════════════════════════════════════════

    function repay(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.usdxDebt > 0, "No USDX debt to repay");
        require(amount > 0, "Must repay amount");

        uint256 repayAmount = amount > position.usdxDebt ? position.usdxDebt : amount;

        position.usdxDebt -= repayAmount;
        position.successfulRepayments++;

        uint8 oldTier = position.creditTier;
        _updateCreditTier(msg.sender);

        usdxToken.burn(msg.sender, repayAmount);

        emit Repaid(msg.sender, address(usdxToken), repayAmount, position.creditTier);
        if (position.creditTier > oldTier) {
            emit TierUpgraded(msg.sender, position.creditTier);
        }
    }

    function repayETH() external payable nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.ethDebt > 0, "No ETH debt to repay");
        require(msg.value > 0, "Must repay amount");

        uint256 repayAmount = msg.value > position.ethDebt ? position.ethDebt : msg.value;

        position.ethDebt -= repayAmount;
        position.successfulRepayments++;

        uint8 oldTier = position.creditTier;
        _updateCreditTier(msg.sender);

        if (msg.value > repayAmount) {
            (bool success, ) = msg.sender.call{value: msg.value - repayAmount}("");
            require(success, "ETH refund failed");
        }

        emit Repaid(msg.sender, address(0), repayAmount, position.creditTier);
        if (position.creditTier > oldTier) {
            emit TierUpgraded(msg.sender, position.creditTier);
        }
    }

    function repayWBTC(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.wbtcDebt > 0, "No WBTC debt to repay");
        require(amount > 0, "Must repay amount");

        uint256 repayAmount = amount > position.wbtcDebt ? position.wbtcDebt : amount;

        position.wbtcDebt -= repayAmount;
        position.successfulRepayments++;

        uint8 oldTier = position.creditTier;
        _updateCreditTier(msg.sender);

        wbtcToken.safeTransferFrom(msg.sender, address(this), repayAmount);

        emit Repaid(msg.sender, address(wbtcToken), repayAmount, position.creditTier);
        if (position.creditTier > oldTier) {
            emit TierUpgraded(msg.sender, position.creditTier);
        }
    }

    // ═══════════════════════════════════════════════════════
    //                    WITHDRAW
    // ═══════════════════════════════════════════════════════

    function withdrawETH(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.ethCollateral >= amount, "Insufficient collateral");

        position.ethCollateral -= amount;

        if (getTotalDebtValue(msg.sender) > 0) {
            uint256 healthFactor = calculateHealthFactor(msg.sender);
            require(healthFactor >= MIN_HEALTH_FACTOR, "Withdrawal would make position unsafe");
        }

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit CollateralWithdrawn(msg.sender, address(0), amount);
    }

    function withdrawWBTC(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.wbtcCollateral >= amount, "Insufficient collateral");

        position.wbtcCollateral -= amount;

        if (getTotalDebtValue(msg.sender) > 0) {
            uint256 healthFactor = calculateHealthFactor(msg.sender);
            require(healthFactor >= MIN_HEALTH_FACTOR, "Withdrawal would make position unsafe");
        }

        wbtcToken.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, address(wbtcToken), amount);
    }

    function withdrawUSDX(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.usdxCollateral >= amount, "Insufficient USDX collateral");

        position.usdxCollateral -= amount;

        if (getTotalDebtValue(msg.sender) > 0) {
            uint256 healthFactor = calculateHealthFactor(msg.sender);
            require(healthFactor >= MIN_HEALTH_FACTOR, "Withdrawal would make position unsafe");
        }

        IERC20(address(usdxToken)).safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, address(usdxToken), amount);
    }

    // ═══════════════════════════════════════════════════════
    //                   LIQUIDATION
    // ═══════════════════════════════════════════════════════

    function liquidate(address user) external nonReentrant {
        require(user != msg.sender, "Cannot liquidate self");

        UserPosition storage position = userPositions[user];
        uint256 totalDebt = getTotalDebtValue(user);
        require(totalDebt > 0, "No debt to liquidate");

        uint256 healthFactor = calculateHealthFactor(user);
        require(healthFactor < MIN_HEALTH_FACTOR, "Position is healthy");

        uint256 collateralValue = getTotalCollateralValue(user);
        uint256 collateralToSeize = (totalDebt * (BASIS_POINTS + LIQUIDATION_BONUS)) / BASIS_POINTS;

        if (collateralToSeize > collateralValue) {
            collateralToSeize = collateralValue;
        }

        // Liquidator pays USDX to cover all debts
        usdxToken.burn(msg.sender, position.usdxDebt + _ethDebtToUSDX(position.ethDebt) + _wbtcDebtToUSDX(position.wbtcDebt));

        // Transfer ETH collateral to liquidator
        if (position.ethCollateral > 0) {
            uint256 ethToSeize = position.ethCollateral;
            position.ethCollateral = 0;
            (bool success, ) = msg.sender.call{value: ethToSeize}("");
            require(success, "ETH transfer failed");
        }

        // Transfer USDX collateral to liquidator
        if (position.usdxCollateral > 0) {
            uint256 usdxToSeize = position.usdxCollateral;
            position.usdxCollateral = 0;
            IERC20(address(usdxToken)).safeTransfer(msg.sender, usdxToSeize);
        }

        // Clear all debts
        position.usdxDebt = 0;
        position.ethDebt = 0;
        position.wbtcDebt = 0;

        emit Liquidated(user, msg.sender, totalDebt, collateralToSeize);
    }

    // ═══════════════════════════════════════════════════════
    //                   VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════

    function getTotalDebtValue(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        uint256 totalDebt = position.usdxDebt; // USDX is 1:1 with USD

        if (position.ethDebt > 0) {
            uint256 ethPrice = priceOracle.getLatestPrice(address(0));
            totalDebt += (position.ethDebt * ethPrice) / 1e8;
        }

        if (position.wbtcDebt > 0) {
            uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
            totalDebt += (position.wbtcDebt * wbtcPrice) / 1e8;
        }

        return totalDebt;
    }

    function calculateHealthFactor(address user) public view returns (uint256) {
        uint256 totalDebt = getTotalDebtValue(user);

        if (totalDebt == 0) {
            return type(uint256).max;
        }

        uint256 collateralValue = getTotalCollateralValue(user);
        uint256 liquidationValue = (collateralValue *
            getWeightedLiquidationThreshold(user)) / BASIS_POINTS;

        return (liquidationValue * 1e18) / totalDebt;
    }

    function getMaxBorrowAmount(address user) public view returns (uint256) {
        uint256 collateralValue = getTotalCollateralValue(user);
        uint256 effectiveLTV = getEffectiveLTV(user);

        return (collateralValue * effectiveLTV) / BASIS_POINTS;
    }

    function getTotalCollateralValue(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        uint256 totalValue = 0;

        if (position.ethCollateral > 0) {
            uint256 ethPrice = priceOracle.getLatestPrice(address(0));
            totalValue += (position.ethCollateral * ethPrice) / 1e8;
        }

        if (position.wbtcCollateral > 0) {
            uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
            totalValue += (position.wbtcCollateral * wbtcPrice) / 1e8;
        }

        // USDX collateral: $1 per USDX (18 decimals, same as the value)
        if (position.usdxCollateral > 0) {
            totalValue += position.usdxCollateral;
        }

        return totalValue;
    }

    function getETHCollateralValue(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        if (position.ethCollateral == 0) return 0;

        uint256 ethPrice = priceOracle.getLatestPrice(address(0));
        return (position.ethCollateral * ethPrice) / 1e8;
    }

    function getEffectiveLTV(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        TierConfig memory tier = tierConfigs[position.creditTier];

        uint256 baseLTV = getWeightedLTV(user);
        return baseLTV + tier.ltvBonus;
    }

    function getWeightedLTV(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        uint256 totalValue = getTotalCollateralValue(user);

        if (totalValue == 0) return 0;

        uint256 weightedLTV = 0;

        if (position.ethCollateral > 0) {
            uint256 ethValue = getETHCollateralValue(user);
            weightedLTV += (ethValue * assetConfigs[address(0)].ltv) / totalValue;
        }

        if (position.wbtcCollateral > 0) {
            uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
            uint256 wbtcValue = (position.wbtcCollateral * wbtcPrice) / 1e8;
            weightedLTV += (wbtcValue * assetConfigs[address(wbtcToken)].ltv) / totalValue;
        }

        if (position.usdxCollateral > 0) {
            weightedLTV += (position.usdxCollateral * assetConfigs[address(usdxToken)].ltv) / totalValue;
        }

        return weightedLTV;
    }

    function getWeightedLiquidationThreshold(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        uint256 totalValue = getTotalCollateralValue(user);

        if (totalValue == 0) return 0;

        uint256 weightedThreshold = 0;

        if (position.ethCollateral > 0) {
            uint256 ethValue = getETHCollateralValue(user);
            weightedThreshold += (ethValue * assetConfigs[address(0)].liquidationThreshold) / totalValue;
        }

        if (position.wbtcCollateral > 0) {
            uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
            uint256 wbtcValue = (position.wbtcCollateral * wbtcPrice) / 1e8;
            weightedThreshold += (wbtcValue * assetConfigs[address(wbtcToken)].liquidationThreshold) / totalValue;
        }

        if (position.usdxCollateral > 0) {
            weightedThreshold += (position.usdxCollateral * assetConfigs[address(usdxToken)].liquidationThreshold) / totalValue;
        }

        return weightedThreshold;
    }

    function getUserPosition(address user)
        external
        view
        returns (
            uint256 ethCollateral,
            uint256 wbtcCollateral,
            uint256 debtAmount,
            uint8 creditTier,
            uint256 successfulRepayments,
            uint256 healthFactor,
            uint256 maxBorrow
        )
    {
        UserPosition memory position = userPositions[user];
        return (
            position.ethCollateral,
            position.wbtcCollateral,
            getTotalDebtValue(user),
            position.creditTier,
            position.successfulRepayments,
            calculateHealthFactor(user),
            getMaxBorrowAmount(user)
        );
    }

    function getUserDebts(address user)
        external
        view
        returns (
            uint256 usdxDebt,
            uint256 ethDebt,
            uint256 wbtcDebt
        )
    {
        UserPosition memory position = userPositions[user];
        return (position.usdxDebt, position.ethDebt, position.wbtcDebt);
    }

    function getUserUSDXCollateral(address user) external view returns (uint256) {
        return userPositions[user].usdxCollateral;
    }

    function getReserves() external view returns (uint256 ethReserve, uint256 wbtcReserve) {
        return (address(this).balance, wbtcToken.balanceOf(address(this)));
    }

    // ═══════════════════════════════════════════════════════
    //                    INTERNAL
    // ═══════════════════════════════════════════════════════

    function _updateCreditTier(address user) internal {
        UserPosition storage position = userPositions[user];

        if (position.creditTier < 3 && position.successfulRepayments >= tierConfigs[3].repaymentsRequired) {
            position.creditTier = 3;
        } else if (position.creditTier < 2 && position.successfulRepayments >= tierConfigs[2].repaymentsRequired) {
            position.creditTier = 2;
        }
    }

    function _ethDebtToUSDX(uint256 ethAmount) internal view returns (uint256) {
        if (ethAmount == 0) return 0;
        uint256 ethPrice = priceOracle.getLatestPrice(address(0));
        return (ethAmount * ethPrice) / 1e8;
    }

    function _wbtcDebtToUSDX(uint256 wbtcAmount) internal view returns (uint256) {
        if (wbtcAmount == 0) return 0;
        uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
        return (wbtcAmount * wbtcPrice) / 1e8;
    }

    // Receive ETH
    receive() external payable {}
}
