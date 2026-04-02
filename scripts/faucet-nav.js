/**
 * Playwright-driven faucet navigator.
 * Uses persistent browser profile so sign-in survives across runs.
 * Takes screenshots at each step so I can see what's happening.
 * 
 * Usage: node scripts/faucet-nav.js [step]
 *   step 1: Open Coinbase Developer Portal (create free account)
 *   step 2: Navigate to faucet after sign-in
 *   step 3: Fill address and submit
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ADDRESS = "0x890904Cdd4cEd64877Ba90e75257dAE805E59fa7";
const PROFILE_DIR = path.join(__dirname, "..", ".playwright-profile");
const SCREENSHOT_DIR = path.join(__dirname, "..", ".playwright-profile", "screenshots");

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const step = parseInt(process.argv[2]) || 1;

  // Persistent context = cookies and login survive between runs
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || await context.newPage();

  if (step === 1) {
    // Step 1: Go to Coinbase Developer Portal
    console.log("Step 1: Opening Coinbase Developer Portal...");
    console.log("  This is Base's official faucet (Base is Coinbase's L2).");
    console.log("  Create a free account or sign in.\n");

    await page.goto("https://portal.cdp.coinbase.com/products/faucet", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step1.png"), fullPage: true });
    console.log("  Screenshot saved: .playwright-profile/screenshots/step1.png");
    console.log("\n  ACTION: Sign in or create account, then close the browser.");
    console.log("  Re-run with: node scripts/faucet-nav.js 2");

  } else if (step === 2) {
    // Step 2: Navigate to faucet (should be signed in from step 1)
    console.log("Step 2: Navigating to Base Sepolia faucet...");
    await page.goto("https://portal.cdp.coinbase.com/products/faucet", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step2.png"), fullPage: true });
    console.log("  Screenshot saved: .playwright-profile/screenshots/step2.png");

    // Try to find and fill the address input
    try {
      // Look for input fields
      const inputs = await page.$$("input");
      console.log(`  Found ${inputs.length} input fields`);

      // Try to find a network selector and pick Base Sepolia
      const selects = await page.$$("select, [role='listbox'], [role='combobox']");
      console.log(`  Found ${selects.length} selectors`);

      // Try typing the address into any visible text input
      for (const input of inputs) {
        const type = await input.getAttribute("type");
        const placeholder = await input.getAttribute("placeholder");
        const visible = await input.isVisible();
        if (visible && (type === "text" || type === null || !type)) {
          console.log(`  Trying input: type=${type} placeholder=${placeholder}`);
          await input.fill(ADDRESS);
          console.log(`  ✓ Filled address: ${ADDRESS}`);
          break;
        }
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "step2-filled.png"), fullPage: true });
      console.log("  Screenshot saved: .playwright-profile/screenshots/step2-filled.png");
      console.log("\n  ACTION: Select 'Base Sepolia', verify address, click Send.");
      console.log("  Close browser when done, then run: node scripts/faucet-nav.js 3");
    } catch (e) {
      console.log("  Could not auto-fill. Please fill manually:");
      console.log(`  Address: ${ADDRESS}`);
      console.log(`  Network: Base Sepolia`);
    }

  } else if (step === 3) {
    // Step 3: Check if we got funds
    console.log("Step 3: Checking balance...");
    const { ethers } = require("ethers");
    const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
    const balance = await provider.getBalance(ADDRESS);
    console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

    if (balance > 0n) {
      console.log("\n  ✓ FUNDED! Ready to deploy.");
      console.log("  Run: node scripts/deploy.js");
    } else {
      console.log("\n  ✗ No funds yet. Faucets can take 1-2 min.");
      console.log("  Re-run this step to check again.");
    }
    await context.close();
    return;
  }

  // Wait for browser close
  await new Promise(resolve => {
    context.on("close", resolve);
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
