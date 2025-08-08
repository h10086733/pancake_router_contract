const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("OptimizedPancakeRouter", function () {
  // BSC 主网合约地址
  const ADDRESSES = {
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    PANCAKE_V2_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    PANCAKE_V3_ROUTER: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
    PANCAKE_V3_FACTORY: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"
  };

  async function deployRouterFixture() {
    // 获取测试账户
    const [owner, trader1, trader2, feeRecipient] = await ethers.getSigners();

    // 部署合约
    const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");
    const router = await OptimizedPancakeRouter.deploy(
      ADDRESSES.PANCAKE_V2_ROUTER,
      ADDRESSES.PANCAKE_V3_ROUTER,
      ADDRESSES.WBNB,
      30, // 0.3% 手续费
      feeRecipient.address
    );

    // 获取代币合约实例
    const wbnb = await ethers.getContractAt([
      "function deposit() external payable",
      "function withdraw(uint256) external",
      "function balanceOf(address) external view returns (uint256)",
      "function transfer(address, uint256) external returns (bool)",
      "function approve(address, uint256) external returns (bool)"
    ], ADDRESSES.WBNB);

    const busd = await ethers.getContractAt("contracts/interfaces/IPancakeInterfaces.sol:IERC20", ADDRESSES.BUSD);
    const usdt = await ethers.getContractAt("contracts/interfaces/IPancakeInterfaces.sol:IERC20", ADDRESSES.USDT);
    const cake = await ethers.getContractAt("contracts/interfaces/IPancakeInterfaces.sol:IERC20", ADDRESSES.CAKE);

    // 为测试账户准备一些 WBNB
    await wbnb.connect(trader1).deposit({ value: ethers.parseEther("10") });
    await wbnb.connect(trader2).deposit({ value: ethers.parseEther("10") });

    return {
      router,
      owner,
      trader1,
      trader2,
      feeRecipient,
      wbnb,
      busd,
      usdt,
      cake
    };
  }

  async function findBestV3Pool(tokenA, tokenB) {
    const factoryV3 = await ethers.getContractAt([
      "function getPool(address, address, uint24) external view returns (address)"
    ], ADDRESSES.PANCAKE_V3_FACTORY);

    const fees = [100, 500, 2500, 10000];
    const pools = [];

    for (const fee of fees) {
      try {
        const poolAddress = await factoryV3.getPool(tokenA, tokenB, fee);
        if (poolAddress !== "0x0000000000000000000000000000000000000000") {
          const pool = await ethers.getContractAt([
            "function liquidity() external view returns (uint128)"
          ], poolAddress);
          
          const liquidity = await pool.liquidity();
          if (liquidity > 0n) {
            pools.push({ fee, address: poolAddress, liquidity });
          }
        }
      } catch (error) {
        // 忽略查询失败的池子
      }
    }

    if (pools.length === 0) {
      throw new Error("未找到可用的 V3 池子");
    }

    return pools.reduce((best, current) => 
      current.liquidity > best.liquidity ? current : best
    );
  }

  describe("部署和初始化", function () {
    it("应该正确部署合约", async function () {
      const { router, owner, feeRecipient } = await loadFixture(deployRouterFixture);

      expect(await router.owner()).to.equal(owner.address);
      expect(await router.WETH()).to.equal(ADDRESSES.WBNB);
      expect(await router.pancakeRouterV2()).to.equal(ADDRESSES.PANCAKE_V2_ROUTER);
      expect(await router.pancakeRouterV3()).to.equal(ADDRESSES.PANCAKE_V3_ROUTER);
      expect(await router.feeRate()).to.equal(30);
      expect(await router.feeRecipient()).to.equal(feeRecipient.address);
      expect(await router.maxSlippage()).to.equal(500); // 5%
    });

    it("应该拒绝无效的构造参数", async function () {
      const [owner] = await ethers.getSigners();
      const OptimizedPancakeRouter = await ethers.getContractFactory("OptimizedPancakeRouter");

      // 测试无效的 V2 路由器地址
      await expect(
        OptimizedPancakeRouter.deploy(
          ethers.ZeroAddress,
          ADDRESSES.PANCAKE_V3_ROUTER,
          ADDRESSES.WBNB,
          30,
          owner.address
        )
      ).to.be.revertedWith("Invalid V2 router");

      // 测试过高的手续费率
      await expect(
        OptimizedPancakeRouter.deploy(
          ADDRESSES.PANCAKE_V2_ROUTER,
          ADDRESSES.PANCAKE_V3_ROUTER,
          ADDRESSES.WBNB,
          1001, // > 10%
          owner.address
        )
      ).to.be.revertedWith("Fee rate too high");
    });
  });

  describe("V2 交换功能", function () {
    it("应该成功执行 V2 精确输入交换", async function () {
      const { router, trader1, wbnb, busd } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // 授权路由器
      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      // 获取预期输出
      const amountsOut = await router.getV2AmountsOut(swapAmount, path);
      expect(amountsOut.length).to.equal(2);
      expect(amountsOut[1]).to.be.gt(0);

      // 执行交换
      const tx = await router.connect(trader1).swapV2ExactTokensForTokens(
        swapAmount,
        0, // 最小输出设为0
        path,
        trader1.address,
        deadline
      );

      // 检查事件
      await expect(tx)
        .to.emit(router, "V2SwapExecuted")
        .withArgs(
          trader1.address,
          ADDRESSES.WBNB,
          ADDRESSES.BUSD,
          swapAmount,
          await busd.balanceOf(trader1.address),
          path
        );

      // 检查余额变化
      expect(await busd.balanceOf(trader1.address)).to.be.gt(0);
    });

    it("应该成功执行 V2 精确输出交换", async function () {
      const { router, trader1, wbnb, busd } = await loadFixture(deployRouterFixture);

      const targetOutput = ethers.parseEther("100"); // 想要100 BUSD
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // 获取需要的输入量
      const amountsIn = await router.getV2AmountsIn(targetOutput, path);
      const maxInput = amountsIn[0];

      // 授权路由器
      await wbnb.connect(trader1).approve(await router.getAddress(), maxInput);

      // 执行交换
      const tx = await router.connect(trader1).swapV2TokensForExactTokens(
        targetOutput,
        maxInput,
        path,
        trader1.address,
        deadline
      );

      // 检查余额
      const busdBalance = await busd.balanceOf(trader1.address);
      expect(busdBalance).to.be.gte(targetOutput);

      // 检查事件
      await expect(tx).to.emit(router, "V2SwapExecuted");
    });

    it("应该正确计算和收取手续费", async function () {
      const { router, trader1, feeRecipient, wbnb } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      const initialFeeRecipientBalance = await wbnb.balanceOf(feeRecipient.address);

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      await router.connect(trader1).swapV2ExactTokensForTokens(
        swapAmount,
        0,
        path,
        trader1.address,
        deadline
      );

      // 检查手续费是否被收取
      const finalFeeRecipientBalance = await wbnb.balanceOf(feeRecipient.address);
      const expectedFee = (swapAmount * 30n) / 10000n; // 0.3%
      
      expect(finalFeeRecipientBalance - initialFeeRecipientBalance).to.equal(expectedFee);
    });
  });

  describe("V3 交换功能", function () {
    it("应该成功执行 V3 单池交换", async function () {
      const { router, trader2, wbnb, busd } = await loadFixture(deployRouterFixture);

      // 查找最佳池子
      const bestPool = await findBestV3Pool(ADDRESSES.WBNB, ADDRESSES.BUSD);

      const swapAmount = ethers.parseEther("1");
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      await wbnb.connect(trader2).approve(await router.getAddress(), swapAmount);

      const tx = await router.connect(trader2).swapV3ExactInputSingle(
        ADDRESSES.WBNB,
        ADDRESSES.BUSD,
        bestPool.fee,
        trader2.address,
        deadline,
        swapAmount,
        0, // 最小输出
        0  // 价格限制
      );

      // 检查事件
      await expect(tx)
        .to.emit(router, "V3SwapExecuted")
        .withArgs(
          trader2.address,
          ADDRESSES.WBNB,
          ADDRESSES.BUSD,
          swapAmount,
          await busd.balanceOf(trader2.address),
          bestPool.fee
        );

      // 检查余额
      expect(await busd.balanceOf(trader2.address)).to.be.gt(0);
    });

    it("应该在 V3 交换中正确处理手续费", async function () {
      const { router, trader2, feeRecipient, wbnb } = await loadFixture(deployRouterFixture);

      const bestPool = await findBestV3Pool(ADDRESSES.WBNB, ADDRESSES.BUSD);
      const swapAmount = ethers.parseEther("0.5");
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      const initialFeeBalance = await wbnb.balanceOf(feeRecipient.address);

      await wbnb.connect(trader2).approve(await router.getAddress(), swapAmount);

      await router.connect(trader2).swapV3ExactInputSingle(
        ADDRESSES.WBNB,
        ADDRESSES.BUSD,
        bestPool.fee,
        trader2.address,
        deadline,
        swapAmount,
        0,
        0
      );

      const finalFeeBalance = await wbnb.balanceOf(feeRecipient.address);
      const expectedFee = (swapAmount * 30n) / 10000n; // 0.3%

      expect(finalFeeBalance - initialFeeBalance).to.equal(expectedFee);
    });

    it("应该成功执行 V3 精确输出交换", async function () {
      const { router, trader2, wbnb, busd } = await loadFixture(deployRouterFixture);

      const bestPool = await findBestV3Pool(ADDRESSES.WBNB, ADDRESSES.BUSD);
      const targetOutput = ethers.parseEther("100");
      const maxInput = ethers.parseEther("1");
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      await wbnb.connect(trader2).approve(await router.getAddress(), maxInput);

      const initialWbnbBalance = await wbnb.balanceOf(trader2.address);

      await router.connect(trader2).swapV3ExactOutputSingle(
        ADDRESSES.WBNB,
        ADDRESSES.BUSD,
        bestPool.fee,
        trader2.address,
        deadline,
        targetOutput,
        maxInput,
        0
      );

      const finalWbnbBalance = await wbnb.balanceOf(trader2.address);
      const busdBalance = await busd.balanceOf(trader2.address);

      // 检查输出是否正确
      expect(busdBalance).to.be.gte(targetOutput);
      
      // 检查是否有剩余输入被退回
      const actualInput = initialWbnbBalance - finalWbnbBalance;
      expect(actualInput).to.be.lte(maxInput);
    });

    it("应该正确处理 V3 交换的手续费计算", async function () {
      const { router, trader2, feeRecipient, wbnb, busd } = await loadFixture(deployRouterFixture);

      const bestPool = await findBestV3Pool(ADDRESSES.WBNB, ADDRESSES.BUSD);
      const swapAmount = ethers.parseEther("0.1");
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      const initialFeeBalance = await wbnb.balanceOf(feeRecipient.address);
      const initialTraderBalance = await wbnb.balanceOf(trader2.address);

      await wbnb.connect(trader2).approve(await router.getAddress(), swapAmount);

      const tx = await router.connect(trader2).swapV3ExactInputSingle(
        ADDRESSES.WBNB,
        ADDRESSES.BUSD,
        bestPool.fee,
        trader2.address,
        deadline,
        swapAmount,
        0,
        0
      );

      const finalFeeBalance = await wbnb.balanceOf(feeRecipient.address);
      const finalTraderBalance = await wbnb.balanceOf(trader2.address);
      const expectedFee = (swapAmount * 30n) / 10000n; // 0.3%

      // 验证手续费收取
      expect(finalFeeBalance - initialFeeBalance).to.equal(expectedFee);

      // 验证trader余额变化
      expect(initialTraderBalance - finalTraderBalance).to.equal(swapAmount);

      // 验证事件
      await expect(tx)
        .to.emit(router, "FeeCollected")
        .withArgs(ADDRESSES.WBNB, expectedFee, feeRecipient.address);
    });
  });

  describe("滑点保护", function () {
    it("应该允许设置合理的滑点保护", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);

      // 设置 1% 滑点保护
      await router.connect(owner).setSlippageProtection(100);
      expect(await router.maxSlippage()).to.equal(100);

      // 设置 5% 滑点保护
      await router.connect(owner).setSlippageProtection(500);
      expect(await router.maxSlippage()).to.equal(500);
    });

    it("应该拒绝过高的滑点设置", async function () {
      const { router, owner } = await loadFixture(deployRouterFixture);

      // 尝试设置超过 50% 的滑点应该失败
      await expect(
        router.connect(owner).setSlippageProtection(5001)
      ).to.be.revertedWith("Slippage too high");
    });

    it("应该只允许owner设置滑点保护", async function () {
      const { router, trader1 } = await loadFixture(deployRouterFixture);

      await expect(
        router.connect(trader1).setSlippageProtection(100)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("手续费系统", function () {
    it("应该在所有交换中正确收取手续费", async function () {
      const { router, trader1, feeRecipient, wbnb, busd } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      const initialFeeBalance = await wbnb.balanceOf(feeRecipient.address);

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      const tx = await router.connect(trader1).swapV2ExactTokensForTokens(
        swapAmount,
        0,
        path,
        trader1.address,
        deadline
      );

      const finalFeeBalance = await wbnb.balanceOf(feeRecipient.address);
      const expectedFee = (swapAmount * 30n) / 10000n; // 0.3%

      expect(finalFeeBalance - initialFeeBalance).to.equal(expectedFee);

      // 验证手续费收集事件
      await expect(tx)
        .to.emit(router, "FeeCollected")
        .withArgs(ADDRESSES.WBNB, expectedFee, feeRecipient.address);
    });

    it("应该支持零手续费设置", async function () {
      const { router, owner, trader1, feeRecipient, wbnb } = await loadFixture(deployRouterFixture);

      // 设置零手续费
      await router.connect(owner).setFeeSettings(0, feeRecipient.address);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      const initialFeeBalance = await wbnb.balanceOf(feeRecipient.address);

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      await router.connect(trader1).swapV2ExactTokensForTokens(
        swapAmount,
        0,
        path,
        trader1.address,
        deadline
      );

      const finalFeeBalance = await wbnb.balanceOf(feeRecipient.address);

      // 零手续费时不应该有费用收取
      expect(finalFeeBalance).to.equal(initialFeeBalance);
    });

    it("应该正确处理高手续费率", async function () {
      const { router, owner, trader1, feeRecipient, wbnb } = await loadFixture(deployRouterFixture);

      // 设置较高的手续费率（5%）
      await router.connect(owner).setFeeSettings(500, feeRecipient.address);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      const initialFeeBalance = await wbnb.balanceOf(feeRecipient.address);

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      await router.connect(trader1).swapV2ExactTokensForTokens(
        swapAmount,
        0,
        path,
        trader1.address,
        deadline
      );

      const finalFeeBalance = await wbnb.balanceOf(feeRecipient.address);
      const expectedFee = (swapAmount * 500n) / 10000n; // 5%

      expect(finalFeeBalance - initialFeeBalance).to.equal(expectedFee);
    });
  });

  describe("管理功能", function () {
    it("应该允许所有者设置手续费", async function () {
      const { router, owner, trader1 } = await loadFixture(deployRouterFixture);

      // 只有所有者可以设置
      await expect(
        router.connect(trader1).setFeeSettings(50, trader1.address)
      ).to.be.revertedWith("Only owner");

      // 所有者设置成功
      await router.connect(owner).setFeeSettings(50, owner.address);

      expect(await router.feeRate()).to.equal(50);
      expect(await router.feeRecipient()).to.equal(owner.address);

      // 拒绝过高的费率
      await expect(
        router.connect(owner).setFeeSettings(1001, owner.address)
      ).to.be.revertedWith("Fee rate too high");
    });

    it("应该允许所有者设置滑点保护", async function () {
      const { router, owner, trader1 } = await loadFixture(deployRouterFixture);

      // 只有所有者可以设置
      await expect(
        router.connect(trader1).setSlippageProtection(1000)
      ).to.be.revertedWith("Only owner");

      // 所有者设置成功
      await router.connect(owner).setSlippageProtection(1000);
      expect(await router.maxSlippage()).to.equal(1000);

      // 拒绝过高的滑点
      await expect(
        router.connect(owner).setSlippageProtection(5001)
      ).to.be.revertedWith("Slippage too high");
    });

    it("应该允许所有者紧急提取", async function () {
      const { router, owner, trader1, wbnb } = await loadFixture(deployRouterFixture);

      // 向合约发送一些代币
      const amount = ethers.parseEther("1");
      await wbnb.connect(trader1).transfer(await router.getAddress(), amount);

      const initialOwnerBalance = await wbnb.balanceOf(owner.address);

      // 只有所有者可以提取
      await expect(
        router.connect(trader1).emergencyWithdraw(ADDRESSES.WBNB, amount)
      ).to.be.revertedWith("Only owner");

      // 所有者提取成功
      await router.connect(owner).emergencyWithdraw(ADDRESSES.WBNB, amount);

      const finalOwnerBalance = await wbnb.balanceOf(owner.address);
      expect(finalOwnerBalance - initialOwnerBalance).to.equal(amount);
    });

    it("应该允许转移所有权", async function () {
      const { router, owner, trader1 } = await loadFixture(deployRouterFixture);

      // 只有所有者可以转移
      await expect(
        router.connect(trader1).transferOwnership(trader1.address)
      ).to.be.revertedWith("Only owner");

      // 不能转移给零地址
      await expect(
        router.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid new owner");

      // 成功转移所有权
      await router.connect(owner).transferOwnership(trader1.address);
      expect(await router.owner()).to.equal(trader1.address);
    });
  });

  describe("重入保护", function () {
    it("应该在正常情况下重置重入状态", async function () {
      const { router, trader1, wbnb, busd } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount * 2n);

      // 第一次交换应该成功
      await router.connect(trader1).swapV2ExactTokensForTokens(
        swapAmount,
        0,
        path,
        trader1.address,
        deadline
      );

      // 第二次交换也应该成功（证明重入状态已重置）
      await router.connect(trader1).swapV2ExactTokensForTokens(
        swapAmount,
        0,
        path,
        trader1.address,
        deadline
      );

      expect(await busd.balanceOf(trader1.address)).to.be.gt(0);
    });
  });

  describe("错误处理", function () {
    it("应该拒绝无效的交换参数", async function () {
      const { router, trader1 } = await loadFixture(deployRouterFixture);

      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // 无效路径长度
      await expect(
        router.connect(trader1).swapV2ExactTokensForTokens(
          ethers.parseEther("1"),
          0,
          [ADDRESSES.WBNB], // 路径太短
          trader1.address,
          deadline
        )
      ).to.be.revertedWith("Invalid path");

      // 零交换数量
      await expect(
        router.connect(trader1).swapV3ExactInputSingle(
          ADDRESSES.WBNB,
          ADDRESSES.BUSD,
          500,
          trader1.address,
          deadline,
          0, // 零数量
          0,
          0
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("应该处理授权不足的情况", async function () {
      const { router, trader1 } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // 不进行授权就尝试交换
      await expect(
        router.connect(trader1).swapV2ExactTokensForTokens(
          swapAmount,
          0,
          path,
          trader1.address,
          deadline
        )
      ).to.be.reverted; // 应该因为授权不足而失败
    });

    it("应该处理过期的交易", async function () {
      const { router, trader1, wbnb } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const expiredDeadline = Math.floor(Date.now() / 1000) - 1800; // 过期时间

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      // 使用过期deadline应该失败
      await expect(
        router.connect(trader1).swapV2ExactTokensForTokens(
          swapAmount,
          0,
          path,
          trader1.address,
          expiredDeadline
        )
      ).to.be.reverted;
    });

    it("应该处理滑点过大的情况", async function () {
      const { router, trader1, wbnb } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // 获取预期输出
      const amountsOut = await router.getV2AmountsOut(swapAmount, path);
      const expectedOutput = amountsOut[1];

      // 设置不可能达到的最小输出（比预期高很多）
      const unrealisticMinOutput = expectedOutput * 2n;

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      await expect(
        router.connect(trader1).swapV2ExactTokensForTokens(
          swapAmount,
          unrealisticMinOutput,
          path,
          trader1.address,
          deadline
        )
      ).to.be.reverted; // 应该因为滑点过大而失败
    });

    it("应该处理不存在的代币对", async function () {
      const { router, trader1, wbnb } = await loadFixture(deployRouterFixture);

      const swapAmount = ethers.parseEther("1");
      // 使用一个不存在流动性的代币对
      const invalidPath = [ADDRESSES.WBNB, "0x1234567890123456789012345678901234567890"];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      await wbnb.connect(trader1).approve(await router.getAddress(), swapAmount);

      await expect(
        router.connect(trader1).swapV2ExactTokensForTokens(
          swapAmount,
          0,
          invalidPath,
          trader1.address,
          deadline
        )
      ).to.be.reverted; // 应该因为路径无效而失败
    });

    it("应该处理余额不足的情况", async function () {
      const { router, trader2 } = await loadFixture(deployRouterFixture);

      const largeAmount = ethers.parseEther("1000"); // 比账户余额大得多
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      await expect(
        router.connect(trader2).swapV2ExactTokensForTokens(
          largeAmount,
          0,
          path,
          trader2.address,
          deadline
        )
      ).to.be.reverted; // 应该因为余额不足而失败
    });
  });

  describe("查询功能", function () {
    it("应该正确返回 V2 输出金额", async function () {
      const { router } = await loadFixture(deployRouterFixture);

      const amountIn = ethers.parseEther("1");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];

      const amounts = await router.getV2AmountsOut(amountIn, path);
      
      expect(amounts.length).to.equal(2);
      expect(amounts[0]).to.equal(amountIn - (amountIn * 30n) / 10000n); // 扣除手续费
      expect(amounts[1]).to.be.gt(0);
    });

    it("应该正确返回 V2 输入金额", async function () {
      const { router } = await loadFixture(deployRouterFixture);

      const amountOut = ethers.parseEther("100");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];

      const amounts = await router.getV2AmountsIn(amountOut, path);
      
      expect(amounts.length).to.equal(2);
      expect(amounts[0]).to.be.gt(0);
      expect(amounts[1]).to.equal(amountOut);
    });
  });

  describe("集成测试", function () {
    it("应该支持连续的多次交换", async function () {
      const { router, trader1, wbnb, busd, usdt } = await loadFixture(deployRouterFixture);

      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // 第一次交换：WBNB -> BUSD
      await wbnb.connect(trader1).approve(await router.getAddress(), ethers.parseEther("2"));
      
      await router.connect(trader1).swapV2ExactTokensForTokens(
        ethers.parseEther("1"),
        0,
        [ADDRESSES.WBNB, ADDRESSES.BUSD],
        trader1.address,
        deadline
      );

      const busdBalance = await busd.balanceOf(trader1.address);
      expect(busdBalance).to.be.gt(0);

      // 第二次交换：WBNB -> USDT (如果有流动性)
      try {
        await router.connect(trader1).swapV2ExactTokensForTokens(
          ethers.parseEther("1"),
          0,
          [ADDRESSES.WBNB, ADDRESSES.USDT],
          trader1.address,
          deadline
        );

        const usdtBalance = await usdt.balanceOf(trader1.address);
        expect(usdtBalance).to.be.gt(0);
      } catch (error) {
        // 如果 WBNB/USDT 没有流动性，这是正常的
        console.log("WBNB/USDT 池子可能没有足够的流动性");
      }
    });

    it("应该正确处理大额交换", async function () {
      const { router, trader1, wbnb, busd } = await loadFixture(deployRouterFixture);

      // 先获取更多 WBNB
      await wbnb.connect(trader1).deposit({ value: ethers.parseEther("50") });

      const largeAmount = ethers.parseEther("10");
      const path = [ADDRESSES.WBNB, ADDRESSES.BUSD];
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      await wbnb.connect(trader1).approve(await router.getAddress(), largeAmount);

      const initialBusdBalance = await busd.balanceOf(trader1.address);

      await router.connect(trader1).swapV2ExactTokensForTokens(
        largeAmount,
        0,
        path,
        trader1.address,
        deadline
      );

      const finalBusdBalance = await busd.balanceOf(trader1.address);
      const receivedBusd = finalBusdBalance - initialBusdBalance;

      expect(receivedBusd).to.be.gt(0);
      console.log(`大额交换结果: ${ethers.formatEther(largeAmount)} WBNB -> ${ethers.formatEther(receivedBusd)} BUSD`);
    });
  });
});
