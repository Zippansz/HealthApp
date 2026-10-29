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
          date: { type: 'STRING' },
          name: { type: 'STRING' },
          amount: { type: 'STRING' },
          p: { type: 'NUMBER' }, f: { type: 'NUMBER' }, c: { type: 'NUMBER' }, kcal: { type: 'NUMBER' },
          kcalBurned: { type: 'NUMBER' }, steps: { type: 'NUMBER' },
          weight: { type: 'NUMBER' }, waist: { type: 'NUMBER' }, navel: { type: 'NUMBER' },
        },
        required: ['type'],
      },
    },
  },
  required: ['actions'],
};

export async function askGemini({ key, model, text, today, context }) {
  if (!key) throw new Error('No Gemini key yet. Add it in Settings.');
  const system = `You are the logging engine of a personal health app. Today is ${today}.
Turn the user's text into actions. Estimate nutrition realistically for the stated amounts (Swedish and English food names are both common).
- add_meal: name, amount (as written, e.g. "2 st" or "150 g"), p/f/c in grams and kcal. Use date only if the user names a day other than today (YYYY-MM-DD).
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
  return JSON.parse(out);
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
