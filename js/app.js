// Wiring: routing, home screen, the race board, results.

import { $, $$, el, fmtTime, fmtTimeShort, fmtDelta, debounce, copyText, titleKey, toUrlTitle, median } from './util.js';
import { Race, HINT_PENALTY_MS, BACK_PENALTY_MS } from './game.js';
import { prepareArticle, countLinks, scrubEvents } from './render.js';
import { searchTitles, resolveTitle, randomArticles, fetchSummary } from './wiki.js';
import { findShortestRoute } from './solver.js';
import * as finder from './finder.js';
import { DIFFICULTY, dailyPuzzle, randomPuzzle, msUntilNextDaily } from './puzzles.js';
import * as store from './stats.js';
import * as scoreboard from './scoreboard.js';
import { parseHash, raceHash, raceUrl, challengeUrl, shareBlock } from './share.js';

const state = {
  race: null,
  difficulty: 'any',
  lastConfig: null,
  pendingChallenge: null,
  raceHash: null,
  historyExpanded: false,
  timer: null,
  routeSearch: null,
  estimate: null,
  estimatePair: null
};

// Set while we are putting the hash back after a declined navigation, so the
// resulting hashchange is not treated as a fresh route.
let ignoreNextRoute = false;

/* ------------------------------------------------------------------ boot */

function boot() {
  applyTheme(store.getSettings().theme);
  wireHome();
  wireChallenge();
  wireRace();
  wireModals();
  renderHome();
  window.addEventListener('hashchange', route);
  route();
}

/* --------------------------------------------------------------- routing */

async function route() {
  if (ignoreNextRoute) {
    ignoreNextRoute = false;
    return;
  }

  // Browser Back (and a mobile edge-swipe) fire hashchange like any other
  // navigation. A run in progress is worth the same confirmation the ✕ asks
  // for — otherwise the easiest way to lose a good race is a stray gesture.
  const live = state.race;
  if (live && live.status === 'racing' && location.hash !== state.raceHash) {
    const leave = await confirmDialog({
      title: 'Leave this race?',
      body: 'Your run will not be recorded.',
      yes: 'Leave'
    });
    if (!leave) {
      if (location.hash === state.raceHash) return; // nothing to put back
      ignoreNextRoute = true;
      location.hash = state.raceHash;
      return;
    }
  }

  const r = parseHash();
  if (r.route === 'race') {
    const config = {
      start: r.start,
      target: r.target,
      mode: r.mode,
      dailyNumber: r.dailyNumber,
      challenge: r.challenge
    };
    // A link carrying someone's score opens on that result, so the reader
    // sees what they are chasing before the clock starts.
    if (r.challenge) showChallenge(config);
    else startRace(config);
  } else {
    endRace();
    showScreen('home');
    renderHome();
  }
}

function goHome() {
  endRace();
  navigate('#/');
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function showScreen(name) {
  $('#screen-home').hidden = name !== 'home';
  $('#screen-challenge').hidden = name !== 'challenge';
  $('#screen-race').hidden = name !== 'race';
  document.body.classList.toggle('in-race', name === 'race');
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------- challenge card */

/** The landing screen a shared result link opens on. */
function showChallenge(config) {
  endRace();
  const c = config.challenge;
  const who = c.by || 'Someone';

  $('#challenge-kicker').textContent = config.dailyNumber
    ? `Daily #${config.dailyNumber}`
    : 'You have been challenged';
  $('#challenge-who').textContent = `${who} made it.`;
  $('#challenge-matchup').replaceChildren(matchupEl(config.start, config.target));

  const stats = [
    c.clicks != null ? ['Clicks', String(c.clicks)] : null,
    c.ms ? ['Time', fmtTime(c.ms)] : null,
    c.hints ? ['Peeks', String(c.hints)] : null
  ].filter(Boolean);
  $('#challenge-stats').replaceChildren(
    ...stats.map(([l, v]) =>
      el('div', { class: 'stat' }, el('span', { class: 'stat-value', text: v }), el('span', { class: 'stat-label', text: l }))
    )
  );

  // The board is matched to theirs, so the only thing left to say is when that
  // differs from what the reader would otherwise get.
  const note = $('#challenge-note');
  note.textContent = boardMismatch(c)
    ? `${who} raced with navigation boxes ${c.navboxes === false ? 'off' : 'on'} — ` +
      `${c.navboxes === false ? 'fewer' : 'more'} ways out of every article. ` +
      `This race matches their board, just this once. Your own settings are not touched.`
    : '';
  note.hidden = !note.textContent;

  const spoiler = $('#challenge-path');
  if (c.path && c.path.length > 1) {
    spoiler.open = false;
    $('#challenge-path-chain').replaceChildren(...pathHops(c.path));
    spoiler.hidden = false;
  } else {
    spoiler.hidden = true;
  }

  // A challenge link is the only way somebody else's run reaches this browser
  // without a server. If it carries a daily, it counts towards the median.
  if (config.dailyNumber && c.clicks != null && c.ms) {
    store.recordSeen(config.dailyNumber, { ms: c.ms, clicks: c.clicks, won: true, by: c.by });
  }

  state.pendingChallenge = config;
  showScreen('challenge');
  $('#btn-accept').focus();
}

function wireChallenge() {
  $('#btn-accept').addEventListener('click', () => {
    const config = state.pendingChallenge;
    if (config) startRace(config);
  });
  $('#btn-challenge-home').addEventListener('click', goHome);
}

/* ------------------------------------------------------------------ home */

function wireHome() {
  $('#btn-daily').addEventListener('click', () => {
    const p = dailyPuzzle();
    navigate(raceHash({ start: p.start, target: p.target, mode: 'daily', dailyNumber: p.number }));
  });

  $$('.chip[data-difficulty]').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.difficulty = chip.dataset.difficulty;
      $$('.chip[data-difficulty]').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('is-on', on);
        c.setAttribute('aria-checked', String(on));
      });
      renderDifficultyHint();
    });
  });
  renderDifficultyHint();

  $('#btn-random').addEventListener('click', () => {
    const p = randomPuzzle(state.difficulty, state.lastConfig);
    navigate(raceHash({ start: p.start, target: p.target, mode: 'random' }));
  });

  $('#btn-wild').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Rolling…';
    try {
      const [a, b] = await randomArticles(2);
      if (!a || !b) throw new Error('Wikipedia did not hand back two usable articles.');
      navigate(raceHash({ start: a, target: b, mode: 'wild' }));
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Two random articles';
    }
  });

  setupCombo('start');
  setupCombo('target');

  $('#btn-swap').addEventListener('click', () => {
    const a = $('#input-start');
    const b = $('#input-target');
    [a.value, b.value] = [b.value, a.value];
    [a.dataset.resolved, b.dataset.resolved] = [b.dataset.resolved || '', a.dataset.resolved || ''];
    $('#custom-status').textContent = '';
    estimateCustomDifficulty();
  });

  $('#btn-custom').addEventListener('click', startCustomRace);
  $$('#input-start, #input-target').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      // While the suggestion list is open, Enter belongs to the combo.
      const list = $('.suggestions', input.closest('.combo'));
      if (e.key === 'Enter' && list.hidden) startCustomRace();
    });
  });

  $('#btn-reset-stats').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Clear your record?',
      body: 'Every stat and past race stored in this browser will be erased. Your settings stay.',
      yes: 'Clear it'
    });
    if (!ok) return;
    store.reset();
    renderHome();
    toast('Record cleared.');
  });

  const s = store.getSettings();
  const imgs = $('#opt-images');
  const navs = $('#opt-navboxes');
  const theme = $('#opt-theme');
  imgs.checked = s.images;
  navs.checked = s.navboxes;
  theme.value = s.theme;
  imgs.addEventListener('change', () => store.setSetting('images', imgs.checked));
  navs.addEventListener('change', () => store.setSetting('navboxes', navs.checked));
  theme.addEventListener('change', () => {
    store.setSetting('theme', theme.value);
    applyTheme(theme.value);
  });
}

