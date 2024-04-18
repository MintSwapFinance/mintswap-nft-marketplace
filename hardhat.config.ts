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
            url: 'http://127.0.0.1:8545',
            chainId: 31337,
        },
        mintTest: {
            url: "https://sepolia-testnet-rpc.mintchain.io",
            chainId: 1687,
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
                version: '0.6.0',
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