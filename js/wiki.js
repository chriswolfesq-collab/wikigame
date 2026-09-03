// Everything that talks to Wikipedia. All calls are anonymous GETs with
// origin=* so the CORS headers come back wide open — no server needed.

import { titleKey } from './util.js';

const API = 'https://en.wikipedia.org/w/api.php';
const REST = 'https://en.wikipedia.org/api/rest_v1';

const articleCache = new Map();

// Long enough for a heavy article on a slow connection, short enough that a
// wedged request surfaces as an error instead of an endless spinner.
const TIMEOUT_MS = 20000;

// Anonymous callers get throttled, and the route search runs a burst of them.
// Backing off and retrying turns a 429 into a slower answer instead of an error.
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (RETRY_STATUS.has(res.status) && attempt < MAX_RETRIES) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(after > 0 ? Math.min(after * 1000, 5000) : 400 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Wikipedia returned ${res.status}.`);
      return await res.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Wikipedia took too long to answer.');
      if (err instanceof TypeError) throw new Error('Could not reach Wikipedia. Check your connection.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function apiGet(params) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    origin: '*',
    ...params
  }).toString();

  const data = await getJson(url);
  if (data.error) {
    // missingtitle is the common one: a mistyped title in a shared link.
    if (data.error.code === 'missingtitle') {
      throw new Error(`Wikipedia has no article called “${params.page || params.titles}”.`);
    }
    throw new Error(data.error.info || 'Wikipedia API error.');
  }
  return data;
}

/**
 * Fetch a rendered article. Redirects are followed server-side, so the
 * returned `title` is always the canonical one — that is what win detection
 * compares against.
 */
export async function fetchArticle(title) {
  const key = titleKey(title);
  if (articleCache.has(key)) return articleCache.get(key);

  const data = await apiGet({
    action: 'parse',
    page: title,
    prop: 'text|displaytitle',
    redirects: '1',
    disableeditsection: '1',
    disabletoc: '1',
    disablelimitreport: '1'
  });

  const article = {
    title: data.parse.title,
    displayTitle: data.parse.displaytitle || data.parse.title,
    pageid: data.parse.pageid,
    html: data.parse.text
  };
  articleCache.set(key, article);
  articleCache.set(titleKey(article.title), article);
  return article;
}

/**
 * Resolve a title through normalisation + redirects without pulling the whole
 * article. Returns null when the page does not exist.
 */
export async function resolveTitle(title) {
  const data = await apiGet({
    action: 'query',
    titles: title,
    redirects: '1',
    prop: 'pageprops|description',
    ppprop: 'disambiguation'
  });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || page.invalid) return null;
  return {
    title: page.title,
    pageid: page.pageid,
    description: page.description || '',
    disambiguation: Boolean(page.pageprops && 'disambiguation' in page.pageprops)
  };
}

/** Prefix search for the custom-race pickers. */
export async function searchTitles(term, { limit = 8 } = {}) {
  if (!term.trim()) return [];
  const data = await apiGet({
    action: 'query',
    generator: 'prefixsearch',
    gpssearch: term,
    gpslimit: String(limit),
    gpsnamespace: '0',
    prop: 'description',
    redirects: '1'
  });
  const pages = data.query?.pages || [];
  return pages
    .slice()
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => ({ title: p.title, description: p.description || '' }));
}

/** Short summary + thumbnail, used by the "peek at target" hint. */
export async function fetchSummary(title) {
  const data = await getJson(
    `${REST}/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`
  );
  return {
    title: data.titles?.normalized || data.title,
    extract: data.extract || '',
    thumbnail: data.thumbnail?.source || null,
    description: data.description || ''
  };
}

/**
 * Random articles, filtered to ones substantial enough to be raceable —
 * stubs and disambiguation pages make for miserable races.
 */
export async function randomArticles(count = 2) {
  const data = await apiGet({
    action: 'query',
    generator: 'random',
    grnnamespace: '0',
    grnlimit: String(Math.min(20, count * 8)),
    prop: 'pageprops|description|extracts',
    exintro: '1',
    explaintext: '1',
    exlimit: '20',
    ppprop: 'disambiguation'
  });
  const pages = (data.query?.pages || []).filter(
    (p) =>
      !(p.pageprops && 'disambiguation' in p.pageprops) &&
      (p.extract || '').length > 350 &&
      !/^List of /i.test(p.title)
  );
  return pages.slice(0, count).map((p) => p.title);
}

/* ------------------------------------------------- the link graph itself */

/**
 * Does `title` link to any of `targets` (50 max)?
 *
 * `pltitles` filters the link list server-side, so the answer costs one small
 * response even on an article carrying two thousand links.
 */
export async function linksToAny(title, targets) {
  if (!targets.length) return false;
  const data = await apiGet({
    action: 'query',
    titles: title,
    prop: 'links',
    pltitles: targets.join('|'),
    pllimit: 'max',
    redirects: '1'
  });
  return Boolean(data.query?.pages?.[0]?.links?.length);
}

/**
 * One page of `title`'s outgoing links, each already answered for "and does
 * *that* page link to any of `targets`?".
 *
 * `generator=links` feeds the link list straight into the same filtered
 * `prop=links` query, so five hundred second-hop candidates are settled by a
 * single request. Pass the returned `cont` back for the next five hundred.
 */
export async function fetchLinkFanout(title, targets, cont = null) {
  const data = await apiGet({
    action: 'query',
    generator: 'links',
    titles: title,
    gplnamespace: '0',
    gpllimit: 'max',
    prop: 'links',
    pltitles: targets.join('|'),
    pllimit: 'max',
    redirects: '1',
    ...(cont || {})
  });
  const pages = (data.query?.pages || []).map((p) => ({
    title: p.title,
    linksToTarget: Boolean(p.links?.length)
  }));
  return { pages, cont: data.continue || null };
}

/** Titles that redirect to `title`. A link to any of them is a link to it. */
export async function fetchRedirects(title, { limit = 40 } = {}) {
  const data = await apiGet({
    action: 'query',
    titles: title,
    prop: 'redirects',
    rdnamespace: '0',
    rdlimit: String(limit)
  });
  return (data.query?.pages?.[0]?.redirects || []).map((r) => r.title);
}
