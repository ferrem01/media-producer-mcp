import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Amplitude peaks for the speaker/voiceover audio: N buckets per second of
 * max |amplitude| (0..1), extracted with ffmpeg (mono s16le decode) and
 * cached beside the project. Feeds the Studio timeline's waveform strip.
 */
export async function extractWaveformPeaks(
  audioPath: string,
  bucketsPerSecond = 6,
): Promise<number[]> {
  const SAMPLE_RATE = 4000;
  const raw: Buffer = await new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-i", audioPath,
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-map", "0:a:0",
      "-c:a", "pcm_s16le",
      "-f", "s16le",
      "-loglevel", "error",
      "-",
    ]);
    const chunks: Buffer[] = [];
    const errs: Buffer[] = [];
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.stderr.on("data", (c) => errs.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg waveform decode failed (${code}): ${Buffer.concat(errs).toString().slice(0, 300)}`));
    });
  });

  const samplesPerBucket = Math.max(1, Math.floor(SAMPLE_RATE / bucketsPerSecond));
  const totalSamples = Math.floor(raw.length / 2);
  const peaks: number[] = [];
  for (let start = 0; start < totalSamples; start += samplesPerBucket) {
    const end = Math.min(totalSamples, start + samplesPerBucket);
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(raw.readInt16LE(i * 2));
      if (v > max) max = v;
    }
    peaks.push(Math.round((max / 32768) * 100) / 100);
  }
  return peaks;
}

/** Cached wrapper: peaks JSON lives beside the project, keyed on the audio
 *  file's size+mtime so a re-recorded track refreshes automatically. */
export async function getWaveformPeaks(
  audioPath: string,
  cacheDir: string,
  bucketsPerSecond = 6,
): Promise<{ peaks: number[]; bucketsPerSecond: number }> {
  let key = "";
  try {
    const st = await fs.stat(audioPath);
    key = `${st.size}-${Math.round(st.mtimeMs)}-${bucketsPerSecond}`;
  } catch {
    throw new Error(`Audio file not found: ${audioPath}`);
  }
  const cacheFile = path.join(cacheDir, "waveform.json");
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, "utf-8"));
    if (cached.key === key && Array.isArray(cached.peaks)) {
      return { peaks: cached.peaks, bucketsPerSecond };
    }
  } catch {
    // no cache
  }
  const peaks = await extractWaveformPeaks(audioPath, bucketsPerSecond);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify({ key, peaks }), "utf-8");
  return { peaks, bucketsPerSecond };
}
