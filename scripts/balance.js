const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer. Set PRIVATE_KEY (see hardhat.config.js).");
  const wei = await hre.ethers.provider.getBalance(signer.address);
  console.log(`${signer.address}: ${hre.ethers.formatEther(wei)} tRBTC`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
