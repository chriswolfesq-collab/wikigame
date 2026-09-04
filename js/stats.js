// Player history, kept in localStorage. Nothing leaves the browser.

const KEY = 'wikigame:v1';
const VERSION = 3;

const BLANK = {
  // settingsVersion is deliberately absent — its absence in a stored blob is
  // what tells migrate() the blob predates the current defaults.
  played: 0,
  won: 0,
  totalClicks: 0,
  totalMs: 0,
  bestClicks: null,
  bestMs: null,
  dailyStreak: 0,
  bestStreak: 0,
  lastDailyNumber: null,
  playerName: '',
  dailyResults: {}, // dailyNumber -> { ms, clicks, won }
  dailySeen: {}, // dailyNumber -> [{ ms, clicks, won }] — every run this browser has seen
  history: [], // most recent first, capped
  settings: { images: true, navboxes: true, ghost: true, theme: 'light' }
};

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...BLANK, ...JSON.parse(raw) } : { ...BLANK };
    cache.settings = { ...BLANK.settings, ...(cache.settings || {}) };
    cache.dailyResults = cache.dailyResults || {};
    cache.dailySeen = cache.dailySeen || {};
    cache.history = cache.history || [];
    migrate();
  } catch {
    cache = { ...BLANK };
  }
  return cache;
}

function migrate() {
  const from = cache.settingsVersion || 0;
  if (from >= VERSION) return;

  // v2 — the Wikipedia-white look became the default, so anyone still sitting
  // on the old "auto" default moves onto it once. A later choice sticks.
  if (from < 2) cache.settings.theme = 'light';

  // v3 — a start-equals-target race used to register as an instant win at
  // 0 clicks and 0:00, which no honest run can ever beat. Undo that damage.
  if (from < 3) repairSelfRaces();

  cache.settingsVersion = VERSION;
  save();
}

/**
 * A win at zero clicks was only ever possible through the self-race bug, so
 * that is a safe signature to strip. The bests are only recomputed when they
 * actually carry the corrupt value — a legitimate best that has aged out of
 * the capped history must not be thrown away.
 */
function repairSelfRaces() {
  const bogus = cache.history.filter((h) => h.won && h.clicks === 0);
  if (!bogus.length && cache.bestClicks !== 0 && cache.bestMs !== 0) return;

  for (const h of bogus) {
    cache.played = Math.max(0, cache.played - 1);
    cache.won = Math.max(0, cache.won - 1);
    cache.totalClicks = Math.max(0, cache.totalClicks - (h.clicks || 0));
    cache.totalMs = Math.max(0, cache.totalMs - (h.ms || 0));
  }
  cache.history = cache.history.filter((h) => !(h.won && h.clicks === 0));

  const wins = cache.history.filter((h) => h.won && h.clicks > 0);
  if (cache.bestClicks === 0) {
    cache.bestClicks = wins.length ? Math.min(...wins.map((h) => h.clicks)) : null;
  }
  if (cache.bestMs === 0) {
    cache.bestMs = wins.length ? Math.min(...wins.map((h) => h.ms)) : null;
  }

  for (const [n, r] of Object.entries(cache.dailyResults)) {
    if (r.won && r.clicks === 0) delete cache.dailyResults[n];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* private browsing, quota — the game still plays fine */
  }
}

export function getSettings() {
  return load().settings;
}

export function getPlayerName() {
  return load().playerName || '';
}

export function setPlayerName(name) {
  load().playerName = String(name || '').trim().slice(0, 24);
  save();
}

export function setSetting(key, value) {
  load().settings[key] = value;
  save();
}

/**
 * @param {{mode:string,start:string,target:string,won:boolean,ms:number,
 *          clicks:number,path:string[],dailyNumber:number|null,hints:number,
 *          backs:number,seen:number,navboxes:boolean}} result
 */
