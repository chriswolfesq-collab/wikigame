// Finding a link inside a long article: a section jump and a link filter.
//
// Browser find already works on this board, so a race between someone who
// thinks of Ctrl+F and someone who does not is not a race about Wikipedia.
// Both of these are that same power, made visible, aimed only at legal moves,
// and counted — the filter never reveals anything the page was not showing.

import { $, el, debounce } from './util.js';

// Rebuilt once per article, not per keystroke: an article like Japan carries
// close to two thousand of these.
let index = []; // [{ link, hay }]
let sections = []; // [{ node, text, level }]
let matches = [];
let cursor = -1;
let host = null;
let onOpen = null;

export function init({ onOpen: opened } = {}) {
  onOpen = opened;
  host = $('#article-host');

  const input = $('#find-input');
  input.addEventListener('input', debounce(() => apply(input.value), 90));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFind();
    }
  });

  $('#btn-find').addEventListener('click', () => (isFindOpen() ? closeFind() : openFind()));
  $('#btn-find-close').addEventListener('click', closeFind);
  $('#btn-find-next').addEventListener('click', () => step(1));
  $('#btn-find-prev').addEventListener('click', () => step(-1));

  $('#btn-contents').addEventListener('click', () => (isContentsOpen() ? closeContents() : openContents()));
  $('#contents-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]');
    if (!btn) return;
    const section = sections[Number(btn.dataset.section)];
    closeContents();
    scrollTo(section?.node);
  });

  document.addEventListener('click', (e) => {
    if (!isContentsOpen()) return;
    if (e.target.closest('#contents-menu, #btn-contents')) return;
    closeContents();
  });
}

/**
 * Point the finder at a freshly rendered article. Both panels reset — a filter
 * left over from the previous page would be dimming links that no longer exist.
 */
export function attach(root) {
  closeFind();
  closeContents();

  index = Array.from(root.querySelectorAll('a.wg-link')).map((link) => ({
    link,
    // Link text and destination both, so "Cheese" finds a link written "cheeses"
    // and a piped [[Cheddar cheese|Cheddar]] alike.
    hay: `${link.textContent} ${link.dataset.wgTitle || ''}`.toLowerCase()
  }));

  sections = Array.from(root.querySelectorAll('h2, h3'))
    .map((node) => ({ node, text: node.textContent.trim(), level: Number(node.tagName[1]) }))
    .filter((s) => s.text);

  $('#btn-contents').disabled = sections.length === 0;
  $('#btn-find').disabled = index.length === 0;
  clearFilter();
  renderContents();
}

/* ----------------------------------------------------------------- filter */

function apply(raw) {
  const term = raw.trim().toLowerCase();
  if (!term) return clearFilter();

  matches = [];
  for (const entry of index) {
    const hit = entry.hay.includes(term);
    entry.link.classList.toggle('wg-hit', hit);
    if (hit) matches.push(entry.link);
  }
  host.classList.add('is-filtering');
  cursor = -1;

  $('#find-count').textContent = matches.length
    ? `${matches.length} of ${count(index.length)} links`
    : `no links match — ${count(index.length)} on this page`;
  $('#btn-find-next').disabled = !matches.length;
  $('#btn-find-prev').disabled = !matches.length;

  if (matches.length) step(1);
}

function clearFilter() {
  host?.classList.remove('is-filtering');
  for (const entry of index) entry.link.classList.remove('wg-hit', 'wg-current-hit');
  matches = [];
  cursor = -1;
  const countEl = $('#find-count');
  if (countEl) countEl.textContent = index.length ? `${count(index.length)} links on this page` : '';
  $('#btn-find-next').disabled = true;
  $('#btn-find-prev').disabled = true;
}

function step(delta) {
  if (!matches.length) return;
  matches[cursor]?.classList.remove('wg-current-hit');
  cursor = (cursor + delta + matches.length) % matches.length;
  const link = matches[cursor];
  link.classList.add('wg-current-hit');
  scrollTo(link, { center: true });
  $('#find-count').textContent = `${cursor + 1} of ${matches.length} matching links`;
}

/* --------------------------------------------------------------- sections */

function renderContents() {
  const list = $('#contents-list');
  $('#contents-head').textContent = sections.length
    ? `${sections.length} section${sections.length === 1 ? '' : 's'}`
    : 'This article has no sections.';
  list.replaceChildren(
    ...sections.map((s, i) =>
      el('button', {
        class: `contents-item lvl-${s.level}`,
        type: 'button',
        dataset: { section: String(i) },
        text: s.text
      })
    )
  );
}

/* ------------------------------------------------------------------ panels */

export function isFindOpen() {
  return !$('#find-bar').hidden;
}

export function openFind() {
  if ($('#btn-find').disabled) return;
  closeContents();
  $('#find-bar').hidden = false;
  $('#btn-find').setAttribute('aria-expanded', 'true');
  if (!$('#find-input').value) clearFilter();
  $('#find-input').focus();
  $('#find-input').select();
  onOpen?.('find');
}

export function closeFind() {
  const bar = $('#find-bar');
  if (!bar || bar.hidden) return;
  bar.hidden = true;
  $('#btn-find').setAttribute('aria-expanded', 'false');
  $('#find-input').value = '';
  clearFilter();
}

function isContentsOpen() {
  return !$('#contents-menu').hidden;
}

function openContents() {
  if ($('#btn-contents').disabled) return;
  $('#contents-menu').hidden = false;
  $('#btn-contents').setAttribute('aria-expanded', 'true');
  // preventScroll: focusing the first item would otherwise scroll the count
  // header out of the top of the menu.
  $('#contents-list').querySelector('button')?.focus({ preventScroll: true });
  onOpen?.('contents');
}

function closeContents() {
  const menu = $('#contents-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $('#btn-contents').setAttribute('aria-expanded', 'false');
}

/** Both panels shut — used when the board is torn down or a race ends. */
export function reset() {
  closeFind();
  closeContents();
  index = [];
  sections = [];
  // Nothing is loaded yet, so neither panel has anything to show.
  $('#btn-find').disabled = true;
  $('#btn-contents').disabled = true;
}

/* ----------------------------------------------------------------- shared */

/**
 * Bring a node into view inside the article pane.
 *
 * The jump is computed rather than delegated to scrollIntoView, because a
 * smooth scroll of several thousand pixels inside a scroll container is
 * quietly declined — the pane simply does not move. Animate only over a
 * distance the browser will actually cover; past that, land on it.
 */
export function scrollTo(node, { center = false } = {}) {
  if (!node) return;
  // A match inside a collapsed navbox is not a match anyone can see.
  for (let d = node.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;

  const wrap = node.closest('.article-wrap');
  if (!wrap) return node.scrollIntoView({ block: 'center' });

  const offset = node.getBoundingClientRect().top - wrap.getBoundingClientRect().top;
  const room = center ? Math.max(60, wrap.clientHeight / 2 - 40) : 12;
  const top = Math.max(0, wrap.scrollTop + offset - room);
  const far = Math.abs(top - wrap.scrollTop) > 1600;
  wrap.scrollTo({ top, behavior: far ? 'auto' : 'smooth' });

  // Lazy images between here and there load on arrival and shove the landing
  // point down the page. Re-aim once the layout has caught up.
  if (far) {
    const correct = () => {
      const drift = node.getBoundingClientRect().top - wrap.getBoundingClientRect().top - room;
      if (Math.abs(drift) > 8) wrap.scrollTop += drift;
    };
    requestAnimationFrame(correct);
    setTimeout(correct, 250);
  }
}

function count(n) {
  return n.toLocaleString();
}
