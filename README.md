# The Wikipedia Game

Start on one Wikipedia article. Reach another. Links only.

The high-school game — everyone opens the same article, first to click their way
to the target wins — rebuilt as a website. Articles are rendered **inside** the
game, so the rules are actually enforced: no search box, no URL bar, no
back-button escape to Google.

## Modes

| Mode | What it does |
| --- | --- |
| **Daily challenge** | One race a day, the same for everyone. Day 1 is Apple → Pearl Harbor. |
| **Quick race** | Random pull from a curated pool of 63 races, filterable by difficulty. |
| **Two random articles** | Straight from `Special:Random`. Brutal, occasionally impossible. |
| **Build your own** | Pick any two articles, with autocomplete off the live Wikipedia index. |
| **Challenge link** | Finish a race and copy the link. It opens on *your result* — score, time, peeks, and your route behind a spoiler — then drops them onto the same board with your score to beat. |

## Rules as implemented

- Only links inside the article body count as moves. Category, file, help and
  external links are stripped to plain text; red links are dead.
- Redirects resolve server-side, so arriving at a redirect of the target wins.
- **Back** steps up your path and does not add a click — but the clock keeps
  running, and your recorded path is wherever you actually ended up.
- **Peek** shows the target's summary and adds 15 seconds to your final time.
- Navigation boxes are kept but collapsed, the way they behave on desktop
  Wikipedia. They can be switched off entirely in settings.

## Look

Styled to sit next to Wikipedia rather than argue with it: white content on a
`#f8f9fa` page, `#a2a9b1` hairlines, serif headings over sans body text, and
`#3366cc` links that underline only on hover. Red is reserved for one thing —
the target. Light is the default; a dark theme using Wikipedia's own night
palette is in settings, along with "Match system".

Wikipedia's inline box widths are stripped from infoboxes and thumbs so the
game's own column rules govern the layout at every width. Its inline
*background* colours are kept but tagged `.wg-tinted`, which the dark theme
uses to force dark text back onto them — taxobox headers would be unreadable
otherwise.

## Running it

No build step, no dependencies, no backend — it is plain ES modules. It does
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
| `js/render.js` | Turns raw article HTML into a controlled board: chrome stripped, every link either armed as a legal move or defused. |
| `js/game.js` | Race state machine — path, clock, win detection. Knows nothing about the DOM. |
| `js/app.js` | Routing, home screen, race board, results. |
| `js/puzzles.js` | The curated race pool and the daily schedule. |
| `js/share.js` | Challenge-link encoding and share text. |
| `js/stats.js` | Player history in `localStorage`. Nothing leaves the browser. |

Routes live in the hash, so the whole thing is one static page:
`#/race/Apple/Pearl_Harbor?daily=1`, or with a finished run attached,
`#/race/Apple/Pearl_Harbor?ms=102000&clicks=5&h=1&by=Chris&p=<route>`.

A link carrying a run opens on the challenge card rather than starting the
race, so the reader sees what they are chasing before the clock starts. The
route (`p`) is base64 — chat clients that print URLs in full would otherwise
spoil the answer in the link text itself. It is dropped automatically if the
URL would exceed 1800 characters, and a mangled `p` degrades to no route rather
than breaking the link.

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
