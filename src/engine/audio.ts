// Procedural sound: no audio files. Rain/wind beds are filtered noise driven by the atmosphere; one-shot
// sounds are tiny synth recipes. Mods can add recipes with `audio.define(name, recipe)`. Silent until enabled.
import type { Drivers } from './atmosphere';

export interface SynthKit {
  ctx: AudioContext;
  out: AudioNode;
  t: number;
  voice(type: OscillatorType, pan?: number): { o: OscillatorNode; g: GainNode };
  env(g: GainNode, t0: number, peak: number, attack: number, decay: number): void;
  filter(type: BiquadFilterType, freq: number, Q?: number): BiquadFilterNode;
  gain(v?: number): GainNode;
  noise(seconds?: number): AudioBuffer;
}
export type Recipe = (k: SynthKit) => void;

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private beds: Record<'rain' | 'rumble' | 'wind', GainNode> | null = null;
  private recipes = new Map<string, Recipe>();
  private nextBird = 0;
  private nextDrip = 0;
  enabled = false;

  constructor() { builtins(this); }

  define(name: string, recipe: Recipe) { this.recipes.set(name, recipe); }

  setEnabled(on: boolean) {
    if (on && !this.ctx) this.init();
    if (!this.ctx || !this.master) return;
    this.enabled = on;
    if (on) void this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.35);
  }

  play(name: string) {
    if (!this.enabled || !this.ctx) return;
    this.recipes.get(name)?.(this.kit());
  }

  private init() {
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const k = this.kit();
    const buf = k.noise(2);
    const loop = (...nodes: AudioNode[]) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true; src.playbackRate.value = 0.9 + Math.random() * 0.2;
      let n: AudioNode = src;
      for (const next of nodes) { n.connect(next); n = next; }
      n.connect(this.master!);
      src.start();
      return nodes[nodes.length - 1] as GainNode;
    };
    this.beds = {
      rain: loop(k.filter('highpass', 600), k.filter('lowpass', 5200), k.gain()),
      rumble: loop(k.filter('lowpass', 380), k.gain()),
      wind: loop(k.filter('bandpass', 320, 0.6), k.gain()),
    };
  }

  private kit(): SynthKit {
    const ctx = this.ctx!, out = this.master!;
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    return {
      ctx, out, t: ctx.currentTime, gain,
      filter: (type, freq, Q = 0.7) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; },
      voice: (type, pan = 0) => {
        const o = ctx.createOscillator(); o.type = type;
        const g = gain(0); const p = ctx.createStereoPanner(); p.pan.value = pan;
        o.connect(g); g.connect(p); p.connect(out);
        return { o, g };
      },
      env: (g, t0, peak, attack, decay) => {
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
      },
      noise: (seconds = 2) => {
        const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
        const d = b.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.6 + last * 3; }
        return b;
      },
    };
  }

  /** Ambient beds and little random gestures, following the weather. */
  update(d: Drivers, elapsed: number) {
    if (!this.ctx || !this.enabled || !this.beds) return;
    const t = this.ctx.currentTime;
    this.beds.rain.gain.setTargetAtTime(d.rain * 0.16, t, 0.5);
    this.beds.rumble.gain.setTargetAtTime(d.rain * 0.22, t, 0.5);
    this.beds.wind.gain.setTargetAtTime(d.wind * (0.07 + d.thunder * 0.05) * (0.65 + 0.35 * Math.sin(elapsed * 0.35)), t, 0.8);
    const birds = d.daylight * (1 - d.rain) * (1 - d.snow) * (1 - d.fog * 0.6) * (1 - d.cloud * 0.7);
    if (birds > 0.15 && elapsed > this.nextBird) { this.play('chirp'); this.nextBird = elapsed + 1.2 + (Math.random() * 4.5) / birds; }
    if (d.rain > 0.3 && elapsed > this.nextDrip) { this.play('drip'); this.nextDrip = elapsed + 0.08 + Math.random() * 0.35; }
  }
}

