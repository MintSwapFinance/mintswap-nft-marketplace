import { ethers, upgrades } from "hardhat";

async function main() {

    const fee = 500; // 5%
    const feeReceipient = '0x52Aa22a1baF886964F5756B9694F0BA67Ab7f839';

    const MintSwapNFTMarketplaceV1 = await ethers.getContractFactory("MintSwapNFTMarketplaceV1");
    const mintSwapNFTMarketplaceV1 = await upgrades.deployProxy(
        MintSwapNFTMarketplaceV1 as any, 
        [
            fee, 
            feeReceipient
        ],
        {
            initializer: "initialize",
        }
    );
    await mintSwapNFTMarketplaceV1.waitForDeployment();
    console.log("MintSwapNFTMarketplaceV1 deployed to:", await mintSwapNFTMarketplaceV1.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});