import BigNumber from 'bignumber.js';
import _ from 'lodash';
import expectRevert from './helpers/expectRevert';
import time from './helpers/time';

const BlokToken = artifacts.require('../contracts/BlokToken.sol');
const BlokTokenSaleMock = artifacts.require('./helpers/BlokTokenSaleMock.sol');
const VestingTrustee = artifacts.require('../contracts/VestingTrustee.sol');

// Before tests are run, 10 accounts are created with 10M ETH assigned to each.
// see scripts/ dir for more information.
contract('BlokTokenSale', (accounts) => {
    const MINUTE = 60;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const YEAR = 365 * DAY;

    let DEFAULT_GAS_PRICE = new BigNumber(100000000000);
    let GAS_COST_ERROR = process.env['SOLIDITY_COVERAGE'] ? 30000000000000000 : 0;

    const TOKEN_UNIT = 10 ** 18;

    // Maximum number of tokens in circulation.
    const MAX_TOKENS = new BigNumber(10 ** 13).mul(TOKEN_UNIT);

    // Maximum tokens sold here.
    const MAX_TOKENS_SOLD = new BigNumber(234000000).mul(TOKEN_UNIT);

    const BLO_PER_WEI = 5700;

    const TIER_1_CAP = 20000 * TOKEN_UNIT;
    const TIER_2_CAP_BIGNUMBER = new BigNumber(2).pow(256).minus(1);

    const PERCENT_TOKENS = new BigNumber(360000000 * TOKEN_UNIT).div(100)

    const BLO_TOKEN_GRANTS = [
        {grantee: '0xA67E1c56A5e0363B61a23670FFC0FcD8F09f178d', value: 18 * PERCENT_TOKENS, startOffset: 0, cliffOffset: 0, endOffset: 10 * DAY, installmentLength: 1 * DAY, percentVested: 0},
        {grantee: '0x52aA6A62404107742ac01Ff247ED47b49b16c40A', value: 13 * PERCENT_TOKENS, startOffset: 0, cliffOffset: 0, endOffset: 10 * DAY, installmentLength: 1 * DAY, percentVested: 0},
        {grantee: '0xCf1e64Ce2740A03192F1d7a3234AABd88c025c4B', value: 4 * PERCENT_TOKENS, startOffset: 0, cliffOffset: 0, endOffset: 10 * DAY, installmentLength: 1 * DAY, percentVested: 0},
    ];

    const PRESALE_TOKEN_GRANTS = [
        {grantee: '0xebfbfbdb8cbef890e8ca0143b5d9ab3fe15056c8', value: 2 * TOKEN_UNIT, startOffset: 0, cliffOffset: 1 * YEAR, endOffset: 1 * YEAR, installmentLength: 1 * DAY, percentVested: 50},
        {grantee: '0x499d16bf3420f5d5d5fbdd9ca82ff863d505dcdd', value: 2 * TOKEN_UNIT, startOffset: 0, cliffOffset: 1 * YEAR, endOffset: 1 * YEAR, installmentLength: 1 * DAY, percentVested: 50},
        {grantee: '0x06767930c343a330f8f04680cd2e3f5568feaf0a', value: 1 * TOKEN_UNIT, startOffset: 0, cliffOffset: 1 * YEAR, endOffset: 1 * YEAR, installmentLength: 1 * DAY, percentVested: 50},
        {grantee: '0xf3bf7e748e954441bbbd4446062554f881bf89d5', value: 88235294100 * TOKEN_UNIT, startOffset: 0, cliffOffset: 1 * YEAR, endOffset: 1 * YEAR, installmentLength: 1 * DAY, percentVested: 50},
        {grantee: '0x1ed4304324baf24e826f267861bfbbad50228599', value: 4334 * TOKEN_UNIT, startOffset: 0, cliffOffset: 1 * YEAR, endOffset: 1 * YEAR, installmentLength: 1 * DAY, percentVested: 50},
        {grantee: '0x6f46cf5569aefa1acc1009290c8e043747172d89', value: 1473 * TOKEN_UNIT, startOffset: 0, cliffOffset: 1 * YEAR, endOffset: 1 * YEAR, installmentLength: 1 * DAY, percentVested: 50},
        {grantee: '0x90e63c3d53e0ea496845b7a03ec7548b70014a91', value: 6722 * TOKEN_UNIT, startOffset: 0, cliffOffset: 1 * YEAR, endOffset: 1 * YEAR, installmentLength: 1 * DAY, percentVested: 50}
    ];

    const GRANTS = BLO_TOKEN_GRANTS.concat(PRESALE_TOKEN_GRANTS);
    const MAX_TOKEN_GRANTEES = 100;
    const GRANT_BATCH_SIZE = 10;

    let now;

    const increaseTime = async (by) => {
        await time.increaseTime(by);
        now += by;
    };

    // Return a structured pre-sale grant for a specific address.
    const getTokenGrant = async (sale, address) => {
        let tokenGrant = await sale.tokenGrants(address);

        return {
            value: tokenGrant[0].toNumber(),
            startOffset: tokenGrant[1].toNumber(),
            cliffOffset: tokenGrant[2].toNumber(),
            endOffset: tokenGrant[3].toNumber(),
            installmentLength: tokenGrant[4].toNumber(),
            percentVested: tokenGrant[5].toNumber()
        };
    };

    // Return a structured vesting grant for a specific address.
    const getGrant = async (trustee, address) => {
        let grant = await trustee.grants(address);

        return {
            value: grant[0].toNumber(),
            start: grant[1].toNumber(),
            cliff: grant[2].toNumber(),
            end: grant[3].toNumber(),
            installmentLength: grant[4].toNumber(),
            transferred: grant[5].toNumber(),
            revokable: grant[6]
        };
    };

    const addPresaleTokenGrants = async (sale) => {
        for (let i = 0; i < PRESALE_TOKEN_GRANTS.length; ++i) {
            const grant = PRESALE_TOKEN_GRANTS[i];

            console.log(`\t[${i + 1} / ${PRESALE_TOKEN_GRANTS.length}] adding pre-sale grant for ${grant.grantee}...`);

            await sale.addTokenGrant(grant.grantee, grant.value);
        }

        assert.equal((await sale.getTokenGranteesLength()).toNumber(), GRANTS.length);
    };

    const grantTokens = async (sale, grants) => {
        let lastGrantedIndex = 0;
        while (lastGrantedIndex < grants.length) {
            console.log(`\tgranting token grants (lastGrantedIndex: ${lastGrantedIndex})...`);

            await sale.grantTokens();

            let endIndex = Math.min(lastGrantedIndex + GRANT_BATCH_SIZE, grants.length);
            lastGrantedIndex = (await sale.lastGrantedIndex()).toNumber();
            assert.equal(lastGrantedIndex, endIndex);
        }

        console.log(`\tfinished granting token grants (lastGrantedIndex: ${lastGrantedIndex})...`);
    };

    // Checks if token grants exists.
    const testTokenGrantExists = async (sale, presaleTokenGrant) => {
        // Make sure that the grant exists in the token grantees list.
        let tokenGrantee;
        let tokenGranteesLength = (await sale.getTokenGranteesLength()).toNumber();

        // Search for grantee in list.
        for (let i = 0; i < tokenGranteesLength; ++i) {
            let tempTokenGrantee = await sale.tokenGrantees(i);
            if (tempTokenGrantee.toLowerCase() === presaleTokenGrant.grantee.toLowerCase()) {
                tokenGrantee = tempTokenGrantee.toLowerCase();

                break;
            }
        }
        assert.equal(presaleTokenGrant.grantee.toLowerCase(), tokenGrantee);

        // Make sure that the grant exists in the token grants mapping.
        const tokenGrant = await getTokenGrant(sale, presaleTokenGrant.grantee);
        assert.deepEqual(_.omit(presaleTokenGrant, 'grantee'), tokenGrant);
    };

    // Delete a token grant and check
    const testDeleteTokenGrant = async (sale, presaleTokenGrant) => {
        // Make sure that the grant exists.
        await testTokenGrantExists(sale, presaleTokenGrant);

        // Delete the grant and then check that it no longer exists in the token grantees list.
        await sale.deleteTokenGrant(presaleTokenGrant.grantee);

        let tokenGranteesLength = (await sale.getTokenGranteesLength()).toNumber();
        for (let i = 0; i < tokenGranteesLength; ++i) {
            let tempTokenGrantee = await sale.tokenGrantees(i);
            if (tempTokenGrantee === presaleTokenGrant.grantee) {
                assert.fail(`Couldn't delete ${presaleTokenGrant.grantee} pre-sale grant!`);
            }
        }

        // Delete the grant and then check that it does no longer exist in the token grants mapping.
        const tokenGrant2 = await getTokenGrant(sale, presaleTokenGrant.grantee);
        assert.deepEqual(tokenGrant2, { value: 0, startOffset: 0, cliffOffset: 0, endOffset: 0, installmentLength: 0, percentVested: 0 });
    };

    // Get block timestamp.
    beforeEach(async () => {
        now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    });

    describe('construction', async () => {
        let fundRecipient = accounts[5];

        it('should not allow to initialize with null funding recipient address', async () => {
            await expectRevert(BlokTokenSaleMock.new(null, now + 100));
        });

        it('should not allow to initialize with 0 funding recipient address', async () => {
            await expectRevert(BlokTokenSaleMock.new(0, now + 100));
        });

        it('should be initialized with a future starting time', async () => {
            await expectRevert(BlokTokenSaleMock.new(fundRecipient, now - 100));
        });

        it('should be initialized with a derived ending time', async () => {
            let startTime = now + 100;
            let sale = await BlokTokenSaleMock.new(fundRecipient, startTime);

            assert.equal((await sale.endTime()).toNumber(), startTime + (await sale.SALE_DURATION()).toNumber());
        });

        it('should deploy the BlokToken contract and own it', async () => {
            let sale = await BlokTokenSaleMock.new(fundRecipient, now + 100);
            assert(await sale.blok() != 0);

            let token = BlokToken.at(await sale.blok());
            assert.equal(await token.owner(), sale.address);
        });

        it('should deploy the VestingTrustee contract and own it', async () => {
            let sale = await BlokTokenSaleMock.new(fundRecipient, now + 100);
            let token = BlokToken.at(await sale.blok());

            let trustee = VestingTrustee.at(await sale.trustee());
            assert.equal(await trustee.blok(), token.address);
            assert.equal(await trustee.owner(), sale.address);
        });

        it('should be initialized in minting enabled mode', async () => {
            let sale = await BlokTokenSaleMock.new(fundRecipient, now + 100);
            let token = BlokToken.at(await sale.blok());
            assert(await token.isMinting());
        });

        it('should be initialized with 0 total sold tokens', async () => {
            let sale = await BlokTokenSaleMock.new(fundRecipient, now + 100);
            assert.equal((await sale.tokensSold()), 0);
        });

        it('should be initialized with 0 lastGrantedIndex', async () => {
            let sale = await BlokTokenSaleMock.new(fundRecipient, now + 100);
            assert.equal((await sale.lastGrantedIndex()), 0);
        });

        it('should initialize token grants', async () => {
            let sale = await BlokTokenSaleMock.new(fundRecipient, now + 100);
            assert.equal((await sale.getTokenGranteesLength()).toNumber(), BLO_TOKEN_GRANTS.length);

            for (const blokTokenGrant of BLO_TOKEN_GRANTS) {
                await testTokenGrantExists(sale, blokTokenGrant);
            }
        });

        it('should be ownable', async () => {
            let sale = await BlokTokenSaleMock.new(fundRecipient, now + 10000);
            assert.equal(await sale.owner(), accounts[0]);
        });
    });

    describe('addTokenGrant', async () => {
        let sale;
        let fundRecipient = accounts[5];

        beforeEach(async () => {
            sale = await BlokTokenSaleMock.new(fundRecipient, now + 1000);
        });

        it('should not allow to be called by non-owner', async () => {
            await expectRevert(sale.addTokenGrant(accounts[0], 1000, {from: accounts[7]}));
        });

        it('should not allow to be called with null address', async () => {
            await expectRevert(sale.addTokenGrant(null, 1000));
        });

        it('should not allow to be called with 0 address', async () => {
            await expectRevert(sale.addTokenGrant(0, 1000));
        });

        it('should not allow to be called with 0 value', async () => {
            await expectRevert(sale.addTokenGrant(accounts[0], 0));
        });

        it('should not allow granting the same address twice', async () => {
            await sale.addTokenGrant(accounts[0], 1000);
            await expectRevert(sale.addTokenGrant(accounts[0], 5000));;
        });

        it('should add pre-sale token grants', async () => {
            await addPresaleTokenGrants(sale);

            for (const tokenGrant of GRANTS) {
                console.log(`\tchecking if token grant for ${tokenGrant.grantee} exists...`);

                await testTokenGrantExists(sale, tokenGrant);
            }
        });

        context(`with ${MAX_TOKEN_GRANTEES} grants`, async () => {
            beforeEach(async () => {
                let tokenGranteesLength = (await sale.getTokenGranteesLength()).toNumber();

                for (let i = 0; i < MAX_TOKEN_GRANTEES - tokenGranteesLength; ++i) {
                    await sale.addTokenGrant(`0x${i + 1}`, 1000);
                }

                assert.equal((await sale.getTokenGranteesLength()).toNumber(), MAX_TOKEN_GRANTEES);
            });

            it('should not allow granting another grant', async () => {
                await expectRevert(sale.addTokenGrant(accounts[0], 5000));;
            });
        });
    });

    describe('deleteTokenGrant', async () => {
        let sale;
        let fundRecipient = accounts[5];

        beforeEach(async () => {
            sale = await BlokTokenSaleMock.new(fundRecipient, now + 1000);
        });

        it('should not allow to be called by non-owner', async () => {
            await expectRevert(sale.deleteTokenGrant(accounts[0], {from: accounts[7]}));
        });

        it('should not allow to be called with 0 address', async () => {
            await expectRevert(sale.deleteTokenGrant(0));
        });

        it('should fail gracefully if called with a non-existing address', async () => {
            await sale.deleteTokenGrant(accounts[0]);
        });

        context('with pre-sale grants', async () => {
            beforeEach(async () => {
                await addPresaleTokenGrants(sale);
            });

            context(`with ${MAX_TOKEN_GRANTEES} grants`, async () => {
                beforeEach(async () => {
                    let tokenGranteesLength = (await sale.getTokenGranteesLength()).toNumber();

                    for (let i = 0; i < MAX_TOKEN_GRANTEES - tokenGranteesLength; ++i) {
                        await sale.addTokenGrant(`0x${i + 1}`, 1000);
                    }

                    assert.equal((await sale.getTokenGranteesLength()).toNumber(), MAX_TOKEN_GRANTEES);
                });

                it('should delete a single token grant', async () => {
                    await testDeleteTokenGrant(sale, PRESALE_TOKEN_GRANTS[5]);
                });
            });

            it('should delete a single token grant', async () => {
                await testDeleteTokenGrant(sale, PRESALE_TOKEN_GRANTS[5]);
            });

            it('should delete multiple token grants', async () => {
                for (const index of [ 0, 1, 3, PRESALE_TOKEN_GRANTS.length - 1 ]) {
                    await testDeleteTokenGrant(sale, PRESALE_TOKEN_GRANTS[index]);
                }
            });

            it('should allow adding a pre-sale token grant after it was deleted', async () => {
                const presaleTokenGrant = PRESALE_TOKEN_GRANTS[3];

                await testDeleteTokenGrant(sale, presaleTokenGrant);

                // Re-add the same token grant and make sure it exists.
                await sale.addTokenGrant(presaleTokenGrant.grantee, presaleTokenGrant.value);

                await testTokenGrantExists(sale, presaleTokenGrant);
            });

            it('should allow adding pre-sale token grants after they were deleted', async () => {
                for (const index of [ 0, 1, 3, PRESALE_TOKEN_GRANTS.length - 1 ]) {
                    const presaleTokenGrant = PRESALE_TOKEN_GRANTS[index];

                    await testDeleteTokenGrant(sale, presaleTokenGrant);

                    // Re-add the same token grant and make sure it exists.
                    await sale.addTokenGrant(presaleTokenGrant.grantee, presaleTokenGrant.value);

                    await testTokenGrantExists(sale, presaleTokenGrant);
                }
            });
        });
    });

    describe('grantTokens', async () => {
        let sale;
        let start;
        let end;
        let fundRecipient = accounts[5];

        beforeEach(async () => {
            start = now + 1000;
            sale = await BlokTokenSaleMock.new(fundRecipient, start);
            end = (await sale.endTime()).toNumber();
        });

        context('before sale has started', async () => {
            beforeEach(async () => {
                assert.isBelow(now, start);
            });

            it('should not allow to grant tokens before selling all tokens', async () => {
                await expectRevert(sale.grantTokens());
            });
        });

        context('during the sale', async () => {
            beforeEach(async () => {
                // Increase time to be the in the middle between start and end.
                await increaseTime(start - now + ((end - start) / 2));

                assert.isAbove(now, start);
                assert.isBelow(now, end);
            });

            it('should not allow to grant tokens before selling all tokens', async () => {
                await expectRevert(sale.grantTokens());
            });
        });

        context('after the sale', async () => {
            beforeEach(async () => {
                await sale.setTokensSold(MAX_TOKENS_SOLD.toNumber());
            });

            it('should not allow to be called by non-owner', async () => {
                await expectRevert(sale.grantTokens({from: accounts[7]}));
            });

            it('should grant Blok tokens to all non pre-sale grantees', async () => {
                await grantTokens(sale, BLO_TOKEN_GRANTS);
            });

            context('with pre-sale grants', async () => {
                beforeEach(async () => {
                    await addPresaleTokenGrants(sale);
                });

                it('should grant Blok and pre-sale tokens to all pre-sale grantees', async () => {
                    await grantTokens(sale, GRANTS);
                });
            });
        });
    });

    describe('participation caps', async () => {
        let sale;
        let fundRecipient = accounts[5];

        // Test all accounts have their participation caps set properly.
        beforeEach(async () => {
            sale = await BlokTokenSaleMock.new(fundRecipient, now + 1000);

            for (let participant of accounts) {
                assert.equal((await sale.participationCaps(participant)).toNumber(), 0);
            }
        });

        describe('setTier1Participants', async () => {
            it('should be able to get called with an empty list of participants', async () => {
                await sale.setTier1Participants([]);
            });

            it('should not allow to be called by non-owner', async () => {
                await expectRevert(sale.setTier1Participants([], {from: accounts[7]}));
            });

            it('should set participation cap to TIER_1_CAP', async () => {
                let participants = [accounts[1], accounts[4]];

                await sale.setTier1Participants(participants);

                for (let participant of participants) {
                    assert.equal((await sale.participationCaps(participant)).toNumber(), TIER_1_CAP);
                }
            });

        });

    });

    describe('finalize', async () => {
        let sale;
        let token;
        let start;
        let startFrom = 1000;
        let end;
        let fundRecipient = accounts[5];

        beforeEach(async () => {
            start = now + startFrom;
            sale = await BlokTokenSaleMock.new(fundRecipient, start);
            end = (await sale.endTime()).toNumber();
            token = BlokToken.at(await sale.blok());

            assert.equal(await token.isMinting(), true);
        });

        context('before sale has started', async () => {
            beforeEach(async () => {
                assert.isBelow(now, start);
            });

            it('should not allow to finalize before selling all tokens', async () => {
                await expectRevert(sale.finalize());
            });
        });

        context('during the sale', async () => {
            beforeEach(async () => {
                // Increase time to be the in the middle between start and end.
                await increaseTime(start - now + ((end - start) / 2));

                assert.isAbove(now, start);
                assert.isBelow(now, end);
            });

            it('should not allow to finalize before selling all tokens', async () => {
                await expectRevert(sale.finalize());
            });
        });

        let testFinalization = async () => {
            it('should not allow to finalize token sale without granting all token grants first', async () => {
                await expectRevert(sale.finalize());
            });

            it('should finish minting after sale was finalized', async () => {
                await grantTokens(sale, BLO_TOKEN_GRANTS);
                await sale.finalize();

                assert.equal(await token.isMinting(), false);
            });

            it('should not allow to finalize token sale more than once', async () => {
                await grantTokens(sale, BLO_TOKEN_GRANTS);
                await sale.finalize();

                await expectRevert(sale.finalize());
            });

            context('with pre-sale grants', async () => {
                beforeEach(async () => {
                    await addPresaleTokenGrants(sale);
                });

                describe('vesting', async () => {
                    // We'd allow (up to) 100 seconds of time difference between the execution (i.e., mining) of the
                    // contract.
                    const MAX_TIME_ERROR = 100;

                    let trustee;

                    // Calculates exactly how many tokens were issued and vested.
                    let calcVestedTokens = async (grant) => {
                        // Calculate total amount of tokens issued, while taking into account how many tokens where
                        // sold in the sale, for example:
                        //
                        // MAX_TOKENS = 10T
                        // MAX_TOKENS_SOLD = 0.1 * 10T = 10% of 10T
                        // Amount of tokens actually sold = sale.tokensSold = just 1 BLO
                        //
                        // Token distribution is 30% Blok, 60% Blok Foundation, 10% Participants (including pre-sale).
                        // Since only 1 BLO was sold and accounts to 10% of total tokens issued, this means total
                        // tokens \ issued is 10 BLO.
                        let totalTokensIssued = (await sale.tokensSold()).mul(MAX_TOKENS).div(MAX_TOKENS_SOLD);

                        let tokensGranted = totalTokensIssued.mul(grant.value).div(MAX_TOKENS).floor();
                        let tokensVesting = tokensGranted.mul(grant.percentVested).div(100).floor().toNumber();
                        let tokensTransferred = tokensGranted.sub(tokensVesting).toNumber();

                        return {vested: tokensVesting, transferred: tokensTransferred};
                    }

                    beforeEach(async () => {
                        await grantTokens(sale, GRANTS);
                        await sale.finalize();

                        trustee = VestingTrustee.at(await sale.trustee());

                        // Verify that both the BlokTokenSale and the VestingTrustee share the same BlokToken.
                        assert.equal(token.address, await trustee.blok());
                    });

                    it('should grant tokens', async () => {
                        for (const grant of GRANTS) {
                            let tokenGrant = await getGrant(trustee, grant.grantee);

                            let vestedTokens = await calcVestedTokens(grant);
                            console.log(`\texpecting ${vestedTokens.vested / TOKEN_UNIT} vested BLO...`);
                            console.log(`\texpecting ${vestedTokens.transferred / TOKEN_UNIT} issued BLO...`);

                            // Test granted and vested tokens.
                            assert.equal((await token.balanceOf(grant.grantee)).toNumber(), vestedTokens.transferred);

                            if (grant.percentVested > 0) {
                                assert.equal(tokenGrant.value, vestedTokens.vested);

                                // Test vesting time ranges.
                                assert.approximately(now + grant.startOffset, tokenGrant.start, MAX_TIME_ERROR);
                                assert.approximately(now + grant.cliffOffset, tokenGrant.cliff, MAX_TIME_ERROR);
                                assert.approximately(now + grant.endOffset, tokenGrant.end, MAX_TIME_ERROR);

                                // Test no funds have been transferred yet, since transfer should be requested by
                                // participant.
                                assert.equal(tokenGrant.transferred, 0);

                                // Grant should be revokable.
                                assert.equal(tokenGrant.revokable, true);
                            } else {
                                assert.deepEqual(tokenGrant, { value: 0, start: 0, cliff: 0, end: 0,
                                    installmentLength: 0, transferred: 0, revokable: false });
                            }
                        }
                    });

                    it('should grant the trustee enough tokens to support the grants', async () => {
                        let totalGranted = new BigNumber(0);

                        // Sum all vested tokens.
                        for (let grant of GRANTS) {
                            let vestedTokens = await calcVestedTokens(grant);
                            totalGranted = totalGranted.add(vestedTokens.vested);
                        }

                        assert.equal((await token.balanceOf(trustee.address)).toNumber(), totalGranted.toNumber());
                    });
                });
            });
        }

        context('after sale time has ended', async () => {
            beforeEach(async () => {
                await increaseTime(end - now + 1);
                assert.isAbove(now, end);
            });

            context('sold all of the tokens', async () => {
                beforeEach(async () => {
                    await sale.setTokensSold(MAX_TOKENS_SOLD.toNumber());
                });

                testFinalization();
            });

            context('sold only half of the tokens', async () => {
                beforeEach(async () => {
                    await sale.setTokensSold(MAX_TOKENS_SOLD.toNumber());
                });

                testFinalization();
            });

            context('sold only tenth of the tokens', async () => {
                beforeEach(async () => {
                    await sale.setTokensSold(MAX_TOKENS_SOLD.toNumber());
                });

                testFinalization();
            });
        });

        context('reached token cap', async () => {
            beforeEach(async () => {
                await sale.setTokensSold(MAX_TOKENS_SOLD.toNumber());
            });

            testFinalization();
        });
    });

    // Execute a transaction, and test balances and total tokens sold have been updated correctly, while also testing
    // for participation caps.
    //
    // NOTE: This function automatically finalizes the sale when the cap has been reached. This function is used in
    // various tests where plenty of transactions are called, and its hard to decide when to exactly call finalize. This
    // function does it for us.
    let verifyTransactions = async (sale, fundRecipient, method, transactions) => {
        let token = BlokToken.at(await sale.blok());

        // Using large numerics, so we have to use BigNumber.
        let totalTokensSold = new BigNumber(0);

        let i = 0;
        for (const t of transactions) {
            // Set hard participation cap if mentioned in current transaction object. This means current object is not
            // a transaction but a special object that signals when to set a new hard cap.
            //
            // NOTE: We have to convert the new cap number to string before converting them to BigNumber, since JS
            // standard Number type doesn't support more than 15 significant digits.
            if (t.hasOwnProperty('hardParticipationCap')) {
                console.log(`\tsetting hard participation cap from ${(await sale.hardParticipationCap()).div(TOKEN_UNIT)} ` +
                    `to ${t.hardParticipationCap / TOKEN_UNIT}`
                );

                // Value is assumed to be of BigNumber type.
                await sale.setHardParticipationCap(t.hardParticipationCap);

                continue;
            }

            let tokens = new BigNumber(t.value.toString()).mul(BLO_PER_WEI);

            console.log(`\t[${++i} / ${transactions.length}] expecting account ${t.from} to buy up to ` +
                `${tokens.toNumber() / TOKEN_UNIT} BLO for ${t.value / TOKEN_UNIT} ETH`
            );

            // Cache original balances before executing the transaction.
            // We will test against these after the transaction has been executed.
            let fundRecipientETHBalance = web3.eth.getBalance(fundRecipient);
            let participantETHBalance = web3.eth.getBalance(t.from);
            let participantBLOBalance = await token.balanceOf(t.from);
            let participantHistory = await sale.participationHistory(t.from);

            // Take into account the global hard participation cap.
            let participantCap = await sale.participationCaps(t.from) + new BigNumber(TOKEN_UNIT).mul(15);
            let hardParticipationCap = await sale.hardParticipationCap();
            participantCap = BigNumber.min(participantCap, hardParticipationCap);

            let tokensSold = await sale.tokensSold();
            assert.equal(totalTokensSold.toNumber(), tokensSold.toNumber());

            // If this transaction should fail, then theres no need to continue testing the current transaction and
            // test for updated balances, etc., since everything related to it was reverted.
            //
            // Reasons for failures can be:
            //  1. We already sold all the tokens
            //  2. Participant has reached its participation cap.
            if (MAX_TOKENS_SOLD.equals(tokensSold) ||
                participantHistory.greaterThanOrEqualTo(participantCap)) {

                await expectRevert(method(sale, t.value, t.from));

                continue;
            }

            // Execute transaction.
            let transaction = await method(sale, t.value, t.from);
            let gasUsed = DEFAULT_GAS_PRICE.mul(transaction.receipt.gasUsed);

            // Test for correct participant ETH, BLO balance, and total tokens sold:

            // NOTE: We take into account partial refund to the participant, in case transaction goes past its
            // participation cap.
            //
            // NOTE: We have to convert the (very) numbers to strings, before converting them to BigNumber, since JS
            // standard Number type doesn't support more than 15 significant digits.
            let contribution = BigNumber.min(t.value.toString(), participantCap.minus(participantHistory));
            tokens = contribution.mul(BLO_PER_WEI);

            // Take into account the remaining amount of tokens which can be still sold:
            tokens = BigNumber.min(tokens, MAX_TOKENS_SOLD.minus(tokensSold));
            contribution = tokens.div(BLO_PER_WEI);

            totalTokensSold = totalTokensSold.plus(tokens);

            // Test for total tokens sold.
            assert.equal((await sale.tokensSold()).toNumber(), tokensSold.plus(tokens).toNumber());

            // Test for correct participant ETH + Blok balances.

            // ETH:
            assert.equal(web3.eth.getBalance(fundRecipient).toNumber(),
                fundRecipientETHBalance.plus(contribution).toNumber());

            assert.approximately( web3.eth.getBalance(t.from).toNumber(),
                participantETHBalance.minus(contribution).minus(gasUsed).toNumber(), GAS_COST_ERROR);

            // BLO:
            assert.equal((await token.balanceOf(t.from)).toNumber(), participantBLOBalance.plus(tokens).toNumber());

            // Test for updated participant cap.
            assert.equal((await sale.participationHistory(t.from)).toNumber(),
                participantHistory.plus(contribution).toNumber());

            // Test mint event.
            assert.lengthOf(transaction.logs, 1);
            let event = transaction.logs[0];
            assert.equal(event.event, 'TokensIssued');
            assert.equal(Number(event.args._tokens), tokens)

            // Finalize sale if the all tokens have been sold.
            if (totalTokensSold.equals(MAX_TOKENS_SOLD)) {
                console.log('\tFinalizing sale...');

                await grantTokens(sale, GRANTS);
                await sale.finalize();
            }
        }
    };

    let generateTokenTests = async (name, method) => {
        describe(name, async () => {
            let sale;
            let token;
            // accounts[0] (owner) is participating in the sale. We don't want
            // him to send and receive funds at the same time.
            let fundRecipient = accounts[11];
            let start;
            let startFrom = 1000;
            let end;
            let value = 1000;

            beforeEach(async () => {
                start = now + startFrom;
                sale = await BlokTokenSaleMock.new(fundRecipient, start);
                end = (await sale.endTime()).toNumber();
                token = BlokToken.at(await sale.blok());

                assert.equal(await token.isMinting(), true);

            });

            context('during the sale', async () => {
                beforeEach(async () => {
                    await increaseTime(start - now + ((end - start) / 2));
                    assert.isAbove(now, start);
                    assert.isBelow(now, end);
                });

                // Test if transaction execution is unallowed and prevented for UNREGISTERED participants.
                context('unregistered participants below the threshold', async () => {
                    [
                        { from: accounts[1], value: 1 * TOKEN_UNIT },
                        { from: accounts[2], value: 2 * TOKEN_UNIT },
                        { from: accounts[3], value: 0.0001 * TOKEN_UNIT },
                        { from: accounts[4], value: 10 * TOKEN_UNIT }
                    ].forEach((t) => {
                        it(`should allow to participate with ${t.value / TOKEN_UNIT} ETH`, async () => {
                            assert.equal((await sale.participationCaps(t.from)).toNumber(), 0);

                            await verifyTransactions(sale, fundRecipient, method, [t]);
                        });
                    });
                });

                context('unregistered participants above the threshold', async () => {
                    [
                        { from: accounts[1], value: 16 * TOKEN_UNIT },
                        { from: accounts[2], value: 20 * TOKEN_UNIT },
                        { from: accounts[3], value: 1000 * TOKEN_UNIT },
                        { from: accounts[4], value: 25 * TOKEN_UNIT }
                    ].forEach((t) => {
                        it(`should allow to participate with ${t.value / TOKEN_UNIT} ETH`, async () => {
                            assert.equal((await sale.participationCaps(t.from)).toNumber(), 0);

                            await verifyTransactions(sale, fundRecipient, method, [t]);
                        });
                    });
                });

                // Test transaction are allowed and executed correctly for registered participants.
                context('registered participants', async () => {
                    let owner = accounts[0];

                    let tier1Participant1 = accounts[1];
                    let tier1Participant2 = accounts[2];
                    let tier1Participant3 = accounts[3];

                    // Use default (limited) hard participation cap
                    // and initialize tier 1 + tier 2 participants.
                    beforeEach(async () => {
                        await sale.setTier1Participants([
                            owner,
                            tier1Participant1,
                            tier1Participant2,
                            tier1Participant3
                        ]);
                    });

                    [
                        // Sanity test: test sending funds from account owner.
                        [
                            { from: owner, value: 1 * TOKEN_UNIT },
                            { from: tier1Participant1, value: 1 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 1 * TOKEN_UNIT },
                            { from: owner, value: 1 * TOKEN_UNIT },
                            { from: owner, value: 3 * TOKEN_UNIT },
                        ],
                        // Only tier 1 participants:
                        [
                            { from: tier1Participant1, value: 1 * TOKEN_UNIT },
                            { from: tier1Participant1, value: 1 * TOKEN_UNIT },
                            { from: tier1Participant1, value: 1 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 150 * TOKEN_UNIT }
                        ],
                        // Tier 1 + Tier 2 participants:
                        [
                            { from: tier1Participant1, value: 1 * TOKEN_UNIT },

                            { from: tier1Participant2, value: 0.5 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 10 * TOKEN_UNIT },

                            { from: tier1Participant3, value: 2.5 * TOKEN_UNIT },

                            { from: tier1Participant2, value: 0.01 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 120 * TOKEN_UNIT },

                            { from: tier1Participant1,  value: 0.01 * TOKEN_UNIT }
                        ],
                        // Another Tier 1 + Tier 2 participants:
                        [
                            { from: tier1Participant1, value: 5 * TOKEN_UNIT },

                            { from: tier1Participant2, value: 10 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 10 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 2 * TOKEN_UNIT },

                            { from: tier1Participant3, value: 1.3 * TOKEN_UNIT },

                            { from: tier1Participant2, value: 0.01 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 10 * TOKEN_UNIT },

                            { from: tier1Participant1, value: 0.01 * TOKEN_UNIT }
                        ],
                        // Participation cap should be reached by the middle of this transaction list, and then we raise
                        // it and continue the remaining transactions:
                        [
                            { from: tier1Participant1, value: 11 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 12 * TOKEN_UNIT },
                            { from: tier1Participant3, value: 13 * TOKEN_UNIT },

                            { from: tier1Participant1, value: 500 * TOKEN_UNIT },

                            { hardParticipationCap: TIER_2_CAP_BIGNUMBER }, // Practically infinity

                            { from: tier1Participant1, value: 1000 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 121 * TOKEN_UNIT },
                            { from: tier1Participant3, value: 131 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 1212 * TOKEN_UNIT },
                        ],
                        // Another similar test to above, just with different transactions.
                        [
                            { from: tier1Participant1, value: 100 * TOKEN_UNIT },
                            { from: tier1Participant1, value: 100 * TOKEN_UNIT },
                            { from: tier1Participant1, value: 0.01 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 1 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 999 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 99 * TOKEN_UNIT },
                            { from: tier1Participant3, value: 1 * TOKEN_UNIT },
                            { from: tier1Participant3, value: 10 * TOKEN_UNIT },
                            { from: tier1Participant3, value: 10000 * TOKEN_UNIT },

                            { hardParticipationCap: TIER_2_CAP_BIGNUMBER },

                            { from: tier1Participant2, value: 121 * TOKEN_UNIT },
                            { from: tier1Participant3, value: 131 * TOKEN_UNIT },
                            { from: tier1Participant1, value: 1000 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 1212 * TOKEN_UNIT }
                        ],
                        // Test starting with hard cap at the lowest value possible: 1,
                        // then rising to 5K.
                        [
                            // { hardParticipationCap: new BigNumber(1) },

                            // { from: tier1Participant1, value: 100 * TOKEN_UNIT },
                            // { from: tier1Participant1, value: 10 * TOKEN_UNIT },
                            // { from: tier1Participant1, value: 0.01 * TOKEN_UNIT },
                            // { from: tier1Participant2, value: 1 * TOKEN_UNIT },
                            // { from: tier1Participant2, value: 99 * TOKEN_UNIT },
                            // { from: tier1Participant2, value: 99 * TOKEN_UNIT },
                            // { from: tier1Participant3, value: 1 * TOKEN_UNIT },
                            // { from: tier1Participant3, value: 10 * TOKEN_UNIT },
                            // { from: tier1Participant3, value: 10000 * TOKEN_UNIT },

                            { hardParticipationCap: new BigNumber(5).mul(1000) }, // 5K

                            { from: tier1Participant2, value: 121 * TOKEN_UNIT },
                            { from: tier1Participant3, value: 131 * TOKEN_UNIT },
                            { from: tier1Participant1, value: 1000 * TOKEN_UNIT },
                            { from: tier1Participant2, value: 1212 * TOKEN_UNIT }
                        ],
                    ].forEach((transactions) => {
                        context(`${JSON.stringify(transactions).slice(0, 200)}...`, async function() {
                            // These are long tests, so we need to disable timeouts.
                            this.timeout(0);

                            beforeEach(async () => {
                                await addPresaleTokenGrants(sale);
                            })

                            it('should execute sale orders', async () => {
                                await verifyTransactions(sale, fundRecipient, method, transactions);
                            });
                        });
                    });
                });
            });
        });
    }

    // Generate tests for create() - Create and sell tokens to the caller.
    generateTokenTests('using create()', async (sale, value, from) => {
        let account = from || accounts[0];
        return sale.create(account, {value: value, from: account});
    });

    // Generate tests for fallback method - Should be same as create().
    generateTokenTests('using fallback function', async (sale, value, from) => {
        if (from) {
            return sale.sendTransaction({value: value, from: from});
        }

        return sale.send(value);
    });

    describe('transfer ownership', async () => {
        let sale;
        let token;
        let trustee;
        let start;
        let startFrom = 1000;
        let end;
        let fundRecipient = accounts[8];

        beforeEach(async () => {
            start = now + startFrom;
            sale = await BlokTokenSaleMock.new(fundRecipient, start);
            end = (await sale.endTime()).toNumber();
            token = BlokToken.at(await sale.blok());
        });

        // Blok token contract ownership transfer tests.
        let testTransferAndAcceptTokenOwnership = async () => {
            let owner = accounts[0];
            let newOwner = accounts[1];
            let notOwner = accounts[8];

            describe('Blok token contract ownership transfer', async () => {
                describe('request', async () => {
                    it('should allow contract owner to request transfer', async () => {
                        assert.equal(await token.owner(), sale.address);

                        await sale.requestBlokTokenOwnershipTransfer(newOwner, {from: owner});
                    });

                    it('should not allow non-owner to request transfer', async () => {
                        await expectRevert(sale.requestBlokTokenOwnershipTransfer(newOwner, {from: notOwner}));
                    });
                });

                describe('accept', async () => {
                    it('should not allow owner to accept', async () => {
                        await expectRevert(token.acceptOwnership({from: owner}));
                    });

                    it('should not allow new owner to accept without request', async () => {
                        await expectRevert(token.acceptOwnership({from: newOwner}));
                    });
                });

                describe('request and accept', async () => {
                    it('should transfer ownership to new owner', async () => {
                        // Test original owner is still owner before and after ownership REQUEST (not accepted yet!).
                        assert.equal(await token.owner(), sale.address);
                        await sale.requestBlokTokenOwnershipTransfer(newOwner, {from: owner});
                        assert.equal(await token.owner(), sale.address);

                        // Test ownership has been transferred after acceptance.
                        await token.acceptOwnership({from: newOwner});
                        assert.equal(await token.owner(), newOwner);

                        // Original owner should not be able to request ownership after acceptance (he's not the owner
                        // anymore).
                        await expectRevert(sale.requestBlokTokenOwnershipTransfer(newOwner, {from: owner}));
                    });

                    it('should be able to claim ownership back', async () => {
                        // Transfer ownership to another account.
                        assert.equal(await token.owner(), sale.address);
                        await sale.requestBlokTokenOwnershipTransfer(newOwner, {from: owner});
                        await token.acceptOwnership({from: newOwner});
                        assert.equal(await token.owner(), newOwner);

                        // Test transfer ownership back to original account.
                        await token.requestOwnershipTransfer(sale.address, {from: newOwner});
                        assert.equal(await token.owner(), newOwner);

                        await sale.acceptBlokTokenOwnership({from: owner});
                        assert.equal(await token.owner(), sale.address);
                    });
                });
            });
        };

        // Vesting trustee contract ownership transfer tests.
        let testTransferAndAcceptVestingTrusteeOwnership = async () => {
            let owner = accounts[0];
            let newOwner = accounts[1];
            let notOwner = accounts[8];

            describe('Vesting Trustee contract ownership transfer', async () => {
                describe('request', async () => {
                    it('should allow for contract owner', async () => {
                        assert.equal(await trustee.owner(), sale.address);

                        await sale.requestVestingTrusteeOwnershipTransfer(newOwner, {from: owner});
                    });

                    it('should not allow for non-contract owner', async () => {
                        await expectRevert(sale.requestVestingTrusteeOwnershipTransfer(newOwner, {from: notOwner}));
                    });
                });

                describe('accept', async () => {
                    it('should not allow owner to accept', async () => {
                        await expectRevert(sale.acceptVestingTrusteeOwnership({from: notOwner}));
                    });

                    it('should not allow new owner to accept without request', async () => {
                        await expectRevert(sale.acceptVestingTrusteeOwnership({from: notOwner}));
                    });
                });

                describe('request and accept', async () => {
                    it('should transfer ownership to new owner', async () => {
                        // Test original owner is still owner before and
                        // after ownership REQUEST (not accepted yet!).
                        assert.equal(await token.owner(), sale.address);
                        await sale.requestVestingTrusteeOwnershipTransfer(newOwner, {from: owner});
                        assert.equal(await trustee.owner(), sale.address);

                        // Test ownership has been transferred after acceptance.
                        await trustee.acceptOwnership({from: newOwner});
                        assert.equal(await trustee.owner(), newOwner);

                        // Original owner should not be able to request
                        // ownership after acceptance (he's not the owner anymore).
                        await expectRevert(sale.requestVestingTrusteeOwnershipTransfer(newOwner, {from: owner}));
                    });

                    it('should be able to claim ownership back', async () => {
                        // Transfer ownership to another account.
                        assert.equal(await trustee.owner(), sale.address);
                        await sale.requestVestingTrusteeOwnershipTransfer(newOwner, {from: owner});
                        await trustee.acceptOwnership({from: newOwner});
                        assert.equal(await trustee.owner(), newOwner);

                        // Test transfer ownership back to original account.
                        await trustee.requestOwnershipTransfer(sale.address, {from: newOwner});
                        assert.equal(await trustee.owner(), newOwner);

                        await sale.acceptVestingTrusteeOwnership({from: owner});
                        assert.equal(await trustee.owner(), sale.address);
                    });
                });
            });
        };

        context('during the sale', async () => {
            beforeEach(async () => {
                await increaseTime(start - now + ((end - start) / 2));

                assert.isAbove(now, start);
                assert.isBelow(now, end);
            });

            testTransferAndAcceptTokenOwnership();
        });

        context('after the sale', async () => {
            context('reached token cap', async () => {
                beforeEach(async () => {
                    await sale.setTokensSold(MAX_TOKENS_SOLD.toNumber());
                    await grantTokens(sale, BLO_TOKEN_GRANTS);
                    await sale.finalize();

                    trustee = VestingTrustee.at(await sale.trustee());
                });

                testTransferAndAcceptTokenOwnership();
                testTransferAndAcceptVestingTrusteeOwnership();
            });

            context('after the ending time', async () => {
                beforeEach(async () => {
                    await increaseTime(end - now + 1);
                    assert.isAbove(now, end);

                    await grantTokens(sale, BLO_TOKEN_GRANTS);
                    await sale.finalize();

                    trustee = VestingTrustee.at(await sale.trustee());
                });

                testTransferAndAcceptTokenOwnership();
                testTransferAndAcceptVestingTrusteeOwnership();
            });
        });
    });

    const longTests = process.env['LONG_TESTS'];
    (longTests ? describe : describe.skip)('long token sale scenarios', async function() {
        // These are very long tests, so we need to  disable timeouts.
        this.timeout(0);

        let sale;
        let token;
        let fundRecipient = accounts[0];
        let tier1Participants;
        let start;
        let startFrom = 1000;
        let end;

        // Center index in accounts array.
        const centerIndex = Math.floor(accounts.length / 2);

        // Setup a standard sale just like previous tests, with a single tier 2 participant
        // and move time to be during the sale.
        beforeEach(async () => {
            start = now + startFrom;
            sale = await BlokTokenSaleMock.new(fundRecipient, start);
            end = (await sale.endTime()).toNumber();
            token = BlokToken.at(await sale.blok());

            // We'll be testing transactions from all these accounts in the following tests.
            // We require at least 50 (ignoring first owner account).
            assert.isAtLeast(accounts.length, 51);

            // We're generating transactions for many accounts and also skipping the first owner account.
            // We split these accounts to two tiers, thus in order for them to be equal
            // length we need an odd (accounts.length) value
            assert.equal(accounts.length % 2, 1);

            await increaseTime(start - now + 1);
            assert.isAtLeast(now, start);
            assert.isBelow(now, end);
        });

        let create = async (sale, value, from) => {
            let account = from || accounts[0];
            return sale.create(account, {value: value, from: account});
        };

        const WHITELIST_SIZE = 50000;

        // NOTE (accounts.length - 1) because we're skipping first owner account.
        context(`${WHITELIST_SIZE + accounts.length - 1} registered participants`, async () => {
            const BATCH_SIZE = 200;

            // Whitelist participants along with random addresses:

            beforeEach(async () => {
                // Add presale grants.
                await addPresaleTokenGrants(sale);

                // Assign random addresses (as noise) to tier 1.
                for (let i = 0; i < WHITELIST_SIZE / BATCH_SIZE; ++i) {
                    console.log(`\tWhitelisting [${i * BATCH_SIZE} - ${(i + 1) * BATCH_SIZE}] non-existing participants...`);

                    const addresses = Array.from(Array(BATCH_SIZE), (_, x) => {
                        return '0x'.padEnd(42, x + i * BATCH_SIZE)
                    });

                    await sale.setTier1Participants(addresses);
                }

                // Assign 50% of participants to tier 1 and the other to tier 2.
                //
                // NOTE skipping owner account.
                tier1Participants = accounts.slice(1, centerIndex + 1);

                console.log(`\tWhitelisting ${tier1Participants.length} tier 1 participants...`);
                await sale.setTier1Participants(tier1Participants);

            });

            it('should be able to participate', async () => {
                // Generate transactions, and mix tier 1 and tier 2 transactions together.
                let transactions = [];
                for (let i = 0; i < centerIndex; ++i) {
                    // NOTE value is (i+1) such that first member will send 1 ETH (0 ETH will fail).
                    transactions.push({from: tier1Participants[i], value: (i + 1) * TOKEN_UNIT});
                }

                await verifyTransactions(sale, fundRecipient, create, transactions);
            });

            // This test generates very small and very large transactions. During the sale,
            // the hard cap is lifted to infinity, and then we test the very large
            // transactions are succeeding, and the sale is finalized.
            //
            // We're trying to create "chaotic" behaviour by mixing small and large transactions together.
            it('should be able to participate in various amounts with changing sale cap', async () => {
                // Generate transactions, and mix tier 1 and tier 2 transactions together.
                let transactions = [];
                let liftHardCapIndex = 75;
                for (let j = 0; j < 50; ++j) {
                    // Lift hard cap to infinity during the sale.
                    if (j === 40) {
                        console.log(`\tGenerating hard participation cap change...`);
                        transactions.push({ hardParticipationCap: TIER_2_CAP_BIGNUMBER });
                    }

                    console.log(`\tGenerating ${tier1Participants.length} transactions...`);
                    for (let i = 0; i < centerIndex; ++i) {
                        // NOTE value is (i+1) such that first member will send 1 ETH (0 ETH will fail).

                        // Tier 1 participants send a negligble amount of ETH (0.01-0.25 ETH).
                        transactions.push({from: tier1Participants[i], value: (i + 1) * 0.01 * TOKEN_UNIT});
                    }
                }

                await verifyTransactions(sale, fundRecipient, create, transactions);
            });
        });
    });
});
