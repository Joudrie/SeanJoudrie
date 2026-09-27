// Reserves: the playlists saved to play with, kept on this device with their
// songs so they don't have to load again. Each one comes from either the
// Spotify API (a playlist you own or collaborate on: every song) or the
// public-link reader (anyone's public playlist: the first 100 songs).

const Reserves = (() => {
  const KEY = 'sg-reserves-v1';
  const SEL = 'sg-selected-v1';
  // Reads public playlists you don't own; see supabase/functions/song-guess-playlist.
  const LINK_READER = 'https://ufvgirqurqofijoxryzh.supabase.co/functions/v1/song-guess-playlist';

  let list = [];
  let selected = new Set();
  let memoryOnly = false;

  function load() {
    try {
      list = JSON.parse(localStorage.getItem(KEY) || '[]');
      selected = new Set(JSON.parse(localStorage.getItem(SEL) || '[]'));
    } catch {
      list = [];
      selected = new Set();
    }
    selected = new Set([...selected].filter((id) => list.some((r) => r.id === id)));
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      localStorage.setItem(SEL, JSON.stringify([...selected]));
      memoryOnly = false;
    } catch {
      // Private browsing or full storage: reserves last until the tab closes.
      memoryOnly = true;
    }
  }

  const all = () => list;
  const get = (id) => list.find((r) => r.id === id);
  const has = (id) => list.some((r) => r.id === id);
  const isSelected = (id) => selected.has(id);
  const selectedList = () => list.filter((r) => selected.has(r.id));

  // New reserves are selected, unless `select` is false (bulk file imports,
  // where picking what to play is left to the person).
  function put(r, select = true) {
    const i = list.findIndex((x) => x.id === r.id);
    if (i >= 0) list[i] = r;
    else { list.unshift(r); if (select) selected.add(r.id); }
    save();
  }

  function remove(id) {
    list = list.filter((r) => r.id !== id);
    selected.delete(id);
    save();
  }

  function toggle(id) {
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    save();
  }

  function selectAll(on) {
    selected = on ? new Set(list.map((r) => r.id)) : new Set();
    save();
  }

  // A playlist ID from anything someone might paste: an open.spotify.com
  // link (with or without ?si=…), a spotify:playlist: URI, or the bare ID.
  function idFrom(text) {
    const s = String(text || '').trim();
    const m = s.match(/playlist[/:]([A-Za-z0-9]{22})(?![A-Za-z0-9])/) || s.match(/^([A-Za-z0-9]{22})$/);
    return m ? m[1] : null;
  }
  // Share links from the Spotify app (spotify.link/…) need the server to follow them.
  const isShortLink = (text) => /(^|\/\/)(spotify\.link|spotify\.app\.link)\//.test(String(text || '').trim());

  async function readPublic(params) {
    let res;
    try {
      res = await fetch(LINK_READER + '?' + new URLSearchParams(params));
    } catch {
      throw new Error('Couldn’t reach the playlist reader. Check your connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) throw new Error('Spotify says that playlist doesn’t exist or isn’t public. Private playlists and Spotify’s personal mixes (like Daily Mix) can only be added by their owner, from their library.');
    if (res.status === 400) throw new Error('That doesn’t look like a Spotify playlist link. In Spotify, tap ⋯ on the playlist, then Share, then Copy link.');
    if (!res.ok) throw new Error('Couldn’t read that playlist right now. Try again in a minute.');
    return {
      id: data.id,
      name: data.name,
      owner: data.owner,
      image: data.image,
      total: data.total,
      songs: data.songs,
      full: data.songs.length >= data.total,
      source: 'link',
      addedAt: Date.now(),
    };
  }

  // Every song through the Spotify API when you own or collaborate on the
  // playlist; otherwise the public reader.
  async function fromSpotify(pl, me, onProgress) {
    const mine = pl.collaborative || (pl.owner && me && pl.owner.id === me.id);
    if (!mine) return readPublic({ id: pl.id });
    const res = await Spotify.songs(pl, onProgress);
    return {
      id: pl.id,
      name: pl.name,
      owner: (pl.owner && (pl.owner.display_name || pl.owner.id)) || '',
      image: Spotify.imageUrl(pl.images, 48),
      total: res.songs.length,
      songs: res.songs,
      full: true,
      skipped: res.skipped,
      source: 'spotify',
      addedAt: Date.now(),
    };
  }

  // From a pasted link. Signed in and it's yours: every song. Otherwise the
  // public reader.
  async function fromLink(text, me, onProgress) {
    const id = idFrom(text);
    if (!id && isShortLink(text)) return readPublic({ link: String(text).trim() });
    if (!id) throw new Error('That doesn’t look like a Spotify playlist link. In Spotify, tap ⋯ on the playlist, then Share, then Copy link.');
    if (Spotify.isLoggedIn() && me) {
      try {
        const pl = await Spotify.api('/playlists/' + id + '?fields=id,name,owner(id,display_name),collaborative,images');
        return await fromSpotify(pl, me, onProgress);
      } catch (e) {
        if (e.status === 401) throw e;
        // Anything else (not found for this account, blocked): try the public page.
      }
    }
    return readPublic({ id });
  }

  // Fresh songs for a reserve that's already saved (playlists change).
  async function refresh(r, me, onProgress) {
    if (r.source === 'spotify' && Spotify.isLoggedIn()) {
      const pl = await Spotify.api('/playlists/' + r.id + '?fields=id,name,owner(id,display_name),collaborative,images');
      return fromSpotify(pl, me, onProgress);
    }
    return readPublic({ id: r.id });
  }

  load();
  return {
    all, get, has, put, remove, toggle, selectAll, isSelected, selectedList,
    idFrom, fromSpotify, fromLink, refresh,
    get memoryOnly() { return memoryOnly; },
  };
})();
