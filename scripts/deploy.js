const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer. Provide a key, e.g.: PRIVATE_KEY=$(git config nostr.privkey) npm run deploy:testnet"
    );
  }

  const net = hre.network.name;
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Network : ${net} (chainId ${hre.network.config.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance : ${hre.ethers.formatEther(balance)} ${net.includes("estnet") ? "tRBTC" : "RBTC"}`);

  console.log("\nDeploying Storage...");
  const storage = await hre.ethers.deployContract("Storage");
  await storage.waitForDeployment();
  const address = await storage.getAddress();
  console.log(`Storage deployed at: ${address}`);

  // Smoke test: write then read.
  const tx = await storage.set(42);
  await tx.wait();
  const value = await storage.get();
  console.log(`set(42) -> get() = ${value.toString()}`);

  const base =
    hre.network.config.chainId === 31
      ? "https://explorer.testnet.rootstock.io"
      : "https://explorer.rootstock.io";
  console.log(`\nExplorer: ${base}/address/${address}`);
  console.log(`Verify  : npx hardhat verify --network ${net} ${address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
