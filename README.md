# The Wikipedia Game

Start on one Wikipedia article. Reach another. Links only.

The high-school game — everyone opens the same article, first to click their way
to the target wins — rebuilt as a website. Articles are rendered **inside** the
game, so the rules are actually enforced: no search box, no URL bar, no
back-button escape to Google.

## Modes

| Mode | What it does |
| --- | --- |
| **Daily challenge** | One race a day, the same for everyone, always **hard**, with a median to measure yourself against. |
| **Quick race** | Random pull from a curated pool of 209 races, filterable by difficulty. It remembers what it has dealt you, so races do not come round again until you have worked through the pool. |
| **Two random articles** | Straight from `Special:Random`. Brutal, occasionally impossible. |
| **Build your own** | Pick any two articles, with autocomplete off the live Wikipedia index — and a difficulty estimate before you commit. |
| **Expert Mode** | A switch, not a race of its own: the thirty biggest articles on Wikipedia are closed, on quick races and your own pairs. It rides in the link, so a challenge is played on the board it was set on. |
| **Challenge link** | Finish a race and copy the link. It opens on *your result* — score, time, peeks, and your route behind a spoiler — then drops them onto the same board with your score to beat, and with your pace running alongside them as a ghost. |

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
- In **Expert Mode**, a hub article is struck through and cannot be
  clicked. Reaching for one costs nothing — it is simply not a road.
- Racing a challenge puts a **ghost** in the HUD: where the challenger was when
  their clock read what yours reads now. It can be switched off in settings.
- Every finished race is scored against **par** — the shortest route that
  exists. Matching it is the perfect game; you cannot do better than it.
- Every result screen breaks the run into **splits** — what each hop cost, and
  which one cost the most.
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
| `js/hubs.js` | The Expert Mode list: thirty hub articles and every title that redirects to one. |
| `js/share.js` | Challenge-link encoding and share text. |
| `js/stats.js` | Player history in `localStorage`, plus the daily runs this browser has seen. |
| `js/scoreboard.js` | The optional shared scoreboard. Inert unless configured. |
| `js/config.js` | Deployment settings. One of them, and it ships empty. |

Routes live in the hash, so the whole thing is one static page:
`#/race/Apple/Pearl_Harbor?daily=1`, `#/race/Apple/Pearl_Harbor?hb=1` for a
race in Expert Mode, or with a finished run attached,
`#/race/Apple/Pearl_Harbor?ms=102000&clicks=5&h=1&nb=0&by=Chris&hb=1&p=<route>&t=<pace>`.

`mode` carries how the race was chosen — `daily`, `random` (curated pool),
`wild` (two random articles), `challenge`, or `custom` when absent. Skip reads
it to reroll the same kind of race rather than dropping you into a different
one. `nb=0` says the run was set with navigation boxes off, and the race opened
from that link is played that way whatever the reader's own settings say.

A link carrying a run opens on the challenge card rather than starting the
race, so the reader sees what they are chasing before the clock starts. The
route (`p`) is base64 — chat clients that print URLs in full would otherwise
spoil the answer in the link text itself. `t` is the pace of the run: one
figure per click, in tenths of a second, base 36. Past 1800 characters the pace
is shed first and then the route, so a long run still arrives as a score to
beat rather than as a link a chat client has chopped in half. A mangled `p`
degrades to no route rather than breaking the link, and a `t` whose length does
not line up with the route it arrived with is dropped rather than pinned to the
wrong hops.

### Expert Mode

Every long race on Wikipedia has the same optimal shape: climb to an article
that links to everything, then descend. United States, World War II, London,
Latin — reach one of those and the rest of the board opens up, whatever the two
articles were. It is a real strategy, it works from almost anywhere, and it is
the same strategy every time.

Switch Expert Mode on and the thirty of them in `js/hubs.js` are closed. They
are struck through on the page rather than deleted: knowing that the road you
wanted is shut is part of the game this mode is asking you to play, and a
silently missing link would just read as a broken board. The tally at the top
of each article says what it cost that page — *"848 links out of here, 5
closed"*.

They are chosen for being both enormous and generic — the pages a player heads
for when they have no better idea, rather than simply the most-linked articles
on Wikipedia, which are things like `Geographic coordinate system`, linked by
infobox furniture nobody routes through on purpose.

**A link to `USA` is a link to United States**, so closing a hub means closing
every title that redirects to it — about seventeen hundred of them. Those are
generated from Wikipedia rather than guessed at:

