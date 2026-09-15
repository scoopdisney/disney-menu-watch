import fs from 'node:fs/promises';
import { VENUES } from './venues.mjs';
import { toCsv, parseCsv, readIfExists } from './lib-csv.mjs';
import { getMenu, collectVenue } from './lib-menu.mjs';
import { diff } from './lib-diff.mjs';
import { buildSummary } from './lib-report.mjs';

const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString().slice(0, 16).replace('T', ' ');
const HEADER = ['Pulled', 'Restaurant', 'Park', 'Item', 'Category', 'MealPeriods', 'Description', 'Price', 'Source'];
const LOG_HEADER = ['Detected', 'Restaurant', 'Park', 'Item', 'Category', 'Old Price', 'New Price', 'Change', 'Percent', 'Source'];
const CONCURRENCY = 6;

const current = [];
const failures = [];
const counts = new Map();

for (let i = 0; i < VENUES.length; i += CONCURRENCY) {
  const batch = VENUES.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(async ([slug, park, parkSlug]) => {
    try { return { slug, rows: collectVenue(await getMenu(slug), park, parkSlug, slug, TODAY) }; }
    catch (err) { return { slug, err: err.message }; }
  }));
  for (const r of results) {
    if (r.err) failures.push(`${r.slug}: ${r.err}`);
    else { current.push(...r.rows); counts.set(r.rows[0]?.Restaurant || r.slug, r.rows.length); }
  }
}

const MIN_ROWS = Number(process.env.MIN_ROWS || 1800);
if (failures.length > 5 || current.length < MIN_ROWS) {
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('summary.md', `## Menu scan ${NOW} UTC — ABORTED\n\nOnly ${current.length} rows and ${failures.length} venue failures. Snapshot left untouched.\n\n${failures.map((f) => '- ' + f).join('\n')}\n`);
  await fs.writeFile('POST_COMMENT', '1');
  console.log('Aborted: incomplete pull');
  process.exit(0);
}

await fs.mkdir('data', { recursive: true });
const prevText = await readIfExists('data/current.csv');
const previous = prevText ? parseCsv(prevText) : [];

const { changes, flags, added, removed, prevCounts } = diff(previous, current, NOW);

const countDeltas = [];
for (const [venue, n] of counts) {
  const was = prevCounts.get(venue);
  if (was !== undefined && was !== n) countDeltas.push(`${venue}: ${was} → ${n}`);
}

await fs.writeFile('data/current.csv', toCsv(current, HEADER));

if (changes.length) {
  const logText = await readIfExists('data/price-changes.csv');
  const existing = logText ? parseCsv(logText) : [];
  await fs.writeFile('data/price-changes.csv', toCsv([...existing, ...changes], LOG_HEADER));
}

const hour = new Date().getUTCHours();
const isDailySlot = hour >= 12 && hour <= 14;

const summary = buildSummary({
  now: NOW, rowCount: current.length, venueCount: VENUES.length, failures,
  previous, changes, added, removed, countDeltas, flags, isDailySlot,
});

const hasNews = !previous.length || changes.length > 0 || added.length > 0 || removed.length > 0 || failures.length > 0;
const shouldPost = hasNews || isDailySlot;
if (shouldPost) await fs.writeFile('POST_COMMENT', '1');

await fs.writeFile('summary.md', summary);
console.log(summary);
console.log(shouldPost ? (hasNews ? 'NEWS: comment will post' : 'DAILY: comment will post') : 'QUIET: no comment this run');
