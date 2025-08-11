// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IPancakeRouterV2 {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external payable;
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external;
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external;
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory);
}

interface IPancakeRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut);
}

contract OptimizedPancakeRouter {
    address public owner;
    uint256 public feeRate; // 例如 30 = 0.3%
    address public feeRecipient;
    IPancakeRouterV2 public routerV2;
    IPancakeRouterV3 public routerV3;

    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

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

    constructor(address _routerV2, address _routerV3, uint256 _feeRate, address _feeRecipient) {
        owner = msg.sender;
        routerV2 = IPancakeRouterV2(_routerV2);
        routerV3 = IPancakeRouterV3(_routerV3);
        feeRate = _feeRate;
        feeRecipient = _feeRecipient;
        _status = _NOT_ENTERED;
    }

    function setFee(uint256 _feeRate, address _feeRecipient) external onlyOwner {
        require(_feeRate <= 1000, "Fee too high"); // 最大10%
        require(_feeRecipient != address(0), "Invalid recipient");
        feeRate = _feeRate;
        feeRecipient = _feeRecipient;
    }

    // V2: ETH -> Token
    function swapV2ExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external payable nonReentrant {
        require(path.length >= 2, "Invalid path");
        require(msg.value > 0, "No ETH sent");
        uint256 fee = (msg.value * feeRate) / 10000;
        uint256 swapAmount = msg.value - fee;
        if (fee > 0) payable(feeRecipient).transfer(fee);
        routerV2.swapExactETHForTokensSupportingFeeOnTransferTokens{value: swapAmount}(
            amountOutMin, path, to, deadline
        );
    }

    // V2: Token -> ETH
    function swapV2ExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external nonReentrant {
        require(path.length >= 2, "Invalid path");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 fee = (amountIn * feeRate) / 10000;
        uint256 swapAmount = amountIn - fee;
        if (fee > 0) IERC20(path[0]).transfer(feeRecipient, fee);
        IERC20(path[0]).approve(address(routerV2), swapAmount);
        routerV2.swapExactTokensForETHSupportingFeeOnTransferTokens(
            swapAmount, amountOutMin, path, to, deadline
        );
    }

    // V2: Token -> Token
    function swapV2ExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline
    ) external nonReentrant {
        require(path.length >= 2, "Invalid path");
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 fee = (amountIn * feeRate) / 10000;
        uint256 swapAmount = amountIn - fee;
        if (fee > 0) IERC20(path[0]).transfer(feeRecipient, fee);
        IERC20(path[0]).approve(address(routerV2), swapAmount);
        routerV2.swapExactTokensForTokensSupportingFeeOnTransferTokens(
            swapAmount, amountOutMin, path, to, deadline
        );
    }

    // V3: TokenIn -> TokenOut
    function swapV3ExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external payable nonReentrant returns (uint256 amountOut) {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint256 feeAmount = (amountIn * feeRate) / 10000;
        uint256 swapAmount = amountIn - feeAmount;
        if (feeAmount > 0) IERC20(tokenIn).transfer(feeRecipient, feeAmount);
        IERC20(tokenIn).approve(address(routerV3), swapAmount);
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
        amountOut = routerV3.exactInputSingle(params);
    }

    // V3报价
    function quoteV3ExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut) {
        amountOut = routerV3.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, sqrtPriceLimitX96);
    }

    // V2报价
    function getV2AmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts) {
        uint256 swapAmount = amountIn;
        if (feeRate > 0) {
            swapAmount = amountIn - (amountIn * feeRate) / 10000;
        }
        return routerV2.getAmountsOut(swapAmount, path);
    }

    // 管理
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }
}
