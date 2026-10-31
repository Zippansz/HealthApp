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

export async function askGemini({ key, model, text, today, context }) {
  if (!key) throw new Error('No Gemini key yet. Add it in Settings.');
  const system = `You are the logging engine of a personal health app. Today is ${today}.
Turn the user's text into actions. Estimate nutrition realistically for the stated amounts (Swedish and English food names are both common).
- add_meal: ALWAYS fill name, amount (as written, e.g. "2 st" or "150 g"), protein p, fat f, carbs c (grams) AND kcal, all realistic and non-zero for real food. kcal must be about 4*p + 4*c + 9*f. Never return 0 kcal for food. One action per food item. Use date only if the user names a day other than today (YYYY-MM-DD).
- remove_meal: name must exactly match an entry from today's list given below.
- activity: kcalBurned (exercise calories) and/or steps for the date.
- measurement: weight (kg), waist (cm), navel (cm) when the user reports body measurements.
- add_favorite / remove_favorite: a reusable meal with its macros.
Put a short friendly summary in "reply". Never invent actions the user did not ask for.
Today's logged meals: ${context || 'none'}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
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
  const fields = ['waist', 'abdomen', 'hip', 'neck', 'shoulder', 'chest', 'bicepL', 'bicepR', 'thighL', 'thighR', 'calfL', 'calfR'];
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
