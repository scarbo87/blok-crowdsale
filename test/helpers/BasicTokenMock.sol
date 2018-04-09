pragma solidity ^0.4.21;

import '../../contracts/BasicToken.sol';

contract BasicTokenMock is BasicToken {
    function assign(address _account, uint _balance) public {
        balances[_account] = _balance;
    }
}
