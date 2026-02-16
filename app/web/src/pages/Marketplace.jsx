import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useWalletSigner } from '../hooks/useWalletSigner';
import { ethers } from 'ethers';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import ConfirmationModal from '../components/ConfirmationModal';
import { useToast } from '../components/Toast';
import {
    getUSDXBalance, getWBTCBalance, getOraclePrices,
    getContract, getReadProvider, getUserPosition, borrowUSDX,
    depositETH, depositWBTC, depositUSDX, getWBTCFromFaucet
} from '../utils/contracts';
import { getAPRForTier, formatAPR, generateRepaymentPlans, recordBorrow } from '../utils/interest';
import {
    getOwnedAssets, pledgeAsset, unpledgeAsset, getAssetCollateralValue,
    getCustomerWorth, calculateAssetRisk, getEnforcementOptions,
    seizeAssets, fileLegalClaim, offerSettlement, getEnforcementHistory
} from '../utils/assetPortfolio';

// Merchant address (Hardhat account #9 - receives payments)
const MERCHANT_ADDRESS = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720';

const CATEGORIES = [
    { id: 'all', label: 'All', icon: 'globe' },
    { id: 'nft', label: 'NFTs', icon: 'cube' },
    { id: 'realestate', label: 'Real Estate', icon: 'home' },
    { id: 'vehicles', label: 'Vehicles', icon: 'rocket' },
    { id: 'electronics', label: 'Electronics', icon: 'network' },
    { id: 'gaming', label: 'Gaming', icon: 'simulator' },
    { id: 'luxury', label: 'Luxury', icon: 'shield' },
];

