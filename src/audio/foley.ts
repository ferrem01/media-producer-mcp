/**
 * THE HOUSE FOLEY SET.
 *
 * A film needs whooshes, ticks, thuds and dings, and a marketer has no
 * sound library (Marc: "I don't know of any library for sound effects").
 * Buying one is a subscription; the free catalogues (Freesound CC0,
 * Pixabay) need an API key. So the house set is SYNTHESIZED: every effect
 * here is made from noise and sine partials shaped by envelopes and
 * filters, minted into `_system/sfx` on first use. No licence, no key, no
 * download -- and deterministic, so the same id is the same sound on every
 * machine (a seeded PRNG, never the platform's).
 *
 * The fetched catalogues sit BESIDE this set (audio/sfx.ts), never over it.
 */
import fs from "node:fs/promises";
import path from "node:path";

export interface FoleySpec {
  id: string;
  label: string;
  /** What it is for, in the words a writer or a person would search. */
  tags: string[];
  duration: number;
}

const SR = 48000;

/** Deterministic noise: mulberry32, seeded per effect so a sound never
 *  changes between machines or runs. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A state-variable filter, stepped per sample so cutoff and Q can sweep. */
function svf(x: number, state: { lp: number; bp: number }, cutoff: number, q: number): { lp: number; bp: number; hp: number } {
  const f = 2 * Math.sin(Math.PI * Math.min(cutoff, SR * 0.45) / SR);
  const damp = 1 / Math.max(0.5, q);
  const hp = x - state.lp - damp * state.bp;
  state.bp += f * hp;
  state.lp += f * state.bp;
  return { lp: state.lp, bp: state.bp, hp };
}

/** Attack/decay envelope with a curve: 0 at both ends, 1 at the peak. */
function env(t: number, dur: number, attack: number, curve = 2.2): number {
  if (t <= 0 || t >= dur) return 0;
  if (t < attack) return Math.pow(t / attack, 0.6);
  const d = (t - attack) / Math.max(1e-4, dur - attack);
  return Math.pow(1 - d, curve);
}

function lerp(a: number, b: number, f: number): number { return a + (b - a) * f; }

/**
 * Render one effect to mono samples at 48k. Pure: the same id always gives
 * the same samples.
 */
