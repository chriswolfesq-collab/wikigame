// Optional deployment settings. The defaults here are what the game ships as:
// a static page that talks to nobody but Wikipedia.

/**
 * A scoreboard endpoint, for a true "median today" across everyone playing.
 *
 * Leave this empty and nothing changes: no requests are made, and nothing
 * about your play leaves the browser. The daily still shows a median, drawn
 * from the runs your own browser has seen — your own, and any carried in
 * challenge links people sent you.
 *
 * Set it to the URL of a scoreboard service and the game will additionally
 * send, on finishing a daily, four numbers and nothing else:
 *
 *     { daily: 3, clicks: 5, ms: 78000, won: true }
 *
 * No name, no route, no identifier, no cookie. See `tools/scoreboard-worker.js`
 * for a reference implementation and README "The daily median" for the wire
 * contract.
 */
export const SCOREBOARD_URL = '';
