const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    actions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['add_meal', 'remove_meal', 'activity', 'measurement', 'add_favorite', 'remove_favorite'] },
          date: { type: 'STRING', nullable: true },
          name: { type: 'STRING', nullable: true },
          amount: { type: 'STRING', nullable: true },
          p: { type: 'NUMBER', nullable: true }, f: { type: 'NUMBER', nullable: true }, c: { type: 'NUMBER', nullable: true }, kcal: { type: 'NUMBER', nullable: true },
          kcalBurned: { type: 'NUMBER', nullable: true }, steps: { type: 'NUMBER', nullable: true },
          weight: { type: 'NUMBER', nullable: true }, waist: { type: 'NUMBER', nullable: true }, navel: { type: 'NUMBER', nullable: true },
        },
        required: ['type', 'name', 'amount', 'p', 'f', 'c', 'kcal'],
      },
    },
  },
  required: ['actions'],
};

export async function askGemini({ key, model, text, today, context, images = [], reference = '', deep = false }) {
  if (!key) throw new Error('No Gemini key yet. Add it in Settings.');
  const system = `You are the logging engine of a personal health app. Today is ${today}.
Turn the user's text into actions. Estimate nutrition realistically for the stated amounts (Swedish and English food names are both common).
- add_meal: ALWAYS fill name, amount (as written, e.g. "2 st" or "150 g"), protein p, fat f, carbs c (grams) AND kcal, all realistic and non-zero for real food. kcal must be about 4*p + 4*c + 9*f. Never return 0 kcal for food. One action per food item. Use date only if the user names a day other than today (YYYY-MM-DD).
- remove_meal: name must exactly match an entry from today's list given below.
- activity: kcalBurned (exercise calories) and/or steps for the date.
- measurement: weight (kg), waist (cm), navel (cm) when the user reports body measurements.
- add_favorite / remove_favorite: a reusable meal with its macros.
Photos may be attached: a recipe (ingredients and amounts, possibly a screenshot or book page), a food package or label, or a plate of food. Read them carefully. For a recipe, work out the nutrition of the WHOLE recipe from its ingredients and amounts, then apply what the user asks: a portion ("1/4 of this recipe", "2 portions") means scale the whole recipe accordingly and log it as ONE add_meal named after the dish with the portion as amount (e.g. "1/4 portion"). Substitutions ("low fat mayo instead", "skip the cheese") must change the ingredient values before scaling. If the recipe states servings and the user gives no portion, log one serving. If a label shows values per 100 g, scale to the amount given. Only split a dish into several items if the user asks.
Put a short friendly summary in "reply". Never invent actions the user did not ask for.
${reference ? `\nVERIFIED PRODUCT DATA (looked up online or from the user's saved products). For these products use EXACTLY these per-100 g values scaled to the stated amount; if the amount is in pieces/packets, use the piece or pack weight given:\n${reference}\n` : ''}${deep ? '\nTHE USER DESCRIBED SOMETHING IN DETAIL (extra words like "and", "with", "thin", "small", "half"). Do not just look up a typical value. Reason it through before answering: work out the likely ingredients and their weights for the described size/thickness/variant, apply every modifier (thin/small = less, extra/large = more), add up protein, fat and carbs, then derive kcal. Be realistic rather than generic.\n' : ''}Today's logged meals: ${context || 'none'}`;
  const call = thinking => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: text || 'Log what is in the attached photo(s).' }, ...images.map(i => ({ inlineData: { mimeType: i.mime, data: i.data } }))] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2, ...(thinking ? { thinkingConfig: { thinkingLevel: deep ? 'medium' : 'low' } } : {}) },
    }),
  });
  // Short thinking = much faster answers. If a model rejects the setting, retry without it.
  let res = await call(/gemini-3/.test(model));
  if (res.status === 400 && /gemini-3/.test(model)) res = await call(false);
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const out = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Gemini returned nothing. Try again.');
  const parsed = JSON.parse(out);
  (parsed.actions || []).forEach(a => {
    if (a.type === 'add_meal' || a.type === 'add_favorite') {
      ['p', 'f', 'c', 'kcal'].forEach(k => { if (a[k] == null) a[k] = 0; });
      if (!(a.kcal > 0) && (a.p || a.f || a.c)) a.kcal = Math.round(4 * a.p + 4 * a.c + 9 * a.f);
    }
  });
  return parsed;
}

// Reads body-part measurements (cm) from a screenshot, e.g. of the Renpho app.
export async function extractTape({ key, model, base64, mime }) {
  if (!key) throw new Error('No Gemini key yet. Add it in Settings.');
  const num = { type: 'NUMBER', nullable: true };
  const fields = ['waist', 'abdomen', 'hip', 'glutes', 'neck', 'shoulder', 'chest', 'bicepL', 'bicepR', 'thighL', 'thighR', 'calfL', 'calfR'];
  const schema = { type: 'OBJECT', properties: Object.fromEntries(fields.map(f => [f, num])) };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: 'Read the body measurements in centimetres from this screenshot. L-/R- are left/right. Use null for anything not shown. Do not guess.' },
        { inlineData: { mimeType: mime, data: base64 } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const out = (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Could not read the screenshot.');
  return JSON.parse(out);
}
