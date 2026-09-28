// ConnecSeans: the page. Rules live in game.js, the group's puzzles in
// puzzles.js. Routes: ./ (newest puzzle), #n=2 (a listed puzzle),
// #p=<code> (a puzzle carried in the link), #make (the maker).
(() => {
  const $ = (id) => document.getElementById(id);
  const COLOURS = ['Yellow', 'Green', 'Blue', 'Purple'];
  const LEVELS = ['easiest', 'medium', 'hard', 'hardest'];

  // Storage can be missing or throw (private windows); the game works without it.
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not saved */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* nothing to clear */ } },
  };

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  const pageUrl = () => location.origin + location.pathname;

  // ---------- Play ----------
  let P = null;        // the puzzle
  let shareUrl = '';   // where a friend can play it
  let history = [];    // every guess, as four words
  let order = [];      // unsolved words in on-screen order
  let picked = [];
  let toastTimer = 0;

  const progressKey = () => 'ij:' + Game.id(P);

  function start(puzzle, url) {
    P = puzzle;
    shareUrl = url;
    history = (store.get(progressKey()) || []).filter((h) => Array.isArray(h) && h.length === Game.SIZE);
    picked = [];
    const s = Game.state(P, history);
    order = Game.shuffle(P.groups.flatMap((g, i) => (s.solved.includes(i) ? [] : g.words)));
    $('p-title').textContent = P.title || 'Untitled puzzle';
    $('p-by').textContent = P.by ? `Puzzle by ${P.by}` : '';
    $('p-example').hidden = !P.example;
    document.title = P.title ? `${P.title} · ConnecSeans` : 'ConnecSeans';
    say('');
    render();
  }

  // `fresh` lists groups that just appeared, so only they pop in.
  function render(fresh = []) {
    const s = Game.state(P, history);
    // Found groups in the order found; on a loss, the rest follow, easiest first.
    const shown = s.lost ? [...s.solved, ...[0, 1, 2, 3].filter((g) => !s.solved.includes(g))] : s.solved;
    $('solved').replaceChildren(...shown.map((g) => groupRow(g, fresh.indexOf(g))));

    if (!s.over) order = order.filter((w) => !s.solved.includes(Game.groupOf(P, w)));
    $('grid').replaceChildren(...(s.over ? [] : order).map(tile));
    fitTiles();

    $('dots').replaceChildren(...Array.from({ length: Game.MISTAKES }, (_, i) => {
      const d = document.createElement('span');
      d.className = 'dot' + (i >= s.left ? ' dot--used' : '');
      return d;
    }));
    $('mistakes-sr').textContent = `${s.left} of ${Game.MISTAKES} mistakes left`;
    $('mistakes-row').hidden = s.over;
    $('play-actions').hidden = s.over;
    $('submit').disabled = picked.length !== Game.SIZE;
    $('deselect').disabled = picked.length === 0;

    $('end').hidden = !s.over;
    if (s.over) {
      $('end-title').textContent = s.won ? (s.mistakes === 0 ? 'Perfect. You were there.' : 'Solved.') : 'Out of mistakes';
      $('end-text').textContent = s.won
        ? `All four groups with ${s.mistakes} ${s.mistakes === 1 ? 'mistake' : 'mistakes'}.`
        : `You found ${s.solved.length} of 4 groups. The rest are shown above.`;
      $('result').replaceChildren(...resultRows());
    }
  }

  function groupRow(g, freshIndex = -1) {
    const li = document.createElement('li');
    li.className = 'group' + (freshIndex >= 0 ? ' is-new' : '');
    if (freshIndex > 0) li.style.animationDelay = `${freshIndex * motion('--t-stagger') * 4}ms`;
    li.dataset.g = g;
    const name = document.createElement('span');
    name.className = 'group__name';
    name.textContent = P.groups[g].name;
    const words = document.createElement('span');
    words.className = 'group__words';
    words.textContent = P.groups[g].words.join(', ');
    const why = document.createElement('span');
    why.className = 'group__why';
    why.textContent = P.groups[g].why;
    li.append(name, words, why);
    li.setAttribute('aria-label', `${COLOURS[g]} group: ${P.groups[g].name}. ${P.groups[g].words.join(', ')}. ${P.groups[g].why}`);
    return li;
  }

  function tile(word) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.textContent = word;
    b.dataset.word = word;
    b.setAttribute('aria-pressed', String(picked.includes(word)));
    return b;
  }

  // Step each tile's type down until its longest word fits on one line;
  // only a word too long even at the smallest size breaks mid-word.
  const FITS = ['tile--mid', 'tile--long', 'tile--tight', 'tile--break'];
  // At the last step a long word gets a soft hyphen in its middle, so it
  // splits as BOWLA- / DROME rather than wherever the edge falls.
  const halve = (w) => w.replace(/\S{9,}/g, (s) => s.slice(0, Math.ceil(s.length / 2)) + '\u00AD' + s.slice(Math.ceil(s.length / 2)));
  function fitTiles() {
    document.querySelectorAll('.tile').forEach((t) => {
      t.classList.remove(...FITS);
      t.textContent = t.dataset.word;
      for (const c of FITS) {
        if (t.scrollWidth <= t.clientWidth) break;
        t.classList.remove(...FITS);
        t.classList.add(c);
        if (c === 'tile--break') t.textContent = halve(t.dataset.word);
      }
    });
  }
  window.addEventListener('resize', fitTiles);
  document.fonts?.ready.then(fitTiles);

  function resultRows() {
    const past = [];
    const rows = [];
    for (const pick of history) {
      if (Game.check(P, pick, past).result === 'repeat') continue;
      past.push(pick);
      const row = document.createElement('div');
      row.className = 'result__row';
      row.append(...pick.map((w) => {
        const sq = document.createElement('span');
        sq.className = 'result__sq';
        sq.dataset.g = Game.groupOf(P, w);
        return sq;
      }));
      rows.push(row);
    }
    return rows;
  }

  function say(text) {
    clearTimeout(toastTimer);
    $('toast').textContent = text;
    if (text) toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 2500);
  }

  // ---------- Motion ----------
  // Every animation answers a Submit; under reduced motion none run and
  // nothing waits. Durations come from the CSS tokens.
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let busy = false;

  function setBusy(on) {
    busy = on;
    document.body.dataset.busy = on ? '1' : '';
    // While locked every control is off; render() sets Submit and Deselect back.
    for (const id of ['shuffle', 'deselect', 'submit']) $(id).disabled = on;
  }

  // The picked tiles hop one after another, in board order.
  async function hop() {
    if (calm()) return;
    const tiles = [...document.querySelectorAll('.tile[aria-pressed="true"]')];
    const gap = motion('--t-stagger');
    tiles.forEach((t, i) => {
      t.style.animationDelay = `${i * gap}ms`;
      t.classList.add('is-hop');
    });
    await wait(gap * (tiles.length - 1) + motion('--t-hop'));
    tiles.forEach((t) => {
      t.classList.remove('is-hop');
      t.style.animationDelay = '';
    });
  }

  // A correct four slide into the top row before becoming the group bar.
  async function gather(words) {
    // Swap, don't reorder: each picked tile below the top row trades places
    // with an unpicked one in it, so only those tiles move.
    const next = order.slice();
    const out = next.map((w, i) => i).filter((i) => i >= Game.SIZE && words.includes(next[i]));
    const into = next.map((w, i) => i).filter((i) => i < Game.SIZE && !words.includes(next[i]));
    out.forEach((i, k) => { [next[i], next[into[k]]] = [next[into[k]], next[i]]; });
    if (calm()) {
      order = next;
      return;
    }
    const before = new Map([...document.querySelectorAll('.tile')].map((t) => [t.dataset.word, t.getBoundingClientRect()]));
    order = next;
    $('grid').replaceChildren(...order.map(tile));
    fitTiles();
    const tiles = [...document.querySelectorAll('.tile')];
    for (const t of tiles) {
      const a = before.get(t.dataset.word);
      const b = t.getBoundingClientRect();
      t.style.transition = 'none';
      t.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    }
    document.body.getBoundingClientRect(); // commit the start positions
    for (const t of tiles) {
      t.style.transition = `transform ${motion('--t-move')}ms var(--ease)`;
      t.style.transform = '';
    }
    await wait(motion('--t-move'));
  }

  $('grid').addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (!b || busy) return;
    const w = b.dataset.word;
    if (picked.includes(w)) picked = picked.filter((x) => x !== w);
    else if (picked.length < Game.SIZE) picked = [...picked, w];
    else return;
    b.setAttribute('aria-pressed', String(picked.includes(w)));
    $('submit').disabled = picked.length !== Game.SIZE;
    $('deselect').disabled = picked.length === 0;
  });

  $('shuffle').addEventListener('click', () => {
    if (busy) return;
    order = Game.shuffle(order);
    render();
  });

  $('deselect').addEventListener('click', () => {
    if (busy) return;
    picked = [];
    render();
  });

  $('submit').addEventListener('click', async () => {
    if (busy || picked.length !== Game.SIZE) return;
    const r = Game.check(P, picked, history);
    if (r.result === 'repeat') return say('Already guessed.');
    const before = Game.state(P, history);
    history = [...history, picked];
    store.set(progressKey(), history);
    say('');
    setBusy(true);
    await hop();
    if (r.result === 'correct') {
      await gather(picked);
      picked = [];
      setBusy(false);
      render([r.group]);
      return;
    }
    say(r.result === 'one-away' ? 'One away.' : 'Not a group.');
    const s = Game.state(P, history);
    setBusy(false);
    if (s.over) {
      picked = [];
      render([0, 1, 2, 3].filter((g) => !before.solved.includes(g)));
      return;
    }
    render();
    // Shake the four that were wrong; the same four stay picked.
    document.querySelectorAll('.tile[aria-pressed="true"]').forEach((t) => {
      t.classList.add('is-wrong');
      t.addEventListener('animationend', () => t.classList.remove('is-wrong'), { once: true });
    });
  });

  $('copy-result').addEventListener('click', async () => {
    const ok = await copy(Game.shareText(P, history, shareUrl));
    $('copy-status').textContent = ok ? 'Copied. Paste it in the group chat.' : "Couldn't reach the clipboard in this browser.";
  });

  $('replay').addEventListener('click', () => {
    store.del(progressKey());
    $('copy-status').textContent = '';
    start(P, shareUrl);
  });

  $('remix').addEventListener('click', (e) => {
    const draft = readForm();
    const hasDraft = draft.title || draft.groups.some((g) => g.name || g.words.some(Boolean));
    if (hasDraft && !confirm('Replace your draft with a copy of this puzzle?')) {
      e.preventDefault();
      return;
    }
    fillForm({ ...P, title: P.example ? '' : P.title, by: '' });
    saveDraft();
  });

  $('picker').addEventListener('change', () => {
    location.hash = 'n=' + $('picker').value;
  });

  // ---------- Make ----------
  const groupsEl = $('m-groups');
  let showProblems = false;

  for (let g = 0; g < Game.SIZE; g++) {
    const set = $('group-tpl').content.firstElementChild.cloneNode(true);
    set.dataset.g = g;
    set.querySelector('.group-set__name').textContent = `${COLOURS[g]}, ${LEVELS[g]}`;
    set.querySelectorAll('.input').forEach((input) => {
      input.id = `m-g${g}-${input.dataset.k}`;
      const label = input.closest('.field')?.querySelector('label');
      if (label) label.htmlFor = input.id;
      if (/^w\d$/.test(input.dataset.k)) {
        const n = Number(input.dataset.k.slice(1)) + 1;
        input.placeholder = `Word ${n}`;
        input.setAttribute('aria-label', `${COLOURS[g]} group, word ${n}`);
      }
    });
    groupsEl.append(set);
  }

  function readForm() {
    return {
      title: $('m-name').value,
      by: $('m-by').value,
      groups: [...groupsEl.children].map((set) => ({
        name: set.querySelector('[data-k="name"]').value,
        why: set.querySelector('[data-k="why"]').value,
        words: [0, 1, 2, 3].map((i) => set.querySelector(`[data-k="w${i}"]`).value),
      })),
    };
  }

  function fillForm(p) {
    $('m-name').value = p.title || '';
    $('m-by').value = p.by || '';
    [...groupsEl.children].forEach((set, g) => {
      const grp = p.groups?.[g] || {};
      set.querySelector('[data-k="name"]').value = grp.name || '';
      set.querySelector('[data-k="why"]').value = grp.why || '';
      [0, 1, 2, 3].forEach((i) => { set.querySelector(`[data-k="w${i}"]`).value = grp.words?.[i] || ''; });
    });
    showProblems = false;
    checkForm();
  }

  const saveDraft = () => store.set('ij:draft', readForm());

  // Lists what's missing; returns the link code when the puzzle is playable.
  function checkForm() {
    const p = readForm();
    const list = Game.problems(p);
    $('problems').replaceChildren(...(showProblems ? list : []).map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    }));
    // Mark duplicate words so they're easy to find.
    const counts = new Map();
    groupsEl.querySelectorAll('.words .input').forEach((i) => {
      const k = i.value.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    });
    groupsEl.querySelectorAll('.words .input').forEach((i) => {
      const k = i.value.trim().toLowerCase();
      i.setAttribute('aria-invalid', String(Boolean(k) && counts.get(k) > 1));
    });
    return list.length ? null : Game.encode(p);
  }

  $('maker').addEventListener('input', () => {
    saveDraft();
    checkForm();
    $('m-link-wrap').hidden = true;
    $('m-status').textContent = '';
  });

  $('maker').addEventListener('submit', (e) => {
    e.preventDefault();
    showProblems = true;
    const code = checkForm();
    if (!code) return $('problems').firstElementChild?.scrollIntoView({ block: 'center' });
    location.hash = 'p=' + code;
  });

  $('m-copy').addEventListener('click', async () => {
    showProblems = true;
    const code = checkForm();
    if (!code) return;
    const url = `${pageUrl()}#p=${code}`;
    $('m-link').value = url;
    $('m-link-wrap').hidden = false;
    const ok = await copy(url);
    $('m-status').textContent = ok ? 'Link copied. Send it to the group.' : 'Copy the link above to send it.';
    if (!ok) $('m-link').select();
  });

  $('m-clear').addEventListener('click', () => {
    if (!confirm('Clear every field and start over?')) return;
    store.del('ij:draft');
    fillForm({});
    $('m-link-wrap').hidden = true;
    $('m-status').textContent = '';
  });

  // ---------- Routes ----------
  const listed = (typeof Puzzles !== 'undefined' ? Puzzles : []).filter((p) => !Game.problems(p).length);
  // Old links to puzzles that now have their own page (see puzzles.js).
  const moved = typeof Moved !== 'undefined' ? Moved : {};

  if (listed.length > 1) {
    $('picker').replaceChildren(...listed.map((p, i) => {
      const o = document.createElement('option');
      o.value = i + 1;
      o.textContent = `#${i + 1}: ${p.title || 'Untitled'}`;
      return o;
    }).reverse());
    $('picker-wrap').hidden = false;
  }

  function show(screen) {
    for (const id of ['s-play', 's-broken', 's-make']) $(id).hidden = id !== screen;
    const making = screen === 's-make';
    $('nav-make').toggleAttribute('aria-current', making);
    $('nav-play').toggleAttribute('aria-current', !making);
    $(making ? 'nav-make' : 'nav-play').setAttribute('aria-current', 'page');
  }

  function route() {
    const h = location.hash.slice(1);
    if (h === 'make') {
      document.title = 'Make a puzzle · ConnecSeans';
      show('s-make');
      window.scrollTo(0, 0);
      return;
    }
    if (h.startsWith('p=')) {
      const p = Game.decode(h.slice(2));
      if (!p) {
        document.title = 'Broken link · ConnecSeans';
        return show('s-broken');
      }
      $('picker-wrap').hidden = true;
      show('s-play');
      window.scrollTo(0, 0);
      return start(p, location.href);
    }
    if (Object.hasOwn(moved, h)) return location.replace(new URL(moved[h], location.href));
    if (!listed.length) return show('s-make');
    const n = h.startsWith('n=') ? Number(h.slice(2)) : listed.length;
    const i = Number.isInteger(n) && n >= 1 && n <= listed.length ? n - 1 : listed.length - 1;
    $('picker').value = i + 1;
    $('picker-wrap').hidden = listed.length < 2;
    show('s-play');
    start(listed[i], i === listed.length - 1 ? pageUrl() : `${pageUrl()}#n=${i + 1}`);
  }

  fillForm(store.get('ij:draft') || {});
  window.addEventListener('hashchange', route);
  route();
})();
