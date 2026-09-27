// The group's own puzzles, newest last. The home page plays the newest and
// lists the rest. Make one on the site (Make a puzzle), check it plays, then
// paste its fields here to keep it at the plain home-page link.
//
// Groups go easiest to hardest: yellow, green, blue, purple. `why` is the story
// behind the bit, shown once the group is solved; leave it '' to skip it.
// `example: true` labels a puzzle as sample content on the page.
const Puzzles = [
  {
    example: true,
    title: 'Example: a generic group chat',
    by: 'Sean',
    groups: [
      {
        name: 'Excuses for being late',
        why: 'Example story: this is where the lore goes, like who uses this excuse every single time.',
        words: ['Traffic', 'Parking', 'Alarm', 'Uber'],
      },
      {
        name: 'Road trip snacks',
        why: 'Example story: the trip, the gas station, the person who bought the sushi.',
        words: ['Jerky', 'Twizzlers', 'Sunflower seeds', 'Gas station sushi'],
      },
      {
        name: 'Every group trip, without fail',
        why: 'Example story: name the trip each one is from.',
        words: ['Lost keys', 'Dead phone', 'Wrong exit', 'Venmo requests'],
      },
      {
        name: '___ night',
        why: 'Example story: the hardest group should look like it fits somewhere else.',
        words: ['Game', 'Trivia', 'Karaoke', 'Taco'],
      },
    ],
  },
];
