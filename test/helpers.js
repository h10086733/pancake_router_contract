const { ethers } = require("hardhat");

// PancakeSwap V3 Factory地址（主网）
const V3_FACTORY = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";
// Quoter地址请补充真实主网地址
let V3_QUOTER = process.env.V3_QUOTER || "0x0000000000000000000000000000000000000000";

function setQuoterAddress(addr) {
  V3_QUOTER = addr;
}

// 查询V3池子是否存在
async function getV3Pool(tokenA, tokenB, fee) {
  const factory = await ethers.getContractAt("IPancakeV3Factory", V3_FACTORY);
  return await factory.getPool(tokenA, tokenB, Number(fee));
}

// 用Quoter报价V3交易
async function quoteV3(tokenIn, tokenOut, fee, amountIn) {
  const quoter = await ethers.getContractAt("IPancakeV3Quoter", V3_QUOTER);
  return await quoter.quoteExactInputSingle(tokenIn, tokenOut, Number(fee), amountIn, 0);
}

module.exports = {
  getV3Pool,
  quoteV3,
  setQuoterAddress,
};
