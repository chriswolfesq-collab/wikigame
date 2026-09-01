// Checks every curated title against live Wikipedia: exists, not a redirect
// surprise, not a disambiguation page.
import { PUZZLES } from '../js/puzzles.js';

const titles = [...new Set(PUZZLES.flatMap((p) => [p.start, p.target]))];
const problems = [];

for (let i = 0; i < titles.length; i += 40) {
  const batch = titles.slice(i, i + 40);
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1',
    prop: 'pageprops|description', ppprop: 'disambiguation',
    titles: batch.join('|')
  }).toString();
  const data = await (await fetch(url)).json();
  const q = data.query || {};
  for (const m of q.missing || []) problems.push([m.title, 'MISSING']);
  for (const p of q.pages || []) {
    if (p.missing) problems.push([p.title, 'MISSING']);
    else if (p.pageprops && 'disambiguation' in p.pageprops) problems.push([p.title, 'DISAMBIGUATION']);
  }
  for (const r of q.redirects || []) problems.push([`${r.from} -> ${r.to}`, 'REDIRECT']);
  for (const n of q.normalized || []) problems.push([`${n.from} -> ${n.to}`, 'NORMALIZED']);
}

console.log(`checked ${titles.length} titles across ${PUZZLES.length} races`);
if (!problems.length) console.log('all clean');
for (const [t, why] of problems) console.log(`${why.padEnd(16)} ${t}`);
