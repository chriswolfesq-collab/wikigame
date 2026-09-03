# The Wikipedia Game

Start on one Wikipedia article. Reach another. Links only.

The high-school game — everyone opens the same article, first to click their way
to the target wins — rebuilt as a website. Articles are rendered **inside** the
game, so the rules are actually enforced: no search box, no URL bar, no
back-button escape to Google.

## Modes

| Mode | What it does |
| --- | --- |
| **Daily challenge** | One race a day, the same for everyone, with a median to measure yourself against. Day 1 is Apple → Pearl Harbor. |
| **Quick race** | Random pull from a curated pool of 63 races, filterable by difficulty. |
| **Two random articles** | Straight from `Special:Random`. Brutal, occasionally impossible. |
| **Build your own** | Pick any two articles, with autocomplete off the live Wikipedia index — and a difficulty estimate before you commit. |
| **Challenge link** | Finish a race and copy the link. It opens on *your result* — score, time, peeks, and your route behind a spoiler — then drops them onto the same board with your score to beat. |

**Copy result** gives you a compact block for a group chat:

```
The Wikipedia Game — Daily #3
🔗🔗🔗🔗
4 clicks · 0:24

Beat me: https://…
```

One link per click, collapsing to `🔗×17` past a dozen. It deliberately does
**not** name the two articles — half the people reading have not played today's
daily yet, and the matchup is the one thing this game can spoil. The link still
carries the board for anyone who wants to play it.

## Rules as implemented

- Only links inside the article body count as moves. Category, file, help and
  external links are stripped to plain text; red links are dead.
- Once a race is over its route becomes a reading list: every hop on the result
  screen, on the shortest route, and behind a challenger's spoiler opens that
  article on Wikipedia proper — the whole thing, with its images and references,
  rather than the stripped board it was raced on. These are the only real links
  the game renders anywhere.
- **Race it backwards** re-runs the same pair the other way. Wikipedia's links
  are one-way, so the return trip is a genuinely different race, and frequently
  a much harder one than the leg you just ran.
- Redirects resolve server-side, so arriving at a redirect of the target wins.
- **Back** steps up your path and does not add a click, but costs **5 seconds**
  a step — the breadcrumb charges the same per article it skips. Free rewinding
  made the clicks column meaningless: the optimal play was to open a promising
  link, glance, rewind, and report only the tidy path you kept. Putting the cost
  on the clock leaves "clicks" meaning the length of your route, which is the
  number worth comparing, while exploration still has a price.
- The HUD shows **clicks · seen** — the route you are on, and how many articles
  you have opened in all. They are the same number until you double back.
- **Peek** shows the target's summary and adds 15 seconds to your final time.
- **Contents** jumps to any section; **Find** filters the page down to the links
  matching what you type, and steps through them. Both are free and unlimited.
  Browser find already worked on this board, so the choice was between a hidden
  advantage for whoever thinks of Ctrl+F and a visible one for everyone —
  Ctrl+F itself is intercepted and opens the in-game filter instead. Neither
  tool reveals anything the article was not already showing.
- Navigation boxes are kept but collapsed, the way they behave on desktop
  Wikipedia. They can be switched off entirely in settings — which is a
  **difficulty setting**, not a cosmetic one: Japan carries 1,778 ways out with
  them on and 1,048 with them off. The setting is recorded with every result and
  shown on the result screen when it was off.
- **A challenge is played on the challenger's board, not yours.** The card
  promises "same start, same target, same rules", and a score set with
  navigation boxes off is a score on a different board — so the setting rides
  along in the link as `nb=0` and is applied for that race. Only for that race:
  your own settings are never written, and the card and the race banner both say
  what happened when the two differ. Links written before `nb` existed carry no
  setting, and the default has always been on, so that is what their absence
  means.
- An article with **8 or fewer** ways out says so at the top, in place of the
  usual link tally — better than discovering a dead end a minute in.
- **Skip** appears on races the game chose for you — a quick race or two random
  articles — and rerolls the same kind. Nothing is recorded: a race nobody
  picked is not one you can fail, and the alternatives were a recorded loss or
  the ✕ and a trip back to the home screen. A daily, a custom pair and a
  challenge are specific boards, so Skip stays hidden on those.
