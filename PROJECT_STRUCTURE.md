# 清理后的项目结构

## 核心合约
- `contracts/OptimizedPancakeRouter.sol` - 主要路由器合约
- `contracts/interfaces/IPancakeInterfaces.sol` - 接口定义

## 部署脚本
- `scripts/deploy.js` - 主要部署脚本

## 测试脚本
- `scripts/fork-band-test.js` - BAND token完整买卖测试（在fork环境中）
- `test/OptimizedPancakeRouter.test.js` - 单元测试

## 管理脚本
- `scripts/analyze-fee-collection.js` - 费用收集分析
- `scripts/test-fee-collection.js` - 费用收集测试
- `scripts/estimate-cost.js` - Gas成本估算
- `scripts/verify-contract.js` - 合约验证
- `scripts/verify-deployment.js` - 部署验证
- `scripts/withdraw-funds.js` - 资金提取

## 交易工具
- `scripts/trading/AutoTrader.js` - 自动交易器
- `scripts/trading/trade-examples.js` - 交易示例

## 配置文件
- `hardhat.config.js` - Hardhat配置（包含fork设置）
- `package.json` - 项目依赖

## 部署记录
- `deployments/` - 各网络的部署记录

## 已删除的重复文件
以下文件已被删除，因为功能重复或临时性质：
- advanced-fork-test.js
- analyze-token.js
- check-addresses.js
- deploy-band-router.js
- deploy-fixed.js
- diagnose-failed-tx.js
- direct-test-token.js
- fixed-token-test.js
- fork-mainnet-test.js
- simple-diagnose.js
- simple-token-test.js
- test-band-fork.js
- test-fixed-router.js
- test-optimized-router.js
- test-specific-token.js
- test-token-0xad6c.js
- universal-token-test.js

## 核心功能
1. **BAND token买卖** - 使用 `fork-band-test.js`
2. **合约部署** - 使用 `deploy.js`
3. **单元测试** - 使用 `test/OptimizedPancakeRouter.test.js`
4. **费用管理** - 使用相关费用脚本
5. **自动交易** - 使用 trading 目录下的脚本
