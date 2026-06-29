const hre = require("hardhat");

const DRIP = hre.ethers.parseEther("0.001"); // per claim
const DAILY_LIMIT = 5n;                       // distinct addresses per UTC day
const FUND = hre.ethers.parseEther("0.05");   // initial balance

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) throw new Error("No signer. Set PRIVATE_KEY (see hardhat.config.js).");
  const fmt = (w) => hre.ethers.formatEther(w);

  console.log("Deployer:", deployer.address);
  console.log("Balance :", fmt(await hre.ethers.provider.getBalance(deployer.address)), "tRBTC");

  console.log(`\nDeploying DailyFaucet (drip=${fmt(DRIP)} tRBTC, limit=${DAILY_LIMIT}/day, fund=${fmt(FUND)})...`);
  const f = await hre.ethers.deployContract("DailyFaucet", [DRIP, DAILY_LIMIT], { value: FUND });
  await f.waitForDeployment();
  const addr = await f.getAddress();

  console.log("DailyFaucet at  :", addr);
  console.log("Balance         :", fmt(await f.balance()), "tRBTC");
  console.log("Remaining today :", (await f.remainingToday()).toString(), "/", DAILY_LIMIT.toString());

  console.log("\nExplorer:", "https://explorer.testnet.rootstock.io/address/" + addr);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