- Start and target must differ. Both resolve through redirects first, so
  `United States` → `USA` is rejected too — otherwise it is an instant win at
  zero clicks, a score no honest run can ever beat.
- Leaving a live race is always confirmed, including via browser Back and a
  mobile edge swipe. Those fire `hashchange` like any other navigation, so the
  router asks before letting the run go and puts the hash back if you decline.
- Every call to Wikipedia has a 20-second deadline, and a race that cannot
  start (mistyped title in a shared link, network down) shows why, with a way
  out — never an endless spinner.

## Look

Styled to sit next to Wikipedia rather than argue with it: white content on a
`#f8f9fa` page, `#a2a9b1` hairlines, serif headings over sans body text, and
`#3366cc` links that underline only on hover. Red is reserved for one thing —
the target. Light is the default; a dark theme using Wikipedia's own night
palette is in settings, along with "Match system".

The article column is 740px so infoboxes and wide tables have room, but prose is
capped separately at `38em` — a paragraph running the full width of that column
is 97 characters a line, half again past a comfortable measure. Capping the text
rather than the container leaves floats their space and reins in only full-width
prose; text already wrapping beside an infobox is narrower than the cap and is
untouched. Headings still span the column, so their rules read as they should.

Wikipedia's inline box widths are stripped from infoboxes and thumbs so the
game's own column rules govern the layout at every width. Its inline
*background* colours are kept but tagged `.wg-tinted`, which the dark theme
uses to force dark text back onto them — taxobox headers would be unreadable
otherwise.

## Running it

