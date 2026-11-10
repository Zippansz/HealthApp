import { put } from './db';

// ---- Product cache: brand products looked up online once, then reused without any AI/web call. ----
const STOP = new Set(['a', 'an', 'the', 'of', 'with', 'and', 'or', 'from', 'st', 'g', 'kg', 'ml', 'dl', 'cl', 'l', 'gram', 'grams', 'pack', 'packet', 'package', 'bit', 'piece', 'pieces', 'och', 'med', 'av', 'från', 'en', 'ett', 'paket', 'förp', 'burk', 'x']);
export const tokens = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, c => c).replace(/[^a-z0-9åäöé%.\s-]/g, ' ')
  .split(/\s+/).map(t => t.replace(/^[-.]+|[-.]+$/g, '')).filter(t => t && !STOP.has(t) && !/^\d+([.,]\d+)?(g|kg|ml|dl|cl|l|st)?$/.test(t));
const slug = toks => [...new Set(toks)].sort().join('-').slice(0, 120);

const stem = t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);
// Items are separated by commas, dots and line breaks only (not "and"/"och": those mean the user is describing something).
const segments = text => (text || '').split(/\n|,(?!\d)|\.(?:\s|$)/).map(x => x.trim()).filter(Boolean);
// A described item ("and", "with", "thin", "small"…) is not a simple lookup: the AI should work it out.
const COMPLEX = /\b(and|och|with|w\/|med|plus|without|utan|instead|istället|thin|thick|small|large|big|medium|tiny|little|half|extra|liten|litet|lilla|små|stor|stora|tunn|tunna|tjock|tjocka|halv|halva|ca|about|approx|roughly)\b|\+/i;
export const isComplex = seg => COMPLEX.test(seg);
export const needsReasoning = text => segments(text).some(isComplex);

// Brand products match when every word of the key appears in the text. Plain foods (type 'generic')
// must match a whole item of the text (so "rice" does not match "rice cakes").
export function findCached(products, text) {
  const simple = segments(text).filter(x => !isComplex(x));
  const raw = simple.map(x => new Set(tokens(x)));
  const segs = simple.map(x => new Set(tokens(x).map(stem)));
  const hit = products.filter(p => {
    if (!(p.keyTokens?.length)) return false;
    if (p.type === 'generic') return segs.some(sg => sg.size === p.keyTokens.length && p.keyTokens.every(t => sg.has(stem(t))));
    return p.keyTokens.length >= 2 && raw.some(have => p.keyTokens.every(t => have.has(t)));
  });
  return hit.sort((a, b) => b.keyTokens.length - a.keyTokens.length);
}

// True when every item in the text is already in the cache (then no extra AI call is needed to find products).
export function allCovered(products, text) {
  const segs = segments(text).filter(x => tokens(x).length);
  return segs.length > 0 && segs.every(x => findCached(products, x).length > 0);
}

// After the AI has logged plain foods, remember their values per 100 g (or per piece) for next time.
export async function learnFromActions(uid, actions, products) {
  const have = new Set(products.map(p => p.key));
  const jobs = [];
  for (const a of actions) {
    if (a.type !== 'add_meal' || !(a.kcal > 0)) continue;
    const toks = [...new Set(tokens(a.name).map(stem))];
    if (!toks.length || toks.length > 4) continue;
    const key = 'g-' + slug(toks); if (have.has(key)) continue;
    const base = { key, type: 'generic', keyTokens: toks, name: a.name, source: '', learned: true, ts: Date.now() };
    const g = /(\d+(?:[.,]\d+)?)\s*(kg|g|gram|ml|dl|cl|l)\b/i.exec(a.amount || '');
    const q = /^\s*(\d+(?:[.,]\d+)?)\s*(st|stycken|pcs|x)?\s*$/i.exec(a.amount || '');
    let doc = null;
    if (g) {
      const mult = { kg: 1000, g: 1, gram: 1, ml: 1, dl: 100, cl: 10, l: 1000 }[g[2].toLowerCase()];
      const grams = parseFloat(g[1].replace(',', '.')) * mult;
      if (grams >= 10) doc = { ...base, per100: { kcal: a.kcal / grams * 100, p: a.p / grams * 100, f: a.f / grams * 100, c: a.c / grams * 100 } };
    } else if (q && parseFloat(q[1]) > 0 && parseFloat(q[1]) <= 20) {
      const n = parseFloat(q[1].replace(',', '.'));
      doc = { ...base, perPiece: { kcal: a.kcal / n, p: a.p / n, f: a.f / n, c: a.c / n } };
    }
    if (!doc) continue;
    const r1 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 10) / 10]));
    if (doc.per100) doc.per100 = r1(doc.per100); if (doc.perPiece) doc.perPiece = r1(doc.perPiece);
    have.add(key); jobs.push(put(uid, 'products', key, doc).catch(() => {}));
  }
  await Promise.all(jobs);
}

