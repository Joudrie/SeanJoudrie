// Shared test helpers: a static file server, a stored-zip builder, a WAV
// generator and fake Spotify / Deezer / reader / image servers.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Serves heardle-test/ on a free port.
export function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = path.endsWith('/') ? path + 'index.html' : path;
    try {
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

// CRC-32 for the zip builder.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// A stored (uncompressed) zip, the way Exportify's Export All makes one.
export function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, n.length, true);
    parts.push(new Uint8Array(local.buffer), n, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, n.length, true); c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), n);
    offset += 30 + n.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true); end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// 30 seconds of a kick-and-tone loop, so the analyser has something to read.
export function wav(seconds = 30, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const kick = Math.exp(-((t * 2) % 1) * 6) * Math.sin(2 * Math.PI * 60 * t);
    const v = 0.4 * kick + 0.15 * Math.sin(2 * Math.PI * 440 * t);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 20000), 44 + i * 2);
  }
  return buf;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

export const track = (i, extra = {}) => ({
  type: 'track', id: ('t' + i).padEnd(22, 'x'), name: 'Song ' + i, duration_ms: 200000,
  artists: [{ name: 'Artist ' + (i % 4) }], album: { images: [{ url: 'https://i.scdn.co/cover' + (i % 3) + '.png', width: 300 }] }, ...extra,
});

