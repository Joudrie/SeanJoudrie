// Song Guess
// Reserves (saved playlists) → pick one or several → their songs are
// de-duplicated and shuffled → guess each one from a clip that grows
// 1s, 2s, 4s, 7s, 11s, 16s with every wrong guess or skip.

const STAGES = [1, 2, 4, 7, 11, 16];
const MAX = STAGES[STAGES.length - 1];

const $ = (id) => document.getElementById(id);
const SCREENS = ['s-home', 's-library', 's-game', 's-reveal', 's-done'];

function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  window.scrollTo(0, 0);
}

function showError(msg) {
  $('error').textContent = msg || '';
  $('error').hidden = !msg;
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const NOTE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor"/><circle cx="16.5" cy="16" r="2.5" fill="currentColor"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function coverEl(url) {
  let el;
  if (url) {
    el = document.createElement('img');
    el.src = url;
    el.alt = '';
    el.loading = 'lazy';
    el.width = el.height = 48;
  } else {
    el = document.createElement('span');
    el.innerHTML = NOTE_SVG;
  }
  el.className = 'pl__cover';
  return el;
}

function span(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

// Shown under a reserve that only has part of its songs.
const PARTIAL_HELP = 'Spotify only shows the first 100 songs to people who don’t own a playlist. To play them all: in Spotify, tap ⋯ on the playlist, then Add to other playlist, then New playlist. Then add that copy from your library.';

function songCount(r) {
  return r.full ? plural(r.songs.length, 'song', 'songs') : r.songs.length + ' of ' + r.total + ' songs';
}

// ---------- Reserves (home) ----------

let me = null; // Spotify profile, when signed in
let justAdded = null; // a reserve that was just added gets one enter animation
const busy = new Map(); // reserve or playlist id → progress text while loading

function renderHome() {
  const list = Reserves.all();
  $('reserves-count').textContent = list.length ? plural(list.length, 'reserve', 'reserves') : 'Reserves';
  $('reserves-empty').hidden = list.length > 0;
  $('storage-note').hidden = !Reserves.memoryOnly;
  $('select-all-btn').hidden = list.length < 2;
  const allOn = list.length && list.every((r) => Reserves.isSelected(r.id));
  $('select-all-btn').textContent = allOn ? 'Clear' : 'Select all';

  const frag = document.createDocumentFragment();
  for (const r of list) {
    const li = document.createElement('li');
    li.className = 'reserve' + (r.id === justAdded ? ' is-new' : '');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl';
    b.setAttribute('aria-pressed', String(Reserves.isSelected(r.id)));
    const tick = span('pl__tick', '');
    tick.innerHTML = CHECK_SVG;
    b.append(coverEl(r.image), span('pl__name', r.name),
      span('pl__meta', busy.get(r.id) || songCount(r) + (r.owner ? ' · by ' + r.owner : '')), tick);
    b.addEventListener('click', () => { Reserves.toggle(r.id); renderHome(); });

    const actions = document.createElement('div');
    actions.className = 'reserve__actions';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'link-btn';
    refresh.textContent = 'Update songs';
    refresh.disabled = busy.has(r.id);
    refresh.addEventListener('click', () => refreshReserve(r));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'link-btn';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => { Reserves.remove(r.id); renderHome(); });
    actions.append(refresh, remove);

    li.append(b);
    if (!r.full) {
      const d = document.createElement('details');
      d.className = 'reserve__note';
      const s = document.createElement('summary');
      s.textContent = 'How to get all ' + r.total + ' songs';
      d.append(s, span('', PARTIAL_HELP));
      li.append(d);
    }
    li.append(actions);
    frag.append(li);
  }
  $('reserves').replaceChildren(frag);
  justAdded = null;
  updateHomeBar();
}

