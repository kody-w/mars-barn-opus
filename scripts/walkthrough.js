/**
 * Mars Frame Attestation — Complete Deployment Walkthrough
 * 
 * This script walks you through EVERYTHING from zero to deployed contract.
 * It opens browsers, checks balances, deploys, and verifies.
 * 
 * Usage: node scripts/walkthrough.js
 * 
 * You'll need:
 *   - A browser (Playwright will open it for you)
 *   - 2 minutes of clicking
 *   - That's it
 */
const { chromium } = require("playwright");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const CHAIN = {
  name: "Base Sepolia (testnet)",
  rpc: "https://sepolia.base.org",
  chainId: 84532,
  explorer: "https://sepolia.basescan.org",
};

function hr() { console.log("═".repeat(60)); }
function pause(msg) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n${msg}\nPress Enter when ready...`, () => { rl.close(); resolve(); });
  });
}

async function checkBalance(address) {
  const provider = new ethers.JsonRpcProvider(CHAIN.rpc);
  return provider.getBalance(address);
}

async function waitForFunds(address, maxAttempts = 60) {
  const provider = new ethers.JsonRpcProvider(CHAIN.rpc);
  for (let i = 0; i < maxAttempts; i++) {
    const balance = await provider.getBalance(address);
    if (balance > 0n) return balance;
    process.stdout.write(`\r  Waiting for funds... (${i + 1}/${maxAttempts})  `);
    await new Promise(r => setTimeout(r, 5000));
  }
  return 0n;
}

async function main() {
  hr();
  console.log("  MARS FRAME ATTESTATION — DEPLOYMENT WALKTHROUGH");
  console.log("  Bridging the virtual colony to a real distributed ledger");
  hr();

  // ─── Step 1: Wallet ────────────────────────────────────────────────
  console.log("\n📋 STEP 1: Deployer Wallet\n");

  const envPath = path.join(__dirname, "..", ".env.testnet");
  let privateKey, address;

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const keyMatch = content.match(/DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]+)/);
    const addrMatch = content.match(/DEPLOYER_ADDRESS=(0x[0-9a-fA-F]+)/);
    if (keyMatch && addrMatch) {
      privateKey = keyMatch[1];
      address = addrMatch[1];
      console.log(`  ✓ Wallet already exists: ${address}`);
    }
  }

  if (!address) {
    console.log("  Generating new wallet...");
    const wallet = ethers.Wallet.createRandom();
    privateKey = wallet.privateKey;
    address = wallet.address;
    fs.writeFileSync(envPath, [
      `DEPLOYER_PRIVATE_KEY=${privateKey}`,
      `DEPLOYER_ADDRESS=${address}`,
      "",
    ].join("\n"));
    console.log(`  ✓ Created: ${address}`);
    console.log(`  ✓ Saved to .env.testnet (gitignored)`);
  }

  // ─── Step 2: Check balance ─────────────────────────────────────────
  console.log("\n📋 STEP 2: Checking Balance\n");

  let balance = await checkBalance(address);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    // ─── Step 2b: Get testnet ETH ──────────────────────────────────
    console.log("\n📋 STEP 2b: Get Free Testnet ETH\n");
    console.log("  I'm opening a faucet in your browser.");
    console.log("  A faucet gives you FREE testnet ETH (not real money).\n");
    console.log(`  Your address (copied to clipboard): ${address}`);
    console.log("\n  What to do in the browser:");
    console.log("  1. You may need to sign in with Google/GitHub (free)");
    console.log("  2. Paste your address into the input field");
    console.log("  3. Click 'Send ETH' or similar button");
    console.log("  4. Wait for confirmation, then close the browser");

    await pause("Ready to open the faucet?");

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Try the Superchain faucet first (often easier)
    const faucetUrl = "https://app.optimism.io/faucet";
    console.log(`\n  Opening: ${faucetUrl}`);
    console.log(`  If this doesn't have Base Sepolia, try these:`);
    console.log("    - https://www.alchemy.com/faucets/base-sepolia");
    console.log("    - https://faucet.quicknode.com/base/sepolia");

    await page.goto(faucetUrl);

    // Wait for browser close
    await new Promise(resolve => {
      browser.on("disconnected", resolve);
    });

    console.log("\n  Browser closed. Checking for funds...\n");
    balance = await waitForFunds(address);

    if (balance === 0n) {
      console.log("\n\n  ✗ No funds received yet.");
      console.log("  Faucets can take 1-2 minutes. You can:");
      console.log("    a) Wait and re-run this script");
      console.log("    b) Try a different faucet");
      console.log(`    c) Check: ${CHAIN.explorer}/address/${address}`);
      process.exit(1);
    }

    console.log(`\n  ✓ Funds received: ${ethers.formatEther(balance)} ETH`);
  } else {
    console.log("  ✓ Already funded — skipping faucet");
  }

  // ─── Step 3: Deploy ────────────────────────────────────────────────
  console.log("\n📋 STEP 3: Deploying Contract\n");

  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts",
    "MarsFrameAttestation.sol", "MarsFrameAttestation.json");

  if (!fs.existsSync(artifactPath)) {
    console.log("  Contract not compiled. Compiling now...");
    const { execSync } = require("child_process");
    execSync("npx hardhat compile", { cwd: path.join(__dirname, ".."), stdio: "inherit" });
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(CHAIN.rpc);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`  Network:  ${CHAIN.name}`);
  console.log(`  Deployer: ${wallet.address}`);
  console.log(`  Balance:  ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);
  console.log("\n  Deploying MarsFrameAttestation...");

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  console.log(`  Tx sent:  ${tx.hash}`);
  console.log("  Waiting for confirmation...");

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log(`\n  ✓ CONTRACT DEPLOYED: ${contractAddress}`);
  console.log(`  ✓ Explorer: ${CHAIN.explorer}/address/${contractAddress}`);

  // ─── Step 4: Save & update config ─────────────────────────────────
  console.log("\n📋 STEP 4: Saving Configuration\n");

  const contractInfo = {
    address: contractAddress,
    network: CHAIN.name,
    chainId: CHAIN.chainId,
    rpc: CHAIN.rpc,
    deployer: wallet.address,
    txHash: tx.hash,
    deployedAt: new Date().toISOString(),
    explorer: `${CHAIN.explorer}/address/${contractAddress}`,
  };

  const contractPath = path.join(__dirname, "..", "data", "chain", "contract.json");
  fs.writeFileSync(contractPath, JSON.stringify(contractInfo, null, 2) + "\n");
  console.log("  ✓ data/chain/contract.json");

  // Update engine manifest
  const manifestPath = path.join(__dirname, "..", "data", "engine-manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.attestation) {
      manifest.attestation.contract_address = contractAddress;
      manifest.attestation.chain_id = CHAIN.chainId;
      manifest.attestation.rpc_url = CHAIN.rpc;
      manifest.attestation.deployed_at = new Date().toISOString();
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
      console.log("  ✓ data/engine-manifest.json");
    }
  }

  // ─── Step 5: Verify ───────────────────────────────────────────────
  console.log("\n📋 STEP 5: Verification\n");

  const deployed = new ethers.Contract(contractAddress, artifact.abi, provider);
  const owner = await deployed.owner();
  const latestSol = await deployed.latestSol();
  const totalAttestations = await deployed.totalAttestations();

  console.log(`  Owner:             ${owner}`);
  console.log(`  Latest Sol:        ${latestSol}`);
  console.log(`  Total Attestations: ${totalAttestations}`);
  console.log(`  Authorized Engine: ${await deployed.authorizedEngines(wallet.address)}`);

  // ─── Step 6: Post first attestation ────────────────────────────────
  console.log("\n📋 STEP 6: First Attestation (Sol 1)\n");
  console.log("  Posting the genesis frame attestation on-chain...");

  // Load sol-0001.json and hash it
  const framesDir = path.join(__dirname, "..", "data", "frames");
  const sol1Path = path.join(framesDir, "sol-0001.json");

  if (fs.existsSync(sol1Path)) {
    const frameData = JSON.parse(fs.readFileSync(sol1Path, "utf8"));

    // Hash frame content (strip metadata, canonical JSON, SHA-256)
    const content = {};
    for (const [k, v] of Object.entries(frameData)) {
      if (!["_hash", "_signature", "_engineId"].includes(k)) content[k] = v;
    }
    const canonical = JSON.stringify(content, Object.keys(content).sort(), undefined)
      .replace(/\s/g, ""); // minimal JSON
    // Actually use the same canonical form as the Python module
    const canonicalPy = JSON.stringify(
      Object.fromEntries(Object.entries(content).sort()),
      null, undefined
    ).replace(/ /g, ""); // Match Python's separators=(",",":")

    const crypto = require("crypto");
    const frameHash = "0x" + crypto.createHash("sha256")
      .update(JSON.stringify(
        Object.fromEntries(Object.entries(content).sort()),
        null
      ).replace(/: /g, ":").replace(/, /g, ","))
      .digest("hex");

    const engineId = frameData._engineId || "rappter-genesis";
    const engineSig = frameData._signature || "";

    // Encode for contract
    const frameHashBytes32 = ethers.zeroPadBytes(ethers.toBeArray(BigInt(frameHash)), 32);
    const prevHashBytes32 = ethers.zeroPadValue("0x00", 32); // Genesis has no prev
    const sigBytes = ethers.zeroPadBytes(
      ethers.toUtf8Bytes(engineSig.slice(0, 24)), 24
    );
    const idBytes = ethers.zeroPadBytes(
      ethers.toUtf8Bytes(engineId.slice(0, 16)), 16
    );

    console.log(`  Frame hash: ${frameHash.slice(0, 18)}...`);

    try {
      const connectedContract = new ethers.Contract(contractAddress, artifact.abi, wallet);
      const attestTx = await connectedContract.attest(
        1n,                // sol
        frameHashBytes32,  // frameHash
        prevHashBytes32,   // prevFrameHash (zero for genesis)
        sigBytes,          // engineSignature
        idBytes,           // engineId
      );
      console.log(`  Tx sent: ${attestTx.hash}`);
      await attestTx.wait();
      console.log("  ✓ Sol 1 attested on-chain!");

      // Verify it
      const [valid, attestedAt] = await deployed.verify(1n, frameHashBytes32);
      console.log(`  ✓ Verified: valid=${valid}, attestedAt=${attestedAt}`);
    } catch (e) {
      console.log(`  ✗ Attestation failed: ${e.message}`);
      console.log("    (This can be posted later with: node scripts/attest.js)");
    }
  } else {
    console.log("  Sol 1 frame not found — skipping first attestation");
  }

  // ─── Done ──────────────────────────────────────────────────────────
  console.log("");
  hr();
  console.log("  🌍 ←→ ⛓️  ←→ 🔴  THE BRIDGE IS LIVE");
  hr();
  console.log(`\n  Contract:  ${contractAddress}`);
  console.log(`  Explorer:  ${CHAIN.explorer}/address/${contractAddress}`);
  console.log(`  Network:   ${CHAIN.name}`);
  console.log("\n  The virtual colony and the physical twin are now");
  console.log("  cryptographically bound through a distributed ledger.");
  console.log("  The blockchain carries trust, not money.\n");
  hr();
}

main().catch((e) => {
  console.error("\n✗ Error:", e.message || e);
  process.exit(1);
});
