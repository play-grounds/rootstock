# Rootstock Playground

Smart-contract development on the [Rootstock](https://rootstock.io/) testnet,
signed by a [did:nostr](https://nostr.how/) identity. Nostr, Bitcoin and
Rootstock all use secp256k1, so the same key behind a Nostr identity also
controls an EVM address — this repo exercises that loop end to end: derive the
address, fund it, deploy contracts, and serve a faucet dApp.

## What's here

| Path | Purpose |
|------|---------|
| `contracts/Storage.sol` | Minimal contract to verify the deploy/call loop |
| `contracts/Faucet.sol` | Fixed drip per claim with a per-address cooldown |
| `contracts/DailyFaucet.sol` | Drip with a global per-UTC-day cap plus one claim per address per day |
| `scripts/` | Deploy, balance-check and faucet-funding scripts (Hardhat) |
| `faucet/` | Static faucet dApp (MetaMask or Nostr-key signing) for the deployed `DailyFaucet` |
| `derive-address.mjs` | Derive the Rootstock (EVM) address controlled by a did:nostr identity |
| `btc-address.mjs` | Derive Bitcoin testnet addresses from the same key (for a PowPeg peg-in) |
| `agent.did.json` | The did:nostr document whose key signs deploys |

## Setup

```bash
npm install
```

Provide a hex private key via the environment — it is never committed. Either
copy `.env.example` to `.env` and fill in `PRIVATE_KEY=`, or pass it inline:

```bash
PRIVATE_KEY=$(git config nostr.privkey) npm run deploy:testnet
```

## Usage

```bash
npm run address          # derive the EVM address for the did:nostr key
npm run verify           # verify key <-> address correspondence
npm run compile          # hardhat compile
npm run balance          # tRBTC balance of the signer on Rootstock testnet
npm run deploy:testnet   # deploy Storage to Rootstock testnet
```

The faucet contracts deploy via `hardhat run`:

```bash
PRIVATE_KEY=... npx hardhat run scripts/deploy-faucet.js --network rootstockTestnet
PRIVATE_KEY=... npx hardhat run scripts/deploy-dailyfaucet.js --network rootstockTestnet
PRIVATE_KEY=... npx hardhat run scripts/fund-faucet.js --network rootstockTestnet
```

Get testnet funds from the [Rootstock faucet](https://faucet.rootstock.io/), or
peg in from Bitcoin testnet using the P2PKH address printed by
`node btc-address.mjs`.

## Faucet dApp

`faucet/` is a static page (no build step) that lets users claim tRBTC from the
deployed `DailyFaucet`. Serve it locally:

```bash
npx http-server faucet
```

## Rootstock gotchas

Both are handled in `hardhat.config.js`, noted here so they don't get "cleaned
up":

- **No PUSH0 opcode** — Solidity targets `evmVersion: "london"`; the default
  Shanghai target produces bytecode that fails with `invalid opcode` on deploy.
- **Explicit gas price** — Rootstock's minimum gas price is very low
  (~0.009 gwei); the config pins 0.06 gwei so transactions are never rejected
  as underpriced.

Networks: `rootstockTestnet` (chainId 31, public node RPC) and
`rootstockMainnet` (chainId 30). Override RPCs with `RSK_TESTNET_RPC` /
`RSK_MAINNET_RPC`. Contract verification goes through the Rootstock testnet
Blockscout explorer.
