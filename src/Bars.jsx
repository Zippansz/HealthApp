import React from 'react';

export const MACRO_COLORS = { p: '#38bdf8', c: '#f59e0b', f: '#a78bfa' };

// Stacked daily bars in kcal: protein at the bottom, then carbs, then fat.
// days: [{date, p, f, c}] (grams)   lines: [{y (kcal), color, label}]
export default function Bars({ days, lines = [], height = 240, onPick, picked }) {
  const W = 720, H = height, L = 38, R = 8, T = 14, B = 34;
  const kc = d => ({ p: d.p * 4, c: d.c * 4, f: d.f * 9 });
  const tot = d => { const k = kc(d); return k.p + k.c + k.f; };
  const yMax = Math.max(...days.map(tot), ...lines.map(l => l.y), 500) * 1.08;
  const Y = v => T + (1 - v / yMax) * (H - T - B);
  const bw = (W - L - R) / days.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((yMax * f) / 100) * 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#1e293b" /><text x={L - 5} y={Y(t) + 3} fontSize="10" textAnchor="end" fill="#64748b">{t}</text></g>)}
      {days.map((d, i) => {
        const k = kc(d); const x = L + i * bw + bw * 0.14, w = bw * 0.72;
        let base = 0; const segs = ['p', 'c', 'f'].map(m => { const seg = { m, y0: base, y1: base + k[m] }; base += k[m]; return seg; });
        const dt = new Date(d.date + 'T12:00:00');
        return (
          <g key={d.date} onClick={() => onPick && onPick(d.date)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill={picked === d.date ? '#ffffff' : 'transparent'} opacity=".06" />
            {segs.map(s => s.y1 > s.y0 && <rect key={s.m} x={x} y={Y(s.y1)} width={w} height={Y(s.y0) - Y(s.y1)} fill={MACRO_COLORS[s.m]} />)}
            {base > 0 && <text x={x + w / 2} y={Y(base) - 3} fontSize="9" textAnchor="middle" fill="#94a3b8">{Math.round(base)}</text>}
            <text x={x + w / 2} y={H - 18} fontSize="10" textAnchor="middle" fill={picked === d.date ? '#e2e8f0' : '#64748b'}>{dt.getDate()}</text>
            <text x={x + w / 2} y={H - 6} fontSize="9" textAnchor="middle" fill="#475569">{'SMTWTFS'[dt.getDay()]}</text>
          </g>
        );
      })}
      {lines.map((l, i) => (
        <g key={i}><line x1={L} x2={W - R} y1={Y(l.y)} y2={Y(l.y)} stroke={l.color} strokeWidth="1.8" strokeDasharray="6 4" />
          <text x={W - R - 2} y={Y(l.y) - 4} fontSize="10" textAnchor="end" fill={l.color} fontWeight="600">{l.label}</text></g>
      ))}
    </svg>
  );
}
