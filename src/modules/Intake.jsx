import React, { useMemo, useState } from 'react';
import { useCollection, put, remove, saveSettings } from '../lib/db';
import { todayStr, addDays, num, phaseFor, expenditure, daysBetween } from '../lib/calc';
import { askGemini } from '../lib/gemini';
import { resolveProducts, learnFromActions, needsReasoning } from '../lib/products';
import { applyActions, describe } from '../lib/actions';
import Bars, { MACRO_COLORS } from '../Bars';

// Shrinks a photo to max 1400 px JPEG so uploads stay small and fast.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, 1400 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', 0.85);
    return { mime: 'image/jpeg', data: data.split(',')[1], preview: data };
  } finally { URL.revokeObjectURL(url); }
}

function Meter({ label, val, min, max, unit = '' }) {
  const target = max ?? min;
  const pct = Math.min(100, (val / (target || 1)) * 100);
  const over = max != null && val > max;
  const color = over ? 'var(--red)' : min != null && val >= min ? 'var(--green)' : 'var(--blue)';
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row sp" style={{ fontSize: 13 }}><span className="mute">{label}</span>
        <span><b>{Math.round(val)}</b><span className="dim"> / {min != null && max != null ? `${min}–${max}` : max != null ? `≤ ${max}` : `≥ ${min}`}{unit}</span></span></div>
      <div className="bar"><i style={{ width: pct + '%', background: color }} /></div>
    </div>
  );
}

