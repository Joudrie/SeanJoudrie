// Browser tests: the whole game in headless Chromium at phone width, against
// fake Spotify, Deezer, reader-function and image servers (tests/helpers.mjs).
// Audio runs under the strict autoplay rule phones use, so a clip started
// outside a tap would fail here too. Run: node --test tests/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, mock, zip, playwright } from './helpers.mjs';

let browser;
let site;

before(async () => {
  site = await serve();
  const { chromium } = await playwright();
  browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
});
after(async () => {
  await browser?.close();
  site?.server.close();
});

// A fresh page with the fakes installed. `state` can change mid-test.
async function open({ width = 375, reducedMotion = 'no-preference', state = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 820 }, reducedMotion });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(site.url).origin });
  await mock(ctx, state);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(site.url);
  return { page, ctx, errors, state };
}
const text = (page, sel) => page.textContent(sel).then((t) => t.trim());
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('links: bad, private, Spotify (first 100) and Apple (every song)', async () => {
  const { page, ctx, errors } = await open();
  await page.fill('#link', 'hello there');
  await page.click('#add-btn');
  await page.waitForSelector('#error:not([hidden])');
  assert.match(await text(page, '#error'), /Spotify or Apple Music playlist link/);

  await page.fill('#link', 'https://open.spotify.com/playlist/TOOLONGccccccccccccccccc');
  await page.click('#add-btn');
  await page.waitForFunction(() => /look like/.test(document.getElementById('error').textContent));

  await page.fill('#link', 'https://open.spotify.com/playlist/PRIVATEcccccccccccccc0');
  await page.click('#add-btn');
  await page.waitForFunction(() => /isn’t public/.test(document.getElementById('error').textContent));

  // Paste button reads the clipboard and adds straight away.
  await page.evaluate(() => navigator.clipboard.writeText('https://open.spotify.com/playlist/SUMMERdddddddddddddddd?si=abc'));
  await page.click('#paste-btn');
  await page.waitForSelector('.reserve');
  assert.match(await text(page, '#reserves .pl__meta'), /^100 of 155 songs/);
  assert.equal(await text(page, '.reserve__note summary'), 'How to get all 155 songs');

  await page.fill('#link', 'https://music.apple.com/us/playlist/pl.u-06oxxAgupp0B61');
  await page.click('#add-btn');
  await page.waitForFunction(() => /191 songs/.test(document.getElementById('link-status').textContent));
  assert.match(await text(page, '#reserves .pl__meta'), /^191 songs · by Apple Music/);

  await page.fill('#link', 'https://music.apple.com/us/playlist/pl.u-missing');
  await page.click('#add-btn');
  await page.waitForFunction(() => /Apple Music says/.test(document.getElementById('error').textContent));

  assert.equal(await text(page, '#home-summary'), '2 playlists · 291 songs');
  assert.ok(await noSideScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ready-made playlists: picking a decade adds it', async () => {
  const { page, ctx, errors } = await open();
  await page.selectOption('#preset', { label: '’80s hits' });
  await page.waitForFunction(() => /Added/.test(document.getElementById('preset-status').textContent));
  assert.match(await text(page, '#preset-status'), /’80s Hits Essentials.*100 songs/);
  assert.equal(await page.inputValue('#preset'), '');
  assert.equal(await text(page, '#home-summary'), '1 playlist · 100 songs');
  // Picking it again updates it instead of adding a copy.
  await page.selectOption('#preset', { label: '’80s hits' });
  await page.waitForFunction(() => /Updated/.test(document.getElementById('preset-status').textContent));
  assert.equal(await text(page, '#reserves-count'), '1 reserve');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Spotify library: sign in, add own (full) and a friend’s (first 100), survives reload', async () => {
  const { page, ctx, errors } = await open();
  await page.click('#library-btn');
  await page.waitForSelector('#s-library:not([hidden]) .pl');
  await page.click('#playlists .pl >> nth=0');
  await page.waitForFunction(() => /In reserves/.test(document.querySelector('#playlists .pl__meta').textContent));
  await page.click('#playlists .pl >> nth=1');
  await page.waitForFunction(() => /In reserves/.test(document.querySelectorAll('#playlists .pl__meta')[1].textContent));
  await page.click('#done-btn');
  const metas = await page.$$eval('#reserves .pl__meta', (e) => e.map((x) => x.textContent));
  assert.deepEqual(metas, ['100 of 155 songs · by kyle', '155 songs · by seanjoudrie']);
  // Own songs 0–154 plus the friend's 100–199: 200 unique.
  assert.equal(await text(page, '#home-summary'), '2 playlists · 200 songs');
  await page.reload();
  assert.equal(await text(page, '#home-summary'), '2 playlists · 200 songs');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('file import: Exportify zip, re-upload replaces, bad file errors', async () => {
  const { page, ctx, errors } = await open();
  const head = '"Track URI","Track Name","Artist Name(s)","Album Image URL","Track Duration (ms)"\n';
  const rows = (p, n) => head + Array.from({ length: n }, (_, i) => `"spotify:track:${(p + i).padEnd(22, 'x')}","${p} Song ${i}","Artist ${i % 3}","https://i.scdn.co/${p}","200000"`).join('\n') + '\n';
  const file = { name: 'spotify_playlists.zip', mimeType: 'application/zip', buffer: Buffer.from(zip({ 'road_trip.csv': rows('rt', 60), 'chill.csv': rows('ch', 40) })) };
  await page.setInputFiles('#file-input', file);
  await page.waitForFunction(() => /Added 2 playlists/.test(document.getElementById('file-status').textContent));
  assert.equal(await text(page, '#file-status'), 'Added 2 playlists (100 songs). Tap the ones you want to play.');
  assert.equal(await page.$$eval('#reserves .pl[aria-pressed="true"]', (e) => e.length), 0);
  await page.setInputFiles('#file-input', file);
  await page.waitForFunction(() => /Added 2 playlists/.test(document.getElementById('file-status').textContent));
  assert.equal(await text(page, '#reserves-count'), '2 reserves');
  await page.setInputFiles('#file-input', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForSelector('#error:not([hidden])');
  assert.match(await text(page, '#error'), /No playlists found/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a round: clip lengths, wrong, skip, right, reveal, score, end', async () => {
  const { page, ctx, errors } = await open();
  await page.fill('#link', 'https://open.spotify.com/playlist/SUMMERdddddddddddddddd');
  await page.click('#add-btn');
  await page.waitForSelector('.reserve');
  await page.click('#play-btn');
  await page.waitForFunction(() => !document.getElementById('clip-btn').disabled);
  assert.equal(await text(page, '#clip-label'), 'Play 1 second');

  await page.click('#clip-btn');
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => audio.currentTime);
  assert.ok(await page.evaluate(() => audio.paused), 'the 1-second clip stops');
  assert.ok(t >= 0.95 && t < 1.3, 'stopped at about 1s, got ' + t);
  assert.notEqual(await page.evaluate(() => game.clip.preview), 'https://cdn.test/karaoke.wav', 'karaoke decoy is never picked');

  // A wrong guess plays the 2-second clip straight away (inside the tap).
  await page.fill('#guess', 'zzz wrong');
  await page.click('#submit-btn');
  await page.waitForTimeout(400);
  assert.ok(!(await page.evaluate(() => audio.paused)), 'the longer clip plays after a wrong guess');
  assert.equal(await text(page, '#clip-label'), 'Play 2 seconds');
  assert.equal(await text(page, '.attempt--wrong .attempt__tag'), 'Wrong');

  await page.click('#skip-btn');
  await page.waitForTimeout(400);
  assert.ok(!(await page.evaluate(() => audio.paused)), 'the longer clip plays after a skip');
  assert.equal(await text(page, '#clip-label'), 'Play 4 seconds');
  await page.waitForTimeout(3800);
  const columns = await page.evaluate(() => {
    const c = document.getElementById('meter');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // Columns whose bar rises above a quarter of the meter (the baseline is
    // under a tenth), i.e. drawn from the audio rather than flat.
    let tall = 0;
    for (let x = 0; x < c.width; x += 2) {
      for (let y = 0; y < c.height * 0.75; y++) if (d[(y * c.width + x) * 4 + 3]) { tall++; break; }
    }
    return tall;
  });
  assert.ok(columns > 5, 'the meter drew the clip’s real energy (' + columns + ' tall columns)');

  // Right answer through the suggestions.
  const title = await page.evaluate(() => Text.clean(game.song.title));
  await page.fill('#guess', title);
  await page.locator('.suggest__item', { hasText: title }).first().click();
  await page.click('#submit-btn');
  await page.waitForSelector('#s-reveal:not([hidden])');
  assert.equal(await page.getAttribute('#reveal-title', 'aria-label'), title, 'screen readers get the real title at once');
  await page.waitForTimeout(1200);
  assert.equal(await text(page, '#reveal-title'), title);
  assert.equal(await text(page, '#reveal-result'), 'Got it in 4 seconds.');
  assert.equal(await text(page, '#reveal-score'), '60');
  assert.deepEqual(await page.$$eval('#reveal-strip li', (e) => e.map((x) => x.className || '-')), ['is-wrong', 'is-skip', 'is-right', '-', '-', '-']);
  assert.ok(!(await page.evaluate(() => audio.paused)), 'the full clip plays on the reveal');

  // Give up on the rest quickly to reach the end screen.
  for (let n = 0; n < 150; n++) {
    await page.click('#next-btn');
    await page.waitForFunction(() => !document.getElementById('s-done').hidden || !document.getElementById('clip-btn').disabled);
    if (await page.isVisible('#s-done')) break;
    await page.evaluate(() => { game.stage = STAGES.length - 1; });
    await page.click('#skip-btn');
    await page.waitForSelector('#s-reveal:not([hidden])');
  }
  assert.equal(await text(page, '#done-score'), '60 pts');
  assert.ok(await noSideScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('reduced motion: no decrypt, no halftone, meter stays static', async () => {
  const { page, ctx, errors } = await open({ reducedMotion: 'reduce' });
  await page.selectOption('#preset', { label: '’80s hits' });
  await page.waitForFunction(() => /Added/.test(document.getElementById('preset-status').textContent));
  await page.click('#play-btn');
  await page.waitForFunction(() => !document.getElementById('clip-btn').disabled);
  const title = await page.evaluate(() => Text.clean(game.song.title));
  await page.fill('#guess', title);
  await page.click('#submit-btn');
  await page.waitForSelector('#s-reveal:not([hidden])');
  assert.equal(await text(page, '#reveal-title'), title);
  assert.ok(await page.isHidden('#reveal-halftone'));
  assert.equal(await text(page, '#reveal-spotify'), 'Open in Apple Music');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Spotify refuses an account: signed out, pointed to the file route', async () => {
  const { page, ctx, errors } = await open({ state: { spotifyRefuses: true } });
  await page.click('#library-btn');
  await page.waitForSelector('#library-note:not([hidden])');
  assert.match(await text(page, '#library-note'), /sign-in for Song Guess is full/);
  assert.ok(await page.evaluate(() => !Spotify.isLoggedIn()));
  assert.ok(await page.isVisible('#s-home'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('cycling sign-in spots: a full saved playlist survives losing access', async () => {
  const { page, ctx, errors, state } = await open();
  await page.click('#library-btn');
  await page.waitForSelector('#s-library:not([hidden]) .pl');
  await page.click('#playlists .pl >> nth=0');
  await page.waitForFunction(() => /In reserves/.test(document.querySelector('#playlists .pl__meta').textContent));
  await page.click('#done-btn');
  state.spotifyRefuses = true; // taken off Spotify's list
  await page.click('.reserve >> .link-btn >> text=Update songs');
  await page.waitForSelector('#error:not([hidden])');
  assert.match(await text(page, '#error'), /Kept your saved 155 songs/);
  // Signed out now: an update reads the public page (100) and must keep 155.
  await page.click('.reserve >> .link-btn >> text=Update songs');
  await page.waitForFunction(() => /only shows the first 100/.test(document.getElementById('error').textContent));
  assert.match(await text(page, '#reserves .pl__meta'), /^155 songs/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('desktop width lays out without sideways scroll', async () => {
  const { page, ctx, errors } = await open({ width: 1280 });
  assert.ok(await noSideScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});
