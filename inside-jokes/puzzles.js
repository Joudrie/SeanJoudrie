// The group's own puzzles, newest last. The home page plays the newest and
// lists the rest. Make one on the site (Make a puzzle), check it plays, then
// paste its fields here to keep it at the plain home-page link.
//
// Groups go easiest to hardest: yellow, green, blue, purple. `why` is the story
// behind the bit, shown once the group is solved; leave it '' to skip it.
// `example: true` labels a puzzle as sample content on the page.
//
// Each friend group gets its own page with its own puzzle file, so no page
// holds another group's puzzle: this file is SNHU's (/inside-jokes/), and
// editions/wakefield.js is Wakefield's (/wakefield/, added at deploy).
const Puzzles = [
  {
    title: 'SNHU',
    by: '',
    groups: [
      {
        name: 'Demolished SNHU buildings',
        why: '',
        words: ['Exeter', 'Spaulding', 'Rockingham', 'Stark'],
      },
      {
        name: "Bars we've gone to",
        why: '',
        words: ['SoHo', 'The Crow', 'Parq', 'Double Deuce'],
      },
      {
        name: 'Cheeses',
        why: "Colby is a friend too. That was the trap.",
        words: ['Colby', 'Goat', 'Blue', 'American'],
      },
      {
        name: 'Names with a double letter',
        why: 'JJ and Cassidy are friends. Dolly and Cappy are pets.',
        words: ['JJ', 'Cassidy', 'Dolly', 'Cappy'],
      },
    ],
  },
];

// Links that used to point at another group's puzzle on this page, and the
// page each now lives on.
const Moved = { wakefield: '../wakefield/' };
