import React from 'react';
import { dayMs } from './lib/calc';
import { niceScale, useWidth } from './lib/scale';

// Dependency-free SVG line chart, drawn at real pixel size.
// series: [{points:[{x:'YYYY-MM-DD',y}], color, dots, dashed, width}]
// bands: [{start,end,color,label}]  hlines: [{y,color,label}]
export default function Chart({ series, bands = [], hlines = [], height = 300, yPad = 0.3 }) {
  const [ref, W] = useWidth();
  const H = height, L = 46, R = 12, T = 14, B = 30;
  const pts = series.flatMap(s => s.points);
  if (!pts.length) return <div ref={ref} className="dim">No data yet.</div>;
  const xs = pts.map(p => dayMs(p.x));
  const x0 = Math.min(...xs), x1 = Math.max(...xs, x0 + 86400000);
  const ys = [...pts.map(p => p.y), ...hlines.map(h => h.y)];
  const sc = niceScale(Math.min(...ys) - yPad, Math.max(...ys) + yPad, H > 220 ? 6 : 5);
  const X = d => L + ((dayMs(d) - x0) / (x1 - x0)) * (W - L - R);
  const Y = v => T + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - T - B);
  const nx = W < 420 ? 3 : 5;
  const xt = Array.from({ length: nx }, (_, i) => new Date(x0 + ((x1 - x0) * i) / (nx - 1)).toISOString().slice(0, 10));
  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block' }}>
        {bands.map((b, i) => {
          const a = Math.max(X(b.start), L), e = Math.min(X(b.end), W - R);
          if (e <= a || dayMs(b.end) < x0 || dayMs(b.start) > x1) return null;
          return <g key={i}><rect x={a} y={T} width={e - a} height={H - T - B} fill={b.color} opacity=".12" />
            {e - a > 60 && <text x={a + 5} y={T + 13} fontSize="11" fill={b.color}>{b.label}</text>}</g>;
        })}
        {sc.ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} stroke="#1e293b" /><text x={L - 7} y={Y(t) + 4} fontSize="12" textAnchor="end" fill="#94a3b8">{t.toFixed(sc.dec)}</text></g>)}
        {xt.map((t, i) => <text key={i} x={X(t)} y={H - 9} fontSize="11" textAnchor={i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle'} fill="#94a3b8">{t.slice(2)}</text>)}
        {hlines.map((h, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(h.y)} y2={Y(h.y)} stroke={h.color} strokeDasharray="5 4" /><text x={W - R - 2} y={Y(h.y) - 5} fontSize="11" textAnchor="end" fill={h.color}>{h.label}</text></g>)}
        {series.map((s, i) => (
          <g key={i}>
            <polyline fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" strokeLinecap="round"
              points={s.points.map(p => `${X(p.x)},${Y(p.y)}`).join(' ')} />
            {s.dots && s.points.map((p, j) => <circle key={j} cx={X(p.x)} cy={Y(p.y)} r="2.5" fill={s.color} />)}
          </g>
        ))}
      </svg>
    </div>
  );
}
