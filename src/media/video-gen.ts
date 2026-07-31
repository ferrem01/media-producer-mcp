/**
 * Diffusion video generation (Veo via the Gemini API).
 *
 * The third media fetcher, beside generated stills (image-gen.ts) and Pexels
 * stock (stock-footage.ts): for shots stock footage cannot plausibly contain
 * -- product-specific moments, branded scenes, surreal transitions. Generated
 * clips land in the project's assets dir and ride the exact same
 * brollVideoUrl channel real footage uses; everything downstream (EDL,
 * frame-swap capture, darkened-background composition) treats video as video.
 *
 * Gated on GEMINI_API_KEY. Veo runs as a long-running operation: submit the
 * prompt, poll the operation until done (typically 1-3 minutes), download the
 * resulting mp4. Clips are ~8s; scenes longer than the clip loop/hold like
 * any short b-roll.
 */

import fs from "node:fs/promises";
import path from "node:path";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Fast tier by default: background b-roll doesn't need the flagship model,
 *  and it's several times cheaper per second. Override with MP_VEO_MODEL.
 *  If this id 404s (Google rotates Veo model ids), the available Veo models
 *  are DISCOVERED from ListModels and the best fast one is used instead. */
const DEFAULT_MODEL = "veo-3.0-fast-generate-001";

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 6 * 60_000;

/** The last failure reason, for callers that surface errors to users (the
 *  job path) -- the function itself degrades to null by design. */
let lastError: string | undefined;
export function lastVideoGenError(): string | undefined {
  return lastError;
}

/** Discovered-and-cached Veo model id (survives for the process). */
let discoveredModel: string | undefined;

/** List the API's models and pick the best Veo video model: prefer "fast"
 *  variants (cheaper, fine for backgrounds), then the highest version. */
