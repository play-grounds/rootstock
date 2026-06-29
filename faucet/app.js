// Rootstock Testnet DailyFaucet — front-end.
// Read-only data loads from the public RPC; claiming needs a wallet
// (MetaMask, or the Nostr-key EIP-1193 shim in nostr-wallet.js).

const FAUCET_ADDRESS = "0x0eb6BEeaFa7b1754B58378D1ba41BC7BF0bFD6E3"; // DailyFaucet

const CHAIN = {
  chainId: "0x1f", // 31
  chainName: "Rootstock Testnet",
  nativeCurrency: { name: "Testnet RBTC", symbol: "tRBTC", decimals: 18 },
  rpcUrls: ["https://public-node.testnet.rsk.co"],
  blockExplorerUrls: ["https://explorer.testnet.rootstock.io"],
};
const EXPLORER = CHAIN.blockExplorerUrls[0];

const ABI = [
  "function claim()",
  "function balance() view returns (uint256)",
  "function dripAmount() view returns (uint256)",
  "function dailyLimit() view returns (uint256)",
  "function remainingToday() view returns (uint256)",
  "function claimedToday(address) view returns (bool)",
];

const $ = (id) => document.getElementById(id);
const fmt = (wei) => Number(ethers.formatEther(wei));
const trbtc = (wei) => `${fmt(wei).toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const readProvider = new ethers.JsonRpcProvider(CHAIN.rpcUrls[0], 31);
let signer = null, account = null, loginMode = "metamask";

function setStatus(msg, cls = "") { const el = $("status"); el.className = `status ${cls}`; el.innerHTML = msg; }

$("contractLink").textContent = short(FAUCET_ADDRESS);
$("contractLink").href = `${EXPLORER}/address/${FAUCET_ADDRESS}`;

async function loadFaucetStats() {
  try {
    const c = new ethers.Contract(FAUCET_ADDRESS, ABI, readProvider);
    const [bal, drip, limit, left] = await Promise.all([
      c.balance(), c.dripAmount(), c.dailyLimit(), c.remainingToday(),
    ]);
    $("faucetBalance").textContent = trbtc(bal);
    $("dripAmount").textContent = trbtc(drip);
    $("dailyLimit").textContent = limit.toString();
    $("remaining").textContent = `${left}/${limit}`;
  } catch (e) { $("faucetBalance").textContent = "err"; console.error(e); }
}

async function refreshAccount() {
  if (!account) return;
  const c = new ethers.Contract(FAUCET_ADDRESS, ABI, readProvider);
  const [myBal, claimed, left] = await Promise.all([
    readProvider.getBalance(account), c.claimedToday(account), c.remainingToday(),
  ]);
  $("myBalance").textContent = `${trbtc(myBal)} tRBTC`;
  const empty = left === 0n;
  $("claimStatus").textContent = claimed ? "already claimed today" : empty ? "daily cap reached" : "eligible";
  $("claimBtn").disabled = claimed || empty;
  $("claimBtn").textContent = claimed ? "Come back tomorrow" : empty ? "Daily cap reached" : "Claim drip";
}

async function ensureNetwork(eth) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN.chainId }] });
  } catch (e) {
    if (e.code === 4902) await eth.request({ method: "wallet_addEthereumChain", params: [CHAIN] });
    else if (e.code !== 4001) throw e;
  }
}

async function connect() {
  const eth = window.ethereum;
  if (!eth) { alert("MetaMask not found. Install it, or log in with a Nostr key."); return; }
  await eth.request({ method: "eth_requestAccounts" });
  await ensureNetwork(eth);
  const bp = new ethers.BrowserProvider(eth);
  signer = await bp.getSigner();
  account = await signer.getAddress();

  $("connectView").classList.add("hidden");
  $("accountView").classList.remove("hidden");
  $("acct").textContent = short(account);
  $("netPill").textContent = loginMode === "nostr" ? "Nostr key → Rootstock (PoC)" : "Rootstock Testnet · connected";
  await refreshAccount();

  eth.on?.("accountsChanged", () => location.reload());
  eth.on?.("chainChanged", () => location.reload());
}

async function nostrLogin() {
  const key = $("nsecInput").value;
  if (!key) return;
  try {
    window.makeNostrWallet(key).installAsWindowEthereum();
    $("nsecInput").value = "";
    loginMode = "nostr";
    await connect();
  } catch (e) {
    $("connectHint").className = "status err";
    $("connectHint").textContent = "✗ " + (e.message || e);
  }
}

async function claim() {
  try {
    setStatus("Sending claim…");
    $("claimBtn").disabled = true;
    const c = new ethers.Contract(FAUCET_ADDRESS, ABI, signer);
    const tx = await c.claim();
    setStatus(`Submitted: <a target="_blank" href="${EXPLORER}/tx/${tx.hash}">${short(tx.hash)}</a> — waiting…`);
    await tx.wait();
    setStatus(`✓ Claimed ${trbtc(await c.dripAmount())} tRBTC! <a target="_blank" href="${EXPLORER}/tx/${tx.hash}">${short(tx.hash)}</a>`, "ok");
    await Promise.all([loadFaucetStats(), refreshAccount()]);
  } catch (e) {
    setStatus(`✗ ${e.shortMessage || e.message}`, "err");
    await refreshAccount();
  }
}

$("connectBtn").addEventListener("click", () => { loginMode = "metamask"; connect(); });
$("claimBtn").addEventListener("click", claim);
$("nostrToggle").addEventListener("click", (e) => { e.preventDefault(); $("nostrLogin").classList.toggle("hidden"); });
$("nostrGoBtn").addEventListener("click", nostrLogin);
$("nsecInput").addEventListener("keydown", (e) => { if (e.key === "Enter") nostrLogin(); });

loadFaucetStats();
setInterval(() => { loadFaucetStats(); refreshAccount(); }, 15000);
