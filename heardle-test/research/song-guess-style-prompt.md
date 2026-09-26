# Song Guess Style Report: Built from Codex

## Introduction

This comes from a pass through Codex, the 1,458-repo inspiration archive. About 450 repos across motion, interaction, audio, retro, rendering, design, creative tools and games were sorted by relevance. The READMEs and live demos of the roughly 50 relevant ones were read. The detail and every source link are in `codex-ui-motion.md` next to this file.

Most song-guessing games look the same: a green progress bar, a stock play icon, six grey boxes and a system font. The ones that try harder usually reach for a purple music visualiser or frosted glass. Neither has an identity.

This report lists those tells and then defines a style that is Song Guess's own. It rests on one idea: **the game is about listening, so the interface should visibly listen too.** Everything else is kept quiet and disciplined, so the few moments that move feel earned.

It sits on top of `docs/vibe-coded-websites-report.md`, which still applies in full. Where this report asks for motion, the motion is always tied to something the player did, and none of it runs under `prefers-reduced-motion`.

**The direction this report commits to.** The research pointed to three directions: *Sound made visible*, *Tape deck*, and *Data as type*. This report combines them rather than picking one:

- **Base:** a late-night stage look (near-black, one stage-light yellow, gig-poster type). An earlier paper-and-ink version was dropped.
- **Signature moments:** the listening meter, the spring-loaded tape counter, the decrypting title, the iris reveal and the halftone cover.
- **Optional:** the sand field and the melting cover, built only if they hold 60 fps on a mid-range phone.

Change this paragraph if you want to go all-in on one direction instead.

## SECTION 1. GENERIC MUSIC-GAME TELLS

### 1. The default Heardle kit

- A bright green (or Spotify-green) progress bar
- A stock triangle play button in a circle
- Six identical grey rectangles for guesses
- System font everywhere, with the score in the same weight as the body text

Nothing is wrong, and nothing is anyone's.

### 2. The purple visualiser

MilkDrop-style presets (butterchurn), neon spectrum bars, glowing circles that pulse to the beat. They are fun once and look like every music visualiser since 2004. They also break the no-glow rule and drain phone batteries.

### 3. Frosted glass and "liquid glass"

Blurred translucent panels over album art. Real refraction only works in Chromium, so iPhones get a grey smear. It fails the "no semi-transparent headers" rule and looks like a template.

### 4. Movement that isn't about the music

Idle loops, floating blobs, animated gradient backgrounds, cursor followers on a touch game. If the interface moves while nothing is playing, it isn't listening; it's fidgeting.

### 5. Album art used as wallpaper

A blurred, enlarged cover behind everything. Every cover then decides the brand, and the brand disappears.

### 6. Feedback that says nothing

A wrong guess that only turns a box red. A correct guess that only says "Correct!". There's no sense of how close you were, how fast you got it, or what the song was.

### 7. Glitch as personality

RGB channel splits, scanlines and CRT bloom on every title. One restrained use can work; as a house style it reads as a template.

## SECTION 2. THE SONG GUESS SYSTEM

### 1. Palette: late-night stage

*Revised after the first build: the paper-and-ink version read as a notebook, not a music game, and it isn't tied to any other project.*

- **Background:** a near-black room `#0b0c0f` with a static film grain drawn once (never animated), and surfaces `#15171c`.
- **Accent:** one stage-light yellow `#ffd23f`, used for what matters: the play control, the meter, the selected reserves, the score and the answer.
- **Semantic colours:**
  - wrong is coral `#ff6b5e`;
  - skip is muted grey `#9aa0ab`;
  - text is `#f4f1ea`.
- **Contrast** on the background: text 17:1, yellow 13.5:1, coral 7:1, grey 7.4:1. Text on yellow is the background colour.
- **Theme:** dark only. It's a game you play at night.

### 2. Type: gig poster plus tape counter

- **Big Shoulders Display** (800, uppercase, tight leading) for anything that shouts: the wordmark, headlines, playlist and song titles, the play label, the result and the score.
- **Instrument Sans** for everything else: body text, labels, buttons, counters and the meter's seconds.
- **Ramp:** 12 / 14 / 16 / 28 / 44 / 64, plus 96 for the final score.
- **Numbers:** tabular figures for anything that changes.
- **Inputs:** 16px, so iOS doesn't zoom in.
- Both fonts are OFL.

