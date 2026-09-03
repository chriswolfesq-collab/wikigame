// Challenge links and shareable result text.

import { fmtTimeShort, toUrlTitle, fromUrlTitle } from './util.js';

/**
 * Routes:
 *   #/                          home
 *   #/race/Start/Target         open race
 *   #/race/Start/Target?ms=..&clicks=..&h=..&nb=0&by=Name&p=A|B|C&daily=7
 *                               a finished run — opens on the result, then races
 */
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return { route: 'home' };
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const q = new URLSearchParams(queryPart || '');

  if (segs[0] === 'race' && segs[1] && segs[2]) {
    const challenge =
      q.has('ms') || q.has('clicks')
        ? {
            ms: Number(q.get('ms')) || null,
            clicks: q.has('clicks') ? Number(q.get('clicks')) : null,
            hints: Number(q.get('h')) || 0,
            // Absent means the default (on); only the harder board is recorded.
            navboxes: q.has('nb') ? q.get('nb') !== '0' : null,
            by: q.get('by') || null,
            path: q.get('p') ? decodePath(q.get('p')) : null
          }
        : null;
    return {
      route: 'race',
      start: fromUrlTitle(segs[1]),
      target: fromUrlTitle(segs[2]),
      dailyNumber: q.has('daily') ? Number(q.get('daily')) : null,
      mode: q.get('mode') || (q.has('daily') ? 'daily' : challenge ? 'challenge' : 'custom'),
      challenge
    };
  }
  return { route: 'home' };
}

export function raceHash({ start, target, mode, dailyNumber }) {
  const q = new URLSearchParams();
  if (dailyNumber) q.set('daily', String(dailyNumber));
  else if (mode && mode !== 'custom') q.set('mode', mode);
  const qs = q.toString();
  return `#/race/${toUrlTitle(start)}/${toUrlTitle(target)}${qs ? '?' + qs : ''}`;
}

/**
 * The route is packed into the link so the opener can reveal it, but a raw
 * URL is often shown in full in chat — base64 keeps the spoiler spoiled.
 */
function encodePath(titles) {
  const bytes = new TextEncoder().encode(titles.join('|'));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePath(param) {
  try {
    const b64 = param.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + (b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const titles = new TextDecoder().decode(bytes).split('|').filter(Boolean);
    return titles.length ? titles : null;
  } catch {
    return null; // a mangled link should still open the race
  }
}

export function baseUrl() {
  return location.origin + location.pathname;
}

export function raceUrl(race) {
  return baseUrl() + raceHash(race);
}

// Long enough for a healthy path, short enough to survive being pasted into
// a text message or a chat client that linkifies by length.
const MAX_URL = 1800;

/**
 * A link that carries a finished run: the score, and the route taken so the
 * opener can reveal it once they are done arguing with it.
 */
export function challengeUrl({ start, target, ms, clicks, hints, navboxes, by, dailyNumber, path }) {
  const build = (withPath) => {
    const q = new URLSearchParams();
    q.set('ms', String(Math.round(ms)));
    q.set('clicks', String(clicks));
    if (hints) q.set('h', String(hints));
    if (navboxes === false) q.set('nb', '0');
    if (by) q.set('by', by);
    if (dailyNumber) q.set('daily', String(dailyNumber));
    if (withPath && path && path.length > 1) q.set('p', encodePath(path));
    return `${baseUrl()}#/race/${toUrlTitle(start)}/${toUrlTitle(target)}?${q.toString()}`;
  };

  const full = build(true);
  return full.length <= MAX_URL ? full : build(false);
}

// One link per click. Past the cap a chain stops reading as a shape and starts
// wrapping in chat apps, so it collapses to a count.
const CHAIN_MAX = 12;

function chain(clicks) {
  if (clicks < 1) return '🏁';
  return clicks <= CHAIN_MAX ? '🔗'.repeat(clicks) : `🔗×${clicks}`;
}

/**
 * The block you paste into a group chat.
 *
 * It deliberately does not name the two articles. Half the people reading have
 * not played today's daily yet, and the matchup is the one thing this game can
 * spoil — the old share text put it in the second line. The link still carries
 * the board for anyone who wants to play it.
 */
export function shareBlock({ ms, clicks, won, dailyNumber, hints, backs, navboxes, url }) {
  const head = dailyNumber ? `The Wikipedia Game — Daily #${dailyNumber}` : 'The Wikipedia Game';

  const score = [`${clicks} click${clicks === 1 ? '' : 's'}`, fmtTimeShort(ms)];
  if (hints) score.push(`👁 ${hints}`);
  if (backs) score.push(`↩ ${backs}`);
  if (navboxes === false) score.push('no navboxes');

  const body = won
    ? [chain(clicks), score.join(' · ')]
    : ['🏳️', `Gave up · ${fmtTimeShort(ms)}`];

  return [head, ...body, '', won ? `Beat me: ${url}` : `Your turn: ${url}`].join('\n');
}

export function pathText(path) {
  return path.join(' → ');
}
