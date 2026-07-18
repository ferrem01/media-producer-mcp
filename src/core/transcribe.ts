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

/** Parse whisper.cpp -oj output into segments (offsets are ms). */
export function parseWhisperJson(raw: string): TranscriptSegment[] {
  const j = JSON.parse(raw);
  const items = j?.transcription;
  if (!Array.isArray(items)) return [];
  return items
    .map((it: any) => ({
      start: (it?.offsets?.from ?? 0) / 1000,
      end: (it?.offsets?.to ?? 0) / 1000,
      text: String(it?.text || "").trim(),
    }))
    .filter((s: TranscriptSegment) => s.text && s.end > s.start);
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
  const key = `${st.size}-${Math.round(st.mtimeMs)}-${path.basename(WHISPER_MODEL())}-ml1sow`;
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
    // and for pinning ("click the word, pick the frame").
    await run(WHISPER_BIN(), ["-m", WHISPER_MODEL(), "-f", wav, "-oj", "-of", tmpBase, "-np", "-ml", "1", "-sow"]);
    const segments = parseWhisperJson(await fs.readFile(`${tmpBase}.json`, "utf-8"));
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify({ key, segments }), "utf-8");
    return { segments };
  } finally {
    await fs.unlink(wav).catch(() => {});
    await fs.unlink(`${tmpBase}.json`).catch(() => {});
  }
}