function renderDifficultyHint() {
  const d = DIFFICULTY[state.difficulty];
  $('#difficulty-hint').textContent = d ? d.hint : 'Anything from the pool.';
}

/**
 * A stored streak only resets on the next win, never when a day is missed — so
 * a run you broke last week still reads as live until you play again. It counts
 * only if the last daily you won was today's or yesterday's.
 */
function liveStreak(summary, todaysNumber) {
  if (!summary.streak || summary.lastDailyNumber == null) return 0;
  return summary.lastDailyNumber >= todaysNumber - 1 ? summary.streak : 0;
}

function untilNextDaily() {
  const next = msUntilNextDaily();
  const hrs = Math.floor(next / 3600000);
  const mins = Math.floor((next % 3600000) / 60000);
  return hrs ? `${hrs}h ${mins}m` : `${mins}m`;
}

function renderHome() {
  const p = dailyPuzzle();
  $('#daily-number').textContent = `#${p.number}`;
  $('#daily-matchup').replaceChildren(matchupEl(p.start, p.target, p.difficulty, p.name));

  const summary = store.summary();
  const streak = liveStreak(summary, p.number);
  const done = store.dailyResult(p.number);
  const statusEl = $('#daily-status');

  if (done?.won) {
    // Pair the countdown with the streak so the clock has something at stake.
    const tail =
      streak > 1
        ? `${streak} days running — next daily in ${untilNextDaily()}.`
        : `Next daily in ${untilNextDaily()}.`;
    statusEl.textContent =
      `Solved in ${done.clicks} click${done.clicks === 1 ? '' : 's'} · ${fmtTimeShort(done.ms)}. ${tail}`;
    $('#btn-daily').textContent = "Replay today's race";
  } else if (done) {
    statusEl.textContent = 'You gave up on this one. Try again?';
    $('#btn-daily').textContent = "Play today's race";
  } else {
    statusEl.textContent = streak
      ? `You are ${streak} ${streak === 1 ? 'day' : 'days'} into a streak. Today's race keeps it alive.`
      : `Next daily in ${untilNextDaily()}.`;
    $('#btn-daily').textContent = "Play today's race";
  }

  renderCrowd('#daily-crowd', p.number, done?.won ? done.clicks : null);

  renderStats(summary, streak);
}

/**
 * A route as clickable hops rather than dead text.
 *
 * Every place these appear — your path, the shortest route, a challenger's
 * spoiler — the race is already over, so they open the real article on
 * Wikipedia: the whole thing, with its images and references, rather than the
 * stripped board we raced on.
 */
function pathHops(titles) {
  return titles.flatMap((title, i) => {
    const hop = el(
      'a',
      {
        class: 'path-hop',
        href: `https://en.wikipedia.org/wiki/${toUrlTitle(title)}`,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: `Read ${title} on Wikipedia`
      },
      title
    );
    return i === 0 ? [hop] : [el('span', { class: 'path-arrow', text: '→' }), hop];
  });
}

