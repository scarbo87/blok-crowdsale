# Blok Token Contracts

Here be smart contracts for the Blok token.

## Contracts

Please see the [contracts/](contracts) directory.

## Develop

Contracts are written in [Solidity][solidity] and tested using [Truffle][truffle] and [testrpc][testrpc].

### Depenencies

* node v9.11.1

* npm 5.8.0

```bash
# Install Truffle and testrpc packages globally:
$ npm install -g truffle ethereumjs-testrpc

# Install local node dependencies:
$ npm install
```

### Test

```bash
# Initialize a testrpc instance
$ ./scripts/testrpc.sh

# This will compile and test the contracts using truffle
$ truffle test

# Enable long tests
$ LONG_TESTS=1 truffle test
```