### 3. Shape and depth

- **Spacing:** a 4px scale for every margin, padding and gap.
- **Radius:** one 4px radius token for every box. The only exception is a true circle, used for the play control.
- **Depth:** a 1px border is the elevation. No drop shadows, no glows. Selected items light up in the stage yellow, with dark text.
- **Layout:** one container width, so left edges line up on every screen.

### 4. Iconography and mark

- Standard controls (play, pause, skip, check, x, shuffle, share, list) are Lucide icons, inlined as SVG at one stroke weight and sized to the text next to them.
- The wordmark, app icon and a few signature glyphs are drawn on one Dotgrid grid and exported as static SVG. The wordmark never depends on a webfont loading.
- No emoji anywhere in the UI.

### 5. Sound as part of the interface

- Three short, quiet effects for right, wrong and skip, from CC0 sources (freesound) or synthesised in about 20 lines of Web Audio.
- They play only in response to a tap, respect a mute toggle, and never overlap the clip.

## SECTION 3. THE MOTION LANGUAGE

**Rule 1.** Motion happens only (a) in direct response to a tap, or (b) while a clip the player started is playing, driven by that clip's real audio.

**Rule 2.** Under `prefers-reduced-motion`:
- nothing moves;
- states change instantly;
- the listening meter shows a static level;
- a global switch (like Codex's) turns off every transition.

**Timing tokens:**
- `--t-feedback`: 120ms (colour and border changes)
- `--t-enter`: 200ms (items appearing)
- `--t-reveal`: 480ms (the reveal)
- **Easing:** one ease-out curve (`cubic-bezier(.2,.8,.2,1)`) for everything, plus one spring for the meter segments
- **No bounce overshoot** anywhere except the spring. Nothing lifts, tilts or scales on hover.

### Signature moment 1: the listening meter (the clip meter)

- The 16-second bar is divided at 1 / 2 / 4 / 7 / 11 / 16s.
- When a stage unlocks, its segment snaps in on a short spring, like a tape counter clicking over (anime.js spring, about 0.5 KB, or a hand-written damped spring).
- While the clip plays, the unlocked part of the bar is drawn as the song's actual energy, not as a flat fill:
  - a thin row of bars, or a small note-axis spectrogram, from a Web Audio `AnalyserNode`;
  - smoothed the cava way (band-limit to about 50 Hz–10 kHz, log spread, gradual fall-off) so it looks calm, not jittery;
  - driven by clubber-style bands that rise fast and fall slowly on the kick.
- The meter's numbers are Instrument Sans tabular figures.
- **Tech note:** Deezer's clip CDN sends `access-control-allow-origin: *` (verified), so set `audio.crossOrigin = "anonymous"` before `src`, route the element through one `AudioContext` created on the first tap, and reuse that context.

### Signature moment 2: the play button that plays

- The play control shows its own progress: a drain line or ring inside the button, like A Dark Room's cooldown bar, so the player looks at one place.
- Play morphs into stop and back (flubber, or two SVG paths with the same point count).

### Signature moment 3: the reveal

- The answer screen irises out from the button the player tapped (`clip-path: circle()` growing to `1.42 × 100vmax` from the tap point; CSS only).
- The song title decrypts: unrevealed letters cycle through characters taken from the title itself for about 400ms, then settle left to right. That's about 30 lines of vanilla JS (after react-bits DecryptedText / GSAP ScrambleText). The real title is set as the accessible name from the first frame.
- The cover arrives as a two-colour halftone in black and stage yellow, then resolves to full colour. Dithering is done once per cover on a canvas (DPaint-js / Dither3D idea), not in a render loop.
- The result line ("Got it in 2 seconds.") uses the accent. The seconds number counts up once.

### Signature moment 4: right, wrong, skip

- **Wrong:** the guess row fills with the wrong colour and the typed text stays readable. One 120ms colour change and nothing else: no shake, no glitch.
- **Skip:** the row fills with muted grey and says "Skipped".
- **Right:** "+N" (points by seconds used) floats up from the score and fades over 600ms (the 2048 score addition). The row colour ramps from the accent (1 second) toward muted (16 seconds), so speed is visible at a glance.

### Signature moment 5: lists

- The reserves and suggestion lists render instantly. Rows only animate when the player adds or removes one (enter at `--t-enter`, no stagger cascade on first load).
- Selected reserves invert to ink.

### Optional, performance-gated

**Sand field (Chladni).** Behind the play control, a sparse particle field settles into a new Chladni figure each time a stage unlocks.
- The figure uses the square-plate formula `cos(nπx/L)cos(mπy/L) − cos(mπx/L)cos(nπy/L)`, with (m, n) picked from the clip's dominant pitch.
- The gradient field is computed in a worker.
- Reimplement from the formula; luciopaiva/chladni has no licence.
- Ship it only if it holds 60 fps on a mid-range phone with about 2,000 particles; otherwise drop it.

**Melting cover.** On "Not this time", the cover melts once (the MeltGL idea), and only if the GPU path is fast on phones. Otherwise use a single 200ms fade to the muted halftone.

## SECTION 4. PERFORMANCE, ACCESSIBILITY, TECH

- **Stack:** plain HTML, CSS and vanilla JS, with no build step. Any library must load from jsDelivr or cdnjs, and the total added weight must stay under about 40 KB gzipped.
- **No render loop at rest.** `requestAnimationFrame` runs only while a clip plays or a transition is in flight. Nothing animates in a hidden tab.
- **One `AudioContext`**, created on the first tap and resumed on later taps (iOS requires this).
- **Contrast:** every colour pair meets WCAG AA; that's what Leonardo is for. Right and wrong are never shown by colour alone; the row also says "Wrong: <guess>" or "Skipped".
- **Loading:** every wait has a visible state in brand style (a loadersz-style canvas loader or a mono "Reading the playlist… 50 of 155" counter). No blank gaps.
- **Share and meta:** a share image, favicon and title in the new style. The wordmark is a static SVG path (made with opentype.js).
- **Layout:** it works at 375px before desktop is touched.
- **Licences:** MIT, ISC, Apache and OFL are fine to use. MPL, LGPL and EPL code is reimplemented, not copied. No-licence repos (luciopaiva/chladni, beep.js) are ideas only. GSAP's licence is custom but fine for a game.

## SECTION 5. SONG GUESS STYLE CHECKLIST

If any of these are true, it isn't done.

**Brand**
- A green progress bar, a stock play button, or grey guess boxes with no system
- Purple, neon, glow, or a MilkDrop-style visualiser
- Frosted or translucent panels
- A blurred cover used as the page background
- Emoji anywhere
- More than one accent colour, or a font outside Big Shoulders Display and Instrument Sans

**Motion**
- Anything moves while no clip is playing and nothing was tapped
- Hover lifts, tilts, bounces or scales
- Stagger cascades on first load
- Anything moves under reduced motion
- The meter is a flat fill instead of the song's real energy (outside reduced motion)
- The reveal cuts instead of irising from the tapped button

**Feedback**
- A wrong guess doesn't show the guess text
- A right guess doesn't show the seconds used or "+N"
- Right or wrong is shown by colour alone
- A wait with no loading state

**Tech**
- A render loop running at rest, or in a hidden tab
- More than one `AudioContext`, or `crossOrigin` not set before `src`
- More than about 40 KB of added libraries, or one that needs a build step
- Code copied from a no-licence or copyleft repo
- Missing title, description, share image or favicon, or broken at 375px

## SECTION 6. THE FIX, AS AN LLM PROMPT

### LLM Prompt

You are a senior product designer and front-end engineer. You are overhauling the UI and motion of Song Guess, a mobile-first web game at `heardle-test/` in this repo. Players save Spotify playlists as "reserves", mix them, and guess each song from a clip that grows 1s, 2s, 4s, 7s, 11s, 16s. The stack is plain HTML, CSS and vanilla JS with no build step, deployed to GitHub Pages. Do not change how the game works (`spotify.js`, `clips.js`, `reserves.js` and the game logic in `app.js`); change how it looks, moves and sounds. Read `docs/vibe-coded-websites-report.md` and `heardle-test/research/codex-ui-motion.md` first. Everything in the vibe-coded report still applies.

The brand idea is that the game is about listening, so the interface visibly listens, and everything else stays quiet. The look is a late-night stage: a near-black room `#0b0c0f` with a static film grain, surfaces `#15171c`, and one stage-light yellow accent `#ffd23f`. Wrong is coral `#ff6b5e`, skip is grey `#9aa0ab`, and text is `#f4f1ea`. All pass WCAG AA on the background. Use Big Shoulders Display (800, uppercase) for anything that shouts (wordmark, headlines, titles, play label, result, score) and Instrument Sans for everything else. Use one fixed type ramp and tabular figures for changing numbers. Use a 4px spacing scale everywhere and one 4px radius (true circles only for the play control). A 1px line is the only depth: no shadows, no glows. Selected items light up yellow with dark text. Standard icons are inlined Lucide SVGs at one stroke weight, sized to their text. The mark is six bars at the six clip lengths, as static SVG. No emoji anywhere.

Motion follows two rules. It happens only in direct response to a tap, or while a clip the player started is playing, driven by that clip's real audio. Under `prefers-reduced-motion`, nothing moves: add a global switch that turns off every transition, and show the meter as a static level. Use three timing tokens: 120ms feedback, 200ms enter, 480ms reveal. Use one ease-out curve (`cubic-bezier(.2,.8,.2,1)`) and one spring, reserved for the meter. Nothing lifts, tilts, bounces or scales on hover. No idle loops, no animated backgrounds, no stagger cascades on first load.

Build these signature moments.

The listening meter:
- Divide the 16-second bar at the stage marks. When a stage unlocks, its segment snaps in on the spring like a tape counter.
- While a clip plays, draw the unlocked part as the song's real energy: a thin row of bars or a small note-axis spectrogram from a Web Audio `AnalyserNode`.
- Smooth it the cava way: band-limit to about 50 Hz–10 kHz, log spread, gradual fall-off, fast rise and slow fall on the kick.
- Deezer's CDN allows CORS, so set `audio.crossOrigin = "anonymous"` before `src`, create one `AudioContext` on the first tap, and reuse it.

The play control:
- It shows its own progress as a drain line or ring inside the button.
- It morphs between play and stop using two SVG paths with the same point count.

The reveal:
- The answer screen irises out from the tapped button with `clip-path: circle()` growing to `1.42 × 100vmax`.
- The title decrypts over about 400ms, cycling characters from the title itself and settling left to right. The real title is the accessible name from the first frame.
- The cover arrives as a two-colour black-and-yellow halftone, dithered once on a canvas, then resolves to full colour.
- "Got it in N seconds." uses the accent, and N counts up once.

Right, wrong and skip:
- A wrong guess fills its row with the wrong colour, keeps the guess text readable, and changes colour over 120ms, with no shake.
- A skip fills grey and reads "Skipped".
- A right guess floats "+N" up from the score over 600ms. Ramp the row colour from the accent at 1 second toward muted at 16 seconds.
- Play three short, quiet right/wrong/skip sounds (CC0 or synthesised, respecting a mute toggle) only on taps, never over the clip.

Lists:
- Lists render instantly. Rows animate only when the player adds or removes one.

Optional, only if it holds 60 fps on a mid-range phone:
- A sparse Chladni sand field behind the play control that settles into a new figure at each unlocked stage. Use the square-plate formula with (m, n) from the clip's dominant pitch, with gradients computed in a worker, reimplemented from the formula.
- A one-time melt of the cover on "Not this time".
- If either misses 60 fps, leave it out and say so.

Technical rules:
- No render loop at rest or in a hidden tab.
- Any library loads from jsDelivr or cdnjs, stays under about 40 KB gzipped in total, and needs no build step.
- Only use code whose licence allows it. Reimplement MPL, LGPL, EPL and no-licence work from the idea instead of copying it.
- Every wait shows a brand-style loading state.
- Right and wrong are never shown by colour alone.
- Update the page title, description, share image and favicon to the new style.
- Everything must work at 375px before desktop is polished.

Before presenting anything, check your work against Section 5 of `heardle-test/research/song-guess-style-prompt.md` and the vibe-coded report, and fix every item that fails. Test in a browser at 375px and 1280px, in light and dark, with and without reduced motion. Include a real clip playing, to confirm the meter is reading the audio. Report what you tested, what you measured (frame rate on the optional effects, total added KB), and anything you left out and why.