function pathChainEl(titles, extraClass) {
  return el('p', { class: `path-chain${extraClass ? ' ' + extraClass : ''}` }, ...pathHops(titles));
}

function matchupEl(start, target, difficulty, name) {
  return el(
    'div',
    { class: 'matchup-inner' },
    el('span', { class: 'node node-start', text: start }),
    el('span', { class: 'arrow', text: '→' }),
    el('span', { class: 'node node-target', text: target }),
    difficulty ? el('span', { class: `tag tag-${difficulty}`, text: DIFFICULTY[difficulty]?.label || difficulty }) : null,
    name ? el('span', { class: 'tag tag-name', text: name }) : null
  );
}

function renderStats(summary, streak) {
  const s = summary || store.summary();
  const live = streak != null ? streak : liveStreak(s, dailyPuzzle().number);
  const cells = [
    ['Races', s.played],
    ['Solved', s.won],
    ['Win rate', s.played ? `${s.winRate}%` : '—'],
    ['Best clicks', s.bestClicks ?? '—'],
    ['Best time', s.bestMs != null ? fmtTimeShort(s.bestMs) : '—'],
    // bestStreak was stored from the start and never shown; a streak you are
    // no longer on is exactly the number that makes the current one mean something.
    ['Daily streak', live, s.bestStreak > live ? `best ${s.bestStreak}` : null]
  ];
  $('#stat-grid').replaceChildren(
    ...cells.map(([label, value, sub]) =>
      el(
        'div',
        { class: 'stat' },
        el('span', { class: 'stat-value', text: String(value) }),
        el('span', { class: 'stat-label', text: label }),
        sub ? el('span', { class: 'stat-sub', text: sub }) : null
      )
    )
  );

  const host = $('#history');
  if (!s.history.length) {
    host.replaceChildren(el('p', { class: 'muted small', text: 'No races yet. The daily is a good place to start.' }));
    return;
  }
  const VISIBLE = 8;
  const shown = state.historyExpanded ? s.history : s.history.slice(0, VISIBLE);
  // replaceChildren stringifies a null argument into the text "null" — unlike
  // el(), which drops it. Anything conditional has to be filtered out first.
  host.replaceChildren(
    ...[
    el('h3', { class: 'sub', text: 'Recent races' }),
    el(
      'ul',
      { class: 'history' },
      ...shown.map((h) =>
        el(
          'li',
          { class: h.won ? 'won' : 'lost' },
          el('span', { class: 'h-mark', text: h.won ? '✓' : '✕' }),
          el('span', { class: 'h-race', text: `${h.start} → ${h.target}` }),
          el('span', { class: 'h-score', text: h.won ? `${h.clicks} · ${fmtTimeShort(h.ms)}` : '—' }),
          // The row used to be one unlabelled button: the race name was the
          // control, and nothing said so until you hovered or tabbed onto it.
          el(
            'button',
            {
              class: 'btn btn-ghost small h-again',
              title: `Race ${h.start} → ${h.target} again`,
              onclick: () => navigate(raceHash({ start: h.start, target: h.target, mode: 'custom' }))
            },
            el('span', { text: '↻' }),
            el('span', { class: 'btn-word', text: ' Race again' })
          )
        )
      )
    ),
    s.history.length > VISIBLE
      ? el(
          'button',
          {
            class: 'btn btn-ghost small history-more',
            onclick: () => {
              state.historyExpanded = !state.historyExpanded;
              renderStats();
            }
          },
          state.historyExpanded ? 'Show fewer' : `Show all ${s.history.length}`
        )
      : null
    ].filter(Boolean)
  );
}

/* -------------------------------------------------------- custom pickers */