export function record(result) {
  const s = load();
  s.played += 1;

  if (result.won) {
    s.won += 1;
    s.totalClicks += result.clicks;
    s.totalMs += result.ms;
    if (s.bestClicks == null || result.clicks < s.bestClicks) s.bestClicks = result.clicks;
    if (s.bestMs == null || result.ms < s.bestMs) s.bestMs = result.ms;
  }

  if (result.mode === 'daily' && result.dailyNumber != null) {
    const prev = s.dailyResults[result.dailyNumber];
    // Keep the best attempt at a given daily.
    if (!prev || (result.won && (!prev.won || result.ms < prev.ms))) {
      s.dailyResults[result.dailyNumber] = {
        ms: result.ms,
        clicks: result.clicks,
        won: result.won
      };
    }
    if (result.won) recordSeen(result.dailyNumber, { ms: result.ms, clicks: result.clicks, won: true, by: null });

    if (result.won && !prev?.won) {
      s.dailyStreak = s.lastDailyNumber === result.dailyNumber - 1 ? s.dailyStreak + 1 : 1;
      s.lastDailyNumber = result.dailyNumber;
      s.bestStreak = Math.max(s.bestStreak, s.dailyStreak);
    }
  }

  s.history.unshift({
    at: Date.now(),
    mode: result.mode,
    start: result.start,
    target: result.target,
    won: result.won,
    ms: result.ms,
    clicks: result.clicks,
    hints: result.hints || 0,
    backs: result.backs || 0,
    seen: result.seen || 0,
    // Navboxes roughly halve the ways out of a big article when off, so a
    // score only means something next to the setting it was made under.
    navboxes: result.navboxes !== false,
    path: result.path.slice(0, 30)
  });
  s.history = s.history.slice(0, 50);
  save();
  return s;
}

export function dailyResult(number) {
  return load().dailyResults[number] || null;
}

/* ------------------------------------------------------ what we have seen */

// Bounds on a store that only ever grows: a month of dailies is more than
// anyone compares against, and fifty runs is a stable median.
const SEEN_DAYS = 30;
const SEEN_PER_DAY = 50;

/**
 * Record a run on a given daily that this browser has legitimately seen —
 * one of your own, or one carried in a challenge link somebody sent you.
 *
 * Deduplicated on the run itself: opening the same link twice, or reloading
 * it, must not count the run twice.
 *
 * @returns {boolean} true if this was a run we had not seen before
 */
export function recordSeen(dailyNumber, run) {
  if (dailyNumber == null || !run || run.clicks == null || !run.won) return false;
  const s = load();
  const key = String(dailyNumber);
  const list = (s.dailySeen[key] = s.dailySeen[key] || []);

  // Clicks plus an exact millisecond is identity enough: two people tying to
  // the millisecond is not a thing that happens, and leaving the name out is
  // what stops your own run counting twice when you open your own link.
  const fingerprint = (r) => `${r.clicks}|${Math.round(r.ms || 0)}`;
  const mark = fingerprint(run);
  if (list.some((r) => fingerprint(r) === mark)) return false;

  list.push({ ms: Math.round(run.ms || 0), clicks: run.clicks, by: run.by || null });
  if (list.length > SEEN_PER_DAY) list.splice(0, list.length - SEEN_PER_DAY);

  // Drop the oldest dailies once the store has run long enough to matter.
  const numbers = Object.keys(s.dailySeen).map(Number).sort((a, b) => a - b);
  for (const n of numbers.slice(0, Math.max(0, numbers.length - SEEN_DAYS))) {
    delete s.dailySeen[String(n)];
  }

  save();
  return true;
}

/** Every run seen on a daily, yours included. */
export function seenFor(dailyNumber) {
  return load().dailySeen[String(dailyNumber)] || [];
}

export function summary() {
  const s = load();
  return {
    played: s.played,
    won: s.won,
    winRate: s.played ? Math.round((s.won / s.played) * 100) : 0,
    avgClicks: s.won ? s.totalClicks / s.won : null,
    avgMs: s.won ? s.totalMs / s.won : null,
    bestClicks: s.bestClicks,
    bestMs: s.bestMs,
    streak: s.dailyStreak,
    bestStreak: s.bestStreak,
    // The caller needs this to tell a live streak from one already broken:
    // dailyStreak only resets on the next win, not when a day is missed.
    lastDailyNumber: s.lastDailyNumber,
    history: s.history
  };
}

export function reset() {
  const settings = load().settings;
  cache = { ...BLANK, settings };
  save();
}
