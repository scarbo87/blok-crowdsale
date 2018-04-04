import expectRevert from './helpers/expectRevert';

const BlokToken = artifacts.require('../contracts/BlokToken.sol');

contract('BlokToken', (accounts) => {
    let token;

    let owner = accounts[0];
    let spender = accounts[1];
    let to1 = accounts[2];
    let to2 = accounts[3];
    let to3 = accounts[4];

    let allowedAmount = 100;  // Spender allowance
    let transferredFunds = 1200;  // Funds to be transferred around in tests

    beforeEach(async () => {
        token = await BlokToken.new();
    });

    describe('construction', async () => {
        it('should be ownable', async () => {
            assert.equal(await token.owner(), owner);
        });

        it('should return correct name after construction', async () => {
            assert.equal(await token.name(), 'Blok');
        });

        it('should return correct symbol after construction', async () => {
            assert.equal(await token.symbol(), 'BLO');
        });

        it('should return correct decimal points after construction', async () => {
            assert.equal(await token.decimals(), 18);
        });

        it('should have minting mode turned on', async () => {
            assert(await token.isMinting());
        });
    });

    describe('minting', async () => {
        it('should update balances correctly after minting', async () => {
            assert.equal((await token.balanceOf(owner)).toNumber(), 0);

            await token.mint(to1, transferredFunds)

            // Checking owner balance stays on 0 since minting happens for
            // other accounts.
            assert.equal((await token.balanceOf(owner)).toNumber(), 0);
            assert.equal((await token.balanceOf(to1)).toNumber(), transferredFunds);

            await token.mint(to2, transferredFunds)
            assert.equal((await token.balanceOf(to2)).toNumber(), transferredFunds);

            await token.mint(to3, transferredFunds)
            assert.equal((await token.balanceOf(to3)).toNumber(), transferredFunds);

            assert.equal((await token.balanceOf(owner)).toNumber(), 0);
        });

        it('should update totalSupply correctly after minting', async () => {
            assert.equal((await token.totalSupply()).toNumber(), 0);

            await token.mint(to1, transferredFunds);
            assert.equal((await token.totalSupply()).toNumber(), transferredFunds);

            await token.mint(to1, transferredFunds);
            assert.equal((await token.totalSupply()).toNumber(), transferredFunds * 2);

            await token.mint(to2, transferredFunds);
            assert.equal((await token.totalSupply()).toNumber(), transferredFunds * 3);
        });

        it('should end minting', async () => {
            await token.endMinting();
            assert.isFalse(await token.isMinting());
        });

        it('should allow to end minting more than once', async () => {
            await token.endMinting();
            await token.endMinting();
            await token.endMinting();
        });

        it('should not allow to mint after minting has ended', async () => {
            await token.endMinting();
            await expectRevert(token.mint(to1, transferredFunds));
        });

        it('should not allow approve() before minting has ended', async () => {
            await expectRevert(token.approve(spender, allowedAmount));
        });

        it('should allow approve() after minting has ended', async () => {
            await token.endMinting();
            await token.approve(spender, allowedAmount)
        });

        it('should not allow transfer() before minting has ended', async () => {
            await expectRevert(token.transfer(spender, allowedAmount));
        });

        it('should allow transfer() after minting has ended', async () => {
            await token.mint(owner, transferredFunds);
            await token.endMinting();
            await token.transfer(to1, transferredFunds);
        });

        it('should not allow transferFrom() before minting has ended', async () => {
            await expectRevert(token.transferFrom(owner, to1, allowedAmount, {from: spender}));
        });

        it('should allow transferFrom() after minting has ended', async () => {
            await token.mint(owner, transferredFunds);
            await token.endMinting();
            await token.approve(spender, allowedAmount)
            await token.transferFrom(owner, to1, allowedAmount, {from: spender})
        });
    });

    describe('events', async () => {
        it('should log mint event after minting', async () => {
            let result = await token.mint(to1, transferredFunds);

            assert.lengthOf(result.logs, 1);
            let event = result.logs[0];
            assert.equal(event.event, 'Transfer');
            assert.equal(event.args.from, 0);
            assert.equal(event.args.to, to1);
            assert.equal(Number(event.args.value), transferredFunds);
        });

        it('should log minting ended event after minting has ended', async () => {
            let result = await token.endMinting();

            assert.lengthOf(result.logs, 1);
            assert.equal(result.logs[0].event, 'MintingEnded');

            // Additional calls should not emit events.
            result = await token.endMinting();
            assert.equal(result.logs.length, 0);
            result = await token.endMinting();
            assert.equal(result.logs.length, 0);
        });
    });
});