function setupCombo(which) {
  const wrap = $(`.combo[data-combo="${which}"]`);
  const input = $('input', wrap);
  const list = $('.suggestions', wrap);
  let items = [];
  let active = -1;
  let seq = 0;

  const hide = () => {
    list.hidden = true;
    active = -1;
  };

  const run = debounce(async (term) => {
    const mine = ++seq;
    try {
      const results = await searchTitles(term, { limit: 8 });
      if (mine !== seq) return;
      items = results;
      if (!results.length) return hide();
      list.replaceChildren(
        ...results.map((r, i) =>
          el(
            'li',
            {
              role: 'option',
              class: 'suggestion',
              onmousedown: (e) => {
                e.preventDefault();
                choose(i);
              }
            },
            el('span', { class: 's-title', text: r.title }),
            r.description ? el('span', { class: 's-desc', text: r.description }) : null
          )
        )
      );
      list.hidden = false;
    } catch {
      hide();
    }
  }, 180);

  function choose(i) {
    const item = items[i];
    if (!item) return;
    input.value = item.title;
    input.dataset.resolved = item.title;
    hide();
    estimateCustomDifficulty();
  }

  input.addEventListener('input', () => {
    input.dataset.resolved = '';
    $('#custom-status').textContent = '';
    const term = input.value.trim();
    // From the first keystroke: a prefix search on one letter is perfectly
    // useful, and waiting for two hid the feature from anyone who did not
    // already know it was there.
    if (!term) return hide();
    run(term);
    estimateCustomDifficulty();
  });

  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const opts = $$('.suggestion', list);
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-active', i === active));
      opts[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      // Enter used to do nothing at all while the list was open with nothing
      // highlighted — the outer handler defers to the combo, and the combo
      // only acted on a highlighted row.
      e.preventDefault();
      if (active >= 0) choose(active);
      else hide();
      const other = $(which === 'start' ? '#input-target' : '#input-start');
      if (!other.value.trim()) other.focus();
      else startCustomRace();
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  input.addEventListener('blur', () => setTimeout(hide, 120));
}

/**
 * How hard is the pair you just built? The same search the result screen runs,
 * pointed at a race that has not started — so you know whether you have set
 * yourself a warm-up or a wall before the clock does.
 *
 * Held back until both fields are settled and debounced hard: sizing a pair up
 * costs a handful of API calls, and Wikipedia allows about ten in a burst.
 */
const estimateCustomDifficulty = debounce(async () => {
  const out = $('#custom-difficulty');
  const rawStart = $('#input-start').value.trim();
  const rawTarget = $('#input-target').value.trim();

  if (!rawStart || !rawTarget) {
    state.estimatePair = null;
    out.hidden = true;
    return;
  }

  const pair = `${titleKey(rawStart)}\u241f${titleKey(rawTarget)}`;
  if (pair === state.estimatePair) return; // already answered, or in flight
  state.estimatePair = pair;

  state.estimate?.abort();
  const controller = new AbortController();
  state.estimate = controller;

  out.hidden = false;
  out.textContent = 'Sizing it up…';

  try {
    const [a, b] = await Promise.all([resolveOrSearch(rawStart), resolveOrSearch(rawTarget)]);
    if (controller.signal.aborted) return void (state.estimatePair = null);
    if (!a || !b || titleKey(a.title) === titleKey(b.title)) {
      out.hidden = true;
      return;
    }

    const route = await findShortestRoute(a.title, b.title, { signal: controller.signal });
    if (controller.signal.aborted) return void (state.estimatePair = null);
    out.textContent = difficultyLine(a.title, b.title, route);
    out.hidden = !out.textContent;
    // A pair we could not size up is not a pair we have answered — leaving it
    // marked would mean this pair never gets another try.
    if (!out.textContent) state.estimatePair = null;
  } catch {
    out.hidden = true;
    state.estimatePair = null;
  }
}, 700);

function difficultyLine(start, target, route) {
  const pair = `${start} → ${target}`;
  if (route.error) return '';
  if (route.hops === 1) return `${pair}: one click apart. A warm-up.`;
  if (route.hops === 2) return `${pair}: two clicks apart, if you find the right bridge.`;
  // Only the finished sweep earns the firm version.
  return route.exhaustive
    ? `${pair}: nothing inside two clicks. A proper hunt.`
    : `${pair}: further than two clicks, as far as could be checked.`;
}

/** Exact title first; fall back to the top search hit so half-typed input works. */
async function resolveOrSearch(raw) {
  const exact = await resolveTitle(raw);
  if (exact) return exact;
  const [first] = await searchTitles(raw, { limit: 1 });
  return first ? resolveTitle(first.title) : null;
}

async function startCustomRace() {
  const startInput = $('#input-start');
  const targetInput = $('#input-target');
  const status = $('#custom-status');
  const rawStart = startInput.value.trim();
  const rawTarget = targetInput.value.trim();

  if (!rawStart || !rawTarget) {
    status.textContent = 'Pick a start and a target.';
    return;
  }

  status.textContent = 'Checking both articles…';
  try {
    const [a, b] = await Promise.all([resolveOrSearch(rawStart), resolveOrSearch(rawTarget)]);
    if (!a) return void (status.textContent = `Wikipedia has nothing matching “${rawStart}”.`);
    if (!b) return void (status.textContent = `Wikipedia has nothing matching “${rawTarget}”.`);
    if (titleKey(a.title) === titleKey(b.title)) {
      return void (status.textContent = 'Start and target are the same article.');
    }
    status.textContent = '';
    navigate(raceHash({ start: a.title, target: b.title, mode: 'custom' }));
  } catch (err) {
    status.textContent = err.message;
  }
}

/* ------------------------------------------------------------------ race */

function wireRace() {
  $('#article-host').addEventListener('click', onArticleClick);
  $('#article-host').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const link = e.target.closest?.('a.wg-link');
      if (link) {
        e.preventDefault();
        onArticleClick(e);
      }
    }
  });

  $('#btn-back').addEventListener('click', () => state.race?.back());
  $('#btn-quit').addEventListener('click', async () => {
    if (state.race?.status === 'racing') {
      const ok = await confirmDialog({
        title: 'Leave this race?',
        body: 'Your run will not be recorded.',
        yes: 'Leave'
      });
      if (!ok) return;
    }
    goHome();
  });
  $('#btn-giveup').addEventListener('click', async () => {
    if (state.race?.status !== 'racing') return;
    const ok = await confirmDialog({
      title: 'Give up?',
      body: 'The race ends here and the result is recorded as a loss.',
      yes: 'Give up'
    });
    if (ok && state.race?.status === 'racing') state.race.giveUp();
  });
  $('#btn-peek').addEventListener('click', peekTarget);
  $('#btn-skip').addEventListener('click', skipRace);

  finder.init();

  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('in-race')) return;

    // Ctrl/Cmd+F would open the browser's own find, which searches the whole
    // board and hits prose as readily as links. Ours is the better tool for
    // the job, so take the shortcut people already reach for.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      finder.openFind();
      return;
    }
    if (isTyping(e.target)) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      state.race?.back();
    } else if (e.key === '/' || e.key.toLowerCase() === 'f') {
      e.preventDefault();
      finder.openFind();
    }
  });
}

