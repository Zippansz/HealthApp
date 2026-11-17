import { put } from './db';
import { MUSCLE_ORDER } from './muscles';

const MUSCLES = MUSCLE_ORDER.filter(m => m !== 'Other');
export const exId = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'exercise';

// Asks Gemini which muscles unknown exercises train, once, and saves the answer so it is never asked again.
export async function classifyExercises({ uid, key, model, names }) {
  if (!key || !names.length) return 0;
  const schema = { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
    name: { type: 'STRING' }, primary: { type: 'STRING', enum: MUSCLES }, secondary: { type: 'ARRAY', items: { type: 'STRING', enum: MUSCLES } } },
    required: ['name', 'primary', 'secondary'] } } }, required: ['items'] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = think => JSON.stringify({
    systemInstruction: { parts: [{ text: `For each gym exercise (names as in the Hevy app) give the ONE primary muscle group and 0-2 secondary muscle groups, using only the allowed values. Primary = the muscle the exercise mainly trains; secondary = clearly involved helpers (e.g. bench press: primary Chest, secondary Triceps and Shoulders). Return every input name exactly as written.` }] },
    contents: [{ role: 'user', parts: [{ text: names.join('\n') }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, ...(think ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) } });
  const call = think => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: body(think) });
  let res = await call(/gemini-3/.test(model));
  if (res.status === 400 && /gemini-3/.test(model)) res = await call(false);
  if (!res.ok) return 0;
  const j = await res.json();
  let items = [];
  try { items = JSON.parse((j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')).items || []; } catch { return 0; }
  const ok = new Set(names); let n = 0;
  await Promise.all(items.filter(x => ok.has(x.name) && MUSCLES.includes(x.primary)).map(x => {
    n++; return put(uid, 'exercises', exId(x.name), { name: x.name, primary: x.primary, secondary: (x.secondary || []).filter(m => MUSCLES.includes(m) && m !== x.primary).slice(0, 2), source: 'ai', ts: Date.now() });
  }));
  return n;
}
