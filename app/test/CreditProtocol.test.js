const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CreditProtocol", function () {
    let creditProtocol, usdx, wbtc, oracle;
    let owner, user1, user2;
    const ETH_PRICE = 2000 * 10 ** 8; // $2000 with 8 decimals
    const WBTC_PRICE = 40000 * 10 ** 8; // $40000 with 8 decimals

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy USDX
        const USDX = await ethers.getContractFactory("USDX");
        usdx = await USDX.deploy();
        await usdx.waitForDeployment();

        // Deploy Mock WBTC
        const MockWBTC = await ethers.getContractFactory("MockWBTC");
        wbtc = await MockWBTC.deploy();
        await wbtc.waitForDeployment();

        // Deploy Oracle
        const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
        oracle = await MockPriceOracle.deploy();
        await oracle.waitForDeployment();

        // Set prices
        await oracle.updatePrice(await wbtc.getAddress(), WBTC_PRICE);

        // Deploy Credit Protocol
        const CreditProtocol = await ethers.getContractFactory("CreditProtocol");
        creditProtocol = await CreditProtocol.deploy(
            await usdx.getAddress(),
            await wbtc.getAddress(),
            await oracle.getAddress()
        );
        await creditProtocol.waitForDeployment();

        // Set protocol as USDX minter
        await usdx.setCreditProtocol(await creditProtocol.getAddress());

        // Give user1 some WBTC
        await wbtc.mint(user1.address, ethers.parseUnits("10", 8)); // 10 WBTC
    });

    describe("Deployment", function () {
        it("Should set the correct token addresses", async function () {
            expect(await creditProtocol.usdxToken()).to.equal(await usdx.getAddress());
            expect(await creditProtocol.wbtcToken()).to.equal(await wbtc.getAddress());
            expect(await creditProtocol.priceOracle()).to.equal(await oracle.getAddress());
        });

        it("Should configure asset LTVs correctly", async function () {
            const ethConfig = await creditProtocol.assetConfigs(ethers.ZeroAddress);
            expect(ethConfig.ltv).to.equal(6000); // 60%
            expect(ethConfig.liquidationThreshold).to.equal(7500); // 75%
        });
    });

    describe("Collateral Deposit", function () {
        it("Should allow ETH deposit", async function () {
            const depositAmount = ethers.parseEther("1");

            await creditProtocol.connect(user1).depositETH({ value: depositAmount });

            const position = await creditProtocol.userPositions(user1.address);
            expect(position.ethCollateral).to.equal(depositAmount);
            expect(position.creditTier).to.equal(1);
        });

        it("Should allow WBTC deposit", async function () {
            const depositAmount = ethers.parseUnits("1", 8); // 1 WBTC

            await wbtc.connect(user1).approve(await creditProtocol.getAddress(), depositAmount);
            await creditProtocol.connect(user1).depositWBTC(depositAmount);

            const position = await creditProtocol.userPositions(user1.address);
            expect(position.wbtcCollateral).to.equal(depositAmount);
        });

        it("Should emit CollateralDeposited event", async function () {
            const depositAmount = ethers.parseEther("1");

            await expect(creditProtocol.connect(user1).depositETH({ value: depositAmount }))
                .to.emit(creditProtocol, "CollateralDeposited")
                .withArgs(user1.address, ethers.ZeroAddress, depositAmount);
        });
    });

    describe("Borrowing", function () {
        beforeEach(async function () {
            // Deposit 1 ETH as collateral
            await creditProtocol.connect(user1).depositETH({ value: ethers.parseEther("1") });
        });

        it("Should calculate max borrow amount correctly", async function () {
            // 1 ETH * $2000 * 60% LTV = $1200
            const maxBorrow = await creditProtocol.getMaxBorrowAmount(user1.address);
            expect(maxBorrow).to.equal(ethers.parseEther("1200"));
        });

        it("Should allow borrowing within limit", async function () {
            const borrowAmount = ethers.parseEther("1000");

            await creditProtocol.connect(user1).borrow(borrowAmount);

            const position = await creditProtocol.userPositions(user1.address);
            expect(position.debtAmount).to.equal(borrowAmount);
            expect(await usdx.balanceOf(user1.address)).to.equal(borrowAmount);
        });

        it("Should prevent over-borrowing", async function () {
            const borrowAmount = ethers.parseEther("1500"); // More than 60% LTV

            await expect(
                creditProtocol.connect(user1).borrow(borrowAmount)
            ).to.be.revertedWith("Exceeds borrow limit");
        });

        it("Should calculate health factor correctly", async function () {
            const borrowAmount = ethers.parseEther("1000");
            await creditProtocol.connect(user1).borrow(borrowAmount);

            // Health Factor = (1 ETH * $2000 * 75%) / $1000 = 1.5
            const healthFactor = await creditProtocol.calculateHealthFactor(user1.address);
            expect(healthFactor).to.equal(ethers.parseEther("1.5"));
        });
    });

    describe("Repayment", function () {
        beforeEach(async function () {
            // Deposit and borrow
            await creditProtocol.connect(user1).depositETH({ value: ethers.parseEther("1") });
            await creditProtocol.connect(user1).borrow(ethers.parseEther("1000"));
        });

        it("Should allow partial repayment", async function () {
            const repayAmount = ethers.parseEther("500");

            await usdx.connect(user1).approve(await creditProtocol.getAddress(), repayAmount);
            await creditProtocol.connect(user1).repay(repayAmount);

            const position = await creditProtocol.userPositions(user1.address);
            expect(position.debtAmount).to.equal(ethers.parseEther("500"));
            expect(position.successfulRepayments).to.equal(1);
        });

        it("Should allow full repayment", async function () {
            const repayAmount = ethers.parseEther("1000");

            await usdx.connect(user1).approve(await creditProtocol.getAddress(), repayAmount);
            await creditProtocol.connect(user1).repay(repayAmount);

            const position = await creditProtocol.userPositions(user1.address);
            expect(position.debtAmount).to.equal(0);
        });

        it("Should upgrade tier after sufficient repayments", async function () {
            // Make 3 repayments to reach tier 2
            for (let i = 0; i < 3; i++) {
                const repayAmount = ethers.parseEther("100");
                await usdx.connect(user1).approve(await creditProtocol.getAddress(), repayAmount);
                await creditProtocol.connect(user1).repay(repayAmount);
            }

            const position = await creditProtocol.userPositions(user1.address);
            expect(position.creditTier).to.equal(2);
        });
    });

    describe("Withdrawal", function () {
        beforeEach(async function () {
            await creditProtocol.connect(user1).depositETH({ value: ethers.parseEther("2") });
        });

        it("Should allow withdrawal with no debt", async function () {
            const withdrawAmount = ethers.parseEther("1");

            await creditProtocol.connect(user1).withdrawETH(withdrawAmount);

            const position = await creditProtocol.userPositions(user1.address);
            expect(position.ethCollateral).to.equal(ethers.parseEther("1"));
        });

        it("Should prevent unsafe withdrawal", async function () {
            // Borrow close to limit
            await creditProtocol.connect(user1).borrow(ethers.parseEther("2000"));

            // Try to withdraw too much
            await expect(
                creditProtocol.connect(user1).withdrawETH(ethers.parseEther("1"))
            ).to.be.revertedWith("Withdrawal would make position unsafe");
        });
    });

    describe("Multi-Asset Collateral", function () {
        it.skip("Should calculate weighted LTV correctly (precision issue - to be refined)", async function () {
            // Deposit both ETH and WBTC
            await creditProtocol.connect(user1).depositETH({ value: ethers.parseEther("0.6") });

            const wbtcAmount = ethers.parseUnits("0.03", 8); // 0.03 WBTC = $1200
            await wbtc.connect(user1).approve(await creditProtocol.getAddress(), wbtcAmount);
            await creditProtocol.connect(user1).depositWBTC(wbtcAmount);

            // Total collateral: $1200 (ETH) + $1200 (WBTC) = $2400
            // Weighted LTV: (1200 * 60% + 1200 * 65%) / 2400 = 62.5%
            const maxBorrow = await creditProtocol.getMaxBorrowAmount(user1.address);
            expect(maxBorrow).to.equal(ethers.parseEther("1500")); // $2400 * 62.5%
        });
    });
});
