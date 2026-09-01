// The curated race pool. Every pair has been checked against live Wikipedia
// for existence and for not being a disambiguation page (see tools/check-puzzles.mjs).

import { mulberry32 } from './util.js';

export const DIFFICULTY = {
  easy: { label: 'Easy', hint: 'Neighbouring topics — a few clicks apart.' },
  medium: { label: 'Medium', hint: 'Different worlds. You will need a bridge article.' },
  hard: { label: 'Hard', hint: 'Nothing obvious connects these. Think laterally.' }
};

// PUZZLES[0] is the signature race and is always Daily #1.
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
  { start: 'Tuba', target: 'Machu Picchu', difficulty: 'hard' }
];

// Day 1 of the daily series.
export const DAILY_EPOCH = Date.UTC(2026, 8, 1); // 1 Sep 2026
const DAY_MS = 86400000;

/** Local calendar date -> daily number, 1-based. */
export function dailyNumber(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((local - DAILY_EPOCH) / DAY_MS) + 1);
}

// One deterministic shuffle of the pool, with the signature race pinned first.
const ORDER = (() => {
  const rest = PUZZLES.map((_, i) => i).slice(1);
  const rand = mulberry32(0x77494b49); // "wIKI"
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [0, ...rest];
})();

export function dailyPuzzle(date = new Date()) {
  const n = dailyNumber(date);
  const puzzle = PUZZLES[ORDER[(n - 1) % ORDER.length]];
  return { ...puzzle, mode: 'daily', number: n };
}

export function randomPuzzle(difficulty = 'any', exclude = null) {
  const pool = PUZZLES.filter(
    (p) => (difficulty === 'any' || p.difficulty === difficulty) &&
      !(exclude && p.start === exclude.start && p.target === exclude.target)
  );
  const pick = pool[Math.floor(Math.random() * pool.length)] || PUZZLES[0];
  return { ...pick, mode: 'random' };
}

export function msUntilNextDaily(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next - now;
}
