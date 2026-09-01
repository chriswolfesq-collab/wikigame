// Everything that talks to Wikipedia. All calls are anonymous GETs with
// origin=* so the CORS headers come back wide open — no server needed.

import { titleKey } from './util.js';

const API = 'https://en.wikipedia.org/w/api.php';
const REST = 'https://en.wikipedia.org/api/rest_v1';

const articleCache = new Map();

async function apiGet(params, { signal } = {}) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    origin: '*',
    ...params
  }).toString();

  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || 'Wikipedia API error');
  return data;
}

/**
 * Fetch a rendered article. Redirects are followed server-side, so the
 * returned `title` is always the canonical one — that is what win detection
 * compares against.
 */
export async function fetchArticle(title, { signal } = {}) {
  const key = titleKey(title);
  if (articleCache.has(key)) return articleCache.get(key);

  const data = await apiGet(
    {
      action: 'parse',
      page: title,
      prop: 'text|displaytitle',
      redirects: '1',
      disableeditsection: '1',
      disabletoc: '1',
      disablelimitreport: '1'
    },
    { signal }
  );

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
export async function resolveTitle(title, { signal } = {}) {
  const data = await apiGet(
    {
      action: 'query',
      titles: title,
      redirects: '1',
      prop: 'pageprops|description',
      ppprop: 'disambiguation'
    },
    { signal }
  );
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
export async function searchTitles(term, { signal, limit = 8 } = {}) {
  if (!term.trim()) return [];
  const data = await apiGet(
    {
      action: 'query',
      generator: 'prefixsearch',
      gpssearch: term,
      gpslimit: String(limit),
      gpsnamespace: '0',
      prop: 'description',
      redirects: '1'
    },
    { signal }
  );
  const pages = data.query?.pages || [];
  return pages
    .slice()
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => ({ title: p.title, description: p.description || '' }));
}

/** Short summary + thumbnail, used by the "peek at target" hint. */
export async function fetchSummary(title, { signal } = {}) {
  const res = await fetch(
    `${REST}/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`,
    { signal, credentials: 'omit' }
  );
  if (!res.ok) throw new Error(`Could not load a summary for ${title}`);
  const data = await res.json();
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
export async function randomArticles(count = 2, { signal } = {}) {
  const data = await apiGet(
    {
      action: 'query',
      generator: 'random',
      grnnamespace: '0',
      grnlimit: String(Math.min(20, count * 8)),
      prop: 'pageprops|description|extracts',
      exintro: '1',
      explaintext: '1',
      exlimit: '20',
      ppprop: 'disambiguation'
    },
    { signal }
  );
  const pages = (data.query?.pages || []).filter(
    (p) =>
      !(p.pageprops && 'disambiguation' in p.pageprops) &&
      (p.extract || '').length > 350 &&
      !/^List of /i.test(p.title)
  );
  return pages.slice(0, count).map((p) => p.title);
}
