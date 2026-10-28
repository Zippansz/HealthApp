// Everything here is only a starting point. All of it can be edited in Settings.
export const DEFAULTS = {
  heightCm: 177,
  start: { weight: 81.8, navel: 98, waist: 94, bf: 27.9, whtr: 0.554 },
  goal: { weight: 75, navel: 85, waist: 84, bf: 17.5, whtr: 0.488 },
  baseTdee: 2200,
  modes: {
    cutting: { label: 'Cutting', p: 160, kcalMin: 1700, kcalMax: 1900, fMax: 90, cMax: 120 },
    maintenance: { label: 'Maintenance', p: 160, kcalMin: 2200, kcalMax: 2400, fMax: 100, cMax: 250 },
    bulking: { label: 'Bulking', p: 180, kcalMin: 2700, kcalMax: 3000, fMax: 110, cMax: 400 },
  },
  phases: [
    { name: 'Maintenance Reset', start: '2026-05-09', end: '2026-05-18', mode: 'maintenance', weight: 78, navel: 89.5, waist: 86, bf: 19.5 },
    { name: 'Summer Sprint', start: '2026-05-19', end: '2026-06-30', mode: 'cutting', weight: 75, navel: 86.5, waist: 84, bf: 17.5 },
    { name: 'Summer Maintenance', start: '2026-07-01', end: '2026-08-31', mode: 'maintenance', weight: 75, navel: 85, waist: 84, bf: 17 },
    { name: 'Clean Bulk', start: '2026-09-01', end: '2026-12-17', mode: 'bulking', weight: 75.5, navel: 86.5, waist: 84.5, bf: 17 },
    { name: 'Festive Bulk', start: '2026-12-18', end: '2027-01-10', mode: 'bulking', weight: 77.5, navel: 88.5, waist: 86, bf: 18 },
    { name: 'Final Polish', start: '2027-01-11', end: '2027-06-01', mode: 'cutting', weight: 73, navel: 84, waist: 82, bf: 15 },
  ],
  favorites: [],
  exerciseMap: {},
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
};
export const MODE_COLORS = { cutting: '#ef4444', maintenance: '#38bdf8', bulking: '#10b981' };
