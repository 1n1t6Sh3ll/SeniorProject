# SeniorProject:  CryptoCredit Bank

A full-stack decentralized finance (DeFi) credit protocol built with Hardhat, React, and Express.js. Users can deposit multi-asset collateral (ETH, WBTC, USDX), borrow USDX/ETH/WBTC against their collateral, earn credit tiers through repayments, trade on a built-in DEX, and shop in a marketplace with crypto payments and asset-backed financing.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the App](#running-the-app)
  - [Option 1: One Command (Development)](#option-1-one-command-development)
  - [Option 2: Docker (Production / Sharing)](#option-2-docker-production--sharing)
  - [Option 3: Manual (Advanced)](#option-3-manual-advanced)
- [Connecting a Wallet](#connecting-a-wallet)
  - [MetaMask Setup](#metamask-setup)
  - [Built-in Wallet](#built-in-wallet)
  - [Test Accounts](#test-accounts)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Networks](#networks)
- [Smart Contracts](#smart-contracts)
- [Features](#features)
  - [Pages (16)](#pages-16)
  - [Credit Tier System](#credit-tier-system)
  - [Interest and Fees](#interest-and-fees)
  - [Credit Score](#credit-score)
  - [Marketplace](#marketplace)
  - [Exchange (DEX)](#exchange-dex)
  - [Address Book and Transfer Limits](#address-book-and-transfer-limits)
  - [Account Statements](#account-statements)
- [Architecture](#architecture)
  - [Project Structure](#project-structure)
  - [Frontend Utilities](#frontend-utilities)
  - [UI Components](#ui-components)
  - [Backend API](#backend-api)
- [Docker Reference](#docker-reference)
- [NPM Scripts](#npm-scripts)
- [Deploying to Sepolia Testnet](#deploying-to-sepolia-testnet)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [License](#license)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20, Hardhat 2.28, OpenZeppelin 5.4 |
| Frontend | React 19, Vite 7, wagmi 2.19, RainbowKit 2.2, ethers.js 6 |
| Backend | Express.js 5, MongoDB 7 (optional), WebSocket |
| DevOps | Docker, docker-compose |

---

## Prerequisites

**For local development:**
- [Node.js](https://nodejs.org/) v18 or v20 (LTS recommended)
- npm v9+ (comes with Node.js)
- [Git](https://git-scm.com/)

**For Docker:**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) v4+ with Docker Compose v2
- No Node.js installation needed

**For wallet connection (optional):**
- [MetaMask](https://metamask.io/) browser extension

---

## Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd app
```

### 2. Install dependencies

```bash
# Install root dependencies (Hardhat, contracts, backend)
npm install

# Install frontend dependencies
cd web && npm install && cd ..
```

### 3. Set up environment (optional)

```bash
# Copy the example env file
cp .env.example .env
```

Edit `.env` if you plan to deploy to Sepolia testnet. For local development, no changes are needed.

---

## Running the App

### Option 1: One Command (Development)

Best for development. Starts everything with hot-reload on the frontend.

```bash
npm start
```

This automatically:
1. Starts a local Hardhat blockchain node on port 8545
2. Deploys all 5 smart contracts
3. Starts the Vite dev server with hot-reload

| Service | URL |
|---------|-----|
| Frontend (dev) | http://localhost:5173 |
| Hardhat RPC | http://127.0.0.1:8545 |

Press `Ctrl+C` to stop all services.

### Option 2: Docker (Production / Sharing)

Best for sharing the project. Everything runs in a single container - no local Node.js needed.

```bash
docker compose up --build
```

This automatically:
1. Builds the Docker image (Node 20 + build tools)
2. Installs all dependencies
3. Compiles Solidity contracts
4. Starts Hardhat node inside the container
5. Deploys contracts
6. Builds the production frontend
7. Starts the Express backend serving everything

| Service | URL |
|---------|-----|
| App (production) | http://localhost:3000 |
| Hardhat RPC | http://localhost:8545 |
| Health Check | http://localhost:3000/api/health |

Run in background:
```bash
docker compose up --build -d
```

View logs:
```bash
docker compose logs -f
```

Stop:
```bash
docker compose down
```

**With MongoDB** (enables user accounts, analytics persistence):
```bash
docker compose --profile with-db up --build
```

### Option 3: Manual (Advanced)

Run each service separately for debugging.

**Terminal 1 - Blockchain:**
```bash
npx hardhat node
```

**Terminal 2 - Deploy contracts:**
```bash
npm run deploy:local
```

**Terminal 3 - Frontend:**
```bash
cd web && npm run dev
```

**Terminal 4 - Backend (optional):**
```bash
npm run backend:start
```

---

## Connecting a Wallet

### MetaMask Setup

1. **Add the Hardhat network to MetaMask:**

   | Setting | Value |
   |---------|-------|
   | Network Name | Hardhat Local |
   | RPC URL | `http://127.0.0.1:8545` (dev) or `http://localhost:8545` (Docker) |
   | Chain ID | `31337` |
   | Currency Symbol | `ETH` |

2. **Import a test account:**

   Go to MetaMask > Import Account > Paste this private key:
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```
   This is Hardhat's Account #0 with 10,000 ETH pre-funded.

3. **After a node restart** (transactions fail with nonce errors):

   MetaMask > Settings > Advanced > Clear Activity Tab Data

### Built-in Wallet

The app has a built-in wallet that auto-connects to Hardhat Account #0. No MetaMask needed. The wallet context is stored in localStorage.

### Test Accounts

Hardhat provides 20 pre-funded accounts, each with 10,000 ETH. The first 10 are accessible in the **Test Accounts** page (`/wallets`).

<details>
<summary>All 10 test account private keys</summary>

| # | Address | Private Key |
|---|---------|-------------|
| 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | `0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |
| 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | `0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba` |
| 6 | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` | `0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e` |
| 7 | `0x14dC79964da2C08dfa4B27006B525f02F04Aa9CF` | `0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356` |
| 8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` | `0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97` |
| 9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | `0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6` |

> **Warning:** These are publicly known test keys. They only work on localhost chain 31337. Never send real funds to these addresses.

</details>

---

## Configuration

### Environment Variables

Create a `.env` file in the project root (or copy from `.env.example`):

```bash
# ── Blockchain (only needed for testnet deployment) ──────────
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_deployer_private_key
ETHERSCAN_API_KEY=your_etherscan_key

# ── Backend ──────────────────────────────────────────────────
PORT=3000                                          # Express server port
MONGODB_URI=mongodb://localhost:27017/crypto-credit # Optional, app works without it
JWT_SECRET=your_jwt_secret                         # For user auth (requires MongoDB)

# ── Frontend (set at build time via Vite) ────────────────────
VITE_RPC_URL=http://127.0.0.1:8545                # Blockchain RPC for the frontend
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_RPC_URL` | No | `http://127.0.0.1:8545` | Blockchain RPC endpoint used by the frontend |
| `PORT` | No | `3000` | Express backend port |
| `MONGODB_URI` | No | `mongodb://localhost:27017/crypto-credit` | MongoDB connection string. If unavailable, app runs in blockchain-only mode |
| `SEPOLIA_RPC_URL` | Testnet only | - | Alchemy/Infura Sepolia RPC URL |
| `PRIVATE_KEY` | Testnet only | - | Deployer wallet private key for testnet |
| `ETHERSCAN_API_KEY` | Testnet only | - | For contract verification on Etherscan |
| `JWT_SECRET` | If using auth | - | Secret key for JWT token signing |

### Networks

| Network | Chain ID | RPC URL | Usage |
|---------|----------|---------|-------|
| Hardhat (local) | 31337 | `http://127.0.0.1:8545` | Development and Docker |
| Sepolia Testnet | 11155111 | Via `SEPOLIA_RPC_URL` | Public testnet deployment |

---

## Smart Contracts

Five Solidity contracts deployed automatically:

| Contract | Description | Key Functions |
|----------|-------------|---------------|
| **CreditProtocol.sol** | Core multi-asset lending protocol | `depositETH`, `depositWBTC`, `depositUSDX`, `borrow`/`borrowETH`/`borrowWBTC`, `repay`/`repayETH`/`repayWBTC`, `withdrawETH`/`withdrawWBTC`/`withdrawUSDX`, `liquidate`, `getUserPosition`, `getUserDebts`, `getReserves` |
| **USDX.sol** | Stablecoin (ERC-20) | Minted when users borrow, burned on repayment. Only the protocol can mint/burn |
| **MockWBTC.sol** | Wrapped Bitcoin mock (ERC-20) | `faucet()` mints 1 WBTC per call for testing |
| **MockPriceOracle.sol** | Price feed oracle | Returns ETH and WBTC prices (8 decimal precision) |
| **SimpleSwap.sol** | DEX for token swaps | Swap between ETH, WBTC, and USDX |

Contract addresses are automatically written to `web/src/config/contracts.js` during deployment.

### Collateral Parameters

| Asset | Loan-to-Value (LTV) | Liquidation Threshold | Type |
|-------|---------------------|----------------------|------|
| ETH | 60% | 75% | Native |
| WBTC | 65% | 80% | ERC-20 |
| USDX | 80% | 90% | ERC-20 (stablecoin) |

- **Weighted LTV**: When multiple collateral types are deposited, the effective LTV is a weighted average based on each asset's USD value
- **Credit Tier Bonus**: Higher tiers earn LTV bonuses (+0% Bronze, +5% Silver, +10% Gold)

### Multi-Asset Borrowing

Users can borrow any of the three supported assets:

| Borrow Asset | Source | Repay With |
|-------------|--------|------------|
| USDX | Minted on demand (no reserve limit) | USDX (burned on repay) |
| ETH | Protocol reserves (deposited by other users) | ETH |
| WBTC | Protocol reserves (deposited by other users) | WBTC |

Each borrowed asset creates a separate debt tracked independently. The protocol's `getUserDebts()` function returns all three debt balances.

---

## Features

### Pages (16)

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Position overview with health factor gauge, multi-asset collateral breakdown (ETH/WBTC/USDX), credit score, tier progress, marketplace asset collateral |
| Deposit | `/deposit` | Deposit ETH, WBTC, or USDX as collateral with supply APY projections and collateral optimizer |
| Borrow | `/borrow` | Borrow USDX, ETH, or WBTC against collateral with loan agreement, fee breakdown, interest preview by tier |
| Repay | `/repay` | Repay USDX, ETH, or WBTC debt with amortization schedules (3/6/12 month plans) |
| Withdraw | `/withdraw` | Withdraw ETH, WBTC, or USDX collateral with health factor impact preview |
| Send | `/send` | Transfer tokens with address book integration and daily transfer limits |
| Portfolio | `/portfolio` | Full account summary, net position (crypto + marketplace assets - debt), filterable transaction history, CSV export |
| Wallet Manager | `/wallets` | Create/import wallets, seed phrase recovery, Hardhat test accounts |
| Market | `/market` | Live crypto prices and market data from oracle feeds |
| Analytics | `/analytics` | Protocol-wide statistics, total value locked, user counts |
| Liquidation | `/liquidation` | Discover and liquidate undercollateralized positions with bonus rewards. Seize pledged marketplace assets |
| Simulator | `/simulator` | Simulate borrow/repay scenarios with adjustable parameters |
| Exchange | `/exchange` | Swap between ETH, WBTC, and USDX on the built-in DEX with live rates |
| Statements | `/statements` | Monthly account statements with PDF/CSV export |
| Explorer | `/explorer` | Browse on-chain transactions, look up any address |
| Marketplace | `/marketplace` | Buy assets with crypto or financing, manage portfolio, pledge assets as collateral, customer worth, enforcement |

### Credit Tier System

Tiers are earned through successful repayments and tracked on-chain:

| Tier | Name | Repayments | Interest Rate | LTV Bonus |
|------|------|------------|---------------|-----------|
| 1 | Bronze | 0+ | 12% APR | +0% |
| 2 | Silver | 3+ | 8% APR | +5% |
| 3 | Gold | 7+ | 5% APR | +10% |

The `CreditTierRoadmap` component shows visual progression toward the next tier.

### Interest and Fees

Interest is simulated on the frontend (smart contracts handle collateral/debt only):

**Interest:**
- Daily compound formula: `A = P * (1 + r/365)^days`
- Late penalty: +2% APR after 30-day grace period without repayment
- Repayment plans: 3-month (aggressive), 6-month (standard), 12-month (extended) with full amortization tables

**Fees:**
- Origination fee: 0.5% of borrow amount
- Withdrawal fee: 0.1% of withdrawal value
- Late payment fee: Flat $25 USDX after grace period
- Monthly maintenance: $5 if account inactive 30+ days

**Supply Yield:**
- ETH deposits earn 2.5% APY (simulated staking yield)
- WBTC deposits earn 0.8% APY (simulated lending yield)
- USDX deposits do not earn yield (stablecoin collateral only)

### Credit Score

FICO-inspired score from 300-850, displayed as a speedometer gauge:

| Factor | Weight | Description |
|--------|--------|-------------|
| Repayment history | 35% | On-time repayments vs missed payments |
| Utilization ratio | 30% | Debt / max borrow capacity (lower = better) |
| Account age | 15% | Days since first deposit |
| Collateral diversity | 10% | Bonus for having both ETH + WBTC |
| Credit tier | 10% | Direct mapping from on-chain tier |

Score ranges: Excellent (750-850), Good (700-749), Fair (650-699), Poor (550-649), Very Poor (300-549).

### Marketplace

28 products across 6 categories, purchasable with USDX, ETH, or WBTC:

| Category | Example Items | Appreciation | Collateral LTV |
|----------|---------------|-------------|----------------|
| Real Estate | Penthouse, Beach Villa | +5-15%/yr | 50% |
| Luxury | Swiss Watch, Diamond Ring | +3-8%/yr | 40% |
| Vehicles | Tesla Model S, Ferrari | -10-20%/yr | 35% |
| NFTs | CryptoPunk, BAYC | +/-30%/yr | 30% |
| Gaming | PS5, Gaming PC | +/-25%/yr | 25% |
| Electronics | iPhone, MacBook Pro | -20-40%/yr | 20% |

**Tabs:**
- **Shop** - Browse and purchase items with USDX, ETH, or WBTC. Finance purchases by borrowing USDX inline (deposit collateral and borrow directly from the finance modal)
- **My Assets** - View owned items with live valuations and appreciation/depreciation. Pledge assets as additional collateral
- **Customer Worth** - Net worth breakdown (crypto + assets - debt) with risk scoring (0-100)
- **Enforcement** - Asset seizure, legal claims, settlements for defaulted positions

**Financing:**
- Items can be financed with a loan directly from the marketplace
- If you have enough USDX balance, no loan is needed (direct purchase)
- If you need to borrow, the finance modal shows repayment plans (3/6/12 months)
- If you don't have enough collateral, you can deposit ETH/WBTC/USDX directly from the finance modal
- Live borrow power preview shows how much deposit unlocks

### Exchange (DEX)

Built-in decentralized exchange using the SimpleSwap contract:
- Swap between ETH, WBTC, and USDX
- Live exchange rates from the oracle
- 0.3% swap fee
- Price impact calculation
- Rate auto-refreshes every 15 seconds

### Address Book and Transfer Limits

**Address Book:**
- Save frequently used recipient addresses with names and notes
- Quick-fill from address book when sending tokens
- Track transaction count per contact

**Transfer Limits (per credit tier):**

| Tier | Per Transaction | Daily Limit |
|------|----------------|-------------|
| Bronze (1) | $1,000 | $5,000 |
| Silver (2) | $5,000 | $25,000 |
| Gold (3) | $25,000 | $100,000 |

### Account Statements

- Monthly statement generation with date range selection
- Summary: opening balance, deposits, withdrawals, borrows, repayments, interest, fees, closing balance
- Export as CSV
- Individual transaction receipts with tx hash, gas, fees, and balance changes

---

## Architecture

### Project Structure

```
app/
├── contracts/                # Solidity smart contracts
│   ├── CreditProtocol.sol    #   Core lending protocol
│   ├── USDX.sol              #   Stablecoin token
│   ├── MockWBTC.sol           #   Mock wrapped Bitcoin with faucet
│   ├── MockPriceOracle.sol    #   ETH/WBTC price feeds
│   └── SimpleSwap.sol         #   DEX for token swaps
├── scripts/
│   ├── deploy.js              # Contract deployment (updates frontend config)
│   └── start-local.js         # npm start entrypoint
├── test/                      # Hardhat contract tests
├── backend/
│   ├── server.js              # Express server (API + static files)
│   ├── routes/                # API routes (auth, users, analytics, protocol)
│   ├── services/              # Event indexer, realtime WebSocket manager
│   └── models/                # MongoDB models (User, Transaction)
├── web/                       # React frontend (Vite)
│   ├── src/
│   │   ├── pages/             # 16 page components
│   │   ├── components/        # 18+ reusable UI components
│   │   ├── utils/             # Business logic utilities (11 modules)
│   │   ├── hooks/             # useWallet, useWalletSigner
│   │   ├── contexts/          # BuiltinWalletContext
│   │   └── config/
│   │       └── contracts.js   # Auto-synced contract addresses + ABIs
│   ├── package.json
│   └── vite.config.js
├── artifacts/                 # Compiled ABIs (auto-generated by Hardhat)
├── deployments/               # Deployment records (auto-generated)
├── Dockerfile                 # Docker image build
├── docker-compose.yml         # Container orchestration
├── docker-entrypoint.sh       # Docker startup sequence
├── .dockerignore
├── .env.example               # Environment template
├── hardhat.config.js          # Hardhat configuration
└── package.json               # Root scripts and dependencies
```

### Frontend Utilities

All in `web/src/utils/`:

| Module | Purpose |
|--------|---------|
| `contracts.js` | Read/write contract interactions, event parsing, error handling |
| `interest.js` | Tier-based APR, daily compound interest, repayment plans, amortization |
| `fees.js` | Origination, withdrawal, late payment, and maintenance fees |
| `supplyYield.js` | Deposit yield simulation (ETH 2.5%, WBTC 0.8% APY) |
| `creditScore.js` | FICO-style 300-850 credit score calculation |
| `addressBook.js` | Saved recipient management (localStorage) |
| `transferLimits.js` | Daily/per-tx transfer limits by tier |
| `assetPortfolio.js` | Marketplace asset valuation, pledging, risk scoring, enforcement |
| `walletCrypto.js` | Wallet encryption and key management |
| `pendingTxs.js` | Pending transaction queue tracking |
| `connectionManager.js` | Wallet connection state management |

### UI Components

| Component | Description |
|-----------|-------------|
| `ConfirmationModal` | Pre-transaction confirmation with detail rows and warnings |
| `Tooltip` | Hover info for DeFi terms (built-in dictionary) |
| `Skeleton` | Pulse-animated loading placeholders |
| `CreditTierRoadmap` | Visual tier 1 > 2 > 3 progression diagram |
| `CreditScoreGauge` | Semi-circular speedometer gauge (300-850) |
| `HealthFactorGauge` | Color-coded health factor visualization |
| `CreditTierBadge` | Animated tier display |
| `LoanAgreement` | Formal loan terms modal (scroll-to-agree) |
| `AddressBook` | Saved recipients panel |
| `TransactionReceipt` | Detailed receipt modal for any transaction |
| `NotificationCenter` | Bell icon dropdown with recent alerts |
| `QuickStatsBar` | Persistent top bar (health factor, collateral, debt, tier) |
| `GlossaryPanel` | Searchable DeFi glossary (floating `?` button) |
| `SetupGuide` | First-time MetaMask onboarding wizard |
| `NetworkStatus` | Chain connection indicator |
| `Toast` | Notification toasts with transaction hash support |
| `AccountSidebar` | Main navigation sidebar |
| `Header` | Page header with wallet connection |

### Backend API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (status, uptime, MongoDB status) |
| `/api/protocol/*` | * | Protocol operations (always available) |
| `/api/auth/*` | * | User authentication (requires MongoDB) |
| `/api/users/*` | * | User management (requires MongoDB) |
| `/api/analytics/*` | * | Analytics data (requires MongoDB) |

The backend also serves the production frontend from `web/dist/` and provides WebSocket connections for real-time event streaming.

MongoDB is **optional** - the app runs fully in blockchain-only mode without it.

---

## Docker Reference

### Build and run

```bash
# Build and start
docker compose up --build

# Build and start in background
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild from scratch (no cache)
docker compose build --no-cache && docker compose up
```

### With MongoDB

```bash
docker compose --profile with-db up --build
```

MongoDB data persists in a Docker volume (`mongo_data`).

### What happens at startup

The Docker entrypoint (`docker-entrypoint.sh`) runs these steps in order:

1. Start Hardhat blockchain node (port 8545)
2. Wait for node to be ready (up to 30 retries)
3. Deploy all 5 smart contracts
4. Build the production frontend (with correct contract addresses baked in)
5. Start the Express backend (serves API on port 3000 + frontend static files)

### Ports

| Port | Service | Description |
|------|---------|-------------|
| 3000 | Express | Frontend app + REST API |
| 8545 | Hardhat | JSON-RPC for MetaMask/wallet connections |

### Custom RPC URL in Docker

If you need MetaMask to connect through a different hostname (e.g., remote server):

```bash
# In docker-compose.yml, add under environment:
- VITE_RPC_URL=http://your-server-ip:8545
```

Then rebuild: `docker compose up --build`

---

## NPM Scripts

Run from the project root:

| Command | Description |
|---------|-------------|
| `npm start` | Start everything (Hardhat node + deploy + frontend dev server) |
| `npm run compile` | Compile Solidity contracts |
| `npm test` | Run contract test suite |
| `npm run test:coverage` | Generate test coverage report |
| `npm run deploy:local` | Deploy contracts to localhost |
| `npm run deploy:sepolia` | Deploy contracts to Sepolia testnet |
| `npm run node` | Start Hardhat node only |
| `npm run web:dev` | Start frontend dev server only |
| `npm run backend:start` | Start Express backend only |
| `npm run clean` | Clean compiled artifacts |

Frontend scripts (run from `web/`):

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |

---

## Deploying to Sepolia Testnet

1. **Get testnet ETH** from a [Sepolia faucet](https://sepoliafaucet.com/)

2. **Get an RPC URL** from [Alchemy](https://www.alchemy.com/) or [Infura](https://infura.io/)

3. **Configure `.env`:**
   ```bash
   SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
   PRIVATE_KEY=0xYOUR_DEPLOYER_PRIVATE_KEY
   ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY  # optional, for verification
   ```

4. **Deploy:**
   ```bash
   npm run deploy:sepolia
   ```

5. **Update frontend** to point to Sepolia:
   ```bash
   VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
   ```

---

## Troubleshooting

### Transactions fail with nonce errors

After restarting the Hardhat node, MetaMask still has old nonce data cached.

**Fix:** MetaMask > Settings > Advanced > Clear Activity Tab Data

### `npm start` hangs or port already in use

Another instance may be running.

```bash
# Kill processes on ports 8545 and 5173
# Windows:
netstat -ano | findstr :8545
taskkill /PID <pid> /F

# Linux/Mac:
lsof -ti:8545 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

### Docker: `exec docker-entrypoint.sh: no such file or directory`

The entrypoint script has Windows line endings (CRLF).

```bash
# Fix line endings
sed -i 's/\r$//' docker-entrypoint.sh

# Or on Windows with Git:
git config core.autocrlf false
```

Then rebuild: `docker compose build --no-cache`

### Docker: Container restarts in a loop

Check logs for the specific error:
```bash
docker compose logs -f
```

Common causes:
- Port 8545 or 3000 already in use on host
- Insufficient memory (needs ~2GB)

### Frontend shows "Contract not found" or zero balances

Contracts need to be deployed to the running Hardhat node:
```bash
npm run deploy:local
```

In Docker, this happens automatically at startup.

### MongoDB connection failed

This is normal if you're not running MongoDB. The app falls back to blockchain-only mode. To use MongoDB:

```bash
# With Docker:
docker compose --profile with-db up --build

# Local:
mongod
```

### WBTC balance is zero

Use the WBTC faucet on the Deposit page (or in the Wallet Manager) to mint 1 WBTC for free.

---

## Security

**Smart Contract Security:**
- ReentrancyGuard on all state-changing functions
- SafeERC20 for token transfers
- Access control (only protocol can mint/burn USDX)
- Health factor checks prevent unsafe withdrawals/borrows
- Solidity 0.8.20 built-in overflow/underflow protection

**Frontend Security:**
- No real private key generation or storage (test accounts only)
- All wallet data in localStorage (local to the browser)
- Confirmation modals before all destructive transactions

**Important Notes:**
- Hardhat node is ephemeral - all data is lost on restart
- Test account private keys are publicly known (never use with real funds)
- Interest, fees, and credit scores are frontend simulations
- Marketplace purchases are stored in browser localStorage


