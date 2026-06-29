require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Private key comes from the environment so it is never committed.
// Deploy with your did:nostr key like this (key stays out of files & history):
//   PRIVATE_KEY=$(git config nostr.privkey) npm run deploy:testnet
// or put PRIVATE_KEY=... in a local .env file (gitignored).
const RAW_KEY = process.env.PRIVATE_KEY || "";
const PRIVATE_KEY = RAW_KEY ? (RAW_KEY.startsWith("0x") ? RAW_KEY : "0x" + RAW_KEY) : null;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Rootstock does not support the PUSH0 opcode (Shanghai). Pin to London
      // so deployed bytecode runs on Rootstock. Skipping this is a common cause
      // of "invalid opcode" failures on deploy.
      evmVersion: "london",
    },
  },
  networks: {
    rootstockTestnet: {
      url: process.env.RSK_TESTNET_RPC || "https://public-node.testnet.rsk.co",
      chainId: 31,
      accounts,
      // Rootstock's min gas price is very low (~0.009 gwei). Set explicit headroom
      // so transactions are never rejected as underpriced. Still costs ~nothing.
      gasPrice: 60000000, // 0.06 gwei
    },
    rootstockMainnet: {
      url: process.env.RSK_MAINNET_RPC || "https://public-node.rsk.co",
      chainId: 30,
      accounts,
      gasPrice: 60000000,
    },
  },
  // Blockscout-based verification for the Rootstock explorer.
  etherscan: {
    apiKey: { rootstockTestnet: "no-api-key-needed" },
    customChains: [
      {
        network: "rootstockTestnet",
        chainId: 31,
        urls: {
          apiURL: "https://rootstock-testnet.blockscout.com/api",
          browserURL: "https://explorer.testnet.rootstock.io",
        },
      },
    ],
  },
};
