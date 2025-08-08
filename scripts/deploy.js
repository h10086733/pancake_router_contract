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

    // 检查余额
    const minBalance = networkName === "bscTestnet" ? "0.01" : "0.1";
    if (balance < ethers.parseEther(minBalance)) {
      console.error(`❌ 账户余额不足，需要至少 ${minBalance} BNB 进行部署`);
      process.exit(1);
    }

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

    // 开始部署
    console.log("🔨 开始部署合约...");
    const router = await OptimizedPancakeRouter.deploy(
      deployParams.pancakeRouterV2,
      deployParams.pancakeRouterV3,
      deployParams.weth,
      deployParams.feeRate,
      deployParams.feeRecipient
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