```bash
node tools/build-hubs.mjs          # print what would change
node tools/build-hubs.mjs --write  # write it into js/hubs.js
```

They are written into the source rather than looked up at race time, because
the board has to be identical for two people opening the same link and it has
to be there before the first article renders. The tool also refuses to write a
hub that has become a redirect, a disambiguation page, or nothing at all.

The list can still drift — a redirect created after it was generated is a link
the board cannot see through — so the **rule** is enforced one step later, on
arrival: the title Wikipedia hands back is the one that is checked. A move
refused there costs nothing, and every copy of that link on the page is struck
through as it happens, so the board catches up rather than offering it again.

A race's own two articles are never closed. Racing *to* a hub is a perfectly
good race — it is routing *through* one that this mode is about — and a target
nobody can arrive at is not a race at all. Both endpoints are excluded by their
resolved names, along with every way of writing them, so `Sushi → USA` leaves
`U.S.` clickable and everything else shut.

The shortest route is computed against the same closed graph: a hop through an
article the player could not have taken is not one the result screen offers
them. Answers are cached separately from the ordinary board's.

`hb=1` rides in the race hash, which is what makes it a property of the race
rather than of whoever is reading. A challenge link written on a closed board
is played on a closed board whatever the reader's own switch says, and one
written before `hb` existed — or with the switch off — is an ordinary race for
everyone. The switch on the home screen is only the default for races started
from there.

**The daily never uses it.** It is one shared board, and a run on a smaller
graph stored against Daily #12 would be a different race wearing the same
number — in your record, in your streak, and in the median. The daily card says
so when the switch is on.

### Par

Clicks alone do not say much. A four on a pair that is four hops apart is a
perfect run; a four on a pair that is two hops apart is a scramble. Par settles
which one you just had:

```
Par 1                                          Double bogey
Apple → Fruit
1 click was the best possible. You took 3.
```

Par is the shortest route, so it **cannot be beaten** — the ladder runs one way
and only its first rungs are worth a name: par, bogey, double bogey, triple
bogey, then plain `+4`. Matching par is the win inside the win.

It costs nothing to compute, because the shortest-route search was already
running on that screen. It lands a second or two after the result does, which is
why the record fills in afterwards rather than at the moment you finish.

**Only a route proved shortest can be par.** The three-hop sweep can return a
route it found after a shallower sweep was cut short — the shortest *seen*, not
the shortest there is — and a score against a maybe is not a score. The search
reports `certain` for exactly this, and when it is false the panel keeps its old
heading and says so: *"the shortest route found. Shorter ones were not ruled
out, so this is not a par."*

A run that beats the route outright means the search missed it, which is rare
and worth saying plainly rather than dressing up as a negative handicap.

**Over par** is the one number in the record that knows what a race was worth.
It counts only the races that were actually scored, so it has its own
denominator — *"+1.4, 23 scored"* — and past runs from before par existed are
simply not in it. Each history row carries its own, and the share text picks it
up when the search proved it before you copied:

```
The Wikipedia Game — Daily #3
🔗🔗🔗🔗
4 clicks · 0:24 · par 3 +1
```

### Splits

Clicks and a final time say what a run cost but not where it went. Every result
screen breaks the route into the time spent on each article, bar by bar, with
the longest stop named underneath:

```
1  Apple    0:28.9  ████████████████
2  Malus    0:24.9  ██████████████
3  Apple    0:07.8  ████
🏁 Fruit    arrived

Longest stop: Apple — 0:28.9, 47% of the run.
```

A split runs from arriving somewhere to arriving at the next article you
*kept*, so an excursion that was rewound is charged to the article it was
launched from — which is where the decision was actually made. The row is
marked `↩` so the number reads as a detour rather than as deliberation. That
makes the splits tile the whole run: they add up to the final time, peek and
back penalties included.

Arriving at the target ends the race, so the last article is an arrival rather
than a stay — unless the run ended there by giving up, which it very much was,
and that split is usually the longest one on the board.

### The ghost

A challenge link carries the pace of the run that made it, so the challenger
can be *raced* rather than merely out-scored. The HUD says where they were when
their clock read what yours reads now:

```
👻 Chris was 2 clicks in by now.                     −1 on their pace
🏁 Chris had finished by now — 3 clicks in 0:40.         7.9s behind
```

It names none of their articles. The only thing it adds to what the challenge
card already showed is *when* they got their clicks in, so racing the ghost
gives away nothing that accepting the challenge did not — the route stays
behind its spoiler. Their hops land silently otherwise, so the line takes a
brief wash of colour as each one goes by, which `prefers-reduced-motion` turns
off.

