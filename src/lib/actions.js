import { put, remove, saveSettings } from './db';
import { todayStr } from './calc';

const r1 = v => (v == null ? null : Math.round(v * 10) / 10);

export const describe = a => {
  const d = a.date && a.date !== todayStr() ? ` (${a.date})` : '';
  switch (a.type) {
    case 'add_meal': return `Add meal: ${a.name}${a.amount ? ' – ' + a.amount : ''}${d} · ${Math.round(a.kcal || 0)} kcal · P${r1(a.p) ?? 0} F${r1(a.f) ?? 0} C${r1(a.c) ?? 0}`;
    case 'remove_meal': return `Remove meal: ${a.name}`;
    case 'activity': return `Activity${d}: ${a.kcalBurned ? a.kcalBurned + ' kcal burned' : ''} ${a.steps ? a.steps + ' steps' : ''}`;
    case 'measurement': return `Measurement${d}: ${[a.weight && a.weight + ' kg', a.waist && 'waist ' + a.waist, a.navel && 'navel ' + a.navel].filter(Boolean).join(', ')}`;
    case 'add_favorite': return `Save favorite: ${a.name} · ${Math.round(a.kcal || 0)} kcal`;
    case 'remove_favorite': return `Remove favorite: ${a.name}`;
    default: return JSON.stringify(a);
  }
};

// Applies a confirmed list of actions. Used by both the Gemini box and the "paste from Claude" box.
export async function applyActions(uid, actions, { settings, todayMeals }) {
  let favs = [...(settings.favorites || [])];
  let favsChanged = false;
  for (const a of actions) {
    const date = a.date || todayStr();
    if (a.type === 'add_meal') {
      await put(uid, 'meals', crypto.randomUUID(), { date, ts: Date.now(), name: a.name, amount: a.amount || '', p: a.p || 0, f: a.f || 0, c: a.c || 0, kcal: a.kcal || 0 });
    } else if (a.type === 'remove_meal') {
      const hit = [...todayMeals].reverse().find(m => m.name.toLowerCase() === (a.name || '').toLowerCase());
      if (hit) await remove(uid, 'meals', hit.id);
    } else if (a.type === 'activity') {
      const patch = { date };
      if (a.kcalBurned != null) patch.kcal = a.kcalBurned;
      if (a.steps != null) patch.steps = a.steps;
      await put(uid, 'activity', date, patch);
    } else if (a.type === 'measurement') {
      const patch = { date };
      ['weight', 'waist', 'navel'].forEach(k => { if (a[k] != null) patch[k] = a[k]; });
      await put(uid, 'measurements', date, patch);
    } else if (a.type === 'add_favorite') {
      favs = favs.filter(f => f.name.toLowerCase() !== a.name.toLowerCase());
      favs.push({ name: a.name, amount: a.amount || '', p: a.p || 0, f: a.f || 0, c: a.c || 0, kcal: a.kcal || 0 }); favsChanged = true;
    } else if (a.type === 'remove_favorite') {
      favs = favs.filter(f => f.name.toLowerCase() !== (a.name || '').toLowerCase()); favsChanged = true;
    }
  }
  if (favsChanged) await saveSettings(uid, { favorites: favs });
}
