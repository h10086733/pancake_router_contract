const { ethers, network } = require("hardhat");

async function main() {
  let routerV2, routerV3, feeRate, feeRecipient;
  // 环境参数
  feeRecipient = "0xc66B246B816f3eDf5b26851F03A96E15C4C6395f";
  if (network.name === "hardhat" || network.name === "fork") {
    // fork环境
    routerV2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    routerV3 = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
    feeRate = 30;
  } else if (network.name === "test") {
    // 测试网
    routerV2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    routerV3 = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
    feeRate = 30;
  } else {
    // 主网
    routerV2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
    routerV3 = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
    feeRate = 30;
  }

  const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");
  const router = await OptimizedPancakeRouter.deploy(routerV2, routerV3, feeRate, feeRecipient);
  await router.waitForDeployment();
  console.log(`OptimizedPancakeRouter deployed to: ${router.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