async function discoverVeoModel(apiKey: string): Promise<string | undefined> {
  if (discoveredModel) return discoveredModel;
  try {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=1000`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`  Video gen: ListModels failed ${res.status} while discovering a Veo model`);
      return undefined;
    }
    const data = (await res.json()) as { models?: Array<{ name?: string; supportedGenerationMethods?: string[] }> };
    const veo = (data.models || [])
      .map((m) => (m.name || "").replace(/^models\//, ""))
      .filter((n) => /veo/i.test(n));
    if (veo.length === 0) {
      console.warn("  Video gen: the API lists no Veo models for this key");
      return undefined;
    }
    const score = (n: string) => {
      const ver = parseFloat((n.match(/veo-(\d+(?:\.\d+)?)/) || [])[1] || "0");
      return ver * 10 + (/fast/i.test(n) ? 1 : 0);
    };
    veo.sort((a, b) => score(b) - score(a));
    discoveredModel = veo[0];
    console.log(`  Video gen: discovered Veo models [${veo.join(", ")}] -- using ${discoveredModel}`);
    return discoveredModel;
  } catch (e: any) {
    console.warn(`  Video gen: model discovery failed: ${e?.message || e}`);
    return undefined;
  }
}

export interface VideoGenOptions {
  /** The shot description -- written like a cinematography direction. */
  prompt: string;
  /** "16:9" (landscape films) or "9:16" (vertical reels). */
  aspectRatio: "16:9" | "9:16";
  outputDir: string;
  filename: string;
  apiKey?: string;
  model?: string;
  /** First-frame conditioning for CHARACTER CONSISTENCY: the clip animates
   *  from this image, so the same reference (a presenter frame from a prior
   *  take, a character sheet) keeps the same person/look across clips.
   *  Local file path -- read and base64d into the request. */
  referenceImagePath?: string;
}

export interface VideoGenResult {
  /** Local path to the downloaded mp4. */
  localPath: string;
  model: string;
}

/**
 * Generate one clip with Veo. Returns null (never throws) when the key is
 * missing -- mirrors the stock-footage contract so the pipeline degrades to
 * "no clip" instead of failing the film. API/timeout errors also return null
 * after logging: a missing background clip is a quality loss, not a reason
 * to kill a generate job.
 */
export async function generateVideoClip(opts: VideoGenOptions): Promise<VideoGenResult | null> {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("  Video gen: GEMINI_API_KEY not set, skipping");
    return null;
  }
  let model = opts.model || process.env.MP_VEO_MODEL || discoveredModel || DEFAULT_MODEL;
  lastError = undefined;

  try {
    console.log(`  Video gen: "${opts.prompt.substring(0, 70)}..." model=${model} aspect=${opts.aspectRatio}`);

    // First-frame image conditioning (character consistency across takes).
    let imagePart: { bytesBase64Encoded: string; mimeType: string } | undefined;
    if (opts.referenceImagePath) {
      const bytes = await fs.readFile(opts.referenceImagePath);
      const ext = path.extname(opts.referenceImagePath).toLowerCase();
      const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
      imagePart = { bytesBase64Encoded: bytes.toString("base64"), mimeType };
      console.log(`  Video gen: conditioning on reference image ${path.basename(opts.referenceImagePath)} (${(bytes.length / 1024).toFixed(0)}KB)`);
    }

    // 1. Submit the long-running generation. A model-id 404 triggers ONE
    //    discovery pass (Google rotates Veo ids: -preview vs -001, 3.0 vs
    //    3.1) and a retry with what the key actually serves.
    const submitOnce = (m: string) =>
      fetch(`${GEMINI_BASE}/models/${m}:predictLongRunning`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          instances: [{ prompt: opts.prompt, ...(imagePart ? { image: imagePart } : {}) }],
          parameters: { aspectRatio: opts.aspectRatio },
        }),
        signal: AbortSignal.timeout(60_000),
      });
    let submit = await submitOnce(model);
    if (submit.status === 404 && !opts.model && !process.env.MP_VEO_MODEL) {
      console.warn(`  Video gen: model "${model}" not found -- discovering available Veo models`);
      const found = await discoverVeoModel(apiKey);
      if (found && found !== model) {
        model = found;
        submit = await submitOnce(model);
      }
    }
    if (!submit.ok) {
      const body = (await submit.text()).slice(0, 500);
      lastError = `Veo submit failed ${submit.status} (model ${model}): ${body}`;
      console.warn(`  Video gen: ${lastError}`);
      return null;
    }
    const op = (await submit.json()) as { name?: string };
    if (!op.name) {
      lastError = "Veo submit returned no operation name";
      console.warn(`  Video gen: ${lastError}`);
      return null;
    }

    // 2. Poll the operation until done.
    const deadline = Date.now() + MAX_WAIT_MS;
    let videoUri: string | undefined;
    for (;;) {
      if (Date.now() > deadline) {
        lastError = `Veo operation timed out after ${MAX_WAIT_MS / 60000} min`;
        console.warn(`  Video gen: ${lastError}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const poll = await fetch(`${GEMINI_BASE}/${op.name}`, {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(30_000),
      });
      if (!poll.ok) {
        lastError = `Veo operation poll failed ${poll.status}`;
        console.warn(`  Video gen: ${lastError}`);
        return null;
      }
      const status = (await poll.json()) as {
        done?: boolean;
        error?: { message?: string };
        response?: {
          generateVideoResponse?: {
            generatedSamples?: Array<{ video?: { uri?: string } }>;
            raiMediaFilteredCount?: number;
          };
        };
      };
      if (!status.done) continue;
      if (status.error) {
        lastError = `Veo operation error: ${status.error.message || "unknown"}`;
        console.warn(`  Video gen: ${lastError}`);
        return null;
      }
      const gvr = status.response?.generateVideoResponse;
      videoUri = gvr?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) {
        const filtered = gvr?.raiMediaFilteredCount;
        lastError = `Veo finished with no video${filtered ? ` (${filtered} filtered by safety policy -- soften the prompt)` : ""}`;
        console.warn(`  Video gen: ${lastError}`);
        return null;
      }
      break;
    }

    // 3. Download the clip (the file URI requires the API key).
    const dl = await fetch(videoUri, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(120_000),
    });
    if (!dl.ok) {
      lastError = `Veo clip download failed ${dl.status}`;
      console.warn(`  Video gen: ${lastError}`);
      return null;
    }
    await fs.mkdir(opts.outputDir, { recursive: true });
    const localPath = path.join(opts.outputDir, opts.filename);
    await fs.writeFile(localPath, Buffer.from(await dl.arrayBuffer()));
    const size = (await fs.stat(localPath)).size;
    if (size < 10_000) {
      lastError = `downloaded clip suspiciously small (${size} bytes) -- discarded`;
      console.warn(`  Video gen: ${lastError}`);
      await fs.unlink(localPath).catch(() => {});
      return null;
    }
    console.log(`  Video gen: clip saved (${(size / 1024 / 1024).toFixed(1)}MB) -> ${opts.filename}`);
    return { localPath, model };
  } catch (e: any) {
    lastError = String(e?.message || e);
    console.warn(`  Video gen: ${lastError}`);
    return null;
  }
}

