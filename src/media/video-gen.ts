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
 *  and it's several times cheaper per second. Override with MP_VEO_MODEL. */
const DEFAULT_MODEL = "veo-3.0-fast-generate-001";

const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 6 * 60_000;

export interface VideoGenOptions {
  /** The shot description -- written like a cinematography direction. */
  prompt: string;
  /** "16:9" (landscape films) or "9:16" (vertical reels). */
  aspectRatio: "16:9" | "9:16";
  outputDir: string;
  filename: string;
  apiKey?: string;
  model?: string;
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
  const model = opts.model || process.env.MP_VEO_MODEL || DEFAULT_MODEL;

  try {
    console.log(`  Video gen: "${opts.prompt.substring(0, 70)}..." model=${model} aspect=${opts.aspectRatio}`);

    // 1. Submit the long-running generation.
    const submit = await fetch(`${GEMINI_BASE}/models/${model}:predictLongRunning`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        instances: [{ prompt: opts.prompt }],
        parameters: { aspectRatio: opts.aspectRatio },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!submit.ok) {
      console.warn(`  Video gen: Veo submit failed ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
      return null;
    }
    const op = (await submit.json()) as { name?: string };
    if (!op.name) {
      console.warn("  Video gen: Veo submit returned no operation name");
      return null;
    }

    // 2. Poll the operation until done.
    const deadline = Date.now() + MAX_WAIT_MS;
    let videoUri: string | undefined;
    for (;;) {
      if (Date.now() > deadline) {
        console.warn(`  Video gen: Veo operation timed out after ${MAX_WAIT_MS / 60000} min`);
        return null;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const poll = await fetch(`${GEMINI_BASE}/${op.name}`, {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(30_000),
      });
      if (!poll.ok) {
        console.warn(`  Video gen: Veo poll failed ${poll.status}`);
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
        console.warn(`  Video gen: Veo operation error: ${status.error.message || "unknown"}`);
        return null;
      }
      const gvr = status.response?.generateVideoResponse;
      videoUri = gvr?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) {
        const filtered = gvr?.raiMediaFilteredCount;
        console.warn(`  Video gen: Veo finished with no video${filtered ? ` (${filtered} filtered by safety policy -- soften the prompt)` : ""}`);
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
      console.warn(`  Video gen: Veo download failed ${dl.status}`);
      return null;
    }
    await fs.mkdir(opts.outputDir, { recursive: true });
    const localPath = path.join(opts.outputDir, opts.filename);
    await fs.writeFile(localPath, Buffer.from(await dl.arrayBuffer()));
    const size = (await fs.stat(localPath)).size;
    if (size < 10_000) {
      console.warn(`  Video gen: downloaded clip suspiciously small (${size} bytes) -- discarding`);
      await fs.unlink(localPath).catch(() => {});
      return null;
    }
    console.log(`  Video gen: clip saved (${(size / 1024 / 1024).toFixed(1)}MB) -> ${opts.filename}`);
    return { localPath, model };
  } catch (e: any) {
    console.warn(`  Video gen: ${e?.message || e}`);
    return null;
  }
}
