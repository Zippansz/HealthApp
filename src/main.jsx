import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Press feedback: a short green ring plus a tiny vibration on every button / chip tap.
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button,.chip');
  if (!b || b.disabled) return;
  b.classList.remove('tap'); void b.offsetWidth; b.classList.add('tap');
  try { navigator.vibrate && navigator.vibrate(10); } catch { /* not supported */ }
}, true);
