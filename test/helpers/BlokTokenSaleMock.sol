pragma solidity ^0.4.15;

import '../../contracts/BlokTokenSale.sol';

contract BlokTokenSaleMock is BlokTokenSale {
    function BlokTokenSaleMock(address _fundingRecipient, uint256 _startTime)
        BlokTokenSale(_fundingRecipient, _startTime) {
    }

    function setTokensSold(uint256 _tokensSold) {
  	    tokensSold = _tokensSold;
    }

    /// @dev Web3 helpers functions.
    function getTokenGranteesLength() external constant returns (uint256) {
        return tokenGrantees.length;
    }
}
