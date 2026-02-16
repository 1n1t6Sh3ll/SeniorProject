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
 */
contract CreditProtocol is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Structs
    struct UserPosition {
        uint256 ethCollateral;
        uint256 wbtcCollateral;
        uint256 debtAmount;
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
    event Borrowed(address indexed user, uint256 amount, uint256 healthFactor);
    event Repaid(address indexed user, uint256 amount, uint8 newTier);
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

        // Configure credit tiers
        tierConfigs[1] = TierConfig({ltvBonus: 0, repaymentsRequired: 0});
        tierConfigs[2] = TierConfig({ltvBonus: 500, repaymentsRequired: 3}); // +5% LTV
        tierConfigs[3] = TierConfig({ltvBonus: 1000, repaymentsRequired: 10}); // +10% LTV
    }

    /**
     * @dev Deposit ETH as collateral
     */
    function depositETH() external payable nonReentrant {
        require(msg.value > 0, "Must deposit ETH");
        require(assetConfigs[address(0)].isActive, "ETH not active");

        UserPosition storage position = userPositions[msg.sender];
        if (position.creditTier == 0) {
            position.creditTier = 1; // Initialize to tier 1
        }

        position.ethCollateral += msg.value;
        emit CollateralDeposited(msg.sender, address(0), msg.value);
    }

    /**
     * @dev Deposit WBTC as collateral
     * @param amount Amount of WBTC to deposit (in WBTC decimals)
     */
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

    /**
     * @dev Borrow USDX against collateral
     * @param amount Amount of USDX to borrow
     */
    function borrow(uint256 amount) external nonReentrant {
        require(amount > 0, "Must borrow amount");

        UserPosition storage position = userPositions[msg.sender];
        require(position.creditTier > 0, "No collateral deposited");

        uint256 maxBorrow = getMaxBorrowAmount(msg.sender);
        require(
            position.debtAmount + amount <= maxBorrow,
            "Exceeds borrow limit"
        );

        position.debtAmount += amount;

        // Check health factor after borrowing
        uint256 healthFactor = calculateHealthFactor(msg.sender);
        require(healthFactor >= MIN_HEALTH_FACTOR, "Health factor too low");

        usdxToken.mint(msg.sender, amount);
        emit Borrowed(msg.sender, amount, healthFactor);
    }

    /**
     * @dev Repay borrowed USDX
     * @param amount Amount of USDX to repay
     */
    function repay(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.debtAmount > 0, "No debt to repay");
        require(amount > 0, "Must repay amount");

        uint256 repayAmount = amount > position.debtAmount
            ? position.debtAmount
            : amount;

        position.debtAmount -= repayAmount;
        position.successfulRepayments++;

        // Check for tier upgrade
        uint8 oldTier = position.creditTier;
        _updateCreditTier(msg.sender);

        // Transfer USDX from user and burn
        usdxToken.burn(msg.sender, repayAmount);

        emit Repaid(msg.sender, repayAmount, position.creditTier);
        if (position.creditTier > oldTier) {
            emit TierUpgraded(msg.sender, position.creditTier);
        }
    }

    /**
     * @dev Withdraw ETH collateral
     * @param amount Amount of ETH to withdraw
     */
    function withdrawETH(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.ethCollateral >= amount, "Insufficient collateral");

        position.ethCollateral -= amount;

        // Check health factor if user has debt
        if (position.debtAmount > 0) {
            uint256 healthFactor = calculateHealthFactor(msg.sender);
            require(
                healthFactor >= MIN_HEALTH_FACTOR,
                "Withdrawal would make position unsafe"
            );
        }

        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "ETH transfer failed");

        emit CollateralWithdrawn(msg.sender, address(0), amount);
    }

    /**
     * @dev Withdraw WBTC collateral
     * @param amount Amount of WBTC to withdraw
     */
    function withdrawWBTC(uint256 amount) external nonReentrant {
        UserPosition storage position = userPositions[msg.sender];
        require(position.wbtcCollateral >= amount, "Insufficient collateral");

        position.wbtcCollateral -= amount;

        // Check health factor if user has debt
        if (position.debtAmount > 0) {
            uint256 healthFactor = calculateHealthFactor(msg.sender);
            require(
                healthFactor >= MIN_HEALTH_FACTOR,
                "Withdrawal would make position unsafe"
            );
        }

        wbtcToken.safeTransfer(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, address(wbtcToken), amount);
    }

    /**
     * @dev Liquidate an undercollateralized position
     * @param user Address of the user to liquidate
     */
    function liquidate(address user) external nonReentrant {
        require(user != msg.sender, "Cannot liquidate self");

        UserPosition storage position = userPositions[user];
        require(position.debtAmount > 0, "No debt to liquidate");

        uint256 healthFactor = calculateHealthFactor(user);
        require(healthFactor < MIN_HEALTH_FACTOR, "Position is healthy");

        uint256 debtToCover = position.debtAmount;
        uint256 collateralValue = getTotalCollateralValue(user);

        // Calculate collateral to seize (debt + liquidation bonus)
        uint256 collateralToSeize = (debtToCover *
            (BASIS_POINTS + LIQUIDATION_BONUS)) / BASIS_POINTS;

        if (collateralToSeize > collateralValue) {
            collateralToSeize = collateralValue;
        }

        // Burn debt from liquidator
        usdxToken.burn(msg.sender, debtToCover);

        // Transfer collateral to liquidator (simplified - transfer ETH first)
        uint256 ethValue = getETHCollateralValue(user);
        if (ethValue > 0) {
            uint256 ethToSeize = collateralToSeize > ethValue
                ? position.ethCollateral
                : (position.ethCollateral * collateralToSeize) / ethValue;

            position.ethCollateral -= ethToSeize;
            (bool success, ) = msg.sender.call{value: ethToSeize}("");
            require(success, "ETH transfer failed");
        }

        // Clear debt
        position.debtAmount = 0;

        emit Liquidated(user, msg.sender, debtToCover, collateralToSeize);
    }

    /**
     * @dev Calculate health factor for a user
     * @param user Address of the user
     * @return Health factor in 18 decimals (1e18 = 1.0)
     */
    function calculateHealthFactor(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];

        if (position.debtAmount == 0) {
            return type(uint256).max; // No debt = infinite health
        }

        uint256 collateralValue = getTotalCollateralValue(user);
        uint256 liquidationValue = (collateralValue *
            getWeightedLiquidationThreshold(user)) / BASIS_POINTS;

        return (liquidationValue * 1e18) / position.debtAmount;
    }

    /**
     * @dev Get maximum borrow amount for a user
     * @param user Address of the user
     * @return Maximum USDX amount that can be borrowed
     */
    function getMaxBorrowAmount(address user) public view returns (uint256) {
        uint256 collateralValue = getTotalCollateralValue(user);
        uint256 effectiveLTV = getEffectiveLTV(user);

        return (collateralValue * effectiveLTV) / BASIS_POINTS;
    }

    /**
     * @dev Get total collateral value in USD (18 decimals)
     */
    function getTotalCollateralValue(address user)
        public
        view
        returns (uint256)
    {
        UserPosition memory position = userPositions[user];
        uint256 totalValue = 0;

        // ETH collateral value
        if (position.ethCollateral > 0) {
            uint256 ethPrice = priceOracle.getLatestPrice(address(0));
            totalValue += (position.ethCollateral * ethPrice) / 1e8; // Convert to 18 decimals
        }

        // WBTC collateral value
        if (position.wbtcCollateral > 0) {
            uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
            // WBTC has 8 decimals, price has 8 decimals
            totalValue += (position.wbtcCollateral * wbtcPrice) / 1e8;
        }

        return totalValue;
    }

    /**
     * @dev Get ETH collateral value
     */
    function getETHCollateralValue(address user)
        public
        view
        returns (uint256)
    {
        UserPosition memory position = userPositions[user];
        if (position.ethCollateral == 0) return 0;

        uint256 ethPrice = priceOracle.getLatestPrice(address(0));
        return (position.ethCollateral * ethPrice) / 1e8;
    }

    /**
     * @dev Get effective LTV including tier bonus
     */
    function getEffectiveLTV(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        TierConfig memory tier = tierConfigs[position.creditTier];

        uint256 baseLTV = getWeightedLTV(user);
        return baseLTV + tier.ltvBonus;
    }

    /**
     * @dev Get weighted average LTV based on collateral composition
     */
    function getWeightedLTV(address user) public view returns (uint256) {
        UserPosition memory position = userPositions[user];
        uint256 totalValue = getTotalCollateralValue(user);

        if (totalValue == 0) return 0;

        uint256 weightedLTV = 0;

        // ETH contribution
        if (position.ethCollateral > 0) {
            uint256 ethValue = getETHCollateralValue(user);
            weightedLTV +=
                (ethValue * assetConfigs[address(0)].ltv) /
                totalValue;
        }

        // WBTC contribution
        if (position.wbtcCollateral > 0) {
            uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
            uint256 wbtcValue = (position.wbtcCollateral * wbtcPrice) / 1e8;
            weightedLTV +=
                (wbtcValue * assetConfigs[address(wbtcToken)].ltv) /
                totalValue;
        }

        return weightedLTV;
    }

    /**
     * @dev Get weighted liquidation threshold
     */
    function getWeightedLiquidationThreshold(address user)
        public
        view
        returns (uint256)
    {
        UserPosition memory position = userPositions[user];
        uint256 totalValue = getTotalCollateralValue(user);

        if (totalValue == 0) return 0;

        uint256 weightedThreshold = 0;

        // ETH contribution
        if (position.ethCollateral > 0) {
            uint256 ethValue = getETHCollateralValue(user);
            weightedThreshold +=
                (ethValue * assetConfigs[address(0)].liquidationThreshold) /
                totalValue;
        }

        // WBTC contribution
        if (position.wbtcCollateral > 0) {
            uint256 wbtcPrice = priceOracle.getLatestPrice(address(wbtcToken));
            uint256 wbtcValue = (position.wbtcCollateral * wbtcPrice) / 1e8;
            weightedThreshold +=
                (wbtcValue *
                    assetConfigs[address(wbtcToken)].liquidationThreshold) /
                totalValue;
        }

        return weightedThreshold;
    }

    /**
     * @dev Update user's credit tier based on repayment history
     */
    function _updateCreditTier(address user) internal {
        UserPosition storage position = userPositions[user];

        if (
            position.creditTier < 3 &&
            position.successfulRepayments >=
            tierConfigs[3].repaymentsRequired
        ) {
            position.creditTier = 3;
        } else if (
            position.creditTier < 2 &&
            position.successfulRepayments >=
            tierConfigs[2].repaymentsRequired
        ) {
            position.creditTier = 2;
        }
    }

    /**
     * @dev Get user position details
     */
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
            position.debtAmount,
            position.creditTier,
            position.successfulRepayments,
            calculateHealthFactor(user),
            getMaxBorrowAmount(user)
        );
    }

    // Receive ETH
    receive() external payable {}
}