export function renderFoley(id: string): Float32Array {
  const spec = FOLEY_SET.find((f) => f.id === id);
  if (!spec) throw new Error(`Unknown foley id: ${id}`);
  const n = Math.round(spec.duration * SR);
  const out = new Float32Array(n);
  const rnd = prng(hashSeed(id));
  const st = { lp: 0, bp: 0 };
  const st2 = { lp: 0, bp: 0 };
  const st3 = { lp: 0, bp: 0 };

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / spec.duration;
    let v = 0;
    switch (id) {
      case "whoosh-soft":
      case "whoosh-fast": {
        // Noise through a resonant band that sweeps up and away again: the
        // shape of something passing the microphone. TWO bandpasses in
        // series, then the top rolled off -- one pass is a wide band that
        // reads as hiss (seen on the spectrogram of the first set), two is
        // air moving.
        const fast = id === "whoosh-fast";
        const noise = rnd() * 2 - 1;
        const cut = lerp(300, fast ? 3400 : 2100, Math.sin(Math.PI * p));
        const b1 = svf(noise, st, cut, fast ? 3.2 : 2.4).bp;
        const b2 = svf(b1, st2, cut, fast ? 3.2 : 2.4).bp;
        const air = svf(b2, st3, cut * 2.6, 0.7).lp;
        v = air * env(t, spec.duration, spec.duration * 0.3, fast ? 2.6 : 1.8) * 2.4;
        break;
      }
      case "whirr-loop": {
        // The ring's motor: a body tone with harmonics, a fast tremolo and
        // a noise bed, all rising a little across the take.
        const f0 = lerp(88, 150, p);
        const tone = Math.sin(2 * Math.PI * f0 * t) * 0.5 + Math.sin(2 * Math.PI * f0 * 2 * t) * 0.24 + Math.sin(2 * Math.PI * f0 * 3.01 * t) * 0.12;
        const trem = 0.72 + 0.28 * Math.sin(2 * Math.PI * lerp(9, 17, p) * t);
        // The bed is a narrow band of air riding the motor, not a hiss
        // across the whole spectrum (the first set's mistake): two passes,
        // and quiet under the tone.
        const bed1 = svf(rnd() * 2 - 1, st, lerp(900, 1800, p), 2.8).bp;
        const bed = svf(bed1, st2, lerp(900, 1800, p), 2.8).bp * 0.5;
        const fade = Math.min(1, t / 0.12) * Math.min(1, (spec.duration - t) / 0.18);
        v = (tone * trem + bed) * fade * 0.5;
        break;
      }
      case "tick": {
        const noise = svf(rnd() * 2 - 1, st, 4200, 3.4).bp;
        const ping = Math.sin(2 * Math.PI * 2400 * t) * 0.5;
        v = (noise + ping) * env(t, spec.duration, 0.0008, 5.5);
        break;
      }
      case "click": {
        v = svf(rnd() * 2 - 1, st, 6200, 2.2).hp * env(t, spec.duration, 0.0005, 6.5) * 0.9;
        break;
      }
      case "keyboard": {
        // A short burst of typing: clicks at uneven spacing, each its own
        // little transient.
        const strokes = [0, 0.085, 0.152, 0.237, 0.291, 0.372, 0.448, 0.502, 0.585, 0.651, 0.742, 0.808, 0.887];
        for (const s of strokes) {
          const dt = t - s;
          if (dt >= 0 && dt < 0.03) {
            const e = Math.pow(1 - dt / 0.03, 5);
            v += (rnd() * 2 - 1) * e * 0.5;
          }
        }
        v = svf(v, st, 3800, 1.4).bp * 1.2;
        break;
      }
      case "pop": {
        const f = lerp(900, 210, Math.pow(p, 0.35));
        v = Math.sin(2 * Math.PI * f * t) * env(t, spec.duration, 0.002, 3.4);
        break;
      }
      case "thud": {
        // A body that drops: a low tone bending down, a click of contact,
        // and a short room tail.
        const f = lerp(130, 44, Math.pow(p, 0.4));
        const body = Math.sin(2 * Math.PI * f * t);
        const contact = t < 0.02 ? (rnd() * 2 - 1) * Math.pow(1 - t / 0.02, 3) * 0.7 : 0;
        const tail = svf(rnd() * 2 - 1, st2, 380, 0.8).lp * Math.pow(1 - p, 5) * 0.25;
        v = (body * env(t, spec.duration, 0.004, 3.2) + contact + tail) * 0.95;
        break;
      }
      case "paper-drop": {
        // A stack of paper landing: the thud plus a lot of edges.
        const f = lerp(150, 58, Math.pow(p, 0.5));
        const body = Math.sin(2 * Math.PI * f * t) * env(t, spec.duration, 0.005, 3.6) * 0.8;
        const rustle = svf(rnd() * 2 - 1, st, lerp(5200, 1600, p), 1.1).bp * Math.pow(1 - p, 2.2) * 0.6;
        v = body + rustle;
        break;
      }
      case "ding": {
        const partials: Array<[number, number]> = [[1046.5, 1], [1568, 0.5], [2093, 0.28], [3136, 0.12]];
        for (const [f, a] of partials) v += Math.sin(2 * Math.PI * f * t) * a * Math.exp(-t * (3.4 + f / 900));
        v *= env(t, spec.duration, 0.002, 1.1) * 0.55;
        break;
      }
      case "swell": {
        // Noise rising through an opening filter: the breath before a cut.
        const cut = lerp(180, 6000, Math.pow(p, 1.7));
        v = svf(rnd() * 2 - 1, st, cut, 1.1).lp * Math.pow(p, 1.5) * 0.9;
        break;
      }
      case "riser": {
        // A tone climbing with a noise sheen: tension into the payoff.
        const f = lerp(180, 1400, Math.pow(p, 2));
        const tone = Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.2;
        const air = svf(svf(rnd() * 2 - 1, st, lerp(1200, 5000, p), 2.4).bp, st3, lerp(1200, 5000, p), 2.4).bp * lerp(0.2, 1.1, p);
        v = (tone + air) * Math.pow(p, 1.2) * 0.75;
        break;
      }
      case "deflate": {
        // The gag's falling note: pitch bending down with a little grit.
        const f = lerp(520, 90, Math.pow(p, 0.8));
        const wobble = 1 + 0.06 * Math.sin(2 * Math.PI * 7 * t);
        v = (Math.sin(2 * Math.PI * f * wobble * t) * 0.8 + Math.sin(2 * Math.PI * f * 2 * t) * 0.15) * env(t, spec.duration, 0.01, 1.6);
        break;
      }
      case "camera-shutter": {
        const a = t < 0.035 ? Math.pow(1 - t / 0.035, 4) : 0;
        const b = t > 0.06 && t < 0.11 ? Math.pow(1 - (t - 0.06) / 0.05, 4) : 0;
        v = svf(rnd() * 2 - 1, st, 3400, 2.0).bp * (a + b) * 1.1;
        break;
      }
      default:
        v = 0;
    }
    out[i] = Math.max(-1, Math.min(1, v));
  }
  // A short fade at both ends: no click when the mixer starts or stops it.
  const fade = Math.min(Math.round(0.004 * SR), Math.floor(n / 8));
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[n - 1 - i] *= i / fade;
  }
  return normalize(out);
}

