const { ethers } = require("hardhat");

async function main() {
    console.log("🔍 测试交易对手续费收取机制...\n");
    
    // 部署合约
    console.log("📦 部署测试合约...");
    const [deployer] = await ethers.getSigners();
    
    const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");
    const router = await OptimizedPancakeRouter.deploy(
        "0x10ED43C718714eb63d5aA57B78B54704E256024E", // V2 Router
        "0x1b81D678ffb9C0263b24A97847620C99d213eB14", // V3 Router  
        "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
        30, // 0.3% 手续费
        "0xE1c727B62cF1ed816587E1005790f9E30299bf88" // 手续费接收地址
    );
    await router.waitForDeployment();
    
    const contractAddress = await router.getAddress();
    console.log(`✅ 合约部署成功: ${contractAddress}\n`);
    
    // 测试代币地址 (BSC 主网)
    const tokens = {
        WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        USDT: "0x55d398326f99059fF775485246999027B3197955", 
        BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
        CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
        USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
    };
    
    console.log("🔄 分析不同交易对的手续费收取:\n");
    
    // 测试用例
    const testCases = [
        {
            name: "BNB → USDT (卖出 BNB)",
            path: [tokens.WBNB, tokens.USDT],
            inputToken: "WBNB", 
            outputToken: "USDT",
            feeToken: "WBNB", // 预期收取的手续费代币
            description: "用户卖出 BNB 买入 USDT"
        },
        {
            name: "USDT → BNB (买入 BNB)",
            path: [tokens.USDT, tokens.WBNB], 
            inputToken: "USDT",
            outputToken: "WBNB", 
            feeToken: "USDT", // 预期收取的手续费代币
            description: "用户卖出 USDT 买入 BNB"
        },
        {
            name: "BNB → CAKE (卖出 BNB)",
            path: [tokens.WBNB, tokens.CAKE],
            inputToken: "WBNB",
            outputToken: "CAKE",
            feeToken: "WBNB", // 预期收取的手续费代币
            description: "用户卖出 BNB 买入 CAKE"
        },
        {
            name: "CAKE → BNB (买入 BNB)", 
            path: [tokens.CAKE, tokens.WBNB],
            inputToken: "CAKE",
            outputToken: "WBNB",
            feeToken: "CAKE", // 预期收取的手续费代币
            description: "用户卖出 CAKE 买入 BNB"
        },
        {
            name: "USDT → BUSD (稳定币互换)",
            path: [tokens.USDT, tokens.BUSD],
            inputToken: "USDT", 
            outputToken: "BUSD",
            feeToken: "USDT", // 预期收取的手续费代币
            description: "用户兑换稳定币"
        }
    ];
    
    // 分析每个测试用例
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        console.log(`${i + 1}. ${testCase.name}`);
        console.log(`   📝 ${testCase.description}`);
        console.log(`   🔸 输入代币: ${testCase.inputToken}`);
        console.log(`   🔸 输出代币: ${testCase.outputToken}`);
        console.log(`   💰 手续费代币: ${testCase.feeToken} ⬅️ 这是您会收到的代币`);
        
        // 模拟计算
        try {
            const amountIn = ethers.parseEther("1"); // 1 个输入代币
            const amounts = await router.getV2AmountsOut(amountIn, testCase.path);
            const feeAmount = (amountIn * 30n) / 10000n; // 0.3% 手续费
            
            console.log(`   📊 如果用户输入 1 ${testCase.inputToken}:`);
            console.log(`      - 手续费: ${ethers.formatEther(feeAmount)} ${testCase.feeToken}`);
            console.log(`      - 实际交换: ${ethers.formatEther(amountIn - feeAmount)} ${testCase.inputToken}`);
            console.log(`      - 预期输出: ${ethers.formatEther(amounts[1])} ${testCase.outputToken}`);
        } catch (error) {
            console.log(`   ⚠️  无法获取价格信息 (可能是网络连接问题)`);
        }
        
        console.log("");
    }
    
    console.log("📋 总结:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ BNB 作为输入代币时 → 您收到 BNB 手续费");
    console.log("❌ BNB 作为输出代币时 → 您收到其他代币手续费");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log("🎯 结论:");
    console.log("如果您只想收取 BNB 作为手续费，需要考虑以下方案:");
    console.log("1. 保持现状 - 手动将收到的各种代币换成 BNB");
    console.log("2. 修改合约 - 实现自动转换为 BNB 手续费");
    console.log("3. 限制交易 - 只允许 BNB 作为输入代币的交易");
    
    // 分析计价代币模式
    console.log("\n💡 如果 BNB 作为计价代币:");
    console.log("   - 用户买任何代币都用 BNB 支付 ✅ → 收取 BNB 手续费");
    console.log("   - 用户卖任何代币都换成 BNB ❌ → 收取卖出代币手续费");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 测试失败:", error);
        process.exit(1);
    });
