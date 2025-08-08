require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,  // 平衡部署成本和运行效率的最佳设置
      },
      metadata: {
        bytecodeHash: "none"  // 减少字节码大小
      }
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://neat-practical-arrow.bsc.quiknode.pro/b2f485b14431f07a8e9e25951ad16fb364a0dd3a",
        enabled: true
      },
      chainId: 56,
      allowUnlimitedContractSize: true,
      accounts: {
        count: 10,
        accountsBalance: "10000000000000000000000", // 每个账户10000 BNB
      },
    },
    bsc: {
      url: "https://neat-practical-arrow.bsc.quiknode.pro/b2f485b14431f07a8e9e25951ad16fb364a0dd3a",
      chainId: 56,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : {
        mnemonic: "test test test test test test test test test test test junk"
      }
    },
    bscTestnet: {
      url: "https://bsc-testnet-rpc.publicnode.com",
      chainId: 97,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : {
        mnemonic: "test test test test test test test test test test test junk"
      },
      timeout: 60000,
      gasPrice: 10000000000, // 10 gwei
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCSCAN_API_KEY || "YOUR_BSCSCAN_API_KEY",
      bscTestnet: process.env.BSCSCAN_API_KEY || "YOUR_BSCSCAN_API_KEY",
    }
  }
};
