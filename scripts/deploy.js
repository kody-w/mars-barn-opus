/**
 * Deploy MarsFrameAttestation to Base L2.
 * 
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.js --network base-sepolia
 *   DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.js --network base-mainnet
 * 
 * The contract address is written to data/chain/contract.json after deployment.
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("═".repeat(60));
  console.log("Mars Frame Attestation — Contract Deployment");
  console.log("═".repeat(60));
  console.log(`Network:  ${network.name} (chain ID ${network.chainId})`);
  console.log(`Deployer: ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error("\n✗ Deployer has no ETH. Get testnet ETH from a faucet first.");
    process.exit(1);
  }

  console.log("\nDeploying MarsFrameAttestation...");
  const Factory = await ethers.getContractFactory("MarsFrameAttestation");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  console.log(`\n✓ Deployed at: ${address}`);
  console.log(`  Tx hash:     ${deployTx.hash}`);
  console.log(`  Block:       ${deployTx.blockNumber || "pending"}`);

  // Write contract info to data/chain/contract.json
  const contractInfo = {
    address: address,
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    txHash: deployTx.hash,
    deployedAt: new Date().toISOString(),
    abi: "artifacts/contracts/MarsFrameAttestation.sol/MarsFrameAttestation.json",
  };

  const contractPath = path.join(__dirname, "..", "data", "chain", "contract.json");
  fs.writeFileSync(contractPath, JSON.stringify(contractInfo, null, 2));
  console.log(`\n✓ Contract info saved to data/chain/contract.json`);

  // Update engine manifest with the contract address
  const manifestPath = path.join(__dirname, "..", "data", "engine-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.attestation) {
      manifest.attestation.contract_address = address;
      manifest.attestation.chain_id = Number(network.chainId);
      manifest.attestation.deployed_at = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log("✓ Engine manifest updated with contract address");
    }
  }

  // Explorer link
  const explorer = Number(network.chainId) === 84532
    ? `https://sepolia.basescan.org/address/${address}`
    : `https://basescan.org/address/${address}`;
  console.log(`\n🔗 Explorer: ${explorer}`);

  console.log("\n" + "═".repeat(60));
  console.log("The bridge is live. The chain witnesses the frames.");
  console.log("═".repeat(60));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
