import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Speaker-track transcription via whisper.cpp: what was ACTUALLY said, with
 * timestamps -- the words lane prefers this over the storyboard's planned
 * script, and pins anchor to it. No API keys; the model runs on the box.
 *
 * Binary/model default to the paths scripts/setup-whisper.sh installs;
 * override with MP_WHISPER_BIN / MP_WHISPER_MODEL. When either is missing,
 * callers get `available: false` and Studio falls back to beat script.
 */

const WHISPER_BIN = () => process.env.MP_WHISPER_BIN || "/opt/whisper.cpp/build/bin/whisper-cli";
const WHISPER_MODEL = () => process.env.MP_WHISPER_MODEL || "/opt/whisper.cpp/models/ggml-base.en.bin";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export async function whisperAvailable(): Promise<boolean> {
  try {
    await fs.access(WHISPER_BIN());
    await fs.access(WHISPER_MODEL());
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on("data", (c) => out.push(c));
    p.stderr.on("data", (c) => err.push(c));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString());
      else reject(new Error(`${path.basename(cmd)} failed (${code}): ${Buffer.concat(err).toString().slice(-300)}`));
    });
  });
}

/**
 * Parse whisper.cpp JSON output (-oj, or -ojf with tokens) into segments.
 *
 * A segment's own offsets come from whisper's timestamp tokens, and on a
 * short clip they are wrong at both ends (Oct 12, proj_9f5caa73 scene 7, a
 * 10.04 s Seedance take: "That's" at 0.01 s for speech that starts at 0.85,
 * "have." ending at 11.70 s). With -dtw each token also carries t_dtw
 * (centiseconds), the cross-attention alignment, which lands within ~0.1 s
 * of the spoken word. A word starts at its first token's t_dtw and ends where
 * the next word starts; the last ends just after its last token. Offsets are
 * the fallback when the run carried no DTW times. `audioSeconds` clamps
 * every time to the file.
 */
export function parseWhisperJson(raw: string, audioSeconds?: number): TranscriptSegment[] {
  const j = JSON.parse(raw);
  const items = j?.transcription;
  if (!Array.isArray(items)) return [];
  const cap = audioSeconds && audioSeconds > 0 ? audioSeconds : Infinity;
  const clamp = (t: number) => Math.round(Math.min(cap, Math.max(0, t)) * 1000) / 1000;
  const words = items
    .map((it: any) => {
      const toks = (Array.isArray(it?.tokens) ? it.tokens : [])
        .filter((t: any) => !String(t?.text || "").startsWith("[_") && Number(t?.t_dtw) >= 0);
      return {
        text: String(it?.text || "").trim(),
        from: (it?.offsets?.from ?? 0) / 1000,
        to: (it?.offsets?.to ?? 0) / 1000,
        dtwStart: toks.length ? Number(toks[0].t_dtw) / 100 : null,
        dtwLast: toks.length ? Number(toks[toks.length - 1].t_dtw) / 100 : null,
      };
    })
    .filter((w: any) => w.text);
  const dtw = words.length > 0 && words.every((w: any) => w.dtwStart != null);
  if (!dtw) {
    return words
      .map((w: any) => ({ start: clamp(w.from), end: clamp(w.to), text: w.text }))
      .filter((s: TranscriptSegment) => s.end > s.start);
  }
  const starts: number[] = [];
  for (const w of words) starts.push(Math.max((w.dtwStart as number) - DTW_LAG, starts.length ? starts[starts.length - 1] : 0));
  return words.map((w: any, i: number) => {
    const start = clamp(starts[i]);
    const tail = i + 1 < words.length ? starts[i + 1] : Math.max(w.dtwLast, starts[i]) + DTW_LAST_WORD_TAIL;
    return { start, end: Math.max(clamp(tail), Math.min(cap, start + 0.05)), text: w.text };
  });
}

/** Past the last token's DTW time: the tail of the closing word. */
const DTW_LAST_WORD_TAIL = 0.2;
/** t_dtw lands a little after the word's onset: +0.06 to +0.20 s, ~0.11 s
 *  on average over 31 words hand-timed against the loudness trace in three
 *  base.en takes (proj_9f5caa73 scenes 5, 7 and 10, Oct 12). */
const DTW_LAG = 0.1;

/** The DTW alignment preset whisper.cpp ships for a ggml model file
 *  (ggml-base.en.bin -> "base.en"), or null for a model it has none for. */
export function dtwPreset(modelPath: string): string | null {
  const m = /^ggml-(.+)\.bin$/.exec(path.basename(modelPath));
  if (!m) return null;
  const name = m[1].replace(/-(v\d)/g, ".$1").replace(/-turbo$/, ".turbo");
  return DTW_PRESETS.has(name) ? name : null;
}
const DTW_PRESETS = new Set(["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large.v1", "large.v2", "large.v3", "large.v3.turbo"]);