function isTyping(node) {
  return node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.isContentEditable);
}

function onArticleClick(e) {
  const anchor = e.target.closest?.('a.wg-anchor');
  if (anchor) {
    e.preventDefault();
    const id = anchor.dataset.wgAnchorTarget;
    const dest = id && $('#article-host').querySelector(`[id="${CSS.escape(id)}"]`);
    finder.scrollTo(dest);
    return;
  }
  const link = e.target.closest?.('a.wg-link');
  if (!link) return;
  e.preventDefault();
  const title = link.dataset.wgTitle;
  if (title) state.race?.go(title);
}

/**
 * The settings a race is actually played under.
 *
 * A challenge card promises "same start, same target, same rules", and until
 * now that was not quite true: navigation boxes roughly double the ways out of
 * a big article, so a score set with them off was a score on a different board.
 * A challenge is a like-for-like comparison or it is nothing, so it is played
 * on the challenger's board.
 *
 * Only for that race. Your stored settings are never written — leave the race
 * and your own board is exactly as you left it.
 */
function raceSettings(config) {
  const mine = store.getSettings();
  if (!config.challenge) return mine;
  // Links written before `nb` existed carry no setting, and the default has
  // always been on, so that is what their absence means.
  return { ...mine, navboxes: config.challenge.navboxes ?? true };
}

const REROLLABLE = new Set(['random', 'wild']);

/**
 * Not this one. A race the game chose at random is not a challenge you failed,
 * so bailing out of one should not touch the record — the only exits before
 * this were a loss or the ✕, which drops you home to click Random again.
 */
async function skipRace() {
  const race = state.race;
  if (!race || race.status !== 'racing') return;
  const mode = race.mode;
  if (!REROLLABLE.has(mode)) return;

  // Only worth a confirmation once there is something to lose.
  if (race.clicks > 0) {
    const ok = await confirmDialog({
      title: 'Skip this race?',
      body: 'You get a fresh one. Nothing is recorded either way.',
      yes: 'Skip it'
    });
    if (!ok || state.race !== race || race.status !== 'racing') return;
  }

  const btn = $('#btn-skip');
  if (mode === 'wild') {
    btn.disabled = true;
    btn.textContent = 'Rolling…';
    try {
      const [a, b] = await randomArticles(2);
      if (!a || !b) throw new Error('Wikipedia did not hand back two usable articles.');
      endRace();
      navigate(raceHash({ start: a, target: b, mode: 'wild' }));
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Skip';
    }
    return;
  }

  const p = randomPuzzle(state.difficulty, state.lastConfig);
  endRace();
  navigate(raceHash({ start: p.start, target: p.target, mode: 'random' }));
}

function startRace(config) {
  endRace();
  // The difficulty estimate is worth several API calls against a budget of
  // about ten in a burst — the race that just started needs them more.
  estimateCustomDifficulty.cancel();
  state.estimate?.abort();
  state.lastConfig = config;
  state.raceHash = location.hash;
  showScreen('race');
  $('#btn-skip').hidden = !REROLLABLE.has(config.mode);

  $('#article-host').replaceChildren(el('p', { class: 'muted', text: 'Loading the opening article…' }));
  $('#hud-target-title').textContent = config.target;
  $('#trail').replaceChildren();
  renderChallengeBanner(config.challenge, config);

  const race = new Race({
    ...config,
    settings: raceSettings(config),
    onChange: renderHud,
    onArticle: showArticle,
    onError: (err, r) => {
      const message = err.message || 'Wikipedia did not answer. Try that link again.';
      // A failure during begin() leaves nothing on the board to go back to.
      if (r.status === 'error') showRaceError(message);
      else toast(message);
    },
    onFinish: finishRace
  });
  state.race = race;

  state.timer = setInterval(() => {
    if (race.status === 'racing') $('#hud-time').textContent = fmtTime(race.elapsedMs);
  }, 100);

  race.begin();
}

/** Replaces the board when a race could not start at all. */
function showRaceError(message) {
  $('#article-host').replaceChildren(
    el(
      'div',
      { class: 'race-error' },
      el('h2', { text: 'This race cannot start' }),
      el('p', { text: message }),
      el(
        'div',
        { class: 'result-actions' },
        el('button', { class: 'btn btn-primary', onclick: goHome }, 'Back to home'),
        el(
          'button',
          {
            class: 'btn',
            onclick: () => state.lastConfig && startRace({ ...state.lastConfig, challenge: null })
          },
          'Try again'
        )
      )
    )
  );
  $('#loading').hidden = true;
}

function endRace() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.routeSearch?.abort();
  state.routeSearch = null;
  finder.reset();
  if (state.race) state.race.status = 'abandoned';
  state.race = null;
  $('#modal-result').hidden = true;
  $('#modal-peek').hidden = true;
}

/** True when a challenge's board differs from the one the player has set. */
function boardMismatch(challenge) {
  if (!challenge) return false;
  return (challenge.navboxes ?? true) !== (store.getSettings().navboxes !== false);
}

