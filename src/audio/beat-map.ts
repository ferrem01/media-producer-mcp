/**
 * Beat analyzer — BPM, beat grid, and downbeats from an audio file.
 *
 * Music-first timeline foundation (QUALITY-ROADMAP Pillar 1): the storyboard
 * quantizes scene durations to whole bars and the mixer aligns the track so
 * beat 1 lands at t=0 — so every cut lands on a downbeat.
 *
 * Dependency-free by design: ffmpeg decodes to raw PCM, and the DSP here is
 * a standard energy-flux onset envelope + autocorrelation tempo estimate +
 * grid phase search. That's plenty for stock/electronic/corporate tracks
 * (steady tempo); it is NOT a general music-transcription system.
 *
 * Results are cached by file identity (path + size + mtime) since analysis
 * is deterministic and tracks are reused across videos.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export interface BeatMap {
  /** Estimated tempo in beats per minute */
  bpm: number;
  /** Seconds per beat (60 / bpm) */
  beatSec: number;
  /** Seconds per bar, assuming 4/4 */
  barSec: number;
  /** Offset (s) of the first downbeat in the file — align this to video t=0 */
  firstDownbeatSec: number;
  /** Track duration in seconds */
  durationSec: number;
  /** 0-1: autocorrelation peak strength. Below ~0.2, don't trust the grid. */
  confidence: number;
}

// Analysis parameters
const SAMPLE_RATE = 22050;
const FRAME = 1024;
const HOP = 512;
const ENV_RATE = SAMPLE_RATE / HOP; // onset-envelope frames per second (~43)
const MIN_BPM = 60;
const MAX_BPM = 200;
/** Stock music prior: soft preference toward 90-150 BPM when harmonics tie. */
const BPM_PRIOR_CENTER = 118;
const BPM_PRIOR_WIDTH = 55;

/**
 * Analyze an audio file into a BeatMap. Throws on decode failure; returns a
 * low-confidence map (never throws) for un-rhythmic material.
 */
export async function analyzeBeats(filePath: string): Promise<BeatMap> {
  const cached = await readCache(filePath);
  if (cached) return cached;

  const pcm = await decodePcm(filePath);
  const durationSec = pcm.length / SAMPLE_RATE;

  const envelope = onsetEnvelope(pcm);
  const coarse = estimateTempo(envelope);
  // Joint fine-fit of tempo + phase over the whole envelope: a 0.5% tempo
  // error accumulates to visible cut drift by the end of a film, so the
  // autocorrelation estimate alone isn't precise enough.
  const { beatSec, phaseSec } = refineGrid(envelope, 60 / coarse.bpm);
  const bpm = 60 / beatSec;
  const confidence = coarse.confidence;
  const firstDownbeatSec = estimateDownbeat(envelope, beatSec, phaseSec);

  const map: BeatMap = {
    bpm: round2(bpm),
    beatSec: round4(beatSec),
    barSec: round4(beatSec * 4),
    firstDownbeatSec: round4(firstDownbeatSec),
    durationSec: round2(durationSec),
    confidence: round4(confidence),
  };

  await writeCache(filePath, map);
  return map;
}

/** Quantize a duration (s) to a whole number of bars (>= minBars). */
export function quantizeToBars(seconds: number, barSec: number, minBars = 1): number {
  if (!(barSec > 0)) return seconds;
  const bars = Math.max(minBars, Math.round(seconds / barSec));
  return round4(bars * barSec);
}

/** Quantize a duration (s) UP to the next whole number of bars (>= minBars). */
export function quantizeUpToBars(seconds: number, barSec: number, minBars = 1): number {
  if (!(barSec > 0)) return seconds;
  const bars = Math.max(minBars, Math.ceil(seconds / barSec - 1e-6));
  return round4(bars * barSec);
}

// ── Decode ──

async function decodePcm(filePath: string): Promise<Float32Array> {
  // Mono float PCM at analysis rate. Cap at 4 minutes: tempo is stable and
  // this bounds memory (4min * 22050 * 4B ≈ 21MB).
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v", "quiet",
      "-i", filePath,
      "-t", "240",
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "f32le",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  );
  const buf = stdout as unknown as Buffer;
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  if (samples.length < SAMPLE_RATE * 3) {
    throw new Error(`beat-map: decoded audio too short (${samples.length} samples)`);
  }
  // Copy out of the Buffer's arraybuffer so it can be GC'd independently
  return new Float32Array(samples);
}

