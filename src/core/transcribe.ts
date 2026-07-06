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