async function gem({ key, model, body, signal, level = 'low' }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const call = thinking => fetch(url, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ ...body, generationConfig: { ...(body.generationConfig || {}), ...(thinking ? { thinkingConfig: { thinkingLevel: level } } : {}) } }),
  });
  let res = await call(/gemini-3/.test(model));
  if (res.status === 400 && /gemini-3/.test(model)) res = await call(false);
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  return res.json();
}
const textOf = j => (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');

// Step 1: which items in the text name a specific brand/product?
async function brandedItems({ key, model, text, country }) {
  const schema = { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { brand: { type: 'STRING' }, product: { type: 'STRING' } }, required: ['brand', 'product'] } } }, required: ['items'] };
  const j = await gem({ key, model, body: {
    systemInstruction: { parts: [{ text: `The user lives in ${country}. From the food log text, list every item that names a specific brand, store or restaurant product (e.g. Arla, Salakis, Sibylla, Nongshim, Korvbrödsbagaren). "product" = the product name WITHOUT amounts, keeping variant words such as fat %, flavour, "mini", "low fat". Ignore generic foods with no brand. Return {"items":[]} if none.` }] },
    contents: [{ role: 'user', parts: [{ text }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 } } });
  try { return JSON.parse(textOf(j)).items || []; } catch { return []; }
}

// Step 2: look the product up on the web (Google Search grounding), per 100 g/ml.
async function webLookup({ key, model, brand, product, original, country }) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const q = `${brand} ${product}`.trim();
    const j = await gem({ key, model, signal: ctl.signal, level: 'high', body: {
      tools: [{ google_search: {} }],
      contents: [{ role: 'user', parts: [{ text: `A user of a food-logging app, living in ${country}, wrote: "${original}". They mean the product "${brand} ${product}", but their wording may be imprecise or partly wrong (wrong fat %, translated or shortened names, English instead of Swedish, e.g. "low fat" for a product sold as "0% fett" or "light").
Work out which real product they most likely mean: search the web for the ${country} version of the product (${country === 'Sweden' ? 'manufacturer pages and Swedish retailers such as arla.se, willys.se, ica.se, coop.se, mathem.se, or Open Food Facts' : `${country} retailers, the manufacturer's ${country} site, or Open Food Facts`}). The same brand often has different recipes and numbers in other countries, so never use a US/UK/foreign page for it, list the variants of that brand that exist, compare them with every clue in the user's wording (fat %, flavour, size, "mini", etc.) and pick the single most probable match. Do not simply pick the first hit and do not default to the lowest or highest fat version: pick the one that best fits ALL the clues. Then read its exact nutrition facts per 100 g (or per 100 ml for drinks), from the page itself.
Reply with ONLY one JSON object, no other text: {"name":"full exact product name incl. fat %","brand":"brand","kcal":number,"protein":number,"fat":number,"carbs":number,"pack_g":number or null,"piece_g":number or null,"source":"url of the page used","why":"one short sentence: why this variant","alternatives":["other plausible variants"],"found":true or false}. Set found=false only if no real product fits.` }] }],
      generationConfig: { temperature: 0 } } });
    const m = /\{[\s\S]*\}/.exec(textOf(j)); if (!m) return null;
    const o = JSON.parse(m[0]);
    const web = j.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(c => c.web?.uri).filter(Boolean) || [];
    const n = v => (typeof v === 'number' && isFinite(v) ? v : null);
    const r = { kcal: n(o.kcal), p: n(o.protein), f: n(o.fat), c: n(o.carbs) };
    if (o.found === false || Object.values(r).some(v => v == null)) return null;
    // sanity: kcal should roughly match the macros, and be a believable food
    if (r.kcal < 5 || r.kcal > 900 || Math.abs(r.kcal - (4 * r.p + 4 * r.c + 9 * r.f)) > 0.2 * r.kcal + 12) return null;
    return { name: o.name || q, brand, per100: r, pack: n(o.pack_g), piece: n(o.piece_g), source: o.source || web[0] || '', why: typeof o.why === 'string' ? o.why : '' };
  } catch { return null; } finally { clearTimeout(timer); }
}

// Fallback: Open Food Facts (free product database, has many Swedish products).
async function offLookup({ brand, product, country }) {
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12000);
    const base = `https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=15&fields=product_name,brands,nutriments,code&search_terms=${encodeURIComponent(`${brand} ${product}`)}`;
    const only = `&tagtype_0=countries&tag_contains_0=contains&tag_0=${encodeURIComponent((country || 'sweden').toLowerCase())}`;
    let res = await fetch(base + only, { signal: ctl.signal });
    if (res.ok) { const j = await res.clone().json(); if (!(j.products || []).length) res = await fetch(base, { signal: ctl.signal }); }
    clearTimeout(timer);
    if (!res.ok) return null;
    const want = tokens(product).map(stem), b = tokens(brand).map(stem);
    const fat = /(\d+(?:[.,]\d+)?)\s*%/.exec(product);
    const score = x => { const have = new Set(tokens(`${x.product_name || ''} ${x.brands || ''}`).map(stem)); return want.filter(t => have.has(t)).length / (want.length || 1) + (fat && have.has(fat[1].replace(',', '.') + '%') ? 0.5 : 0); };
    const ok = ((await res.json()).products || []).filter(x => b.every(t => tokens(x.brands || '').map(stem).includes(t)) && x.nutriments?.['energy-kcal_100g'] > 0 && x.nutriments.proteins_100g != null)
      .sort((x, y) => score(y) - score(x));
    const x = ok[0]; if (!x || score(x) < 0.5) return null;
    const n = x.nutriments, r = { kcal: n['energy-kcal_100g'], p: n.proteins_100g, f: n.fat_100g ?? 0, c: n.carbohydrates_100g ?? 0 };
    if (Math.abs(r.kcal - (4 * r.p + 4 * r.c + 9 * r.f)) > 0.2 * r.kcal + 12) return null;
    return { name: x.product_name || `${brand} ${product}`, brand, per100: r, pack: null, piece: null, source: `https://world.openfoodfacts.org/product/${x.code}` };
  } catch { return null; }
}

// Finds reference values for every branded item in the text: cache first, web second.
export async function resolveProducts({ uid, key, model, text, products, enabled = true, country = 'Sweden' }) {
  if (!enabled || !text?.trim()) return { ref: '', used: [] };
  const used = [], refs = new Map(), failed = [];
  const add = (p, cached) => { if (!refs.has(p.id || p.key)) { refs.set(p.id || p.key, p); used.push({ name: p.name, cached, per100: p.per100 || null }); } };
  findCached(products, text).forEach(p => add(p, true));
  let items = [];
  if (allCovered(products, text)) return { ref: fmtRefs([...refs.values()]), used };
  try { items = await brandedItems({ key, model, text, country }); } catch { return { ref: fmtRefs([...refs.values()]), used }; }
  const todo = items.filter(it => {
    const toks = tokens(`${it.brand} ${it.product}`);
    return toks.length && !products.some(p => p.keyTokens?.length && p.keyTokens.every(t => toks.includes(t)) && refs.has(p.id));
  });
  await Promise.all(todo.map(async it => {
    const hit = (await webLookup({ key, model, brand: it.brand, product: it.product, original: text, country })) || (await offLookup({ brand: it.brand, product: it.product, country }));
    if (!hit) { failed.push(`${it.brand} ${it.product}`.trim()); return; }
    const keyTokens = [...new Set(tokens(`${it.brand} ${it.product}`))];
    const doc = { key: slug(keyTokens), keyTokens, name: hit.name, brand: hit.brand || it.brand, per100: hit.per100, pack: hit.pack, piece: hit.piece, source: hit.source, why: hit.why || '', ts: Date.now() };
    try { await put(uid, 'products', doc.key, doc); } catch { /* cache is best-effort */ }
    add({ ...doc, id: doc.key }, false); used.at(-1).why = hit.why || '';
  }));
  return { ref: fmtRefs([...refs.values()]), used, failed };
}

const fmtRefs = list => list.map(p => `- ${p.name}: ${p.per100 ? `per 100 g: ${Math.round(p.per100.kcal)} kcal, P ${p.per100.p}, F ${p.per100.f}, C ${p.per100.c}` : ''}${p.perPiece ? `per 1 piece: ${Math.round(p.perPiece.kcal)} kcal, P ${p.perPiece.p}, F ${p.perPiece.f}, C ${p.perPiece.c}` : ''}${p.pack ? `; whole pack ${p.pack} g` : ''}${p.piece ? `; one piece ${p.piece} g` : ''}`).join('\n');
