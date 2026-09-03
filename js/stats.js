// Player history, kept in localStorage. Nothing leaves the browser.

const KEY = 'wikigame:v1';

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
  history: [], // most recent first, capped
  settings: { images: true, navboxes: true, theme: 'light' }
};

let cache = null;

export function load() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...BLANK, ...JSON.parse(raw) } : { ...BLANK };
    cache.settings = { ...BLANK.settings, ...(cache.settings || {}) };
    cache.dailyResults = cache.dailyResults || {};
    cache.history = cache.history || [];
    migrate();
  } catch {
    cache = { ...BLANK };
  }
  return cache;
}

/**
 * v2 — the Wikipedia-white look became the default, so anyone still sitting on
 * the old "auto" default moves onto it once. An explicit later choice sticks.
 */
function migrate() {
  if (cache.settingsVersion >= 2) return;
  cache.settingsVersion = 2;
  cache.settings.theme = 'light';
  save();
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
 *          clicks:number,path:string[],dailyNumber:number|null,hints:number}} result
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
    path: result.path.slice(0, 30)
  });
  s.history = s.history.slice(0, 50);
  save();
  return s;
}

export function dailyResult(number) {
  return load().dailyResults[number] || null;
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
    history: s.history
  };
}

export function reset() {
  const settings = load().settings;
  cache = { ...BLANK, settings };
  save();
}
