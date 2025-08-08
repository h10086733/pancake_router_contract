# 🚀 OptimizedPancakeRouter 部署指南

## 📋 部署前准备

### 1. 环境设置
```bash
# 1. 克隆或下载项目
# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
```

### 2. 配置 .env 文件
```bash
# 必需配置
PRIVATE_KEY=你的钱包私钥                    # 用于部署的钱包私钥
BSCSCAN_API_KEY=你的BSCScan_API密钥        # 用于合约验证

# 可选配置
FEE_RECIPIENT=0xE1c727B62cF1ed816587E1005790f9E30299bf88  # 手续费接收地址 (已预设)
FEE_RATE=30                                # 手续费率 (30 = 0.3%)
```

**注意**: 
- 手续费接收地址已设置为 `0xE1c727B62cF1ed816587E1005790f9E30299bf88`
- 如需修改，请在 `.env` 文件中设置 `FEE_RECIPIENT` 变量
- 手续费率默认为 0.3%，可通过 `FEE_RATE` 变量修改

### 3. 确保钱包余额充足
- **BSC 主网**: 至少 0.1 BNB 用于部署
- **BSC 测试网**: 至少 0.1 tBNB 用于部署 (可从水龙头获取)

## 🎯 部署步骤

### 方案 1: 部署到 BSC 测试网 (推荐新手)
```bash
# 1. 编译合约
npx hardhat compile

# 2. 部署到测试网
npx hardhat run scripts/deploy.js --network bscTestnet

# 3. 验证部署
npx hardhat run scripts/verify-deployment.js --network bscTestnet

# 4. 验证源码 (可选)
npx hardhat verify --network bscTestnet <合约地址> <构造参数>
```

### 方案 2: 部署到 BSC 主网 (生产环境)
```bash
# 1. 编译合约
npx hardhat compile

# 2. 部署到主网 (请再次确认配置!)
npx hardhat run scripts/deploy.js --network bsc

# 3. 验证部署
npx hardhat run scripts/verify-deployment.js --network bsc

# 4. 验证源码
npx hardhat verify --network bsc <合约地址> <构造参数>
```

### 方案 3: 本地测试 (开发调试)
```bash
# 1. 启动本地节点
npx hardhat node

# 2. 在新终端部署
npx hardhat run scripts/deploy.js --network localhost

# 3. 运行完整测试
npm test
```

## 📊 部署输出说明

部署成功后，您将看到类似输出：
```
🚀 开始部署 OptimizedPancakeRouter...
📡 网络: bsc (Chain ID: 56)
👤 部署账户: 0x1234...
💰 账户余额: 1.5 BNB
⛽ 估算 gas: 2,275,006
   Gas 价格: 3.0 gwei
   预估成本: 0.006825018 BNB
🔨 开始部署合约...
⏳ 等待部署交易确认...
✅ 合约部署成功!
   合约地址: 0xabcd1234...
   部署时间: 25000ms
   交易哈希: 0xdef5678...
📊 合约状态验证:
   ✅ Owner: 0x1234...
   ✅ Fee Rate: 30% (0.3%)
   ✅ Fee Recipient: 0x1234...
   ✅ V2 Router: 0x10ED43C718714eb63d5aA57B78B54704E256024E
   ✅ V3 Router: 0x1b81D678ffb9C0263b24A97847620C99d213eB14
   ✅ WETH: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
💾 部署信息已保存到: deployments/bsc-deployment.json

🔗 合约验证命令:
npx hardhat verify --network bsc 0xabcd1234... "0x10ED..." "0x1b81..." "0xbb4C..." 30 "0x1234..."

🌐 浏览器查看:
https://bscscan.com/address/0xabcd1234...

🎉 部署完成!
```

## 📁 部署文件说明

部署成功后会生成以下文件：
```
deployments/
├── bsc-deployment.json          # BSC 主网部署信息
├── bscTestnet-deployment.json   # BSC 测试网部署信息
└── hardhat-deployment.json     # 本地部署信息
```

部署信息包含：
- 合约地址
- 部署者地址  
- 部署时间
- 交易哈希
- 构造参数
- 网络信息

## 🔧 验证与使用

### 1. 功能验证
```bash
# 验证合约功能正常
npx hardhat run scripts/verify-deployment.js --network <network>
```

### 2. 源码验证
```bash
# 在区块链浏览器上验证源码
npx hardhat verify --network <network> <contract_address> <constructor_args>
```

### 3. 合约交互
```javascript
// 在 DApp 中使用
const router = new ethers.Contract(contractAddress, abi, signer);

// V2 交换
await router.swapV2ExactTokensForTokens(
  amountIn,
  amountOutMin, 
  [tokenA, tokenB],
  recipient,
  deadline
);

// V3 交换
await router.swapV3ExactInputSingle(
  tokenIn,
  tokenOut,
  fee,
  recipient,
  deadline,
  amountIn,
  amountOutMin,
  0
);
```

## ⚠️ 安全提醒

### 部署前检查清单:
- [ ] 私钥安全存储，不要泄露
- [ ] 确认网络配置正确 (主网/测试网)
- [ ] 检查钱包余额充足
- [ ] 确认手续费接收地址正确
- [ ] 在测试网先行测试
- [ ] 备份部署信息文件

### 主网部署注意:
- 🔐 使用硬件钱包或安全的私钥管理
- 🧪 先在测试网完整测试所有功能
- 💰 准备充足的 BNB 用于部署和后续操作
- 📝 备份所有重要信息
- 🔍 部署后立即验证源码

## 🆘 常见问题

### Q: 部署失败 "insufficient funds"
A: 钱包 BNB 余额不足，请充值后重试

### Q: 部署失败 "nonce too low/high"  
A: 网络拥堵或 nonce 冲突，等待几分钟后重试

### Q: 验证失败 "already verified"
A: 合约已经验证过，无需重复验证

### Q: 合约地址在浏览器显示不存在
A: 等待几个区块确认，或检查网络配置是否正确

### Q: 如何获取测试网 BNB?
A: 访问 BSC 测试网水龙头: https://testnet.binance.org/faucet-smart

## 📞 技术支持

如果遇到部署问题，请检查：
1. 网络连接是否正常
2. 私钥和 API 密钥是否正确配置
3. 钱包余额是否充足
4. 合约代码是否编译成功

---

🎉 **祝您部署成功！合约部署后即可用于真实交易测试。**