export default function Intake({ uid, settings }) {
  const [date, setDate] = useState(todayStr());
  const since = date < addDays(todayStr(), -70) ? date : addDays(todayStr(), -70);
  const meals = useCollection(uid, 'meals', { since });
  const acts = useCollection(uid, 'activity', { since });
  const imported = useCollection(uid, 'nutrition'); // small (one doc per day), so load all of it
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(''), [note, setNote] = useState('');
  const products = useCollection(uid, 'products');
  const [photos, setPhotos] = useState([]);
  const addPhotos = async e => {
    const files = [...e.target.files]; e.target.value = '';
    try { const imgs = await Promise.all(files.map(shrink)); setPhotos(p => [...p, ...imgs].slice(0, 6)); } catch { setErr('Could not read that photo.'); }
  };
  const [pending, setPending] = useState(null); // {reply, actions} – result of the last request
  const finish = async (reply, actions) => {
    if (!actions.length) { setPending({ reply, actions }); return; }
    setText(''); setPending(null); setPhotos([]);
    applyActions(uid, actions, { settings, todayMeals: dayMeals }).catch(e => setErr('Could not save: ' + e.message));
  };
  const [err, setErr] = useState('');
  const [manual, setManual] = useState({ name: '', amount: '', kcal: '', p: '', f: '', c: '' });
  const phase = phaseFor(settings.phases, date);
  const [modeKey, setModeKey] = useState('');
  const mode = settings.modes[modeKey || phase?.mode] || settings.modes.maintenance;

  const dayMeals = useMemo(() => meals.filter(m => m.date === date).sort((a, b) => (a.ts || 0) - (b.ts || 0)), [meals, date]);
  const act = acts.find(a => a.id === date) || {};
  const tot = dayMeals.reduce((t, m) => ({ p: t.p + (m.p || 0), f: t.f + (m.f || 0), c: t.c + (m.c || 0), kcal: t.kcal + (m.kcal || 0) }), { p: 0, f: 0, c: 0, kcal: 0 });
  const burn = expenditure(settings, act);
  const balance = tot.kcal - burn;

  const last14 = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = addDays(todayStr(), i - 13);
    const t = meals.filter(m => m.date === d).reduce((a, m) => ({ p: a.p + (m.p || 0), f: a.f + (m.f || 0), c: a.c + (m.c || 0) }), { p: 0, f: 0, c: 0 });
    const has = meals.some(m => m.date === d);
    const imp = !has && imported.find(x => x.id === d);   // days without app meals fall back to imported daily totals
    return imp ? { date: d, p: imp.p, f: imp.f, c: imp.c, imported: true } : { date: d, ...t };
  }), [meals, imported]);
  const expTrace = last14.map(d => { const a = acts.find(x => x.id === d.date); return a ? expenditure(settings, a) : null; });

  // ----- weekly summary (Mon–Sun). Today and very low (unfinished) days are left out of the averages. -----
  const weekly = useMemo(() => {
    const today = todayStr();
    const groups = new Map();
    const first = imported.length ? imported.reduce((m, x) => (x.id < m ? x.id : m), today) : today;
    const span = Math.max(69, daysBetween(first, today));
    for (let i = span; i >= 1; i--) {
      const d = addDays(today, -i);
      const dm = meals.filter(m => m.date === d);
      let day = null;
      if (dm.length) day = dm.reduce((a, m) => ({ kcal: a.kcal + (m.kcal || 0), p: a.p + (m.p || 0), f: a.f + (m.f || 0), c: a.c + (m.c || 0) }), { kcal: 0, p: 0, f: 0, c: 0 });
      else { const im = imported.find(x => x.id === d); if (im) day = { kcal: im.kcal, p: im.p, f: im.f, c: im.c }; }
      if (!day || day.kcal < 800) continue;
      const mode = settings.modes[phaseFor(settings.phases, d)?.mode] || settings.modes.maintenance;
      const burn = !dm.length && imported.find(x => x.id === d)?.burn || expenditure(settings, acts.find(x => x.id === d) || {});
      const wd = new Date(d + 'T12:00:00').getDay();
      const wk = addDays(d, -((wd + 6) % 7));
      const g = groups.get(wk) || { wk, n: 0, kcal: 0, p: 0, f: 0, c: 0, burn: 0, inRange: 0, protOk: 0 };
      g.n++; g.kcal += day.kcal; g.p += day.p; g.f += day.f; g.c += day.c; g.burn += burn;
      if (day.kcal >= mode.kcalMin && day.kcal <= mode.kcalMax) g.inRange++;
      if (day.p >= mode.p) g.protOk++;
      groups.set(wk, g);
    }
    return [...groups.values()].sort((a, b) => b.wk.localeCompare(a.wk));
  }, [meals, imported, acts, settings]);
  const [allWeeks, setAllWeeks] = useState(false);

  const frequent = useMemo(() => {
    const m = new Map();
    meals.forEach(x => {
      const k = (x.name || '').toLowerCase(); if (!k) return;
      const e = m.get(k) || { n: 0, last: x };
      e.n++; if ((x.ts || 0) >= (e.last.ts || 0)) e.last = x; m.set(k, e);
    });
    const fav = new Set(settings.favorites.map(f => f.name.toLowerCase()));
    return [...m.entries()].filter(([k, e]) => e.n >= 2 && !fav.has(k)).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([, e]) => e.last);
  }, [meals, settings.favorites]);

  const ctx = { settings, todayMeals: dayMeals };
  const run = async () => {
    setErr(''); setBusy(true);
    try {
      const t = text.trim();
      if (!photos.length && (t.startsWith('{') || t.startsWith('['))) { // pasted from a Claude chat
        const j = JSON.parse(t);
        const actions = Array.isArray(j) ? j : j.actions;
        if (!Array.isArray(actions)) throw new Error('JSON needs an "actions" list.');
        await finish(j.reply || 'Imported from pasted JSON.', actions);
      } else {
        const deep = needsReasoning(t);
        setNote(''); setStep('Checking products…');
        const pr = await resolveProducts({ uid, key: settings.geminiKey, model: settings.geminiModel, text: t, products, enabled: settings.lookupProducts !== false }).catch(() => ({ ref: '', used: [] }));
        setStep(deep ? 'Thinking it through…' : 'Calculating…');
        const bad = (pr.failed || []).map(f => `⚠ couldn't find "${f}" online, AI estimate used`);
        if (pr.used.length || bad.length) setNote([...pr.used.map(u => `${u.cached ? '✓ saved' : '🔎 found online'}: ${u.name}${u.per100 ? ` (${Math.round(u.per100.kcal)} kcal/100 g)` : ''}`), ...bad].join(' · '));
        const r = await askGemini({ key: settings.geminiKey, model: settings.geminiModel, text: t, images: photos, today: date, context: dayMeals.map(m => m.name).join(', '), reference: pr.ref, deep });
        if (!deep) learnFromActions(uid, r.actions || [], products).catch(() => {});
        await finish(r.reply, (r.actions || []).map(a => ({ ...a, date: a.date || date })));
      }
    } catch (e) { setErr(e.message); }
    setBusy(false); setStep('');
  };
  const quick = f => put(uid, 'meals', crypto.randomUUID(), { date, ts: Date.now(), name: f.name, amount: f.amount || '', p: f.p || 0, f: f.f || 0, c: f.c || 0, kcal: f.kcal || 0 });
  const addManual = async () => {
    if (!manual.name.trim()) return;
    await quick({ name: manual.name.trim(), amount: manual.amount, kcal: num(manual.kcal) || 0, p: num(manual.p) || 0, f: num(manual.f) || 0, c: num(manual.c) || 0 });
    setManual({ name: '', amount: '', kcal: '', p: '', f: '', c: '' });
  };
  const addFav = m => saveSettings(uid, { favorites: [...settings.favorites.filter(f => f.name !== m.name), { name: m.name, amount: m.amount, p: m.p, f: m.f, c: m.c, kcal: m.kcal }] });

  return (
    <>
      <div className="row sp" style={{ marginBottom: 12 }}>
        <h2>Intake & expenditure</h2>
        <div className="row">
          <button className="sm" onClick={() => setDate(addDays(date, -1))}>‹</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 150 }} />
          <button className="sm" onClick={() => setDate(addDays(date, 1))}>›</button>
        </div>
      </div>

      <div className="card">
        <div className="row sp" style={{ marginBottom: 10 }}>
          <h3>Targets · {phase ? phase.name : 'no phase'}</h3>
          <select value={modeKey || phase?.mode || 'maintenance'} onChange={e => setModeKey(e.target.value)} style={{ width: 150 }}>
            {Object.entries(settings.modes).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </div>
        <Meter label="Calories" val={tot.kcal} min={mode.kcalMin} max={mode.kcalMax} unit=" kcal" />
        <Meter label="Protein" val={tot.p} min={mode.p} unit=" g" />
        <Meter label="Fat" val={tot.f} max={mode.fMax} unit=" g" />
        <Meter label="Carbs" val={tot.c} max={mode.cMax} unit=" g" />
        <div className="row sp mute" style={{ fontSize: 13 }}>
          <span>Burn ≈ {Math.round(burn)} kcal ({settings.baseTdee} base{act.steps ? ` + ${Math.round(burn - settings.baseTdee - (act.kcal || 0))} steps` : ''}{act.kcal ? ` + ${act.kcal} exercise` : ''}){act.steps ? ` · ${act.steps} steps` : ' · no steps logged (Training tab)'}</span>
          <b className={balance > 0 ? 'a' : 'g'}>{balance > 0 ? '+' : ''}{Math.round(balance)} kcal</b>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Log with AI</h3>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'e.g. "2 eggs, 2 slices rye bread with cheese and a coffee with milk"\nWith a photo of a recipe: "1/4 of this recipe, low fat mayo instead"\nYou can also paste JSON that Claude gave you.'} />
        {photos.length > 0 && (
          <div className="row" style={{ marginTop: 8 }}>
            {photos.map((p, i) => (
              <span key={i} style={{ position: 'relative' }}>
                <img src={p.preview} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--line)' }} />
                <button className="sm" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, padding: '0 6px', borderRadius: 99 }}>✕</button>
              </span>))}
          </div>)}
        <div className="row" style={{ marginTop: 8 }}>
          <label className="chip" style={{ margin: 0 }}>📷 Photo<input type="file" accept="image/*" multiple onChange={addPhotos} style={{ display: 'none' }} /></label>
          <button className="pri" onClick={run} disabled={busy || (!text.trim() && !photos.length)}>{busy ? (step || 'Thinking…') : 'Analyze'}</button>
          {!settings.geminiKey && <span className="a" style={{ fontSize: 13 }}>Add your Gemini key in Settings first.</span>}
        </div>
        {err && <div className="msg r">{err}</div>}
        {note && <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>{note}</div>}
        {pending && (
          <div className="msg">
            {pending.reply && <div className="mute" style={{ marginBottom: 6 }}>{pending.reply}</div>}
            <div className="dim">Nothing to save.</div>
            <button className="sm" style={{ marginTop: 6 }} onClick={() => setPending(null)}>Dismiss</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Meals · {date}</h3>
        {dayMeals.length === 0 && <div className="dim">Nothing logged{(() => { const i = imported.find(x => x.id === date); return i ? ` in the app. Imported daily total: ${Math.round(i.kcal)} kcal · P ${Math.round(i.p)} F ${Math.round(i.f)} C ${Math.round(i.c)}` : '.'; })()}</div>}
        <table><tbody>{dayMeals.map(m => (
          <tr key={m.id}>
            <td>{m.name}<div className="dim" style={{ fontSize: 12 }}>{m.amount} · P{Math.round(m.p)} F{Math.round(m.f)} C{Math.round(m.c)}</div></td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b>{Math.round(m.kcal)}</b> kcal</td>
            <td style={{ whiteSpace: 'nowrap' }}><button className="sm" onClick={() => addFav(m)}>★</button> <button className="sm danger" onClick={() => remove(uid, 'meals', m.id)}>✕</button></td>
          </tr>))}</tbody></table>
        <details style={{ marginTop: 8 }}><summary>Add manually</summary>
          <div className="f2" style={{ marginBottom: 8 }}>
            <input placeholder="Name" value={manual.name} onChange={e => setManual({ ...manual, name: e.target.value })} />
            <input placeholder="Amount" value={manual.amount} onChange={e => setManual({ ...manual, amount: e.target.value })} />
          </div>
          <div className="f3" style={{ marginBottom: 8 }}>
            {['kcal', 'p', 'f', 'c'].map(k => <input key={k} inputMode="decimal" placeholder={{ kcal: 'kcal', p: 'Protein g', f: 'Fat g', c: 'Carbs g' }[k]} value={manual[k]} onChange={e => setManual({ ...manual, [k]: e.target.value })} />)}
          </div>
          <button onClick={addManual}>Add</button>
        </details>
      </div>

      {(settings.favorites.length > 0 || frequent.length > 0) && (
        <div className="card">
          {settings.favorites.length > 0 && <><h3 style={{ marginBottom: 8 }}>Favorites</h3>
            {settings.favorites.map(f => <span key={f.name} className="chip"><span onClick={() => quick(f)}>★ {f.name} · {f.amount || Math.round(f.kcal) + ' kcal'}</span><span onClick={() => window.confirm('Remove favorite "' + f.name + '"?') && saveSettings(uid, { favorites: settings.favorites.filter(x => x.name !== f.name) })} style={{ marginLeft: 10, padding: '0 4px', color: '#fca5a5' }}>✕</span></span>)}</>}
          {frequent.length > 0 && <><h3 style={{ margin: '8px 0' }}>Often eaten</h3>
            {frequent.map(f => <span key={f.name} className="chip" onClick={() => quick(f)}>+ {f.name} · {Math.round(f.kcal)}</span>)}</>}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Last 14 days</h3>
        <Bars days={last14} picked={date} onPick={setDate}
          trace={{ values: expTrace, color: '#22c55e', label: 'Est. expenditure' }}
          lines={[{ y: mode.p * 4, color: '#7dd3fc', label: `Protein target ${mode.p} g` }, { y: mode.kcalMax, color: '#ef4444', label: `Max ${mode.kcalMax} kcal` }]} />
        <div className="row" style={{ fontSize: 12, marginTop: 4 }}>
          {[['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']].map(([k, l]) => <span key={k} className="mute"><i style={{ display: 'inline-block', width: 10, height: 10, background: MACRO_COLORS[k], borderRadius: 2, marginRight: 4 }} />{l}</span>)}
          <span className="mute"><i style={{ display: 'inline-block', width: 14, height: 3, background: '#22c55e', marginRight: 4, verticalAlign: 'middle' }} />Est. expenditure (base + steps + exercise)</span>
          <span className="dim">Faded bars = daily totals imported from Fitbit · tap a day to open it</span>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Weekly summary</h3>
        {weekly.length === 0 ? <div className="dim">No complete days yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 420 }}><thead><tr><th>Week of</th><th>Days</th><th>kcal</th><th>Protein</th><th>In range</th><th>Protein ✓</th><th>vs burn</th></tr></thead><tbody>
              {(allWeeks ? weekly : weekly.slice(0, 8)).map(g => { const bal = (g.kcal - g.burn) / g.n; return (
                <tr key={g.wk}><td>{g.wk.slice(5)}</td><td>{g.n}</td><td><b>{Math.round(g.kcal / g.n)}</b></td><td>{Math.round(g.p / g.n)} g</td>
                  <td>{g.inRange}/{g.n}</td><td>{g.protOk}/{g.n}</td>
                  <td className={bal > 0 ? 'a' : 'g'}>{bal > 0 ? '+' : ''}{Math.round(bal)}</td></tr>); })}
            </tbody></table>
          </div>)}
        {weekly.length > 8 && <button className="sm" style={{ marginTop: 8 }} onClick={() => setAllWeeks(!allWeeks)}>{allWeeks ? 'Show last 8 weeks' : `Show all ${weekly.length} weeks`}</button>}
        <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>Averages per logged day (Mon–Sun weeks). In range = kcal inside that day's phase target; Protein ✓ = protein target reached; vs burn = average intake minus estimated expenditure per day. Today and days under 800 kcal (unfinished logging) are left out.</div>
      </div>
    </>
  );
}
