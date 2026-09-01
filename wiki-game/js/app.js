// Wiring: routing, home screen, the race board, results.

import { $, $$, el, fmtTime, fmtTimeShort, fmtDelta, debounce, copyText, titleKey } from './util.js';
import { Race, HINT_PENALTY_MS } from './game.js';
import { prepareArticle, countLinks, scrubEvents } from './render.js';
import { searchTitles, resolveTitle, randomArticles, fetchSummary } from './wiki.js';
import { DIFFICULTY, dailyPuzzle, randomPuzzle, msUntilNextDaily } from './puzzles.js';
import * as store from './stats.js';
import { parseHash, raceHash, raceUrl, challengeUrl, resultText, pathText } from './share.js';

const state = {
  race: null,
  difficulty: 'any',
  lastConfig: null,
  timer: null
};

/* ------------------------------------------------------------------ boot */

function boot() {
  applyTheme(store.getSettings().theme);
  wireHome();
  wireRace();
  wireModals();
  renderHome();
  window.addEventListener('hashchange', route);
  route();
}

/* --------------------------------------------------------------- routing */

function route() {
  const r = parseHash();
  if (r.route === 'race') {
    startRace({
      start: r.start,
      target: r.target,
      mode: r.mode,
      dailyNumber: r.dailyNumber,
      challenge: r.challenge
    });
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
  $('#screen-race').hidden = name !== 'race';
  document.body.classList.toggle('in-race', name === 'race');
  window.scrollTo(0, 0);
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
      navigate(raceHash({ start: a, target: b, mode: 'random' }));
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

function renderHome() {
  const p = dailyPuzzle();
  $('#daily-number').textContent = `#${p.number}`;
  $('#daily-matchup').replaceChildren(matchupEl(p.start, p.target, p.difficulty, p.name));

  const done = store.dailyResult(p.number);
  const statusEl = $('#daily-status');
  if (done?.won) {
    const next = msUntilNextDaily();
    const hrs = Math.floor(next / 3600000);
    const mins = Math.floor((next % 3600000) / 60000);
    statusEl.textContent = `Solved in ${done.clicks} clicks · ${fmtTimeShort(done.ms)} · next daily in ${hrs}h ${mins}m`;
    $('#btn-daily').textContent = "Replay today's race";
  } else if (done) {
    statusEl.textContent = 'You gave up on this one. Try again?';
    $('#btn-daily').textContent = "Play today's race";
  } else {
    statusEl.textContent = '';
    $('#btn-daily').textContent = "Play today's race";
  }

  renderStats();
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

function renderStats() {
  const s = store.summary();
  const cells = [
    ['Races', s.played],
    ['Solved', s.won],
    ['Win rate', s.played ? `${s.winRate}%` : '—'],
    ['Best clicks', s.bestClicks ?? '—'],
    ['Best time', s.bestMs != null ? fmtTimeShort(s.bestMs) : '—'],
    ['Daily streak', s.streak]
  ];
  $('#stat-grid').replaceChildren(
    ...cells.map(([label, value]) =>
      el('div', { class: 'stat' }, el('span', { class: 'stat-value', text: String(value) }), el('span', { class: 'stat-label', text: label }))
    )
  );

  const host = $('#history');
  if (!s.history.length) {
    host.replaceChildren(el('p', { class: 'muted small', text: 'No races yet. The daily is a good place to start.' }));
    return;
  }
  host.replaceChildren(
    el('h3', { class: 'sub', text: 'Recent races' }),
    el(
      'ul',
      { class: 'history' },
      ...s.history.slice(0, 8).map((h) =>
        el(
          'li',
          { class: h.won ? 'won' : 'lost' },
          el('span', { class: 'h-mark', text: h.won ? '✓' : '✕' }),
          el(
            'button',
            {
              class: 'h-race',
              title: 'Race this again',
              onclick: () => navigate(raceHash({ start: h.start, target: h.target, mode: 'custom' }))
            },
            `${h.start} → ${h.target}`
          ),
          el('span', { class: 'h-score', text: h.won ? `${h.clicks} · ${fmtTimeShort(h.ms)}` : '—' })
        )
      )
    )
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
  }

  input.addEventListener('input', () => {
    input.dataset.resolved = '';
    const term = input.value.trim();
    if (term.length < 2) return hide();
    run(term);
  });

  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const opts = $$('.suggestion', list);
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle('is-active', i === active));
      opts[active]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  input.addEventListener('blur', () => setTimeout(hide, 120));
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

  document.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('in-race') && e.key === 'Backspace' && !isTyping(e.target)) {
      e.preventDefault();
      state.race?.back();
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
    dest?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const link = e.target.closest?.('a.wg-link');
  if (!link) return;
  e.preventDefault();
  const title = link.dataset.wgTitle;
  if (title) state.race?.go(title);
}

function startRace(config) {
  endRace();
  state.lastConfig = config;
  showScreen('race');

  $('#article-host').replaceChildren(el('p', { class: 'muted', text: 'Loading the opening article…' }));
  $('#hud-target-title').textContent = config.target;
  $('#trail').replaceChildren();
  renderChallengeBanner(config.challenge, config);

  const race = new Race({
    ...config,
    onChange: renderHud,
    onArticle: showArticle,
    onError: (err) => toast(err.message || 'Wikipedia did not answer. Try that link again.'),
    onFinish: finishRace
  });
  state.race = race;

  state.timer = setInterval(() => {
    if (race.status === 'racing') $('#hud-time').textContent = fmtTime(race.elapsedMs);
  }, 100);

  race.begin();
}

function endRace() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  if (state.race) state.race.status = 'abandoned';
  state.race = null;
  $('#modal-result').hidden = true;
  $('#modal-peek').hidden = true;
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
    el('span', { class: 'cb-flag', text: '🏁' }),
    el('span', {}, `${who} finished this in ${bits.join(' · ')}. Beat it.`)
  );
  banner.hidden = false;
}