The sentence sits in a live region and is only rewritten when it changes; the
delta beside it moves ten times a second and is deliberately left outside that
region. **Ghost pacer** in settings switches the whole line off. It changes
nothing about the board — unlike navigation boxes, it is not a difficulty
setting — so it is not recorded with a result.

On the result screen the same pace becomes a second, fainter bar under each of
your splits, with the gap per hop beside it, and one line saying who led and
until when. That comparison is drawn from the link rather than from the live
ghost, so it still appears with the pacer switched off. Links written before
`t` existed carry no pace: no ghost, no second bar, and the rest of the
challenge behaves exactly as it did.

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

Hop three used to be declined, on the grounds that expanding each of those five
hundred links on its own would be five hundred more requests. It turns out
`generator=links` takes **fifty source pages at once**, so fifty of them can be
expanded together and the five hundred pages they reach answered in the same
request — the trick hop two already used, one level deeper. A three-hop answer
costs a couple of dozen requests, paced a quarter of a second apart to stay
inside what the anonymous API will take.

That matters most for the races that need it. Hard pairs and Expert Mode both
push real routes out past two hops, which is exactly where the old search went
quiet.

Depth is not free even so: the third hop's frontier is tens of thousands of
pages and the sweep is bounded, so it usually stops long before it has seen all
of them. That changes what can be *claimed*, not what can be found. A route it
returns is real, and the shallower sweeps ran first, so it is genuinely the
shortest. Absence is only ever reported for a depth whose sweep actually ran to
the end — `ruledOut` in the result says which:

| `ruledOut` | What the screen says |
| --- | --- |
| `3` | No route in three clicks exists. Four was the best anyone could have done. |
| `2` | No route in two exists, and none turned up in three — with the count of what was checked, and that a three-click route may sit further out. |
| `0` | Even the two-hop sweep was cut short. "No route in two clicks turned up." |

Depth is also the optional half of the search: if it is throttled or the
connection drops, the deep sweep is abandoned and the shallow answer — which is
proved — is reported on its own rather than the whole thing failing. Answers are
cached in `localStorage`, keyed by the pair and by whether the big articles
were closed.

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
race starts. Now that the search reaches three hops it can tell a wall from a
hunt — *"nothing inside three clicks"* is a different warning from *"nothing
inside two"* — and it sizes the pair up against the board it will be played on,
so turning Expert Mode on changes the estimate.

### The daily schedule

The daily is **always a hard race** (`DAILY_DIFFICULTY` in `js/puzzles.js`):
the schedule is a seeded shuffle of the hard tier only, so every player gets the
same race on the same calendar day without a server. Day 1 is 1 Sep 2026
(`DAILY_EPOCH`). Easy and medium races stay in the pool for the quick race and
are otherwise never scheduled. With 62 hard races the schedule runs two months
before it comes round again, so append hard races if you want a longer run.

Days 1 to 4 are the exception. They were dealt before the daily became
hard-only, and `SCHEDULED` pins them — by value, not by index — to the races
they actually gave out, including the signature `Apple → Pearl Harbor` on day 1.
Results are stored against the daily *number*, so renumbering a day that has
been played silently reattaches somebody's score to a race they never ran. The
hard rotation starts at day 5.

The pool grows by **appending**, and the order is built to match. A single
shuffle over the whole array would repermute everything the moment a race was
added, moving days that have already been played — someone's stored result for
Daily #3 would end up attached to a different race. So each batch is shuffled
within itself (after filtering to the hard tier) and the blocks are
concatenated: `POOL_BLOCKS` records where each batch ended, and an append can
only ever add days to the end of the schedule.

If you add races, append them and push a new boundary onto `POOL_BLOCKS`. Then
check that nothing moved:

```bash
node -e "import('./js/puzzles.js').then(m=>console.log([...Array(5)].map((_,i)=>{const p=m.dailyPuzzle(new Date(2026,8,1+i));return '#'+p.number+' ['+p.difficulty+'] '+p.start+' -> '+p.target})))"
```

### Checking the pool

Every curated title is verified against live Wikipedia — it must exist, not be a
disambiguation page, and be canonical rather than a redirect:

```bash
node tools/check-puzzles.mjs
```

The same goes for the hub list, which `tools/build-hubs.mjs` validates before
it writes anything.

## Attribution

Article text and images are fetched live from Wikipedia and are available under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This game is
not affiliated with the Wikimedia Foundation.