// Fake servers for everything the game talks to. `state` lets a test change
// behaviour mid-run (for example, Spotify starting to refuse an account).
export async function mock(ctx, state = {}) {
  const audio = wav();
  const cover = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#2d5b8c"/><circle cx="150" cy="140" r="70" fill="#f4f1de"/></svg>';
  const own = Array.from({ length: 155 }, (_, i) => track(i));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/i\.scdn\.co|dzcdn\.net\/images|mzstatic\.com/, (r) => r.fulfill({ contentType: 'image/svg+xml', headers: CORS, body: cover }));
  await ctx.route('https://cdn.test/**', (r) => r.fulfill({ contentType: 'audio/wav', headers: CORS, body: audio }));
  await ctx.route('https://accounts.spotify.com/authorize?**', (r) => {
    const u = new URL(r.request().url());
    r.fulfill({ status: 302, headers: { location: u.searchParams.get('redirect_uri') + '?code=abc&state=' + u.searchParams.get('state') } });
  });
  await ctx.route('https://accounts.spotify.com/api/token', (r) => json(r, { access_token: 'tok', refresh_token: 'ref' }));
  await ctx.route('https://api.spotify.com/v1/**', (r) => {
    if (r.request().method() === 'OPTIONS') return json(r, {});
    if (state.spotifyRefuses) return json(r, { error: { status: 403, message: 'the user may not be registered' } }, 403);
    const u = new URL(r.request().url());
    if (u.pathname === '/v1/me') return json(r, { id: 'sean', display_name: 'seanjoudrie' });
    if (u.pathname === '/v1/me/playlists') {
      return json(r, { total: 2, next: null, items: [
        { id: 'OWNaaaaaaaaaaaaaaaaaaa', name: 'songs if i get drafted to ww3', owner: { id: 'sean', display_name: 'seanjoudrie' }, items: { total: 155 }, images: [{ url: 'https://i.scdn.co/c.png', width: 300 }] },
        { id: 'FRIENDbbbbbbbbbbbbbbbb', name: 'summertime love', owner: { id: 'kyle', display_name: 'kyle' }, items: { total: 140 } },
      ] });
    }
    const m = u.pathname.match(/^\/v1\/playlists\/(OWNaaaaaaaaaaaaaaaaaaa)(\/items)?$/);
    if (m && !m[2]) return json(r, { id: m[1], name: 'songs if i get drafted to ww3', owner: { id: 'sean', display_name: 'seanjoudrie' }, images: [] });
    if (m) {
      const off = +(u.searchParams.get('offset') || 0);
      const n = Math.min(50, own.length - off);
      return json(r, { total: own.length, items: own.slice(off, off + n).map((t) => ({ item: t })), next: off + n < own.length ? `https://api.spotify.com/v1/playlists/${m[1]}/items?offset=${off + n}` : null });
    }
    return json(r, { error: { status: 403 } }, 403);
  });
  // The reader function: Spotify public page (first 100) and Apple Music (all).
  await ctx.route('https://ufvgirqurqofijoxryzh.supabase.co/**', (r) => {
    const u = new URL(r.request().url());
    const link = u.searchParams.get('link') || '';
    const apple = link.match(/music\.apple\.com\/([a-z]{2})\/playlist\/(?:[^/?#]+\/)?(pl\.[A-Za-z0-9.-]+)/i);
    if (apple) {
      if (apple[2] === 'pl.u-missing') return json(r, { error: 'not_found' }, 404);
      const n = apple[2].includes('80s') || apple[2] === 'pl.af4d982795c6472ea48579eb147cd726' ? 100 : 191;
      return json(r, { id: 'am-' + apple[2], service: 'apple', link: 'https://music.apple.com/us/playlist/' + apple[2], name: n === 100 ? '’80s Hits Essentials' : '✨', owner: 'Apple Music', image: 'https://is1-ssl.mzstatic.com/a.jpg', total: n,
        songs: Array.from({ length: n }, (_, i) => ({ id: 'am' + i, title: 'Apple Song ' + i, artists: ['Apple Artist ' + (i % 5)], durationMs: 200000, cover: 'https://is1-ssl.mzstatic.com/s.jpg', url: 'https://music.apple.com/us/song/' + i, service: 'apple' })) });
    }
    const id = u.searchParams.get('id') || (link.match(/playlist\/([A-Za-z0-9]{22})(?![A-Za-z0-9])/) || [])[1];
    if (!id) return json(r, { error: 'not_a_playlist' }, 400);
    if (id.startsWith('PRIVATE')) return json(r, { error: 'not_found' }, 404);
    const songs = (id.startsWith('OWN') ? own.slice(0, 100) : Array.from({ length: 100 }, (_, i) => track(i + 100))).map((t) => ({ id: t.id, title: t.name, artists: t.artists.map((a) => a.name), durationMs: 200000 }));
    return json(r, { id, name: id.startsWith('OWN') ? 'songs if i get drafted to ww3' : 'summer 2019', owner: 'kyle', image: null, total: 155, songs });
  });
  // Deezer search (JSONP): the right song plus a karaoke decoy, which must lose.
  await ctx.route('https://api.deezer.com/**', (r) => {
    const u = new URL(r.request().url());
    const cb = u.searchParams.get('callback');
    const q = u.searchParams.get('q');
    const tm = q.match(/track:"([^"]+)"/);
    const am = q.match(/artist:"([^"]+)"/);
    const data = tm && !/Nope/.test(tm[1]) ? [
      { title: tm[1] + ' (Karaoke Version)', artist: { name: 'Sing King' }, preview: 'https://cdn.test/karaoke.wav', link: 'https://deezer.test/k', duration: 200, rank: 9e5 },
      { title: tm[1], title_short: tm[1], artist: { name: am[1] }, album: { cover_medium: 'https://e-cdns-images.dzcdn.net/images/cover/x.jpg' }, preview: 'https://cdn.test/' + encodeURIComponent(tm[1]) + '.wav', link: 'https://www.deezer.com/track/1', duration: 200, rank: 5e5 },
    ] : [];
    r.fulfill({ contentType: 'application/javascript', body: `${cb}(${JSON.stringify({ data })})` });
  });
}

// Playwright from the local install, or the global one.
export async function playwright() {
  try {
    return await import('playwright');
  } catch {
    const { execSync } = await import('node:child_process');
    const { createRequire } = await import('node:module');
    const root = execSync('npm root -g').toString().trim();
    return createRequire(import.meta.url)(root + '/playwright');
  }
}
