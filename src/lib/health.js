import { parseCSV } from './csv';
import { putMany, saveSettings } from './db';
import { num, addDays, todayStr } from './calc';

// Reads one tab of the "Health Data Export" sheet (as CSV text) into the app's database.
// since = only days on/after this date (used for the daily refresh, so old manual edits aren't overwritten).
export async function importHealthCSV(uid, text, { since } = {}) {
  const { head, rows } = parseCSV(text);
  const byDay = {};
  if (head.includes('Weight (kg)')) {           // Body Measurements: one scale reading per row
    rows.sort((a, b) => a['Date/Time'].localeCompare(b['Date/Time'])).forEach(r => {
      const date = r['Date/Time'].slice(0, 10); const w = num(r['Weight (kg)']);
      if (!w || byDay[date] || (since && date < since)) return;   // first (morning) reading of each day
      byDay[date] = { date, weight: w }; const bf = num(r['Body Fat (%)']); if (bf) byDay[date].bf = bf;
    });
    await putMany(uid, 'measurements', Object.values(byDay).map(x => ({ id: x.date, data: x })));
    return { kind: 'weigh-in days', count: Object.keys(byDay).length };
  }
  if (head.includes('Steps')) {                 // Activity: one row per source / exercise
    const seen = new Set();
    rows.forEach(r => {
      const date = r.Date; if (!date || (since && date < since)) return;
      const o = (byDay[date] ||= { date, steps: 0, kcal: 0 });
      o.steps = Math.max(o.steps, num(r.Steps) || 0);        // phone + Fitbit both report steps: take the larger
      const k = `${r['Start Date/Time']}|${r['Exercise Name']}`;
      if (r['Exercise Name'] && !seen.has(k)) { seen.add(k); o.kcal += num(r['Exercise Calories (kcal)']) || 0; }
    });
    const items = Object.values(byDay).map(x => { const o = { date: x.date, steps: x.steps }; if (x.kcal > 0) o.kcal = x.kcal; return { id: x.date, data: o }; });
    await putMany(uid, 'activity', items);
    return { kind: 'activity days', count: items.length };
  }
  throw new Error('Not recognised (expected the Body Measurements or Activity tab).');
}

// Fetches the published-CSV links and imports them. First run = everything, later runs = last 10 days.
export async function syncSheets(uid, settings) {
  const urls = [settings.sheetBody, settings.sheetActivity].filter(Boolean);
  if (!urls.length) return null;
  const since = settings.lastSync ? addDays(todayStr(), -10) : undefined;
  const parts = [];
  try {
    for (const u of urls) {
      const res = await fetch(u);
      if (!res.ok) throw new Error(`Could not read the sheet link (HTTP ${res.status}).`);
      const r = await importHealthCSV(uid, await res.text(), { since });
      parts.push(`${r.count} ${r.kind}`);
    }
    const msg = `Synced ${parts.join(', ')}`;
    await saveSettings(uid, { lastSync: Date.now(), lastSyncMsg: msg });
    return msg;
  } catch (e) {
    const msg = 'Sync failed: ' + (e.message === 'Failed to fetch' ? 'the link could not be reached (is the tab published as CSV?)' : e.message);
    await saveSettings(uid, { lastSyncMsg: msg });
    return msg;
  }
}
