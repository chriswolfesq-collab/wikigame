// Shortest route through Wikipedia's link graph, computed in the browser.
//
// One request settles hop one. Hop two is settled five hundred candidates at a
// time by feeding the start's link list into a filtered link query — "of these
// five hundred pages, which link to the target?".
//
// Hop three used to be declined. Expanding each of the first hop's five hundred
// links on its own would be five hundred requests against an API that allows
// about ten in a burst, and guessing would have been worse than saying nothing.
// But `generator=links` takes *fifty source pages at once*, so fifty of those
// links can be expanded together and their five hundred onward pages answered
// in the same request. That is the same trick hop two already used, applied a
// level deeper, and it brings three hops inside a budget of a couple of dozen
// requests.
//
// Depth is not free even so. The third hop's frontier is tens of thousands of
// pages, so the sweep is bounded and usually stops long before it has seen all
// of them. That changes what can be *claimed*, not what can be found: a route
// this returns is a real route of that length, and the shorter sweeps ran
// first, so it is genuinely the shortest. Absence is only ever reported for a
// depth whose sweep actually ran to the end — `ruledOut` says which.
//
// With No Highways on, every sweep runs against a smaller graph: a hop through
// a closed article is not a route the player could have taken, so it is not one
// this offers them.

import { linksToAny, fetchLinkFanout, fetchDeepFanout, linkFrom, fetchRedirects } from './wiki.js';
import { titleKey } from './util.js';

const MAX_FANOUT = 4000; // first-hop links to examine before giving up
const MAX_ROUNDS = 10; // continuation pages, as a runaway guard
const DEADLINE_MS = 25000; // past this a two-hop answer is not worth the wait

// The deep sweep. Fifty first-hop links go into each batch; three requests is
// about fifteen hundred onward pages, which is enough of a look at one batch
// before the budget is better spent on the next fifty. The overall cap is what
// actually ends it, and the deadline is longer because the result screen has
// splits and a route to read while this fills in underneath.
const DEEP_BATCH = 50;
const DEEP_ROUNDS_PER_BATCH = 3;
const DEEP_MAX_REQUESTS = 24;
const DEEP_DEADLINE_MS = 45000;

// Two dozen requests is well past what the anonymous API takes in a burst.
// Spacing them costs a few seconds against a deadline that has room for it,
// and is far cheaper than earning a 429 and backing off from it repeatedly.
const DEEP_PACE_MS = 250;

// A throttle that survives the backoff in wiki.js is a signal to stop, not to
// keep hammering — but one dropped request on a flaky connection should not
// cost the whole depth of the search.
const DEEP_MAX_FAILURES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CACHE_KEY = 'wikigame:routes:v2';
const CACHE_MAX = 200;

/**
 * @param {string} start canonical title
 * @param {string} target canonical title
 * @param {{signal?:AbortSignal, closed?:Map<string,string>|null}} opts
 *        `closed` is a No Highways board: a route may not pass through one of
 *        those, so neither may the route this offers as the best anyone could
 *        have done.
 * @returns {Promise<
 *   {hops:number, path:string[], certain:boolean} |
 *   {hops:null, ruledOut:number, examined:number, deepExamined:number} |
 *   {error:string}
 * >}
 *
 * `ruledOut` is the longest route length actually proved impossible: 3 when
 * both sweeps ran to the end, 2 when only the shallow one did, 0 when even
 * that was cut short and nothing at all was settled.
 *
 * `certain` says whether every shorter length was ruled out before this one
 * was found — that is, whether the route is the shortest or merely the
 * shortest *seen*. It is what par is allowed to be built on.
 */
export async function findShortestRoute(start, target, { signal, closed = null } = {}) {
  const cached = readCache(start, target, closed);
  if (cached) return cached;

  try {
    const result = await search(start, target, signal, closed);
    if (!signal?.aborted && !result.error) writeCache(start, target, result, closed);
    return result;
  } catch (err) {
    return { error: err.message || 'Could not reach Wikipedia.' };
  }
}

