// Unit tests for the rules in game.js and the puzzles in puzzles.js.
// Run: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ TextEncoder, TextDecoder, btoa, atob, Uint8Array });
for (const f of ['game.js', 'puzzles.js']) {
  vm.runInContext(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
}
const { Game, Puzzles } = vm.runInContext('({ Game, Puzzles })', ctx);
const plain = (x) => JSON.parse(JSON.stringify(x));

export const SAMPLE = {
  title: 'Lake house ’24',
  by: 'Sam',
  groups: [
    { name: 'Things Dave lost', why: 'All in one weekend.', words: ['Keys', 'Wallet', 'Dignity', 'Kayak'] },
    { name: 'Nicknames for the car', why: '', words: ['Big Blue', 'The Tank', 'Grandma', 'Old Faithful'] },
    { name: 'Banned words', why: 'Rule 4.', words: ['Moist', 'Synergy', 'Vibes', 'Crunchy'] },
    { name: 'Karaoke songs', why: '', words: ['Mr. Brightside', 'Toxic', 'Africa', 'Wannabe'] },
  ],
};

test('every listed puzzle is playable', () => {
  assert.ok(Puzzles.length > 0);
  for (const p of Puzzles) assert.deepEqual(Array.from(Game.problems(p)), [], p.title);
});

test('a link round-trips, including accents and emoji', () => {
  const p = { ...SAMPLE, title: 'Café night 🎤' };
  assert.deepEqual(plain(Game.decode(Game.encode(p))), plain(Game.tidy(p)));
  assert.match(Game.encode(p), /^[A-Za-z0-9_-]+$/);
});

test('cut-off or junk links decode to null', () => {
  const code = Game.encode(SAMPLE);
  assert.equal(Game.decode(code.slice(0, -12)), null);
  assert.equal(Game.decode('hello'), null);
  assert.equal(Game.decode(''), null);
});

test('problems: missing words, duplicates across groups, long words', () => {
  const p = plain(SAMPLE);
  p.groups[0].words[3] = ' ';
  p.groups[2].words[0] = 'toxic';
  p.groups[1].name = '';
  p.groups[3].words[0] = 'x'.repeat(30);
  const out = Array.from(Game.problems(p)).join('\n');
  assert.match(out, /Group 1 needs four words/);
  assert.match(out, /Group 2 needs a connection/);
  assert.match(out, /"toxic" is in two groups/i);
  assert.match(out, /won't fit on a tile/);
  assert.deepEqual(Array.from(Game.problems(SAMPLE)), []);
});

test('check: correct, one away, wrong and repeated guesses', () => {
  assert.deepEqual(plain(Game.check(SAMPLE, ['kayak', 'Keys', 'Wallet', 'Dignity'])), { result: 'correct', group: 0 });
  assert.equal(Game.check(SAMPLE, ['Keys', 'Wallet', 'Dignity', 'Toxic']).result, 'one-away');
  assert.equal(Game.check(SAMPLE, ['Keys', 'Wallet', 'Moist', 'Toxic']).result, 'wrong');
  const past = [['Keys', 'Wallet', 'Moist', 'Toxic']];
  assert.equal(Game.check(SAMPLE, ['Toxic', 'Moist', 'Wallet', 'Keys'], past).result, 'repeat');
});

test('state: four mistakes lose, repeats are free, four groups win', () => {
  const wrong = [['Keys', 'Wallet', 'Moist', 'Toxic'], ['Keys', 'Big Blue', 'Moist', 'Toxic'], ['Wallet', 'Big Blue', 'Moist', 'Toxic']];
  let s = Game.state(SAMPLE, [...wrong, wrong[0]]);
  assert.equal(s.mistakes, 3);
  assert.equal(s.over, false);
  s = Game.state(SAMPLE, [...wrong, ['Dignity', 'Grandma', 'Vibes', 'Africa']]);
  assert.equal(s.lost, true);
  s = Game.state(SAMPLE, [wrong[0], ...[3, 1, 0, 2].map((g) => SAMPLE.groups[g].words)]);
  assert.deepEqual(Array.from(s.solved), [3, 1, 0, 2]);
  assert.equal(s.won, true);
  assert.equal(s.mistakes, 1);
});

test('share text: a square per word, repeats left out', () => {
  const h = [['Keys', 'Wallet', 'Dignity', 'Toxic'], ['Toxic', 'Keys', 'Wallet', 'Dignity'], SAMPLE.groups[0].words];
  const lines = Game.shareText(SAMPLE, h, 'https://x.test/#p=1').split('\n');
  assert.equal(lines[0], 'ConnecSeans: Lake house ’24');
  assert.equal(lines[1], '\u{1F7E8}\u{1F7E8}\u{1F7E8}\u{1F7EA}');
  assert.equal(lines[2], '\u{1F7E8}'.repeat(4));
  assert.equal(lines[3], 'https://x.test/#p=1');
});

test('shuffle keeps every word', () => {
  const words = SAMPLE.groups.flatMap((g) => g.words);
  assert.deepEqual(Array.from(Game.shuffle(words)).sort(), words.slice().sort());
});
