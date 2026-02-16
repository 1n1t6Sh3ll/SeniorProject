# CryptoCredit Bank

A full-stack decentralized finance (DeFi) credit protocol built with Hardhat, React, and Express.js. Users can deposit crypto collateral, borrow USDX stablecoins, earn credit tiers through repayments, trade on a built-in exchange, and shop in a marketplace with crypto payments.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20, Hardhat, OpenZeppelin |
| Frontend | React 19, Vite 7, wagmi, RainbowKit, ethers.js 6 |
| Backend | Express.js 5, MongoDB (optional), WebSocket |
| DevOps | Docker, docker-compose |

## Quick Start

### Option 1: One Command (Recommended)

```bash
npm install
cd web && npm install && cd ..
npm start
```

This starts the Hardhat node, deploys all contracts, and launches the frontend dev server.

- Frontend: http://localhost:5173
- RPC: http://127.0.0.1:8545

### Option 2: Docker

```bash
docker compose up --build
```

- App: http://localhost:3000
- RPC: http://localhost:8545

With optional MongoDB:

```bash
docker compose --profile with-db up --build
```

### Option 3: Manual

```bash
# Terminal 1 - Blockchain node
npx hardhat node

# Terminal 2 - Deploy contracts
npm run deploy:local

# Terminal 3 - Frontend
cd web && npm run dev
```

## MetaMask Setup

1. Add network: RPC `http://127.0.0.1:8545`, Chain ID `31337`, Currency `ETH`
2. Import test account private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
   This account has 10,000 ETH pre-funded by Hardhat.
3. If transactions fail after a node restart: Settings > Advanced > Clear Activity Tab Data

## Smart Contracts

| Contract | Description |
|----------|-------------|
| CreditProtocol.sol | Core lending protocol - deposit, borrow, repay, withdraw, liquidation |
| USDX.sol | Stablecoin minted when users borrow |
| MockWBTC.sol | Mock wrapped Bitcoin with faucet (mints 1 WBTC per call) |
| MockPriceOracle.sol | ETH and WBTC price feeds |
| SimpleSwap.sol | DEX for ETH/WBTC/USDX token swaps |

## Pages (16)

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Position overview, collateral, debt, health factor, credit tier |
| Deposit | `/deposit` | Deposit ETH or WBTC as collateral |
| Borrow | `/borrow` | Borrow USDX against collateral with tier-based rates |
| Repay | `/repay` | Repay USDX debt with amortization schedules (3/6/12 months) |
| Withdraw | `/withdraw` | Withdraw collateral (respects health factor limits) |
| Send | `/send` | Transfer tokens to other addresses with address book |
| Portfolio | `/portfolio` | Full account summary, net position, transaction history |
| Wallet Manager | `/wallet` | Create/import wallets, seed phrase recovery, test accounts |
| Market | `/market` | Live crypto prices and market data |
| Analytics | `/analytics` | Protocol-wide statistics and charts |
| Liquidation | `/liquidation` | Check and liquidate undercollateralized positions |
| Simulator | `/simulator` | Simulate borrow/repay scenarios with different parameters |
| Exchange | `/exchange` | Swap between ETH, WBTC, and USDX on the built-in DEX |
| Statements | `/statements` | Generate account statements and export transaction data |
| Explorer | `/explorer` | Browse on-chain transactions and look up addresses |
| Marketplace | `/marketplace` | Buy NFTs, real estate, vehicles, electronics, gaming, luxury goods |

## Marketplace Features

- **Shop**: 28 products across 6 categories - pay with USDX, ETH, or WBTC
- **My Assets**: Portfolio of purchased items with live valuations and appreciation/depreciation tracking
- **Pledge as Collateral**: Use marketplace assets to boost borrowing power (category-specific LTV ratios)
- **Customer Worth**: Net worth breakdown (crypto + assets - debt) with risk assessment scoring (0-100)
- **Enforcement**: Asset seizure, legal claims, and settlement options for defaulted positions
- **Financing**: Apply for loans to purchase high-value items with scheduled repayment plans

