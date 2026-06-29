#!/usr/bin/env node
// derive-address.mjs
//
// Derive the Rootstock (EVM) address controlled by a did:nostr identity.
//
// Nostr, Bitcoin and Rootstock all use secp256k1, so the same key behind a
// Nostr identity also controls an EVM address:
//
//     secp256k1 pubkey -> keccak256(uncompressed pubkey) -> last 20 bytes
//
// Usage:
//   node derive-address.mjs                 # read pubkey from ./agent.did.json
//   node derive-address.mjs --chain 30      # checksum for mainnet (default: 31 / testnet)
//   node derive-address.mjs --verify        # also derive from git config nostr.privkey
//                                           # and confirm it matches the DID document
//
// The private key (when --verify is used) is only read locally into memory and
// is never printed or transmitted.
//
// Requires: @noble/curves @noble/hashes  (npm install)

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { secp256k1, schnorr } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const chainIdx = args.indexOf('--chain');
const chainId = chainIdx !== -1 ? String(args[chainIdx + 1]) : '31';
const doVerify = args.includes('--verify');

const hx = (h) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));

// --- helpers ----------------------------------------------------------------

// Decode a did:nostr publicKeyMultibase: base16 ('f') + multicodec secp256k1-pub
// (varint 0xe701) + 33-byte compressed pubkey. Returns the compressed pubkey hex.
function pubkeyFromMultibase(mb) {
  if (mb[0] !== 'f') throw new Error(`unsupported multibase prefix: ${mb[0]} (expected base16 'f')`);
  let hex = mb.slice(1);
  if (hex.startsWith('e701')) hex = hex.slice(4); // strip secp256k1-pub multicodec
  if (!/^0[23][0-9a-f]{64}$/.test(hex)) throw new Error(`not a compressed secp256k1 pubkey: ${hex}`);
  return hex;
}

// RSKIP-60 checksum: like EIP-55 but the keccak input is prefixed with `${chainId}0x`.
// chainId 30 = mainnet, 31 = testnet. Pass chainId='' for plain EIP-55.
function checksum(addrLower, chain) {
  const a = addrLower.replace(/^0x/, '');
  const prefix = chain === '' ? '' : `${chain}0x`;
  const h = Buffer.from(keccak_256(Buffer.from(prefix + a, 'ascii'))).toString('hex');
  let out = '0x';
  for (let i = 0; i < a.length; i++) out += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return out;
}

// Compressed/uncompressed secp256k1 pubkey -> lowercase EVM address.
function addressFromPubkey(compressedHex) {
  const uncompressed = secp256k1.Point.fromHex(compressedHex).toBytes(false); // 0x04 || X || Y
  const addr = keccak_256(uncompressed.slice(1)).slice(-20);
  return '0x' + Buffer.from(addr).toString('hex');
}

// Minimal bech32 (nsec) -> hex, no checksum validation.
function bech32ToHex(nsec) {
  const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const data = nsec.toLowerCase().split('1').pop().slice(0, -6);
  let bits = 0, val = 0; const out = [];
  for (const c of data) {
    val = (val << 5) | CH.indexOf(c); bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return Buffer.from(out).toString('hex');
}

// --- main -------------------------------------------------------------------

const did = JSON.parse(readFileSync(join(__dir, 'agent.did.json'), 'utf8'));
const vm = did.verificationMethod?.[0];
if (!vm?.publicKeyMultibase) throw new Error('no verificationMethod[0].publicKeyMultibase in agent.did.json');

const compressed = pubkeyFromMultibase(vm.publicKeyMultibase);
const xonly = compressed.slice(2);
const addrLower = addressFromPubkey(compressed);

console.log('DID                 :', did.id);
console.log('Nostr pubkey(x-only):', xonly);
console.log('Compressed pubkey   :', compressed);
console.log(`Rootstock (chain ${chainId})  :`, checksum(addrLower, chainId));
console.log('Plain EIP-55        :', checksum(addrLower, ''));

if (doVerify) {
  let raw;
  try {
    raw = execSync(`git -C ${__dir} config --get nostr.privkey`, { encoding: 'utf8' }).trim();
  } catch {
    console.error('\n[--verify] git config nostr.privkey is not set');
    process.exit(1);
  }
  const dHex = (raw.startsWith('nsec') ? bech32ToHex(raw) : raw.replace(/^0x/, '')).padStart(64, '0');

  const derivedXonly = Buffer.from(schnorr.getPublicKey(hx(dHex))).toString('hex');
  const parity = secp256k1.getPublicKey(hx(dHex), true)[0] === 2 ? 'even (02)' : 'odd (03)';
  const derivedAddr = addressFromPubkey(Buffer.from(secp256k1.getPublicKey(hx(dHex), true)).toString('hex'));

  const pubOk = derivedXonly === xonly;
  const addrOk = derivedAddr === addrLower;

  console.log('\n--- verify against git config nostr.privkey (key never printed) ---');
  console.log('Pubkey matches DID  :', pubOk ? '✓' : '✗ MISMATCH');
  console.log('Raw key y-parity    :', parity);
  console.log('Address matches DID :', addrOk ? '✓ import nsec directly to control this address'
                                              : '✗ raw key derives a different address (even-y mismatch)');
  if (!pubOk || !addrOk) process.exit(1);
}
