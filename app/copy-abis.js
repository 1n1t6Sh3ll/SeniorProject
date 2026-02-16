const fs = require('fs');
const path = require('path');

const artifactsDir = path.join(__dirname, 'artifacts/contracts');
const destDir = path.join(__dirname, 'web/src/abis');

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

const contracts = [
    { name: 'CreditProtocol', path: 'CreditProtocol.sol/CreditProtocol.json' },
    { name: 'USDX', path: 'USDX.sol/USDX.json' },
    { name: 'MockWBTC', path: 'MockWBTC.sol/MockWBTC.json' },
    { name: 'MockPriceOracle', path: 'MockPriceOracle.sol/MockPriceOracle.json' },
    { name: 'SimpleSwap', path: 'SimpleSwap.sol/SimpleSwap.json' }
];

contracts.forEach(contract => {
    const srcPath = path.join(artifactsDir, contract.path);
    const destPath = path.join(destDir, `${contract.name}.json`);

    try {
        const artifact = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        // We only need the ABI
        const abiData = { abi: artifact.abi };
        fs.writeFileSync(destPath, JSON.stringify(abiData, null, 2));
        console.log(`Copied ABI for ${contract.name}`);
    } catch (err) {
        console.error(`Error copying ${contract.name}: ${err.message}`);
    }
});

console.log('ABI copy complete!');
