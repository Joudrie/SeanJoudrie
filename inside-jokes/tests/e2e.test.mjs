// Browser tests: the whole game in headless Chromium at phone width.
// Run: node --test tests/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
let server, url, browser;

before(async () => {
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = path.endsWith('/') ? path + 'index.html' : path;
    try {
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
  // Cloud sandboxes ship Chromium here; CI installs Playwright's own.
  const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  browser = await chromium.launch({ executablePath });
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function open(hash = '', { reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, reducedMotion });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.slice(0, -1) });
  // Google Fonts aren't needed for the tests.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + hash);
  return { page, ctx, errors };
}
const pick = async (page, words) => { for (const w of words) await page.click(`.tile[data-word="${w}"]`); };
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

const GROUPS = [
  ['Traffic', 'Parking', 'Alarm', 'Uber'],
  ['Jerky', 'Twizzlers', 'Sunflower seeds', 'Gas station sushi'],
  ['Lost keys', 'Dead phone', 'Wrong exit', 'Venmo requests'],
  ['Game', 'Trivia', 'Karaoke', 'Taco'],
];

test('the example: labelled, one away, repeats, a win and the share text', async () => {
  const { page, ctx, errors } = await open();
  assert.equal(await page.isVisible('#p-example'), true);
  assert.equal(await page.locator('.tile').count(), 16);
  assert.ok(await noSideScroll(page));

  await pick(page, ['Traffic', 'Parking', 'Alarm', 'Taco']);
  await page.click('#submit');
  assert.equal(await page.textContent('#toast'), 'One away.');
  assert.equal(await page.locator('.dot--used').count(), 1);
  // The same four again costs nothing.
  await page.click('#submit');
  assert.equal(await page.textContent('#toast'), 'Already guessed.');
  assert.equal(await page.locator('.dot--used').count(), 1);

  await page.click('#deselect');
  assert.equal(await page.locator('.tile[aria-pressed="true"]').count(), 0);
  for (const g of GROUPS) {
    await pick(page, g);
    await page.click('#submit');
  }
  assert.equal(await page.locator('.group').count(), 4);
  assert.match(await page.textContent('.group[data-g="0"] .group__why'), /Example story/);
  assert.equal(await page.isVisible('#end'), true);
  assert.equal(await page.textContent('#end-title'), 'Solved.');
  await page.click('#copy-result');
  await page.waitForSelector('#copy-status:not(:empty)');
  const shared = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(shared.split('\n').length, 1 + 5 + 1);

  // Progress survives a reload; Play again clears it.
  await page.reload();
  assert.equal(await page.isVisible('#end'), true);
  await page.click('#replay');
  assert.equal(await page.locator('.tile').count(), 16);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('four mistakes lose and show every group', async () => {
  const { page, ctx, errors } = await open('', { reducedMotion: 'reduce' });
  const wrong = [
    ['Traffic', 'Jerky', 'Lost keys', 'Game'],
    ['Parking', 'Twizzlers', 'Dead phone', 'Trivia'],
    ['Alarm', 'Sunflower seeds', 'Wrong exit', 'Karaoke'],
    ['Uber', 'Gas station sushi', 'Venmo requests', 'Taco'],
  ];
  for (const w of wrong) {
    await pick(page, w);
    await page.click('#submit');
    if (await page.locator('.tile[aria-pressed="true"]').count()) await page.click('#deselect');
  }
  assert.equal(await page.textContent('#end-title'), 'Out of mistakes');
  assert.equal(await page.locator('.group').count(), 4);
  assert.equal(await page.isVisible('#play-actions'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('make a puzzle, get its link, and play it; a cut link says so', async () => {
  const { page, ctx, errors } = await open('#make');
  assert.ok(await noSideScroll(page));
  await page.click('#m-play');
  assert.ok(await page.locator('#problems li').count() > 0);

  await page.fill('#m-name', 'Lake house');
  const groups = [
    ['Things Dave lost', ['Keys', 'Wallet', 'Dignity', 'Kayak']],
    ['Car nicknames', ['Big Blue', 'The Tank', 'Grandma', 'Old Faithful']],
    ['Banned words', ['Moist', 'Synergy', 'Vibes', 'Crunchy']],
    ['Karaoke songs', ['Mr. Brightside', 'Toxic', 'Africa', 'Keys']],
  ];
  for (const [g, [name, words]] of groups.entries()) {
    await page.fill(`#m-g${g}-name`, name);
    for (const [i, w] of words.entries()) await page.fill(`#m-g${g}-w${i}`, w);
  }
  assert.match(await page.textContent('#problems'), /"Keys" is in two groups/);
  assert.equal(await page.getAttribute('#m-g3-w3', 'aria-invalid'), 'true');
  await page.fill('#m-g3-w3', 'Wannabe');
  await page.fill('#m-g0-why', 'All in one weekend.');
  assert.equal(await page.locator('#problems li').count(), 0);

  await page.click('#m-copy');
  const link = await page.inputValue('#m-link');
  assert.match(link, /#p=[\w-]+$/);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), link);

  // The draft is still there after a reload.
  await page.reload();
  assert.equal(await page.inputValue('#m-g3-w3'), 'Wannabe');

  await page.goto(link);
  assert.equal(await page.textContent('#p-title'), 'Lake house');
  assert.equal(await page.isVisible('#p-example'), false);
  await pick(page, ['Keys', 'Wallet', 'Dignity', 'Kayak']);
  await page.click('#submit');
  assert.equal(await page.textContent('.group__why'), 'All in one weekend.');

  await page.goto(link.slice(0, -10));
  assert.equal(await page.isVisible('#s-broken'), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});
