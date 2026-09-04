// The curated race pool. Every pair has been checked against live Wikipedia
// for existence and for not being a disambiguation page (see tools/check-puzzles.mjs).

import { mulberry32 } from './util.js';

export const DIFFICULTY = {
  easy: { label: 'Easy', hint: 'Neighbouring topics — a few clicks apart.' },
  medium: { label: 'Medium', hint: 'Different worlds. You will need a bridge article.' },
  hard: { label: 'Hard', hint: 'Nothing obvious connects these. Think laterally.' }
};

// PUZZLES[0] is the signature race. It is medium, so it is not part of the
// hard-only rotation (see DAILY_DIFFICULTY) — but it was Daily #1 before the
// daily became hard-only, so it stays pinned there by SCHEDULED. The quick
// race deals it like any other.
export const PUZZLES = [
  { start: 'Apple', target: 'Pearl Harbor', difficulty: 'medium', name: 'The Original' },

  // --- easy -------------------------------------------------------------
  { start: 'Coffee', target: 'Ethiopia', difficulty: 'easy' },
  { start: 'Basketball', target: 'Michael Jordan', difficulty: 'easy' },
  { start: 'Pizza', target: 'Italy', difficulty: 'easy' },
  { start: 'Sushi', target: 'Rice', difficulty: 'easy' },
  { start: 'Mount Everest', target: 'Oxygen', difficulty: 'easy' },
  { start: 'The Beatles', target: 'India', difficulty: 'easy' },
  { start: 'Chess', target: 'Cold War', difficulty: 'easy' },
  { start: 'Titanic', target: 'Iceberg', difficulty: 'easy' },
  { start: 'Guitar', target: 'Spain', difficulty: 'easy' },
  { start: 'Penguin', target: 'Antarctica', difficulty: 'easy' },
  { start: 'Chocolate', target: 'Aztecs', difficulty: 'easy' },
  { start: 'Baseball', target: 'Japan', difficulty: 'easy' },
  { start: 'Wine', target: 'France', difficulty: 'easy' },
  { start: 'Piano', target: 'Ludwig van Beethoven', difficulty: 'easy' },
  { start: 'Volcano', target: 'Pompeii', difficulty: 'easy' },
  { start: 'Telescope', target: 'Galileo Galilei', difficulty: 'easy' },

  // --- medium -----------------------------------------------------------
  { start: 'Banana', target: 'Nuclear weapon', difficulty: 'medium' },
  { start: 'William Shakespeare', target: 'Space Shuttle', difficulty: 'medium' },
  { start: 'Bicycle', target: 'Mona Lisa', difficulty: 'medium' },
  { start: 'Coca-Cola', target: 'Antarctica', difficulty: 'medium' },
  { start: 'Kangaroo', target: 'Great Wall of China', difficulty: 'medium' },
  { start: 'Lego', target: 'Cleopatra', difficulty: 'medium' },
  { start: 'Jazz', target: 'Tropical cyclone', difficulty: 'medium' },
  { start: 'Sushi', target: 'Formula One', difficulty: 'medium' },
  { start: 'Ludwig van Beethoven', target: 'Cryptocurrency', difficulty: 'medium' },
  { start: 'Umbrella', target: 'Mount Rushmore', difficulty: 'medium' },
  { start: 'Honey', target: 'Apollo 11', difficulty: 'medium' },
  { start: 'Salt', target: 'Mahatma Gandhi', difficulty: 'medium' },
  { start: 'Denim', target: 'Gold rush', difficulty: 'medium' },
  { start: 'Cheese', target: 'Napoleon', difficulty: 'medium' },
  { start: 'Skateboarding', target: 'Berlin Wall', difficulty: 'medium' },
  { start: 'Lighthouse', target: 'Alexander the Great', difficulty: 'medium' },
  { start: 'Chewing gum', target: 'Major League Baseball', difficulty: 'medium' },
  { start: 'Origami', target: 'DNA', difficulty: 'medium' },
  { start: 'Karaoke', target: 'Nikola Tesla', difficulty: 'medium' },
  { start: 'Bagpipes', target: 'Nuclear reactor', difficulty: 'medium' },
  { start: 'Common sunflower', target: 'Vincent van Gogh', difficulty: 'medium' },
  { start: 'Roller coaster', target: 'Isaac Newton', difficulty: 'medium' },
  { start: 'Tea', target: 'American Revolution', difficulty: 'medium' },
  { start: 'Surfing', target: 'Hawaii', difficulty: 'easy' },
  { start: 'Windmill', target: 'Don Quixote', difficulty: 'medium' },
  { start: 'Barcode', target: 'Chewing gum', difficulty: 'medium' },

  // --- hard -------------------------------------------------------------
  { start: 'Toothbrush', target: 'Black hole', difficulty: 'hard' },
  { start: 'Rubber duck', target: 'French Revolution', difficulty: 'hard' },
  { start: 'Bubble wrap', target: 'Genghis Khan', difficulty: 'hard' },
  { start: 'Ketchup', target: 'Higgs boson', difficulty: 'hard' },
  { start: 'Sock', target: 'Supernova', difficulty: 'hard' },
  { start: 'Paper clip', target: 'Marie Curie', difficulty: 'hard' },
  { start: 'Yo-yo', target: 'Chernobyl disaster', difficulty: 'hard' },
  { start: 'Hot dog', target: 'Mars rover', difficulty: 'hard' },
  { start: 'Traffic cone', target: 'Vincent van Gogh', difficulty: 'hard' },
  { start: 'Pencil', target: 'Antikythera mechanism', difficulty: 'hard' },
  { start: 'Marshmallow', target: 'Cold War', difficulty: 'hard' },
  { start: 'Shoelaces', target: 'Big Bang', difficulty: 'hard' },
  { start: 'Door handle', target: 'Mount Kilimanjaro', difficulty: 'hard' },
  { start: 'Bubble gum', target: 'Great Barrier Reef', difficulty: 'hard' },
  { start: 'Stapler', target: 'Ottoman Empire', difficulty: 'hard' },
  { start: 'Confetti', target: 'Plate tectonics', difficulty: 'hard' },
  { start: 'Mousetrap', target: 'Jane Austen', difficulty: 'hard' },
  { start: 'Bowling', target: 'Photosynthesis', difficulty: 'hard' },
  { start: 'Escalator', target: 'Sigmund Freud', difficulty: 'hard' },
  { start: 'Tuba', target: 'Machu Picchu', difficulty: 'hard' },

  // ====================================================================
  // Second batch. Appended and never inserted: the daily order is built
  // in blocks (see POOL_BLOCKS) so that growing the pool cannot renumber
  // a day that has already been scheduled.
  // ====================================================================

  // --- easy -------------------------------------------------------------
  { start: 'Tea', target: 'China', difficulty: 'easy' },
  { start: 'Sushi', target: 'Japan', difficulty: 'easy' },
  { start: 'Great Barrier Reef', target: 'Australia', difficulty: 'easy' },
  { start: 'Eiffel Tower', target: 'Paris', difficulty: 'easy' },
  { start: 'Great Pyramid of Giza', target: 'Egypt', difficulty: 'easy' },
  { start: 'Samurai', target: 'Sword', difficulty: 'easy' },
  { start: 'Vodka', target: 'Russia', difficulty: 'easy' },
  { start: 'Tango', target: 'Argentina', difficulty: 'easy' },
  { start: 'Maple syrup', target: 'Canada', difficulty: 'easy' },
  { start: 'Kimchi', target: 'Korea', difficulty: 'easy' },
  { start: 'Sahara', target: 'Africa', difficulty: 'easy' },
  { start: 'Amazon River', target: 'Brazil', difficulty: 'easy' },
  { start: 'Mount Fuji', target: 'Volcano', difficulty: 'easy' },
  { start: 'Giant panda', target: 'Bamboo', difficulty: 'easy' },
  { start: 'Shark', target: 'Ocean', difficulty: 'easy' },
  { start: 'Honey', target: 'Bee', difficulty: 'easy' },
  { start: 'Violin', target: 'Orchestra', difficulty: 'easy' },
  { start: 'Ballet', target: 'Russia', difficulty: 'easy' },
  { start: 'Great Sphinx of Giza', target: 'Egypt', difficulty: 'easy' },
  { start: 'Curry', target: 'India', difficulty: 'easy' },
  { start: 'Olive oil', target: 'Mediterranean Sea', difficulty: 'easy' },
  { start: 'Reggae', target: 'Jamaica', difficulty: 'easy' },
  { start: 'Flamenco', target: 'Spain', difficulty: 'easy' },
  { start: 'Whisky', target: 'Scotland', difficulty: 'easy' },
  { start: 'Tulip', target: 'Netherlands', difficulty: 'easy' },
  { start: 'Kangaroo', target: 'Australia', difficulty: 'easy' },
  { start: 'Camel', target: 'Desert', difficulty: 'easy' },
  { start: 'Polar bear', target: 'Arctic', difficulty: 'easy' },
  { start: 'Coral reef', target: 'Fish', difficulty: 'easy' },
  { start: 'Vaccine', target: 'Smallpox', difficulty: 'easy' },
  { start: 'Telescope', target: 'Moon', difficulty: 'easy' },
  { start: 'Piano', target: 'Jazz', difficulty: 'easy' },
  { start: 'Guitar', target: 'Rock music', difficulty: 'easy' },
  { start: 'Bicycle', target: 'Tour de France', difficulty: 'easy' },
  { start: 'Chess', target: 'Russia', difficulty: 'easy' },
  { start: 'Marathon', target: 'Greece', difficulty: 'easy' },
  { start: 'Olympic Games', target: 'Athens', difficulty: 'easy' },
  { start: 'Cricket', target: 'India', difficulty: 'easy' },
  { start: 'Rugby union', target: 'New Zealand', difficulty: 'easy' },
  { start: 'Surfing', target: 'Hawaii', difficulty: 'easy' },
  { start: 'Skiing', target: 'Alps', difficulty: 'easy' },
  { start: 'Coffee', target: 'Caffeine', difficulty: 'easy' },
  { start: 'Chocolate', target: 'Cocoa bean', difficulty: 'easy' },
  { start: 'Pizza', target: 'Tomato', difficulty: 'easy' },
  { start: 'Beer', target: 'Barley', difficulty: 'easy' },
  { start: 'Cheese', target: 'Milk', difficulty: 'easy' },
  { start: 'Salt', target: 'Sea', difficulty: 'easy' },
  { start: 'Lion', target: 'Africa', difficulty: 'easy' },

  // --- medium -----------------------------------------------------------
  { start: 'Napoleon', target: 'Russia', difficulty: 'medium' },
  { start: 'Leonardo da Vinci', target: 'Helicopter', difficulty: 'medium' },
  { start: 'Isaac Newton', target: 'Gravity', difficulty: 'medium' },
  { start: 'Albert Einstein', target: 'Nuclear weapon', difficulty: 'medium' },
  { start: 'Marie Curie', target: 'Cancer', difficulty: 'medium' },
  { start: 'Charles Darwin', target: 'Galápagos Islands', difficulty: 'medium' },
  { start: 'Vincent van Gogh', target: 'Japan', difficulty: 'medium' },
  { start: 'Wolfgang Amadeus Mozart', target: 'Vienna', difficulty: 'medium' },
  { start: 'William Shakespeare', target: 'Denmark', difficulty: 'medium' },
  { start: 'Cleopatra', target: 'Ancient Rome', difficulty: 'medium' },
  { start: 'Silk Road', target: 'Venice', difficulty: 'medium' },
  { start: 'Printing press', target: 'Reformation', difficulty: 'medium' },
  { start: 'Black Death', target: 'Rat', difficulty: 'medium' },
  { start: 'Vikings', target: 'Newfoundland and Labrador', difficulty: 'medium' },
  { start: 'Great Wall of China', target: 'Genghis Khan', difficulty: 'medium' },
  { start: 'Roman Empire', target: 'Christianity', difficulty: 'medium' },
  { start: 'Ottoman Empire', target: 'Coffee', difficulty: 'medium' },
  { start: 'Industrial Revolution', target: 'Cotton', difficulty: 'medium' },
  { start: 'French Revolution', target: 'Guillotine', difficulty: 'medium' },
  { start: 'American Civil War', target: 'Cotton', difficulty: 'medium' },
  { start: 'Titanic', target: 'Morse code', difficulty: 'medium' },
  { start: 'Wright brothers', target: 'Bicycle', difficulty: 'medium' },
  { start: 'Apollo 11', target: 'Cold War', difficulty: 'medium' },
  { start: 'Berlin Wall', target: 'David Bowie', difficulty: 'medium' },
  { start: 'Internet', target: 'ARPANET', difficulty: 'medium' },
  { start: 'Alan Turing', target: 'Enigma machine', difficulty: 'medium' },
  { start: 'Penicillin', target: 'Mold', difficulty: 'medium' },
  { start: 'DNA', target: 'Rosalind Franklin', difficulty: 'medium' },
  { start: 'Periodic table', target: 'Dmitri Mendeleev', difficulty: 'medium' },
  { start: 'Volcano', target: 'Dinosaur', difficulty: 'medium' },
  { start: 'Antarctica', target: 'Meteorite', difficulty: 'medium' },
  { start: 'Coral reef', target: 'Climate change', difficulty: 'medium' },
  { start: 'Mahatma Gandhi', target: 'Salt', difficulty: 'medium' },
  { start: 'Tea', target: 'Boston Tea Party', difficulty: 'medium' },
  { start: 'Sugar', target: 'Slavery', difficulty: 'medium' },
  { start: 'Natural rubber', target: 'Amazon rainforest', difficulty: 'medium' },
  { start: 'Petroleum', target: 'Car', difficulty: 'medium' },
  { start: 'Gold', target: 'California gold rush', difficulty: 'medium' },
  { start: 'Diamond', target: 'Botswana', difficulty: 'medium' },
  { start: 'Chocolate', target: 'Switzerland', difficulty: 'medium' },
  { start: 'Pasta', target: 'Marco Polo', difficulty: 'medium' },
  { start: 'Potato', target: 'Ireland', difficulty: 'medium' },
  { start: 'Tomato', target: 'Italy', difficulty: 'medium' },
  { start: 'Banana', target: 'Costa Rica', difficulty: 'medium' },
  { start: 'Opium Wars', target: 'Tea', difficulty: 'medium' },
  { start: 'Whaling', target: 'Petroleum', difficulty: 'medium' },
  { start: 'Beaver', target: 'Hat', difficulty: 'medium' },
  { start: 'Spice trade', target: 'Portugal', difficulty: 'medium' },
  { start: 'Compass', target: 'Song dynasty', difficulty: 'medium' },
  { start: 'Gunpowder', target: 'Fireworks', difficulty: 'medium' },
  { start: 'Clock', target: 'Longitude', difficulty: 'medium' },
  { start: 'Cowpox', target: 'Vaccine', difficulty: 'medium' },
  { start: 'Radio', target: 'Titanic', difficulty: 'medium' },
  { start: 'Calculus', target: 'Isaac Newton', difficulty: 'medium' },
  { start: 'Jazz', target: 'New Orleans', difficulty: 'medium' },
  { start: 'Photography', target: 'Silver', difficulty: 'medium' },

  // --- hard -------------------------------------------------------------
  { start: 'Bubble wrap', target: 'Wallpaper', difficulty: 'hard' },
  { start: 'Microwave oven', target: 'Radar', difficulty: 'hard' },
  { start: 'Post-it note', target: 'Adhesive', difficulty: 'hard' },
  { start: 'Slinky', target: 'Battleship', difficulty: 'hard' },
  { start: 'Velcro', target: 'Arctium', difficulty: 'hard' },
  { start: 'Polytetrafluoroethylene', target: 'Manhattan Project', difficulty: 'hard' },
  { start: 'Cyanoacrylate', target: 'Vietnam War', difficulty: 'hard' },
  { start: 'Penicillin', target: 'Petri dish', difficulty: 'hard' },
  { start: 'Chainsaw', target: 'Childbirth', difficulty: 'hard' },
  { start: 'Ketchup', target: 'Fish sauce', difficulty: 'hard' },
  { start: 'Pineapple', target: 'Christopher Columbus', difficulty: 'hard' },
  { start: 'Guinea pig', target: 'Peru', difficulty: 'hard' },
  { start: 'Kiwifruit', target: 'China', difficulty: 'hard' },
  { start: 'Turkey (bird)', target: 'Turkey', difficulty: 'hard' },
  { start: 'Sandwich', target: 'John Montagu, 4th Earl of Sandwich', difficulty: 'hard' },
  { start: 'Marathon', target: 'Achaemenid Empire', difficulty: 'hard' },
  { start: 'Nylon', target: 'Silk', difficulty: 'hard' },
  { start: 'Aspirin', target: 'Willow', difficulty: 'hard' },
  { start: 'Morphine', target: 'Opium', difficulty: 'hard' },
  { start: 'Rubber duck', target: 'Ocean current', difficulty: 'hard' },
  { start: 'Barcode', target: 'Chewing gum', difficulty: 'hard' },
  { start: 'QWERTY', target: 'Typewriter', difficulty: 'hard' },
  { start: 'Emoji', target: 'Japan', difficulty: 'hard' },
  { start: 'Origami', target: 'Mathematics', difficulty: 'hard' },
  { start: 'Fractal', target: 'Coast', difficulty: 'hard' },
  { start: 'Fibonacci sequence', target: 'Common sunflower', difficulty: 'hard' },
  { start: 'Prime number', target: 'Cicada', difficulty: 'hard' },
  { start: 'Chaos theory', target: 'Weather', difficulty: 'hard' },
  { start: 'Game theory', target: 'Cold War', difficulty: 'hard' },
  { start: 'Cryptography', target: 'Julius Caesar', difficulty: 'hard' },
  { start: '0', target: 'India', difficulty: 'hard' },
  { start: 'Algebra', target: 'Baghdad', difficulty: 'hard' },
  { start: 'Logarithm', target: 'Slide rule', difficulty: 'hard' },
  { start: 'Steam engine', target: 'Mining', difficulty: 'hard' },
  { start: 'Electrical telegraph', target: 'American Civil War', difficulty: 'hard' },
  { start: 'Refrigeration', target: 'Ice trade', difficulty: 'hard' },
  { start: 'Air conditioning', target: 'Printing', difficulty: 'hard' },
  { start: 'Elevator', target: 'Skyscraper', difficulty: 'hard' },
  { start: 'Concrete', target: 'Roman Empire', difficulty: 'hard' },
  { start: 'Glass', target: 'Telescope', difficulty: 'hard' },
  { start: 'Nutmeg', target: 'Manhattan', difficulty: 'hard' },
  { start: 'Tulip', target: 'Financial crisis', difficulty: 'hard' },
];

