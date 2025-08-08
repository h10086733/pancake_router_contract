const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🔍 检查合约资金并提取...");
  
  try {
    // 获取网络信息
    const network = await ethers.provider.getNetwork();
    const networkName = network.name === "unknown" ? 
      (network.chainId === 56n ? "bsc" : 
       network.chainId === 97n ? "bscTestnet" : 
       "hardhat") : 
      network.name;

    console.log(`📡 网络: ${networkName} (Chain ID: ${network.chainId})`);

    // 读取部署信息
    const deploymentFile = path.join(__dirname, "..", "deployments", `${networkName}-deployment.json`);
    
    if (!fs.existsSync(deploymentFile)) {
      console.error("❌ 未找到部署信息文件");
      process.exit(1);
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const contractAddress = deploymentInfo.contractAddress;
    
    console.log(`📍 合约地址: ${contractAddress}`);

    // 获取合约实例
    const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");
    const router = OptimizedPancakeRouter.attach(contractAddress);

    // 获取 owner
    const [deployer] = await ethers.getSigners();
    const owner = await router.owner();
    
    console.log(`👤 部署者: ${deployer.address}`);
    console.log(`👑 合约 Owner: ${owner}`);
    
    if (deployer.address.toLowerCase() !== owner.toLowerCase()) {
      console.error("❌ 当前账户不是合约 owner，无法提取资金");
      process.exit(1);
    }

    // 检查 ETH/BNB 余额
    const ethBalance = await ethers.provider.getBalance(contractAddress);
    console.log(`\n💰 合约 ETH/BNB 余额: ${ethers.formatEther(ethBalance)} ETH`);

    // 常见代币地址
    const commonTokens = {
      bsc: {
        WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
        USDT: "0x55d398326f99059fF775485246999027B3197955",
        USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
      },
      bscTestnet: {
        WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
        BUSD: "0x78867BbEeF44f2326bF8DDd1941a4439382EF2A7",
        USDT: "0x7ef95a0FEE0Dd31b22626fA2e10Ee6A223F8a684"
      },
      hardhat: {
        WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"
      }
    };

    const tokens = commonTokens[networkName] || commonTokens.hardhat;

    // 检查代币余额
    console.log("\n🪙 检查代币余额:");
    const withdrawalTasks = [];

    for (const [symbol, address] of Object.entries(tokens)) {
      try {
        const tokenContract = await ethers.getContractAt("IERC20", address);
        const balance = await tokenContract.balanceOf(contractAddress);
        
        if (balance > 0) {
          const decimals = await tokenContract.decimals();
          const formattedBalance = ethers.formatUnits(balance, decimals);
          console.log(`   ${symbol}: ${formattedBalance} (${balance.toString()})`);
          
          // 添加到提取任务
          withdrawalTasks.push({
            symbol,
            address,
            balance,
            formattedBalance
          });
        } else {
          console.log(`   ${symbol}: 0`);
        }
      } catch (error) {
        console.log(`   ${symbol}: 检查失败 (${error.message})`);
      }
    }

    // 执行提取
    if (ethBalance > 0) {
      console.log(`\n🔄 提取 ETH/BNB: ${ethers.formatEther(ethBalance)}`);
      try {
        const tx = await router.emergencyWithdraw(ethers.ZeroAddress, ethBalance);
        await tx.wait();
        console.log(`✅ ETH/BNB 提取成功，交易哈希: ${tx.hash}`);
      } catch (error) {
        console.error(`❌ ETH/BNB 提取失败: ${error.message}`);
      }
    }

    for (const task of withdrawalTasks) {
      console.log(`\n🔄 提取 ${task.symbol}: ${task.formattedBalance}`);
      try {
        const tx = await router.emergencyWithdraw(task.address, task.balance);
        await tx.wait();
        console.log(`✅ ${task.symbol} 提取成功，交易哈希: ${tx.hash}`);
      } catch (error) {
        console.error(`❌ ${task.symbol} 提取失败: ${error.message}`);
      }
    }

    if (ethBalance === 0n && withdrawalTasks.length === 0) {
      console.log("\n🎉 合约中没有资金需要提取");
    } else {
      console.log("\n🎉 资金提取完成!");
    }

  } catch (error) {
    console.error("\n❌ 操作失败:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
