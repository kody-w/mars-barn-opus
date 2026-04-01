// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('LisPy OS', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/os.html');
    await page.waitForSelector('.desktop');
  });

  test('OS loads with desktop icons', async ({ page }) => {
    const icons = await page.locator('.desktop-icon').count();
    expect(icons).toBeGreaterThanOrEqual(8);
  });

  test('SDK is available on window.os', async ({ page }) => {
    const version = await page.evaluate(() => window.os.version);
    expect(version).toBe('1.0.0');
  });

  test('SDK exec runs LisPy', async ({ page }) => {
    const result = await page.evaluate(() => window.os.exec('(+ 40 2)'));
    expect(result.ok).toBe(true);
    expect(result.result).toBe(42);
  });

  test('SDK exec handles strings', async ({ page }) => {
    const result = await page.evaluate(() => window.os.exec('(concat "hello" " " "world")'));
    expect(result.ok).toBe(true);
    expect(result.result).toBe('hello world');
  });

  test('SDK open/close/apps manages windows', async ({ page }) => {
    await page.evaluate(() => window.os.open('terminal'));
    let apps = await page.evaluate(() => window.os.apps());
    expect(apps).toContain('terminal');

    await page.evaluate(() => window.os.close('terminal'));
    apps = await page.evaluate(() => window.os.apps());
    expect(apps).not.toContain('terminal');
  });

  test('SDK type executes in terminal', async ({ page }) => {
    await page.evaluate(() => window.os.open('terminal'));
    await page.evaluate(() => window.os.type('terminal', '(+ 10 20)'));
    const output = await page.locator('#term-output').textContent();
    expect(output).toContain('30');
  });

  test('SDK env/setEnv reads and writes VM state', async ({ page }) => {
    await page.evaluate(() => window.os.setEnv('test_var', 999));
    const result = await page.evaluate(() => window.os.exec('test_var'));
    expect(result.ok).toBe(true);
    expect(result.result).toBe(999);

    const env = await page.evaluate(() => window.os.env());
    expect(env.test_var).toBe(999);
  });

  test('SDK status returns colony data', async ({ page }) => {
    const status = await page.evaluate(() => window.os.status());
    expect(status.sol).toBeDefined();
    expect(status.crew_alive).toBeGreaterThan(0);
  });

  test('SDK click triggers UI elements', async ({ page }) => {
    await page.evaluate(() => window.os.click('start-menu'));
    // Start menu should exist
    const menu = page.locator('#start-menu');
    expect(await menu.count()).toBe(1);
  });

  test('SDK batch runs multiple commands', async ({ page }) => {
    const results = await page.evaluate(() => window.os.batch([
      { type: 'open', app: 'terminal' },
      { type: 'exec', code: '(+ 1 1)' },
      { type: 'close', app: 'terminal' }
    ]));
    expect(results.length).toBe(3);
  });

  test('SDK loadDistro boots a cartridge', async ({ page }) => {
    const result = await page.evaluate(() => window.os.loadDistro('distros/lispy-os-base.cartridge.json'));
    expect(result).toContain('Loaded');

    // Filesystem should now be available
    const files = await page.evaluate(() => window.os.fs());
    expect(files.length).toBeGreaterThan(0);
  });

  test('SDK cat reads virtual files', async ({ page }) => {
    await page.evaluate(() => window.os.loadDistro('distros/lispy-os-base.cartridge.json'));
    const content = await page.evaluate(() => window.os.cat('/etc/motd'));
    expect(content).toContain('LisPy OS');
  });

  test('SDK run executes virtual programs', async ({ page }) => {
    await page.evaluate(() => window.os.loadDistro('distros/lispy-os-base.cartridge.json'));
    const result = await page.evaluate(() => window.os.run('/bin/hello'));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('Hello from LisPy OS!');
  });

  test('taskbar tracks open apps', async ({ page }) => {
    await page.evaluate(() => window.os.open('terminal'));
    const apps = page.locator('#taskbar-apps .taskbar-app');
    expect(await apps.count()).toBeGreaterThanOrEqual(1);
  });

  test('clock displays in taskbar', async ({ page }) => {
    const clock = await page.locator('#clock').textContent();
    expect(clock).toContain('LisPy OS');
  });
});

