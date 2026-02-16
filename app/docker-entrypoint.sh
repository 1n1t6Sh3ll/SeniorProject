#!/bin/bash
set -e

echo "========================================"
echo "  CryptoCredit Bank - Docker Startup"
echo "========================================"

# 1. Start Hardhat node in background
echo "[1/5] Starting Hardhat node..."
npx hardhat node --hostname 0.0.0.0 &
HARDHAT_PID=$!

# 2. Wait for Hardhat node to be ready
echo "[2/5] Waiting for Hardhat node..."
RETRIES=30
until curl -sf http://127.0.0.1:8545 -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        echo "ERROR: Hardhat node failed to start"
        exit 1
    fi
    sleep 1
done
echo "  Hardhat node is ready!"

# 3. Deploy contracts
echo "[3/5] Deploying contracts..."
npx hardhat run scripts/deploy.js --network localhost

# 4. Build frontend (AFTER deploy, so contract addresses are correct)
echo "[4/5] Building frontend..."
cd web
VITE_RPC_URL=http://127.0.0.1:8545 npm run build
cd ..

# 5. Start Express backend (serves API + frontend static files)
echo "[5/5] Starting backend server..."
echo ""
echo "========================================"
echo "  CryptoCredit Bank is running!"
echo ""
echo "  App:      http://localhost:3000"
echo "  RPC:      http://localhost:8545"
echo "  Chain ID: 31337"
echo ""
echo "  Connect Options:"
echo "    1. Create a wallet in-app (no extension needed)"
echo "    2. Import a wallet via private key or seed phrase"
echo "    3. Use MetaMask (RPC: http://localhost:8545, Chain: 31337)"
echo ""
echo "  Test Private Key:"
echo "    0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "========================================"
echo ""

node backend/server.js &
BACKEND_PID=$!

# Wait for either process to exit
wait -n $HARDHAT_PID $BACKEND_PID
exit $?