/** What the installed whisper-cli can do: -dtw (token alignment), and
 *  -nfa (newer builds default flash attention ON, which leaves t_dtw empty). */
let featuresMemo: Promise<{ dtw: boolean; noFlashAttn: boolean }> | null = null;
function whisperFeatures(): Promise<{ dtw: boolean; noFlashAttn: boolean }> {
  if (!featuresMemo) {
    featuresMemo = new Promise((resolve) => {
      const p = spawn(WHISPER_BIN(), ["-h"]);
      const out: Buffer[] = [];
      p.stdout.on("data", (c) => out.push(c));
      p.stderr.on("data", (c) => out.push(c));
      p.on("error", () => resolve({ dtw: false, noFlashAttn: false }));
      p.on("close", () => {
        const help = Buffer.concat(out).toString();
        resolve({ dtw: /--dtw\b/.test(help), noFlashAttn: /--no-flash-attn\b/.test(help) });
      });
    });
  }
  return featuresMemo;
}

/** The transcript cache key: the file, the model, and how it was aligned
 *  (a DTW-aligned cache must not be read as an offsets one, nor back). */
function transcriptKey(st: { size: number; mtimeMs: number }, dtw: boolean): string {
  return `${st.size}-${Math.round(st.mtimeMs)}-${path.basename(WHISPER_MODEL())}-ml1sow${dtw ? "-dtw" : ""}`;
}

async function alignsWithDtw(): Promise<boolean> {
  return !!dtwPreset(WHISPER_MODEL()) && (await whisperFeatures()).dtw;
}

/**
 * Speaker edits change the narration FILE but not the words in it -- only
 * their times. Re-running whisper after every cut costs up to a minute and
 * empties the word lane meanwhile; instead the editing routes transform the
 * cached transcript (drop/shift word times) and re-key the cache to the new
 * file, so the very next fetch is instant and correct. Returns false when
 * there is no usable cache (callers fall back to a fresh transcription).
 */