function updateHomeBar() {
  const sel = Reserves.selectedList();
  const songs = dedupe(sel.flatMap((r) => r.songs)).length;
  $('home-summary').textContent = sel.length
    ? plural(sel.length, 'playlist', 'playlists') + ' · ' + plural(songs, 'song', 'songs')
    : Reserves.all().length ? 'Tap reserves to pick what to play' : 'Add a playlist to start';
  $('play-btn').disabled = !songs;
}

async function refreshReserve(r) {
  showError('');
  busy.set(r.id, 'Updating…');
  renderHome();
  try {
    if (Spotify.isLoggedIn() && !me) me = await Spotify.me();
    const fresh = await Reserves.refresh(r, me, (n, total) => { busy.set(r.id, 'Updating… ' + n + ' of ' + total); renderHome(); });
    fresh.addedAt = r.addedAt;
    Reserves.put(fresh);
  } catch (e) {
    showError(e.status ? Spotify.explain(e) : e.message);
  } finally {
    busy.delete(r.id);
    renderHome();
  }
}

// Paste a link

async function addLink(text) {
  showError('');
  const value = String(text || '').trim();
  if (!value) { $('link-status').textContent = 'Paste a Spotify playlist link first.'; return; }
  $('add-btn').disabled = true;
  $('add-btn').textContent = 'Adding…';
  $('link-status').textContent = 'Reading the playlist…';
  try {
    if (Spotify.isLoggedIn() && !me) me = await Spotify.me().catch(() => null);
    const r = await Reserves.fromLink(value, me, (n, total) => {
      $('link-status').textContent = 'Reading the playlist… ' + n + ' of ' + total;
    });
    const again = Reserves.has(r.id);
    Reserves.put(r);
    if (!again) justAdded = r.id;
    $('link').value = '';
    $('link-status').textContent = (again ? 'Updated ' : 'Added ') + '“' + r.name + '”: ' + songCount(r) + '.';
    renderHome();
  } catch (e) {
    $('link-status').textContent = '';
    showError(e.status ? Spotify.explain(e) : e.message);
  } finally {
    $('add-btn').disabled = false;
    $('add-btn').textContent = 'Add';
  }
}

// ---------- Your Spotify library ----------

let playlists = []; // Spotify's library order: most recently created or saved first

async function openLibrary() {
  showError('');
  $('library-note').hidden = true;
  if (!Spotify.isLoggedIn()) {
    try { sessionStorage.setItem('sg-after-login', 'library'); } catch {}
    await Spotify.login();
    return;
  }
  show('s-library');
  if (playlists.length) { renderLibrary(); return; }
  $('pick-status').textContent = 'Loading your playlists…';
  if (!me) {
    try {
      me = await Spotify.me();
    } catch (e) {
      if (e.status !== 403) throw e;
      // Signed in, but Spotify refuses this account: while the app is in
      // Development Mode only accounts on its tester list get through.
      // Sign out so they aren't stuck, and point them at links instead.
      Spotify.logout();
      $('pick-status').textContent = '';
      backHome();
      $('library-note').textContent = 'Spotify won’t let this account in yet: Song Guess is still a test, and only accounts on its tester list can sign in. Ask Sean to add the email your Spotify account uses. Until then, paste a playlist link below; that works without signing in.';
      $('library-note').hidden = false;
      $('link').focus({ preventScroll: true });
      return;
    }
  }
  $('who').textContent = 'Connected as ' + (me.display_name || me.id) + '. Tap a playlist to add it to your reserves; tap again to take it out.';
  playlists = await Spotify.playlists((n, total) => {
    $('pick-status').textContent = 'Loading your playlists… ' + n + ' of ' + total;
  });
  renderLibrary();
}

