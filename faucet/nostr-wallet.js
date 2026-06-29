// nostr-wallet.js — a minimal EIP-1193 provider backed by a Nostr (secp256k1) key.
//
// PROOF OF CONCEPT, TESTNET ONLY. The private key is used directly in the page to
// sign Rootstock transactions. That's fine for a testnet demo of "your nostr key
// IS your EVM wallet", but for real use the key must live in an extension / NIP-46
// bunker, never in page JS. See the README notes.
//
// Exposes: window.makeNostrWallet(keyHexOrNsec) -> EIP-1193 provider
//          provider.installAsWindowEthereum()  -> sets window.ethereum = provider
//
// Requires the global `ethers` (v6 UMD) to be loaded first.

(function () {
  const RPC = "https://public-node.testnet.rsk.co";
  const CHAIN_ID_HEX = "0x1f"; // 31

  // --- bech32 (nsec) decode -> hex ---
  const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  function nsecToHex(nsec) {
    const data = nsec.toLowerCase().split("1").pop().slice(0, -6);
    let bits = 0, val = 0; const out = [];
    for (const c of data) {
      const idx = B32.indexOf(c);
      if (idx < 0) throw new Error("invalid nsec");
      val = (val << 5) | idx; bits += 5;
      if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
    }
    return out.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function normalizeKey(input) {
    input = input.trim();
    let hex = input.startsWith("nsec") ? nsecToHex(input) : input.replace(/^0x/, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("expected nsec or 64-char hex key");
    return "0x" + hex;
  }

  function makeNostrWallet(keyInput) {
    const pk = normalizeKey(keyInput);
    const rpc = new ethers.JsonRpcProvider(RPC, 31);
    const wallet = new ethers.Wallet(pk, rpc);
    const address = wallet.address;

    const listeners = {};
    const emit = (ev, ...a) => (listeners[ev] || []).forEach((fn) => { try { fn(...a); } catch {} });

    async function request(args) {
      try {
        return await handle(args);
      } catch (e) {
        // Surface a clean EIP-1193 error instead of ethers' "could not coalesce error".
        let msg = e?.shortMessage || e?.info?.error?.message || e?.message || String(e);
        if (e?.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(msg)) {
          msg = "This account has no tRBTC for gas. Fund it with a little gas first " +
                "(a fresh identity can't pay for its own claim — that's what a relayer solves).";
        }
        const err = new Error(msg);
        err.code = typeof e?.code === "number" ? e.code : -32000;
        throw err;
      }
    }

    async function handle({ method, params = [] }) {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [address];
        case "eth_chainId":
          return CHAIN_ID_HEX;
        case "net_version":
          return "31";
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null; // single-chain shim: pretend success
        case "personal_sign": {
          const msg = params[0];
          const bytes = typeof msg === "string" && msg.startsWith("0x") ? ethers.getBytes(msg) : msg;
          return wallet.signMessage(bytes);
        }
        case "eth_signTypedData_v4": {
          const data = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
          const types = { ...data.types }; delete types.EIP712Domain;
          return wallet.signTypedData(data.domain, types, data.message);
        }
        case "eth_sendTransaction": {
          const t = { ...(params[0] || {}) };
          delete t.from;
          if (t.gas && !t.gasLimit) { t.gasLimit = t.gas; }
          delete t.gas;
          // Force legacy gas on Rootstock (no EIP-1559).
          delete t.maxFeePerGas; delete t.maxPriorityFeePerGas;
          t.type = 0;
          if (!t.gasPrice) t.gasPrice = await rpc.send("eth_gasPrice", []);
          const resp = await wallet.sendTransaction(t);
          return resp.hash;
        }
        default:
          // Forward all reads (eth_call, eth_getBalance, eth_getTransactionReceipt, ...)
          return rpc.send(method, params);
      }
    }

    const provider = {
      isNostrWallet: true,
      isMetaMask: false,
      request,
      on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
      removeListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
      // convenience
      address,
      installAsWindowEthereum() {
        window.ethereum = provider;
        setTimeout(() => emit("connect", { chainId: CHAIN_ID_HEX }), 0);
        return provider;
      },
    };
    return provider;
  }

  window.makeNostrWallet = makeNostrWallet;
})();