export async function rekeyShiftTranscriptCache(
  cacheDir: string,
  newAudioPath: string,
  transform: (segments: TranscriptSegment[]) => TranscriptSegment[],
): Promise<boolean> {
  const cacheFile = path.join(cacheDir, "transcript.json");
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, "utf-8"));
    if (!Array.isArray(cached.segments)) return false;
    const st = await fs.stat(newAudioPath);
    const key = transcriptKey(st, await alignsWithDtw());
    await fs.writeFile(cacheFile, JSON.stringify({ key, segments: transform(cached.segments) }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop a cut span's words and close the gap. MUST run on SNAPPED words --
 * the clock users see and cut against; running it on raw whisper output
 * tears out words the silence-snap had rescued from a smeared gap.
 * Mid-based, so a word stretched across a boundary follows the side its
 * bulk is on; shifted starts clamp at the seam.
 */
export function shiftWordsForCut(
  segments: TranscriptSegment[],
  bakeFrom: number,
  bakeTo: number,
): TranscriptSegment[] {
  const d = bakeTo - bakeFrom;
  return segments
    .filter((w) => { const m = (w.start + w.end) / 2; return !(m >= bakeFrom && m < bakeTo); })
    .map((w) => {
      const m = (w.start + w.end) / 2;
      if (m < bakeTo) return w;
      const start = Math.max(bakeFrom, Math.round((w.start - d) * 100) / 100);
      return { ...w, start, end: Math.max(start + 0.05, Math.round((w.end - d) * 100) / 100) };
    });
}

/**
 * Whisper smears word timestamps across long mid-take silences: the words
 * spoken just before (or after) a pause get stretched INTO it to bridge the
 * gap. The word lane and the captions then promise speech where the track is
 * silent -- and word-anchored edits (pins, speaker cuts) aim at the wrong
 * times. The waveform knows better: given detected silence spans, pull every
 * word whose middle sits inside a silence back to real speech. Words up to
 * the last sentence-terminal finish the sentence BEFORE the pause (packed
 * against its left edge, compressed to the room available); the rest open
 * the sentence AFTER it.
 */
export function snapWordsOutOfSilences(
  segments: TranscriptSegment[],
  silences: Array<{ from: number; to: number }>,
  minSilence = 1.5,
): TranscriptSegment[] {
  const out = segments.map((w) => ({ ...w }));
  for (const sil of silences) {
    if (sil.to - sil.from < minSilence) continue;
    let first = -1;
    let last = -1;
    for (let i = 0; i < out.length; i++) {
      const w = out[i];
      const mid = (w.start + w.end) / 2;
      if (mid > sil.from + 0.2 && mid < sil.to - 0.2) {
        if (first === -1) first = i;
        last = i;
      } else if (w.start < sil.from - 0.1 && w.end > sil.from + 0.5) {
        w.end = sil.from; // spoken word stretched into the pause: it ended at the pause
      } else if (w.end > sil.to + 0.1 && w.start < sil.to - 0.5) {
        w.start = sil.to; // stretched backward into the pause: it started at speech onset
      }
    }
    if (first === -1) continue;
    const inside = out.slice(first, last + 1);
    let split = inside.length;
    for (let i = inside.length - 1; i >= 0; i--) {
      if (/[.?!]["')\]]?$/.test(inside[i].text.trim())) { split = i + 1; break; }
    }
    if (split > 0) {
      const prevEnd = first > 0 ? Math.min(out[first - 1].end, sil.from) : 0;
      const per = Math.min(0.45, Math.max(0.2, sil.from - prevEnd) / split);
      for (let i = 0; i < split; i++) {
        const w = inside[i];
        w.start = Math.max(0, sil.from - (split - i) * per);
        w.end = w.start + per;
      }
    }
    if (split < inside.length) {
      const n = inside.length - split;
      const nextStart = last + 1 < out.length ? Math.max(out[last + 1].start, sil.to) : sil.to + n * 0.45;
      const per = Math.min(0.45, Math.max(0.2, nextStart - sil.to) / n);
      for (let i = split; i < inside.length; i++) {
        const w = inside[i];
        w.start = sil.to + (i - split) * per;
        w.end = w.start + per;
      }
    }
  }
  return out;
}

/** Whisper anchors the opening word(s) at t=0 even when the recording
 *  starts with silence. Given the waveform's speech onset, pack the words
 *  that "start" clearly inside the leading silence into the ~0.3s/word
 *  window just before the first aligned word. */
export function snapLeadingWords(
  segments: TranscriptSegment[],
  onsetSeconds: number,
): TranscriptSegment[] {
  if (!segments.length || onsetSeconds <= 0.3) return segments;
  let n = 0;
  while (n < segments.length && segments[n].start < onsetSeconds - 0.25) n++;
  if (n === 0 || n > 8 || n >= segments.length) return segments; // nothing, or globally off -- don't guess
  const out = segments.slice();
  const anchor = Math.max(out[n].start, onsetSeconds);
  for (let i = 0; i < n; i++) {
    const start = Math.max(0, anchor - (n - i) * 0.3);
    out[i] = { ...out[i], start, end: Math.max(start + 0.2, i + 1 < n ? anchor - (n - i - 1) * 0.3 : anchor) };
  }
  return out;
}

export async function getTranscript(
  audioPath: string,
  cacheDir: string,
): Promise<{ segments: TranscriptSegment[] }> {
  const st = await fs.stat(audioPath);
  const dtw = await alignsWithDtw();
  const key = transcriptKey(st, dtw);
  const cacheFile = path.join(cacheDir, "transcript.json");
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, "utf-8"));
    if (cached.key === key && Array.isArray(cached.segments)) return { segments: cached.segments };
  } catch {
    // no cache
  }

  const tmpBase = path.join(os.tmpdir(), `mp_wh_${crypto.randomBytes(5).toString("hex")}`);
  const wav = `${tmpBase}.wav`;
  try {
    // whisper.cpp wants 16k mono wav.
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", audioPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
    // -ml 1: one word per segment -- word-level timestamps for the lane
    // and for pinning ("click the word, pick the frame"). -dtw: each word's
    // time from the token alignment (parseWhisperJson says why).
    const args = ["-m", WHISPER_MODEL(), "-f", wav, "-of", tmpBase, "-np", "-ml", "1", "-sow"];
    if (dtw) {
      args.push("-ojf", "-dtw", dtwPreset(WHISPER_MODEL())!);
      if ((await whisperFeatures()).noFlashAttn) args.push("-nfa");
    } else args.push("-oj");
    await run(WHISPER_BIN(), args);
    // 16 kHz mono s16le after a 44-byte header: the file's length.
    const audioSeconds = Math.max(0, ((await fs.stat(wav)).size - 44) / 32000);
    const segments = parseWhisperJson(await fs.readFile(`${tmpBase}.json`, "utf-8"), audioSeconds);
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify({ key, segments }), "utf-8");
    return { segments };
  } finally {
    await fs.unlink(wav).catch(() => {});
    await fs.unlink(`${tmpBase}.json`).catch(() => {});
  }
}