function renderChallengeBanner(challenge, config) {
  const banner = $('#challenge-banner');
  if (!challenge) {
    banner.hidden = true;
    return;
  }
  const who = challenge.by || 'Someone';
  const bits = [];
  if (challenge.clicks) bits.push(`${challenge.clicks} click${challenge.clicks === 1 ? '' : 's'}`);
  if (challenge.ms) bits.push(fmtTimeShort(challenge.ms));
  banner.replaceChildren(
    ...[
      el('span', { class: 'cb-flag', text: '🏁' }),
      el('span', {}, `${who} finished this in ${bits.join(' · ')}. Beat it.`),
      boardMismatch(challenge)
        ? el('span', {
            class: 'cb-note',
            text: `Navigation boxes ${challenge.navboxes === false ? 'off' : 'on'}, matching their board.`
          })
        : null
    ].filter(Boolean)
  );
  banner.hidden = false;
}

function renderHud(race) {
  // Route length and ground covered: the same number until you double back,
  // and the gap between them is the part the score does not show.
  $('#hud-progress').textContent =
    `${race.clicks} click${race.clicks === 1 ? '' : 's'} · ${race.visited.size} seen`;
  $('#hud-time').textContent = fmtTime(race.elapsedMs);
  $('#hud-target-title').textContent = race.target;
  $('#loading').hidden = !race.isLoading;
  $('#btn-back').disabled = race.path.length < 2 || race.isLoading || race.status !== 'racing';
  $('#btn-peek').disabled = race.status !== 'racing';
  $('#btn-giveup').disabled = race.status !== 'racing';
  $('#btn-skip').disabled = race.status !== 'racing';
  $('#btn-peek').textContent = race.hints ? `Peek +15s (${race.hints})` : 'Peek +15s';

  const trail = $('#trail');
  trail.replaceChildren(
    ...race.path.flatMap((step, i) => {
      const isLast = i === race.path.length - 1;
      const steps = race.path.length - 1 - i;
      const node = el(
        'button',
        {
          class: `crumb${isLast ? ' is-current' : ''}`,
          title: isLast
            ? step.title
            : `Jump back to ${step.title} (+${(steps * BACK_PENALTY_MS) / 1000}s)`,
          disabled: isLast || race.status !== 'racing',
          onclick: () => race.rewindTo(i)
        },
        step.title
      );
      return i === 0 ? [node] : [el('span', { class: 'crumb-sep', text: '›' }), node];
    })
  );
  trail.scrollLeft = trail.scrollWidth;
}

function showArticle(article, race) {
  const settings = race.settings;
  const host = $('#article-host');
  const prepared = prepareArticle(article.html, { ...settings, visited: race.visited });

  // With no floated images or infobox, the full column is a punishing measure.
  host.classList.toggle('no-images', !settings.images);
  host.replaceChildren(
    scrubEvents(el('h1', { class: 'article-title', html: article.displayTitle })),
    articleMetaEl(countLinks(prepared)),
    prepared
  );
  finder.attach(prepared);
  $('#article-wrap').scrollTop = 0;
  window.scrollTo(0, 0);
  renderHud(race);
}

// Few enough ways out that it is worth saying so on arrival rather than
// letting someone scroll the whole page to find out.
const THIN_ARTICLE = 8;

function articleMetaEl(links) {
  if (links === 0) {
    return el('p', {
      class: 'article-meta is-dead-end',
      text: 'Dead end — nothing links out of here. Step back.'
    });
  }
  if (links <= THIN_ARTICLE) {
    return el('p', {
      class: 'article-meta is-dead-end',
      text: `Nearly a dead end — only ${links} link${links === 1 ? '' : 's'} out of here.`
    });
  }
  return el('p', { class: 'article-meta', text: `${links.toLocaleString()} links out of here` });
}

async function peekTarget() {
  const race = state.race;
  if (!race || race.status !== 'racing') return;
  race.usedHint();
  const body = $('#peek-body');
  $('#peek-title').textContent = race.target;
  body.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  $('#modal-peek').hidden = false;
  try {
    const s = await fetchSummary(race.target);
    body.replaceChildren(
      ...[
        s.thumbnail ? el('img', { class: 'peek-img', src: s.thumbnail, alt: '' }) : null,
        s.description ? el('p', { class: 'peek-desc', text: s.description }) : null,
        el('p', { class: 'peek-extract', text: s.extract || 'No summary available.' }),
        el('p', { class: 'muted small', text: `+${HINT_PENALTY_MS / 1000}s added to your time.` })
      ].filter(Boolean)
    );
  } catch {
    body.replaceChildren(el('p', { class: 'muted', text: 'Could not load a summary for that article.' }));
  }
}

/* ---------------------------------------------------------------- result */