function renderLibrary() {
  const q = $('search').value.trim().toLowerCase();
  const sort = $('sort').value;
  let list = playlists.filter((pl) => !q || (pl.name || '').toLowerCase().includes(q));
  if (sort === 'oldest') list = list.slice().reverse();
  else if (sort === 'az') list = list.slice().sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base', numeric: true }));
  else if (sort === 'most') list = list.slice().sort((x, y) => Spotify.totalOf(y) - Spotify.totalOf(x));
  else if (sort === 'fewest') list = list.slice().sort((x, y) => Spotify.totalOf(x) - Spotify.totalOf(y));

  if (!playlists.length) $('pick-status').textContent = 'No playlists found on this account.';
  else if (!list.length) $('pick-status').textContent = 'No playlists match “' + $('search').value.trim() + '”.';
  else if (q) $('pick-status').textContent = list.length + ' of ' + plural(playlists.length, 'playlist', 'playlists');
  else $('pick-status').textContent = plural(playlists.length, 'playlist', 'playlists');

  const frag = document.createDocumentFragment();
  for (const pl of list) {
    const mine = (pl.owner && me && pl.owner.id === me.id) || pl.collaborative;
    const total = Spotify.totalOf(pl);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl';
    b.disabled = busy.has(pl.id);
    b.setAttribute('aria-pressed', String(Reserves.has(pl.id)));
    let meta = busy.get(pl.id);
    if (!meta) {
      meta = plural(total, 'song', 'songs') + ' · by ' + (pl.owner.display_name || pl.owner.id);
      if (!mine && total > 100) meta += ' · first 100 only';
      if (Reserves.has(pl.id)) meta = 'In reserves · ' + meta;
    }
    const tick = span('pl__tick', '');
    tick.innerHTML = CHECK_SVG;
    b.append(coverEl(Spotify.imageUrl(pl.images, 48)), span('pl__name', pl.name), span('pl__meta', meta), tick);
    b.addEventListener('click', () => toggleFromLibrary(pl));
    li.append(b);
    frag.append(li);
  }
  $('playlists').replaceChildren(frag);
}

async function toggleFromLibrary(pl) {
  showError('');
  if (Reserves.has(pl.id)) { Reserves.remove(pl.id); renderLibrary(); return; }
  busy.set(pl.id, 'Adding…');
  renderLibrary();
  try {
    const r = await Reserves.fromSpotify(pl, me, (n, total) => { busy.set(pl.id, 'Adding… ' + n + ' of ' + total); renderLibrary(); });
    Reserves.put(r);
    justAdded = r.id;
  } catch (e) {
    showError(e.status ? Spotify.explain(e) : e.message);
  } finally {
    busy.delete(pl.id);
    renderLibrary();
  }
}

// ---------- Start a game ----------

let pool = []; // every unique song in the picked reserves (also the guess list)
let queue = []; // shuffled songs still to play
let loadNote = '';

// One entry per song: the same track in two playlists, or the same song on
// a single and an album, counts once.
function dedupe(songs) {
  const byKey = new Map();
  for (const s of songs) {
    const key = Text.norm(Text.clean(s.title)) + '|' + Text.norm(s.artists[0]);
    if (!byKey.has(key)) byKey.set(key, s);
  }
  return [...byKey.values()];
}

function playSelected() {
  const all = Reserves.selectedList().flatMap((r) => r.songs);
  pool = dedupe(all);
  const dupes = all.length - pool.length;
  loadNote = dupes ? plural(dupes, 'repeat', 'repeats') + ' removed' : '';
  startGame();
}

// ---------- Game ----------

const audio = new Audio();
// Deezer's clip CDN allows CORS; with this set before any src, the meter can
// read the clip's real audio (UI.listen).
audio.crossOrigin = 'anonymous';
audio.preload = 'auto';
let stopAt = 0;
let raf = 0;

// Points for a right guess, by how many seconds it took.
const POINTS = [100, 80, 60, 40, 25, 10];

const game = {
  song: null,
  clip: null,
  stage: 0, // index into STAGES
  attempts: [], // { kind: 'wrong' | 'skip' | 'right', text }
  played: 0,
  correct: 0,
  points: 0,
  noClip: 0,
  pickedId: null, // song chosen from the suggestions
};

