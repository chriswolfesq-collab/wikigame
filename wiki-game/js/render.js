// Turns raw Wikipedia HTML into a page the game controls: chrome removed,
// every link either armed as a legal move or defused.

import { parseWikiLink } from './util.js';

// Interface furniture that has no business in a race.
const STRIP = [
  'script', 'style', 'link', 'meta', 'noscript',
  '.mw-editsection', '.mw-jump-link', '.mw-indicators', '.mw-empty-elt',
  '.mw-references-wrap', 'ol.references', '.reflist', '.refbegin', '.refend',
  '.mw-cite-backlink', 'sup.reference', '.shortdescription',
  '.sistersitebox', '.side-box', '.ambox', '.mbox-small', '.metadata',
  '#coordinates', '.geo-inline', '.mw-kartographer-maplink',
  '.printfooter', '.catlinks', '.navbar', '.mw-hidden-catlinks',
  '.mw-authority-control', '.authority-control', '.mw-parser-output > .portal'
];

const NAVBOX = '.navbox, .vertical-navbox, .navbox-styles, .sidebar, .infobox-navbox';

/**
 * @param {string} html   parse.text from the API
 * @param {{images:boolean, navboxes:boolean, visited:Set<string>}} opts
 * @returns {HTMLElement} a detached container, ready to be swapped in
 */
export function prepareArticle(html, opts = {}) {
  const { images = true, navboxes = true, visited = null } = opts;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = document.createElement('div');
  root.className = 'wg-article';
  while (doc.body.firstChild) root.append(doc.body.firstChild);

  for (const sel of STRIP) {
    root.querySelectorAll(sel).forEach((n) => n.remove());
  }
  scrubEvents(root);

  // Navboxes are link farms. Keeping them faithful but collapsed matches how
  // they behave on desktop Wikipedia.
  root.querySelectorAll(NAVBOX).forEach((box) => {
    if (!navboxes) return box.remove();
    if (box.closest('details.wg-navbox')) return;
    collapseIntoDetails(box);
  });

  if (!images) {
    root.querySelectorAll('figure, .thumb, .infobox-image, .gallery, img, video, audio').forEach((n) => n.remove());
  } else {
    // Interface icons that survive as plain <img> once their link is defused.
    root.querySelectorAll('img[src*="OOjs_UI_icon"], .penicon, img[src*="Wikidata"]').forEach((n) => n.remove());
    root.querySelectorAll('img').forEach((img) => {
      img.loading = 'lazy';
      img.decoding = 'async';
    });
  }

  // Give already-collapsible tables a native disclosure so they are usable.
  root.querySelectorAll('table.mw-collapsible').forEach((t) => t.classList.remove('mw-collapsed'));

  // Wikipedia ships inline background colours (taxoboxes, coloured cells)
  // that assume dark text. Flag them so the dark theme can keep them legible.
  root.querySelectorAll('[style]').forEach((n) => {
    const bg = n.style.backgroundColor || n.style.background;
    if (!bg || /^(transparent|none|inherit|initial)/i.test(bg.trim())) return;
    n.classList.add('wg-tinted');
    // `color: inherit` is left over from Wikipedia's own theming and would
    // otherwise beat our contrast rule from the inline style attribute.
    if (/^(inherit|initial|unset|currentcolor)$/i.test(n.style.color.trim())) {
      n.style.removeProperty('color');
    }
  });
  root.querySelectorAll('[bgcolor]').forEach((n) => n.classList.add('wg-tinted'));

  root.querySelectorAll('a').forEach(armLink);

  // Links to articles already on this run read as "been there" the way
  // visited links do on the real thing.
  if (visited) {
    root.querySelectorAll('a.wg-link').forEach((a) => {
      if (visited.has(a.dataset.wgTitle.replace(/_/g, ' ').trim().toLowerCase())) {
        a.classList.add('wg-seen');
      }
    });
  }

  // Anchors used by in-page jumps live on headline spans in legacy output.
  root.querySelectorAll('[id]').forEach((n) => {
    if (n.id) n.dataset.wgAnchor = n.id;
  });

  return root;
}

/**
 * Wikipedia sanitises its own output, but we are injecting third-party HTML —
 * drop any inline event handlers before it reaches the document.
 */
export function scrubEvents(root) {
  const walk = (node) => {
    for (const attr of [...node.attributes]) {
      if (/^on/i.test(attr.name)) node.removeAttribute(attr.name);
    }
  };
  if (root.attributes) walk(root);
  root.querySelectorAll('*').forEach(walk);
  return root;
}

function collapseIntoDetails(box) {
  const label =
    box.querySelector('.navbox-title, .navbox-abovebelow, caption, th')?.textContent?.trim() ||
    'Navigation menu';
  const details = document.createElement('details');
  details.className = 'wg-navbox';
  const summary = document.createElement('summary');
  summary.textContent = label.slice(0, 120);
  details.append(summary);
  box.replaceWith(details);
  details.append(box);
}

function armLink(a) {
  const href = a.getAttribute('href');
  const link = parseWikiLink(href);

  // Same-page jump (a footnote or a section link): keep it, handle by scroll.
  if (link && !link.title && link.anchor) {
    a.classList.add('wg-anchor');
    a.dataset.wgAnchorTarget = link.anchor;
    a.removeAttribute('href');
    return;
  }

  if (!link || a.classList.contains('new') || a.classList.contains('external')) {
    // Not a legal move: strip the link, leave the words.
    const span = document.createElement('span');
    span.className = 'wg-nolink';
    span.innerHTML = a.innerHTML;
    a.replaceWith(span);
    return;
  }

  // A legal move. The href is removed so the article cannot be opened for
  // real in another tab straight out of the game board.
  a.classList.add('wg-link');
  a.dataset.wgTitle = link.title;
  a.removeAttribute('href');
  a.setAttribute('role', 'link');
  a.setAttribute('tabindex', '0');
  a.title = link.title;
}

/** Count of legal outgoing moves, shown in the race HUD. */
export function countLinks(root) {
  return root.querySelectorAll('a.wg-link').length;
}
