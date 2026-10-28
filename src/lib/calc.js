export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (s, n) => {
  const d = new Date(s + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dayMs = s => new Date(s + 'T12:00:00').getTime();
export const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 86400000);
export const num = v => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '–' : v.toFixed(d));

// RFM (relative fat mass) and waist-to-height, using the same formulas as the old app (navel as the waist measure).
export const rfm = (height, navel) => (navel ? 64 - 20 * (height / navel) : null);
export const whtr = (height, navel) => (navel ? navel / height : null);

// 7-day moving average: mean of all weigh-ins in the last 7 calendar days, per measurement day.
export function withMA(rows, key = 'weight') {
  const s = rows.filter(r => r[key] != null).sort((a, b) => a.date.localeCompare(b.date));
  return s.map(r => {
    const win = s.filter(x => daysBetween(x.date, r.date) >= 0 && daysBetween(x.date, r.date) < 7);
    return { ...r, ma: win.reduce((a, x) => a + x[key], 0) / win.length };
  });
}

// Linear trend over the last n points of the moving average, returned as kg/week.
export function slopePerWeek(points, n = 14, key = 'ma') {
  const p = points.slice(-n);
  if (p.length < 4) return null;
  const x0 = dayMs(p[0].date);
  const xs = p.map(r => (dayMs(r.date) - x0) / 86400000);
  const ys = p.map(r => r[key]);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num_ = 0, den = 0;
  xs.forEach((x, i) => { num_ += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? (num_ / den) * 7 : null;
}

export const phaseFor = (phases, date) => phases.find(p => date >= p.start && date <= p.end) || null;

export const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);

export function downloadFile(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
