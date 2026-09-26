# Song Guess (early test)

Guess songs from Spotify playlists, one clip at a time. Save playlists to your **reserves**, pick one or several, and tap Play. Repeats are removed and the order is shuffled. Each song starts as a 1-second clip; every wrong guess or skip unlocks more: 1s, 2s, 4s, 7s, 11s, 16s.

## Adding playlists to your reserves

- **From your Spotify library** (sign in with Spotify): playlists you own or collaborate on load every song. Playlists you saved from other people load their first 100 songs.
- **By link** (no sign-in needed): paste any public playlist's link (`open.spotify.com/playlist/…`, a `spotify.link/…` share link, or a `spotify:playlist:` URI). It loads the first 100 songs; your own playlists load in full when you're signed in.
- **Why 100:** Spotify's API only returns a playlist's songs to its owner or a collaborator. For anyone else's playlist, the game reads Spotify's public embed page, which lists the first 100 songs. The reserve says "100 of 155" and explains the workaround: in Spotify, add the playlist to a new playlist of your own, then add that copy from your library.

Reserves are saved on the device (`localStorage`) with their songs, so they don't reload each time. "Update songs" re-reads a playlist that changed.

Live at https://seanjoudrie.github.io/SeanJoudrie/heardle-test/. It stays at this address because it's the redirect URI saved in the Spotify app.

## How it works

| File | What it does |
|---|---|
| `spotify.js` | Spotify login (Authorization Code with PKCE, straight from the browser, no server or client secret), token refresh, playlists, every song in a playlist |
| `clips.js` | Title clean-up and matching (`Text`), and 30-second clips from Deezer's public search API (`Clips`) |
| `reserves.js` | Saved playlists and their songs; adding from the library or a link |
| `../supabase/functions/song-guess-playlist/` | Reads a public playlist's embed page for playlists you don't own (Supabase project `Globalio`, no secrets, answers only this site) |
| `ui.js` | Look, motion and sound: the listening meter, play control, right/wrong/skip sounds, iris reveal, decrypting title, halftone cover, "+N" |
| `app.js` | Screens: reserves, your Spotify library, guessing, reveal, end |

- **Clips come from Deezer, not Spotify.** Spotify's API stopped giving out preview clips in 2024. Each song is looked up on Deezer by title and artist when it comes up (and one song ahead). Deezer doesn't allow cross-site `fetch()`, so this uses its JSONP API.
- **Matching prefers the original recording.** Same title and one of the same artists, then no version words, then closest length. A live or acoustic version is used only when Deezer has nothing closer, and the reveal names it. Remixes, demos, other takes, karaoke and covers are never used. Songs with no match are skipped and counted at the end. Against a real 100-song playlist, 96 matched.
- **Deezer clip links expire after about 15 minutes.** A found clip is reused for 10 minutes. One that fails to play is fetched once more before the song is skipped.

## Limits

- **Spotify:** a playlist's songs are only returned to its owner or a collaborator. While the Spotify app is in Development Mode, only accounts added under Settings → User Management in the developer dashboard can connect (5 max). Spotify's developer policy also says not to build games on its platform, and reading the embed page isn't an official API (it can change without notice), so this can't go public as it is.
- **Deezer:** check Deezer's API terms before any public launch.

## Run locally

Serve the folder (`python3 -m http.server 8000`) and add `http://127.0.0.1:8000/` as a redirect URI in the Spotify app. Spotify doesn't accept `localhost`.

## Style

The style comes from `research/song-guess-style-prompt.md` (built from the Codex research in `research/codex-ui-motion.md`):
- **Palette:** a late-night stage: near-black, one stage-light yellow, coral for wrong. All pass WCAG AA.
- **Type:** Big Shoulders Display for anything that shouts, Instrument Sans for everything else.
- **Shape:** a 4px spacing scale, one radius, borders instead of shadows.

Motion runs only on a tap or while a clip the player started is playing, and none of it runs under `prefers-reduced-motion`.

- **The meter listens.** The `<audio>` element has `crossOrigin = "anonymous"`, since Deezer's clip CDN allows CORS. It is routed through a single `AudioContext` and `AnalyserNode`, created on the first tap. The meter draws the energy of the seconds you've actually heard, smoothed the way cava does it.
- **No libraries.** All motion is CSS, the Web Animations API, or small canvas routines in `ui.js`. Icons are inline Lucide SVGs (ISC).
- **Not built:** the optional Chladni sand field and the melting cover from the prompt. Both need testing on a real phone first.
