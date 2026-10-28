import React from 'react';
import { dayMs } from './lib/calc';

// Small dependency-free SVG line chart. series: [{points:[{x:'YYYY-MM-DD',y}], color, dots, dashed, width}]
// bands: [{start,end,color,label}]  hlines: [{y,color,label}]
export default function Chart({ series, bands = [], hlines = [], height = 260, yPad = 0.5 }) {
  const W = 720, H = height, L = 40, R = 10, T = 12, B = 26;
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return <div className="dim">No data yet.</div>;
  const xs = pts.map(p => dayMs(p.x));
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 86400000);
  const ys = [...pts.map(p => p.y), ...hlines.map(h => h.y)];
  const y0 = Math.min(...ys) - yPad, y1 = Math.max(...ys) + yPad;
  const X = d => L + ((dayMs(d) - x0) / (x1 - x0)) * (W - L - R);
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
  const xt = Array.from({ length: 4 }, (_, i) => new Date(x0 + ((x1 - x0) * i) / 3).toISOString().slice(0, 10));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {bands.map((b, i) => {
        const a = Math.max(X(b.start), L), e = Math.min(X(b.end), W - R);
        if (e <= a || dayMs(b.end) < x0 || dayMs(b.start) > x1) return null;
        return <g key={i}><rect x={a} y={T} width={e - a} height={H - T - B} fill={b.color} opacity=".12" />
          {e - a > 50 && <text x={a + 4} y={T + 11} fontSize="9" fill={b.color} opacity=".9">{b.label}</text>}</g>;
      })}
      {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#1e293b" /><text x={L - 5} y={Y(t) + 3} fontSize="10" textAnchor="end" fill="#64748b">{t.toFixed(1)}</text></g>)}
      {xt.map((t, i) => <text key={i} x={X(t)} y={H - 8} fontSize="10" textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'} fill="#64748b">{t}</text>)}
      {hlines.map((h, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(h.y)} y2={Y(h.y)} stroke={h.color} strokeDasharray="4 4" /><text x={W - R - 2} y={Y(h.y) - 3} fontSize="10" textAnchor="end" fill={h.color}>{h.label}</text></g>)}
      {series.map((s, i) => (
        <g key={i}>
          <polyline fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round"
            points={s.points.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')} />
          {s.dots && s.points.map((p, j) => <circle key={j} cx={X(p.x)} cy={Y(p.y)} r="2.5" fill={s.color} />)}
        </g>
      ))}
    </svg>
  );
}
