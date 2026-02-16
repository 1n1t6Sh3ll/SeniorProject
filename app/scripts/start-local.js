/**
 * One-command local development startup
 * Starts Hardhat node, deploys contracts, and starts the frontend dev server
 * Usage: node scripts/start-local.js
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');

function log(msg) {
    console.log(`\x1b[36m[startup]\x1b[0m ${msg}`);
}

function logError(msg) {
    console.log(`\x1b[31m[startup]\x1b[0m ${msg}`);
}

function logSuccess(msg) {
    console.log(`\x1b[32m[startup]\x1b[0m ${msg}`);
}

// Wait for the hardhat node to be ready
function waitForNode(maxRetries = 30) {
    return new Promise((resolve, reject) => {
        let retries = 0;
        const check = () => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: 8545,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                timeout: 2000,
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(true));
            });

            req.on('error', () => {
                retries++;
                if (retries >= maxRetries) {
                    reject(new Error('Hardhat node failed to start'));
                } else {
                    setTimeout(check, 1000);
                }
            });

            req.write(JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }));
            req.end();
        };
        check();
    });
}

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('  CryptoCredit Bank - Local Development Startup');
    console.log('='.repeat(60) + '\n');

    // Step 1: Start Hardhat node
    log('Starting Hardhat node...');
    const node = spawn('npx', ['hardhat', 'node'], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
    });

    node.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.includes('Started HTTP') || line.includes('Account #0')) {
                console.log(`  ${line.trim()}`);
            }
        }
    });

    node.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('dotenv')) {
            logError(`Node: ${msg}`);
        }
    });

    node.on('exit', (code) => {
        if (code !== null) {
            logError(`Hardhat node exited with code ${code}`);
            process.exit(1);
        }
    });

    // Wait for node to be ready
    try {
        await waitForNode();
        logSuccess('Hardhat node is running on http://127.0.0.1:8545');
    } catch (e) {
        logError('Failed to start Hardhat node. Is port 8545 already in use?');
        node.kill();
        process.exit(1);
    }

    // Step 2: Deploy contracts
    log('Deploying contracts...');
    try {
        execSync('npx hardhat run scripts/deploy.js --network localhost', {
            cwd: ROOT,
            stdio: 'pipe',
        });
        logSuccess('Contracts deployed and frontend config updated!');
    } catch (e) {
        logError('Deployment failed: ' + e.message);
        node.kill();
        process.exit(1);
    }

    // Step 3: Start frontend dev server
    log('Starting frontend dev server...');
    const web = spawn('npm', ['run', 'dev'], {
        cwd: path.join(ROOT, 'web'),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
    });

    web.stdout.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg.includes('localhost') || msg.includes('Local') || msg.includes('ready')) {
            logSuccess(`Frontend: ${msg}`);
        }
    });

    web.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg && !msg.includes('dotenv')) {
            console.log(`  [web] ${msg}`);
        }
    });

    // Print summary
    console.log('\n' + '='.repeat(60));
    logSuccess('All services started!');
    console.log('');
    console.log('  Hardhat Node:  http://127.0.0.1:8545');
    console.log('  Frontend:      http://localhost:5173');
    console.log('');
    console.log('  Test Account #0:');
    console.log('  Address:  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    console.log('  Key:      0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    console.log('');
    console.log('  MetaMask Setup:');
    console.log('  1. Add Network: RPC=http://127.0.0.1:8545  ChainID=31337');
    console.log('  2. Import account using the private key above');
    console.log('  3. If txns fail: Settings > Advanced > Clear Activity Tab Data');
    console.log('='.repeat(60) + '\n');

    // Handle shutdown
    const cleanup = () => {
        log('Shutting down...');
        web.kill();
        node.kill();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

main();
