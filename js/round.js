// A round: five races played back to back, scored against par.
//
// The card lives in localStorage rather than in the URL, so a reload resumes
// where you were and a round survives being left for a cup of tea. The URL
// carries only the seed, which is what makes a round shareable — the same five
// holes deal from it for anyone who opens the link.

import { roundPuzzles, ROUND_HOLES } from './puzzles.js';

const KEY = 'wikigame:round:v1';

/**
 * @typedef {{start:string,target:string,difficulty:string,
 *            clicks:number,ms:number,won:boolean,
 *            par:number|null,over:number|null}} Hole
 * @typedef {{seed:string,difficulty:string,hubBan:boolean,at:number,
 *            holes:(Hole|null)[]}} Card
 */

/** @returns {Card|null} */
export function load() {
  try {
    const card = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!card?.seed || !Array.isArray(card.holes)) return null;
    return card;
  } catch {
    return null;
  }
}

function save(card) {
  try {
    localStorage.setItem(KEY, JSON.stringify(card));
  } catch {
    // Private browsing costs the resume, not the round.
  }
}

export function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * The card for a seed: the one in progress if it matches, a fresh one if not.
 *
 * Opening somebody else's round link replaces yours. There is only ever one
 * card, and a round is a sitting rather than a thing you keep — a second slot
 * would mostly be a way to lose track of both.
 */
export function open(seed, { difficulty = 'any', hubBan = false } = {}) {
  const existing = load();
  if (existing?.seed === seed) return existing;
  const card = {
    seed,
    difficulty,
    hubBan: Boolean(hubBan),
    at: Date.now(),
    holes: Array(ROUND_HOLES).fill(null)
  };
  save(card);
  return card;
}

/** The pairs this card is played on. */
export function holes(card) {
  return roundPuzzles(card.seed, card.difficulty);
}

/** The hole to play next, or -1 when every one of them has been played. */
export function nextHole(card) {
  return card.holes.findIndex((h) => h == null);
}

/**
 * Store a finished hole. Par arrives a second or two later than the rest of
 * the result — the search is not blocking — so it is patched in by `scoreHole`.
 */
export function recordHole(card, index, { start, target, difficulty, clicks, ms, won }) {
  if (index < 0 || index >= card.holes.length) return card;
  card.holes[index] = { start, target, difficulty, clicks, ms, won, par: null, over: null };
  save(card);
  return card;
}

export function scoreHole(card, index, par, over) {
  const hole = card.holes[index];
  if (!hole || hole.par != null) return card;
  hole.par = par;
  hole.over = over;
  save(card);
  return card;
}

/**
 * A round's bottom line.
 *
 * A hole you gave up on still shows what it cost you, but it is left out of the
 * par total: golf does not score a hole that was never holed out, and inventing
 * a penalty number would be pretending to a precision this does not have. The
 * card says how many were holed instead, which is the honest version and reads
 * as the admission it is.
 */
export function totals(card) {
  const played = card.holes.filter(Boolean);
  const holed = played.filter((h) => h.won);
  const scored = holed.filter((h) => h.par != null);
  return {
    played: played.length,
    holed: holed.length,
    scored: scored.length,
    clicks: holed.reduce((n, h) => n + h.clicks, 0),
    ms: played.reduce((n, h) => n + h.ms, 0),
    par: scored.reduce((n, h) => n + h.par, 0),
    over: scored.reduce((n, h) => n + h.over, 0),
    // Every hole played, every one of them holed out, every one of them scored.
    complete: played.length === card.holes.length,
    fullyScored: scored.length === card.holes.length
  };
}