// Where the player last tapped, so the reveal can open from that point.
let lastTap = { x: innerWidth / 2, y: innerHeight / 2 };
addEventListener('pointerdown', (e) => { lastTap = { x: e.clientX, y: e.clientY }; }, { passive: true });

function startGame() {
  queue = shuffle(pool.slice());
  game.played = 0;
  game.correct = 0;
  game.points = 0;
  game.noClip = 0;
  nextSong();
}

// Takes songs off the queue until one has a clip. Looks ahead one song so
// the next clip is usually ready by the time it's needed.
async function nextSong() {
  stopAudio();
  showError('');
  show('s-game');
  resetRound();
  $('clip-btn').disabled = true;
  $('clip-label').textContent = 'Finding a song…';
  while (queue.length) {
    const song = queue.shift();
    const clip = await Clips.find(song);
    if (!clip) { game.noClip++; continue; }
    game.song = song;
    game.clip = clip;
    retried = false;
    audio.src = clip.preview;
    audio.load();
    if (queue[0]) Clips.find(queue[0]);
    renderRound();
    $('guess').focus({ preventScroll: true });
    return;
  }
  finish();
}

function resetRound() {
  game.song = null;
  game.clip = null;
  game.stage = 0;
  game.attempts = [];
  game.pickedId = null;
  $('guess').value = '';
  $('suggest').replaceChildren();
  $('clip-status').textContent = '';
  UI.meterReset();
  UI.setRing($('clip-btn'), 0);
  renderStages();
}

function renderStages() {
  const frag = document.createDocumentFragment();
  STAGES.forEach((s, i) => {
    const li = document.createElement('li');
    li.textContent = s + 's';
    li.style.left = (s / MAX) * 100 + '%';
    if (i <= game.stage) li.className = i === game.stage ? 'is-open is-now' : 'is-open';
    frag.append(li);
  });
  $('stages').replaceChildren(frag);
}

function renderScore() {
  $('score').textContent = game.points;
  $('reveal-score').textContent = game.points;
}

function renderRound() {
  const secs = STAGES[game.stage];
  $('game-meta').textContent = 'Song ' + (game.played + 1) + ' of ' + (game.played + 1 + queue.length);
  renderScore();
  $('clip-btn').disabled = false;
  $('clip-label').textContent = 'Play ' + plural(secs, 'second', 'seconds');
  const nextSecs = STAGES[game.stage + 1];
  $('skip-btn').textContent = nextSecs ? 'Skip (+' + (nextSecs - secs) + 's)' : 'Give up';
  UI.meterUnlock(secs);
  renderStages();

  const frag = document.createDocumentFragment();
  for (let i = 0; i < STAGES.length; i++) {
    const li = document.createElement('li');
    const a = game.attempts[i];
    if (a) {
      li.className = 'attempt attempt--' + a.kind;
      const tag = document.createElement('span');
      tag.className = 'attempt__tag';
      tag.textContent = a.kind === 'skip' ? 'Skipped' : 'Wrong';
      li.append(tag);
      if (a.kind === 'wrong') {
        const t = document.createElement('span');
        t.className = 'attempt__text';
        t.textContent = a.text;
        li.append(t);
      }
    } else {
      li.className = 'attempt' + (i === game.stage ? ' attempt--now' : '');
      li.textContent = i === game.stage ? 'Guess ' + (i + 1) + ' of ' + STAGES.length : '';
    }
    frag.append(li);
  }
  $('attempts').replaceChildren(frag);
}

// ---------- Audio ----------

const onGame = () => !$('s-game').hidden;

function stopAudio() {
  audio.pause();
  cancelAnimationFrame(raf);
  UI.meterPlayhead(-1);
  UI.setRing($('clip-btn'), 0);
  UI.setIcon($('clip-btn'), false);
  $('reveal-play-label').textContent = 'Play clip';
}

function tick() {
  const t = audio.currentTime;
  if (onGame()) {
    UI.meterPlayhead(t);
    UI.setRing($('clip-btn'), t / stopAt);
  }
  if (t >= stopAt) {
    stopAudio();
    return;
  }
  raf = requestAnimationFrame(tick);
}

