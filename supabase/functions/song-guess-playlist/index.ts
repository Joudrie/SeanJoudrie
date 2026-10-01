// Song Guess: reads a public Spotify or Apple Music playlist for someone who
// doesn't own it.
// Spotify's Web API only returns a playlist's songs to its owner or a
// collaborator, so this reads the public embed page instead (the one Spotify
// serves for embedding a playlist on a website). Browsers can't read that
// page from another site, which is why this runs on a server.
//
// The embed page lists the first 100 songs only; `total` says how many the
// playlist really has, so the game can say "100 of 155".
//
// Apple Music: public playlist pages (music.apple.com/…/playlist/…/pl.…),
// including people's own shared playlists (pl.u-…), carry the whole song list
// in the page's server data, so those come back complete.
//
// No secrets, no database. Public GET, answers only the Song Guess origins.
//
// Deploy: supabase functions deploy song-guess-playlist --no-verify-jwt

const ALLOWED = [
  'https://joudrie.github.io',
  'https://seanjoudrie.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8000',
]
const UA = 'Mozilla/5.0 (compatible; SongGuess/1.0; +https://joudrie.github.io/SeanJoudrie/heardle-test/)'
const ID = /^[A-Za-z0-9]{22}$/
// music.apple.com/{country}/playlist/{optional-slug}/{pl.…}
const APPLE = /^(?:https?:\/\/)?(?:embed\.)?music\.apple\.com\/([a-z]{2})\/playlist\/(?:[^/?#]+\/)?(pl\.[A-Za-z0-9.-]+)/i

type Json = (body: unknown, status?: number) => Response

// Apple artwork URLs are templates like …/{w}x{h}bb.{f}
function artwork(a: any, px: number): string | null {
  const url = a?.dictionary?.url
  return url ? String(url).replace('{w}', String(px)).replace('{h}', String(px)).replace('{c}', 'bb').replace('{f}', 'jpg') : null
}

async function readApple(country: string, plId: string, json: Json): Promise<Response> {
  const link = `https://music.apple.com/${country}/playlist/${plId}`
  const page = await fetch(link, { headers: { 'User-Agent': UA } })
  if (page.status === 404) return json({ error: 'not_found' }, 404)
  if (!page.ok) return json({ error: 'apple_' + page.status }, 502)
  const html = await page.text()
  const data = html.match(/<script type="application\/json" id="serialized-server-data">([\s\S]*?)<\/script>/)
  const sections = data && JSON.parse(data[1])?.data?.[0]?.data?.sections
  if (!Array.isArray(sections)) return json({ error: 'not_found' }, 404)

  const header = sections.find((s: any) => String(s.id || '').startsWith('playlist-detail-header'))?.items?.[0] ?? {}
  const items = sections
    .filter((s: any) => String(s.id || '').startsWith('track-list -'))
    .flatMap((s: any) => s.items || [])
  const songs = items
    .filter((t: any) => t && t.title && t.artistName && t.contentDescriptor?.kind === 'song')
    .map((t: any) => {
      const adam = t.contentDescriptor?.identifiers?.storeAdamID
      const linked = (t.subtitleLinks || []).map((l: any) => l?.title).filter(Boolean)
      return {
        id: 'am' + (adam || t.title + '|' + t.artistName),
        title: t.title,
        artists: linked.length ? linked : [t.artistName],
        durationMs: Number(t.duration) || 0,
        cover: artwork(t.artwork, 160),
        url: adam ? `https://music.apple.com/${country}/song/${adam}` : null,
        service: 'apple',
      }
    })
  if (!songs.length) return json({ error: 'not_found' }, 404)

  return json({
    id: 'am-' + plId,
    service: 'apple',
    link,
    name: header.title || 'Playlist',
    owner: (header.subtitleLinks || []).map((l: any) => l?.title).filter(Boolean)[0] || '',
    image: artwork(header.artwork, 160),
    total: Math.max(Number(header.trackCount) || 0, songs.length),
    songs,
  })
}

async function idFromLink(link: string): Promise<string | null> {
  const direct = link.match(/playlist[/:]([A-Za-z0-9]{22})(?![A-Za-z0-9])/)
  if (direct) return direct[1]
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  // Share links from the Spotify app (spotify.link/…) redirect to the playlist.
  if (!/^(spotify\.link|spotify\.app\.link)$/.test(url.hostname)) return null
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
  const found = (res.url + ' ' + (await res.text())).match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]{22})(?![A-Za-z0-9])/)
  return found ? found[1] : null
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? ''
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    Vary: 'Origin',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      },
    })

  try {
    const q = new URL(req.url).searchParams
    const apple = (q.get('link') || '').trim().match(APPLE)
    if (apple) return await readApple(apple[1].toLowerCase(), apple[2], json)
    const id = q.get('id') || (q.get('link') ? await idFromLink(q.get('link')!) : null)
    if (!id || !ID.test(id)) return json({ error: 'not_a_playlist' }, 400)

    const [embed, page] = await Promise.all([
      fetch(`https://open.spotify.com/embed/playlist/${id}`, { headers: { 'User-Agent': UA } }),
      fetch(`https://open.spotify.com/playlist/${id}`, { headers: { 'User-Agent': UA } }).catch(() => null),
    ])
    if (embed.status === 404) return json({ error: 'not_found' }, 404)
    if (!embed.ok) return json({ error: 'spotify_' + embed.status }, 502)

    const html = await embed.text()
    const data = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    const entity = data && JSON.parse(data[1])?.props?.pageProps?.state?.data?.entity
    if (!entity || !Array.isArray(entity.trackList)) return json({ error: 'not_found' }, 404)

    const songs = entity.trackList
      .filter((t: { uri?: string }) => t.uri?.startsWith('spotify:track:'))
      .map((t: { uri: string; title: string; subtitle?: string; duration?: number }) => ({
        id: t.uri.split(':')[2],
        title: t.title,
        artists: String(t.subtitle || '').split(', ').filter(Boolean),
        durationMs: t.duration || 0,
      }))

    let total = entity.trackList.length
    if (page && page.ok) {
      const count = (await page.text()).match(/music:song_count" content="(\d+)"/)
      if (count) total = Math.max(total, Number(count[1]))
    }

    return json({
      id,
      name: entity.name || entity.title || 'Playlist',
      owner: entity.subtitle || '',
      image: entity.coverArt?.sources?.[0]?.url ?? null,
      total,
      songs,
    })
  } catch (e) {
    return json({ error: 'failed', detail: String(e).slice(0, 200) }, 500)
  }
})
