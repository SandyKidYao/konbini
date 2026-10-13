// The date picker: a button in the dock opens a small card with the seasons and festivals one click away,
// and a month calendar (Sundays and holidays in red, festival days dotted) for any other day.
import type { Atmosphere } from '../engine/atmosphere';
import { describeDay, formatDay, FESTIVAL_LABEL, SEASON_LABEL, SEASON_SAMPLE, SEASONS, type Day, type Festival } from '../engine/calendar';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Festival shortcuts: a day inside each, and a time when the evening is the point. */
const JUMPS: { id: Festival; month: number; date: number; hour?: number; note?: string }[] = [
  { id: 'shogatsu', month: 1, date: 2 },
  { id: 'setsubun', month: 2, date: 3 },
  { id: 'tanabata', month: 7, date: 7 },
  { id: 'natsumatsuri', month: 8, date: 14, hour: 19.5, note: '傍晚，街上有人穿浴衣' },
  { id: 'halloween', month: 10, date: 31 },
  { id: 'christmas', month: 12, date: 24 },
];
const SEASON_NOTE = { spring: '樱花盛开', summer: '风铃、刨冰', autumn: '红叶、烤红薯', winter: '树叶落尽、热饮' } as const;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
/** The day itself of each occasion (festivals run for weeks; only these get a dot on the calendar). */
const KEY_DAYS: Record<string, string> = {
  '1-1': '元旦', '2-3': '节分', '3-3': '女儿节', '7-7': '七夕', '8-13': '盂兰盆', '8-14': '盂兰盆', '8-15': '盂兰盆', '8-16': '盂兰盆',
  '10-31': '万圣节', '12-24': '平安夜', '12-25': '圣诞', '12-31': '除夕',
};

export interface DatePickerHooks {
  /** leave live mode before changing anything by hand */
  takeControl(): void;
  /** write the state into the address bar */
  syncUrl(): void;
  tick(): void;
}

export function initDatePicker(atm: Atmosphere, hooks: DatePickerHooks) {
  const panel = $('calPanel'), btn = $('dateBtn'), btnText = $('dateBtnText'), btnDot = $('dateBtnDot');
  const grid = $('calGrid'), title = $('calTitle'), note = $('calNote'), today = $('calToday');
  const seasonBox = $('calSeasons'), festBox = $('calFestivals');
  let view = { year: atm.day.year, month: atm.day.month };

  seasonBox.innerHTML = SEASONS.map((s) => `<button type="button" data-season="${s}" title="${SEASON_NOTE[s]}">${SEASON_LABEL[s]}</button>`).join('');
  festBox.innerHTML = JUMPS.map((j) => `<button type="button" data-fest="${j.id}" title="${j.month}月${j.date}日${j.note ? `，${j.note}` : ''}">${FESTIVAL_LABEL[j.id]}</button>`).join('');

  const pick = (month: number, date: number, year = atm.day.year, hour?: number) => {
    hooks.tick();
    hooks.takeControl();
    atm.setDate(month, date, year);
    if (hour !== undefined) atm.setTime(hour);
    view = { year: atm.day.year, month: atm.day.month };
    hooks.syncUrl();
    render();
  };

  seasonBox.addEventListener('click', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLElement>('[data-season]')?.dataset.season as keyof typeof SEASON_SAMPLE | undefined;
    if (s) pick(...SEASON_SAMPLE[s]);
  });
  festBox.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-fest]')?.dataset.fest;
    const j = JUMPS.find((x) => x.id === id);
    if (j) pick(j.month, j.date, atm.day.year, j.hour);
  });
  grid.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-day]');
    if (b) pick(view.month, Number(b.dataset.day), view.year);
  });
  const step = (n: number) => {
    hooks.tick();
    const t = new Date(Date.UTC(view.year, view.month - 1 + n, 1));
    view = { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
    render();
  };
  $('calPrev').addEventListener('click', () => step(-1));
  $('calNext').addEventListener('click', () => step(1));
  today.addEventListener('click', () => {
    hooks.tick();
    atm.clearDate();
    view = { year: atm.day.year, month: atm.day.month };
    hooks.syncUrl();
    render();
  });

  // ---------------------------------------------------------------- drawing
  function describe(d: Day) {
    const parts = [formatDay(d), SEASON_LABEL[d.season]];
    if (d.holiday) parts.push(d.holiday);
    parts.push(...d.festivals.map((f) => FESTIVAL_LABEL[f]));
    return parts.join(' · ');
  }

  function render() {
    const d = atm.day;
    btnText.textContent = `${d.month}月${d.date}日`;
    btnDot.hidden = !atm.dateOverride;
    note.textContent = describe(d);
    today.hidden = !atm.dateOverride;
    seasonBox.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.season === d.season)));
    festBox.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(d.festivals.includes(b.dataset.fest as Festival))));
    if (panel.hidden) return;

    title.textContent = `${view.year}年${view.month}月`;
    const now = new Date();
    const first = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
    let html = WEEK.map((w, i) => `<span class="wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${w}</span>`).join('');
    html += '<span></span>'.repeat(first);
    for (let i = 1; i <= days; i++) {
      const c = describeDay(view.year, view.month, i);
      const cls = [
        c.weekday === 0 || c.holiday ? 'sun' : c.weekday === 6 ? 'sat' : '',
        KEY_DAYS[`${c.month}-${c.date}`] ? 'fest' : '',
        c.year === d.year && c.month === d.month && c.date === d.date ? 'sel' : '',
        c.year === now.getFullYear() && c.month === now.getMonth() + 1 && c.date === now.getDate() ? 'today' : '',
      ].filter(Boolean).join(' ');
      const tip = [...new Set([c.holiday, KEY_DAYS[`${c.month}-${c.date}`], ...c.festivals.map((f) => FESTIVAL_LABEL[f])].filter(Boolean))].join('、');
      html += `<button type="button" data-day="${i}" class="${cls}"${tip ? ` title="${tip}"` : ''}>${i}</button>`;
    }
    grid.innerHTML = html;
  }

  // ---------------------------------------------------------------- open / close
  const place = () => {
    const dock = document.querySelector('.dock')!.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const w = panel.offsetWidth;
    panel.style.bottom = `${innerHeight - dock.top + 10}px`;
    panel.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, b.left + b.width / 2 - w / 2))}px`;
  };
  const setOpen = (open: boolean) => {
    if (open === !panel.hidden) return;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      $('hint').classList.add('gone');
      view = { year: atm.day.year, month: atm.day.month };
      render();
      place();
    }
  };
  const toggle = () => { hooks.tick(); setOpen(panel.hidden); };
  btn.addEventListener('click', toggle);
  $('labelDateRow').addEventListener('click', toggle);
  addEventListener('resize', () => { if (!panel.hidden) place(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (!panel.hidden && !panel.contains(t) && !btn.contains(t) && !$('labelDateRow').contains(t)) setOpen(false);
  });

  atm.onDayChange(() => render());
  render();
}