No build step, no dependencies, no backend — it is plain ES modules. (A
scoreboard for the daily median is available and entirely optional; see
[The daily median](#the-daily-median).) It does
need to be served over HTTP (the Wikipedia API is fetched with CORS, which
`file://` cannot do):

```bash
python3 tools/devserver.py 4173
```

Then open http://localhost:4173. The dev server sends `Cache-Control: no-store`
so edits appear on a plain reload.

Deploying is a static file copy — any host will do (Netlify, Vercel, GitHub
Pages, S3). There is nothing to configure.

## How it works

| File | Role |
| --- | --- |
| `js/wiki.js` | Every call to Wikipedia. Anonymous GETs with `origin=*`, so CORS is wide open and no server is needed. |
| `js/finder.js` | The section jump and the link filter, plus the scrolling both rely on. |
| `js/solver.js` | The shortest-route search shown on the result screen. |
| `js/render.js` | Turns raw article HTML into a controlled board: chrome stripped, every link either armed as a legal move or defused. |
| `js/game.js` | Race state machine — path, clock, win detection. Knows nothing about the DOM. |
| `js/app.js` | Routing, home screen, race board, results. |
| `js/puzzles.js` | The curated race pool and the daily schedule. |
| `js/share.js` | Challenge-link encoding and share text. |
| `js/stats.js` | Player history in `localStorage`, plus the daily runs this browser has seen. |
| `js/scoreboard.js` | The optional shared scoreboard. Inert unless configured. |
| `js/config.js` | Deployment settings. One of them, and it ships empty. |

Routes live in the hash, so the whole thing is one static page:
`#/race/Apple/Pearl_Harbor?daily=1`, or with a finished run attached,
`#/race/Apple/Pearl_Harbor?ms=102000&clicks=5&h=1&nb=0&by=Chris&p=<route>`.

`mode` carries how the race was chosen — `daily`, `random` (curated pool),
`wild` (two random articles), `challenge`, or `custom` when absent. Skip reads
it to reroll the same kind of race rather than dropping you into a different
one. `nb=0` says the run was set with navigation boxes off, and the race opened
from that link is played that way whatever the reader's own settings say.

A link carrying a run opens on the challenge card rather than starting the
race, so the reader sees what they are chasing before the clock starts. The
route (`p`) is base64 — chat clients that print URLs in full would otherwise
spoil the answer in the link text itself. It is dropped automatically if the
URL would exceed 1800 characters, and a mangled `p` degrades to no route rather
than breaking the link.

### The shortest route

Every result screen answers the question the race leaves behind: what was the
best anyone could have done? The search runs in the browser, after the result is
already up, and is abandoned if you start another race before it lands.

Hop one is a single request. Hop two is the interesting one — asking five
hundred separate pages whether they link to the target would be five hundred
requests, and the anonymous API allows roughly ten in a burst before it starts
returning 429. Feeding the start's link list into a filtered link query with
`generator=links` collapses that to **one** request per five hundred candidates,
so a whole two-hop search costs three or four. Rate-limit responses are retried
with a backoff rather than surfaced as errors.

Hop three is not attempted: the frontier is tens of thousands of pages, and
guessing would be worse than declining. So the screen says only what was proved
— a route when one is found, and "no route in two clicks exists" only when the
sweep actually ran to the end. If it was cut short, it says that instead.
Answers are cached in `localStorage`, keyed by the pair.

Routes are computed over Wikipedia's own link table, which includes links from
navigation boxes. With navboxes switched off in settings, a suggested route may
use a hop the board was not offering.

### The daily median

The `#3` badge promises a shared board, so the daily says how your run compares:

```
You: 7. Median of the 4 runs you have seen: 5.5 clicks · 1:01.
```

Out of the box that number is local and the label says so exactly. A browser
learns other people's runs the only way it can without a server: **challenge
links**. Open one carrying a daily and that score joins the pile, deduplicated
on the run itself so reopening a link cannot count it twice. Your own wins join
it too; a race you gave up on does not. A median of one is just you, so nothing
is shown until there are at least two. Storage is bounded to 30 dailies × 50
runs, oldest dropped.

That is a real number about real players, and for a group trading links in a
chat it is the number that matters. It is not "everyone today", and it never
claims to be.

**For a true global median**, set `SCOREBOARD_URL` in `js/config.js`. The game
then also sends, on finishing a daily, four numbers and nothing else:

```json
{ "daily": 3, "clicks": 5, "ms": 78000, "won": true }
```

No name, no route, no identifier, no cookie. The reply replaces the local line
with `Median today: 4 clicks · 0:48, from 14 runs.` The wire contract:

| | |
| --- | --- |
| `GET  ?daily=N` | read the aggregate without contributing |
| `POST` the object above | contribute and get the aggregate back in one trip |
| both return | `{ count, medianClicks, medianMs }` |

`tools/scoreboard-worker.js` is a deployable Cloudflare Worker implementing it.
It stores a **histogram** per daily rather than a row per run, so storage is
bounded however many people play, and medians stay exact for clicks (times are
bucketed to five seconds). It is unauthenticated by design — adding accounts to
a game that has none is the worse trade — so it clamps obvious nonsense but is
not a defence against someone determined to skew a median. Put Turnstile in
front of the POST if that matters to you.

Every part of this is optional and every call fails silently. Leave
`SCOREBOARD_URL` empty and the game makes no requests but to Wikipedia; set it
and point it at a host that is down, and the local median simply stays put.

### Streaks

`dailyStreak` only ever resets on the next win, never when a day is missed — so
a streak you broke last week reads as live until you play again. The home screen
computes a *live* streak instead: it counts only when the last daily you won was
today's or yesterday's, and shows `0` otherwise. `bestStreak` was stored from
the start and never displayed; it now sits under the current one, which is what
gives the number something to measure against. The countdown to the next daily
is paired with the streak rather than standing alone — *"5 days running — next
daily in 9h 35m"* — so the clock has stakes.

### Sizing up a custom race

Build a pair and the same search runs against it before the clock does, so you
know whether you have set yourself a warm-up or a wall: *"Lego → Cleopatra: two
clicks apart, if you find the right bridge."* It is debounced hard and skips
pairs it has already answered — an estimate costs a handful of API calls, and a
race in progress needs them more, so a pending one is cancelled the moment a
race starts.

### The daily schedule

`PUZZLES[0]` is pinned to Daily #1; the rest is a seeded shuffle, so every
player gets the same race on the same calendar day without a server. Day 1 is
1 Sep 2026 (`DAILY_EPOCH` in `js/puzzles.js`). Adding races to the pool changes
the order of future dailies — append rather than insert if that matters.

### Checking the pool

Every curated title is verified against live Wikipedia — it must exist, not be a
disambiguation page, and be canonical rather than a redirect:

```bash
node tools/check-puzzles.mjs
```

## Attribution

Article text and images are fetched live from Wikipedia and are available under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This game is
not affiliated with the Wikimedia Foundation.
