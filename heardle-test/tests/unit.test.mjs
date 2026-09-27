// Unit tests for the parts that don't need a browser: title matching, clip
// picking and playlist-file parsing. Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { zip } from './helpers.mjs';

// The game's scripts are plain browser scripts (const Text = …); load them
// into one context and read their globals back out. Arrays made inside the
// context come from another realm, so they're compared via Array.from.
const ctx = vm.createContext({ window: {}, document: {}, TextDecoder, Blob, Response, setTimeout, console });
for (const f of ['clips.js', 'imports.js']) {
  vm.runInContext(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
}
const { Text, Imports } = vm.runInContext('({ Text, Imports })', ctx);

test('titles lose remaster, feat. and bonus labels', () => {
  assert.equal(Text.clean('Song 2 - 2012 Remaster'), 'Song 2');
  assert.equal(Text.clean("Can't Hold Us (feat. Ray Dalton)"), "Can't Hold Us");
  assert.equal(Text.clean('Hey There Delilah - Bonus Track'), 'Hey There Delilah');
  assert.equal(Text.clean('Wonderwall (Remastered)'), 'Wonderwall');
  assert.equal(Text.clean('Pursuit Of Happiness - Extended Steve Aoki Remix'), 'Pursuit Of Happiness');
  assert.equal(Text.clean('Sweet Dreams (Are Made of This) - 2005 Remaster'), 'Sweet Dreams (Are Made of This)');
});

test('normalising ignores case, accents and punctuation', () => {
  assert.equal(Text.norm('Beyoncé & JAŸ-Z'), 'beyonce and jay z');
  assert.equal(Text.norm('Передай привет'), 'передаи привет');
  assert.ok(Text.sameTitle('Sweet Dreams', 'Sweet Dreams (Are Made of This)'));
  assert.ok(!Text.sameTitle('Song 2', 'Song 22'));
  assert.ok(Text.sameArtist(['Kanye West', 'Jamie Foxx'], 'Kanye West'));
  assert.ok(!Text.sameArtist(['Blur'], 'Oasis'));
});

test('Exportify CSV: quotes, escaped commas in artist names, local files skipped', () => {
  const csv = [
    '"Track URI","Track Name","Artist URI(s)","Artist Name(s)","Album Image URL","Track Duration (ms)"',
    '"spotify:track:0MsrWnxQZxPAcov7c74sSo","Holiday / Boulevard of Broken Dreams","x","Green Day","https://i.scdn.co/image/a","493400"',
    '"spotify:track:4Km5HrUvYTaSUfiSGPJeQR","Bad Guy, ""Remix""","x","Tyler\\, The Creator, Billie Eilish","","200000"',
    '"spotify:local:::a:1","My Demo","","Me","","1000"',
  ].join('\n');
  const [r] = Imports.fromCSV('songs_if_i_get_drafted_to_ww3.csv', csv);
  assert.equal(r.name, 'songs if i get drafted to ww3');
  assert.equal(r.songs.length, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.songs[0].id, '0MsrWnxQZxPAcov7c74sSo');
  assert.equal(r.songs[0].durationMs, 493400);
  assert.equal(r.songs[1].title, 'Bad Guy, "Remix"');
  assert.deepEqual([...r.songs[1].artists], ['Tyler, The Creator', 'Billie Eilish']);
  assert.equal(r.image, 'https://i.scdn.co/image/a');
});

test('TuneMyMusic-style CSV splits into one reserve per playlist', () => {
  const csv = 'Track name,Artist name,Album,Playlist name,Type,ISRC,Spotify - id\n' +
    'Viva La Vida,Coldplay,Viva,Road Trip,Playlist,GB,1mea3bSkSGXuIRvnydlB5b\n' +
    'Song 2,Blur,Blur,Chill,Playlist,GB,3GfOAdcoc3X5GPiiXmpBjK\n';
  const rs = Imports.fromCSV('x.csv', csv);
  assert.deepEqual(Array.from(rs, (r) => r.name).sort(), ['Chill', 'Road Trip']);
});

test('a file that is not a playlist gives nothing', () => {
  assert.equal(Imports.fromCSV('notes.csv', 'hello,world\n1,2\n').length, 0);
});

test('Exportify zip (stored) is read', async () => {
  const csv = '"Track URI","Track Name","Artist Name(s)","Track Duration (ms)"\n"spotify:track:0MsrWnxQZxPAcov7c74sSo","Holiday","Green Day","1000"\n';
  const bytes = zip({ 'a.csv': csv, 'b.csv': csv.replace('Holiday', 'Jaded') });
  const file = { name: 'spotify_playlists.zip', type: 'application/zip', arrayBuffer: async () => bytes.buffer };
  const rs = await Imports.fromFile(file);
  assert.deepEqual(Array.from(rs, (r) => r.songs[0].title).sort(), ['Holiday', 'Jaded']);
});
