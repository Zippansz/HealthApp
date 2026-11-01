import React from 'react';
import { niceScale, useWidth } from './lib/scale';

export const MACRO_COLORS = { p: '#38bdf8', c: '#f59e0b', f: '#a78bfa' };

// Stacked daily bars in kcal: protein at the bottom, then carbs, then fat.
// days: [{date, p, f, c}] (grams)   lines: [{y (kcal), color, label}]
export default function Bars({ days, lines = [], trace, height = 300, onPick, picked }) {
  const [ref, W] = useWidth();
  const H = height, L = 44, R = 8, T = 16, B = 38;
  const kc = d => ({ p: d.p * 4, c: d.c * 4, f: d.f * 9 });
  const tot = d => { const k = kc(d); return k.p + k.c + k.f; };
  const sc = niceScale(0, Math.max(...days.map(tot), ...lines.map(l => l.y), ...(trace ? trace.values.filter(v => v != null) : []), 500) * 1.05, 6, true);
  const yMax = sc.hi;
  const Y = v => T + (1 - v / yMax) * (H - T - B);
  const bw = (W - L - R) / days.length;
  return (
    <div ref={ref}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
      {sc.ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#1e293b" /><text x={L - 7} y={Y(t) + 4} fontSize="12" textAnchor="end" fill="#94a3b8">{t}</text></g>)}
      {days.map((d, i) => {
        const k = kc(d); const x = L + i * bw + bw * 0.14, w = bw * 0.72;
        let base = 0; const segs = ['p', 'c', 'f'].map(m => { const seg = { m, y0: base, y1: base + k[m] }; base += k[m]; return seg; });
        const dt = new Date(d.date + 'T12:00:00');
        return (
          <g key={d.date} onClick={() => onPick && onPick(d.date)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill={picked === d.date ? '#ffffff' : 'transparent'} opacity=".06" />
            {segs.map(s => s.y1 > s.y0 && <rect key={s.m} x={x} y={Y(s.y1)} width={w} height={Y(s.y0) - Y(s.y1)} fill={MACRO_COLORS[s.m]} />)}
            {base > 0 && <text x={x + w / 2} y={Y(base) - 3} fontSize="10" textAnchor="middle" fill="#94a3b8">{bw >= 20 ? Math.round(base) : ''}</text>}
            <text x={x + w / 2} y={H - 20} fontSize="12" textAnchor="middle" fill={picked === d.date ? '#e2e8f0' : '#94a3b8'}>{dt.getDate()}</text>
            <text x={x + w / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="#64748b">{'SMTWTFS'[dt.getDay()]}</text>
          </g>
        );
      })}
      {trace && (() => {
        const pts = trace.values.map((v, i) => (v == null ? null : [L + i * bw + bw / 2, Y(v)])).filter(Boolean);
        return <g><polyline fill="none" stroke={trace.color} strokeWidth="2.2" strokeLinejoin="round" points={pts.map(q => q.join(',')).join(' ')} />
          {pts.map((q, i) => <circle key={i} cx={q[0]} cy={q[1]} r="3" fill={trace.color} stroke="#020617" strokeWidth="1" />)}</g>;
      })()}
      {lines.map((l, i) => (
        <g key={i}><line x1={L} x2={W - R} y1={Y(l.y)} y2={Y(l.y)} stroke={l.color} strokeWidth="1.8" strokeDasharray="6 4" />
          <text x={W - R - 2} y={Y(l.y) - 4} fontSize="12" textAnchor="end" fill={l.color} fontWeight="600">{l.label}</text></g>
      ))}
    </svg></div>
  );
}