async function playFor(seconds) {
  stopAudio();
  stopAt = seconds;
  UI.listen(audio);
  try {
    audio.currentTime = 0;
  } catch {}
  try {
    await audio.play();
    if (onGame()) UI.setIcon($('clip-btn'), true);
    raf = requestAnimationFrame(tick);
    return true;
  } catch {
    return false;
  }
}

// Waits for a right/wrong/skip sound to finish, so it never plays over the clip.
const after = (ms) => new Promise((r) => setTimeout(r, ms));

audio.addEventListener('waiting', () => { if (onGame()) $('clip-status').textContent = 'Loading the clip…'; });
audio.addEventListener('playing', () => { $('clip-status').textContent = ''; });
// A clip link can expire while someone thinks; fetch a fresh one once, and
// skip the song if that doesn't play either.
let retried = false;
audio.addEventListener('error', async () => {
  if (!game.song || !audio.getAttribute('src')) return;
  const song = game.song;
  if (!retried) {
    retried = true;
    const clip = await Clips.find(song, true);
    if (clip && game.song === song) {
      game.clip = clip;
      audio.src = clip.preview;
      audio.load();
      $('clip-status').textContent = 'The clip reloaded. Tap Play.';
      return;
    }
  }
  if (game.song !== song || !onGame()) return;
  $('clip-status').textContent = 'This clip wouldn’t play, so it was skipped.';
  game.noClip++;
  setTimeout(nextSong, 1200);
});

// Tapping the play control plays the unlocked seconds, or stops them.
$('clip-btn').addEventListener('click', async () => {
  if (!audio.paused) { stopAudio(); return; }
  const ok = await playFor(STAGES[game.stage]);
  if (!ok) $('clip-status').textContent = 'Couldn’t start the clip. Tap Play again.';
});

// ---------- Guessing ----------

function suggestions(q) {
  const n = Text.norm(q);
  if (!n) return [];
  const words = n.split(' ');
  const hits = [];
  for (const s of pool) {
    const title = Text.norm(Text.clean(s.title));
    const hay = title + ' ' + Text.norm(s.artists.join(' '));
    if (!words.every((w) => hay.includes(w))) continue;
    hits.push({ s, rank: title.startsWith(n) ? 0 : title.includes(n) ? 1 : 2 });
  }
  hits.sort((a, b) => a.rank - b.rank || a.s.title.localeCompare(b.s.title));
  return hits.slice(0, 6).map((h) => h.s);
}

const label = (s) => Text.clean(s.title) + ' — ' + s.artists.join(', ');

$('guess').addEventListener('input', () => {
  game.pickedId = null;
  const frag = document.createDocumentFragment();
  for (const s of suggestions($('guess').value)) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'suggest__item';
    b.setAttribute('role', 'option');
    const t = document.createElement('span');
    t.className = 'suggest__title';
    t.textContent = Text.clean(s.title);
    const a = document.createElement('span');
    a.className = 'suggest__artist';
    a.textContent = s.artists.join(', ');
    b.append(t, a);
    b.addEventListener('click', () => {
      $('guess').value = label(s);
      game.pickedId = s.id;
      $('suggest').replaceChildren();
      $('submit-btn').focus();
    });
    li.append(b);
    frag.append(li);
  }
  $('suggest').replaceChildren(frag);
});

function isRight(text) {
  const song = game.song;
  if (game.pickedId) {
    const p = pool.find((s) => s.id === game.pickedId);
    return !!p && (p.id === song.id ||
      (Text.sameTitle(p.title, song.title) && Text.sameArtist(song.artists, p.artists[0])));
  }
  // Typed without choosing a suggestion: the title alone is enough.
  const typed = text.split(' — ')[0];
  return Text.norm(Text.clean(typed)) === Text.norm(Text.clean(song.title));
}

