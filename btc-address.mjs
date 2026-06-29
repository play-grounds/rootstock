#!/usr/bin/env node
// btc-address.mjs
//
// Derive Bitcoin TESTNET addresses from the same secp256k1 key as the
// did:nostr identity (read from agent.did.json). Use the legacy P2PKH address
// for a Rootstock PowPeg peg-in: the bridge credits tRBTC to the Rootstock
// address derived from the key that signs the peg-in transaction.
//
// Usage: node btc-address.mjs
// Requires: @noble/hashes

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";

const __dir = dirname(fileURLToPath(import.meta.url));

function pubkeyFromMultibase(mb) {
  if (mb[0] !== "f") throw new Error(`unsupported multibase prefix: ${mb[0]}`);
  let hex = mb.slice(1);
  if (hex.startsWith("e701")) hex = hex.slice(4);
  return hex; // 33-byte compressed pubkey hex
}

const hash160 = (b) => ripemd160(sha256(b));

// --- base58check (legacy addresses) ---
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}
function base58check(payload) {
  const cs = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload); full.set(cs, payload.length);
  return base58(full);
}
function p2pkh(pubkey, version) {
  const h = hash160(pubkey);
  const payload = new Uint8Array(1 + h.length);
  payload[0] = version; payload.set(h, 1);
  return base58check(payload);
}

// --- bech32 (segwit v0, P2WPKH) ---
const CHARS = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}
function hrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}
function convertbits(data, from, to, pad) {
  let acc = 0, bits = 0; const out = [];
  const maxv = (1 << to) - 1;
  for (const value of data) {
    acc = (acc << from) | value; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
  return out;
}
function bech32Encode(hrp, data) {
  const values = hrpExpand(hrp).concat(data);
  const mod = polymod(values.concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const checksum = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + data.concat(checksum).map((d) => CHARS[d]).join("");
}
function p2wpkh(pubkey, hrp) {
  const prog = hash160(pubkey);
  return bech32Encode(hrp, [0].concat(convertbits([...prog], 8, 5, true)));
}

// --- main ---
const did = JSON.parse(readFileSync(join(__dir, "agent.did.json"), "utf8"));
const compressedHex = pubkeyFromMultibase(did.verificationMethod[0].publicKeyMultibase);
const pubkey = Uint8Array.from(Buffer.from(compressedHex, "hex"));

console.log("Compressed pubkey       :", compressedHex);
console.log("");
console.log("Bitcoin TESTNET addresses derived from this key:");
console.log("  Legacy  P2PKH (m/n)   :", p2pkh(pubkey, 0x6f), "  <-- use this for PowPeg peg-in");
console.log("  SegWit  P2WPKH (tb1q) :", p2wpkh(pubkey, "tb"));
console.log("");
console.log("Peg-in: send testnet BTC FROM the legacy address above to the PowPeg");
console.log("federation address, then tRBTC is credited 1:1 to your Rootstock address.");
