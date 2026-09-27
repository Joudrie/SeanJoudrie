// The group's own puzzles, newest last. The home page plays the newest and
// lists the rest. Make one on the site (Make a puzzle), check it plays, then
// paste its fields here to keep it at the plain home-page link.
//
// Groups go easiest to hardest: yellow, green, blue, purple. `why` is the story
// behind the bit, shown once the group is solved; leave it '' to skip it.
// `example: true` labels a puzzle as sample content on the page.
// `slug: 'name'` gives a puzzle its own link (…/inside-jokes/#name) and keeps
// it off the home page, so each friend group only sees its own.
const Puzzles = [
  {
    slug: 'wakefield',
    title: 'Wakefield',
    by: '',
    groups: [
      {
        name: 'Has a kid',
        why: '',
        words: ['Dante Bucci', 'Dan Guarino', 'Aliyah Romanelli Jones', 'Anthony Sacari'],
      },
      {
        name: "Spots we've smoked at or smoked from",
        why: 'Crystal Lake and Spot Pond are both water. That was the trap.',
        words: ['Crystal Lake', 'Bowladrome', 'Banana', 'Apple'],
      },
      {
        name: 'Last name is an English word',
        why: 'Major, Pierce, Silk, Spies.',
        words: ['Nick Major', 'Patrick Pierce', 'Laura Silk', 'Ava Spies'],
      },
      {
        name: "Hides a teacher's name",
        why: 'Ms. Lane, Ms. Cohn, Ms. Berger and Ms. Pond.',
        words: ['Fire Lane', 'Traffic Cone', 'Cheese Burger', 'Spot Pond'],
      },
    ],
  },
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
