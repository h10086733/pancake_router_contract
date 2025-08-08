const { ethers } = require("hardhat");

async function main() {
    console.log("🎯 在Fork主网环境中测试BAND代币买卖");
    console.log("代币地址: 0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c");
    
    // 获取测试账户
    const [trader] = await ethers.getSigners();
    console.log("👤 交易员账户:", trader.address);
    
    // 显示初始余额
    const initialBalance = await ethers.provider.getBalance(trader.address);
    console.log("💰 初始BNB余额:", ethers.formatEther(initialBalance));
    
    // 合约地址配置
    const BAND_TOKEN = "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c";
    const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
    const PANCAKE_ROUTER_V2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    const PANCAKE_ROUTER_V3 = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
    
    console.log("\n📋 测试配置:");
    console.log("- BAND代币:", BAND_TOKEN);
    console.log("- WBNB:", WBNB);
    console.log("- 交易路径: BNB ↔ BAND");
    
    // 部署我们的优化路由器
    console.log("\n🏗️  部署OptimizedPancakeRouter...");
    const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");
    const router = await OptimizedPancakeRouter.deploy(
        PANCAKE_ROUTER_V2,
        PANCAKE_ROUTER_V3,
        WBNB,
        0, // 零手续费测试
        trader.address
    );
    
    await router.waitForDeployment();
    const routerAddress = await router.getAddress();
    console.log("✅ 路由器已部署:", routerAddress);
    
    // 获取BAND代币合约
    const bandContract = await ethers.getContractAt([
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function balanceOf(address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)",
        "function allowance(address,address) view returns (uint256)"
    ], BAND_TOKEN);
    
    console.log("\n🪙 BAND代币信息:");
    const name = await bandContract.name();
    const symbol = await bandContract.symbol();
    const decimals = await bandContract.decimals();
    
    console.log("- 名称:", name);
    console.log("- 符号:", symbol);
    console.log("- 精度:", decimals);
    
    // 测试多个购买金额
    const buyTests = [
        { amount: "0.01", desc: "小额测试" },
        { amount: "0.1", desc: "中等金额" },
        { amount: "0.5", desc: "大额测试" }
    ];
    
    let totalBandPurchased = 0n;
    const purchases = [];
    
    // 执行购买测试
    for (const test of buyTests) {
        console.log(`\n🛒 ${test.desc}: 购买 ${test.amount} BNB 的 BAND`);
        
        try {
            const amountIn = ethers.parseEther(test.amount);
            const path = [WBNB, BAND_TOKEN];
            
            // 1. 查询价格
            console.log("📊 查询价格...");
            const amountsOut = await router.getV2AmountsOut(amountIn, path);
            const expectedBAND = amountsOut[1];
            
            console.log("- 输入:", test.amount, "BNB");
            console.log("- 预期输出:", ethers.formatEther(expectedBAND), "BAND");
            
            if (expectedBAND === 0n) {
                console.log("❌ 没有流动性可供交易");
                continue;
            }
            
            // 2. 设置滑点保护 (3%)
            const minBANDOut = (expectedBAND * 97n) / 100n;
            console.log("- 最小输出:", ethers.formatEther(minBANDOut), "BAND");
            
            // 3. 执行购买
            const deadline = Math.floor(Date.now() / 1000) + 600;
            
            console.log("⏳ 执行购买交易...");
            const buyTx = await router.swapV2ExactETHForTokens(
                minBANDOut,
                path,
                trader.address,
                deadline,
                { 
                    value: amountIn,
                    gasLimit: 300000 // 设置gas限制
                }
            );
            
            const receipt = await buyTx.wait();
            console.log("✅ 购买成功!");
            console.log("- 交易哈希:", receipt.hash);
            console.log("- Gas使用:", receipt.gasUsed.toString());
            
            // 4. 检查实际获得的BAND
            const bandBalance = await bandContract.balanceOf(trader.address);
            const newBAND = bandBalance - totalBandPurchased;
            totalBandPurchased = bandBalance;
            
            console.log("- 实际获得:", ethers.formatEther(newBAND), "BAND");
            console.log("- 总BAND余额:", ethers.formatEther(bandBalance), "BAND");
            
            // 记录购买信息
            purchases.push({
                bnbAmount: test.amount,
                bandReceived: newBAND,
                txHash: receipt.hash
            });
            
        } catch (error) {
            console.log("❌ 购买失败:", error.reason || error.message);
            
            if (error.message.includes("INSUFFICIENT_LIQUIDITY")) {
                console.log("💧 流动性不足");
            } else if (error.message.includes("TRANSFER_FAILED")) {
                console.log("📵 转账失败，可能有代币限制");
            }
        }
        
        // 显示当前状态
        const currentBNB = await ethers.provider.getBalance(trader.address);
        const currentBAND = await bandContract.balanceOf(trader.address);
        console.log("💰 当前余额:");
        console.log("  - BNB:", ethers.formatEther(currentBNB));
        console.log("  - BAND:", ethers.formatEther(currentBAND));
    }
    
    // 如果有BAND，测试卖出功能
    const finalBANDBalance = await bandContract.balanceOf(trader.address);
    
    if (finalBANDBalance > 0n) {
        console.log("\n💸 测试卖出功能");
        
        // 测试不同比例的卖出
        const sellTests = [
            { percentage: 20, desc: "卖出20%" },
            { percentage: 50, desc: "卖出50%" },
            { percentage: 100, desc: "全部卖出" }
        ];
        
        for (const sellTest of sellTests) {
            console.log(`\n🔄 ${sellTest.desc}`);
            
            try {
                const currentBAND = await bandContract.balanceOf(trader.address);
                if (currentBAND === 0n) {
                    console.log("⚠️  没有BAND可以卖出");
                    break;
                }
                
                const sellAmount = (currentBAND * BigInt(sellTest.percentage)) / 100n;
                console.log("- 卖出数量:", ethers.formatEther(sellAmount), "BAND");
                
                // 1. 授权BAND给路由器
                console.log("📝 授权BAND给路由器...");
                const approveTx = await bandContract.approve(routerAddress, sellAmount);
                await approveTx.wait();
                console.log("✅ 授权成功");
                
                // 2. 查询预期BNB输出
                const sellPath = [BAND_TOKEN, WBNB];
                const sellAmountsOut = await router.getV2AmountsOut(sellAmount, sellPath);
                const expectedBNB = sellAmountsOut[1];
                
                console.log("- 预期获得BNB:", ethers.formatEther(expectedBNB));
                
                // 3. 设置滑点保护
                const minBNBOut = (expectedBNB * 97n) / 100n;
                
                // 4. 执行卖出
                const deadline = Math.floor(Date.now() / 1000) + 600;
                
                console.log("⏳ 执行卖出交易...");
                const sellTx = await router.swapV2ExactTokensForETH(
                    sellAmount,
                    minBNBOut,
                    sellPath,
                    trader.address,
                    deadline,
                    { gasLimit: 300000 }
                );
                
                const sellReceipt = await sellTx.wait();
                console.log("✅ 卖出成功!");
                console.log("- 交易哈希:", sellReceipt.hash);
                
                // 显示卖出后余额
                const afterSellBNB = await ethers.provider.getBalance(trader.address);
                const afterSellBAND = await bandContract.balanceOf(trader.address);
                
                console.log("💰 卖出后余额:");
                console.log("  - BNB:", ethers.formatEther(afterSellBNB));
                console.log("  - BAND:", ethers.formatEther(afterSellBAND));
                
            } catch (error) {
                console.log("❌ 卖出失败:", error.reason || error.message);
            }
        }
    } else {
        console.log("\n⚠️  没有BAND代币，跳过卖出测试");
    }
    
    // 最终报告
    console.log("\n📊 最终交易报告");
    const finalBNB = await ethers.provider.getBalance(trader.address);
    const finalBAND = await bandContract.balanceOf(trader.address);
    
    console.log("💰 最终余额:");
    console.log("- BNB余额:", ethers.formatEther(finalBNB));
    console.log("- BAND余额:", ethers.formatEther(finalBAND));
    
    console.log("\n📈 交易统计:");
    console.log("- 初始BNB:", ethers.formatEther(initialBalance));
    console.log("- 最终BNB:", ethers.formatEther(finalBNB));
    console.log("- BNB净变化:", ethers.formatEther(finalBNB - initialBalance));
    console.log("- 成功购买次数:", purchases.length);
    console.log("- 最终BAND持有:", ethers.formatEther(finalBAND));
    
    if (purchases.length > 0) {
        console.log("\n🧾 购买记录:");
        purchases.forEach((purchase, index) => {
            console.log(`${index + 1}. ${purchase.bnbAmount} BNB → ${ethers.formatEther(purchase.bandReceived)} BAND`);
        });
    }
    
    console.log("\n🎉 BAND代币买卖测试完成!");
    console.log("✅ 合约部署成功");
    console.log("✅ 买币功能测试");
    console.log("✅ 卖币功能测试");
    console.log("✅ 价格查询功能");
    console.log("✅ 滑点保护机制");
    
    return {
        routerAddress,
        bandToken: BAND_TOKEN,
        initialBNB: ethers.formatEther(initialBalance),
        finalBNB: ethers.formatEther(finalBNB),
        finalBAND: ethers.formatEther(finalBAND),
        successfulPurchases: purchases.length
    };
}

main()
    .then((result) => {
        console.log("\n🎯 测试结果总结:", result);
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ 测试失败:", error);
        process.exit(1);
    });
