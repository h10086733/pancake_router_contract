const { ethers } = require("hardhat");

/**
 * 部署成本估算脚本
 * 估算在不同 gas 价格下部署合约的 BNB 成本
 */
async function main() {
  console.log("💰 OptimizedPancakeRouter 部署成本分析\n");
  
  try {
    // 获取网络信息
    const network = await ethers.provider.getNetwork();
    console.log(`📡 网络: ${network.name} (Chain ID: ${network.chainId})`);
    
    // 获取部署账户
    const [deployer] = await ethers.getSigners();
    console.log(`👤 部署账户: ${deployer.address}`);
    
    // 获取当前余额
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`💰 当前余额: ${ethers.formatEther(balance)} BNB\n`);
    
    // 获取合约工厂
    const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");
    
    // 部署参数 (根据网络选择)
    const isMainnet = network.chainId === 56n;
    const deployParams = {
      pancakeRouterV2: isMainnet ? "0x10ED43C718714eb63d5aA57B78B54704E256024E" : "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
      pancakeRouterV3: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
      weth: isMainnet ? "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" : "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
      feeRate: process.env.FEE_RATE || 30, // 0.3%
      feeRecipient: process.env.FEE_RECIPIENT || "0xE1c727B62cF1ed816587E1005790f9E30299bf88"
    };
    
    console.log("⚙️  部署参数:");
    console.log(`   V2 Router: ${deployParams.pancakeRouterV2}`);
    console.log(`   V3 Router: ${deployParams.pancakeRouterV3}`);
    console.log(`   WBNB/WETH: ${deployParams.weth}`);
    console.log(`   Fee Rate: ${deployParams.feeRate} (${deployParams.feeRate/100}%)`);
    console.log(`   Fee Recipient: ${deployParams.feeRecipient}\n`);
    
    // 估算部署 gas
    console.log("🔍 估算部署 Gas...");
    const deployTx = await OptimizedPancakeRouter.getDeployTransaction(
      deployParams.pancakeRouterV2,
      deployParams.pancakeRouterV3,
      deployParams.weth,
      deployParams.feeRate,
      deployParams.feeRecipient
    );
    
    const gasEstimate = await ethers.provider.estimateGas(deployTx);
    console.log(`📊 预估 Gas 使用量: ${gasEstimate.toLocaleString()}`);
    
    // 获取当前 gas 价格
    let currentGasPrice;
    try {
      const feeData = await ethers.provider.getFeeData();
      currentGasPrice = feeData.gasPrice || ethers.parseUnits("5", "gwei");
    } catch (error) {
      currentGasPrice = ethers.parseUnits("5", "gwei");
    }
    console.log(`⛽ 当前 Gas 价格: ${ethers.formatUnits(currentGasPrice, "gwei")} Gwei\n`);
    
    // 不同 gas 价格场景
    const gasPriceScenarios = [
      { name: "低峰期", gwei: 3, description: "网络空闲，最便宜" },
      { name: "正常时期", gwei: 5, description: "平衡成本和速度" },
      { name: "繁忙时期", gwei: 10, description: "网络较忙" },
      { name: "拥堵时期", gwei: 20, description: "网络拥堵" },
      { name: "极端拥堵", gwei: 50, description: "紧急情况" }
    ];
    
    console.log("💸 不同 Gas 价格下的部署成本估算:");
    console.log("┌─────────────┬──────────┬─────────────┬─────────────┬──────────────────┐");
    console.log("│   时期      │ Gas价格  │   部署成本  │  USD (约*)  │      建议        │");
    console.log("├─────────────┼──────────┼─────────────┼─────────────┼──────────────────┤");
    
    // 假设 BNB 价格 (实际使用时可从 API 获取)
    const bnbPriceUSD = 600; // 假设 BNB = $600
    
    for (const scenario of gasPriceScenarios) {
      const gasPrice = ethers.parseUnits(scenario.gwei.toString(), "gwei");
      const cost = gasEstimate * gasPrice;
      const costBNB = ethers.formatEther(cost);
      const costUSD = parseFloat(costBNB) * bnbPriceUSD;
      
      let recommendation = "";
      if (scenario.gwei <= 5) recommendation = "✅ 推荐";
      else if (scenario.gwei <= 10) recommendation = "🟡 可接受";
      else if (scenario.gwei <= 20) recommendation = "🟠 较高";
      else recommendation = "🔴 避免";
      
      console.log(`│ ${scenario.name.padEnd(11)} │ ${scenario.gwei.toString().padStart(6)} Gwei │ ${costBNB.padStart(9)} BNB │ $${costUSD.toFixed(2).padStart(9)} │ ${recommendation.padEnd(16)} │`);
    }
    
    console.log("└─────────────┴──────────┴─────────────┴─────────────┴──────────────────┘");
    console.log("* BNB 价格按 $600 估算，实际价格可能不同\n");
    
    // 当前网络推荐成本
    const currentCost = gasEstimate * currentGasPrice;
    const currentCostBNB = ethers.formatEther(currentCost);
    const currentCostUSD = parseFloat(currentCostBNB) * bnbPriceUSD;
    
    console.log("🎯 当前网络部署成本:");
    console.log(`   Gas 使用量: ${gasEstimate.toLocaleString()}`);
    console.log(`   Gas 价格: ${ethers.formatUnits(currentGasPrice, "gwei")} Gwei`);
    console.log(`   部署成本: ${currentCostBNB} BNB (约 $${currentCostUSD.toFixed(2)})`);
    console.log(`   建议 Gas Limit: ${(gasEstimate + 50000n).toLocaleString()} (增加安全余量)\n`);
    
    // 余额检查
    const safetyMargin = currentCost * 3n / 2n; // 150% 安全余量
    const recommendedBalance = ethers.formatEther(safetyMargin);
    
    console.log("💳 余额检查:");
    console.log(`   当前余额: ${ethers.formatEther(balance)} BNB`);
    console.log(`   预估成本: ${currentCostBNB} BNB`);
    console.log(`   建议余额: ${recommendedBalance} BNB (含50%安全余量)`);
    
    if (balance >= safetyMargin) {
      console.log("   ✅ 余额充足，可以部署");
    } else if (balance >= currentCost) {
      console.log("   ⚠️  余额勉强够用，建议增加安全余量");
    } else {
      const needed = ethers.formatEther(currentCost - balance);
      console.log(`   ❌ 余额不足，还需要 ${needed} BNB`);
    }
    
    console.log("\n📋 部署建议:");
    console.log("   🕐 最佳时机: 选择网络拥堵较少的时段 (低 Gas 价格)");
    console.log("   💰 资金准备: 账户至少保留 0.05 BNB 用于后续交易");
    console.log("   ⚡ Gas 设置: 使用预估值 + 10-20% 余量确保成功");
    console.log("   🔍 实时监控: 部署前检查当前 Gas 价格趋势");
    
    if (isMainnet) {
      console.log("\n🚨 主网部署提醒:");
      console.log("   ⚠️  这是主网部署，将消耗真实的 BNB");
      console.log("   🔐 确保私钥安全，使用硬件钱包或安全环境");
      console.log("   ✅ 部署前再次确认所有参数正确");
      console.log("   📝 建议先在测试网验证所有功能");
    }
    
    console.log("\n✅ 成本分析完成!");
    
    // 返回成本信息
    return {
      gasEstimate: gasEstimate.toString(),
      currentGasPrice: ethers.formatUnits(currentGasPrice, "gwei"),
      deploymentCost: currentCostBNB,
      estimatedUSD: currentCostUSD.toFixed(2),
      sufficientBalance: balance >= safetyMargin,
      balanceStatus: balance >= safetyMargin ? "sufficient" : balance >= currentCost ? "minimal" : "insufficient"
    };
    
  } catch (error) {
    console.error("❌ 成本分析失败:", error.message);
    return null;
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