// ── Onset envelope ──

/**
 * Energy-flux onset envelope: per-frame log-energy, half-wave-rectified
 * first difference, with a local-mean subtraction so sustained loud sections
 * don't mask onsets.
 */
function onsetEnvelope(pcm: Float32Array): Float32Array {
  const nFrames = Math.max(0, Math.floor((pcm.length - FRAME) / HOP));
  const logE = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    let e = 0;
    const off = i * HOP;
    for (let j = 0; j < FRAME; j++) {
      const s = pcm[off + j];
      e += s * s;
    }
    logE[i] = Math.log(e + 1e-9);
  }

  // Half-wave rectified flux
  const flux = new Float32Array(nFrames);
  for (let i = 1; i < nFrames; i++) {
    flux[i] = Math.max(0, logE[i] - logE[i - 1]);
  }

  // Adaptive threshold: subtract a ~0.7s local mean
  const win = Math.round(ENV_RATE * 0.7);
  const out = new Float32Array(nFrames);
  let acc = 0;
  const q: number[] = [];
  for (let i = 0; i < nFrames; i++) {
    acc += flux[i];
    q.push(flux[i]);
    if (q.length > win) acc -= q.shift()!;
    const mean = acc / q.length;
    out[i] = Math.max(0, flux[i] - mean);
  }
  return out;
}

// ── Tempo ──

function estimateTempo(env: Float32Array): { bpm: number; confidence: number } {
  const n = env.length;
  // Normalize envelope (zero-mean for autocorrelation)
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  const x = new Float32Array(n);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    x[i] = env[i] - mean;
    norm += x[i] * x[i];
  }
  if (norm < 1e-9) return { bpm: 120, confidence: 0 };

  const minLag = Math.floor((60 / MAX_BPM) * ENV_RATE);
  const maxLag = Math.ceil((60 / MIN_BPM) * ENV_RATE);

  let bestLag = minLag;
  let bestScore = -Infinity;
  let bestRaw = 0;
  const scores = new Map<number, number>();
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let i = 0; i + lag < n; i++) ac += x[i] * x[i + lag];
    ac /= norm;
    // Soft prior toward typical stock-music tempi so half/double-time
    // harmonics resolve toward the musically useful octave.
    const bpm = (60 * ENV_RATE) / lag;
    const prior = Math.exp(-0.5 * Math.pow((bpm - BPM_PRIOR_CENTER) / BPM_PRIOR_WIDTH, 2));
    const score = ac * (0.6 + 0.4 * prior);
    scores.set(lag, ac);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
      bestRaw = ac;
    }
  }

  // Octave correction: autocorrelation is equally strong at lag multiples, so
  // the 2-beat lag often wins (tempo halving). Prefer the half lag whenever it
  // carries comparable energy -- true slow tempi have weak half-lag energy
  // (offbeats carry no onsets), so they are unaffected.
  while (bestLag >= 2 * minLag) {
    // The true half period rarely lands on an integer bin -- take the best of
    // the neighborhood so bin-quantization doesn't hide it.
    const half = bestLag / 2;
    const candidates = [Math.floor(half) - 1, Math.floor(half), Math.ceil(half), Math.ceil(half) + 1]
      .filter((c) => c >= minLag);
    let bestHalfLag = -1;
    let bestHalfAc = -Infinity;
    for (const c of candidates) {
      const ac = scores.get(c) ?? -Infinity;
      if (ac > bestHalfAc) { bestHalfAc = ac; bestHalfLag = c; }
    }
    if (bestHalfLag > 0 && bestHalfAc >= 0.5 * (scores.get(bestLag) ?? bestRaw)) {
      bestLag = bestHalfLag;
      bestRaw = bestHalfAc;
    } else {
      break;
    }
  }

  // Parabolic refinement around the peak for sub-frame lag precision
  const l = bestLag;
  const y1 = scores.get(l - 1) ?? bestRaw;
  const y2 = scores.get(l) ?? bestRaw;
  const y3 = scores.get(l + 1) ?? bestRaw;
  const denom = y1 - 2 * y2 + y3;
  const shift = Math.abs(denom) > 1e-9 ? (0.5 * (y1 - y3)) / denom : 0;
  const refinedLag = l + Math.max(-0.5, Math.min(0.5, shift));

  const bpm = (60 * ENV_RATE) / refinedLag;
  return { bpm, confidence: Math.max(0, Math.min(1, bestRaw)) };
}

