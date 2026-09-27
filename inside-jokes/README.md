# ConnecSeans

A Connections-style puzzle built from a friend group's jokes, lore and references. Live at
https://seanjoudrie.github.io/SeanJoudrie/inside-jokes/ once `main` deploys.

## Making a puzzle

1. Open **Make a puzzle** on the site.
2. Fill in four groups of four, easiest (yellow) to hardest (purple). Each group gets a
   connection name, four words and an optional story that shows once it's solved.
3. **Copy link** and send it to the group. The whole puzzle lives in the link after `#p=`,
   so nothing is uploaded and nobody needs an account.

To keep a puzzle at the plain home-page link, add it to `puzzles.js` (newest last). With more
than one puzzle there, the page shows a picker. Delete the `example: true` puzzle once
there's a real one.

Good puzzles have red herrings: a word that looks like it belongs in two groups.

## Files

- `game.js` rules only: checking guesses, the link format, share text. No DOM.
- `puzzles.js` the group's saved puzzles.
- `app.js` the page: play, the maker and the routes (`./`, `#n=2`, `#p=…`, `#make`).
- `tests/` unit tests for `game.js` and browser tests at 375px. `npm install && npm test`.