/** Peak-normalize to -1.5 dBFS so every effect arrives at the same level. */
function normalize(buf: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak < 1e-6) return buf;
  const g = 0.84 / peak;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 16-bit mono WAV bytes for the samples. */
export function wavBytes(samples: Float32Array, sampleRate = SR): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** THE SET. Small on purpose: the moves a film actually makes. */
export const FOLEY_SET: FoleySpec[] = [
  { id: "whoosh-soft", label: "Whoosh (soft)", tags: ["whoosh", "swipe", "enter", "slide", "transition"], duration: 0.55 },
  { id: "whoosh-fast", label: "Whoosh (fast)", tags: ["whoosh", "fast", "cut", "snap", "transition"], duration: 0.34 },
  { id: "whirr-loop", label: "Whirr (loop)", tags: ["whirr", "motor", "spin", "rotate", "montage", "loop"], duration: 3.2 },
  { id: "tick", label: "Tick", tags: ["tick", "clock", "count", "time"], duration: 0.09 },
  { id: "click", label: "Click", tags: ["click", "mouse", "select", "ui"], duration: 0.05 },
  { id: "keyboard", label: "Keyboard burst", tags: ["keyboard", "typing", "work", "desk"], duration: 0.95 },
  { id: "pop", label: "Pop", tags: ["pop", "appear", "bubble", "ui"], duration: 0.2 },
  { id: "thud", label: "Thud", tags: ["thud", "drop", "land", "impact"], duration: 0.42 },
  { id: "paper-drop", label: "Paper drop", tags: ["paper", "stack", "deck", "drop", "desk"], duration: 0.6 },
  { id: "ding", label: "Ding", tags: ["ding", "bell", "done", "notify", "success"], duration: 1.1 },
  { id: "swell", label: "Swell", tags: ["swell", "build", "rise", "before"], duration: 1.4 },
  { id: "riser", label: "Riser", tags: ["riser", "tension", "build", "montage"], duration: 2.0 },
  { id: "deflate", label: "Deflate", tags: ["deflate", "fail", "sad", "gag", "down"], duration: 0.9 },
  { id: "camera-shutter", label: "Camera shutter", tags: ["camera", "shutter", "photo", "snap"], duration: 0.16 },
];

export interface FoleyManifestEntry extends FoleySpec { file: string; source: "house"; license: "house"; }

/**
 * Mint the house set into `dir` (once) and return its manifest. Idempotent:
 * a file already there is left alone, so a deploy pays the synthesis cost
 * one time. The manifest is rewritten whenever the set changes.
 */
export async function ensureFoleyLibrary(dir: string): Promise<FoleyManifestEntry[]> {
  await fs.mkdir(dir, { recursive: true });
  const entries: FoleyManifestEntry[] = [];
  for (const spec of FOLEY_SET) {
    const file = `${spec.id}.wav`;
    const full = path.join(dir, file);
    try { await fs.access(full); }
    catch { await fs.writeFile(full, wavBytes(renderFoley(spec.id))); }
    entries.push({ ...spec, file, source: "house", license: "house" });
  }
  await fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify({ version: 1, effects: entries }, null, 2));
  return entries;
}
