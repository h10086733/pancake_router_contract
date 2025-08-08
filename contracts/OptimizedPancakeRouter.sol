// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IPancakeInterfaces.sol";

/**
 * @title OptimizedPancakeRouter
 * @dev 优化的PancakeSwap路由器包装器，独立的V2/V3交换方法
 */
contract OptimizedPancakeRouter {
    
    // ============ 状态变量 ============
    
    address public owner;
    address public immutable WETH;
    
    IPancakeRouterV2 public immutable pancakeRouterV2;
    IPancakeRouterV3 public immutable pancakeRouterV3;
    
    // 手续费相关
    uint256 public feeRate; // 基点，例如30表示0.3%
    address public feeRecipient;
    
    // 滑点保护
    uint256 public maxSlippage = 500; // 最大滑点 5%（基点）
    
    // 重入保护
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;
    
    // ============ 事件 ============
    
    event V2SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address[] path
    );
    
    event V3SwapExecuted(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint24 fee
    );
    
    event FeeCollected(
        address indexed token,
        uint256 amount,
        address indexed recipient
    );
    
    event FeeSettingsUpdated(
        uint256 newFeeRate,
        address indexed newRecipient
    );
    
    event SlippageProtectionUpdated(
        uint256 newMaxSlippage
    );
    
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    
    // ============ 修饰符 ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
    
    // ============ 构造函数 ============
    
    constructor(
        address _pancakeRouterV2,
        address _pancakeRouterV3,
        address _weth,
        uint256 _feeRate,
        address _feeRecipient
    ) {
        require(_pancakeRouterV2 != address(0), "Invalid V2 router");
        require(_pancakeRouterV3 != address(0), "Invalid V3 router");
        require(_weth != address(0), "Invalid WETH");
        require(_feeRate <= 1000, "Fee rate too high"); // 最大10%
        require(_feeRecipient != address(0), "Invalid fee recipient");
        
        owner = msg.sender;
        pancakeRouterV2 = IPancakeRouterV2(_pancakeRouterV2);
        pancakeRouterV3 = IPancakeRouterV3(_pancakeRouterV3);
        WETH = _weth;
        feeRate = _feeRate;
        feeRecipient = _feeRecipient;
        
        _status = _NOT_ENTERED;
    }
    
    // ============ V2 交换方法 ============
    
    /**
     * @dev V2精确输入交换
     */
    function swapV2ExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        require(amountIn > 0, "Amount must be greater than 0");
        require(to != address(0), "Invalid recipient");
        require(deadline >= block.timestamp, "Transaction expired");
        
        // 转入代币
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        // 计算手续费
        uint256 feeAmount = (amountIn * feeRate) / 10000;
        uint256 swapAmount = amountIn - feeAmount;
        
        // 授权路由器
        IERC20(path[0]).approve(address(pancakeRouterV2), swapAmount);
        
        // 执行V2交换
        amounts = pancakeRouterV2.swapExactTokensForTokens(
            swapAmount,
            amountOutMin,
            path,
            to,
            deadline
        );
        
        // 清理授权
        IERC20(path[0]).approve(address(pancakeRouterV2), 0);
        
        // 收取手续费
        if (feeAmount > 0) {
            IERC20(path[0]).transfer(feeRecipient, feeAmount);
            emit FeeCollected(path[0], feeAmount, feeRecipient);
        }
        
        emit V2SwapExecuted(
            msg.sender,
            path[0],
            path[path.length - 1],
            amountIn,
            amounts[amounts.length - 1],
            path
        );
    }
    
    /**
     * @dev V2精确输出交换
     */
    function swapV2TokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant returns (uint256[] memory amounts) {
        require(path.length >= 2, "Invalid path");
        require(amountOut > 0, "Amount must be greater than 0");
        require(to != address(0), "Invalid recipient");
        require(deadline >= block.timestamp, "Transaction expired");
        
        // 获取所需输入量
        uint256[] memory amountsRequired = pancakeRouterV2.getAmountsIn(amountOut, path);
        
        // 计算包含手续费的总输入量
        uint256 totalAmountIn = (amountsRequired[0] * 10000) / (10000 - feeRate);
        require(totalAmountIn <= amountInMax, "Excessive input amount");
        
        // 转入代币
        IERC20(path[0]).transferFrom(msg.sender, address(this), totalAmountIn);
        
        // 授权路由器
        IERC20(path[0]).approve(address(pancakeRouterV2), amountsRequired[0]);
        
        // 执行V2交换
        amounts = pancakeRouterV2.swapTokensForExactTokens(
            amountOut,
            amountsRequired[0],
            path,
            to,
            deadline
        );
        
        // 清理授权
        IERC20(path[0]).approve(address(pancakeRouterV2), 0);
        
        // 收取手续费
        uint256 feeAmount = totalAmountIn - amountsRequired[0];
        if (feeAmount > 0) {
            IERC20(path[0]).transfer(feeRecipient, feeAmount);
            emit FeeCollected(path[0], feeAmount, feeRecipient);
        }
        
        emit V2SwapExecuted(
            msg.sender,
            path[0],
            path[path.length - 1],
            totalAmountIn,
            amountOut,
            path
        );
    }
    
    /**
     * @dev 获取V2输出金额
     */
    function getV2AmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        // 扣除手续费后的实际交换金额
        uint256 swapAmount = amountIn - (amountIn * feeRate) / 10000;
        return pancakeRouterV2.getAmountsOut(swapAmount, path);
    }
    
    /**
     * @dev 获取V2输入金额
     */
    function getV2AmountsIn(uint256 amountOut, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        uint256[] memory baseAmounts = pancakeRouterV2.getAmountsIn(amountOut, path);
        // 加上手续费
        baseAmounts[0] = (baseAmounts[0] * 10000) / (10000 - feeRate);
        return baseAmounts;
    }
    
    // ============ V3 交换方法 ============
    
    /**
     * @dev V3精确输入单一交换
     */
    function swapV3ExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external nonReentrant returns (uint256 amountOut) {
        require(amountIn > 0, "Amount must be greater than 0");
        require(tokenIn != address(0) && tokenOut != address(0), "Invalid token");
        require(recipient != address(0), "Invalid recipient");
        require(deadline >= block.timestamp, "Transaction expired");
        
        // 转入代币
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // 计算手续费
        uint256 feeAmount = (amountIn * feeRate) / 10000;
        uint256 swapAmount = amountIn - feeAmount;
        
        // 授权路由器
        IERC20(tokenIn).approve(address(pancakeRouterV3), swapAmount);
        
        // 构建V3交换参数
        IPancakeRouterV3.ExactInputSingleParams memory params = IPancakeRouterV3.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: recipient,
            deadline: deadline,
            amountIn: swapAmount,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: sqrtPriceLimitX96
        });
        
        // 执行V3交换
        amountOut = pancakeRouterV3.exactInputSingle(params);
        
        // 清理授权
        IERC20(tokenIn).approve(address(pancakeRouterV3), 0);
        
        // 收取手续费
        if (feeAmount > 0) {
            IERC20(tokenIn).transfer(feeRecipient, feeAmount);
            emit FeeCollected(tokenIn, feeAmount, feeRecipient);
        }
        
        emit V3SwapExecuted(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            fee
        );
    }
    
    /**
     * @dev V3精确输出单一交换
     */
    function swapV3ExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 deadline,
        uint256 amountOut,
        uint256 amountInMaximum,
        uint160 sqrtPriceLimitX96
    ) external nonReentrant returns (uint256 amountIn) {
        require(amountOut > 0, "Amount must be greater than 0");
        require(tokenIn != address(0) && tokenOut != address(0), "Invalid token");
        require(recipient != address(0), "Invalid recipient");
        require(deadline >= block.timestamp, "Transaction expired");
        
        // 转入最大代币数量
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountInMaximum);
        
        // 授权路由器
        IERC20(tokenIn).approve(address(pancakeRouterV3), amountInMaximum);
        
        // 执行V3交换
        amountIn = pancakeRouterV3.exactOutputSingle(
            IPancakeRouterV3.ExactOutputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient,
                deadline: deadline,
                amountOut: amountOut,
                amountInMaximum: amountInMaximum,
                sqrtPriceLimitX96: sqrtPriceLimitX96
            })
        );
        
        // 清理授权
        IERC20(tokenIn).approve(address(pancakeRouterV3), 0);
        
        // 计算费用并处理退款
        _handleOutputSwapFees(tokenIn, amountIn, amountInMaximum);
        
        emit V3SwapExecuted(msg.sender, tokenIn, tokenOut, amountIn, amountOut, fee);
    }
    
    // ============ 管理方法 ============
    
    /**
     * @dev 设置费用参数
     */
    function setFeeSettings(uint256 _feeRate, address _feeRecipient) external onlyOwner {
        require(_feeRate <= 1000, "Fee rate too high"); // 最大10%
        require(_feeRecipient != address(0), "Invalid recipient");
        feeRate = _feeRate;
        feeRecipient = _feeRecipient;
        emit FeeSettingsUpdated(_feeRate, _feeRecipient);
    }
    
    /**
     * @dev 设置滑点保护
     */
    function setSlippageProtection(uint256 _maxSlippage) external onlyOwner {
        require(_maxSlippage <= 5000, "Slippage too high"); // 最大50%
        maxSlippage = _maxSlippage;
        emit SlippageProtectionUpdated(_maxSlippage);
    }
    
    /**
     * @dev 紧急提取代币
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            require(address(this).balance >= amount, "Insufficient ETH balance");
            payable(owner).transfer(amount);
        } else {
            require(IERC20(token).balanceOf(address(this)) >= amount, "Insufficient token balance");
            IERC20(token).transfer(owner, amount);
        }
    }
    
    /**
     * @dev 转移所有权
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
    
    // ============ 辅助方法 ============
    
    /**
     * @dev 处理输出交换的费用和退款
     */
    function _handleOutputSwapFees(
        address tokenIn,
        uint256 amountIn,
        uint256 amountInMaximum
    ) internal {
        // 计算手续费（基于实际使用的金额）
        uint256 feeAmount = (amountIn * feeRate) / 10000;
        uint256 totalUsed = amountIn + feeAmount;
        
        require(totalUsed <= amountInMaximum, "Excessive input amount");
        
        // 收取手续费
        if (feeAmount > 0) {
            IERC20(tokenIn).transfer(feeRecipient, feeAmount);
            emit FeeCollected(tokenIn, feeAmount, feeRecipient);
        }
        
        // 退还多余代币
        uint256 refund = amountInMaximum - totalUsed;
        if (refund > 0) {
            IERC20(tokenIn).transfer(msg.sender, refund);
        }
    }
    
    /**
     * @dev 检查滑点
     */
    function _checkSlippage(uint256 amountOut, uint256 expectedOut) internal view {
        if (expectedOut > 0) {
            uint256 slippage = ((expectedOut - amountOut) * 10000) / expectedOut;
            require(slippage <= maxSlippage, "Slippage too high");
        }
    }
    
    // ============ 接收ETH ============
    
    receive() external payable {}
}
