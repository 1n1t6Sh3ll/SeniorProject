const hre = require("hardhat");

async function main() {
    console.log("Starting deployment...\n");

    // Get deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString(), "\n");

    // Deploy USDX Token
    console.log("Deploying USDX Token...");
    const USDX = await hre.ethers.getContractFactory("USDX");
    const usdx = await USDX.deploy();
    await usdx.waitForDeployment();
    const usdxAddress = await usdx.getAddress();
    console.log("USDX deployed to:", usdxAddress, "\n");

    // Deploy Mock WBTC
    console.log("Deploying Mock WBTC...");
    const MockWBTC = await hre.ethers.getContractFactory("MockWBTC");
    const wbtc = await MockWBTC.deploy();
    await wbtc.waitForDeployment();
    const wbtcAddress = await wbtc.getAddress();
    console.log("Mock WBTC deployed to:", wbtcAddress, "\n");

    // Deploy Price Oracle
    console.log("Deploying Price Oracle...");
    const MockPriceOracle = await hre.ethers.getContractFactory("MockPriceOracle");
    const oracle = await MockPriceOracle.deploy();
    await oracle.waitForDeployment();
    const oracleAddress = await oracle.getAddress();
    console.log("Price Oracle deployed to:", oracleAddress, "\n");

    // Set prices in oracle
    console.log("Setting asset prices in oracle...");
    const wbtcPrice = 40000 * 10 ** 8; // $40,000 with 8 decimals
    await oracle.updatePrice(wbtcAddress, wbtcPrice);
    console.log("  WBTC price set to $40,000");
    const usdxPrice = 1 * 10 ** 8; // $1 with 8 decimals
    await oracle.updatePrice(usdxAddress, usdxPrice);
    console.log("  USDX price set to $1\n");

    // Deploy Credit Protocol
    console.log("Deploying Credit Protocol...");
    const CreditProtocol = await hre.ethers.getContractFactory("CreditProtocol");
    const protocol = await CreditProtocol.deploy(usdxAddress, wbtcAddress, oracleAddress);
    await protocol.waitForDeployment();
    const protocolAddress = await protocol.getAddress();
    console.log("Credit Protocol deployed to:", protocolAddress, "\n");

    // Set Credit Protocol as USDX minter
    console.log("Setting Credit Protocol as USDX minter...");
    await usdx.setCreditProtocol(protocolAddress);
    console.log("USDX minter configured\n");

    // Deploy SimpleSwap
    console.log("Deploying SimpleSwap...");
    const SimpleSwap = await hre.ethers.getContractFactory("SimpleSwap");
    const swap = await SimpleSwap.deploy(oracleAddress, wbtcAddress, usdxAddress);
    await swap.waitForDeployment();
    const swapAddress = await swap.getAddress();
    console.log("SimpleSwap deployed to:", swapAddress, "\n");

    // Seed SimpleSwap with liquidity
    console.log("Seeding SimpleSwap with liquidity...");
    // Send 100 ETH
    const seedETHTx = await deployer.sendTransaction({
        to: swapAddress,
        value: hre.ethers.parseEther("100"),
    });
    await seedETHTx.wait();
    console.log("  Sent 100 ETH to SimpleSwap pool");

    // Approve + send 10 WBTC (deployer already has 1000 WBTC from MockWBTC constructor)
    const wbtcSeedAmount = 10n * (10n ** 8n); // 10 WBTC with 8 decimals
    const approveTx = await wbtc.approve(swapAddress, wbtcSeedAmount);
    await approveTx.wait();
    const addWbtcTx = await swap.addWBTCLiquidity(wbtcSeedAmount);
    await addWbtcTx.wait();
    console.log("  Sent 10 WBTC to SimpleSwap pool");

    // Mint USDX for swap pool: temporarily set deployer as creditProtocol, mint, then restore
    console.log("  Seeding USDX liquidity...");
    await usdx.setCreditProtocol(deployer.address);
    const usdxSeedAmount = hre.ethers.parseEther("500000"); // 500,000 USDX
    await usdx.mint(deployer.address, usdxSeedAmount);
    const approveUsdxTx = await usdx.approve(swapAddress, usdxSeedAmount);
    await approveUsdxTx.wait();
    const addUsdxTx = await swap.addUSDXLiquidity(usdxSeedAmount);
    await addUsdxTx.wait();
    await usdx.setCreditProtocol(protocolAddress); // Restore to real protocol
    console.log("  Sent 500,000 USDX to SimpleSwap pool\n");

    // Print deployment summary
    console.log("=".repeat(60));
    console.log("DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    console.log("\nContract Addresses:");
    console.log("  USDX Token:        ", usdxAddress);
    console.log("  Mock WBTC:         ", wbtcAddress);
    console.log("  Price Oracle:      ", oracleAddress);
    console.log("  Credit Protocol:   ", protocolAddress);
    console.log("  SimpleSwap:        ", swapAddress);

    // Save deployment info
    const fs = require("fs");
    const path = require("path");

    const addresses = {
        CreditProtocol: protocolAddress,
        USDX: usdxAddress,
        WBTC: wbtcAddress,
        PriceOracle: oracleAddress,
        SimpleSwap: swapAddress
    };

    // Save to deployments directory
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir);
    }

    const deploymentInfo = {
        network: hre.network.name,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: {
            USDX: usdxAddress,
            MockWBTC: wbtcAddress,
            PriceOracle: oracleAddress,
            CreditProtocol: protocolAddress,
            SimpleSwap: swapAddress
        }
    };

    fs.writeFileSync(
        path.join(deploymentsDir, `${hre.network.name}.json`),
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log(`\nDeployment info saved to deployments/${hre.network.name}.json`);

    // Auto-update frontend config with new addresses
    const frontendConfigPath = path.join(__dirname, "..", "web", "src", "config", "contracts.js");
    const networkKey = hre.network.name === 'hardhat' ? 'localhost' : hre.network.name;

    const configContent = `// Contract addresses - auto-updated by deploy script
// Last deployed: ${new Date().toISOString()} on ${hre.network.name}
export const CONTRACTS = {
    ${networkKey}: {
        CreditProtocol: '${protocolAddress}',
        USDX: '${usdxAddress}',
        WBTC: '${wbtcAddress}',
        PriceOracle: '${oracleAddress}',
        SimpleSwap: '${swapAddress}'
    }
};

export const CHAIN_CONFIG = {
    31337: 'localhost', // Hardhat
    11155111: 'sepolia'
};

export function getContractAddress(chainId, contractName) {
    const network = CHAIN_CONFIG[chainId] || 'localhost';
    return CONTRACTS[network]?.[contractName];
}
`;

    fs.writeFileSync(frontendConfigPath, configContent);
    console.log("Frontend config auto-updated: web/src/config/contracts.js");

    // Also copy ABIs
    console.log("\nCopying ABIs to frontend...");
    try {
        require("../copy-abis");
    } catch (e) {
        console.log("(ABIs already copied or copy-abis script not found)");
    }

    console.log("\n" + "=".repeat(60));
    console.log("READY! Run 'npm run web:dev' to start the frontend.");
    console.log("=".repeat(60) + "\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
