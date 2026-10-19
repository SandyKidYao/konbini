// One size for the scene, from a stamp-sized pixel map up to the whole model: the settings' size slider. The low end
// is the map form, the rest the model; dragging past the boundary changes the form (see morph.ts). Each form keeps
// its own last size, so the plan button and the view presets go back to it.
//
// The same slider on the web and on the desk, read differently:
//   map    the tile's width (px), as on the desk: 120 up to what the page allows (web) or 220 (desk)
//   model  on the web the camera's zoom, so the smallest model is about as wide as the largest map; on the desk the
//          window's size, from about the largest map up to the old 大 (760 px)

export type Form = 'model' | 'plan';

/** the slider's steps: 0…PLAN_TOP is the map (largest at PLAN_TOP), PLAN_TOP + 1…SIZE_MAX the model */
export const SIZE_MAX = 100;
export const PLAN_TOP = 39;
const MODEL_LOW = PLAN_TOP + 1;

export const formOf = (v: number): Form => (v <= PLAN_TOP ? 'plan' : 'model');

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** where a size sits within its own form's range: 0 smallest, 1 largest */
export const share = (v: number) => (v <= PLAN_TOP ? clamp01(v / PLAN_TOP) : clamp01((v - MODEL_LOW) / (SIZE_MAX - MODEL_LOW)));
/** a step of the slider changes the size by the same ratio anywhere along it */
const geo = (lo: number, hi: number, t: number) => lo * (hi / lo) ** t;
const geoInv = (lo: number, hi: number, x: number) => clamp01(Math.log(x / lo) / Math.log(hi / lo));
const fromShare = (form: Form, t: number) => Math.round(form === 'plan' ? t * PLAN_TOP : MODEL_LOW + t * (SIZE_MAX - MODEL_LOW));

// ---------------------------------------------------------------- the map
export const TILE_MIN = 120;
/** the desk's largest map: the old 大 */
export const PET_TILE_MAX = 220;
/** the web's largest map: as large as the page allows, and not too big (a few dozen pixels across turn into blocks) */
export const webTileMax = (aspect: number) => Math.max(TILE_MIN, Math.min(392, innerWidth * 0.84, (innerHeight - 150) * aspect));
export const tileWidth = (v: number, max: number) => geo(TILE_MIN, max, share(v));

// ---------------------------------------------------------------- the model on the desk: the window's size
/** the model's window keeps the shape of the old sizes (400×330, 560×460, 760×625) */
export const PET_ASPECT = 1.216;
/** about the largest map once the soft edge is taken off; the old 大 */
const BOX_MIN = 260, BOX_MAX = 760;
export const petBox = (v: number): [number, number] => {
  const w = Math.round(geo(BOX_MIN, BOX_MAX, share(v)));
  return [w, Math.round(w / PET_ASPECT)];
};

// ---------------------------------------------------------------- the model on the web: the camera's zoom
export const modelZoom = (v: number, min: number) => geo(min, 1, share(v));

// ---------------------------------------------------------------- where the sizes come from
/** the current size, and the last one in each form */
export interface Sizes { value: number; model: number; plan: number }

const KEY = 'konbini.size';
/** the desk's old sizes (pet.json's `size` before the slider): 小 / 中 / 大 in each form */
const LEGACY = { small: [400, TILE_MIN], medium: [560, 160], large: [BOX_MAX, PET_TILE_MAX] } as const;

/**
 * Sizes at start: the current one from ?size= (a step, or the desk's old small / medium / large), in the form ?view=
 * asks for; the other form's from the last visit (this browser's storage), or its default. The model starts at its
 * largest on the web, at the old 中 on the desk; the map at its largest.
 */
export function readSizes(q: URLSearchParams, pet: boolean): Sizes {
  const plan = q.get('view') === 'plan';
  const s: Sizes = { value: 0, model: pet ? fromShare('model', geoInv(BOX_MIN, BOX_MAX, LEGACY.medium[0])) : SIZE_MAX, plan: PLAN_TOP };
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Sizes>;
    if (Number.isFinite(kept.model) && formOf(kept.model!) === 'model') s.model = kept.model!;
    if (Number.isFinite(kept.plan) && formOf(kept.plan!) === 'plan') s.plan = kept.plan!;
  } catch { /* storage unavailable */ }
  const p = q.get('size') ?? '';
  const n = Number(p);
  if (Object.hasOwn(LEGACY, p)) {
    const [box, tile] = LEGACY[p as keyof typeof LEGACY];
    if (plan) s.plan = fromShare('plan', geoInv(TILE_MIN, PET_TILE_MAX, tile));
    else s.model = fromShare('model', geoInv(BOX_MIN, BOX_MAX, box));
  } else if (p && Number.isInteger(n) && n >= 0 && n <= SIZE_MAX && (formOf(n) === 'plan') === plan) {
    s[formOf(n)] = n;
  }
  s.value = plan ? s.plan : s.model;
  return s;
}

/** Remember each form's last size, so the other form comes back as it was left. */
export function keepSizes(s: Sizes) {
  try { localStorage.setItem(KEY, JSON.stringify({ model: s.model, plan: s.plan })); } catch { /* storage unavailable */ }
}
