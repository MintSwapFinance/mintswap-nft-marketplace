const { ethers, upgrades } = require("hardhat");

async function main() {
    
    const proxyContract = '0xc6Ab41B76f01676d5F0319F3bdda1D86ac497D2e';

    const upgrade = await ethers.getContractFactory("MintSwapNFTMarketplaceV1");
    const instance = await upgrades.upgradeProxy(proxyContract, upgrade);
    console.log("New MintSwapNFTMarketplaceV1 upgraded: ", instance);
}

main();