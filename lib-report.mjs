export function buildSummary({ now, rowCount, venueCount, failures, previous, changes, added, removed, countDeltas, flags, isDailySlot }) {
  const money = (c) => `- **${c.Restaurant}** — ${c.Item}: $${c['Old Price']} → $${c['New Price']} (${c.Change > 0 ? '+' : ''}${c.Change}, ${c.Percent})`;
  const lines = [];

  lines.push(`## Menu scan ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`);
  lines.push('');
  lines.push(`${rowCount} rows across ${venueCount} venues${failures.length ? `, ${failures.length} venue failure(s)` : ', 0 failures'}.`);
  lines.push('');

  if (!previous.length) {
    lines.push('First run — baseline established. Nothing to diff against yet.');
  } else if (!changes.length && !added.length && !removed.length) {
    lines.push(isDailySlot ? '**Daily check complete — no changes.**' : '**No changes.** No price moves, no items added or removed.');
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
  return lines.join('\n') + '\n';
}
