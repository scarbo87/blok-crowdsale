pragma solidity ^0.4.21;

import './ERC20.sol';
import './Ownable.sol';

/// @title Token holder contract.
contract TokenHolder is Ownable {
    /// @dev Allow the owner to transfer out any accidentally sent ERC20 tokens.
    /// @param _tokenAddress address The address of the ERC20 contract.
    /// @param _amount uint256 The amount of tokens to be transferred.
    function transferAnyERC20Token(address _tokenAddress, uint256 _amount) onlyOwner public returns (bool success) {
        return ERC20(_tokenAddress).transfer(owner, _amount);
    }
}
