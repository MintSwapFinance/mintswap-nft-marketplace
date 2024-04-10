import 'dotenv/config';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-foundry';
import '@nomicfoundation/hardhat-verify';
import "@openzeppelin/hardhat-upgrades";
import 'hardhat-contract-sizer';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import { HardhatUserConfig } from 'hardhat/types';

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: { },
        localhost: {
            url: 'http://localhost:8545',
            chainId: 61337,
        },
        mintTest: {
            url: `${process.env.MINT_TESTNET_URL}`,
            chainId: 1686,
            accounts: [ String(process.env.PRIVATE_KEY_DEPLOYER), String(process.env.PRIVATE_KEY_SELLER), String(process.env.PRIVATE_KEY_BUYER) ]
        },
    },
    namedAccounts: {
        deployer: 0,
        seller: 1,
        buyer: 2,
    },
    solidity: {
        compilers: [
            {
                version: '0.8.17',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.4.22',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    mocha: {
        timeout: 60000,
    },
    gasReporter: {
        currency: 'USD',
        enabled: false,
    },
    contractSizer: {
        runOnCompile: true,
    },
};

export default config;