// ── Script-to-presenter: a full speech, one consistent presenter ──────────

/** Split a speech into Veo-sized takes at sentence boundaries. ~22 words is
 *  what a natural delivery fits in an 8s clip; a single longer sentence gets
 *  its own take rather than a mid-sentence cut. Exported for tests. */
export function chunkScript(script: string, maxWords = 22): string[] {
  const sentences = (script.replace(/\s+/g, " ").trim()
    .match(/[^.?!]+[.?!]+(?:["')\]]+)?|[^.?!]+$/g) || [])
    .map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur: string[] = [];
  let curWords = 0;
  for (const s of sentences) {
    const w = s.split(/\s+/).length;
    if (curWords > 0 && curWords + w > maxWords) {
      chunks.push(cur.join(" "));
      cur = [];
      curWords = 0;
    }
    cur.push(s);
    curWords += w;
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks;
}

const MAX_TAKES = 8;
const FFMPEG = () => process.env.MP_FFMPEG || "ffmpeg";

/** Loudness target for stitched presenter takes (mean dBFS over the spoken
 *  window) and the true-peak ceiling the limiter holds. Veo's takes vary
 *  take-to-take -- measured on quotient_pitch_v3: take 1 -26.0 dB mean, take
 *  2 -19.5 dB mean peaking at -0.2 dBFS (essentially clipping, which is what
 *  made the middle segment sound loud and tinny), take 3 -23.4 dB. */
const TARGET_MEAN_DB = -23;
const PEAK_CEILING = 0.85; // ~-1.4 dBFS

/** dB gain that moves `meanDb` to the target, clamped so a mis-measure can
 *  never blow up or mute a take. Exported for tests. */
export function normalizationGainDb(meanDb: number | null, target = TARGET_MEAN_DB): number {
  if (meanDb === null || !Number.isFinite(meanDb)) return 0;
  return Math.max(-12, Math.min(12, Math.round((target - meanDb) * 100) / 100));
}

/** Mean volume (dBFS) of a file's audio, optionally over a window. */
async function probeMeanVolume(
  run: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>,
  file: string,
  ss?: number,
  to?: number,
): Promise<number | null> {
  const args: string[] = [];
  if (ss !== undefined) args.push("-ss", ss.toFixed(2));
  if (to !== undefined) args.push("-to", to.toFixed(2));
  args.push("-i", file, "-af", "volumedetect", "-f", "null", "-");
  const parse = (s: string): number | null => {
    const m = s.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/);
    return m ? Number(m[1]) : null;
  };
  try {
    const { stderr } = await run(FFMPEG(), args);
    return parse(String(stderr || ""));
  } catch (e: any) {
    return parse(String(e?.stderr || ""));
  }
}

/** Media duration in seconds, parsed from ffmpeg's own banner (ffprobe is
 *  not guaranteed on the box; ffmpeg is -- the renderer already relies on it). */
async function probeDuration(
  run: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>,
  file: string,
): Promise<number> {
  const parse = (s: string): number => {
    const m = s.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  };
  try {
    const { stderr } = await run(FFMPEG(), ["-i", file, "-f", "null", "-"]);
    return parse(String(stderr || ""));
  } catch (e: any) {
    return parse(String(e?.stderr || ""));
  }
}

export interface PresenterVideoOptions {
  /** The full speech, verbatim. */
  script: string;
  /** Presenter description (appearance, setting, light). */
  presenter?: string;
  aspectRatio: "16:9" | "9:16";
  outputDir: string;
  /** Sanitized filename stem; takes save as <stem>_take_N.mp4, concat as <stem>.mp4 */
  nameStem: string;
  apiKey?: string;
  onProgress?: (detail: string, fraction: number) => void;
}

export interface PresenterVideoResult {
  concatPath: string;
  takes: Array<{ path: string; filename: string; line: string; transcript?: string }>;
  model: string;
  referenceFramePath: string;
  /** Seconds into the stitched clip where each take boundary lands. A film
   *  can hide these seams the way an editor does -- cut away to the product
   *  surface exactly here -- instead of holding on the presenter through the
   *  join. Empty for a single-take speech. */
  seams: number[];
}

const DEFAULT_PRESENTER =
  "A friendly professional presenter in their 30s at a bright modern desk, soft natural window light, softly blurred office background";

/**
 * Generate a presenter delivering a full script as N consistent Veo takes,
 * concatenated into one clip ready to be a film's speaker_source.
 *  - take 1 establishes the presenter from the description
 *  - a settle frame from take 1 becomes the reference image for every later
 *    take (same face, framing, light); the prompt also pins voice/tone --
 *    face consistency is strong, VOICE consistency is best-effort
 *  - each take is whisper-verified (transcript returned) when available
 * Throws on unrecoverable failures (this is a user-facing job, not a
 * background fetcher -- silence would hide a half-generated speech).
 */
export async function generatePresenterVideo(opts: PresenterVideoOptions): Promise<PresenterVideoResult> {
  const lines = chunkScript(opts.script);
  if (lines.length === 0) throw new Error("script is empty");
  if (lines.length > MAX_TAKES) {
    throw new Error(`script too long: ${lines.length} takes needed (cap ${MAX_TAKES}, ~${MAX_TAKES * 8}s of speech). Trim the script or split it into parts.`);
  }
  const presenter = opts.presenter || DEFAULT_PRESENTER;
  await fs.mkdir(opts.outputDir, { recursive: true });

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);

  const takes: Array<PresenterVideoResult["takes"][number] & { speechStart?: number; speechEnd?: number }> = [];
  let model = "";
  let referenceFramePath = "";
  let firstReferencePath = "";

  for (let i = 0; i < lines.length; i++) {
    opts.onProgress?.(`Take ${i + 1}/${lines.length} (Veo)`, (i / (lines.length + 1)));
    const filename = `${opts.nameStem}_take_${i + 1}.mp4`;
    // CAMERA LOCK on multi-take speeches: take 1 used to be the only take
    // with a push-in, so it ended slightly tighter than take 2 began -- a
    // scale pop at the FIRST seam only (measured live on quotient_pitch_v2:
    // seam 1 blipped, seam 2-3 was invisible, and both later takes were
    // already static). A single-take clip keeps the push-in; it has no seam
    // to betray.
    const multiTake = lines.length > 1;
    const cameraNote = multiTake
      ? "Locked-off static camera: no zoom, no push-in, no camera movement, constant framing and shot size."
      : "Static camera with a very slight slow push-in.";
    const prompt = i === 0
      ? `${presenter}. They look directly into the camera and say, warmly and naturally: '${lines[i]}' ${cameraNote} Shallow depth of field.`
      : `The exact same presenter as the reference image -- identical appearance, clothing, voice, tone, framing, shot size and lighting, continuing the same take from exactly this pose. They keep speaking directly to camera and say: '${lines[i]}' ${cameraNote} Shallow depth of field.`;
    const clip = await generateVideoClip({
      prompt,
      aspectRatio: opts.aspectRatio,
      outputDir: opts.outputDir,
      filename,
      apiKey: opts.apiKey,
      referenceImagePath: i === 0 ? undefined : referenceFramePath,
    });
    if (!clip) {
      throw new Error(`Take ${i + 1}/${lines.length} failed: ${lastError || "unknown Veo failure"}${takes.length ? ` (${takes.length} earlier take(s) saved)` : ""}`);
    }
    model = clip.model;
    takes.push({ path: clip.localPath, filename, line: lines[i] });

    // CHAINED reference: take N+1 anchors to take N's FINAL frame, so each
    // cut continues from the pose the previous take actually ended in.
    // (Measured on the first live run: anchoring every take to take 1's
    // settle frame made each cut visibly jerk back to that pose.)
    referenceFramePath = path.join(opts.outputDir, `${opts.nameStem}_ref_${i + 1}.jpg`);
    await run(FFMPEG(), ["-y", "-sseof", "-0.1", "-i", clip.localPath, "-frames:v", "1", "-q:v", "3", referenceFramePath]);
    if (i === 0) firstReferencePath = referenceFramePath;
  }

  // Whisper each take: the transcript rides back for script verification,
  // and the segment timings mark the SPOKEN window so the stitch can trim
  // the dead air (lead-in silence, post-line settle) that read as a
  // pause-then-jerk at every cut on the first live run.
  try {
    const { whisperAvailable, getTranscript } = await import("../core/transcribe.js");
    if (await whisperAvailable()) {
      const cacheDir = path.join(opts.outputDir, ".presenter-transcripts");
      for (const t of takes) {
        try {
          const { segments } = await getTranscript(t.path, cacheDir);
          t.transcript = segments.map((s) => s.text.trim()).join(" ").trim();
          if (segments.length) {
            t.speechStart = segments[0].start;
            t.speechEnd = segments[segments.length - 1].end;
          }
        } catch { /* per-take best effort */ }
      }
    }
  } catch { /* transcription optional */ }

  // Stitch. When speech timings exist, trim each take to its spoken window
  // (small lead-in/out so words never clip) and re-encode the trimmed
  // pieces with uniform settings; the concat of our own uniform encodes is
  // then a clean stream-copy. Without timings, concat the raw takes.
  opts.onProgress?.("Stitching takes", lines.length / (lines.length + 1));
  const concatPath = path.join(opts.outputDir, `${opts.nameStem}.mp4`);
  const listPath = path.join(opts.outputDir, `${opts.nameStem}_concat.txt`);
  const LEAD_IN = 0.2, LEAD_OUT = 0.25;
  const pieces: string[] = [];
  const pieceDurations: number[] = [];
  for (let i = 0; i < takes.length; i++) {
    const t = takes[i];
    if (t.speechStart === undefined || t.speechEnd === undefined || t.speechEnd <= t.speechStart) {
      pieces.push(t.path);
      pieceDurations.push(await probeDuration(run, t.path));
      continue;
    }
    const ss = Math.max(0, t.speechStart - LEAD_IN);
    const to = t.speechEnd + LEAD_OUT; // past EOF is fine -- ffmpeg stops at the end
    const trimmed = path.join(opts.outputDir, `${opts.nameStem}_trim_${i + 1}.mp4`);
    // Match this take's loudness to the others and keep peaks off the
    // ceiling: Veo hands back takes that differ by ~6dB, and a take that
    // peaks at -0.2 dBFS reads as loud and tinny next to its neighbours.
    const meanDb = await probeMeanVolume(run, t.path, ss, to);
    const gainDb = normalizationGainDb(meanDb);
    if (meanDb !== null) {
      console.log(`  Presenter: take ${i + 1} mean ${meanDb.toFixed(1)}dB -> ${gainDb >= 0 ? "+" : ""}${gainDb}dB (target ${TARGET_MEAN_DB}dB)`);
    }
    try {
      await run(FFMPEG(), [
        "-y", "-ss", ss.toFixed(2), "-to", to.toFixed(2), "-i", t.path,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
        "-af", `volume=${gainDb}dB,alimiter=limit=${PEAK_CEILING}`,
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        trimmed,
      ]);
      pieces.push(trimmed);
      pieceDurations.push(await probeDuration(run, trimmed));
    } catch {
      console.warn(`  Presenter: trim failed on take ${i + 1} -- using the raw take`);
      pieces.push(t.path);
      pieceDurations.push(await probeDuration(run, t.path));
    }
  }
  // Seam positions in the stitched clip: where a film should cut away.
  const seams: number[] = [];
  let acc = 0;
  for (let i = 0; i < pieceDurations.length - 1; i++) {
    acc += pieceDurations[i];
    seams.push(Math.round(acc * 100) / 100);
  }
  await fs.writeFile(listPath, pieces.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const uniformTrims = pieces.every((p) => p.includes("_trim_"));
  try {
    if (!uniformTrims) throw new Error("mixed sources -- re-encode the concat");
    await run(FFMPEG(), ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath]);
  } catch {
    await run(FFMPEG(), ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", concatPath]);
  }
  await fs.unlink(listPath).catch(() => {});
  for (const p of pieces) {
    if (p.includes("_trim_")) await fs.unlink(p).catch(() => {});
  }

  // Seam sidecar: a film built on this clip reads it (concatPath minus the
  // extension + .seams.json) and briefs a product takeover over every join,
  // so the multi-take stitch is hidden by the edit rather than by luck.
  if (seams.length) {
    await fs.writeFile(concatPath.replace(/\.[^.]+$/, "") + ".seams.json", JSON.stringify(seams)).catch(() => {});
  }

  return { concatPath, takes, model, referenceFramePath: firstReferencePath, seams };
}
