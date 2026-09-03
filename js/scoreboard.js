// The optional shared scoreboard.
//
// Everything here is a no-op unless SCOREBOARD_URL is set in config.js, and
// every call fails silently: a scoreboard that is down, slow, or misconfigured
// must never cost anyone a result screen. What comes back is a claim by a
// server, not a fact — the caller labels it as such.

import { SCOREBOARD_URL } from './config.js';

const TIMEOUT_MS = 4000;

export function enabled() {
  return Boolean(SCOREBOARD_URL);
}

async function call(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = new URL(SCOREBOARD_URL);
    if (method === 'GET') url.searchParams.set('daily', String(body.daily));
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      ...(method === 'POST'
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : {})
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<{count:number, medianClicks:number, medianMs:number}|null>} */
function shape(data) {
  if (!data || typeof data !== 'object') return null;
  const count = Number(data.count);
  const medianClicks = Number(data.medianClicks);
  if (!Number.isFinite(count) || count < 1) return null;
  if (!Number.isFinite(medianClicks) || medianClicks < 0) return null;
  const medianMs = Number(data.medianMs);
  return {
    count: Math.floor(count),
    medianClicks,
    medianMs: Number.isFinite(medianMs) && medianMs > 0 ? medianMs : null
  };
}

/** Today's aggregate, without contributing anything. */
export async function fetchAggregate(daily) {
  if (!enabled() || daily == null) return null;
  return shape(await call('GET', { daily }));
}

/**
 * Add a finished daily to the pile and take the aggregate back in the same
 * round trip. Only these four numbers are sent.
 */
export async function submit({ daily, clicks, ms, won }) {
  if (!enabled() || daily == null) return null;
  return shape(await call('POST', { daily, clicks, ms: Math.round(ms), won: Boolean(won) }));
}
