import React, { useMemo, useState } from 'react';
import { useCollection, put, remove, saveSettings } from '../lib/db';
import { todayStr, addDays, num, phaseFor } from '../lib/calc';
import { askGemini } from '../lib/gemini';
import { applyActions, describe } from '../lib/actions';

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
  const since = date < addDays(todayStr(), -60) ? date : addDays(todayStr(), -60);
  const meals = useCollection(uid, 'meals', { since });
  const acts = useCollection(uid, 'activity', { since });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // {reply, actions}
  const [err, setErr] = useState('');
  const [manual, setManual] = useState({ name: '', amount: '', kcal: '', p: '', f: '', c: '' });
  const phase = phaseFor(settings.phases, date);
  const [modeKey, setModeKey] = useState('');
  const mode = settings.modes[modeKey || phase?.mode] || settings.modes.maintenance;

  const dayMeals = useMemo(() => meals.filter(m => m.date === date).sort((a, b) => (a.ts || 0) - (b.ts || 0)), [meals, date]);
  const act = acts.find(a => a.id === date) || {};
  const tot = dayMeals.reduce((t, m) => ({ p: t.p + (m.p || 0), f: t.f + (m.f || 0), c: t.c + (m.c || 0), kcal: t.kcal + (m.kcal || 0) }), { p: 0, f: 0, c: 0, kcal: 0 });
  const burn = settings.baseTdee + (act.kcal || 0);
  const balance = tot.kcal - burn;

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
      if (t.startsWith('{') || t.startsWith('[')) { // pasted from a Claude chat
        const j = JSON.parse(t);
        const actions = Array.isArray(j) ? j : j.actions;
        if (!Array.isArray(actions)) throw new Error('JSON needs an "actions" list.');
        setPending({ reply: j.reply || 'Imported from pasted JSON.', actions });
      } else {
        const r = await askGemini({ key: settings.geminiKey, model: settings.geminiModel, text: t, today: date, context: dayMeals.map(m => m.name).join(', ') });
        setPending({ reply: r.reply, actions: (r.actions || []).map(a => ({ ...a, date: a.date || date })) });
      }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const confirm = async () => {
    await applyActions(uid, pending.actions, ctx);
    setPending(null); setText('');
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
          <span>Burn ≈ {Math.round(burn)} kcal ({settings.baseTdee} base{act.kcal ? ` + ${act.kcal} exercise` : ''}){act.steps ? ` · ${act.steps} steps` : ''}</span>
          <b className={balance > 0 ? 'a' : 'g'}>{balance > 0 ? '+' : ''}{Math.round(balance)} kcal</b>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Log with AI</h3>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'e.g. "2 eggs, 2 slices rye bread with cheese and a coffee with milk"\nor "ran 5k, burned 400 kcal"\nYou can also paste JSON that Claude gave you.'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="pri" onClick={run} disabled={busy || !text.trim()}>{busy ? 'Thinking…' : 'Analyze'}</button>
          {!settings.geminiKey && <span className="a" style={{ fontSize: 13 }}>Add your Gemini key in Settings first.</span>}
        </div>
        {err && <div className="msg r">{err}</div>}
        {pending && (
          <div className="msg">
            <div className="mute" style={{ marginBottom: 6 }}>{pending.reply}</div>
            {pending.actions.length === 0 && <div className="dim">Nothing to save.</div>}
            {pending.actions.map((a, i) => <div key={i}>• {describe(a)}</div>)}
            <div className="row" style={{ marginTop: 8 }}>
              <button className="ok" onClick={confirm} disabled={!pending.actions.length}>Save</button>
              <button onClick={() => setPending(null)}>Discard</button>
            </div>
          </div>
        )}
      </div>

      {(settings.favorites.length > 0 || frequent.length > 0) && (
        <div className="card">
          {settings.favorites.length > 0 && <><h3 style={{ marginBottom: 8 }}>Favorites</h3>
            {settings.favorites.map(f => <span key={f.name} className="chip" onClick={() => quick(f)}>★ {f.name} · {Math.round(f.kcal)}</span>)}</>}
          {frequent.length > 0 && <><h3 style={{ margin: '8px 0' }}>Often eaten</h3>
            {frequent.map(f => <span key={f.name} className="chip" onClick={() => quick(f)}>+ {f.name} · {Math.round(f.kcal)}</span>)}</>}
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Meals · {date}</h3>
        {dayMeals.length === 0 && <div className="dim">Nothing logged.</div>}
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

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Activity · {date}</h3>
        <div className="f2">
          <input inputMode="numeric" placeholder="Exercise kcal" defaultValue={act.kcal ?? ''} key={date + 'k' + act.kcal} onBlur={e => num(e.target.value) != null && put(uid, 'activity', date, { date, kcal: num(e.target.value) })} />
          <input inputMode="numeric" placeholder="Steps" defaultValue={act.steps ?? ''} key={date + 's' + act.steps} onBlur={e => num(e.target.value) != null && put(uid, 'activity', date, { date, steps: num(e.target.value) })} />
        </div>
      </div>
    </>
  );
}
