const fs = require("fs");
const path = require("path");

/**
 * 自动合约源码验证脚本
 */
async function main() {
  console.log("🔍 开始合约源码验证...\n");
  
  try {
    // 获取网络参数
    const network = process.env.HARDHAT_NETWORK || "bsc";
    console.log(`📡 目标网络: ${network}`);
    
    // 读取部署信息
    const deploymentFile = path.join(__dirname, "..", "deployments", `${network}-deployment.json`);
    
    if (!fs.existsSync(deploymentFile)) {
      console.error(`❌ 未找到 ${network} 网络的部署信息`);
      console.error(`   请确保文件存在: ${deploymentFile}`);
      process.exit(1);
    }
    
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
    console.log(`📍 合约地址: ${deployment.contractAddress}`);
    console.log(`👤 部署者: ${deployment.deployer}`);
    console.log(`📅 部署时间: ${new Date(deployment.deploymentTime).toLocaleString()}\n`);
    
    // 构建验证命令
    const { deployParams } = deployment;
    const verifyCommand = [
      "npx hardhat verify",
      `--network ${network}`,
      deployment.contractAddress,
      `"${deployParams.pancakeRouterV2}"`,
      `"${deployParams.pancakeRouterV3}"`,
      `"${deployParams.weth}"`,
      deployParams.feeRate,
      `"${deployParams.feeRecipient}"`
    ].join(" \\\n  ");
    
    console.log("📋 验证命令:");
    console.log("```bash");
    console.log(verifyCommand);
    console.log("```\n");
    
    // 检查环境变量
    console.log("🔑 环境变量检查:");
    
    const requiredEnvVars = {
      "PRIVATE_KEY": "部署私钥",
      "BSCSCAN_API_KEY": "BSCScan API 密钥"
    };
    
    let allEnvVarsPresent = true;
    
    for (const [envVar, description] of Object.entries(requiredEnvVars)) {
      if (process.env[envVar]) {
        console.log(`   ✅ ${envVar}: 已设置`);
      } else {
        console.log(`   ❌ ${envVar}: 未设置 (${description})`);
        allEnvVarsPresent = false;
      }
    }
    
    if (!allEnvVarsPresent) {
      console.log("\n⚠️  请在 .env 文件中设置缺失的环境变量");
      console.log("   示例:");
      console.log("   BSCSCAN_API_KEY=YOUR_API_KEY_HERE");
    }
    
    // 网络特定信息
    const networkInfo = {
      bsc: {
        name: "BSC 主网",
        explorer: "https://bscscan.com",
        apiKeyUrl: "https://bscscan.com/apis"
      },
      bscTestnet: {
        name: "BSC 测试网", 
        explorer: "https://testnet.bscscan.com",
        apiKeyUrl: "https://bscscan.com/apis"
      }
    };
    
    const info = networkInfo[network];
    if (info) {
      console.log(`\n🌐 ${info.name} 信息:`);
      console.log(`   浏览器: ${info.explorer}/address/${deployment.contractAddress}`);
      console.log(`   API Key 申请: ${info.apiKeyUrl}`);
    }
    
    // 验证后的好处
    console.log("\n✅ 源码验证的好处:");
    console.log("   🔍 代码完全透明公开");
    console.log("   🛡️ 增强用户信任度");
    console.log("   📊 支持直接调用合约函数");
    console.log("   🔗 便于其他开发者集成");
    console.log("   📈 提升项目专业度");
    
    console.log("\n💡 验证成功后，用户可以:");
    console.log("   • 在 BSCScan 上查看完整源码");
    console.log("   • 直接在浏览器中调用合约函数");
    console.log("   • 验证构造参数和编译设置");
    console.log("   • 确认合约安全性和功能");
    
    if (allEnvVarsPresent) {
      console.log("\n🚀 环境已就绪，可以执行验证命令!");
    } else {
      console.log("\n⏳ 请先配置环境变量，然后执行验证命令");
    }
    
    // 自动执行验证 (如果环境变量齐全)
    if (allEnvVarsPresent && process.argv.includes("--auto")) {
      console.log("\n🔄 自动执行验证...");
      const { exec } = require("child_process");
      
      exec(verifyCommand.replace(/\\\n\s*/g, " "), (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ 验证失败: ${error.message}`);
          return;
        }
        
        if (stderr) {
          console.warn(`⚠️ 警告: ${stderr}`);
        }
        
        console.log(`✅ 验证结果:\n${stdout}`);
      });
    }
    
  } catch (error) {
    console.error("❌ 验证准备失败:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main()
    .then(() => {
      if (!process.argv.includes("--auto")) {
        process.exit(0);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;