async function advance(kind, text) {
  game.attempts.push({ kind, text });
  const wait = UI.sound(kind);
  if (game.stage >= STAGES.length - 1) { reveal(false); return; }
  game.stage++;
  $('guess').value = '';
  game.pickedId = null;
  $('suggest').replaceChildren();
  stopAudio();
  renderRound();
  // Wrong guesses and skips were tapped, so the longer clip can play now,
  // right after the short sound.
  await after(wait);
  if (onGame()) playFor(STAGES[game.stage]);
}

$('guess-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!game.song) return;
  const text = $('guess').value.trim();
  if (!text) { $('clip-status').textContent = 'Type a guess, or tap Skip to hear more.'; return; }
  if (isRight(text)) reveal(true);
  else advance('wrong', text);
});

$('skip-btn').addEventListener('click', () => {
  if (!game.song) return;
  advance('skip', '');
});

// ---------- Reveal and end ----------

// The six stages of this song, like a shareable row. A right answer is
// coloured by speed: full accent at 1 second, fading toward the line colour.
function renderStrip(won) {
  const frag = document.createDocumentFragment();
  STAGES.forEach((s, i) => {
    const li = document.createElement('li');
    const a = game.attempts[i];
    li.textContent = s + 's';
    if (a && a.kind === 'wrong') { li.className = 'is-wrong'; li.setAttribute('aria-label', s + ' seconds: wrong'); }
    else if (a && a.kind === 'skip') { li.className = 'is-skip'; li.setAttribute('aria-label', s + ' seconds: skipped'); }
    else if (won && i === game.stage) {
      const pct = Math.round(100 - (i / (STAGES.length - 1)) * 70);
      li.className = 'is-right';
      li.style.background = 'color-mix(in srgb, var(--accent) ' + pct + '%, var(--line))';
      li.style.color = pct >= 50 ? 'var(--on-accent)' : 'var(--ink)';
      li.setAttribute('aria-label', s + ' seconds: right');
    } else li.setAttribute('aria-label', s + ' seconds: not needed');
    frag.append(li);
  });
  $('reveal-strip').replaceChildren(frag);
}

function reveal(won) {
  game.played++;
  const s = game.song;
  const secs = STAGES[game.stage];
  const wait = UI.sound(won ? 'right' : 'wrong');
  stopAudio();
  if (won) {
    game.correct++;
    game.points += POINTS[game.stage];
    game.attempts[game.stage] = { kind: 'right', text: '' };
  }

  const result = $('reveal-result');
  result.className = 'verdict ' + (won ? 'verdict--pass' : 'verdict--fail');
  if (won) {
    result.textContent = 'Got it in ';
    const n = document.createElement('span');
    n.className = 'score__value';
    result.append(n, document.createTextNode(' ' + (secs === 1 ? 'second' : 'seconds') + (game.stage === 0 ? '. First try.' : '.')));
    UI.countUp(n, secs);
  } else {
    result.textContent = 'Not this time.';
  }
  renderStrip(won);
  $('reveal-meta').textContent = 'Song ' + game.played + ' of ' + (game.played + queue.length);
  UI.decrypt($('reveal-title'), Text.clean(s.title));
  $('reveal-artist').textContent = s.artists.join(', ');

  // Songs read from a public link have no cover; Deezer's album art stands in.
  const cover = s.cover || game.clip.cover;
  const img = $('reveal-cover');
  $('reveal-halftone').hidden = true;
  img.hidden = !cover;
  if (cover) {
    img.classList.add('is-dithered');
    img.onload = () => UI.halftone(img, $('reveal-halftone'));
    img.onerror = () => img.classList.remove('is-dithered');
    img.src = cover;
  }
  $('reveal-spotify').href = s.url || 'https://open.spotify.com/track/' + s.id;
  $('reveal-deezer').href = game.clip.link;
  // Say so when the clip is another recording, like a live version.
  const other = Text.norm(game.clip.title) !== Text.norm(Text.clean(s.title)) &&
    Text.norm(Text.clean(game.clip.title)) !== Text.norm(game.clip.title);
  $('reveal-deezer').textContent = other ? 'Clip from Deezer: ' + game.clip.title : 'Clip from Deezer';
  $('next-btn').textContent = queue.length ? 'Next song' : 'See your score';

  const from = lastTap;
  show('s-reveal');
  renderScore();
  UI.iris($('s-reveal'), from.x, from.y);
  if (won) UI.floatPoints($('reveal-score').parentElement, POINTS[game.stage]);
  // Play the full clip as the answer, after the short sound; this follows
  // the tap on Guess or Skip.
  after(wait).then(() => {
    if ($('s-reveal').hidden) return;
    playFor(30).then((ok) => { if (ok) $('reveal-play-label').textContent = 'Pause'; });
  });
}

