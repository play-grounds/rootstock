const hre = require("hardhat");

// Tunable demo parameters.
const DRIP = hre.ethers.parseEther("0.00001"); // per claim
const COOLDOWN = 3600n; // seconds between claims per address
const FUND = hre.ethers.parseEther("0.0002"); // initial faucet balance

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No signer. Set PRIVATE_KEY (see hardhat.config.js).");

  const fmt = (w) => hre.ethers.formatEther(w);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Wallet  : ${fmt(await hre.ethers.provider.getBalance(deployer.address))} tRBTC`);

  console.log(`\nDeploying Faucet (drip=${fmt(DRIP)} tRBTC, cooldown=${COOLDOWN}s, funding=${fmt(FUND)} tRBTC)...`);
  const faucet = await hre.ethers.deployContract("Faucet", [DRIP, COOLDOWN], { value: FUND });
  await faucet.waitForDeployment();
  const addr = await faucet.getAddress();
  console.log(`Faucet deployed at: ${addr}`);
  console.log(`Faucet balance    : ${fmt(await faucet.balance())} tRBTC`);

  // Demo: a successful claim, then an immediate second claim that must revert.
  console.log("\n--- claim #1 (expect success) ---");
  const before = await hre.ethers.provider.getBalance(deployer.address);
  const tx = await faucet.claim();
  const rc = await tx.wait();
  const after = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`claim() mined in block ${rc.blockNumber}`);
  console.log(`Faucet balance now: ${fmt(await faucet.balance())} tRBTC`);
  console.log(`Wallet delta      : ${fmt(after - before)} tRBTC (drip minus gas)`);

  console.log("\n--- claim #2 immediately (expect cooldown revert) ---");
  try {
    const tx2 = await faucet.claim();
    await tx2.wait();
    console.log("claim #2 unexpectedly succeeded");
  } catch (e) {
    const reason = e.shortMessage || e.message;
    console.log(`Reverted as expected: ${reason.split("\n")[0]}`);
  }

  const base = hre.network.config.chainId === 31
    ? "https://explorer.testnet.rootstock.io"
    : "https://explorer.rootstock.io";
  console.log(`\nExplorer: ${base}/address/${addr}`);
  console.log(`Verify  : npx hardhat verify --network ${hre.network.name} ${addr} ${DRIP} ${COOLDOWN}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