function finishRace(result) {
  clearInterval(state.timer);
  state.timer = null;
  store.record(result);

  const beat =
    result.challenge && result.won
      ? {
          faster: result.challenge.ms ? result.ms < result.challenge.ms : null,
          fewer: result.challenge.clicks ? result.clicks < result.challenge.clicks : null
        }
      : null;

  $('#result-title').textContent = result.won
    ? beat && (beat.faster || beat.fewer)
      ? 'Beaten! 🏆'
      : 'Made it! 🏁'
    : 'Gave up 🏳️';
  $('#result-matchup').replaceChildren(matchupEl(result.start, result.target));

  const stats = [
    ['Clicks', String(result.clicks)],
    ['Time', fmtTime(result.ms)],
    result.hints ? ['Peeks', `${result.hints} (+${(result.hints * HINT_PENALTY_MS) / 1000}s)`] : null,
    result.backs ? ['Backs', `${result.backs} (+${(result.backs * BACK_PENALTY_MS) / 1000}s)`] : null,
    result.dailyNumber ? ['Daily', `#${result.dailyNumber}`] : null
  ].filter(Boolean);
  $('#result-stats').replaceChildren(
    ...stats.map(([l, v]) =>
      el('div', { class: 'stat' }, el('span', { class: 'stat-value', text: v }), el('span', { class: 'stat-label', text: l }))
    )
  );

  // The conditions a run was played under, where they differ from the plain
  // reading of the score: ground covered beyond the route kept, and the
  // setting that decides how many ways out each article had.
  const note = $('#result-note');
  const lines = [
    result.seen > result.clicks + 1
      ? result.won
        ? `You opened ${result.seen} articles to find a route of ${result.clicks}.`
        : `You opened ${result.seen} articles before giving up.`
      : null,
    result.navboxes === false ? 'Navigation boxes were off — the harder board.' : null
  ].filter(Boolean);
  note.textContent = lines.join(' ');
  note.hidden = !lines.length;

  const cmp = $('#result-challenge');
  if (result.challenge && result.won) {
    const who = result.challenge.by || 'the challenger';
    const lines = [];
    if (result.challenge.clicks) {
      const d = result.clicks - result.challenge.clicks;
      const n = Math.abs(d);
      lines.push(
        d === 0
          ? `➖ Same number of clicks as ${who}`
          : `${d < 0 ? '✅' : '❌'} ${n} click${n === 1 ? '' : 's'} ${d < 0 ? 'fewer' : 'more'} than ${who}`
      );
    }
    if (result.challenge.ms) {
      const d = result.ms - result.challenge.ms;
      lines.push(`${d < 0 ? '✅' : '❌'} ${fmtDelta(d)} ${d < 0 ? 'faster' : 'slower'} than ${who}`);
    }
    cmp.replaceChildren(...lines.map((t) => el('p', { text: t })));
    cmp.hidden = false;
  } else {
    cmp.hidden = true;
  }

  $('#result-path').replaceChildren(
    el('h3', { class: 'sub', text: `Your path (${result.path.length} article${result.path.length === 1 ? '' : 's'})` }),
    pathChainEl(result.path)
  );

  // Your own run has already gone into the seen pile via store.record().
  renderCrowd('#result-crowd', result.dailyNumber, result.won ? result.clicks : null, {
    submitRun: result.dailyNumber
      ? { clicks: result.clicks, ms: result.ms, won: result.won }
      : null
  });

  revealShortestRoute(result);

  // A run you gave up on is not a score to beat — share the board instead.
  $('#btn-copy-challenge').textContent = result.won ? 'Copy challenge link' : 'Copy race link';
  $('#share-note').textContent = result.won
    ? 'The link opens on your result. Your route rides along, hidden behind a spoiler.'
    : 'The link opens the same race with no score attached.';
  $('#modal-result').hidden = false;
  $('#btn-copy-challenge').focus();
  renderHome();
}

/**
 * What the race was actually worth. The search takes a few seconds, so the
 * result screen goes up without it and this fills in underneath — and is
 * abandoned if the player has already moved on to another race.
 */
function revealShortestRoute(result) {
  const box = $('#result-best');
  state.routeSearch?.abort();
  const controller = new AbortController();
  state.routeSearch = controller;

  const heading = () => el('h3', { class: 'sub', text: 'Shortest route' });
  box.replaceChildren(
    heading(),
    el('p', { class: 'muted best-working' }, el('span', { class: 'spinner' }), 'Working it out…')
  );

  findShortestRoute(result.start, result.target, { signal: controller.signal }).then((route) => {
    if (controller.signal.aborted) return;
    box.replaceChildren(heading(), ...bestRouteBody(route, result));
  });
}

function bestRouteBody(route, result) {
  if (route.error) return [el('p', { class: 'muted', text: 'Could not work that out just now.' })];

  if (route.hops) {
    const n = `${route.hops} click${route.hops === 1 ? '' : 's'}`;
    return [
      pathChainEl(route.path, 'best-chain'),
      el('p', {
        class: 'muted small',
        text:
          result.won && result.clicks === route.hops
            ? `${n} — and that is exactly what you took.`
            : result.won
              ? `${n}. You took ${result.clicks}.`
              : `${n}. It was closer than it looked.`
      })
    ];
  }

  // Nothing in two. Whether that is a fact about Wikipedia or only about the
  // part of it we got to read decides how firmly it can be said.
  return [
    el('p', {
      class: 'best-none',
      text: route.exhaustive
        ? 'No route in two clicks exists. Three was the best anyone could have done.'
        : 'No route in two clicks turned up.'
    }),
    el('p', {
      class: 'muted small',
      text: route.exhaustive
        ? `Every one of the ${route.examined.toLocaleString()} links out of ${result.start} was checked.`
        : `The first ${route.examined.toLocaleString()} links out of ${result.start} were checked — a shorter route may sit further down.`
    })
  ];
}

/* ----------------------------------------------------------- the crowd */

/**
 * How your run sits against everyone else's on the same daily.
 *
 * With no scoreboard configured this is drawn from the runs this browser has
 * actually seen — your own, plus any carried in challenge links people sent
 * you. That is a real number about real players, but it is a median of a
 * handful, so the label says exactly whose runs it counts rather than passing
 * it off as "today". With a scoreboard configured the true figure replaces it.
 */