$('reveal-play').addEventListener('click', async () => {
  if (!audio.paused) { stopAudio(); return; }
  stopAt = 30;
  UI.listen(audio);
  try {
    if (audio.currentTime >= 29.5) audio.currentTime = 0;
    await audio.play();
    raf = requestAnimationFrame(tick);
    $('reveal-play-label').textContent = 'Pause';
  } catch {}
});

$('next-btn').addEventListener('click', () => { if (queue.length) nextSong(); else finish(); });

function finish() {
  stopAudio();
  game.song = null;
  show('s-done');
  $('done-score').textContent = game.points + ' pts';
  $('done-detail').textContent = [
    game.correct + ' of ' + plural(game.played, 'song', 'songs') + ' right',
    game.noClip ? plural(game.noClip, 'song', 'songs') + ' skipped because Deezer has no clip' : '',
    loadNote,
  ].filter(Boolean).join(' · ');
}

// ---------- Wiring ----------

function fail(e) {
  showError(e.status ? Spotify.explain(e) : e.message);
  if (e.status === 401) { Spotify.logout(); me = null; playlists = []; backHome(); }
}

function backHome() {
  stopAudio();
  game.song = null;
  show('s-home');
  renderHome();
}

$('link-form').addEventListener('submit', (e) => { e.preventDefault(); addLink($('link').value); });
$('paste-btn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    $('link').value = text;
    addLink(text);
  } catch {
    // No clipboard access (or it was refused): paste into the box instead.
    $('link').focus();
    $('link-status').textContent = 'Couldn’t read the clipboard. Long-press the box and tap Paste.';
  }
});
$('library-btn').addEventListener('click', () => openLibrary().catch(fail));
$('select-all-btn').addEventListener('click', () => {
  const list = Reserves.all();
  Reserves.selectAll(!list.every((r) => Reserves.isSelected(r.id)));
  renderHome();
});
$('play-btn').addEventListener('click', playSelected);
$('done-btn').addEventListener('click', backHome);
$('logout-btn').addEventListener('click', () => {
  Spotify.logout();
  me = null;
  playlists = [];
  backHome();
});
$('search').addEventListener('input', renderLibrary);
$('sort').addEventListener('change', renderLibrary);
for (const id of ['change-btn', 'done-change-btn']) $(id).addEventListener('click', backHome);
$('again-btn').addEventListener('click', startGame);

function renderSoundBtn() {
  const on = !UI.isMuted();
  $('sound-btn').setAttribute('aria-pressed', String(on));
  $('sound-label').textContent = on ? 'Sound on' : 'Sound off';
}
$('sound-btn').addEventListener('click', () => { UI.setMuted(!UI.isMuted()); renderSoundBtn(); });
renderSoundBtn();
UI.meterInit($('meter'));

(async function start() {
  let after = null;
  try { after = sessionStorage.getItem('sg-after-login'); sessionStorage.removeItem('sg-after-login'); } catch {}
  try {
    const justLoggedIn = await Spotify.handleRedirect();
    if (justLoggedIn && after === 'library') await openLibrary();
    else backHome();
  } catch (e) {
    backHome();
    fail(e);
  }
})();