function renderHud(race) {
  $('#hud-clicks').textContent = String(race.clicks);
  $('#hud-time').textContent = fmtTime(race.elapsedMs);
  $('#hud-target-title').textContent = race.target;
  $('#loading').hidden = !race.isLoading;
  $('#btn-back').disabled = race.path.length < 2 || race.isLoading || race.status !== 'racing';
  $('#btn-peek').disabled = race.status !== 'racing';
  $('#btn-peek').textContent = race.hints ? `Peek +15s (${race.hints})` : 'Peek +15s';

  const trail = $('#trail');
  trail.replaceChildren(
    ...race.path.flatMap((step, i) => {
      const isLast = i === race.path.length - 1;
      const node = el(
        'button',
        {
          class: `crumb${isLast ? ' is-current' : ''}`,
          title: isLast ? step.title : `Jump back to ${step.title}`,
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
  const settings = store.getSettings();
  const host = $('#article-host');
  const prepared = prepareArticle(article.html, { ...settings, visited: race.visited });

  host.replaceChildren(
    scrubEvents(el('h1', { class: 'article-title', html: article.displayTitle })),
    el('p', { class: 'article-meta', text: `${countLinks(prepared)} links out of here` }),
    prepared
  );
  $('#article-wrap').scrollTop = 0;
  window.scrollTo(0, 0);
  renderHud(race);
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
      s.thumbnail ? el('img', { class: 'peek-img', src: s.thumbnail, alt: '' }) : null,
      s.description ? el('p', { class: 'peek-desc', text: s.description }) : null,
      el('p', { class: 'peek-extract', text: s.extract || 'No summary available.' }),
      el('p', { class: 'muted small', text: `+${HINT_PENALTY_MS / 1000}s added to your time.` })
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
    result.dailyNumber ? ['Daily', `#${result.dailyNumber}`] : null
  ].filter(Boolean);
  $('#result-stats').replaceChildren(
    ...stats.map(([l, v]) =>
      el('div', { class: 'stat' }, el('span', { class: 'stat-value', text: v }), el('span', { class: 'stat-label', text: l }))
    )
  );

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
    el('p', { class: 'path-chain', text: pathText(result.path) })
  );

  // A run you gave up on is not a score to beat — share the board instead.
  $('#btn-copy-challenge').textContent = result.won ? 'Copy challenge link' : 'Copy race link';
  $('#modal-result').hidden = false;
  $('#btn-copy-challenge').focus();
  renderHome();
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
    const r = state.race?.result();
    if (!r) return;
    const label = r.won ? 'Copy challenge link' : 'Copy race link';
    const url = r.won ? challengeUrl({ ...r, by: playerName() }) : raceUrl({ ...r, mode: 'custom' });
    const ok = await copyText(url);
    e.currentTarget.textContent = ok ? 'Link copied ✓' : 'Copy failed';
    setTimeout(() => (e.currentTarget.textContent = label), 1800);
  });

  $('#btn-copy-result').addEventListener('click', async (e) => {
    const r = state.race?.result();
    if (!r) return;
    const url = r.won ? challengeUrl({ ...r, by: playerName() }) : raceUrl({ ...r, mode: 'custom' });
    const text = resultText({ ...r, url });
    const ok = await copyText(text);
    e.currentTarget.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => (e.currentTarget.textContent = 'Copy result'), 1800);
  });

  $('#btn-again').addEventListener('click', () => {
    const c = state.lastConfig;
    $('#modal-result').hidden = true;
    if (c) startRace({ ...c, challenge: null });
  });
  $('#btn-new').addEventListener('click', () => {
    const p = randomPuzzle(state.difficulty, state.lastConfig);
    $('#modal-result').hidden = true;
    navigate(raceHash({ start: p.start, target: p.target, mode: 'random' }));
  });
  $('#btn-home').addEventListener('click', goHome);
}

function playerName() {
  return $('#input-name').value.trim() || null;
}

/* ----------------------------------------------------------------- chrome */

function applyTheme(theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
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