function builtins(a: Audio) {
  a.define('chirp', ({ voice, env, t }) => {
    const { o, g } = voice('sine', Math.random() * 1.6 - 0.8);
    const f = 2600 + Math.random() * 1400, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      o.frequency.setValueAtTime(f, t + i * 0.09);
      o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.3), t + i * 0.09 + 0.05);
    }
    env(g, t, 0.03, 0.01, n * 0.09); o.start(t); o.stop(t + n * 0.09 + 0.1);
  });
  a.define('drip', ({ voice, env, t }) => {
    const { o, g } = voice('sine', Math.random() * 1.4 - 0.7);
    const f = 900 + Math.random() * 1300;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.04);
    env(g, t, 0.025, 0.004, 0.08); o.start(t); o.stop(t + 0.12);
  });
  a.define('chime', ({ voice, env, t }) => {
    for (const [f, dt] of [[1318.5, 0], [987.8, 0.32]]) for (const [mult, lvl] of [[1, 0.12], [2.01, 0.03]]) {
      const { o, g } = voice('sine'); o.frequency.value = f * mult;
      env(g, t + dt, lvl, 0.01, 1.4); o.start(t + dt); o.stop(t + dt + 1.5);
    }
  });
  a.define('meow', ({ voice, env, filter, t }) => {
    const { o, g } = voice('sawtooth');
    const bp = filter('bandpass', 1400, 2.5);
    o.disconnect(); o.connect(bp); bp.connect(g);
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.16); o.frequency.exponentialRampToValueAtTime(430, t + 0.5);
    bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1800, t + 0.15); bp.frequency.linearRampToValueAtTime(1000, t + 0.5);
    env(g, t, 0.16, 0.05, 0.5); o.start(t); o.stop(t + 0.6);
  });
  a.define('clunk', ({ ctx, out, voice, env, filter, gain, noise, t }) => {
    const src = ctx.createBufferSource(); src.buffer = noise(0.3);
    const lp = filter('lowpass', 900), g = gain(0);
    src.connect(lp); lp.connect(g); g.connect(out);
    env(g, t + 0.18, 0.5, 0.005, 0.18); src.start(t + 0.18);
    const { o, g: g2 } = voice('sine'); o.frequency.setValueAtTime(140, t + 0.18); o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
    env(g2, t + 0.18, 0.35, 0.005, 0.2); o.start(t + 0.18); o.stop(t + 0.45);
  });
  a.define('beep', ({ voice, env, filter, t }) => {
    for (const f of [392, 494]) {
      const { o, g } = voice('square'); o.frequency.value = f;
      const lp = filter('lowpass', 1500); o.disconnect(); o.connect(lp); lp.connect(g);
      env(g, t, 0.05, 0.01, 0.22); o.start(t); o.stop(t + 0.3);
    }
  });
  a.define('latch', ({ ctx, out, voice, env, filter, gain, noise, t }) => {
    const { o, g } = voice('square'); o.frequency.setValueAtTime(2200, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    env(g, t, 0.04, 0.002, 0.04); o.start(t); o.stop(t + 0.06);
    const src = ctx.createBufferSource(); src.buffer = noise(0.3);
    const lp = filter('lowpass', 420), g2 = gain(0);
    src.connect(lp); lp.connect(g2); g2.connect(out);
    env(g2, t + 0.05, 0.3, 0.01, 0.22); src.start(t + 0.05);
  });
  a.define('purr', ({ ctx, out, filter, gain, noise, t }) => {
    const dur = 1.8;
    const src = ctx.createBufferSource(); src.buffer = noise(2);
    const lp = filter('lowpass', 320), am = gain(0.5), o2 = gain(0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 24;
    const depth = gain(0.5); lfo.connect(depth); depth.connect(am.gain);
    src.connect(lp); lp.connect(am); am.connect(o2); o2.connect(out);
    o2.gain.setValueAtTime(0.0001, t); o2.gain.exponentialRampToValueAtTime(0.5, t + 0.3); o2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); lfo.start(t); src.stop(t + dur); lfo.stop(t + dur);
  });
  // thunder: a close one cracks then rolls; a far one is only a low rumble
  const thunder = (near: boolean) => ({ ctx, out, filter, gain, noise, t }: SynthKit) => {
    const dur = near ? 4.5 : 3.5;
    const src = ctx.createBufferSource(); src.buffer = noise(dur);
    const lp = filter('lowpass', near ? 420 : 180), g = gain(0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 2.5 + Math.random() * 3;
    const depth = gain(0.35), am = gain(0.65);
    lfo.connect(depth); depth.connect(am.gain);
    src.connect(lp); lp.connect(am); am.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(near ? 0.9 : 0.35, t + (near ? 0.05 : 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); lfo.start(t); src.stop(t + dur); lfo.stop(t + dur);
    if (near) {
      const c = ctx.createBufferSource(); c.buffer = noise(0.4);
      const hp = filter('highpass', 900), cg = gain(0);
      c.connect(hp); hp.connect(cg); cg.connect(out);
      cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.25, t + 0.01); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      c.start(t);
    }
  };
  a.define('thunder', thunder(true));
  a.define('thunder-far', thunder(false));
  a.define('tick', ({ voice, env, t }) => {
    const { o, g } = voice('triangle');
    o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    env(g, t, 0.06, 0.003, 0.07); o.start(t); o.stop(t + 0.1);
  });
  a.define('shutter', ({ voice, env, t }) => {
    for (const dt of [0, 0.06]) {
      const { o, g } = voice('square'); o.frequency.value = 3200;
      env(g, t + dt, 0.03, 0.002, 0.03); o.start(t + dt); o.stop(t + dt + 0.05);
    }
  });
}
