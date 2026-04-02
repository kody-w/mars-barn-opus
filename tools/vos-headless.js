#!/usr/bin/env node
/**
 * vOS Headless — Drive the LisPy OS from the command line.
 *
 * Boots os.html in a headless Chromium via Playwright,
 * then provides a LisPy REPL that can control everything:
 * the VM, the browser-within-browser, the gauntlet, apps, files.
 *
 * Usage:
 *   node tools/vos-headless.js                    # interactive REPL
 *   node tools/vos-headless.js --eval '(+ 2 3)'   # evaluate and exit
 *   node tools/vos-headless.js --script prog.lispy # run a file
 *   node tools/vos-headless.js --gauntlet 100      # run gauntlet
 *   node tools/vos-headless.js --headed            # visible browser
 *
 * The REPL supports all LisPy + browser builtins:
 *   (browser-open "http://localhost:8787/player.html")
 *   (browser-read "h1")
 *   (browser-click ".play-btn")
 *   (browser-eval "document.title")
 *   (+ 2 3)
 *   (log (concat "Sol " (string sol)))
 *
 * This IS the vOS running headless. Same VM. Same SDK. Same browser.
 * A LisPy program that works in the terminal works in the browser. 1:1.
 */

const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const OS_URL = process.env.VOS_URL || 'http://localhost:8787/os.html';

async function boot(opts = {}) {
  const browser = await chromium.launch({
    headless: !opts.headed,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();

  console.log(`🖥️  Booting vOS from ${OS_URL}...`);
  await page.goto(OS_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for window.os to be available
  await page.waitForFunction(() => window.os && window.os.version, { timeout: 10000 });
  const version = await page.evaluate(() => window.os.version);
  console.log(`✅ vOS ${version} online. LisPy VM + Browser engine ready.`);
  console.log(`   Type LisPy expressions or (help) for commands.`);
  console.log(`   Browser: (browser-open "url") (browser-read "sel") (browser-click "sel")`);
  console.log(`   Ctrl+C to exit.\n`);

  return { browser, page };
}

async function exec(page, code) {
  try {
    const result = await page.evaluate((c) => {
      const r = window.os.exec(c);
      return {
        ok: r.ok,
        result: r.result !== undefined ? String(r.result) : null,
        output: r.output || [],
        error: r.error || null
      };
    }, code);
    return result;
  } catch (e) {
    return { ok: false, error: e.message, output: [] };
  }
}

async function execBrowserCmd(page, method, args) {
  try {
    const result = await page.evaluate(({m, a}) => {
      const fn = window.os.browser[m];
      if (!fn) return `Unknown browser method: ${m}`;
      const r = fn.apply(window.os.browser, a);
      return r instanceof Promise ? 'async (use browser builtins in LisPy instead)' : r;
    }, {m: method, a: args});
    return result;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

async function repl(page) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[33mλ>\x1b[0m ',
    terminal: true
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const code = line.trim();
    if (!code) { rl.prompt(); return; }

    if (code === 'quit' || code === 'exit') {
      console.log('👋 vOS shutdown.');
      process.exit(0);
    }

    // Special CLI commands
    if (code === '.status') {
      const status = await page.evaluate(() => window.os.status());
      console.log(status);
      rl.prompt(); return;
    }
    if (code === '.apps') {
      const apps = await page.evaluate(() => window.os.apps());
      console.log(apps);
      rl.prompt(); return;
    }
    if (code === '.env') {
      const env = await page.evaluate(() => window.os.env());
      console.log(env);
      rl.prompt(); return;
    }
    if (code === '.fs') {
      const files = await page.evaluate(() => window.os.fs());
      console.log(files);
      rl.prompt(); return;
    }
    if (code.startsWith('.screenshot')) {
      const fname = code.split(' ')[1] || 'vos-screenshot.png';
      await page.screenshot({ path: fname });
      console.log(`📸 Saved: ${fname}`);
      rl.prompt(); return;
    }

    // Execute as LisPy
    const result = await exec(page, code);
    if (result.ok) {
      if (result.output.length) {
        result.output.forEach(l => console.log(`\x1b[32m${l}\x1b[0m`));
      }
      if (result.result !== null && result.result !== 'undefined') {
        console.log(`\x1b[36m→ ${result.result}\x1b[0m`);
      }
    } else {
      console.log(`\x1b[31m✗ ${result.error}\x1b[0m`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 vOS shutdown.');
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const opts = {
    headed: args.includes('--headed'),
    eval: null,
    script: null,
    gauntlet: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--eval' && args[i+1]) opts.eval = args[++i];
    if (args[i] === '--script' && args[i+1]) opts.script = args[++i];
    if (args[i] === '--gauntlet' && args[i+1]) opts.gauntlet = parseInt(args[++i]);
  }

  const { browser, page } = await boot(opts);

  try {
    if (opts.eval) {
      const result = await exec(page, opts.eval);
      if (result.ok) {
        result.output.forEach(l => console.log(l));
        if (result.result) console.log(result.result);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    } else if (opts.script) {
      const code = fs.readFileSync(opts.script, 'utf8');
      const result = await exec(page, code);
      if (result.ok) {
        result.output.forEach(l => console.log(l));
        if (result.result) console.log(result.result);
      } else {
        console.error('Error:', result.error);
        process.exit(1);
      }
    } else if (opts.gauntlet) {
      console.log(`⚔️ Running ${opts.gauntlet} gauntlet simulations...`);
      const result = await page.evaluate((n) => window.os.gauntlet(n), opts.gauntlet);
      console.log(JSON.stringify(result, null, 2));
    } else {
      await repl(page);
      return; // Don't close — REPL handles exit
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
