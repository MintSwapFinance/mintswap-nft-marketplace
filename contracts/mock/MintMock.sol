// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MintMock is ERC20("Mint Mock", "MM") {
    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}