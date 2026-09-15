const API = 'https://disneyland.disney.go.com/dining/dinemenu/api/menu?searchTerm=';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export async function getMenu(slug) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API + slug, { headers: { accept: 'application/json', 'user-agent': UA } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
}

export function collectVenue(json, park, parkSlug, slug, today) {
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
            Pulled: today, Restaurant: venueName, Park: park, Item: title, Category: category,
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
