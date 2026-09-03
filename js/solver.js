// Shortest route through Wikipedia's link graph, computed in the browser.
//
// Two hops is where the interesting answers live, and it is also the deepest
// a browser can search *honestly*. One request settles hop one. Hop two is
// settled five hundred candidates at a time, by feeding the start's link list
// into a filtered link query — "of these five hundred pages, which link to the
// target?". Hop three would mean expanding every one of those pages, tens of
// thousands of requests against an API that allows about ten in a burst. So we
// stop at two and report what was actually proved.
//
// A found route is a genuine shortest route. "No route in two" is only a claim
// about the whole graph when the sweep ran to the end — hence `exhaustive`.

import { linksToAny, fetchLinkFanout, fetchRedirects } from './wiki.js';
import { titleKey } from './util.js';

const MAX_FANOUT = 4000; // first-hop links to examine before giving up
const MAX_ROUNDS = 10; // continuation pages, as a runaway guard
const DEADLINE_MS = 25000; // past this the answer is not worth the wait

const CACHE_KEY = 'wikigame:routes:v1';
const CACHE_MAX = 200;

/**
 * @param {string} start canonical title
 * @param {string} target canonical title
 * @param {{signal?:AbortSignal}} opts
 * @returns {Promise<
 *   {hops:number, path:string[]} |
 *   {hops:null, atLeast:number, exhaustive:boolean, examined:number} |
 *   {error:string}
 * >}
 */
export async function findShortestRoute(start, target, { signal } = {}) {
  const cached = readCache(start, target);
  if (cached) return cached;

  try {
    const result = await search(start, target, signal);
    if (!signal?.aborted && !result.error) writeCache(start, target, result);
    return result;
  } catch (err) {
    return { error: err.message || 'Could not reach Wikipedia.' };
  }
}

async function search(start, target, signal) {
  // A link to any redirect of the target is a link to the target, and the
  // popular articles have dozens of them. `pltitles` takes 50 titles, and the
  // target itself has to be one of them.
  const redirects = await fetchRedirects(target).catch(() => []);
  const aliases = [target, ...redirects].slice(0, 50);
  if (signal?.aborted) return { error: 'cancelled' };

  // Hop one is settled on its own rather than read off the sweep: the sweep
  // stops at its first hit, and a two-hop hit on the first page of results
  // would otherwise mask a direct link sitting on the third.
  if (await linksToAny(start, aliases)) return { hops: 1, path: [start, target] };
  if (signal?.aborted) return { error: 'cancelled' };

  const startKey = titleKey(start);
  const deadline = Date.now() + DEADLINE_MS;
  let cont = null;
  let examined = 0;
  let complete = false;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { pages, cont: next } = await fetchLinkFanout(start, aliases, cont);
    if (signal?.aborted) return { error: 'cancelled' };

    for (const page of pages) {
      examined += 1;
      if (page.linksToTarget && titleKey(page.title) !== startKey) {
        return { hops: 2, path: [start, page.title, target] };
      }
    }

    if (!next) {
      complete = true;
      break;
    }
    if (examined >= MAX_FANOUT || Date.now() > deadline) break;
    cont = next;
  }

  // No links at all means the query came back empty, not that the article is
  // a dead end — never turn that into a confident claim about the graph.
  if (!examined) return { error: 'Wikipedia did not return a link list for that article.' };

  return { hops: null, atLeast: 3, exhaustive: complete, examined };
}

/* ----------------------------------------------------------------- cache */

// Routes do not change between two races, and "Play again" is one click away.
function cacheKey(start, target) {
  return `${titleKey(start)}␟${titleKey(target)}`;
}

function readCache(start, target) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return all[cacheKey(start, target)] || null;
  } catch {
    return null;
  }
}

function writeCache(start, target, result) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[cacheKey(start, target)] = result;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete all[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // A full or disabled localStorage costs us the cache, nothing more.
  }
}
