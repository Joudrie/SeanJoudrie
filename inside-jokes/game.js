// Inside Jokes: the rules, with no DOM. Loaded as a plain browser script
// (global `Game`) and by the unit tests through node:vm.
//
// A puzzle is { title, by, groups: [{ name, why, words: [4] } x4] }, groups
// ordered easiest to hardest; the order sets each group's colour.
const Game = (() => {
  const SIZE = 4;
  const MISTAKES = 4;
  const MAX_WORD = 24;
  const MAX_TEXT = 120;

  const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const key = (w) => clean(w).toLowerCase();

  // Every problem with a puzzle, as sentences the maker can show. Empty = playable.
  function problems(p) {
    const out = [];
    if (!p || !Array.isArray(p.groups) || p.groups.length !== SIZE) return ['A puzzle needs exactly four groups.'];
    const seen = new Map();
    p.groups.forEach((g, i) => {
      const n = i + 1;
      if (!clean(g.name)) out.push(`Group ${n} needs a connection.`);
      if (clean(g.name).length > MAX_TEXT) out.push(`Group ${n}'s connection is over ${MAX_TEXT} characters.`);
      if (clean(g.why).length > MAX_TEXT * 2) out.push(`Group ${n}'s story is over ${MAX_TEXT * 2} characters.`);
      const words = Array.isArray(g.words) ? g.words : [];
      if (words.length !== SIZE || words.some((w) => !clean(w))) out.push(`Group ${n} needs four words.`);
      words.forEach((w) => {
        if (clean(w).length > MAX_WORD) out.push(`"${clean(w)}" is over ${MAX_WORD} characters; it won't fit on a tile.`);
        const k = key(w);
        if (!k) return;
        if (seen.has(k) && seen.get(k) !== n) out.push(`"${clean(w)}" is in two groups; every word has to be different.`);
        else if (seen.has(k)) out.push(`"${clean(w)}" is in group ${n} twice.`);
        seen.set(k, n);
      });
    });
    return [...new Set(out)];
  }

  function tidy(p) {
    return {
      title: clean(p.title),
      by: clean(p.by),
      groups: p.groups.map((g) => ({ name: clean(g.name), why: clean(g.why), words: g.words.map(clean) })),
    };
  }

  // Link format: base64url of the JSON [title, by, [[name, why, w1..w4] x4]].
  function encode(p) {
    const t = tidy(p);
    const json = JSON.stringify([t.title, t.by, t.groups.map((g) => [g.name, g.why, ...g.words])]);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // A puzzle, or null if the text isn't a whole, valid one.
  function decode(s) {
    try {
      const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
      const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      const [title, by, groups] = JSON.parse(json);
      const p = { title, by, groups: groups.map(([name, why, ...words]) => ({ name, why, words })) };
      return problems(p).length ? null : tidy(p);
    } catch {
      return null;
    }
  }

  // Short stable id for saving progress (FNV-1a over the link text).
  function id(p) {
    let h = 0x811c9dc5;
    for (const c of encode(p)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return h.toString(36);
  }

  function shuffle(list, rand = Math.random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const groupOf = (p, word) => p.groups.findIndex((g) => g.words.some((w) => key(w) === key(word)));
  const sameSet = (a, b) => a.length === b.length && a.map(key).sort().join('\n') === b.map(key).sort().join('\n');

  // Guess four words, given the guesses so far ([[word x4], ...]).
  // Returns { result: 'correct', group } | 'one-away' | 'wrong' | 'repeat'.
  function check(p, pick, history = []) {
    if (pick.length !== SIZE) throw new Error('Pick four words.');
    if (history.some((h) => sameSet(h, pick))) return { result: 'repeat' };
    const counts = new Map();
    pick.forEach((w) => { const g = groupOf(p, w); counts.set(g, (counts.get(g) || 0) + 1); });
    const [[group, most]] = [...counts].sort((a, b) => b[1] - a[1]);
    if (most === SIZE) return { result: 'correct', group };
    return { result: most === SIZE - 1 ? 'one-away' : 'wrong' };
  }

  // Replay a guess history: which groups are solved (in the order found),
  // mistakes made, and whether the game is over.
  function state(p, history) {
    const solved = [];
    let mistakes = 0;
    const past = [];
    for (const pick of history) {
      const r = check(p, pick, past);
      past.push(pick);
      if (r.result === 'correct') solved.push(r.group);
      else if (r.result !== 'repeat') mistakes++;
    }
    const won = solved.length === SIZE;
    const lost = !won && mistakes >= MISTAKES;
    return { solved, mistakes, left: MISTAKES - mistakes, won, lost, over: won || lost };
  }

  // One row of colour squares per guess, as in the original's share text.
  const SQUARES = ['\u{1F7E8}', '\u{1F7E9}', '\u{1F7E6}', '\u{1F7E5}'];
  function shareText(p, history, url) {
    const past = [];
    const rows = [];
    for (const pick of history) {
      if (check(p, pick, past).result === 'repeat') continue;
      past.push(pick);
      rows.push(pick.map((w) => SQUARES[groupOf(p, w)]).join(''));
    }
    return [`Inside Jokes: ${p.title || 'Untitled'}`, ...rows, url].filter(Boolean).join('\n');
  }

  return { SIZE, MISTAKES, MAX_WORD, problems, tidy, encode, decode, id, shuffle, groupOf, check, state, shareText };
})();