// ── Phase / downbeat ──

/**
 * Jointly refine tempo and phase: search beatSec in ±2.5% around the coarse
 * estimate, and for each candidate find the phase that maximizes summed onset
 * energy on the grid. The winning (beatSec, phase) pair minimizes cumulative
 * drift across the whole track.
 */
function refineGrid(env: Float32Array, beatSec0: number): { beatSec: number; phaseSec: number } {
  let best = { beatSec: beatSec0, phaseSec: 0, score: -Infinity };
  const steps = 51;
  for (let s = 0; s < steps; s++) {
    const beatSec = beatSec0 * (0.975 + (0.05 * s) / (steps - 1));
    const { phaseSec, score } = bestPhaseFor(env, beatSec);
    if (score > best.score) best = { beatSec, phaseSec, score };
  }
  return { beatSec: best.beatSec, phaseSec: best.phaseSec };
}

function bestPhaseFor(env: Float32Array, beatSec: number): { phaseSec: number; score: number } {
  const beatFrames = beatSec * ENV_RATE;
  const steps = 48;
  let bestOffset = 0;
  let bestScore = -Infinity;
  for (let s = 0; s < steps; s++) {
    const offset = (s / steps) * beatFrames;
    let score = 0;
    let count = 0;
    for (let t = offset; t < env.length - 1; t += beatFrames) {
      score += sampleEnv(env, t);
      count++;
    }
    if (count > 0) score /= count;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return { phaseSec: bestOffset / ENV_RATE, score: bestScore };
}

/**
 * Choose which of the 4 beat rotations is the downbeat: bar starts tend to
 * carry the strongest onsets. Falls back to the phase beat when ambiguous.
 */
function estimateDownbeat(env: Float32Array, beatSec: number, phaseSec: number): number {
  const beatFrames = beatSec * ENV_RATE;
  let bestRot = 0;
  let bestScore = -Infinity;
  for (let rot = 0; rot < 4; rot++) {
    const start = (phaseSec + rot * beatSec) * ENV_RATE;
    let score = 0;
    let count = 0;
    for (let t = start; t < env.length - 1; t += beatFrames * 4) {
      score += sampleEnv(env, t);
      count++;
    }
    if (count > 0) score /= count;
    if (score > bestScore) {
      bestScore = score;
      bestRot = rot;
    }
  }
  return phaseSec + bestRot * beatSec;
}

function sampleEnv(env: Float32Array, t: number): number {
  // Linear interpolation, with a ±1-frame max so slightly-early onsets count
  const i = Math.floor(t);
  if (i < 0 || i + 1 >= env.length) return 0;
  const frac = t - i;
  const interp = env[i] * (1 - frac) + env[i + 1] * frac;
  const nearby = Math.max(env[Math.max(0, i - 1)], env[i], env[Math.min(env.length - 1, i + 1)]);
  return 0.5 * interp + 0.5 * nearby;
}

// ── Cache ──

async function cachePathFor(filePath: string): Promise<string | null> {
  try {
    const st = await fs.stat(filePath);
    const key = crypto
      .createHash("sha1")
      .update(`${path.resolve(filePath)}|${st.size}|${st.mtimeMs}`)
      .digest("hex");
    return path.join(config.dataDir, "_system", "cache", "beatmaps", `${key}.json`);
  } catch {
    return null;
  }
}

async function readCache(filePath: string): Promise<BeatMap | null> {
  const p = await cachePathFor(filePath);
  if (!p) return null;
  try {
    const raw = await fs.readFile(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.bpm === "number" && typeof parsed?.barSec === "number") return parsed;
  } catch { /* miss */ }
  return null;
}

async function writeCache(filePath: string, map: BeatMap): Promise<void> {
  const p = await cachePathFor(filePath);
  if (!p) return;
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(map, null, 2));
  } catch { /* non-fatal */ }
}

function round2(x: number): number { return Math.round(x * 100) / 100; }
function round4(x: number): number { return Math.round(x * 10000) / 10000; }
