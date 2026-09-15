import { keyOf } from './lib-csv.mjs';

const group = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

export function diff(previous, current, now) {
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
          Detected: now, Restaurant: cRows[0].Restaurant, Park: cRows[0].Park, Item: cRows[0].Item,
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

  return { changes, flags, added, removed, prevCounts };
}
