# Optimized Pancake Router 项目简介

本项目实现并优化了一个支持 PancakeSwap V2/V3 交易的 Solidity 路由合约，具备如下核心功能：

## 主要特性
- 支持 PancakeSwap V2/V3 主网自动化交易（ETH↔Token、Token↔Token）
- 可设置手续费比例和收款地址，owner可管理
- 所有swap方法具备重入保护（nonReentrant）
- 自动检测V3池子和报价，兼容非标准ERC20代币
- 支持主网fork环境下的V2/V3代币买卖交易集成测试
- 脚本支持自动切换测试代币地址，容错处理

## 目录结构
- contracts/OptimizedPancakeRouter.sol   主合约
- contracts/interfaces/                 V3/V2接口合约
- test/OptimizedPancakeRouter.test.js   测试类，覆盖核心功能和主网fork交易
- scripts/deploy.js                     一键部署脚本，支持fork/test/main环境

## 快速开始
1. 安装依赖：`npm install`
2. 编译合约：`npx hardhat compile`
3. 测试：`npx hardhat test`
4. 部署：`npx hardhat run scripts/deploy.js --network <env>`

## 环境说明
- fork环境：自动连接主网节点，支持真实主网合约和池子
- test环境：用于测试网部署
- main环境：用于主网正式部署

## 其他说明
- feeRecipient统一为：0xc66B246B816f3eDf5b26851F03A96E15C4C6395f
- 支持扩展更多主网池子、特殊手续费逻辑、复杂路径等
- 建议生产环境前进行安全审计和Gas优化

## 联系与贡献
如需定制功能或有任何问题，欢迎提交issue或联系项目维护者。