const PRODUCTS = [
    // NFTs
    { id: 1, name: 'CryptoPunk #7804', desc: 'Rare alien punk with pipe. One of 9 alien punks in existence.', price: 500, category: 'nft', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', tag: 'Rare' },
    { id: 2, name: 'Bored Ape #3429', desc: 'Gold fur bored ape with laser eyes and crown.', price: 350, category: 'nft', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', tag: 'Popular' },
    { id: 3, name: 'Art Blocks Chromie', desc: 'Generative art piece from the Chromie Squiggle collection.', price: 120, category: 'nft', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', tag: 'Art' },
    { id: 4, name: 'Azuki #1234', desc: 'Anime-inspired PFP with unique traits and garden pass.', price: 200, category: 'nft', gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', tag: 'Hot' },
    { id: 5, name: 'Doodles #5678', desc: 'Colorful hand-drawn doodle character with space helmet.', price: 80, category: 'nft', gradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', tag: 'New' },
    { id: 6, name: 'CloneX #9012', desc: 'Nike x RTFKT metaverse-ready 3D avatar with DNA traits.', price: 150, category: 'nft', gradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)' },

    // Real Estate
    { id: 7, name: 'Miami Beach Condo', desc: '2BR/2BA luxury oceanfront condo. 1,200 sqft with balcony views.', price: 45000, category: 'realestate', gradient: 'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)', tag: 'Featured' },
    { id: 8, name: 'Manhattan Studio', desc: 'Prime Midtown location. Modern finishes, doorman building.', price: 35000, category: 'realestate', gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', tag: 'Prime' },
    { id: 9, name: 'Decentraland Plot', desc: 'Virtual land parcel in Fashion District. 16x16 meters.', price: 2500, category: 'realestate', gradient: 'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)', tag: 'Virtual' },
    { id: 10, name: 'Dubai Marina Apt', desc: '1BR apartment with marina views. Premium amenities included.', price: 28000, category: 'realestate', gradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
    { id: 11, name: 'Sandbox Estate', desc: 'Large virtual estate in The Sandbox. 3x3 LAND bundle.', price: 5000, category: 'realestate', gradient: 'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)', tag: 'Virtual' },

    // Vehicles
    { id: 12, name: 'Tesla Model S Plaid', desc: '0-60 in 1.99s. 396mi range. Full self-driving included.', price: 8900, category: 'vehicles', gradient: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)', tag: 'Electric' },
    { id: 13, name: 'Porsche 911 GT3', desc: '4.0L flat-six, 502hp. Track-ready with street manners.', price: 17500, category: 'vehicles', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', tag: 'Sport' },
    { id: 14, name: 'BMW iX M60', desc: 'Electric luxury SUV. 610hp, 0-60 in 3.6s. Loaded.', price: 11000, category: 'vehicles', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 15, name: 'Cybertruck', desc: 'Stainless steel exoskeleton. Tri-motor AWD. 500mi range.', price: 7500, category: 'vehicles', gradient: 'linear-gradient(135deg, #c3cfe2 0%, #f5f7fa 100%)', tag: 'Pre-order' },

    // Electronics
    { id: 16, name: 'MacBook Pro M3 Max', desc: '16" Liquid Retina XDR. 96GB RAM, 4TB SSD. Space Black.', price: 450, category: 'electronics', gradient: 'linear-gradient(135deg, #434343 0%, #000000 100%)', tag: 'Pro' },
    { id: 17, name: 'Ledger Nano X Pro', desc: 'Hardware wallet with Bluetooth. Supports 5500+ coins.', price: 25, category: 'electronics', gradient: 'linear-gradient(135deg, #00d2ff 0%, #3a47d5 100%)' },
    { id: 18, name: 'Sony PS5 Pro Bundle', desc: 'Console + 2 controllers + 5 games. 2TB SSD expansion.', price: 85, category: 'electronics', gradient: 'linear-gradient(135deg, #0250c5 0%, #d43f8d 100%)', tag: 'Bundle' },
    { id: 19, name: 'Samsung 85" QLED', desc: 'Neo QLED 8K TV. AI upscaling, anti-reflection screen.', price: 380, category: 'electronics', gradient: 'linear-gradient(135deg, #0c3483 0%, #a2b6df 100%)' },
    { id: 20, name: 'Apple Vision Pro', desc: 'Spatial computing headset. M2 + R1 chips. 256GB.', price: 350, category: 'electronics', gradient: 'linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)', tag: 'New' },

    // Gaming
    { id: 21, name: 'Axie Infinity Land', desc: 'Savannah land plot with resource generation. Play-to-earn.', price: 600, category: 'gaming', gradient: 'linear-gradient(135deg, #f43b47 0%, #453a94 100%)', tag: 'P2E' },
    { id: 22, name: 'CS2 Dragon Lore AWP', desc: 'Factory new Souvenir AWP Dragon Lore skin. Ultra rare.', price: 1500, category: 'gaming', gradient: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)', tag: 'Legendary' },
    { id: 23, name: 'Fortnite V-Bucks 50K', desc: '50,000 V-Bucks bundle for skins, battle passes, and emotes.', price: 40, category: 'gaming', gradient: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)' },
    { id: 24, name: 'Illuvium Illuvial Pack', desc: 'Mega pack of 50 Illuvials for the open-world RPG.', price: 250, category: 'gaming', gradient: 'linear-gradient(135deg, #0abcf9 0%, #2c69d1 100%)', tag: 'RPG' },

    // Luxury
    { id: 25, name: 'Rolex Submariner', desc: 'Ref 126610LN. Black dial, Oystersteel. 2024 model.', price: 1400, category: 'luxury', gradient: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)', tag: 'Iconic' },
    { id: 26, name: 'Louis Vuitton Trunk', desc: 'Classic monogram trunk. Hand-crafted in France. Limited.', price: 2200, category: 'luxury', gradient: 'linear-gradient(135deg, #c79081 0%, #dfa579 100%)', tag: 'Limited' },
    { id: 27, name: 'Hermes Birkin 30', desc: 'Togo leather, gold hardware. Color: Etoupe. Brand new.', price: 3500, category: 'luxury', gradient: 'linear-gradient(135deg, #e8cbc0 0%, #636fa4 100%)' },
    { id: 28, name: 'Diamond Necklace 5ct', desc: 'VS1 clarity, D color. 18K white gold chain. Certified.', price: 6000, category: 'luxury', gradient: 'linear-gradient(135deg, #e6dee9 0%, #bdc2e8 100%)', tag: 'Premium' },
];

const LOAN_PURPOSES = [
    { id: 'nft', label: 'NFT Purchase', icon: 'cube' },
    { id: 'realestate', label: 'Real Estate / Mortgage', icon: 'home' },
    { id: 'vehicle', label: 'Vehicle Loan', icon: 'rocket' },
    { id: 'electronics', label: 'Electronics', icon: 'network' },
    { id: 'business', label: 'Business Capital', icon: 'stats' },
    { id: 'personal', label: 'Personal Loan', icon: 'user' },
    { id: 'other', label: 'Other', icon: 'globe' },
];

const LS_KEY = 'cryptocredit_purchases';
const LOANS_KEY = 'cryptocredit_loan_applications';

function getPurchaseHistory() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function savePurchase(entry) {
    const hist = [entry, ...getPurchaseHistory()].slice(0, 50);
    localStorage.setItem(LS_KEY, JSON.stringify(hist));
    return hist;
}
function getLoanApplications() {
    try { return JSON.parse(localStorage.getItem(LOANS_KEY) || '[]'); } catch { return []; }
}
function saveLoanApplication(entry) {
    const hist = [entry, ...getLoanApplications()].slice(0, 50);
    localStorage.setItem(LOANS_KEY, JSON.stringify(hist));
    return hist;
}

const MARKETPLACE_TABS = [
    { id: 'shop', label: 'Shop', icon: 'shop' },
    { id: 'assets', label: 'My Assets', icon: 'portfolio' },
    { id: 'worth', label: 'Customer Worth', icon: 'stats' },
    { id: 'enforcement', label: 'Enforcement', icon: 'shield' },
];

export default function Marketplace() {
    const { address, isConnected } = useWallet();
    const { getSigner: getSignerFn } = useWalletSigner();
    const toast = useToast();

    // Tab state
    const [activeTab, setActiveTab] = useState('shop');

    const [category, setCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [balances, setBalances] = useState({ eth: '0', wbtc: '0', usdx: '0' });
    const [prices, setPrices] = useState({ ethPrice: 2000, wbtcPrice: 40000 });
    const [position, setPosition] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [payAsset, setPayAsset] = useState('USDX');
    const [buying, setBuying] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [purchases, setPurchases] = useState(getPurchaseHistory());
    const [showHistory, setShowHistory] = useState(false);
    const [sortBy, setSortBy] = useState('default');

    // Item-specific loan state
    const [loanProduct, setLoanProduct] = useState(null);
    const [selectedPlan, setSelectedPlan] = useState(1);
    const [loanProcessing, setLoanProcessing] = useState(false);
    const [financeDepAsset, setFinanceDepAsset] = useState('ETH');
    const [financeDepAmount, setFinanceDepAmount] = useState('');
    const [financeDepLoading, setFinanceDepLoading] = useState(false);

    // General loan application state
    const [showLoanApp, setShowLoanApp] = useState(false);
    const [loanAppStep, setLoanAppStep] = useState(1);
    const [loanPurpose, setLoanPurpose] = useState('');
    const [loanAmount, setLoanAmount] = useState('');
    const [loanPlanIdx, setLoanPlanIdx] = useState(1);
    const [depositAsset, setDepositAsset] = useState('ETH');
    const [depositAmount, setDepositAmount] = useState('');
    const [loanAppProcessing, setLoanAppProcessing] = useState(false);
    const [loanApplications, setLoanApplications] = useState(getLoanApplications());

    // Assets tab state
    const [assetFilter, setAssetFilter] = useState('all');
    const [assetSort, setAssetSort] = useState('value-high');
    const [ownedAssets, setOwnedAssets] = useState([]);

    // Enforcement state
    const [enforcementHistory, setEnforcementHistory] = useState([]);
    const [showEnforcementConfirm, setShowEnforcementConfirm] = useState(null);

    useEffect(() => {
        if (isConnected && address) fetchData();
    }, [isConnected, address]);

    // Refresh assets when tab changes or purchases change
    useEffect(() => {
        if (address) {
            setOwnedAssets(getOwnedAssets(address));
            setEnforcementHistory(getEnforcementHistory(address));
        }
    }, [address, activeTab, purchases]);

    const fetchData = async () => {
        try {
            const provider = getReadProvider();
            const [ethBal, wbtcBal, usdxBal, oraclePrices, pos] = await Promise.all([
                provider.getBalance(address),
                getWBTCBalance(address, provider),
                getUSDXBalance(address, provider),
                getOraclePrices(provider),
                getUserPosition(address, provider),
            ]);
            setBalances({ eth: ethers.formatEther(ethBal), wbtc: wbtcBal, usdx: usdxBal });
            setPrices(oraclePrices);
            setPosition(pos);
        } catch (err) {
            console.error('Error fetching data:', err);
        }
    };

    // Price/balance helpers
    const getPayAmount = (product) => {
        if (payAsset === 'USDX') return product.price.toFixed(2);
        if (payAsset === 'ETH') return (product.price / prices.ethPrice).toFixed(6);
        if (payAsset === 'WBTC') return (product.price / prices.wbtcPrice).toFixed(8);
        return product.price.toFixed(2);
    };
    const getPayBalance = () => {
        if (payAsset === 'ETH') return parseFloat(balances.eth) || 0;
        if (payAsset === 'WBTC') return parseFloat(balances.wbtc) || 0;
        return parseFloat(balances.usdx) || 0;
    };

    // Position helpers
    const tier = position?.creditTier || 1;
    const apr = getAPRForTier(tier);
    const currentDebt = position ? parseFloat(ethers.formatEther(position.debtAmount || 0n)) : 0;
    const maxBorrow = position ? parseFloat(ethers.formatEther(position.maxBorrow || 0n)) : 0;
    const availableToBorrow = Math.max(0, maxBorrow - currentDebt);
    const ethCollateral = position ? parseFloat(ethers.formatEther(position.ethCollateral || 0n)) : 0;
    const wbtcCollateral = position ? parseFloat(ethers.formatUnits(position.wbtcCollateral || 0n, 8)) : 0;
    const totalCollateralUSD = ethCollateral * prices.ethPrice + wbtcCollateral * prices.wbtcPrice;

    // Health factor
    let healthFactor = 999;
    if (position?.healthFactor) {
        const hfBig = typeof position.healthFactor === 'bigint' ? position.healthFactor : BigInt(position.healthFactor);
        if (hfBig > BigInt('1000000000000000000000')) {
            healthFactor = 999;
        } else {
            healthFactor = parseFloat(ethers.formatEther(hfBig));
        }
    }
    if (currentDebt === 0 && totalCollateralUSD > 0) healthFactor = 999;

    // Item-specific loan helpers
    const getLoanInfo = (product) => {
        if (!product) return null;
        const usdxBal = parseFloat(balances.usdx) || 0;
        const shortfall = Math.max(0, product.price - usdxBal);
        const borrowAmount = Math.ceil(shortfall * 100) / 100;
        const canBorrow = borrowAmount <= availableToBorrow;
        // Generate plans based on actual borrow amount; if 0, use full price for display
        const planBase = borrowAmount > 0 ? borrowAmount : product.price;
        const plans = generateRepaymentPlans(planBase, apr);
        return { usdxBal, shortfall, borrowAmount, canBorrow, plans };
    };

    // Finance modal: inline deposit collateral
    const handleFinanceDeposit = async () => {
        const amt = parseFloat(financeDepAmount);
        if (!amt || amt <= 0) { toast.warning('Invalid', 'Enter a deposit amount'); return; }
        const bal = parseFloat(financeDepAsset === 'ETH' ? balances.eth : financeDepAsset === 'WBTC' ? balances.wbtc : balances.usdx) || 0;
        if (amt > bal) { toast.error('Insufficient Balance', `You only have ${bal.toFixed(financeDepAsset === 'WBTC' ? 6 : financeDepAsset === 'ETH' ? 4 : 2)} ${financeDepAsset}`); return; }

        setFinanceDepLoading(true);
        try {
            const signer = await getSignerFn();
            if (financeDepAsset === 'ETH') {
                await depositETH(financeDepAmount, signer);
            } else if (financeDepAsset === 'WBTC') {
                await depositWBTC(financeDepAmount, signer);
            } else {
                await depositUSDX(financeDepAmount, signer);
            }
            toast.success('Collateral Deposited', `Deposited ${financeDepAmount} ${financeDepAsset}`);
            setFinanceDepAmount('');
            await fetchData();
        } catch (err) {
            toast.error('Deposit Failed', err.reason || err.message || 'Failed');
        } finally { setFinanceDepLoading(false); }
    };

    // ====== HANDLERS ======

    const handleBuyClick = (product) => { setSelectedProduct(product); setShowConfirm(true); };
    const handleFinanceClick = (product) => { setLoanProduct(product); setSelectedPlan(1); };

    const openLoanApplication = () => {
        setShowLoanApp(true);
        setLoanAppStep(1);
        setLoanPurpose('');
        setLoanAmount('');
        setLoanPlanIdx(1);
        setDepositAsset('ETH');
        setDepositAmount('');
    };

    // Direct purchase
    const executePurchase = async () => {
        if (!selectedProduct) return;
        setShowConfirm(false);
        setBuying(true);
        try {
            const payAmount = getPayAmount(selectedProduct);
            const balance = getPayBalance();
            if (parseFloat(payAmount) > balance) {
                toast.error('Insufficient Balance', `You need ${payAmount} ${payAsset} but only have ${balance.toFixed(6)} ${payAsset}`);
                setBuying(false); return;
            }
            const signer = await getSignerFn();
            let tx;
            if (payAsset === 'ETH') {
                tx = await signer.sendTransaction({ to: MERCHANT_ADDRESS, value: ethers.parseEther(payAmount) });
                await tx.wait();
            } else if (payAsset === 'WBTC') {
                const wbtc = getContract('WBTC', signer);
                tx = await wbtc.transfer(MERCHANT_ADDRESS, ethers.parseUnits(payAmount, 8));
                await tx.wait();
            } else {
                const usdx = getContract('USDX', signer);
                tx = await usdx.transfer(MERCHANT_ADDRESS, ethers.parseEther(payAmount));
                await tx.wait();
            }
            const hist = savePurchase({
                productId: selectedProduct.id, productName: selectedProduct.name,
                category: selectedProduct.category, priceUSD: selectedProduct.price,
                paidAmount: payAmount, paidAsset: payAsset, txHash: tx.hash,
                financed: false, timestamp: Date.now(),
                buyerAddress: address.toLowerCase(),
            });
            setPurchases(hist);
            toast.tx('Purchase Successful', `Bought ${selectedProduct.name} for ${payAmount} ${payAsset}`, tx.hash);
            setSelectedProduct(null);
            await fetchData();
        } catch (err) {
            toast.error('Purchase Failed', err.reason || err.message || 'Transaction failed');
        } finally { setBuying(false); }
    };

    // Item-specific loan + purchase
    const executeLoanPurchase = async () => {
        if (!loanProduct) return;
        const info = getLoanInfo(loanProduct);
        if (!info) return;
        setLoanProcessing(true);
        try {
            const signer = await getSignerFn();

            // Only borrow if there's actually a shortfall
            if (info.borrowAmount > 0) {
                if (!info.canBorrow) { toast.error('Cannot Borrow', 'Borrow amount exceeds your available limit'); setLoanProcessing(false); return; }
                toast.info('Step 1/2', `Borrowing ${info.borrowAmount.toFixed(2)} USDX...`);
                await borrowUSDX(info.borrowAmount.toFixed(2), signer);
                recordBorrow(address, info.borrowAmount, tier);
            } else {
                toast.info('Step 1/2', 'You have enough USDX — no borrowing needed');
            }

            toast.info('Step 2/2', `Purchasing ${loanProduct.name}...`);
            const usdx = getContract('USDX', signer);
            const payTx = await usdx.transfer(MERCHANT_ADDRESS, ethers.parseEther(loanProduct.price.toFixed(2)));
            await payTx.wait();

            const plan = info.plans[selectedPlan] || info.plans[0];
            const hist = savePurchase({
                productId: loanProduct.id, productName: loanProduct.name,
                category: loanProduct.category, priceUSD: loanProduct.price,
                paidAmount: loanProduct.price.toFixed(2), paidAsset: 'USDX', txHash: payTx.hash,
                financed: true, loanAmount: info.borrowAmount,
                repaymentPlan: plan.months + ' months', monthlyPayment: plan.monthlyPayment,
                totalWithInterest: plan.totalPayment, apr, timestamp: Date.now(),
                buyerAddress: address.toLowerCase(),
            });
            setPurchases(hist);
            toast.tx('Financed Purchase Complete', `Bought ${loanProduct.name} - Borrowed ${info.borrowAmount.toFixed(2)} USDX at ${formatAPR(apr)} APR`, payTx.hash);
            setLoanProduct(null);
            await fetchData();
        } catch (err) {
            toast.error('Loan Purchase Failed', err.reason || err.message || 'Transaction failed');
        } finally { setLoanProcessing(false); }
    };

    // General loan: deposit collateral step
    const handleLoanDeposit = async () => {
        const amt = parseFloat(depositAmount);
        if (!amt || amt <= 0) { toast.warning('Invalid', 'Enter a deposit amount'); return; }
        const bal = parseFloat(depositAsset === 'ETH' ? balances.eth : depositAsset === 'WBTC' ? balances.wbtc : balances.usdx) || 0;
        if (amt > bal) { toast.error('Insufficient Balance', `You only have ${bal.toFixed(depositAsset === 'WBTC' ? 6 : depositAsset === 'ETH' ? 4 : 2)} ${depositAsset}`); return; }

        setLoanAppProcessing(true);
        try {
            const signer = await getSignerFn();
            if (depositAsset === 'ETH') {
                await depositETH(depositAmount, signer);
            } else if (depositAsset === 'WBTC') {
                await depositWBTC(depositAmount, signer);
            } else {
                await depositUSDX(depositAmount, signer);
            }
            toast.success('Collateral Deposited', `Deposited ${depositAmount} ${depositAsset}`);
            setDepositAmount('');
            await fetchData();
        } catch (err) {
            toast.error('Deposit Failed', err.reason || err.message || 'Failed');
        } finally { setLoanAppProcessing(false); }
    };

    // General loan: finalize borrow
    const executeGeneralLoan = async () => {
        const amt = parseFloat(loanAmount);
        if (!amt || amt <= 0) return;
        if (amt > availableToBorrow) { toast.error('Exceeds Limit', `Max borrowable: $${availableToBorrow.toFixed(2)}`); return; }

        setLoanAppProcessing(true);
        try {
            const signer = await getSignerFn();
            const tx = await borrowUSDX(loanAmount, signer);
            recordBorrow(address, amt, tier);

            const plans = generateRepaymentPlans(amt, apr);
            const plan = plans[loanPlanIdx] || plans[0];
            const apps = saveLoanApplication({
                amount: amt, purpose: loanPurpose, apr,
                tier, plan: plan.months + ' months',
                monthlyPayment: plan.monthlyPayment,
                totalWithInterest: plan.totalPayment,
                txHash: tx.hash, status: 'approved',
                timestamp: Date.now(),
            });
            setLoanApplications(apps);

            toast.tx('Loan Approved', `Borrowed ${amt.toFixed(2)} USDX at ${formatAPR(apr)} APR - ${plan.months} month plan`, tx.hash);
            setShowLoanApp(false);
            await fetchData();
        } catch (err) {
            toast.error('Loan Failed', err.reason || err.message || 'Transaction failed');
        } finally { setLoanAppProcessing(false); }
    };

    // Asset pledge/unpledge
    const handlePledgeToggle = (asset) => {
        if (asset.isPledged) {
            unpledgeAsset(address, asset.assetKey);
            toast.success('Unpledged', `${asset.productName} removed from collateral`);
        } else {
            pledgeAsset(address, asset.assetKey);
            toast.success('Pledged', `${asset.productName} pledged as collateral (+$${asset.collateralValue.toFixed(2)} borrow power)`);
        }
        setOwnedAssets(getOwnedAssets(address));
    };

    // Enforcement actions
    const handleEnforcementAction = (actionId) => {
        if (actionId === 'seize') {
            const result = seizeAssets(address);
            toast.success('Assets Seized', `${result.seized} asset(s) seized, recovered $${result.recoveredValue.toFixed(2)}`);
        } else if (actionId === 'legal') {
            fileLegalClaim(address, currentDebt);
            toast.success('Legal Claim Filed', `Proceedings initiated for $${currentDebt.toFixed(2)} debt`);
        } else if (actionId === 'settlement') {
            offerSettlement(address, currentDebt);
            toast.success('Settlement Offered', `70% settlement ($${(currentDebt * 0.7).toFixed(2)}) proposed`);
        }
        setShowEnforcementConfirm(null);
        setOwnedAssets(getOwnedAssets(address));
        setEnforcementHistory(getEnforcementHistory(address));
    };

    // Filters
    const filtered = PRODUCTS.filter(p => {
        if (category !== 'all' && p.category !== category) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.category.includes(q);
        }
        return true;
    }).sort((a, b) => {
        if (sortBy === 'price-low') return a.price - b.price;
        if (sortBy === 'price-high') return b.price - a.price;
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return 0;
    });

    // Asset tab filtering/sorting
    const filteredAssets = ownedAssets
        .filter(a => {
            if (assetFilter === 'pledged') return a.isPledged;
            if (assetFilter === 'unpledged') return !a.isPledged;
            if (assetFilter === 'owned') return !a.financed;
            if (assetFilter === 'financed') return a.financed === true;
            if (assetFilter !== 'all') return a.category === assetFilter;
            return true;
        })
        .sort((a, b) => {
            if (assetSort === 'value-high') return b.currentValue - a.currentValue;
            if (assetSort === 'value-low') return a.currentValue - b.currentValue;
            if (assetSort === 'change') return b.changePercent - a.changePercent;
            if (assetSort === 'recent') return b.timestamp - a.timestamp;
            return 0;
        });

    const categoryStats = CATEGORIES.filter(c => c.id !== 'all').map(c => ({
        ...c, count: PRODUCTS.filter(p => p.category === c.id).length,
        minPrice: Math.min(...PRODUCTS.filter(p => p.category === c.id).map(p => p.price)),
    }));

    const confirmDetails = selectedProduct ? [
        { label: 'Item', value: selectedProduct.name },
        { label: 'Category', value: CATEGORIES.find(c => c.id === selectedProduct.category)?.label || '' },
        { label: 'Price (USD)', value: `$${selectedProduct.price.toLocaleString()}` },
        { label: 'Pay With', value: `${getPayAmount(selectedProduct)} ${payAsset}` },
        { label: 'Your Balance', value: `${getPayBalance().toFixed(6)} ${payAsset}` },
    ] : [];

    const loanInfo = getLoanInfo(loanProduct);
    const generalLoanAmt = parseFloat(loanAmount) || 0;
    const generalPlans = generalLoanAmt > 0 ? generateRepaymentPlans(generalLoanAmt, apr) : [];
    const generalCanBorrow = generalLoanAmt > 0 && generalLoanAmt <= availableToBorrow;

    // Customer worth + risk
    const assetCollateralVal = getAssetCollateralValue(address);
    const worth = getCustomerWorth(address, totalCollateralUSD, currentDebt);
    const risk = calculateAssetRisk(address);
    const enforcementOptions = getEnforcementOptions(address, healthFactor, currentDebt);

    return (
        <>
            <main className="page-section">
                <div className="page-container">
                    <div className="page-header">
                        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                            <div>
                                <h1 className="page-title">Marketplace</h1>
                                <p className="page-subtitle">Shop with crypto, finance purchases, or apply for a loan</p>
                            </div>
                            <div className="flex gap-sm">
                                <button className="btn btn-sm marketplace-finance-btn" onClick={openLoanApplication}>
                                    <Icon name="borrow" size={14} /> Apply for Loan
                                </button>
                                <button
                                    className={`btn ${showHistory ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                                    onClick={() => setShowHistory(!showHistory)}
                                >
                                    <Icon name="history" size={14} /> Orders ({purchases.length})
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="marketplace-tabs">
                        {MARKETPLACE_TABS.map(tab => (
                            <button
                                key={tab.id}
                                className={`marketplace-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <Icon name={tab.icon} size={14} />
                                <span>{tab.label}</span>
                                {tab.id === 'assets' && ownedAssets.length > 0 && (
                                    <span className="marketplace-tab-badge">{ownedAssets.length}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ====== SHOP TAB ====== */}
                    {activeTab === 'shop' && (
                        <>
                            {/* Balance Bar */}
                            <div className="marketplace-balance-bar">
                                <div className="marketplace-balance-item">
                                    <span className="text-muted text-xs">ETH</span>
                                    <span className="mono font-bold">{parseFloat(balances.eth).toFixed(4)}</span>
                                </div>
                                <div className="marketplace-balance-item">
                                    <span className="text-muted text-xs">WBTC</span>
                                    <span className="mono font-bold">{parseFloat(balances.wbtc).toFixed(6)}</span>
                                </div>
                                <div className="marketplace-balance-item">
                                    <span className="text-muted text-xs">USDX</span>
                                    <span className="mono font-bold">{parseFloat(balances.usdx).toFixed(2)}</span>
                                </div>
                                <div className="marketplace-balance-divider" />
                                <div className="marketplace-balance-item">
                                    <span className="text-muted text-xs">Collateral</span>
                                    <span className="mono font-bold">${totalCollateralUSD.toFixed(0)}</span>
                                </div>
                                <div className="marketplace-balance-item">
                                    <span className="text-muted text-xs">Borrow Limit</span>
                                    <span className="mono font-bold" style={{ color: 'var(--primary)' }}>${availableToBorrow.toFixed(2)}</span>
                                </div>
                                <div className="marketplace-balance-divider" />
                                <div className="marketplace-balance-item">
                                    <span className="text-muted text-xs">Pay With</span>
                                    <select className="marketplace-pay-select" value={payAsset} onChange={e => setPayAsset(e.target.value)}>
                                        <option value="USDX">USDX</option>
                                        <option value="ETH">ETH</option>
                                        <option value="WBTC">WBTC</option>
                                    </select>
                                </div>
                            </div>

                            {/* Order History */}
                            {showHistory && (
                                <div className="dashboard-card mb-lg">
                                    <h3 className="card-title">Order & Loan History</h3>
                                    {purchases.length === 0 && loanApplications.length === 0 ? (
                                        <div className="text-center" style={{ padding: 'var(--spacing-xl)' }}>
                                            <Icon name="portfolio" size={48} />
                                            <p className="text-muted mt-md">No history yet</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-sm">
                                            {loanApplications.slice(0, 5).map((l, i) => (
                                                <div key={`loan-${i}`} className="marketplace-order-row">
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div className="font-bold text-sm">
                                                            Loan: {LOAN_PURPOSES.find(p => p.id === l.purpose)?.label || l.purpose}
                                                            <span className="loan-badge-sm" style={{ background: 'rgba(0,212,170,0.15)', color: 'var(--success)' }}>Approved</span>
                                                        </div>
                                                        <div className="text-xs text-muted">
                                                            {new Date(l.timestamp).toLocaleDateString()} - {l.plan} @ {formatAPR(l.apr)} - ${l.monthlyPayment?.toFixed(2)}/mo
                                                        </div>
                                                    </div>
                                                    <div className="mono font-bold text-sm" style={{ color: 'var(--accent)' }}>${l.amount.toLocaleString()}</div>
                                                </div>
                                            ))}
                                            {purchases.slice(0, 10).map((p, i) => (
                                                <div key={`purchase-${i}`} className="marketplace-order-row">
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div className="font-bold text-sm">
                                                            {p.productName}
                                                            {p.financed && <span className="loan-badge-sm">Financed</span>}
                                                        </div>
                                                        <div className="text-xs text-muted">
                                                            {new Date(p.timestamp).toLocaleDateString()} - Paid {p.paidAmount} {p.paidAsset}
                                                            {p.financed && ` (Loan: ${p.loanAmount?.toFixed(2)} USDX @ ${formatAPR(p.apr)})`}
                                                        </div>
                                                    </div>
                                                    <div className="mono font-bold text-sm" style={{ color: 'var(--primary)' }}>${p.priceUSD.toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Category Pills */}
                            <div className="marketplace-categories">
                                {CATEGORIES.map(cat => (
                                    <button key={cat.id} className={`marketplace-cat-pill ${category === cat.id ? 'active' : ''}`} onClick={() => setCategory(cat.id)}>
                                        <Icon name={cat.icon} size={14} />
                                        <span>{cat.label}</span>
                                        {cat.id !== 'all' && <span className="marketplace-cat-count">{PRODUCTS.filter(p => p.category === cat.id).length}</span>}
                                    </button>
                                ))}
                            </div>

                            {/* Search + Sort */}
                            <div className="flex gap-sm mb-lg" style={{ flexWrap: 'wrap' }}>
                                <div className="input-group" style={{ flex: '1 1 250px' }}>
                                    <span className="input-addon" style={{ padding: '0 8px' }}><Icon name="search" size={14} /></span>
                                    <input type="text" className="form-input" placeholder="Search items..."
                                        value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ fontSize: '0.85rem' }} />
                                </div>
                                <select className="form-input" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }}>
                                    <option value="default">Default</option>
                                    <option value="price-low">Price: Low to High</option>
                                    <option value="price-high">Price: High to Low</option>
                                    <option value="name">Name: A-Z</option>
                                </select>
                                <div className="text-sm text-muted" style={{ alignSelf: 'center' }}>{filtered.length} items</div>
                            </div>

                            {/* Product Grid */}
                            {filtered.length === 0 ? (
                                <div className="dashboard-card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                                    <Icon name="search" size={48} />
                                    <h3 className="mt-md mb-sm">No Items Found</h3>
                                    <p className="text-muted">Try adjusting your search or category filter</p>
                                </div>
                            ) : (
                                <div className="marketplace-grid">
                                    {filtered.map(product => {
                                        const cryptoPrice = getPayAmount(product);
                                        const canAfford = parseFloat(cryptoPrice) <= getPayBalance();
                                        const canFinance = product.price <= (availableToBorrow + (parseFloat(balances.usdx) || 0));
                                        return (
                                            <div key={product.id} className="marketplace-card">
                                                <div className="marketplace-card-image" style={{ background: product.gradient }}>
                                                    {product.tag && <span className="marketplace-card-tag">{product.tag}</span>}
                                                    <div className="marketplace-card-category">{CATEGORIES.find(c => c.id === product.category)?.label}</div>
                                                </div>
                                                <div className="marketplace-card-body">
                                                    <h4 className="marketplace-card-title">{product.name}</h4>
                                                    <p className="marketplace-card-desc">{product.desc}</p>
                                                    <div className="marketplace-card-price">
                                                        <div>
                                                            <div className="marketplace-price-usd">${product.price.toLocaleString()}</div>
                                                            <div className="marketplace-price-crypto">{cryptoPrice} {payAsset}</div>
                                                        </div>
                                                    </div>
                                                    {!canAfford && (
                                                        <div className="text-xs" style={{ color: 'var(--danger)', marginBottom: '6px' }}>
                                                            Insufficient {payAsset} balance ({getPayBalance().toFixed(payAsset === 'WBTC' ? 6 : 4)} available)
                                                        </div>
                                                    )}
                                                    <div className="marketplace-card-actions">
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={() => handleBuyClick(product)}
                                                            disabled={buying || !canAfford || !isConnected}
                                                        >
                                                            {buying ? 'Processing...' : canAfford ? 'Buy Now' : `Need ${payAsset}`}
                                                        </button>
                                                        <button
                                                            className="btn btn-sm marketplace-finance-btn"
                                                            onClick={() => handleFinanceClick(product)}
                                                            disabled={!canFinance || !isConnected}
                                                            title={!canFinance ? 'Need more collateral' : 'Borrow USDX to buy this item'}
                                                        >
                                                            <Icon name="borrow" size={11} /> Finance
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Category Stats */}
                            <div className="dashboard-card mt-lg">
                                <h3 className="card-title">Browse by Category</h3>
                                <div className="marketplace-cat-grid">
                                    {categoryStats.map(cat => (
                                        <button key={cat.id} className="marketplace-cat-card"
                                            onClick={() => { setCategory(cat.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                                            <div className="marketplace-cat-card-icon"><Icon name={cat.icon} size={24} /></div>
                                            <div className="marketplace-cat-card-label">{cat.label}</div>
                                            <div className="marketplace-cat-card-info">{cat.count} items from ${cat.minPrice.toLocaleString()}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ====== MY ASSETS TAB ====== */}
                    {activeTab === 'assets' && (
                        <>
                            {/* Summary Stats Bar */}
                            <div className="asset-summary-bar">
                                <div className="asset-summary-item">
                                    <span className="text-muted text-xs">Total Value</span>
                                    <span className="mono font-bold" style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>
                                        ${worth.totalAssetValue.toFixed(2)}
                                    </span>
                                </div>
                                <div className="asset-summary-item">
                                    <span className="text-muted text-xs">Owned Outright</span>
                                    <span className="mono font-bold" style={{ color: 'var(--success)', fontSize: '0.95rem' }}>
                                        {worth.ownedOutrightCount} items
                                    </span>
                                </div>
                                <div className="asset-summary-item">
                                    <span className="text-muted text-xs">Financed</span>
                                    <span className="mono font-bold" style={{ color: 'var(--accent)', fontSize: '0.95rem' }}>
                                        {worth.financedCount} items
                                    </span>
                                </div>
                                <div className="asset-summary-item">
                                    <span className="text-muted text-xs">Pledged</span>
                                    <span className="mono font-bold" style={{ fontSize: '0.95rem' }}>
                                        ${worth.pledgedAssetValue.toFixed(2)}
                                    </span>
                                </div>
                                <div className="asset-summary-item">
                                    <span className="text-muted text-xs">Borrow Power</span>
                                    <span className="mono font-bold" style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>
                                        +${assetCollateralVal.toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            {/* Filter/Sort */}
                            <div className="flex gap-sm mb-lg" style={{ flexWrap: 'wrap' }}>
                                <select className="form-input" value={assetFilter} onChange={e => setAssetFilter(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }}>
                                    <option value="all">All Assets</option>
                                    <option value="owned">Owned Outright</option>
                                    <option value="financed">Financed / On Loan</option>
                                    <option value="pledged">Pledged Only</option>
                                    <option value="unpledged">Unpledged Only</option>
                                    {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                                        <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                </select>
                                <select className="form-input" value={assetSort} onChange={e => setAssetSort(e.target.value)} style={{ width: 'auto', fontSize: '0.85rem' }}>
                                    <option value="value-high">Value: High to Low</option>
                                    <option value="value-low">Value: Low to High</option>
                                    <option value="change">Best Performance</option>
                                    <option value="recent">Most Recent</option>
                                </select>
                                <div className="text-sm text-muted" style={{ alignSelf: 'center' }}>{filteredAssets.length} assets</div>
                            </div>

                            {filteredAssets.length === 0 ? (
                                <div className="dashboard-card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                                    <Icon name="portfolio" size={48} />
                                    <h3 className="mt-md mb-sm">{ownedAssets.length === 0 ? 'No Assets Yet' : 'No Matching Assets'}</h3>
                                    <p className="text-muted mb-lg">
                                        {ownedAssets.length === 0 ? 'Purchase items from the Shop tab to build your portfolio' : 'Adjust your filters'}
                                    </p>
                                    {ownedAssets.length === 0 && (
                                        <button className="btn btn-primary" onClick={() => setActiveTab('shop')}>Browse Shop</button>
                                    )}
                                </div>
                            ) : (
                                <div className="marketplace-grid">
                                    {filteredAssets.map(asset => {
                                        const product = PRODUCTS.find(p => p.id === asset.productId);
                                        const gradient = product?.gradient || 'linear-gradient(135deg, #434343, #000)';
                                        const catLabel = CATEGORIES.find(c => c.id === asset.category)?.label || asset.category;
                                        const isFinanced = asset.financed === true;
                                        return (
                                            <div key={asset.assetKey} className={`marketplace-card ${asset.isPledged ? 'asset-pledged' : ''}`}>
                                                <div className="marketplace-card-image" style={{ background: gradient, position: 'relative' }}>
                                                    <div className="marketplace-card-category">{catLabel}</div>
                                                    {asset.isPledged && (
                                                        <span className="marketplace-card-tag" style={{ background: 'var(--primary)', color: '#000' }}>PLEDGED</span>
                                                    )}
                                                    {!asset.isPledged && (
                                                        <span className="marketplace-card-tag" style={{
                                                            background: isFinanced ? 'var(--accent)' : 'var(--success)',
                                                            color: '#000',
                                                        }}>
                                                            {isFinanced ? 'FINANCED' : 'OWNED'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="marketplace-card-body">
                                                    <h4 className="marketplace-card-title">{asset.productName}</h4>
                                                    {/* Ownership status */}
                                                    <div className="asset-ownership-badge" style={{
                                                        background: isFinanced ? 'rgba(240,165,0,0.1)' : 'rgba(0,212,170,0.1)',
                                                        border: `1px solid ${isFinanced ? 'rgba(240,165,0,0.25)' : 'rgba(0,212,170,0.25)'}`,
                                                        borderRadius: 'var(--radius-md)',
                                                        padding: '6px 10px',
                                                        marginBottom: '8px',
                                                        fontSize: '0.75rem',
                                                    }}>
                                                        <div className="flex justify-between items-center">
                                                            <span style={{ color: isFinanced ? 'var(--accent)' : 'var(--success)', fontWeight: 600 }}>
                                                                {isFinanced ? 'Financed Purchase' : 'Owned Outright'}
                                                            </span>
                                                            <span className="mono text-muted">
                                                                {isFinanced ? `Loan: $${(asset.loanAmount || 0).toFixed(2)}` : `Paid: ${asset.paidAmount} ${asset.paidAsset}`}
                                                            </span>
                                                        </div>
                                                        {isFinanced && asset.repaymentPlan && (
                                                            <div className="text-xs text-muted" style={{ marginTop: '3px' }}>
                                                                Plan: {asset.repaymentPlan} @ {formatAPR(asset.apr)} | ${asset.monthlyPayment?.toFixed(2)}/mo
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="asset-value-comparison">
                                                        <div className="flex justify-between text-xs mb-xs">
                                                            <span className="text-muted">Purchase Price</span>
                                                            <span className="mono">${asset.priceUSD.toLocaleString()}</span>
                                                        </div>
                                                        <div className="flex justify-between text-sm">
                                                            <span className="text-muted">Current Value</span>
                                                            <span className="mono font-bold">${asset.currentValue.toFixed(2)}</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs mt-xs">
                                                            <span className="text-muted">Change</span>
                                                            <span className="mono font-bold" style={{ color: asset.changePercent >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                                {asset.changePercent >= 0 ? '+' : ''}{asset.changePercent.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between text-xs mt-sm" style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                                                        <span className="text-muted">LTV: {(asset.ltvRatio * 100).toFixed(0)}%</span>
                                                        <span className="mono" style={{ color: 'var(--primary)' }}>Borrow: +${asset.collateralValue.toFixed(2)}</span>
                                                    </div>
                                                    <button
                                                        className={`btn ${asset.isPledged ? 'btn-secondary' : 'btn-primary'} btn-sm w-full mt-sm`}
                                                        onClick={() => handlePledgeToggle(asset)}
                                                    >
                                                        {asset.isPledged ? 'Unpledge' : 'Pledge as Collateral'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* ====== CUSTOMER WORTH TAB ====== */}
                    {activeTab === 'worth' && (
                        <>
                            {/* Net Worth Hero */}
                            <div className="dashboard-card mb-lg">
                                <div className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
                                    <div>
                                        <div className="text-sm text-muted mb-xs">Total Net Worth</div>
                                        <div className="mono font-bold" style={{ fontSize: '2.2rem', color: worth.netWorth >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                            ${worth.netWorth.toFixed(2)}
                                        </div>
                                        <div className="text-xs text-muted" style={{ marginTop: '4px' }}>
                                            Crypto + Assets - Debt
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="text-sm text-muted mb-xs">Credit Tier</div>
                                        <div className="mono font-bold" style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>Tier {tier}</div>
                                        <div className="text-xs" style={{ color: 'var(--accent)' }}>{formatAPR(apr)} APR</div>
                                    </div>
                                </div>
                            </div>

                            <div className="dashboard-grid">
                                {/* Asset Breakdown Card */}
                                <div className="dashboard-card">
                                    <h3 className="card-title">Asset Breakdown</h3>
                                    <div className="flex flex-col gap-sm">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Crypto Collateral (ETH + WBTC)</span>
                                            <span className="mono font-bold">${worth.cryptoCollateralUSD.toFixed(2)}</span>
                                        </div>
                                        <div style={{ height: '1px', background: 'var(--border)' }} />
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--success)' }}>Owned Outright ({worth.ownedOutrightCount})</span>
                                            <span className="mono font-bold" style={{ color: 'var(--success)' }}>${worth.ownedOutrightValue.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--accent)' }}>Financed / On Loan ({worth.financedCount})</span>
                                            <span className="mono font-bold" style={{ color: 'var(--accent)' }}>${worth.financedValue.toFixed(2)}</span>
                                        </div>
                                        {worth.financedCount > 0 && (
                                            <div className="flex justify-between text-xs" style={{ paddingLeft: '12px' }}>
                                                <span className="text-muted">Original Loan Total</span>
                                                <span className="mono text-muted">-${worth.totalOriginalLoanAmount.toFixed(2)}</span>
                                            </div>
                                        )}
                                        {worth.financedCount > 0 && (
                                            <div className="flex justify-between text-xs" style={{ paddingLeft: '12px' }}>
                                                <span className="text-muted">Equity in Financed Assets</span>
                                                <span className="mono" style={{ color: 'var(--primary)' }}>${worth.financedEquity.toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div style={{ height: '1px', background: 'var(--border)' }} />
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted">Pledged as Collateral ({worth.pledgedCount})</span>
                                            <span className="mono" style={{ color: 'var(--primary)' }}>${worth.pledgedAssetValue.toFixed(2)}</span>
                                        </div>
                                        <div style={{ height: '1px', background: 'var(--border)' }} />
                                        <div className="flex justify-between text-sm">
                                            <span className="font-bold" style={{ color: 'var(--danger)' }}>Outstanding Debt</span>
                                            <span className="mono font-bold" style={{ color: 'var(--danger)' }}>-${worth.debtUSD.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Risk Assessment Card */}
                                <div className="dashboard-card">
                                    <h3 className="card-title">Risk Assessment</h3>
                                    {ownedAssets.length === 0 ? (
                                        <div className="text-center" style={{ padding: 'var(--spacing-xl)' }}>
                                            <p className="text-muted">Purchase assets to see risk analysis</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg)' }}>
                                                <div style={{
                                                    width: 100, height: 100, borderRadius: '50%', margin: '0 auto var(--spacing-sm)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: `conic-gradient(${risk.riskColor} ${risk.riskScore * 3.6}deg, var(--border) 0deg)`,
                                                    position: 'relative',
                                                }}>
                                                    <div style={{
                                                        width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-secondary)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                                                    }}>
                                                        <span className="mono font-bold" style={{ fontSize: '1.4rem', color: risk.riskColor }}>{risk.riskScore}</span>
                                                        <span className="text-xs text-muted">/100</span>
                                                    </div>
                                                </div>
                                                <span className="font-bold" style={{ color: risk.riskColor }}>{risk.riskLevel} Risk</span>
                                            </div>
                                            <div className="flex flex-col gap-sm">
                                                {[
                                                    { label: 'Concentration', value: risk.factors.concentration, max: 30, color: 'var(--warning)' },
                                                    { label: 'Volatility', value: risk.factors.volatility, max: 35, color: 'var(--danger)' },
                                                    { label: 'Depreciation', value: risk.factors.depreciation, max: 20, color: 'var(--accent)' },
                                                    { label: 'Diversity Gap', value: risk.factors.diversity, max: 15, color: 'var(--info)' },
                                                ].map(f => (
                                                    <div key={f.label}>
                                                        <div className="flex justify-between text-xs mb-xs">
                                                            <span className="text-muted">{f.label}</span>
                                                            <span className="mono">{f.value}/{f.max}</span>
                                                        </div>
                                                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                                                            <div style={{ height: '100%', borderRadius: 2, width: `${(f.value / f.max) * 100}%`, background: f.color, transition: 'width 0.3s' }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Enhanced Borrowing Power Card */}
                            <div className="dashboard-card mt-lg">
                                <h3 className="card-title">Borrowing Power</h3>
                                <div className="flex gap-lg" style={{ flexWrap: 'wrap' }}>
                                    <div className="dashboard-card" style={{ flex: 1, minWidth: 180, background: 'var(--bg-tertiary)', margin: 0 }}>
                                        <div className="text-xs text-muted mb-xs">Base (Crypto)</div>
                                        <div className="mono font-bold" style={{ fontSize: '1.2rem' }}>${maxBorrow.toFixed(2)}</div>
                                    </div>
                                    <div className="dashboard-card" style={{ flex: 1, minWidth: 180, background: 'var(--bg-tertiary)', margin: 0 }}>
                                        <div className="text-xs text-muted mb-xs">Asset Boost</div>
                                        <div className="mono font-bold" style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>+${assetCollateralVal.toFixed(2)}</div>
                                    </div>
                                    <div className="dashboard-card" style={{ flex: 1, minWidth: 180, background: 'var(--bg-tertiary)', margin: 0 }}>
                                        <div className="text-xs text-muted mb-xs">Total Available</div>
                                        <div className="mono font-bold" style={{ fontSize: '1.2rem', color: 'var(--success)' }}>${(maxBorrow + assetCollateralVal).toFixed(2)}</div>
                                    </div>
                                </div>
                                {assetCollateralVal === 0 && ownedAssets.length > 0 && (
                                    <div className="info-box info mt-md" style={{ fontSize: '0.8rem' }}>
                                        You have {ownedAssets.length} unpledged asset(s). Go to "My Assets" tab to pledge them as collateral.
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ====== ENFORCEMENT TAB ====== */}
                    {activeTab === 'enforcement' && (
                        <>
                            {/* Enforcement Actions Panel */}
                            <div className="dashboard-card mb-lg">
                                <h3 className="card-title">Enforcement Actions</h3>
                                <div className="flex justify-between text-sm mb-md" style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                    <span className="text-muted">Current Health Factor</span>
                                    <span className="mono font-bold" style={{ color: healthFactor < 1 ? 'var(--danger)' : healthFactor < 1.5 ? 'var(--warning)' : 'var(--success)' }}>
                                        {healthFactor >= 999 ? 'Safe' : healthFactor.toFixed(2)}
                                    </span>
                                </div>

                                {enforcementOptions.length === 0 ? (
                                    <div className="text-center" style={{ padding: 'var(--spacing-xl)' }}>
                                        <Icon name="check" size={48} />
                                        <h3 className="mt-md mb-sm" style={{ color: 'var(--success)' }}>No Enforcement Needed</h3>
                                        <p className="text-muted">
                                            {currentDebt === 0
                                                ? 'No outstanding debt. Your account is in good standing.'
                                                : 'Your health factor is above the enforcement threshold (1.5). Keep it up!'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-md">
                                        {enforcementOptions.map(opt => (
                                            <div key={opt.id} className="enforcement-option-card" data-severity={opt.severity}>
                                                <div style={{ flex: 1 }}>
                                                    <div className="flex items-center gap-sm mb-xs">
                                                        <Icon name={opt.icon} size={18} />
                                                        <span className="font-bold">{opt.label}</span>
                                                    </div>
                                                    <p className="text-sm text-muted">{opt.description}</p>
                                                </div>
                                                <button
                                                    className={`btn btn-sm ${opt.severity === 'danger' ? '' : 'btn-secondary'}`}
                                                    style={opt.severity === 'danger' ? { background: 'var(--danger)', color: '#fff' } : {}}
                                                    onClick={() => setShowEnforcementConfirm(opt.id)}
                                                >
                                                    Execute
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Enforcement History */}
                            <div className="dashboard-card">
                                <h3 className="card-title">Enforcement History</h3>
                                {enforcementHistory.length === 0 ? (
                                    <div className="text-center" style={{ padding: 'var(--spacing-xl)' }}>
                                        <Icon name="history" size={48} />
                                        <p className="text-muted mt-md">No enforcement actions recorded</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-sm">
                                        {enforcementHistory.map((action, i) => (
                                            <div key={i} className="marketplace-order-row">
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="font-bold text-sm flex items-center gap-sm">
                                                        {action.type === 'seizure' && 'Asset Seizure'}
                                                        {action.type === 'legal_claim' && 'Legal Claim'}
                                                        {action.type === 'settlement' && 'Settlement Offer'}
                                                        <span className={`badge ${
                                                            action.status === 'completed' ? 'badge-success' :
                                                            action.status === 'filed' ? 'badge-warning' :
                                                            'badge-info'
                                                        }`} style={{ fontSize: '0.65rem' }}>
                                                            {action.status}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-muted">
                                                        {new Date(action.timestamp).toLocaleString()}
                                                        {action.assetsSeized && ` - ${action.assetsSeized} asset(s) seized`}
                                                        {action.recoveredValue && ` - $${action.recoveredValue.toFixed(2)} recovered`}
                                                        {action.debtAmount && ` - Debt: $${action.debtAmount.toFixed(2)}`}
                                                        {action.settlementAmount && ` - Settlement: $${action.settlementAmount.toFixed(2)} (${action.discount}% off)`}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* ====== Direct Purchase Confirmation ====== */}
            <ConfirmationModal
                isOpen={showConfirm}
                onConfirm={executePurchase}
                onCancel={() => { setShowConfirm(false); setSelectedProduct(null); }}
                title="Confirm Purchase"
                details={confirmDetails}
                confirmText={buying ? 'Processing...' : `Pay ${selectedProduct ? getPayAmount(selectedProduct) : ''} ${payAsset}`}
                confirmVariant="primary"
                loading={buying}
            />

            {/* ====== Enforcement Confirmation ====== */}
            <ConfirmationModal
                isOpen={!!showEnforcementConfirm}
                onConfirm={() => handleEnforcementAction(showEnforcementConfirm)}
                onCancel={() => setShowEnforcementConfirm(null)}
                title={
                    showEnforcementConfirm === 'seize' ? 'Confirm Asset Seizure' :
                    showEnforcementConfirm === 'legal' ? 'Confirm Legal Claim' :
                    'Confirm Settlement Offer'
                }
                details={
                    showEnforcementConfirm === 'seize' ? [
                        { label: 'Action', value: 'Seize all pledged marketplace assets' },
                        { label: 'Pledged Assets', value: `${ownedAssets.filter(a => a.isPledged).length} asset(s)` },
                        { label: 'Recovery Value', value: `$${ownedAssets.filter(a => a.isPledged).reduce((s, a) => s + a.currentValue, 0).toFixed(2)}` },
                    ] : showEnforcementConfirm === 'legal' ? [
                        { label: 'Action', value: 'File legal proceedings' },
                        { label: 'Debt Amount', value: `$${currentDebt.toFixed(2)}` },
                        { label: 'Status', value: 'Will be Filed' },
                    ] : [
                        { label: 'Action', value: 'Offer debt settlement' },
                        { label: 'Original Debt', value: `$${currentDebt.toFixed(2)}` },
                        { label: 'Settlement (70%)', value: `$${(currentDebt * 0.7).toFixed(2)}` },
                    ]
                }
                confirmText={
                    showEnforcementConfirm === 'seize' ? 'Seize Assets' :
                    showEnforcementConfirm === 'legal' ? 'File Claim' : 'Offer Settlement'
                }
                confirmVariant={showEnforcementConfirm === 'seize' ? 'danger' : 'primary'}
                warningMessage={showEnforcementConfirm === 'seize' ? 'Seized assets cannot be recovered. This action is irreversible.' : null}
            />

            {/* ====== Item-Specific Finance Modal ====== */}
            {loanProduct && loanInfo && (
                <div className="wallet-modal-overlay" onClick={() => !loanProcessing && setLoanProduct(null)}>
                    <div className="loan-modal" onClick={e => e.stopPropagation()}>
                        <div className="loan-modal-header">
                            <h2>Finance Purchase</h2>
                            <button className="wallet-modal-close" onClick={() => !loanProcessing && setLoanProduct(null)}>&times;</button>
                        </div>
                        <div className="loan-modal-body">
                            <div className="loan-item-preview">
                                <div className="loan-item-image" style={{ background: loanProduct.gradient }} />
                                <div className="loan-item-info">
                                    <div className="font-bold">{loanProduct.name}</div>
                                    <div className="text-xs text-muted">{CATEGORIES.find(c => c.id === loanProduct.category)?.label}</div>
                                    <div className="mono font-bold" style={{ color: 'var(--primary)', fontSize: '1.2rem' }}>${loanProduct.price.toLocaleString()}</div>
                                </div>
                            </div>
                            <div className="loan-breakdown">
                                <div className="loan-breakdown-title">Financing Details</div>
                                <div className="loan-row"><span className="text-muted">Item Price</span><span className="mono font-bold">${loanProduct.price.toLocaleString()}</span></div>
                                <div className="loan-row"><span className="text-muted">Your USDX Balance</span><span className="mono">${loanInfo.usdxBal.toFixed(2)}</span></div>
                                <div className="loan-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-sm)' }}>
                                    <span className="font-bold">Loan Needed</span>
                                    <span className="mono font-bold" style={{ color: 'var(--accent)' }}>${loanInfo.borrowAmount.toFixed(2)}</span>
                                </div>
                                <div className="loan-row"><span className="text-muted">Rate (Tier {tier})</span><span className="mono" style={{ color: 'var(--accent)' }}>{formatAPR(apr)} APR</span></div>
                                <div className="loan-row"><span className="text-muted">Available to Borrow</span>
                                    <span className="mono" style={{ color: loanInfo.canBorrow ? 'var(--success)' : 'var(--danger)' }}>${availableToBorrow.toFixed(2)}</span>
                                </div>
                            </div>
                            {loanInfo.borrowAmount === 0 ? (
                                <>
                                    <div className="loan-approved-badge"><Icon name="check" size={16} /> No Loan Needed — You have enough USDX</div>
                                    <button className="btn btn-primary w-full" onClick={executeLoanPurchase} disabled={loanProcessing} style={{ padding: '14px', fontSize: '1rem' }}>
                                        {loanProcessing ? <><span className="loading"></span> Processing...</> : <>Buy Now with USDX - ${loanProduct.price.toLocaleString()}</>}
                                    </button>
                                </>
                            ) : !loanInfo.canBorrow ? (
                                <>
                                    <div className="loan-denied-badge"><Icon name="warning" size={16} /> Deposit Collateral to Unlock Borrowing</div>
                                    <div className="info-box warning" style={{ fontSize: '0.8rem' }}>
                                        You need <strong>${loanInfo.borrowAmount.toFixed(2)} USDX</strong> but your borrowing limit is <strong>${availableToBorrow.toFixed(2)}</strong>.
                                        Deposit collateral below to increase your limit.
                                    </div>

                                    {/* Inline deposit form */}
                                    <div style={{ padding: 'var(--spacing-md)', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                                        <div className="text-sm font-bold mb-sm">Quick Deposit Collateral</div>
                                        <div className="flex gap-sm items-end">
                                            <div style={{ flex: '0 0 90px' }}>
                                                <label className="text-xs text-muted">Asset</label>
                                                <select className="form-input" value={financeDepAsset} onChange={e => setFinanceDepAsset(e.target.value)} style={{ fontSize: '0.85rem', padding: '8px' }}>
                                                    <option value="ETH">ETH</option>
                                                    <option value="WBTC">WBTC</option>
                                                    <option value="USDX">USDX</option>
                                                </select>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label className="text-xs text-muted">Amount</label>
                                                <input type="number" className="form-input" placeholder="0.0" step="0.000001" value={financeDepAmount} onChange={e => setFinanceDepAmount(e.target.value)} style={{ fontSize: '0.85rem', padding: '8px' }} />
                                            </div>
                                            <button className="btn btn-primary btn-sm" onClick={handleFinanceDeposit} disabled={financeDepLoading} style={{ whiteSpace: 'nowrap', padding: '8px 16px' }}>
                                                {financeDepLoading ? 'Depositing...' : 'Deposit'}
                                            </button>
                                        </div>
                                        <div className="text-xs text-muted mt-sm">
                                            Wallet: {parseFloat(financeDepAsset === 'ETH' ? balances.eth : financeDepAsset === 'WBTC' ? balances.wbtc : balances.usdx).toFixed(financeDepAsset === 'WBTC' ? 6 : financeDepAsset === 'ETH' ? 4 : 2)} {financeDepAsset}
                                            {' '}<button type="button" onClick={() => {
                                                const bal = financeDepAsset === 'ETH' ? Math.max(0, parseFloat(balances.eth) - 0.01) : financeDepAsset === 'WBTC' ? parseFloat(balances.wbtc) : parseFloat(balances.usdx);
                                                setFinanceDepAmount(bal > 0 ? bal.toString() : '');
                                            }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.7rem' }}>MAX</button>
                                        </div>
                                        {(() => {
                                            const depAmt = parseFloat(financeDepAmount) || 0;
                                            if (depAmt <= 0) return null;
                                            const depValueUSD = financeDepAsset === 'ETH' ? depAmt * prices.ethPrice : financeDepAsset === 'WBTC' ? depAmt * prices.wbtcPrice : depAmt;
                                            const ltvPct = financeDepAsset === 'ETH' ? 0.60 : financeDepAsset === 'WBTC' ? 0.65 : 0.80;
                                            const addedBorrowPower = depValueUSD * ltvPct;
                                            const newAvailable = availableToBorrow + addedBorrowPower;
                                            const willUnlock = newAvailable >= loanInfo.borrowAmount;
                                            return (
                                                <div className="text-xs mt-sm" style={{ padding: '6px 8px', background: willUnlock ? 'rgba(0,212,170,0.08)' : 'rgba(240,180,41,0.08)', borderRadius: 'var(--radius-md)', border: `1px solid ${willUnlock ? 'rgba(0,212,170,0.2)' : 'rgba(240,180,41,0.2)'}` }}>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted">Added borrow power</span>
                                                        <span className="mono font-bold" style={{ color: 'var(--primary)' }}>+${addedBorrowPower.toFixed(2)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted">New borrowing limit</span>
                                                        <span className="mono font-bold" style={{ color: willUnlock ? 'var(--success)' : 'var(--warning)' }}>${newAvailable.toFixed(2)}</span>
                                                    </div>
                                                    {willUnlock && <div className="text-xs font-bold" style={{ color: 'var(--success)', marginTop: 4 }}>This deposit will unlock the loan for this item!</div>}
                                                    {!willUnlock && <div className="text-xs" style={{ color: 'var(--warning)', marginTop: 4 }}>Still need ${(loanInfo.borrowAmount - newAvailable).toFixed(2)} more borrowing power</div>}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Show plans preview even when can't borrow yet */}
                                    {loanInfo.plans.length > 0 && (
                                        <div className="loan-plans" style={{ opacity: 0.6 }}>
                                            <div className="loan-breakdown-title">Repayment Plans (after deposit)</div>
                                            <div className="loan-plan-grid">
                                                {loanInfo.plans.map((plan, idx) => (
                                                    <button key={plan.months} className={`loan-plan-card ${selectedPlan === idx ? 'active' : ''}`} onClick={() => setSelectedPlan(idx)}>
                                                        <div className="loan-plan-label">{plan.label}</div>
                                                        <div className="loan-plan-months">{plan.months} mo</div>
                                                        <div className="loan-plan-monthly">${plan.monthlyPayment.toFixed(2)}<span>/mo</span></div>
                                                        <div className="loan-plan-details">
                                                            <div className="text-xs text-muted">Total: ${plan.totalPayment.toFixed(2)}</div>
                                                            <div className="text-xs" style={{ color: 'var(--accent)' }}>Interest: ${plan.totalInterest.toFixed(2)}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <button className="btn btn-primary w-full" disabled style={{ padding: '14px', fontSize: '1rem', opacity: 0.5 }}>
                                        Deposit Collateral Above to Unlock
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="loan-approved-badge"><Icon name="check" size={16} /> Loan Pre-Approved</div>
                                    <div className="info-box info" style={{ fontSize: '0.8rem' }}>
                                        This will automatically borrow <strong>${loanInfo.borrowAmount.toFixed(2)} USDX</strong> and purchase the item in one transaction.
                                    </div>
                                    {loanInfo.plans.length > 0 && (
                                        <div className="loan-plans">
                                            <div className="loan-breakdown-title">Choose Repayment Plan</div>
                                            <div className="loan-plan-grid">
                                                {loanInfo.plans.map((plan, idx) => (
                                                    <button key={plan.months} className={`loan-plan-card ${selectedPlan === idx ? 'active' : ''}`} onClick={() => setSelectedPlan(idx)}>
                                                        <div className="loan-plan-label">{plan.label}</div>
                                                        <div className="loan-plan-months">{plan.months} mo</div>
                                                        <div className="loan-plan-monthly">${plan.monthlyPayment.toFixed(2)}<span>/mo</span></div>
                                                        <div className="loan-plan-details">
                                                            <div className="text-xs text-muted">Total: ${plan.totalPayment.toFixed(2)}</div>
                                                            <div className="text-xs" style={{ color: 'var(--accent)' }}>Interest: ${plan.totalInterest.toFixed(2)}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button className="btn btn-primary w-full" onClick={executeLoanPurchase} disabled={loanProcessing} style={{ padding: '14px', fontSize: '1rem' }}>
                                        {loanProcessing ? <><span className="loading"></span> Processing...</> : <>Borrow ${loanInfo.borrowAmount.toFixed(2)} USDX & Buy</>}
                                    </button>
                                    <div className="text-xs text-muted text-center" style={{ marginTop: 'var(--spacing-sm)' }}>
                                        Or <Link to="/borrow" style={{ color: 'var(--primary)' }}>go to Borrow page</Link> to borrow USDX manually first.
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ====== General Loan Application Modal ====== */}
            {showLoanApp && (
                <div className="wallet-modal-overlay" onClick={() => !loanAppProcessing && setShowLoanApp(false)}>
                    <div className="loan-modal loan-modal-wide" onClick={e => e.stopPropagation()}>
                        <div className="loan-modal-header">
                            <h2>
                                {loanAppStep === 1 && 'Loan Application - Purpose'}
                                {loanAppStep === 2 && 'Loan Application - Amount'}
                                {loanAppStep === 3 && 'Loan Application - Collateral'}
                                {loanAppStep === 4 && 'Loan Application - Review'}
                            </h2>
                            <button className="wallet-modal-close" onClick={() => !loanAppProcessing && setShowLoanApp(false)}>&times;</button>
                        </div>

                        {/* Progress bar */}
                        <div className="loan-app-progress">
                            {[1,2,3,4].map(s => (
                                <div key={s} className={`loan-app-step ${loanAppStep >= s ? 'active' : ''} ${loanAppStep === s ? 'current' : ''}`}>
                                    <div className="loan-app-step-num">{s}</div>
                                    <div className="loan-app-step-label">{['Purpose','Amount','Collateral','Review'][s-1]}</div>
                                </div>
                            ))}
                        </div>

                        <div className="loan-modal-body">
                            {/* Step 1: Purpose */}
                            {loanAppStep === 1 && (
                                <>
                                    <div className="loan-breakdown-title">What is this loan for?</div>
                                    <div className="loan-purpose-grid">
                                        {LOAN_PURPOSES.map(p => (
                                            <button key={p.id}
                                                className={`loan-purpose-card ${loanPurpose === p.id ? 'active' : ''}`}
                                                onClick={() => setLoanPurpose(p.id)}>
                                                <Icon name={p.icon} size={24} />
                                                <span>{p.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <button className="btn btn-primary w-full" disabled={!loanPurpose} onClick={() => setLoanAppStep(2)}
                                        style={{ padding: '14px' }}>
                                        Continue
                                    </button>
                                </>
                            )}

                            {/* Step 2: Amount + Repayment */}
                            {loanAppStep === 2 && (
                                <>
                                    <div className="loan-breakdown-title">How much do you need?</div>
                                    <div className="form-group">
                                        <label className="form-label">Loan Amount (USDX)</label>
                                        <div className="input-group">
                                            <span className="input-addon">$</span>
                                            <input type="number" className="form-input mono" placeholder="0.00" step="1"
                                                value={loanAmount} onChange={e => setLoanAmount(e.target.value)} />
                                            <span className="input-addon">USDX</span>
                                        </div>
                                        <div className="flex justify-between mt-sm text-xs text-muted">
                                            <span>Available to borrow: <strong style={{ color: 'var(--primary)' }}>${availableToBorrow.toFixed(2)}</strong></span>
                                            <span>Rate: <strong style={{ color: 'var(--accent)' }}>{formatAPR(apr)}</strong></span>
                                        </div>
                                    </div>

                                    {generalLoanAmt > 0 && generalPlans.length > 0 && (
                                        <div className="loan-plans">
                                            <div className="loan-breakdown-title">Repayment Plan</div>
                                            <div className="loan-plan-grid">
                                                {generalPlans.map((plan, idx) => (
                                                    <button key={plan.months} className={`loan-plan-card ${loanPlanIdx === idx ? 'active' : ''}`} onClick={() => setLoanPlanIdx(idx)}>
                                                        <div className="loan-plan-label">{plan.label}</div>
                                                        <div className="loan-plan-months">{plan.months} mo</div>
                                                        <div className="loan-plan-monthly">${plan.monthlyPayment.toFixed(2)}<span>/mo</span></div>
                                                        <div className="loan-plan-details">
                                                            <div className="text-xs text-muted">Total: ${plan.totalPayment.toFixed(2)}</div>
                                                            <div className="text-xs" style={{ color: 'var(--accent)' }}>Interest: ${plan.totalInterest.toFixed(2)}</div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex gap-sm">
                                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setLoanAppStep(1)}>Back</button>
                                        <button className="btn btn-primary" style={{ flex: 2 }} disabled={generalLoanAmt <= 0} onClick={() => setLoanAppStep(3)}>
                                            Continue
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Step 3: Collateral */}
                            {loanAppStep === 3 && (
                                <>
                                    <div className="loan-breakdown-title">Your Collateral</div>
                                    <div className="loan-breakdown">
                                        <div className="loan-row">
                                            <span className="text-muted">ETH Deposited</span>
                                            <span className="mono font-bold">{ethCollateral.toFixed(4)} ETH (${(ethCollateral * prices.ethPrice).toFixed(2)})</span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">WBTC Deposited</span>
                                            <span className="mono font-bold">{wbtcCollateral.toFixed(6)} WBTC (${(wbtcCollateral * prices.wbtcPrice).toFixed(2)})</span>
                                        </div>
                                        <div className="loan-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-sm)' }}>
                                            <span className="font-bold">Total Collateral Value</span>
                                            <span className="mono font-bold">${totalCollateralUSD.toFixed(2)}</span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">Current Debt</span>
                                            <span className="mono">${currentDebt.toFixed(2)}</span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="font-bold">Available to Borrow</span>
                                            <span className="mono font-bold" style={{ color: generalCanBorrow ? 'var(--success)' : 'var(--danger)' }}>
                                                ${availableToBorrow.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="font-bold">Requested Amount</span>
                                            <span className="mono font-bold" style={{ color: 'var(--accent)' }}>${generalLoanAmt.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    {generalCanBorrow ? (
                                        <div className="loan-approved-badge"><Icon name="check" size={16} /> Eligible - Collateral Sufficient</div>
                                    ) : (
                                        <>
                                            <div className="loan-denied-badge"><Icon name="warning" size={16} /> More Collateral Needed</div>
                                            <div className="info-box info">
                                                You need <strong>${(generalLoanAmt - availableToBorrow).toFixed(2)}</strong> more in borrowing capacity.
                                                Deposit collateral below to increase your limit.
                                            </div>
                                            <div className="loan-deposit-section">
                                                <div className="loan-breakdown-title">Deposit Collateral Now</div>
                                                <div className="flex gap-sm mb-sm">
                                                    <select className="form-input" value={depositAsset} onChange={e => setDepositAsset(e.target.value)} style={{ width: '120px' }}>
                                                        <option value="ETH">ETH</option>
                                                        <option value="WBTC">WBTC</option>
                                                        <option value="USDX">USDX</option>
                                                    </select>
                                                    <input type="number" className="form-input mono" placeholder="0.0" step="0.001"
                                                        value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                                                    <button className="btn btn-primary btn-sm" onClick={handleLoanDeposit} disabled={loanAppProcessing}>
                                                        {loanAppProcessing ? '...' : 'Deposit'}
                                                    </button>
                                                </div>
                                                <div className="text-xs text-muted">
                                                    Balance: {parseFloat(depositAsset === 'ETH' ? balances.eth : depositAsset === 'WBTC' ? balances.wbtc : balances.usdx).toFixed(depositAsset === 'WBTC' ? 6 : depositAsset === 'ETH' ? 4 : 2)} {depositAsset}
                                                    {depositAsset !== 'USDX' && <>{' | '}1 {depositAsset} = ${depositAsset === 'ETH' ? prices.ethPrice.toLocaleString() : prices.wbtcPrice.toLocaleString()}</>}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <div className="flex gap-sm">
                                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setLoanAppStep(2)}>Back</button>
                                        <button className="btn btn-primary" style={{ flex: 2 }} disabled={!generalCanBorrow} onClick={() => setLoanAppStep(4)}>
                                            {generalCanBorrow ? 'Review Application' : 'Deposit Collateral First'}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Step 4: Review & Approve */}
                            {loanAppStep === 4 && (
                                <>
                                    <div className="loan-approved-badge" style={{ fontSize: '1rem' }}><Icon name="check" size={18} /> Loan Approved</div>

                                    <div className="loan-summary">
                                        <div className="loan-breakdown-title">Loan Summary</div>
                                        <div className="loan-row">
                                            <span className="text-muted">Purpose</span>
                                            <span className="font-bold">{LOAN_PURPOSES.find(p => p.id === loanPurpose)?.label}</span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">Loan Amount</span>
                                            <span className="mono font-bold" style={{ fontSize: '1.1rem' }}>${generalLoanAmt.toLocaleString()}</span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">Interest Rate</span>
                                            <span className="mono" style={{ color: 'var(--accent)' }}>{formatAPR(apr)} (Tier {tier})</span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">Repayment Plan</span>
                                            <span className="mono font-bold">{(generalPlans[loanPlanIdx] || generalPlans[0])?.months} months</span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">Monthly Payment</span>
                                            <span className="mono font-bold">${(generalPlans[loanPlanIdx] || generalPlans[0])?.monthlyPayment.toFixed(2)}/mo</span>
                                        </div>
                                        <div className="loan-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--spacing-sm)' }}>
                                            <span className="font-bold">Total Repayment</span>
                                            <span className="mono font-bold" style={{ color: 'var(--accent)', fontSize: '1.1rem' }}>
                                                ${(generalPlans[loanPlanIdx] || generalPlans[0])?.totalPayment.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">Total Interest</span>
                                            <span className="mono" style={{ color: 'var(--accent)' }}>
                                                ${(generalPlans[loanPlanIdx] || generalPlans[0])?.totalInterest.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="loan-row">
                                            <span className="text-muted">Collateral Backing</span>
                                            <span className="mono font-bold" style={{ color: 'var(--success)' }}>${totalCollateralUSD.toFixed(2)}</span>
                                        </div>
                                    </div>

                                    <div className="info-box info">
                                        <strong>By proceeding:</strong> {generalLoanAmt.toFixed(2)} USDX will be deposited to your wallet.
                                        Repay via the Repay page. Failure to repay may result in liquidation of your collateral.
                                    </div>

                                    <div className="flex gap-sm">
                                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setLoanAppStep(3)}>Back</button>
                                        <button className="btn btn-primary" style={{ flex: 2, padding: '14px', fontSize: '1rem' }}
                                            onClick={executeGeneralLoan} disabled={loanAppProcessing}>
                                            {loanAppProcessing ? <><span className="loading"></span> Processing Loan...</> : <>Accept & Borrow ${generalLoanAmt.toLocaleString()}</>}
                                        </button>
                                    </div>

                                    <div className="text-xs text-muted text-center">
                                        Loans are tracked in Portfolio. Repay on time to improve your credit tier.
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