## Credit Tier System

| Tier | Repayments Required | Interest Rate | Benefits |
|------|---------------------|---------------|---------|
| Tier 1 (Bronze) | 0 | 12% APR | Basic borrowing |
| Tier 2 (Silver) | 3+ | 8% APR | Higher limits, lower rates |
| Tier 3 (Gold) | 7+ | 5% APR | Best rates, highest limits |

Late penalty: +2% APR after 30-day grace period. Interest is simulated on the frontend.

## Wallet Manager

- **Create Wallet**: Generate new wallet with BIP-39 seed phrase
- **Import Wallet**: Import from private key
- **Recover Wallet**: Restore from seed phrase
- **Test Accounts**: Pre-funded Hardhat accounts with 10,000 ETH each
- All wallets stored locally in browser (localStorage)

## Key Components

- **SetupGuide** - Step-by-step onboarding for new users
- **NetworkStatus** - Real-time blockchain connection indicator
- **HealthFactorGauge** - Visual health factor with color-coded zones
- **CreditTierBadge** - Animated tier display with progress tracking
- **NotificationCenter** - Transaction alerts and system notifications
- **ConfirmationModal** - Transaction confirmation with details
- **AccountSidebar** - Quick account overview panel
- **QuickStatsBar** - At-a-glance protocol statistics

## NPM Scripts

```bash
npm start              # Start everything (node + deploy + frontend)
npm run compile        # Compile Solidity contracts
npm run test           # Run contract tests
npm run test:coverage  # Test coverage report
npm run deploy:local   # Deploy to localhost
npm run deploy:sepolia # Deploy to Sepolia testnet
npm run node           # Start Hardhat node only
npm run web:dev        # Start frontend dev server only
npm run backend:start  # Start Express backend only
npm run clean          # Clean Hardhat artifacts
```

## Project Structure

```
app/
  contracts/           # Solidity smart contracts (5 contracts)
  scripts/             # Deploy scripts, start-local.js
  test/                # Contract test suite
  backend/             # Express.js API server
    routes/            # auth, users, analytics, protocol
    services/          # realtimeManager, eventIndexer
    models/            # User, Transaction (MongoDB)
  web/                 # React frontend (Vite)
    src/
      pages/           # 16 page components
      components/      # 18+ reusable UI components
      utils/           # contracts, interest, assetPortfolio, exchange, supplyYield, pendingTxs
      hooks/           # useWallet, useWalletSigner
      contexts/        # BuiltinWalletContext
      config/          # contracts.js (auto-synced addresses + ABIs)
  artifacts/           # Compiled contract ABIs (auto-generated)
  docker-compose.yml   # Docker orchestration
  Dockerfile           # Container build
  docker-entrypoint.sh # Docker startup sequence
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| VITE_RPC_URL | http://127.0.0.1:8545 | Blockchain RPC endpoint |
| PORT | 3000 | Backend server port |
| MONGODB_URI | mongodb://localhost:27017/crypto-credit | MongoDB connection (optional) |
| SEPOLIA_RPC_URL | - | Sepolia testnet RPC for deployment |
| PRIVATE_KEY | - | Deployer private key for testnet |

## Networks

| Network | Chain ID | RPC |
|---------|----------|-----|
| Localhost (Hardhat) | 31337 | http://127.0.0.1:8545 |
| Sepolia Testnet | 11155111 | Via SEPOLIA_RPC_URL env var |

## Security Features

- ReentrancyGuard on all state-changing functions
- SafeERC20 for token transfers
- Access control (only protocol can mint/burn USDX)
- Health factor checks prevent unsafe withdrawals
- Solidity 0.8.20 built-in overflow protection

## Important Notes

- Hardhat node is ephemeral - contracts must be redeployed after each restart
- Deploy script auto-updates frontend config and copies ABIs
- Backend MongoDB is optional - app works fully without it
- Interest mechanics are frontend-simulated (contracts handle collateral/debt only)
- All marketplace purchases and asset data stored in browser localStorage

## License

ISC
