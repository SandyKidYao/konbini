// The date picker: a button in the tray opens a small card with the seasons and festivals as glyphs, one click away,
// and a month calendar (Sundays and holidays in red, festival days dotted) for any other day.
import type { Atmosphere } from '../engine/atmosphere';
import { describeDay, formatDay, FESTIVAL_LABEL, SEASON_LABEL, SEASON_SAMPLE, SEASONS, type Day, type Festival, type Season } from '../engine/calendar';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Festival shortcuts: a day inside each, and a time when the evening is the point. */
const JUMPS: { id: Festival; month: number; date: number; hour?: number; icon: string }[] = [
  // kadomatsu: three bamboo stems cut on the slant, in a tub
  { id: 'shogatsu', month: 1, date: 2, icon: '<path d="M8 20V9l2-2v13M12 20V5l2-2v17M16 20v-9l2-2v11"/><path d="M5.5 20h13"/>' },
  // an oni's face: horns and a frown
  { id: 'setsubun', month: 2, date: 3, icon: '<path d="M7.5 8.5 6 3.5l4 3M16.5 8.5 18 3.5l-4 3"/><circle cx="12" cy="13" r="7"/><path d="M9.5 12v.5M14.5 12v.5M9.5 16.5l1.2-1 1.3 1 1.3-1 1.2 1"/>' },
  // a star
  { id: 'tanabata', month: 7, date: 7, icon: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>' },
  // a paper lantern (an evening jump: the yukata walkers are out)
  { id: 'natsumatsuri', month: 8, date: 14, hour: 19.5, icon: '<path d="M10 3.5h4M10 20.5h4"/><path d="M9 5.5h6c2 1.6 3 3.8 3 6.5s-1 4.9-3 6.5H9c-2-1.6-3-3.8-3-6.5s1-4.9 3-6.5z"/><path d="M6.4 9.5h11.2M6.4 14.5h11.2"/>' },
  // a pumpkin
  { id: 'halloween', month: 10, date: 31, icon: '<path d="M12 7c-4.4 0-7.5 2.7-7.5 6.5S7.6 20 12 20s7.5-2.7 7.5-6.5S16.4 7 12 7z"/><path d="M12 7c-1.8 1.8-1.8 11.2 0 13M12 7c1.8 1.8 1.8 11.2 0 13M12 7c0-1.6.6-2.8 2-3.5"/>' },
  // a fir tree
  { id: 'christmas', month: 12, date: 24, icon: '<path d="M12 3 7.5 9.5h2.5L6 15h3.5L5.5 19.5h13L14.5 15H18l-4-5.5h2.5z"/><path d="M12 19.5v2"/>' },
];
const SEASON_ICON: Record<Season, string> = {
  // a cherry blossom
  spring: '<path d="M12 10.2c-1.6-2.4-1.6-4.6 0-6.7 1.6 2.1 1.6 4.3 0 6.7zM13.7 11.4c1.8-2.3 3.9-3 6.4-2.1-.7 2.5-2.5 3.8-5.4 3.9zM13.1 13.4c2.8.9 4.1 2.7 4 5.3-2.6.1-4.3-1.3-5-4.1zM10.9 13.4c-.7 2.8-2.4 4.2-5 4.1-.1-2.6 1.2-4.4 4-5.3zM10.3 11.4c-2.9-.1-4.7-1.4-5.4-3.9 2.5-.9 4.6-.2 6.4 2.1z"/>',
  // a wind chime
  summer: '<path d="M12 3v3"/><path d="M7.5 12c0-3.6 2-6 4.5-6s4.5 2.4 4.5 6z"/><path d="M12 12v3.5"/><path d="M10 15.5h4l-.5 5.5h-3z"/>',
  // a maple leaf
  autumn: '<path d="M12 21v-6M12 15l-6.5 1.5 1.5-3-3.5-3 3-.5-1-4 3.5 2L11 4l1-1.5L13 4l2 4 3.5-2-1 4 3 .5-3.5 3 1.5 3z"/>',
  // a snowman
  winter: '<circle cx="12" cy="7.5" r="3.5"/><circle cx="12" cy="15.5" r="5"/><path d="M11 7v.01M13 7v.01M12 13.5v.01M12 16.5v.01"/>',
};
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
  /** the card opened or closed: lay out the panels again */
  layout(): void;
}

export function initDatePicker(atm: Atmosphere, hooks: DatePickerHooks) {
  const panel = $('calPanel'), btn = $('dateBtn'), btnText = $('dateBtnText'), btnDot = $('dateBtnDot');
  const grid = $('calGrid'), title = $('calTitle'), today = $('calToday');
  const seasonBox = $('calSeasons'), festBox = $('calFestivals');
  let view = { year: atm.day.year, month: atm.day.month };

  const glyph = (svg: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`;
  seasonBox.innerHTML = SEASONS.map((s) => `<button type="button" data-season="${s}" aria-label="${SEASON_LABEL[s]}">${glyph(SEASON_ICON[s])}</button>`).join('');
  festBox.innerHTML = JUMPS.map((j) => `<button type="button" data-fest="${j.id}" aria-label="${FESTIVAL_LABEL[j.id]} ${j.month}/${j.date}">${glyph(j.icon)}</button>`).join('');

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
    btnText.textContent = `${d.month}/${d.date}`;
    btnDot.hidden = !atm.dateOverride;
    btn.setAttribute('aria-label', `日期 · ${describe(d)}`);
    today.hidden = !atm.dateOverride;
    seasonBox.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.season === d.season)));
    festBox.querySelectorAll<HTMLElement>('button').forEach((b) => b.setAttribute('aria-pressed', String(d.festivals.includes(b.dataset.fest as Festival))));
    if (panel.hidden) return;

    title.textContent = `${view.year} · ${view.month}`;
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
      html += `<button type="button" data-day="${i}" class="${cls}"${tip ? ` aria-label="${i} ${tip}"` : ''}>${i}</button>`;
    }
    grid.innerHTML = html;
  }

  // ---------------------------------------------------------------- open / close
  const setOpen = (open: boolean) => {
    if (open === !panel.hidden) return;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      view = { year: atm.day.year, month: atm.day.month };
      render();
    }
    hooks.layout();
  };
  btn.addEventListener('click', () => { hooks.tick(); setOpen(panel.hidden); });

  atm.onDayChange(() => render());
  render();
  return { setOpen };
}