// Day 1 of the daily series.
export const DAILY_EPOCH = Date.UTC(2026, 8, 1); // 1 Sep 2026
const DAY_MS = 86400000;

/** Local calendar date -> daily number, 1-based. */
export function dailyNumber(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((local - DAILY_EPOCH) / DAY_MS) + 1);
}

// Where each batch of races ended, oldest first. The pool only ever grows by
// appending, and the daily order is built to match: each block is shuffled
// within itself and the blocks are concatenated.
//
// A single shuffle over the whole pool would repermute everything the moment a
// race was added, moving days that have already been played — someone's stored
// result for Daily #3 would end up attached to a different race. Shuffling per
// block means an append can only ever add days to the end of the schedule.
const POOL_BLOCKS = [63];

// The daily is always the hardest tier. Easy and medium races stay in the pool
// for the quick race; they are simply never scheduled as a daily.
export const DAILY_DIFFICULTY = 'hard';

const ORDER = (() => {
  const rand = mulberry32(0x77494b49); // "wIKI"
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const order = [];
  let from = 0;
  for (const to of [...POOL_BLOCKS, PUZZLES.length]) {
    const block = PUZZLES.map((_, i) => i)
      .slice(from, to)
      .filter((i) => PUZZLES[i].difficulty === DAILY_DIFFICULTY);
    if (block.length) order.push(...shuffle(block));
    from = to;
  }
  // A tier with nothing in it would leave the daily with nothing to deal.
  return order.length ? order : PUZZLES.map((_, i) => i);
})();

