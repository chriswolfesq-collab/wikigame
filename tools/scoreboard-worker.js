/**
 * Reference scoreboard for the daily median. Cloudflare Workers.
 *
 * The game runs without this. It exists only if you want a true "median today"
 * across everyone playing your deployment, rather than the median of the runs
 * a player's own browser has seen.
 *
 * What it stores: per daily, a count and a histogram of clicks, plus times
 * bucketed to five seconds. Never a name, an IP, an identifier, or a route —
 * there is nothing in here that says who anybody is. A histogram also means
 * storage is bounded no matter how many people play.
 *
 * It is unauthenticated, and deliberately so: adding accounts to a game with no
 * accounts is a worse trade than accepting that a determined person can post
 * junk. The clamps below keep casual nonsense out of the median; they are not a
 * defence against someone who wants to skew it. If that matters to you, put
 * Turnstile in front of the POST.
 *
 * Deploy:
 *
 *   npx wrangler deploy
 *
 * wrangler.toml:
 *
 *   name = "wikigame-scoreboard"
 *   main = "tools/scoreboard-worker.js"
 *   compatibility_date = "2026-01-01"
 *
 *   [[durable_objects.bindings]]
 *   name = "BOARD"
 *   class_name = "Board"
 *
 *   [[migrations]]
 *   tag = "v1"
 *   new_sqlite_classes = ["Board"]
 *
 * Then set SCOREBOARD_URL in js/config.js to the deployed URL.
 *
 * A Durable Object rather than KV because a read-modify-write on a shared
 * counter is exactly the thing KV's eventual consistency loses.
 */

const MAX_CLICKS = 100;
const MAX_MS = 6 * 60 * 60 * 1000; // six hours; past that it is not a race
const BUCKET_MS = 5000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS }
  });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    let daily;
    let run = null;

    if (request.method === 'GET') {
      daily = Number(url.searchParams.get('daily'));
    } else if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      daily = Number(body.daily);
      // Only a won run has a score worth a median. A given-up run is recorded
      // as a player, not as a time.
      if (body.won) {
        const clicks = Math.round(Number(body.clicks));
        const ms = Math.round(Number(body.ms));
        if (!Number.isFinite(clicks) || clicks < 1 || clicks > MAX_CLICKS) return json({ error: 'bad clicks' }, 400);
        if (!Number.isFinite(ms) || ms < 1 || ms > MAX_MS) return json({ error: 'bad ms' }, 400);
        run = { clicks, ms };
      }
    } else {
      return json({ error: 'method not allowed' }, 405);
    }

    if (!Number.isInteger(daily) || daily < 1 || daily > 100000) {
      return json({ error: 'bad daily' }, 400);
    }

    // One object per daily: the shard key is the thing being aggregated.
    const id = env.BOARD.idFromName(`daily:${daily}`);
    const stub = env.BOARD.get(id);
    return stub.fetch('https://board/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ daily, run })
    });
  }
};

export class Board {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { daily, run } = await request.json();

    // blockConcurrencyWhile is what makes the read-modify-write safe.
    const result = await this.state.blockConcurrencyWhile(async () => {
      const tally = (await this.state.storage.get('tally')) || { n: 0, clicks: {}, times: {} };

      if (run) {
        tally.n += 1;
        tally.clicks[run.clicks] = (tally.clicks[run.clicks] || 0) + 1;
        const bucket = Math.floor(run.ms / BUCKET_MS);
        tally.times[bucket] = (tally.times[bucket] || 0) + 1;
        await this.state.storage.put('tally', tally);
      }

      return tally;
    });

    if (!result.n) return json({ daily, count: 0, medianClicks: null, medianMs: null });

    return json({
      daily,
      count: result.n,
      medianClicks: medianOf(result.clicks),
      // The bucket midpoint: a five-second grain is finer than the difference
      // anyone reads off a median, and it keeps the stored shape tiny.
      medianMs: Math.round((medianOf(result.times) + 0.5) * BUCKET_MS)
    });
  }
}

/**
 * Median of a histogram of integer keys. Walks to the middle observation, and
 * averages the two middles on an even count so the answer is a real median.
 */
export function medianOf(histogram) {
  const keys = Object.keys(histogram).map(Number).sort((a, b) => a - b);
  const total = keys.reduce((sum, k) => sum + histogram[k], 0);
  if (!total) return null;

  // 1-based ranks of the middle observation, or the two either side of it.
  const ranks = total % 2 ? [(total + 1) / 2] : [total / 2, total / 2 + 1];
  const picks = [];
  let seen = 0;

  for (const key of keys) {
    seen += histogram[key];
    while (picks.length < ranks.length && seen >= ranks[picks.length]) picks.push(key);
    if (picks.length === ranks.length) break;
  }

  return picks.reduce((a, b) => a + b, 0) / picks.length;
}
