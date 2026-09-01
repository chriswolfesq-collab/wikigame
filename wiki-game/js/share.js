// Challenge links and shareable result text.

import { fmtTimeShort, toUrlTitle, fromUrlTitle } from './util.js';

/**
 * Routes:
 *   #/                          home
 *   #/race/Start/Target         open race
 *   #/race/Start/Target?ms=..&clicks=..&by=Name&daily=7   challenge to beat
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
            clicks: Number(q.get('clicks')) || null,
            by: q.get('by') ? decodeURIComponent(q.get('by')) : null
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

export function baseUrl() {
  return location.origin + location.pathname;
}

export function raceUrl(race) {
  return baseUrl() + raceHash(race);
}

/** A link that carries a score for a friend to beat. */
export function challengeUrl({ start, target, ms, clicks, by, dailyNumber }) {
  const q = new URLSearchParams();
  q.set('ms', String(Math.round(ms)));
  q.set('clicks', String(clicks));
  if (by) q.set('by', by);
  if (dailyNumber) q.set('daily', String(dailyNumber));
  return `${baseUrl()}#/race/${toUrlTitle(start)}/${toUrlTitle(target)}?${q.toString()}`;
}

export function resultText({ start, target, ms, clicks, won, dailyNumber, hints, url }) {
  const head = dailyNumber ? `The Wikipedia Game — Daily #${dailyNumber}` : 'The Wikipedia Game';
  const line = `${start} → ${target}`;
  const score = won
    ? `${clicks} click${clicks === 1 ? '' : 's'} · ${fmtTimeShort(ms)}${hints ? ` · ${hints} peek${hints === 1 ? '' : 's'}` : ''}`
    : 'Gave up 🏳️';
  return [head, line, score, '', won ? 'Beat me:' : 'Your turn:', url].join('\n');
}

export function pathText(path) {
  return path.join(' → ');
}
