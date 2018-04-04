const SafeMath = artifacts.require('./SafeMath.sol');
const Ownable = artifacts.require('./Ownable.sol');
const TokenHolder = artifacts.require('./TokenHolder.sol');
const BlokToken = artifacts.require('./BlokToken.sol');
const VestingTrustee = artifacts.require('./VestingTrustee.sol');
const ERC20 = artifacts.require('./ERC20.sol');
const BasicToken = artifacts.require('./BasicToken.sol');

const BlokTokenSale = artifacts.require('./BlokTokenSale.sol');

module.exports = (deployer) => {
    deployer.deploy(SafeMath);
    deployer.deploy(Ownable);

    deployer.link(SafeMath, BasicToken);

    deployer.deploy(BasicToken);

    deployer.link(Ownable, TokenHolder);

    deployer.deploy(TokenHolder);

    deployer.link(Ownable, BlokToken);
    deployer.link(SafeMath, BlokToken);
    deployer.link(BasicToken, BlokToken);
    deployer.link(TokenHolder, BlokToken);

    deployer.deploy(BlokToken).then(function() {
        return deployer.deploy(VestingTrustee, BlokToken.address);
    });

    deployer.link(Ownable, VestingTrustee);
    deployer.link(SafeMath, VestingTrustee);
    deployer.link(BlokToken, VestingTrustee);

    deployer.link(SafeMath, BlokTokenSale);
    deployer.link(Ownable, BlokTokenSale);
    deployer.link(TokenHolder, BlokTokenSale);
    deployer.link(VestingTrustee, BlokTokenSale);

    deployer.deploy(BlokTokenSale, "0xf354e8d1030168D32D94435Fc23De1fD6B46840f", 1523318400);
};
