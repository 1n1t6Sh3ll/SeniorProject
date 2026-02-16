// Contract addresses - auto-updated by deploy script
// Last deployed: 2026-02-16T16:34:22.382Z on localhost
export const CONTRACTS = {
    localhost: {
        CreditProtocol: '0x4A679253410272dd5232B3Ff7cF5dbB88f295319',
        USDX: '0x59b670e9fA9D0A427751Af201D676719a970857b',
        WBTC: '0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1',
        PriceOracle: '0x322813Fd9A801c5507c9de605d63CEA4f2CE6c44',
        SimpleSwap: '0x09635F643e140090A9A8Dcd712eD6285858ceBef'
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
