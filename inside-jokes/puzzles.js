// The group's own puzzles, newest last. The home page plays the newest and
// lists the rest. Make one on the site (Make a puzzle), check it plays, then
// paste its fields here to keep it at the plain home-page link.
//
// Groups go easiest to hardest: yellow, green, blue, purple. `why` is the story
// behind the bit, shown once the group is solved; leave it '' to skip it.
// `example: true` labels a puzzle as sample content on the page.
const Puzzles = [
  {
    // A starter built from public facts about SNHU and Manchester; swap
    // groups for real inside jokes as they come in.
    title: 'Manchester, NH',
    by: '',
    groups: [
      {
        name: 'SNHU dorms',
        why: '',
        words: ['Kingston', 'Monadnock', 'Belknap', 'Conway'],
      },
      {
        name: 'Manchester bars',
        why: '',
        words: ['Strange Brew', "McGarvey's", 'Thirsty Moose', 'The Goat'],
      },
      {
        name: 'Irish drinking songs',
        why: 'The Wild Rover is also a Manchester pub. That was the trap.',
        words: ['Wild Rover', 'Whiskey in the Jar', 'Danny Boy', 'Molly Malone'],
      },
      {
        name: 'Presidents that are also NH towns',
        why: 'Washington and Lincoln are SNHU dorms too, which is why they looked like group one.',
        words: ['Washington', 'Lincoln', 'Jefferson', 'Monroe'],
      },
    ],
  },
];
