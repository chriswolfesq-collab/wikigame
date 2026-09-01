// Race state machine. Knows nothing about the DOM — it fetches, tracks the
// path, runs the clock, and calls back when something changes.

import { fetchArticle, resolveTitle } from './wiki.js';
import { titleKey } from './util.js';

export const HINT_PENALTY_MS = 15000;

export class Race {
  /**
   * @param {{start:string,target:string,mode:string,dailyNumber?:number|null,
   *          challenge?:object|null, settings:object,
   *          onChange:Function, onArticle:Function, onError:Function, onFinish:Function}} opts
   */
  constructor(opts) {
    this.start = opts.start;
    this.target = opts.target;
    this.mode = opts.mode || 'custom';
    this.dailyNumber = opts.dailyNumber || null;
    this.challenge = opts.challenge || null;

    this.onChange = opts.onChange || (() => {});
    this.onArticle = opts.onArticle || (() => {});
    this.onError = opts.onError || (() => {});
    this.onFinish = opts.onFinish || (() => {});

    this.path = []; // [{ title, displayTitle }]
    this.visited = new Set(); // every title seen, including backtracked
    this.status = 'idle'; // idle | loading | racing | finished
    this.won = false;
    this.hints = 0;
    this.startedAt = null;
    this.finishedMs = null;
    this.error = null;
    this.targetKey = titleKey(opts.target);
  }

  get clicks() {
    return Math.max(0, this.path.length - 1);
  }

  get current() {
    return this.path[this.path.length - 1] || null;
  }

  get elapsedMs() {
    if (this.finishedMs != null) return this.finishedMs;
    if (this.startedAt == null) return 0;
    return performance.now() - this.startedAt + this.hints * HINT_PENALTY_MS;
  }

  /** Resolve the target and load the opening article. Clock starts on render. */
  async begin() {
    this.status = 'loading';
    this.onChange(this);
    try {
      const [resolvedTarget, article] = await Promise.all([
        resolveTitle(this.target),
        fetchArticle(this.start)
      ]);

      if (!resolvedTarget) throw new Error(`"${this.target}" is not a Wikipedia article.`);
      this.target = resolvedTarget.title;
      this.targetKey = titleKey(resolvedTarget.title);
      this.targetDescription = resolvedTarget.description || '';

      this.start = article.title;
      this.path = [{ title: article.title, displayTitle: article.displayTitle }];
      this.visited.add(titleKey(article.title));
      this.status = 'racing';
      this.startedAt = performance.now();
      this.onArticle(article, this);
      this.onChange(this);

      if (titleKey(article.title) === this.targetKey) this._finish(true);
    } catch (err) {
      this._fail(err);
    }
  }

  /** Follow a link. Returns true if the move was accepted. */
  async go(title) {
    if (this.status !== 'racing' || this._loading) return false;
    if (titleKey(title) === titleKey(this.current?.title)) return false;

    this._loading = true;
    this.onChange(this);
    try {
      const article = await fetchArticle(title);
      if (this.status !== 'racing') return false;

      // A redirect can land us back where we already are.
      if (titleKey(article.title) === titleKey(this.current?.title)) {
        this._loading = false;
        this.onChange(this);
        return false;
      }

      this.path.push({ title: article.title, displayTitle: article.displayTitle });
      this.visited.add(titleKey(article.title));
      this._loading = false;
      this.onArticle(article, this);

      if (titleKey(article.title) === this.targetKey) this._finish(true);
      else this.onChange(this);
      return true;
    } catch (err) {
      this._loading = false;
      this.onError(err, this);
      this.onChange(this);
      return false;
    }
  }

  /** Step back up the path. Does not add a click, but the clock keeps running. */
  async back() {
    if (this.status !== 'racing' || this._loading || this.path.length < 2) return false;
    const previous = this.path[this.path.length - 2];
    this._loading = true;
    this.onChange(this);
    try {
      const article = await fetchArticle(previous.title);
      this.path.pop();
      this._loading = false;
      this.onArticle(article, this);
      this.onChange(this);
      return true;
    } catch (err) {
      this._loading = false;
      this.onError(err, this);
      return false;
    }
  }

  /** Jump to any earlier article in the path (breadcrumb click). */
  async rewindTo(index) {
    if (this.status !== 'racing' || this._loading) return false;
    if (index < 0 || index >= this.path.length - 1) return false;
    const target = this.path[index];
    this._loading = true;
    this.onChange(this);
    try {
      const article = await fetchArticle(target.title);
      this.path = this.path.slice(0, index + 1);
      this._loading = false;
      this.onArticle(article, this);
      this.onChange(this);
      return true;
    } catch (err) {
      this._loading = false;
      this.onError(err, this);
      return false;
    }
  }

  usedHint() {
    this.hints += 1;
    this.onChange(this);
  }

  giveUp() {
    if (this.status !== 'racing') return;
    this._finish(false);
  }

  get isLoading() {
    return Boolean(this._loading) || this.status === 'loading';
  }

  _finish(won) {
    this.finishedMs = this.elapsedMs;
    this.status = 'finished';
    this.won = won;
    this.onChange(this);
    this.onFinish(this.result());
  }

  _fail(err) {
    this.status = 'error';
    this.error = err;
    this.onError(err, this);
    this.onChange(this);
  }

  result() {
    return {
      mode: this.mode,
      start: this.start,
      target: this.target,
      won: this.won,
      ms: this.finishedMs ?? this.elapsedMs,
      clicks: this.clicks,
      hints: this.hints,
      dailyNumber: this.dailyNumber,
      challenge: this.challenge,
      path: this.path.map((p) => p.title)
    };
  }
}
