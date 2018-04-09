pragma solidity ^0.4.21;

import '../../contracts/BlokTokenSale.sol';

contract BlokTokenSaleMock is BlokTokenSale {
    function BlokTokenSaleMock(address _fundingRecipient, uint256 _startTime) public
        BlokTokenSale(_fundingRecipient, _startTime) {
    }

    function setTokensSold(uint256 _tokensSold) public {
  	    tokensSold = _tokensSold;
    }

    /// @dev Web3 helpers functions.
    function getTokenGranteesLength() constant external returns (uint256) {
        return tokenGrantees.length;
    }
}
