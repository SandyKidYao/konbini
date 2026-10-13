// The date: season, day of the week, public holidays and festivals. The atmosphere keeps one `Day`;
// in live mode it is the place's real date, otherwise today on this device (or whatever ?date= says).
//
// The shop stands in Japan, so holidays and festivals follow the Japanese calendar. Seasons follow the
// place's hemisphere instead — live weather in Sydney in July is winter, and the sakura should agree.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_LABEL: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

/** Festival ids, as content checks them: `day.festivals.includes('tanabata')`. */
export type Festival = 'shogatsu' | 'setsubun' | 'hinamatsuri' | 'tanabata' | 'natsumatsuri' | 'obon' | 'tsukimi' | 'halloween' | 'christmas' | 'omisoka';
export const FESTIVAL_LABEL: Record<Festival, string> = {
  shogatsu: '正月', setsubun: '节分', hinamatsuri: '女儿节', tanabata: '七夕', natsumatsuri: '夏日祭', obon: '盂兰盆',
  tsukimi: '赏月', halloween: '万圣节', christmas: '圣诞', omisoka: '除夕',
};

export interface Day {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  date: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** 0 = 1 January */
  dayOfYear: number;
  /**
   * Day of the year as the seasons see it: the same as dayOfYear in the northern hemisphere,
   * shifted by half a year in the southern one. Use this (not month) for anything that grows or falls.
   */
  seasonDay: number;
  season: Season;
  /** a public holiday's name (Japanese calendar), if today is one */
  holiday: string | null;
  /** weekend or public holiday */
  dayOff: boolean;
  /** festivals and seasonal occasions running today (the shop decorates for them) */
  festivals: Festival[];
}

/** Ordinal of a calendar date (0 = 1 January), ignoring leap years so dates keep fixed numbers. */
export const ordinal = (month: number, date: number) => CUMULATIVE[month - 1] + date - 1;
const CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Is `day` (an ordinal) between two "M-D" dates, inclusive? Wraps around the new year. */
export function between(day: number, from: string, to: string) {
  const [a, b] = [from, to].map((s) => { const [m, d] = s.split('-').map(Number); return ordinal(m, d); });
  return a <= b ? day >= a && day <= b : day >= a || day <= b;
}

const nthMonday = (year: number, month: number, n: number) => {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
};
// equinoxes, good for 1980–2099
const vernal = (y: number) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnal = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

function japaneseHoliday(y: number, m: number, d: number): string | null {
  const fixed: Record<string, string> = {
    '1-1': '元日', '2-11': '建国記念の日', '2-23': '天皇誕生日', '4-29': '昭和の日', '5-3': '憲法記念日',
    '5-4': 'みどりの日', '5-5': 'こどもの日', '8-11': '山の日', '11-3': '文化の日', '11-23': '勤労感謝の日',
  };
  const key = `${m}-${d}`;
  if (fixed[key]) return fixed[key];
  if (m === 1 && d === nthMonday(y, 1, 2)) return '成人の日';
  if (m === 7 && d === nthMonday(y, 7, 3)) return '海の日';
  if (m === 9 && d === nthMonday(y, 9, 3)) return '敬老の日';
  if (m === 10 && d === nthMonday(y, 10, 2)) return 'スポーツの日';
  if (m === 3 && d === vernal(y)) return '春分の日';
  if (m === 9 && d === autumnal(y)) return '秋分の日';
  // a holiday falling on Sunday moves to Monday
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1) {
    const prev = new Date(Date.UTC(y, m - 1, d - 1));
    if (japaneseHoliday(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate())) return '振替休日';
  }
  return null;
}

function festivalsOn(m: number, d: number): Festival[] {
  const day = ordinal(m, d);
  const out: Festival[] = [];
  if (between(day, '12-28', '1-7')) out.push('shogatsu');
  if (between(day, '1-25', '2-3')) out.push('setsubun');
  if (between(day, '2-20', '3-3')) out.push('hinamatsuri');
  if (between(day, '6-25', '7-7')) out.push('tanabata');
  if (between(day, '7-15', '8-31')) out.push('natsumatsuri');
  if (between(day, '8-13', '8-16')) out.push('obon');
  if (between(day, '9-10', '9-30')) out.push('tsukimi');
  if (between(day, '10-10', '10-31')) out.push('halloween');
  if (between(day, '11-25', '12-25')) out.push('christmas');
  if (m === 12 && d === 31) out.push('omisoka');
  return out;
}

export function seasonOf(seasonDay: number): Season {
  // meteorological seasons: spring Mar–May, summer Jun–Aug, autumn Sep–Nov, winter Dec–Feb
  if (seasonDay >= ordinal(3, 1) && seasonDay < ordinal(6, 1)) return 'spring';
  if (seasonDay >= ordinal(6, 1) && seasonDay < ordinal(9, 1)) return 'summer';
  if (seasonDay >= ordinal(9, 1) && seasonDay < ordinal(12, 1)) return 'autumn';
  return 'winter';
}

/** Everything about a calendar date. `southern` flips the seasons. */
export function describeDay(year: number, month: number, date: number, southern = false): Day {
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  const dayOfYear = ordinal(month, date);
  const seasonDay = southern ? (dayOfYear + 182) % 365 : dayOfYear;
  const holiday = japaneseHoliday(year, month, date);
  return {
    year, month, date, weekday, dayOfYear, seasonDay,
    season: seasonOf(seasonDay),
    holiday,
    dayOff: weekday === 0 || weekday === 6 || !!holiday,
    festivals: festivalsOn(month, date),
  };
}

/** A typical date for each season, for previews (?season=autumn). */
export const SEASON_SAMPLE: Record<Season, [number, number]> = { spring: [4, 3], summer: [8, 6], autumn: [11, 12], winter: [1, 21] };

/** Parse "2026-07-07", "07-07" or "0707" into [year?, month, date]. */
export function parseDate(s: string): [number | null, number, number] | null {
  const m = s.trim().match(/^(?:(\d{4})-?)?(\d{1,2})-?(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]), date = Number(m[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  return [m[1] ? Number(m[1]) : null, month, date];
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
/** "10月13日 周二" */
export const formatDay = (d: Day) => `${d.month}月${d.date}日 周${WEEKDAY[d.weekday]}`;

/**
 * Approximate sunrise and sunset (local clock hours) for a day of the year — by default for Tokyo,
 * where the shop stands. Good to a few minutes, which is all the sky needs.
 */
export function sunTimes(dayOfYear: number, lat = 35.7, lon = 139.7, utcOffsetHours = 9): [number, number] {
  const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear + 1)) / 365);
  const phi = lat * Math.PI / 180;
  const cosW = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)));
  const half = (Math.acos(cosW) * 180 / Math.PI) / 15;
  const noon = 12 + utcOffsetHours - lon / 15;
  return [noon - half, noon + half];
}