function crowdLine(dailyNumber, yourClicks, aggregate) {
  const local = store.seenFor(dailyNumber);

  if (aggregate) {
    const bits = [`Median today: ${fmtMedian(aggregate.medianClicks)} clicks`];
    if (aggregate.medianMs) bits.push(fmtTimeShort(aggregate.medianMs));
    return `${yourClicks == null ? '' : `You: ${yourClicks}. `}${bits.join(' · ')}, from ${aggregate.count.toLocaleString()} runs.`;
  }

  // One run is you, and a median of one is not worth showing.
  if (local.length < 2) return '';
  const clicks = median(local.map((r) => r.clicks));
  const ms = median(local.map((r) => r.ms));
  const you = yourClicks == null ? '' : `You: ${yourClicks}. `;
  return (
    `${you}Median of the ${local.length} runs you have seen: ` +
    `${fmtMedian(clicks)} clicks · ${fmtTimeShort(ms)}.`
  );
}

// An even count gives a .5, which is a true median and should not be rounded
// away — but 5 should read as "5", not "5.0".
function fmtMedian(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Fill a crowd line, then upgrade it in place if a configured scoreboard
 * answers. The local figure shows immediately either way — a scoreboard that
 * is slow or down must not leave an empty space where a number should be.
 */
function renderCrowd(target, dailyNumber, yourClicks, { submitRun = null } = {}) {
  const node = $(target);
  const text = crowdLine(dailyNumber, yourClicks, null);
  node.textContent = text;
  node.hidden = !text;

  if (!scoreboard.enabled() || dailyNumber == null) return;

  const pending = submitRun
    ? scoreboard.submit({ daily: dailyNumber, ...submitRun })
    : scoreboard.fetchAggregate(dailyNumber);

  pending.then((aggregate) => {
    if (!aggregate) return;
    const upgraded = crowdLine(dailyNumber, yourClicks, aggregate);
    node.textContent = upgraded;
    node.hidden = !upgraded;
  });
}

function wireModals() {
  const nameInput = $('#input-name');
  nameInput.value = store.getPlayerName();
  nameInput.addEventListener('change', () => store.setPlayerName(nameInput.value));

  $('#btn-peek-close').addEventListener('click', () => ($('#modal-peek').hidden = true));
  $('#modal-peek').addEventListener('click', (e) => {
    if (e.target.id === 'modal-peek') $('#modal-peek').hidden = true;
  });

  $('#btn-copy-challenge').addEventListener('click', async (e) => {
    // currentTarget is cleared once dispatch ends, so grab the button first.
    const btn = e.currentTarget;
    const r = state.race?.result();
    if (!r) return;
    const label = r.won ? 'Copy challenge link' : 'Copy race link';
    const url = r.won ? challengeUrl({ ...r, by: playerName() }) : raceUrl({ ...r, mode: 'custom' });
    flash(btn, (await copyText(url)) ? 'Link copied ✓' : 'Copy failed', label);
  });

  $('#btn-copy-result').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const r = state.race?.result();
    if (!r) return;
    const url = r.won ? challengeUrl({ ...r, by: playerName() }) : raceUrl({ ...r, mode: 'custom' });
    const text = shareBlock({ ...r, url });
    flash(btn, (await copyText(text)) ? 'Copied ✓' : 'Copy failed', 'Copy result');
  });

  $('#btn-again').addEventListener('click', () => {
    const c = state.lastConfig;
    $('#modal-result').hidden = true;
    if (c) startRace({ ...c, challenge: null });
  });
  // Wikipedia's links are one-way, so the return trip is a different race —
  // often a much harder one than the leg you just ran.
  $('#btn-reverse').addEventListener('click', () => {
    const r = state.race?.result();
    const c = state.lastConfig;
    const start = r?.target || c?.target;
    const target = r?.start || c?.start;
    if (!start || !target) return;
    $('#modal-result').hidden = true;
    navigate(raceHash({ start, target, mode: 'custom' }));
  });

  $('#btn-new').addEventListener('click', () => {
    const p = randomPuzzle(state.difficulty, state.lastConfig);
    $('#modal-result').hidden = true;
    navigate(raceHash({ start: p.start, target: p.target, mode: 'random' }));
  });
  $('#btn-home').addEventListener('click', goHome);
}

/** Momentary button feedback that restores the original label. */
function flash(btn, message, label) {
  btn.textContent = message;
  clearTimeout(btn._flash);
  btn._flash = setTimeout(() => (btn.textContent = label), 1800);
}

function playerName() {
  return $('#input-name').value.trim() || null;
}

/* ----------------------------------------------------------------- chrome */

const THEMES = new Set(['light', 'dark', 'auto']);

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', THEMES.has(theme) ? theme : 'light');
}

/** In-app replacement for window.confirm — resolves true when accepted. */
function confirmDialog({ title, body, yes = 'Confirm' }) {
  return new Promise((resolve) => {
    const modal = $('#modal-confirm');
    const yesBtn = $('#btn-confirm-yes');
    const noBtn = $('#btn-confirm-no');
    $('#confirm-title').textContent = title;
    $('#confirm-body').textContent = body;
    yesBtn.textContent = yes;

    const done = (value) => {
      modal.hidden = true;
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onYes = () => done(true);
    const onNo = () => done(false);
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
    };

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    document.addEventListener('keydown', onKey);
    modal.hidden = false;
    yesBtn.focus();
  });
}

let toastTimer = null;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

boot();