/**
 * Days already dealt, from before the daily became hard-only.
 *
 * Pinned by value, because a day that has been played must keep meaning the
 * race it was played on: results are stored against the daily *number*, so
 * renumbering day 3 silently reattaches somebody's score to a different race.
 * The hard-only rotation picks up after these.
 */
const SCHEDULED = [
  { start: 'Apple', target: 'Pearl Harbor' },      // the signature race
  { start: 'Denim', target: 'Gold rush' },
  { start: 'Bubble wrap', target: 'Genghis Khan' },
  { start: 'Surfing', target: 'Hawaii' }
];

const findPuzzle = ({ start, target }) =>
  PUZZLES.find((p) => p.start === start && p.target === target);

export function dailyPuzzle(date = new Date()) {
  const n = dailyNumber(date);

  const pinned = SCHEDULED[n - 1];
  if (pinned) {
    const puzzle = findPuzzle(pinned);
    if (puzzle) return { ...puzzle, mode: 'daily', number: n };
  }

  // Everything from here is drawn from the hard tier. The index is wrapped the
  // long way round so that a pinned race going missing from the pool falls back
  // to a real race rather than off the front of the order.
  const i = n - 1 - SCHEDULED.length;
  const at = (((i % ORDER.length) + ORDER.length) % ORDER.length);
  return { ...PUZZLES[ORDER[at]], mode: 'daily', number: n };
}

