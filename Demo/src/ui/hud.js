// DOM controls: scene keys, turntable and sound toggles, keyboard shortcuts, the first-visit hint.
import { controls } from '../core/stage.js';
import { setMode, MODE_INFO } from '../state/modes.js';
import { setSound, isSoundOn, sfx } from '../audio/ambience.js';

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function selectMode(m, instant = false) {
  if (!setMode(m, instant)) return;
  document.body.dataset.mode = m;
  document.querySelectorAll('.selector button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  document.getElementById('labelTime').textContent = MODE_INFO[m].time;
  document.getElementById('labelWeather').textContent = MODE_INFO[m].weather;
  history.replaceState(null, '', location.search + '#' + m);
}

export function initHud() {
  const hint = document.getElementById('hint');
  const dismissHint = () => hint.classList.add('gone');
  setTimeout(dismissHint, 12000);

  document.querySelectorAll('.selector button').forEach((b) => b.addEventListener('click', () => {
    sfx.tick();
    selectMode(b.dataset.mode);
  }));

  // turntable: slow spin that pauses while you handle the model and resumes when you let go
  const spinBtn = document.getElementById('spinBtn');
  let spinOn = !reducedMotion, resumeTimer = 0;
  const setSpin = (on) => {
    spinOn = on;
    controls.autoRotate = on;
    spinBtn.setAttribute('aria-pressed', String(on));
  };
  setSpin(spinOn);
  spinBtn.addEventListener('click', () => { sfx.tick(); setSpin(!spinOn); });
  controls.addEventListener('start', () => {
    dismissHint();
    clearTimeout(resumeTimer);
    controls.autoRotate = false;
  });
  controls.addEventListener('end', () => {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { if (spinOn) controls.autoRotate = true; }, 6000);
  });

  const soundBtn = document.getElementById('soundBtn');
  const toggleSound = () => {
    setSound(!isSoundOn());
    soundBtn.setAttribute('aria-pressed', String(isSoundOn()));
    sfx.tick();
  };
  soundBtn.addEventListener('click', toggleSound);

  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === '1') selectMode('day');
    else if (k === '2') selectMode('overcast');
    else if (k === '3') selectMode('night');
    else if (k === 'r') spinBtn.click();
    else if (k === 'm') toggleSound();
  });
}

export function revealStage() {
  document.getElementById('veil').classList.add('done');
}
