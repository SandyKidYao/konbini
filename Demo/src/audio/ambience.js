// Procedural sound: no audio files. Rain/wind are filtered noise, birds and drips are tiny synth gestures,
// and the click feedback (door chime, meow, can drop) is synthesised on demand. Off until the user turns it on.
let ctx = null, master = null, enabled = false;
const bus = {};
let nextBird = 0, nextDrip = 0;

function noiseBuffer(seconds = 2) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.04 * w) / 1.04;            // a touch of brown noise for body
    d[i] = w * 0.6 + last * 3.0;
  }
  return buf;
}
function loop(buf, ...nodes) {
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  let n = src;
  for (const next of nodes) { n.connect(next); n = next; }
  src.start();
  return nodes[nodes.length - 1];
}
const filter = (type, freq, Q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; };
const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };

function init() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = gain(0);
  master.connect(ctx.destination);
  const buf = noiseBuffer();
  bus.rain = loop(buf, filter('highpass', 600), filter('lowpass', 5200), gain());
  bus.rumble = loop(buf, filter('lowpass', 380), gain());
  bus.wind = loop(buf, filter('bandpass', 320, 0.6), gain());
  for (const k of ['rain', 'rumble', 'wind']) bus[k].connect(master);
}

export const isSoundOn = () => enabled;

export function setSound(on) {
  if (on && !ctx) init();
  if (!ctx) return;
  enabled = on;
  if (on) ctx.resume();
  master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.35);
}

function env(node, t0, peak, attack, decay) {
  node.gain.setValueAtTime(0.0001, t0);
  node.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}
function voice(type, pan = 0) {
  const o = ctx.createOscillator(); o.type = type;
  const g = gain(0);
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  o.connect(g); g.connect(p); p.connect(master);
  return { o, g };
}

function chirp(level) {
  const t = ctx.currentTime, { o, g } = voice('sine', Math.random() * 1.6 - 0.8);
  const f = 2600 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    o.frequency.setValueAtTime(f, t + i * 0.09);
    o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.3), t + i * 0.09 + 0.05);
  }
  env(g, t, 0.03 * level, 0.01, n * 0.09);
  o.start(t); o.stop(t + n * 0.09 + 0.1);
}
function drip(level) {
  const t = ctx.currentTime, { o, g } = voice('sine', Math.random() * 1.4 - 0.7);
  const f = 900 + Math.random() * 1300;
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.04);
  env(g, t, 0.025 * level, 0.004, 0.08);
  o.start(t); o.stop(t + 0.12);
}

// state: the current mode values (rain, wind, birds)
export function updateAmbience(s, elapsed) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  bus.rain.gain.setTargetAtTime(s.rain * 0.16, t, 0.5);
  bus.rumble.gain.setTargetAtTime(s.rain * 0.22, t, 0.5);
  bus.wind.gain.setTargetAtTime(s.wind * 0.07 * (0.65 + 0.35 * Math.sin(elapsed * 0.35)), t, 0.8);
  if (s.birds > 0.15 && elapsed > nextBird) { chirp(s.birds); nextBird = elapsed + 1.2 + Math.random() * 4.5 / s.birds; }
  if (s.rain > 0.3 && elapsed > nextDrip) { drip(s.rain); nextDrip = elapsed + 0.08 + Math.random() * 0.35; }
}

// --- click feedback ---
export const sfx = {
  chime() {               // door chime: two soft bell tones
    if (!enabled) return;
    const t = ctx.currentTime;
    [[1318.5, 0], [987.8, 0.32]].forEach(([f, dt]) => {
      for (const [mult, lvl] of [[1, 0.12], [2.01, 0.03]]) {
        const { o, g } = voice('sine'); o.frequency.value = f * mult;
        env(g, t + dt, lvl, 0.01, 1.4); o.start(t + dt); o.stop(t + dt + 1.5);
      }
    });
  },
  meow() {
    if (!enabled) return;
    const t = ctx.currentTime, { o, g } = voice('sawtooth');
    const bp = filter('bandpass', 1400, 2.5);
    o.disconnect(); o.connect(bp); bp.connect(g);
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(820, t + 0.16);
    o.frequency.exponentialRampToValueAtTime(430, t + 0.5);
    bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1800, t + 0.15); bp.frequency.linearRampToValueAtTime(1000, t + 0.5);
    env(g, t, 0.16, 0.05, 0.5);
    o.start(t); o.stop(t + 0.6);
  },
  clunk() {               // a can dropping into the tray
    if (!enabled) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.3);
    const lp = filter('lowpass', 900), g = gain(0);
    src.connect(lp); lp.connect(g); g.connect(master);
    env(g, t + 0.18, 0.5, 0.005, 0.18); src.start(t + 0.18);
    const { o, g: g2 } = voice('sine'); o.frequency.setValueAtTime(140, t + 0.18); o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
    env(g2, t + 0.18, 0.35, 0.005, 0.2); o.start(t + 0.18); o.stop(t + 0.45);
  },
  beep() {                // small taxi horn
    if (!enabled) return;
    const t = ctx.currentTime;
    for (const f of [392, 494]) {
      const { o, g } = voice('square'); o.frequency.value = f;
      const lp = filter('lowpass', 1500); o.disconnect(); o.connect(lp); lp.connect(g);
      env(g, t, 0.05, 0.01, 0.22); o.start(t); o.stop(t + 0.3);
    }
  },
  latch() {               // back door: a steel latch and a soft thud
    if (!enabled) return;
    const t = ctx.currentTime;
    const { o, g } = voice('square'); o.frequency.setValueAtTime(2200, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    env(g, t, 0.04, 0.002, 0.04); o.start(t); o.stop(t + 0.06);
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.3);
    const lp = filter('lowpass', 420), g2 = gain(0);
    src.connect(lp); lp.connect(g2); g2.connect(master);
    env(g2, t + 0.05, 0.3, 0.01, 0.22); src.start(t + 0.05);
  },
  purr() {                // a sleepy cat: low noise pulsing ~25 times a second
    if (!enabled) return;
    const t = ctx.currentTime, dur = 1.8;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(2);
    const lp = filter('lowpass', 320), am = gain(0), out = gain(0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 24;
    const depth = gain(0.5); lfo.connect(depth); depth.connect(am.gain); am.gain.value = 0.5;
    src.connect(lp); lp.connect(am); am.connect(out); out.connect(master);
    out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.5, t + 0.3); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); lfo.start(t); src.stop(t + dur); lfo.stop(t + dur);
  },
  tick() {                // UI button press
    if (!enabled) return;
    const t = ctx.currentTime, { o, g } = voice('triangle');
    o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    env(g, t, 0.06, 0.003, 0.07); o.start(t); o.stop(t + 0.1);
  },
};
