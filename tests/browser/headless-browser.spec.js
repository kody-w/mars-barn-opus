// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('LisPy Headless Browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/os.html');
    await page.waitForFunction(() => window.os?.version);
  });

  // ── Browser Engine Availability ──

  test('browser engine exists on window.os', async ({ page }) => {
    const hasBrowser = await page.evaluate(() => typeof window.os.browser === 'object');
    expect(hasBrowser).toBe(true);
  });

  test('browser has all required methods', async ({ page }) => {
    const methods = await page.evaluate(() => 
      ['open','read','readAll','click','type','html','url','title','eval','query','queryAll','wait','history','openVisible']
        .filter(m => typeof window.os.browser[m] === 'function')
    );
    expect(methods).toHaveLength(14);
  });

  // ── Loading Pages ──

  test('browser-open loads a page', async ({ page }) => {
    const result = await page.evaluate(() => window.os.browser.open('/player.html'));
    // Returns a promise — wait for load
    await page.waitForTimeout(2000);
    const url = await page.evaluate(() => window.os.browser.url());
    expect(url).toContain('player.html');
  });

  test('browser tracks URL history', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.os.browser.open('/fleet.html'));
    await page.waitForTimeout(1000);
    const history = await page.evaluate(() => window.os.browser.history());
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0]).toContain('player.html');
    expect(history[1]).toContain('fleet.html');
  });

  // ── Reading DOM ──

  test('browser-read extracts text from selector', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const h2 = await page.evaluate(() => window.os.browser.read('h2'));
    expect(h2).toContain('Mars Barn');
  });

  test('browser-title returns page title', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const title = await page.evaluate(() => window.os.browser.title());
    expect(title).toContain('Mars Barn');
  });

  test('browser-readAll returns array of matched elements', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const cards = await page.evaluate(() => window.os.browser.readAll('.cart-card h3'));
    expect(cards.length).toBeGreaterThanOrEqual(3);
    expect(cards[0]).toContain('Champion');
  });

  test('browser-read returns not-found for missing selector', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.browser.read('.nonexistent'));
    expect(result).toContain('Not found');
  });

  // ── DOM Interaction ──

  test('browser-click dispatches click on element', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.browser.click('.cart-card'));
    expect(result).toContain('Clicked');
  });

  test('browser-type fills input value', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.browser.type('#pasteArea', '(+ 1 2)'));
    expect(result).toContain('Typed');
    const val = await page.evaluate(() => {
      const doc = document.getElementById('vos-browser-frame')?.contentDocument;
      return doc?.querySelector('#pasteArea')?.value;
    });
    expect(val).toBe('(+ 1 2)');
  });

  // ── JavaScript Eval ──

  test('browser-eval runs JS in page context', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.browser.eval('2 + 2'));
    expect(result).toBe('4');
  });

  test('browser-eval accesses page globals', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.browser.eval('document.title'));
    expect(result).toContain('Mars Barn');
  });

  // ── Structured Queries ──

  test('browser-query returns element info', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const info = await page.evaluate(() => window.os.browser.query('h2'));
    expect(info).toBeTruthy();
    expect(info.tag).toBe('H2');
    expect(info.text).toContain('Mars Barn');
  });

  test('browser-query with attribute returns attr value', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const charset = await page.evaluate(() => window.os.browser.query('meta[charset]', 'charset'));
    expect(charset).toBe('UTF-8');
  });

  test('browser-queryAll returns list of elements', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const items = await page.evaluate(() => window.os.browser.queryAll('.cart-card'));
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0].tag).toBe('DIV');
  });

  // ── HTML Extraction ──

  test('browser-html returns full page HTML', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const html = await page.evaluate(() => window.os.browser.html());
    expect(html).toContain('<html');
    expect(html).toContain('Sim Player');
  });

  // ── LisPy VM Integration ──

  test('LisPy (browser-open) works', async ({ page }) => {
    const result = await page.evaluate(() => window.os.exec('(browser-open "/player.html")'));
    expect(result.ok).toBe(true);
    expect(result.result).toContain('loading');
  });

  test('LisPy (browser-title) reads after load', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.exec('(browser-title)'));
    expect(result.ok).toBe(true);
    expect(result.result).toContain('Mars Barn');
  });

  test('LisPy (browser-read) extracts DOM text', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.exec('(browser-read "h2")'));
    expect(result.ok).toBe(true);
    expect(result.result).toContain('Mars Barn');
  });

  test('LisPy (browser-click) dispatches click', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.exec('(browser-click ".cart-card")'));
    expect(result.ok).toBe(true);
    expect(result.result).toContain('Clicked');
  });

  test('LisPy (browser-eval) runs JS in page', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.exec('(browser-eval "1 + 1")'));
    expect(result.ok).toBe(true);
    expect(result.result).toBe('2');
  });

  test('LisPy (browser-url) returns current URL', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.exec('(browser-url)'));
    expect(result.ok).toBe(true);
    expect(result.result).toContain('player.html');
  });

  test('LisPy (browser-read-all) returns list', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.exec('(browser-read-all ".cart-card h3")'));
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.result)).toBe(true);
    expect(result.result.length).toBeGreaterThanOrEqual(3);
  });

  test('LisPy (browser-query) returns structured data', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => window.os.exec('(browser-query "h2")'));
    expect(result.ok).toBe(true);
    expect(result.result).toBeTruthy();
  });

  // ── Full Workflow: Open → Read → Click → Verify ──

  test('full workflow: open page, read, interact', async ({ page }) => {
    // Open the sim player
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);

    // Verify it loaded
    const title = await page.evaluate(() => window.os.browser.title());
    expect(title).toContain('Mars Barn');

    // Read the strategy cards
    const cards = await page.evaluate(() => window.os.browser.readAll('.cart-card h3'));
    expect(cards.length).toBeGreaterThanOrEqual(3);

    // Type a LisPy program into the paste area
    await page.evaluate(() => window.os.browser.type('#pasteArea', '(begin (set! isru_alloc 0.4) (set! greenhouse_alloc 0.35) (set! heating_alloc 0.25))'));

    // Verify it was typed
    const val = await page.evaluate(() => window.os.browser.eval('document.getElementById("pasteArea").value'));
    expect(val).toContain('isru_alloc');
  });

  // ── LisPy Full Script Workflow ──

  test('LisPy script drives browser end-to-end', async ({ page }) => {
    const result = await page.evaluate(() => {
      // This is a complete LisPy program that drives the browser
      return window.os.exec(`
        (begin
          (browser-open "/player.html")
          (define loaded (browser-url))
          (log (concat "Opened: " loaded))
          loaded)
      `);
    });
    expect(result.ok).toBe(true);
    expect(result.output[0]).toContain('Opened');

    // Wait for load then read
    await page.waitForTimeout(2000);
    const title = await page.evaluate(() => window.os.exec('(browser-title)'));
    expect(title.result).toContain('Mars Barn');
  });

  // ── Batch Operations ──

  test('batch command supports browser actions', async ({ page }) => {
    await page.evaluate(() => window.os.browser.open('/player.html'));
    await page.waitForTimeout(2000);

    const results = await page.evaluate(() => window.os.batch([
      {type: 'browser', action: 'title', args: []},
      {type: 'browser', action: 'read', args: ['h2']},
      {type: 'exec', code: '(+ 1 1)'},
    ]));
    expect(results[0]).toContain('Mars Barn');
    expect(results[1]).toContain('Mars Barn');
    expect(results[2].result).toBe(2);
  });
});
