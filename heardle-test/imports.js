// Playlist files: turns an Exportify export (spotify_playlists.zip, one CSV
// per playlist) or a single playlist CSV (Exportify, TuneMyMusic or similar)
// into reserves. This is how people get their full playlists without signing
// in to this app's Spotify connection, which Spotify caps at 5 accounts.

const Imports = (() => {
  // RFC 4180 CSV: quoted fields, "" for a quote inside a field, newlines
  // allowed inside quotes.
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        if (row.some((f) => f !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
    return rows;
  }

  // Exportify joins artists with ", " and writes a comma inside a name as "\,".
  function splitArtists(s) {
    // (No lookbehind in the regex: older iPhones can't parse it.)
    return String(s || '')
      .replace(/\\,/g, '\u0000')
      .split(', ')
      .map((a) => a.replace(/\u0000/g, ',').trim())
      .filter(Boolean);
  }

  const find = (headers, patterns) => headers.findIndex((h) => patterns.some((p) => p.test(h)));

  // Small stable id for songs and playlists that have no Spotify id.
  function hashId(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // "songs_if_i_get_drafted_to_ww3.csv" → "songs if i get drafted to ww3"
  const nameFromFile = (file) => file.replace(/^.*\//, '').replace(/\.csv$/i, '').replace(/_+/g, ' ').trim() || 'Imported playlist';

  // One CSV → one reserve (or several, when the file has a playlist column,
  // as TuneMyMusic's multi-playlist exports do). Returns [] if it isn't a
  // playlist file.
  function fromCSV(fileName, text) {
    const rows = parseCSV(text.replace(/^﻿/, ''));
    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const col = {
      title: find(headers, [/^track name$/, /^track$/, /^title$/, /^song( name)?$/, /^name$/]),
      artists: find(headers, [/^artist name\(s\)$/, /^artist name$/, /^artists?$/]),
      uri: find(headers, [/^track uri$/, /^spotify - id$/, /^spotify id$/, /^uri$/]),
      duration: find(headers, [/^track duration \(ms\)$/, /^duration \(ms\)$/, /^duration_ms$/]),
      image: find(headers, [/^album image url$/]),
      playlist: find(headers, [/^playlist name$/, /^playlist$/]),
    };
    if (col.title < 0 || col.artists < 0) return [];

    const groups = new Map(); // playlist name → songs
    let skipped = 0;
    for (const r of rows.slice(1)) {
      const title = (r[col.title] || '').trim();
      const artists = splitArtists(r[col.artists]);
      const uri = col.uri >= 0 ? (r[col.uri] || '').trim() : '';
      // Local files ("spotify:local:…") and podcast episodes can't be matched to a clip.
      if (!title || !artists.length || /^spotify:(local|episode):/.test(uri)) { skipped++; continue; }
      const idMatch = uri.match(/(?:spotify:track:|track\/)?([A-Za-z0-9]{22})$/);
      const id = idMatch ? idMatch[1] : 'f' + hashId(title + '|' + artists.join(','));
      const ms = col.duration >= 0 ? Number(r[col.duration]) || 0 : 0;
      const song = { id, title, artists, durationMs: ms };
      if (col.image >= 0 && /^https:\/\//.test(r[col.image] || '')) song.cover = r[col.image];
      if (idMatch) song.url = 'https://open.spotify.com/track/' + id;
      const name = col.playlist >= 0 && (r[col.playlist] || '').trim() ? r[col.playlist].trim() : nameFromFile(fileName);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(song);
    }

    return [...groups].map(([name, songs]) => ({
      id: 'file-' + hashId(name.toLowerCase()),
      name,
      owner: 'from a file',
      image: (songs.find((s) => s.cover) || {}).cover || null,
      total: songs.length,
      songs,
      full: true,
      skipped,
      source: 'file',
      addedAt: Date.now(),
    }));
  }

  // Minimal ZIP reader: the central directory lists every file; entries are
  // either stored (Exportify's default) or deflated (DecompressionStream).
  async function unzip(buffer) {
    const v = new DataView(buffer);
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('That file isn’t a zip Song Guess can read.');
    const count = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    const dec = new TextDecoder();
    const files = [];
    for (let n = 0; n < count; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const method = v.getUint16(p + 10, true);
      const size = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true);
      const extraLen = v.getUint16(p + 30, true);
      const commentLen = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buffer, p + 46, nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!/\.csv$/i.test(name) || name.startsWith('__MACOSX')) continue;
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const bytes = new Uint8Array(buffer, start, size);
      let text;
      if (method === 0) text = dec.decode(bytes);
      else if (method === 8 && 'DecompressionStream' in window) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        text = await new Response(stream).text();
      } else continue;
      files.push({ name, text });
    }
    return files;
  }

  // A picked file → reserves. Throws with a readable message when nothing
  // in it looks like a playlist.
  async function fromFile(file) {
    let entries;
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') entries = await unzip(await file.arrayBuffer());
    else entries = [{ name: file.name, text: await file.text() }];
    const reserves = entries.flatMap((e) => fromCSV(e.name, e.text)).filter((r) => r.songs.length);
    if (!reserves.length) {
      throw new Error('No playlists found in that file. Upload the spotify_playlists.zip from Exportify’s Export All, or one playlist’s .csv file.');
    }
    return reserves;
  }

  return { fromFile, parseCSV, splitArtists, fromCSV };
})();
