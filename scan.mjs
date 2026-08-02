// Disneyland Resort menu price watch.
// Sweeps all 25 priced venues, diffs against the committed snapshot,
// appends real price moves to data/price-changes.csv, writes summary.md.

import fs from 'node:fs/promises';

const API = 'https://disneyland.disney.go.com/dining/dinemenu/api/menu?searchTerm=';

const VENUES = [
  ['blue-bayou-restaurant', 'Disneyland Park', 'disneyland'],
  ['carnation-cafe', 'Disneyland Park', 'disneyland'],
  ['cafe-orleans', 'Disneyland Park', 'disneyland'],
  ['plaza-inn', 'Disneyland Park', 'disneyland'],
  ['bengal-barbecue', 'Disneyland Park', 'disneyland'],
  ['jolly-holiday-bakery-cafe', 'Disneyland Park', 'disneyland'],
  ['rancho-del-zocalo-restaurante', 'Disneyland Park', 'disneyland'],
  ['river-belle-terrace', 'Disneyland Park', 'disneyland'],
  ['docking-bay-7-food-and-cargo', 'Disneyland Park', 'disneyland'],
  ['alien-pizza-planet', 'Disneyland Park', 'disneyland'],
  ['lamplight-lounge', 'Disney California Adventure', 'disney-california-adventure'],
  ['carthay-circle-restaurant', 'Disney California Adventure', 'disney-california-adventure'],
  ['flos-v8-cafe', 'Disney California Adventure', 'disney-california-adventure'],
  ['pym-test-kitchen', 'Disney California Adventure', 'disney-california-adventure'],
  ['smokejumpers-grill', 'Disney California Adventure', 'disney-california-adventure'],
  ['paradise-garden-grill', 'Disney California Adventure', 'disney-california-adventure'],
  ['magic-key-terrace', 'Disney California Adventure', 'disney-california-adventure'],
  ['trader-sams', 'Disneyland Hotel', 'disneyland-hotel'],
  ['tangaroa-terrace', 'Disneyland Hotel', 'disneyland-hotel'],
  ['palm-breeze-bar', 'Disneyland Hotel', 'disneyland-hotel'],
  ['craftsman-bar', 'Grand Californian Hotel', 'grand-californian-hotel'],
  ['hearthstone-lounge', 'Grand Californian Hotel', 'grand-californian-hotel'],
  ['napa-rose-lounge', 'Grand Californian Hotel', 'grand-californian-hotel'],
  ['white-water-snacks', 'Grand Californian Hotel', 'grand-californian-hotel'],
  ['sketch-pad-cafe', 'Pixar Place Hotel', 'pixar-place-hotel'],
];

const TODAY = new Date().toISOString().slice(0, 10);
const NOW = new Date().toISOString().slice(0, 16).replace('T', ' ');
const HEADER = ['Pulled', 'Restaurant', 'Park', 'Item', 'Category', 'MealPeriods', 'Description', 'Price', 'Source'];
const LOG_HEADER = ['Detected', 'Restaurant', 'Park', 'Item', 'Category', 'Old Price', 'New Price', 'Change', 'Percent', 'Source'];

