const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 开始部署 OptimizedPancakeRouter...");
  
  try {
    // 获取网络信息
    console.log("🔍 获取网络信息...");
    const network = await ethers.provider.getNetwork();
    console.log(`📡 网络: ${network.name} (Chain ID: ${network.chainId})`);

    // 确定网络名称
    const networkName = network.name === "unknown" ? 
      (network.chainId === 56n ? "bsc" : 
       network.chainId === 97n ? "bscTestnet" : 
       "hardhat") : 
      network.name;

    // 获取部署账户
    console.log("👤 获取部署账户...");
    const [deployer] = await ethers.getSigners();
    console.log(`👤 部署账户: ${deployer.address}`);

    // 获取账户余额
    console.log("💰 检查账户余额...");
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`💰 账户余额: ${ethers.formatEther(balance)} BNB`);

    // 网络配置
    const NETWORK_CONFIG = {
      bsc: {
        PANCAKE_V2_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
        PANCAKE_V3_ROUTER: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
        WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
      },
      bscTestnet: {
        PANCAKE_V2_ROUTER: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
        PANCAKE_V3_ROUTER: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
        WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"
      },
      hardhat: {
        PANCAKE_V2_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
        PANCAKE_V3_ROUTER: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
        WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
      }
    };

    const config = NETWORK_CONFIG[networkName];
    if (!config) {
      console.error(`❌ 不支持的网络: ${networkName}`);
      process.exit(1);
    }

    console.log("📋 合约配置:");
    console.log(`   V2 Router: ${config.PANCAKE_V2_ROUTER}`);
    console.log(`   V3 Router: ${config.PANCAKE_V3_ROUTER}`);
    console.log(`   WBNB: ${config.WBNB}`);

    // 手续费接收地址 - 优先使用环境变量，然后使用您指定的地址，最后使用部署者地址
    const feeRecipient = process.env.FEE_RECIPIENT || 
                        "0xE1c727B62cF1ed816587E1005790f9E30299bf88";

    // 部署参数
    const deployParams = {
      pancakeRouterV2: config.PANCAKE_V2_ROUTER,
      pancakeRouterV3: config.PANCAKE_V3_ROUTER,
      weth: config.WBNB,
      feeRate: process.env.FEE_RATE || 0, // 默认 0%，可通过环境变量配置
      feeRecipient: feeRecipient
    };

    console.log("⚙️  部署参数:");
    console.log(`   手续费率: ${deployParams.feeRate / 100}%`);
    console.log(`   手续费接收者: ${deployParams.feeRecipient}`);
    
    // 验证手续费接收地址
    if (!ethers.isAddress(deployParams.feeRecipient)) {
      console.error("❌ 无效的手续费接收地址");
      process.exit(1);
    }

    // 获取合约工厂
    console.log("📦 获取合约工厂...");
    const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");
    console.log("✅ 合约工厂获取成功");

    // 预估部署 gas 费用
    console.log("\n💰 预估部署费用...");
    const deployTx = await OptimizedPancakeRouter.getDeployTransaction(
      deployParams.pancakeRouterV2,
      deployParams.pancakeRouterV3,
      deployParams.weth,
      deployParams.feeRate,
      deployParams.feeRecipient
    );

    const gasEstimate = await ethers.provider.estimateGas(deployTx);
    console.log(`⛽ 预估 Gas 使用量: ${gasEstimate.toLocaleString()}`);

    // 获取当前 gas 价格
    let currentGasPrice;
    try {
      const feeData = await ethers.provider.getFeeData();
      currentGasPrice = feeData.gasPrice || ethers.parseUnits("5", "gwei");
    } catch (error) {
      currentGasPrice = ethers.parseUnits("5", "gwei"); // 默认 5 Gwei
    }
    console.log(`⛽ 当前 Gas 价格: ${ethers.formatUnits(currentGasPrice, "gwei")} Gwei`);

    // 计算部署成本
    const estimatedCost = gasEstimate * currentGasPrice;
    const estimatedCostBNB = ethers.formatEther(estimatedCost);
    console.log(`💸 预估部署成本: ${estimatedCostBNB} BNB`);

    // 检查余额是否充足
    const currentBalance = await ethers.provider.getBalance(deployer.address);
    const balanceBNB = ethers.formatEther(currentBalance);
    console.log(`💰 当前账户余额: ${balanceBNB} BNB`);

    // 安全余量检查 (预估成本的 150%)
    const safetyMargin = estimatedCost * 3n / 2n;
    if (currentBalance < safetyMargin) {
      const requiredBNB = ethers.formatEther(safetyMargin);
      console.error(`❌ 余额不足！需要至少 ${requiredBNB} BNB (包含 50% 安全余量)`);
      console.error(`   当前余额: ${balanceBNB} BNB`);
      console.error(`   预估成本: ${estimatedCostBNB} BNB`);
      console.error(`   建议余额: ${requiredBNB} BNB`);
      process.exit(1);
    }

    console.log("✅ 余额充足，继续部署...");

    // 开始部署
    console.log("\n🔨 开始部署合约...");
    const router = await OptimizedPancakeRouter.deploy(
      deployParams.pancakeRouterV2,
      deployParams.pancakeRouterV3,
      deployParams.weth,
      deployParams.feeRate,
      deployParams.feeRecipient,
      {
        gasLimit: gasEstimate + 50000n, // 增加一些余量
        gasPrice: currentGasPrice
      }
    );

    console.log("⏳ 等待部署交易确认...");
    console.log(`📄 部署交易哈希: ${router.deploymentTransaction().hash}`);
    
    await router.waitForDeployment();
    
    const contractAddress = await router.getAddress();
    
    console.log("\n✅ 合约部署成功!");
    console.log(`📍 合约地址: ${contractAddress}`);
    console.log(`🔗 交易哈希: ${router.deploymentTransaction().hash}`);

    // 验证部署
    console.log("\n🔍 验证合约部署...");
    const owner = await router.owner();
    const feeRate = await router.feeRate();
    const feeRecipientContract = await router.feeRecipient();

    console.log("📊 合约状态验证:");
    console.log(`   ✅ Owner: ${owner}`);
    console.log(`   ✅ Fee Rate: ${feeRate} (${Number(feeRate) / 100}%)`);
    console.log(`   ✅ Fee Recipient: ${feeRecipientContract}`);

    // 确认手续费接收地址设置正确
    if (feeRecipientContract.toLowerCase() === deployParams.feeRecipient.toLowerCase()) {
      console.log("   ✅ 手续费接收地址设置正确");
    } else {
      console.warn("   ⚠️  手续费接收地址与预期不符");
    }

    // 保存部署信息
    const deploymentInfo = {
      network: networkName,
      chainId: Number(network.chainId),
      contractAddress: contractAddress,
      deployer: deployer.address,
      deploymentTime: new Date().toISOString(),
      transactionHash: router.deploymentTransaction().hash,
      deployParams: deployParams
    };

    // 创建部署目录并保存信息
    const deploymentsDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir, { recursive: true });
    }

    const deploymentFile = path.join(deploymentsDir, `${networkName}-deployment.json`);
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log(`💾 部署信息已保存到: ${deploymentFile}`);

    // 输出后续步骤
    if (networkName !== "hardhat") {
      console.log("\n📝 验证合约源码命令:");
      console.log(`npx hardhat verify --network ${networkName} ${contractAddress} \\`);
      console.log(`  "${deployParams.pancakeRouterV2}" \\`);
      console.log(`  "${deployParams.pancakeRouterV3}" \\`);
      console.log(`  "${deployParams.weth}" \\`);
      console.log(`  ${deployParams.feeRate} \\`);
      console.log(`  "${deployParams.feeRecipient}"`);
      
      const explorerUrl = networkName === "bsc" ? 
        `https://bscscan.com/address/${contractAddress}` :
        `https://testnet.bscscan.com/address/${contractAddress}`;
      console.log(`\n🌐 浏览器查看: ${explorerUrl}`);
    }

    console.log("\n💡 后续管理:");
    console.log("如需修改手续费接收地址，可调用合约的 setFeeSettings 方法");
    console.log(`当前 Owner (${owner}) 可以修改配置`);

    console.log("\n🎉 部署完成!");
    return contractAddress;

  } catch (error) {
    console.error("\n❌ 部署失败!");
    console.error("错误:", error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
