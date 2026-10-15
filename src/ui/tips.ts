// Hover tips: the controls are glyphs, so resting the pointer on one (or reaching it with the keyboard) shows its
// name — read from aria-label, the same words a screen reader says — and its key, from aria-keyshortcuts.
const DELAY = 380;     // ms the pointer rests before the first tip
const CHAIN = 500;     // ms after one tip during which the next shows at once (sweeping along a row)
const GAP = 8;

export function initTips(scope: string) {
  const tip = document.getElementById('tip')!;
  let target: HTMLElement | null = null, timer = 0, lastHidden = 0;

  const show = (el: HTMLElement) => {
    const label = el.getAttribute('aria-label');
    if (!label || !el.isConnected) return;
    const key = el.getAttribute('aria-keyshortcuts');
    tip.textContent = label;
    if (key) {
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      tip.append(kbd);
    }
    // above the button, kept inside the window; below it when there's no room above
    const r = el.getBoundingClientRect();
    tip.classList.add('on');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2));
    const top = r.top - h - GAP >= 4 ? r.top - h - GAP : r.bottom + GAP;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  };
  const hide = () => {
    clearTimeout(timer);
    if (tip.classList.contains('on')) lastHidden = performance.now();
    tip.classList.remove('on');
    target = null;
  };
  const arm = (el: HTMLElement) => {
    if (el === target) return;
    const chained = tip.classList.contains('on') || performance.now() - lastHidden < CHAIN;
    hide();
    target = el;
    timer = window.setTimeout(() => show(el), chained ? 0 : DELAY);
  };

  const owner = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>(`${scope} button[aria-label]`) ?? null;
  addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = owner(e);
    if (el) arm(el); else if (target) hide();
  });
  addEventListener('pointerdown', hide, { capture: true });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  // keyboard: Tab onto a control shows its tip straight away
  addEventListener('focusin', (e) => {
    const el = owner(e);
    if (el?.matches(':focus-visible')) { hide(); target = el; show(el); } else if (target) hide();
  });
  addEventListener('focusout', (e) => { if (e.target === target) hide(); });
  // a label that changes underneath the tip (live mode's place, the date) is shown fresh; a control that hides takes its tip with it
  return {
    refresh() {
      if (!target) return;
      if (!target.offsetParent || getComputedStyle(target).visibility === 'hidden') hide();
      else if (tip.classList.contains('on')) show(target);
    },
    hide,
  };
}