async function search(start, target, signal, closed) {
  // A link to any redirect of the target is a link to the target, and the
  // popular articles have dozens of them. `pltitles` takes 50 titles, and the
  // target itself has to be one of them.
  const redirects = await fetchRedirects(target).catch(() => []);
  const aliases = [target, ...redirects].slice(0, 50);
  if (signal?.aborted) return { error: 'cancelled' };

  // Hop one is settled on its own rather than read off the sweep: the sweep
  // stops at its first hit, and a two-hop hit on the first page of results
  // would otherwise mask a direct link sitting on the third.
  if (await linksToAny(start, aliases)) return { hops: 1, path: [start, target], certain: true };
  if (signal?.aborted) return { error: 'cancelled' };

  const startKey = titleKey(start);
  const deadline = Date.now() + DEADLINE_MS;
  let cont = null;
  let examined = 0;
  let complete = false;

  // The first hop's links, kept as the deep sweep expands from them. Closed
  // articles and the start itself are dropped here rather than there: they
  // cannot be the first hop of a route, so they are not worth expanding.
  const frontier = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const { pages, cont: next } = await fetchLinkFanout(start, aliases, cont);
    if (signal?.aborted) return { error: 'cancelled' };

    for (const page of pages) {
      examined += 1;
      if (titleKey(page.title) !== startKey && !closed?.has(titleKey(page.title))) {
        frontier.push(page.title);
      }
      // A hop through a closed article is not a route on this board. The
      // sweep still has to walk past it, so the count of what was examined
      // stays honest.
      if (
        page.linksToTarget &&
        titleKey(page.title) !== startKey &&
        !closed?.has(titleKey(page.title))
      ) {
        // Nothing shorter than two exists: hop one was settled outright.
        return { hops: 2, path: [start, page.title, target], certain: true };
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

  const deep = await searchThree(start, target, aliases, frontier, signal, closed, {
    // A shallow sweep that was itself cut short leaves a two-hop route
    // possible, so nothing below can be ruled out either.
    shallowComplete: complete
  });
  // A three-hop route is only the *shortest* if the two-hop sweep that ran
  // before it saw every candidate. Cut that sweep short and a two-hop route
  // may be sitting in the part it never read, which makes this the shortest
  // route found rather than the shortest there is — and par cannot be built
  // on a maybe.
  if (deep.route) return { hops: 3, path: deep.route, certain: complete };
  if (deep.error) return { error: deep.error };

  return {
    hops: null,
    ruledOut: deep.ruledOut,
    examined,
    deepExamined: deep.examined
  };
}

/**
 * Hop three: expand the first hop's links fifty at a time and ask everything
 * they reach whether it links to the target.
 *
 * The generator says which pages it reached but not which of the fifty reached
 * them, so a hit costs one more request to attribute — cheap, and it happens
 * once at the very end.
 */
async function searchThree(start, target, aliases, frontier, signal, closed, { shallowComplete }) {
  const startKey = titleKey(start);
  const targetKey = titleKey(target);
  const deadline = Date.now() + DEEP_DEADLINE_MS;
  let requests = 0;
  let examined = 0;
  let failures = 0;
  let complete = true; // until something is left unswept

  for (let i = 0; i < frontier.length; i += DEEP_BATCH) {
    const batch = frontier.slice(i, i + DEEP_BATCH);
    let cont = null;

    for (let round = 0; round < DEEP_ROUNDS_PER_BATCH; round += 1) {
      if (requests >= DEEP_MAX_REQUESTS || Date.now() > deadline) {
        return { ruledOut: shallowComplete ? 2 : 0, examined };
      }

      if (requests) await sleep(DEEP_PACE_MS);
      if (signal?.aborted) return { error: 'cancelled' };

      let pages, next;
      try {
        ({ pages, cont: next } = await fetchDeepFanout(batch, aliases, cont));
      } catch {
        // Depth is the optional half of this search. Losing it to a throttle
        // or a dropped connection must not lose the shallow sweep that already
        // ran — that answer is proved and worth reporting on its own.
        failures += 1;
        if (failures > DEEP_MAX_FAILURES) return { ruledOut: shallowComplete ? 2 : 0, examined };
        await sleep(1000);
        round -= 1; // the batch has not been looked at yet
        continue;
      }
      requests += 1;
      if (signal?.aborted) return { error: 'cancelled' };

      for (const page of pages) {
        examined += 1;
        const key = titleKey(page.title);
        // The second hop of a three-hop route: not the two ends, not one of
        // the closed articles, and it has to actually reach the target.
        if (!page.linksToTarget || key === startKey || key === targetKey) continue;
        if (closed?.has(key)) continue;

        const bridge = await linkFrom(batch, page.title).catch(() => null);
        if (signal?.aborted) return { error: 'cancelled' };
        // Attribution can come back empty when a redirect resolved the hit to
        // a title none of these fifty links by that name. Keep sweeping rather
        // than report a route with a hole in it.
        if (bridge && titleKey(bridge) !== key) {
          return { route: [start, bridge, page.title, target] };
        }
      }

      cont = next;
      if (!cont) break;
    }

    // Out of rounds with pages still to see: this batch was not finished.
    if (cont) complete = false;
  }

  // Three is only ruled out when every link of every first-hop page was seen,
  // which also requires the sweep above it to have run to the end.
  if (complete && shallowComplete) return { ruledOut: 3, examined };
  return { ruledOut: shallowComplete ? 2 : 0, examined };
}

/* ----------------------------------------------------------------- cache */

// Routes do not change between two races, and "Play again" is one click away.
// The ban is part of the question, not just the answer: the two-hop route
// through United States is still there for anyone racing the ordinary board.
function cacheKey(start, target, closed) {
  return `${titleKey(start)}␟${titleKey(target)}${closed ? '␟hb' : ''}`;
}

function readCache(start, target, closed) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return all[cacheKey(start, target, closed)] || null;
  } catch {
    return null;
  }
}

function writeCache(start, target, result, closed) {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    all[cacheKey(start, target, closed)] = result;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete all[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    // A full or disabled localStorage costs us the cache, nothing more.
  }
}
