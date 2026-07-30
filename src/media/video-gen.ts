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