const raceKey = (p) => `${p.start}|${p.target}`;

// Quick race used to avoid only the race you had just played. Drawing from a
// filtered pool of seventeen, that puts an obvious repeat about five races in —
// which is exactly what it felt like. Remembering a run of recent picks walks
// most of the way through a pool before anything comes round again.
const recent = [];

export function randomPuzzle(difficulty = 'any', exclude = null) {
  const matches = PUZZLES.filter((p) => difficulty === 'any' || p.difficulty === difficulty);
  if (!matches.length) return { ...PUZZLES[0], mode: 'random' };

  const blocked = new Set(recent);
  if (exclude) blocked.add(raceKey(exclude));

  // Once everything recent is blocked, forget the run rather than refusing to
  // deal — but still never hand back the race that is on screen.
  const fresh = matches.filter((p) => !blocked.has(raceKey(p)));
  const pool = fresh.length
    ? fresh
    : matches.filter((p) => !exclude || raceKey(p) !== raceKey(exclude));

  const pick = pool[Math.floor(Math.random() * pool.length)] || matches[0];

  recent.push(raceKey(pick));
  // Hold at most half the pool, so there is always a real choice left.
  const cap = Math.max(1, Math.floor(matches.length / 2));
  while (recent.length > cap) recent.shift();

  return { ...pick, mode: 'random' };
}

export function msUntilNextDaily(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next - now;
}
