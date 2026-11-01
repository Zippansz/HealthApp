import { useEffect, useRef, useState } from 'react';

// "Nice" evenly spaced axis ticks (1, 2, 2.5, 5 × 10^n) that cover [min, max].
export function niceScale(min, max, n = 5, zero = false) {
  if (zero) min = 0;
  if (max - min < 1e-9) { max = min + 1; }
  const raw = (max - min) / (n - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const lo = zero ? 0 : Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  const dec = Math.abs(step - Math.round(step)) < 1e-9 ? 0 : Math.abs(step * 10 - Math.round(step * 10)) < 1e-9 ? 1 : 2;
  return { lo, hi, ticks, dec };
}

// Measures the real pixel width so text in the SVG is drawn at its true size on phones.
export function useWidth(fallback = 360) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
