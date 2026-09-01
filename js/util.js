// Small shared helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** 92300 -> "1:32.3" ; 3725000 -> "1:02:05.0" */
export function fmtTime(ms, tenths = true) {
  const total = Math.max(0, Math.floor(ms / 100));
  const t = total % 10;
  const s = Math.floor(total / 10) % 60;
  const m = Math.floor(total / 600) % 60;
  const h = Math.floor(total / 36000);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  const base = `${h ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`;
  return tenths ? `${base}.${t}` : base;
}

/** A gap between two runs: "6.4s" up close, "2:11" once it gets big. */
export function fmtDelta(ms) {
  const abs = Math.abs(ms);
  return abs < 60000 ? `${(abs / 1000).toFixed(1)}s` : fmtTime(abs, false);
}

export function fmtTimeShort(ms) {
  return fmtTime(ms, false);
}

/** Wikipedia titles: underscores are spaces, only the first letter is case-insensitive. */
export function titleKey(title) {
  return String(title || '')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function toUrlTitle(title) {
  return encodeURIComponent(String(title).replace(/ /g, '_'));
}

export function fromUrlTitle(seg) {
  return decodeURIComponent(String(seg)).replace(/_/g, ' ');
}

// Namespaces that are not articles. A colon-prefixed title matching one of
// these is a category/file/help page, never a legal move.
const NON_ARTICLE_NS = new Set([
  'file', 'image', 'media', 'category', 'help', 'wikipedia', 'project',
  'template', 'template talk', 'special', 'portal', 'talk', 'user',
  'user talk', 'draft', 'module', 'mediawiki', 'book', 'timedtext',
  'wikt', 'wiktionary', 'commons', 'c', 'w', 's', 'q', 'n', 'v', 'b', 'm',
  'meta', 'wikispecies', 'wikidata', 'd', 'phab', 'gerrit', 'doi', 'arxiv',
  'wikipedia talk', 'category talk', 'file talk', 'help talk', 'portal talk',
  'draft talk', 'module talk', 'mediawiki talk', 'template_talk'
]);

export function isArticleTitle(title) {
  const colon = title.indexOf(':');
  if (colon <= 0) return true;
  return !NON_ARTICLE_NS.has(title.slice(0, colon).trim().toLowerCase());
}

/**
 * Turn an href from Wikipedia markup into { title, anchor } when it points at
 * a real article, { anchor } for a same-page jump, or null when it is not a
 * legal move (external link, file page, red link, edit link...).
 */
export function parseWikiLink(href) {
  if (!href) return null;
  if (href.startsWith('#')) return { title: null, anchor: href.slice(1) };
  if (/action=edit|redlink=1|\/w\/index\.php/.test(href)) return null;

  const m =
    href.match(/^(?:https?:)?\/\/en\.wikipedia\.org\/wiki\/([^#?]+)(?:#(.*))?$/) ||
    href.match(/^\/wiki\/([^#?]+)(?:#(.*))?$/) ||
    href.match(/^\.\/([^#?]+)(?:#(.*))?$/);
  if (!m) return null;

  let title;
  try {
    title = decodeURIComponent(m[1]);
  } catch {
    title = m[1];
  }
  title = title.replace(/_/g, ' ').trim();
  if (!title || !isArticleTitle(title)) return null;
  return { title, anchor: m[2] ? decodeURIComponent(m[2]) : null };
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Deterministic PRNG so the daily puzzle is the same for everyone. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { class: 'sr-only' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
