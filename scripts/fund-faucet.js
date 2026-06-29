const hre = require("hardhat");

const FAUCET = "0x12511FaC6eD07d44A565d3935d52b0F3e9135CCd";
const AMOUNT = process.env.AMOUNT || "0.1"; // tRBTC

async function main() {
  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer. PRIVATE_KEY=$(git config nostr.privkey) npm run fund");

  const faucet = await hre.ethers.getContractAt(
    ["function balance() view returns (uint256)"],
    FAUCET,
    signer
  );
  const fmt = (w) => hre.ethers.formatEther(w);

  console.log("Funder        :", signer.address);
  console.log("Funder balance:", fmt(await hre.ethers.provider.getBalance(signer.address)), "tRBTC");
  console.log("Faucet before :", fmt(await faucet.balance()), "tRBTC");

  console.log(`\nFunding ${AMOUNT} tRBTC...`);
  // The contract funds via receive() — send a plain value transfer (empty calldata).
  const tx = await signer.sendTransaction({ to: FAUCET, value: hre.ethers.parseEther(AMOUNT) });
  console.log("tx:", tx.hash);
  await tx.wait();

  console.log("Faucet after  :", fmt(await faucet.balance()), "tRBTC");
  console.log("Explorer      : https://explorer.testnet.rootstock.io/tx/" + tx.hash);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
