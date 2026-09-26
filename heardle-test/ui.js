// Song Guess look, motion and sound. Nothing here changes how the game works;
// app.js calls these. Two rules (see research/song-guess-style-prompt.md):
// things move only in response to a tap or while a clip the player started
// is playing, and nothing moves under prefers-reduced-motion.

const UI = (() => {
  const STAGES = [1, 2, 4, 7, 11, 16];
  const MAX = 16;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- Listening: one AudioContext, made on the first tap ----------

  let ctx = null;
  let analyser = null;
  let freq = null;

  // Routes the <audio> element through an analyser so the meter can draw the
  // clip's real energy. Deezer's clip CDN allows CORS, so the element must
  // have crossOrigin set before its src (app.js does that).
  function listen(audio) {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        const src = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        freq = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        ctx = null;
        analyser = null;
        return;
      }
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  // One 0–1 level per frame, processed the way cava does it: only the useful
  // band (about 50 Hz–10 kHz), bins spread on a log scale, then a fast rise
  // and a slow fall so it reads as music, not jitter.
  let level = 0;
  function readLevel() {
    if (!analyser) return 0;
    analyser.getByteFrequencyData(freq);
    const hz = ctx.sampleRate / analyser.fftSize;
    const lo = Math.max(1, Math.round(50 / hz));
    const hi = Math.min(freq.length - 1, Math.round(10000 / hz));
    let sum = 0;
    let weight = 0;
    for (let i = lo; i <= hi; i++) {
      const w = 1 / Math.log2(i + 1); // log spread: each octave counts about the same
      sum += (freq[i] / 255) * w;
      weight += w;
    }
    const raw = Math.min(1, Math.pow(sum / weight, 0.8) * 1.6);
    level = raw > level ? level + (raw - level) * 0.6 : level * 0.9; // fast rise, slow fall
    return level;
  }

  // ---------- The listening meter ----------
  // 16 seconds of bars. Unlocked stages are drawn as a quiet baseline; the
  // seconds you've actually heard are drawn as the song's energy at that
  // moment, so the meter develops a picture of what you listened to.

  const BARS = 64;
  let heard = new Float32Array(BARS);
  let unlocked = 1; // seconds, animated by the spring
  let unlockedTarget = 1;
  let velocity = 0;
  let playhead = -1; // seconds, or -1 when not playing
  let canvas = null;
  let g = null;
  let loop = 0;

  function meterInit(el) {
    canvas = el;
    g = canvas.getContext('2d');
    const size = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      draw();
    };
    new ResizeObserver(size).observe(canvas);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  }

  function draw() {
    if (!g || !canvas.width) return;
    const w = canvas.width;
    const h = canvas.height;
    const bw = w / BARS;
    const gap = Math.max(1, Math.round(bw * 0.28));
    g.clearRect(0, 0, w, h);
    const accent = css('--accent');
    const line = css('--line');
    const ink = css('--ink');
    const base = Math.max(2, Math.round(h * 0.08));
    for (let i = 0; i < BARS; i++) {
      const t = (i + 0.5) * (MAX / BARS);
      const x = Math.round(i * bw);
      const bwi = Math.max(1, Math.round(bw) - gap);
      if (t <= unlocked) {
        const v = heard[i];
        const bh = Math.max(base, Math.round(v * (h - base) + base));
        g.fillStyle = accent;
        g.globalAlpha = v > 0 ? 1 : 0.45;
        g.fillRect(x, h - bh, bwi, bh);
        g.globalAlpha = 1;
      } else {
        g.fillStyle = line;
        g.fillRect(x, h - base, bwi, base);
      }
    }
    if (playhead >= 0) {
      g.fillStyle = ink;
      g.fillRect(Math.round((playhead / MAX) * w), 0, Math.max(1, Math.round(w / 400)), h);
    }
  }

  function frame() {
    loop = 0;
    let busy = false;
    // Spring for the unlocked edge: a short snap when a stage opens.
    if (unlocked !== unlockedTarget) {
      const k = 260;
      const d = 24;
      velocity += (k * (unlockedTarget - unlocked) - d * velocity) / 60;
      unlocked += velocity / 60;
      if (Math.abs(unlockedTarget - unlocked) < 0.01 && Math.abs(velocity) < 0.05) {
        unlocked = unlockedTarget;
        velocity = 0;
      } else busy = true;
    }
    if (playhead >= 0) {
      const v = readLevel();
      const i = Math.min(BARS - 1, Math.floor((playhead / MAX) * BARS));
      if (v > heard[i]) heard[i] = v;
      busy = true;
    }
    draw();
    if (busy) loop = requestAnimationFrame(frame);
  }
  const kick = () => { if (!loop && !reduced()) loop = requestAnimationFrame(frame); };

  function meterReset() {
    heard = new Float32Array(BARS);
    unlocked = unlockedTarget = STAGES[0];
    velocity = 0;
    playhead = -1;
    draw();
  }

  function meterUnlock(seconds) {
    unlockedTarget = seconds;
    if (reduced()) { unlocked = seconds; draw(); } else kick();
  }

  // Called every animation frame by app.js while a clip plays in the game.
  function meterPlayhead(seconds) {
    playhead = seconds;
    if (reduced()) {
      // Static: mark heard seconds at a flat level, no live drawing.
      if (seconds >= 0) heard[Math.min(BARS - 1, Math.floor((seconds / MAX) * BARS))] = 0.5;
      draw();
    } else kick();
  }

  // ---------- Play control: ring + play/stop morph ----------
  // Play and stop are two 4-point shapes, so one can turn into the other.
  const PLAY = [[9, 6.5], [18.5, 12], [18.5, 12], [9, 17.5]];
  const STOP = [[7.5, 7.5], [16.5, 7.5], [16.5, 16.5], [7.5, 16.5]];
  const toPath = (pts) => 'M' + pts.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L') + 'Z';
  let morphT = 0; // 0 = play, 1 = stop
  let morphRaf = 0;

  function setIcon(el, playing) {
    const to = playing ? 1 : 0;
    cancelAnimationFrame(morphRaf);
    const path = el.querySelector('.play__icon');
    const paint = (t) => path.setAttribute('d', toPath(PLAY.map((p, i) => [p[0] + (STOP[i][0] - p[0]) * t, p[1] + (STOP[i][1] - p[1]) * t])));
    if (reduced()) { morphT = to; paint(to); return; }
    const from = morphT;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 180);
      const e = 1 - Math.pow(1 - k, 3);
      morphT = from + (to - from) * e;
      paint(morphT);
      if (k < 1) morphRaf = requestAnimationFrame(step);
    };
    morphRaf = requestAnimationFrame(step);
  }

  function setRing(el, fraction) {
    const ring = el.querySelector('.play__ring');
    const len = 2 * Math.PI * 22;
    ring.style.strokeDasharray = String(len);
    ring.style.strokeDashoffset = String(len * (1 - Math.max(0, Math.min(1, fraction))));
  }

  // ---------- Sounds for right, wrong and skip ----------
  // Short, quiet and synthesised (no files). Only ever called from a tap.

  let muted = false;
  try { muted = localStorage.getItem('sg-muted') === '1'; } catch {}
  const isMuted = () => muted;
  function setMuted(on) {
    muted = on;
    try { localStorage.setItem('sg-muted', on ? '1' : '0'); } catch {}
  }

  function tone(freqHz, start, dur, type = 'sine', gain = 0.05) {
    const o = ctx.createOscillator();
    const v = ctx.createGain();
    o.type = type;
    o.frequency.value = freqHz;
    const t = ctx.currentTime + start;
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(gain, t + 0.01);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(v).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Plays at the same moment the clip starts (the clip has to start inside
  // the tap), so these stay short and quiet.
  function sound(kind) {
    if (muted || !ctx) return 0;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (kind === 'right') { tone(784, 0, 0.12, 'sine', 0.035); tone(1175, 0.09, 0.18, 'sine', 0.035); return 260; }
    if (kind === 'wrong') { tone(196, 0, 0.16, 'triangle', 0.04); return 180; }
    if (kind === 'skip') { tone(523, 0, 0.07, 'sine', 0.025); return 90; }
    return 0;
  }

  // ---------- Reveal: iris, decrypting title, halftone cover, count-up ----------

  // The answer screen opens as a circle from the point the player tapped.
  function iris(el, x, y) {
    if (reduced() || !el.animate) return;
    const r = el.getBoundingClientRect();
    const cx = Math.round(x - r.left);
    const cy = Math.round(y - r.top);
    el.animate(
      [{ clipPath: `circle(0px at ${cx}px ${cy}px)` }, { clipPath: `circle(calc(1.42 * 100vmax) at ${cx}px ${cy}px)` }],
      { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  // Letters cycle through characters from the title itself, then settle left
  // to right. Screen readers get the real title from the first frame.
  let decryptTimer = 0;
  function decrypt(el, text) {
    clearInterval(decryptTimer);
    el.setAttribute('aria-label', text);
    if (reduced()) { el.textContent = text; return; }
    const pool = [...text.replace(/\s/g, '')];
    const chars = [...text];
    const steps = 10;
    let n = 0;
    el.textContent = '';
    decryptTimer = setInterval(() => {
      n++;
      const settled = Math.floor((n / steps) * chars.length);
      el.textContent = chars.map((c, i) => (i < settled || c === ' ' ? c : pool[(Math.random() * pool.length) | 0] || c)).join('');
      if (n >= steps) { clearInterval(decryptTimer); el.textContent = text; }
    }, 40);
  }

  // Counts a number up once (the seconds in "Got it in N seconds").
  function countUp(el, to) {
    if (reduced() || to < 4) { el.textContent = String(to); return; }
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 400);
      el.textContent = String(Math.max(1, Math.round(to * k)));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = '1';
    requestAnimationFrame(step);
  }

  // The cover first appears as a two-colour halftone in black and stage yellow
  // (ordered Bayer dither, done once on a small canvas), then resolves to the
  // real image. If the image won't allow reading its pixels, it just shows.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  function halftone(img, canvasEl, done) {
    const finish = () => { canvasEl.hidden = true; img.classList.remove('is-dithered'); done && done(); };
    if (reduced()) { finish(); return; }
    const S = 72;
    try {
      const c = canvasEl.getContext('2d', { willReadFrequently: true });
      canvasEl.width = canvasEl.height = S;
      c.drawImage(img, 0, 0, S, S);
      const d = c.getImageData(0, 0, S, S);
      const dark = hex(css('--bg').length === 7 ? css('--bg') : '#0b0c0f');
      const light = hex(css('--accent').length === 7 ? css('--accent') : '#ffd23f');
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const p = (y * S + x) * 4;
          const l = (0.2126 * d.data[p] + 0.7152 * d.data[p + 1] + 0.0722 * d.data[p + 2]) / 255;
          const on = l > (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
          const col = on ? light : dark;
          d.data[p] = col[0];
          d.data[p + 1] = col[1];
          d.data[p + 2] = col[2];
          d.data[p + 3] = 255;
        }
      }
      c.putImageData(d, 0, 0);
    } catch {
      finish();
      return;
    }
    canvasEl.hidden = false;
    img.classList.add('is-dithered');
    setTimeout(() => {
      canvasEl.classList.add('is-leaving');
      img.classList.remove('is-dithered');
      setTimeout(() => { canvasEl.classList.remove('is-leaving'); finish(); }, 480);
    }, 520);
  }

  // "+N" floats up from the score once.
  function floatPoints(anchor, points) {
    if (!points) return;
    const el = document.createElement('span');
    el.className = 'points-float';
    el.textContent = '+' + points;
    el.setAttribute('aria-hidden', 'true');
    anchor.append(el);
    if (reduced()) { setTimeout(() => el.remove(), 900); return; }
    el.addEventListener('animationend', () => el.remove());
  }

  return {
    STAGES, listen, meterInit, meterReset, meterUnlock, meterPlayhead,
    setIcon, setRing, sound, isMuted, setMuted, iris, decrypt, countUp, halftone, floatPoints,
  };
})();