function normItem(s) {
  return String(s)
    .replace(/[\u00AE\u2122\u00A9*]/g, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\(\s*kids\s*\)\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const keyOf = (r) => `${normItem(r.Restaurant)}\u0000${normItem(r.Item)}`;

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows, header) {
  return [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n') + '\n';
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const head = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

async function readIfExists(p) {
  try { return await fs.readFile(p, 'utf8'); } catch { return null; }
}

async function getMenu(slug) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API + slug, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
}

function collectVenue(json, park, parkSlug, slug) {
  const venueName = json?.name || slug;
  const byKey = new Map();
  for (const mp of json?.mealPeriods || []) {
    const period = mp?.label || mp?.name || '';
    for (const group of mp?.groups || []) {
      if (String(group?.type || '').toLowerCase().includes('allergy friendly')) continue;
      const category = group?.name || '';
      for (const item of group?.items || []) {
        const prices = item?.prices || [];
        if (!prices.length) continue;
        const p = prices.find((x) => typeof x?.withoutTax === 'number') || prices[0];
        if (typeof p?.withoutTax !== 'number') continue;
        const price = p.withoutTax.toFixed(2);
        const title = String(item?.title || '').trim();
        const k = [venueName, title, price, category].join('\u0000');
        if (!byKey.has(k)) {
          byKey.set(k, {
            Pulled: TODAY, Restaurant: venueName, Park: park, Item: title, Category: category,
            MealPeriods: [],
            Description: String(item?.description || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
            Price: price, Source: `${parkSlug}/${slug}`,
          });
        }
        const row = byKey.get(k);
        if (period && !row.MealPeriods.includes(period)) row.MealPeriods.push(period);
      }
    }
  }
  return [...byKey.values()].map((r) => ({ ...r, MealPeriods: r.MealPeriods.join('; ') }));
}

const current = [];
const failures = [];
const counts = new Map();

for (const [slug, park, parkSlug] of VENUES) {
  try {
    const rows = collectVenue(await getMenu(slug), park, parkSlug, slug);
    current.push(...rows);
    counts.set(rows[0]?.Restaurant || slug, rows.length);
  } catch (err) {
    failures.push(`${slug}: ${err.message}`);
  }
}

const MIN_ROWS = Number(process.env.MIN_ROWS || 800);
if (failures.length > 5 || current.length < MIN_ROWS) {
  await fs.mkdir('.', { recursive: true });
  await fs.writeFile('summary.md', `## Menu scan ${NOW} UTC — ABORTED\n\nOnly ${current.length} rows and ${failures.length} venue failures. Snapshot left untouched.\n\n${failures.map((f) => '- ' + f).join('\n')}\n`);
  await fs.writeFile('POST_COMMENT', '1');
  console.log('Aborted: incomplete pull');
  process.exit(0);
}

await fs.mkdir('data', { recursive: true });
const prevText = await readIfExists('data/current.csv');
const previous = prevText ? parseCsv(prevText) : [];

const group = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

const bMap = group(previous);
const cMap = group(current);
const changes = [], flags = [], added = [], removed = [];

for (const [k, bRows] of bMap) {
  const cRows = cMap.get(k);
  if (!cRows) { removed.push(...bRows); continue; }
  if (bRows.length === 1 && cRows.length === 1) {
    const o = Number(bRows[0].Price), n = Number(cRows[0].Price);
    if (o !== n) {
      changes.push({
        Detected: NOW, Restaurant: cRows[0].Restaurant, Park: cRows[0].Park, Item: cRows[0].Item,
        Category: cRows[0].Category, 'Old Price': o.toFixed(2), 'New Price': n.toFixed(2),
        Change: (n - o).toFixed(2), Percent: (((n - o) / o) * 100).toFixed(1) + '%', Source: cRows[0].Source,
      });
    }
  } else {
    for (const b of bRows) {
      const near = cRows.reduce((a, c) => (Math.abs(+c.Price - +b.Price) < Math.abs(+a.Price - +b.Price) ? c : a));
      if (Number(near.Price) !== Number(b.Price)) {
        flags.push(`${b.Restaurant} — ${b.Item}: ${b.Price} vs nearest ${near.Price} (${cRows.length} rows share this name)`);
      }
    }
  }
}
for (const [k, cRows] of cMap) if (!bMap.has(k)) added.push(...cRows);

const prevCounts = new Map();
for (const r of previous) prevCounts.set(r.Restaurant, (prevCounts.get(r.Restaurant) || 0) + 1);
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

const money = (c) => `- **${c.Restaurant}** — ${c.Item}: $${c['Old Price']} → $${c['New Price']} (${c.Change > 0 ? '+' : ''}${c.Change}, ${c.Percent})`;
const lines = [];

const hour = new Date().getUTCHours();
// Wider window (12–14 UTC) to tolerate GitHub schedule delays around the 13:00 slot
const isDailySlot = hour >= 12 && hour <= 14;

lines.push(`## Menu scan ${NOW} UTC`);
lines.push('');
lines.push(`${current.length} rows across ${VENUES.length} venues${failures.length ? `, ${failures.length} venue failure(s)` : ', 0 failures'}.`);
lines.push('');

if (!previous.length) {
  lines.push('First run — baseline established. Nothing to diff against yet.');
} else if (!changes.length && !added.length && !removed.length) {
  if (isDailySlot) {
    lines.push('**Daily check complete — no changes.**');
  } else {
    lines.push('**No changes.** No price moves, no items added or removed.');
  }
} else {
  if (changes.length) {
    const up = changes.filter((c) => +c.Change > 0).length;
    lines.push(`### ${changes.length} price change${changes.length > 1 ? 's' : ''} (${up} up, ${changes.length - up} down)`);
    lines.push(...changes.map(money));
    lines.push('');
  } else {
    lines.push('No price changes.');
    lines.push('');
  }
  if (added.length) {
    lines.push(`### ${added.length} new item${added.length > 1 ? 's' : ''}`);
    lines.push(...added.slice(0, 40).map((r) => `- **${r.Restaurant}** — ${r.Item} ($${r.Price})`));
    if (added.length > 40) lines.push(`- …and ${added.length - 40} more`);
    lines.push('');
  }
  if (removed.length) {
    lines.push(`### ${removed.length} item${removed.length > 1 ? 's' : ''} gone`);
    lines.push(...removed.slice(0, 40).map((r) => `- **${r.Restaurant}** — ${r.Item} (was $${r.Price})`));
    if (removed.length > 40) lines.push(`- …and ${removed.length - 40} more`);
    lines.push('');
  }
}

if (countDeltas.length) {
  lines.push('### Venue count changes');
  lines.push(...countDeltas.map((d) => `- ${d}`));
  lines.push('');
}
if (flags.length) {
  lines.push('### Ambiguity flags (not counted as changes)');
  lines.push(...flags.map((f) => `- ${f}`));
  lines.push('');
}
if (failures.length) {
  lines.push('### Venue failures');
  lines.push(...failures.map((f) => `- ${f}`));
  lines.push('');
}

lines.push('---');
lines.push('_Renames are invisible to name matching, so an item Disney renamed alongside a price change will not appear above._');

const hasNews = !previous.length || changes.length > 0 || added.length > 0 || removed.length > 0 || failures.length > 0;
const shouldPost = hasNews || isDailySlot;
if (shouldPost) await fs.writeFile('POST_COMMENT', '1');

await fs.writeFile('summary.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(shouldPost ? (hasNews ? 'NEWS: comment will post' : 'DAILY: comment will post') : 'QUIET: no comment this run');
