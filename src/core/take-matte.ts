/**
 * BACKGROUND BLUR AT ATTACH (Marc, 2026-09-15: "how easy is it to add a
 * blurry background to the take"; 2026-09-20: "let's do the real one").
 *
 * Person matting on the server, per take, as an option next to the soft
 * look: Robust Video Matting (rvm_mobilenetv3, ONNX, CPU) gives a soft
 * per-frame alpha of the person; ffmpeg blurs the whole frame and lays the
 * sharp person back over it through that alpha. The raw take is KEPT: the
 * blur is a copy beside it (<name>-blur.mp4), so it can be undone, changed
 * or re-run when a better model comes along. Nothing runs on the phone --
 * the booth stays the reliable part.
 *
 * Cost: the model runs at a short side of 288px (~85 ms a frame on four
 * cores), so a 15 s take costs about 40 s; the recurrent states carry
 * frame to frame, so no flicker. The model file (15 MB) is fetched once
 * into <dataDir>/_system/models and checked by hash.
 *
 * THE TAKE AS A LAYER (Marc, 2026-09-20: "have the background just be
 * alpha"): the same matte also writes <name>-alpha.webm -- the person on
 * a transparent frame (VP9 with alpha, which Chromium plays and the render
 * decodes). A scene that carries a ground under the person (footage, a
 * still, a mock) places that file INSIDE the scene as a video layer
 * (core/speaker-layer.ts) instead of sitting on the opaque camera base,
 * so whatever lies under the speaker becomes the room behind them.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import { takeCopies, syncSpeakerClips, missingSpeakerCopies } from "./speaker-layer.js";
import { ensureSpeakerNeeds } from "./take-needs.js";

export const MATTE_MODEL_FILE = "rvm_mobilenetv3_fp32.onnx";
export const MATTE_MODEL_URL = "https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx";
export const MATTE_MODEL_SHA256 = "88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828";
/** The model sees the frame at this short side; the alpha is scaled back up. */
export const MATTE_SHORT_SIDE = 288;
/** The alpha is matted at most this many frames a second. A canvas take
 *  arrives with a 120 fps timebase and variable frames; decoding it as-is
 *  duplicated frames four times over (measured live: a 15 s take took five
 *  minutes on the server). Thirty is more than the mask needs. */
export const MATTE_MAX_FPS = 30;

export interface MatteOptions {
  dataDir: string;
  /** 0..1, how far out of focus the room goes (default 0.6). */
  strength?: number;
  /** Progress, every ~100 frames. */
  onProgress?: (done: number, total: number) => void;
  /** Write the blurred-room copy (<name>-blur.mp4). Default true. */
  blur?: boolean;
  /** Write the person-on-transparent copy (<name>-alpha.webm). Default false. */
  alpha?: boolean;
}

export interface MatteResult {
  /** The blurred copy (when asked). */
  output?: string;
  /** The alpha copy (when asked). */
  alpha?: string;
  /** Where the person stands, row by row (with the alpha copy). */
  silhouette?: { rows: Array<[number, number] | null> };
  frames: number;
  ms: number;
  model_size: { width: number; height: number };
  /** Frames a second the alpha was matted at. */
  fps: number;
}

/** The frame the model sees: short side MATTE_SHORT_SIDE, both sides
 *  multiples of 32 (the network's stride), aspect kept. */
export function matteSize(width: number, height: number): { width: number; height: number } {
  const short = Math.min(width, height), long = Math.max(width, height);
  const k = MATTE_SHORT_SIDE / short;
  const longSide = Math.max(32, Math.round((long * k) / 32) * 32);
  return width >= height ? { width: longSide, height: MATTE_SHORT_SIDE } : { width: MATTE_SHORT_SIDE, height: longSide };
}

/** Blur radius for the room at this frame width and strength: 8-32 px at
 *  1080 wide, scaled with the frame. */
export function matteBlurRadius(width: number, strength = 0.6): number {
  const s = Math.max(0, Math.min(1, strength));
  return Math.max(2, Math.round((8 + 24 * s) * (width / 1080)));
}

/** The ffmpeg graph: the frame split into the room (blurred) and the
 *  person (the frame under the alpha, scaled up from the model's size with
 *  a soft edge), the person over the room. */
export function matteFilterGraph(width: number, height: number, strength = 0.6): string {
  const r = matteBlurRadius(width, strength);
  return [
    `[0:v]split=2[base][fgsrc]`,
    `[base]boxblur=lr=${r}:lp=3[bg]`,
    `[1:v]scale=${width}:${height}:flags=bicubic,format=gray,gblur=sigma=1.5[m]`,
    `[fgsrc]format=rgba[fgc]`,
    `[fgc][m]alphamerge[fg]`,
    `[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[out]`,
  ].join(";");
}

/** The ffmpeg graph for the alpha copy: the frame under the upscaled alpha,
 *  the edge eroded a pixel (the model's soft fringe carries the room's
 *  colour; on a bright ground it reads as a halo) and softened again. */
export function matteAlphaGraph(width: number, height: number, fps: number): string {
  return [
    `[1:v]scale=${width}:${height}:flags=bicubic,format=gray,erosion,gblur=sigma=1.2[m]`,
    // The frame rate is pinned to the matte's: the alpha stream was
    // written at `fps`, and the layer is seeked by time, not by frame.
    `[0:v]fps=${fps},format=rgba[fgc]`,
    `[fgc][m]alphamerge,format=yuva420p[out]`,
  ].join(";");
}

/** The encoder for the alpha copy: VP9 with alpha in WebM (the one alpha
 *  video Chromium plays); no alt-ref frames (they break alpha), constant
 *  quality (crf 24: the person is the hero, crf 32 read soft), row threads. */
export const ALPHA_ENCODE_ARGS = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "24", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1", "-an"];

/** The alpha copy's name for a take file (…/take.mp4 -> …/take-alpha.webm). */
export function alphaCopyName(file: string): string {
  const ext = path.extname(file);
  return `${file.slice(0, file.length - ext.length)}-alpha.webm`;
}

/** True for a source that is an alpha copy of a take (VP9 alpha WebM). */
export function isAlphaVideoSrc(src: string): boolean {
  return /-alpha\.webm(\?|#|$)/i.test(String(src || ""));
}

/** The model, fetched once and checked. Throws when it cannot be had. */
export async function ensureMattingModel(dataDir: string): Promise<string> {
  const dir = path.join(dataDir, "_system", "models");
  const file = path.join(dir, MATTE_MODEL_FILE);
  if (await sha256Matches(file)) return file;
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${file}.part`;
  const res = await fetch(MATTE_MODEL_URL, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok || !res.body) throw new Error(`matting model download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(tmp, buf);
  if (!(await sha256Matches(tmp))) { await fsp.unlink(tmp).catch(() => {}); throw new Error("matting model download failed (hash mismatch)"); }
  await fsp.rename(tmp, file);
  return file;
}

async function sha256Matches(file: string): Promise<boolean> {
  try {
    const h = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve()).on("error", reject);
    });
    return h.digest("hex") === MATTE_MODEL_SHA256;
  } catch { return false; }
}

async function probeVideo(file: string): Promise<{ width: number; height: number; fps: number; hasAudio: boolean }> {
  let table = "";
  try { await execFileAsync("ffmpeg", ["-hide_banner", "-i", file], { maxBuffer: 4 * 1024 * 1024 }); }
  catch (e: any) {
    if (e?.code === "ENOENT") throw new Error("ffmpeg not found on PATH");
    table = String(e?.stderr || "");
  }
  const v = table.match(/Stream #\d+:\d+.*: Video: .*?\s(\d{2,5})x(\d{2,5})/);
  if (!v) throw new Error(`no video stream in ${path.basename(file)}`);
  const fpsM = table.match(/(\d+(?:\.\d+)?) fps/);
  return { width: Number(v[1]), height: Number(v[2]), fps: fpsM ? Number(fpsM[1]) : 30, hasAudio: /Stream #\d+:\d+.*: Audio:/.test(table) };
}

/**
 * Matte the person. Writes <name>-blur.mp4 (the room blurred) and/or
 * <name>-alpha.webm (the person on a transparent frame) beside the input
 * and returns their paths; the input is untouched. One matte pass feeds
 * both encodes.
 */
/** Where the person stands, row by row: for every matted frame, each
 *  row's leftmost and rightmost opaque pixel; the profile keeps the TYPICAL
 *  edge over the take (the median, so a hand flung out does not widen it,
 *  and a letter tucked behind it stays covered most of the time) on 36
 *  rows. speaker-3d tucks a side word's first letter behind this edge --
 *  the overlap is what reads as depth. */
export const SILHOUETTE_ROWS = 36;
export function silhouetteCollector() {
  const lefts: number[][] = Array.from({ length: SILHOUETTE_ROWS }, () => []);
  const rights: number[][] = Array.from({ length: SILHOUETTE_ROWS }, () => []);
  let n = 0;
  return {
    add(a: Uint8Array | Uint8ClampedArray, w: number, h: number) {
      // Sample at most ~1 frame in 3 past the first 60 (cheap and enough).
      n++; if (n > 60 && n % 3) return;
      for (let r = 0; r < SILHOUETTE_ROWS; r++) {
        const y0 = Math.floor((r * h) / SILHOUETTE_ROWS), y1 = Math.max(y0 + 1, Math.floor(((r + 1) * h) / SILHOUETTE_ROWS));
        let l = w, rt = -1;
        for (let y = y0; y < y1; y++) {
          const row = y * w;
          for (let x = 0; x < l; x++) if (a[row + x] > 128) { l = x; break; }
          for (let x = w - 1; x > rt; x--) if (a[row + x] > 128) { rt = x; break; }
        }
        if (rt >= l) { lefts[r].push(l / w); rights[r].push((rt + 1) / w); }
      }
    },
    profile(): { rows: Array<[number, number] | null> } | null {
      const pick = (v: number[], q: number) => { const s = v.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };
      let any = false;
      const rows = lefts.map((ls, r) => {
        // A row the person holds in under a fifth of the samples is empty.
        if (ls.length < Math.max(1, Math.round(n / 3) * 0.2)) return null;
        any = true;
        return [Math.round(pick(ls, 0.5) * 1000) / 1000, Math.round(pick(rights[r], 0.5) * 1000) / 1000] as [number, number];
      });
      return any ? { rows } : null;
    },
  };
}

export async function matteTake(input: string, opts: MatteOptions): Promise<MatteResult> {
  // The runtime's async run does not hold Node's event loop on its own
  // (measured: a bare script exited 0 mid-matte with nothing logged); in
  // the server the listener holds it, but this function must not depend
  // on that.
  const keep = setInterval(() => {}, 1000);
  try { return await matteTakeInner(input, opts); }
  finally { clearInterval(keep); }
}

async function matteTakeInner(input: string, opts: MatteOptions): Promise<MatteResult> {
  const t0 = Date.now();
  const modelPath = await ensureMattingModel(opts.dataDir);
  // Loaded here, not at module load: the native runtime is only paid for
  // by a take that asked for the blur.
  const ort: any = await import("onnxruntime-node");
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["cpu"], intraOpNumThreads: 4, graphOptimizationLevel: "all" });

  const probe = await probeVideo(input);
  const fps = Math.min(MATTE_MAX_FPS, probe.fps > 0 ? probe.fps : MATTE_MAX_FPS);
  const ms = matteSize(probe.width, probe.height);
  const mw = ms.width, mh = ms.height, frameBytes = mw * mh * 3;
  const ext = path.extname(input) || ".mp4";
  const base = path.join(path.dirname(input), path.basename(input, ext));
  const alphaRaw = `${base}.alpha.raw`;
  const wantBlur = opts.blur !== false;
  const wantAlpha = opts.alpha === true;
  const output = `${base}-blur.mp4`;
  const alphaOut = alphaCopyName(input);

  // ── Pass 1: decode small, matte, write the alpha ─────────────────────
  const dec = spawn("ffmpeg", ["-hide_banner", "-v", "error", "-i", input, "-vf", `fps=${fps},scale=${mw}:${mh}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
  let decErr = "";
  dec.stderr.on("data", (d) => { decErr += String(d); });
  // Registered NOW: with the matte slower than the decode, ffmpeg closes
  // long before the last frame is matted, and a listener attached after
  // the loop waits forever (measured: a 3 s slice never returned).
  const decDone = new Promise<number>((r) => dec.on("close", (c) => r(c ?? 0)));
  const alphaSink = fs.createWriteStream(alphaRaw);
  const zero = new ort.Tensor("float32", new Float32Array([0]), [1, 1, 1, 1]);
  let r1 = zero, r2 = zero, r3 = zero, r4 = zero;
  const dsr = new ort.Tensor("float32", new Float32Array([1]), [1]);
  const src = new Float32Array(3 * mh * mw);
  const plane = mh * mw;
  const edges = silhouetteCollector();
  let frames = 0;
  let carry: Buffer = Buffer.alloc(0);
  const runFrame = async (rgb: Buffer) => {
    for (let i = 0; i < plane; i++) { src[i] = rgb[i * 3] / 255; src[plane + i] = rgb[i * 3 + 1] / 255; src[2 * plane + i] = rgb[i * 3 + 2] / 255; }
    const out = await session.run({ src: new ort.Tensor("float32", src, [1, 3, mh, mw]), r1i: r1, r2i: r2, r3i: r3, r4i: r4, downsample_ratio: dsr });
    r1 = out.r1o; r2 = out.r2o; r3 = out.r3o; r4 = out.r4o;
    const pha: Float32Array = out.pha.data;
    const a = Buffer.allocUnsafe(plane);
    for (let i = 0; i < plane; i++) { const v = pha[i]; a[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255); }
    if (wantAlpha) edges.add(a, mw, mh);
    if (!alphaSink.write(a)) await new Promise<void>((r) => alphaSink.once("drain", () => r()));
    frames++;
    if (opts.onProgress && frames % 100 === 0) opts.onProgress(frames, 0);
  };
  for await (const chunk of dec.stdout as AsyncIterable<Buffer>) {
    let buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    let off = 0;
    while (buf.length - off >= frameBytes) { await runFrame(buf.subarray(off, off + frameBytes)); off += frameBytes; }
    carry = off < buf.length ? Buffer.from(buf.subarray(off)) : Buffer.alloc(0);
  }
  await new Promise<void>((resolve, reject) => { alphaSink.end(() => resolve()); alphaSink.on("error", reject); });
  const decCode = await decDone;
  if (decCode !== 0 || !frames) { await fsp.unlink(alphaRaw).catch(() => {}); throw new Error(`matte decode failed: ${decErr.slice(-300) || "no frames"}`); }

  // ── Pass 2: the copies. The blur: the room out of focus, the person
  // over it, the sound carried. The alpha: the person alone on a
  // transparent frame (muted -- the layer never owns the voice).
  const alphaIn = ["-f", "rawvideo", "-pix_fmt", "gray", "-video_size", `${mw}x${mh}`, "-framerate", String(fps), "-i", alphaRaw];
  try {
    if (wantBlur) {
      const args = ["-hide_banner", "-y", "-v", "error", "-i", input, ...alphaIn,
        "-filter_complex", matteFilterGraph(probe.width, probe.height, opts.strength),
        "-map", "[out]"];
      if (probe.hasAudio) args.push("-map", "0:a:0", "-c:a", "copy");
      args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
      try {
        await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
      } catch (e: any) {
        await fsp.unlink(output).catch(() => {});
        throw new Error(`matte composite failed: ${String(e?.stderr || e?.message || e).slice(-400)}`);
      }
    }
    if (wantAlpha) {
      const args = ["-hide_banner", "-y", "-v", "error", "-i", input, ...alphaIn,
        "-filter_complex", matteAlphaGraph(probe.width, probe.height, fps),
        "-map", "[out]", ...ALPHA_ENCODE_ARGS, "-threads", "4", alphaOut];
      try {
        await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
      } catch (e: any) {
        await fsp.unlink(alphaOut).catch(() => {});
        throw new Error(`matte alpha failed: ${String(e?.stderr || e?.message || e).slice(-400)}`);
      }
    }
  } finally {
    await fsp.unlink(alphaRaw).catch(() => {});
  }
  const silhouette = wantAlpha ? edges.profile() : null;
  return { ...(wantBlur ? { output } : {}), ...(wantAlpha ? { alpha: alphaOut, ...(silhouette ? { silhouette } : {}) } : {}), frames, ms: Date.now() - t0, model_size: ms, fps };
}

/**
 * THE MATTE RUNS AFTER THE ATTACH. Minutes of matting inside the attach
 * request held the connection past the proxy's limit (measured live: the
 * call dropped at 300 s). The take lands at once, raw; this job mattes the
 * file in the background and, when done, records the copies on every
 * take that owns the raw file, points the speaker track's clips at the
 * copy each scene's setting wants (syncSpeakerClips), and saves. Studio's
 * live sync picks up the new version. One job per file at a time; when it
 * ends and a scene's setting still lacks a copy (asked for while it ran),
 * it queues again.
 */
const matteJobs = new Set<string>();
export function queueTakeMatte(opts: {
  tenantId: string;
  projectId: string;
  /** The take's raw url as stored (/assets/...). */
  rawUrl: string;
  dataDir: string;
  /** The room blurred (<name>-blur.mp4). */
  blur?: boolean;
  /** The person on a transparent frame (<name>-alpha.webm). */
  alpha?: boolean;
  strength?: number;
  resolvePath: (url: string) => string;
  loadProject: (t: string, p: string) => Promise<any>;
  saveProject: (project: any) => Promise<void>;
  afterSave?: (tenantId: string, projectId: string) => void;
}): boolean {
  if (!opts.blur && !opts.alpha) return false;
  const key = `${opts.tenantId}/${opts.projectId}/${opts.rawUrl}`;
  if (matteJobs.has(key)) return false;
  matteJobs.add(key);
  setTimeout(async () => {
    const again = { blur: false, alpha: false };
    try {
      const m = await matteTake(opts.resolvePath(opts.rawUrl), { dataDir: opts.dataDir, strength: opts.strength, blur: !!opts.blur, alpha: !!opts.alpha, onProgress: (n) => console.log(`  take matte: ${n} frames...`) });
      const blurUrl = m.output ? opts.rawUrl.replace(/[^/]+$/, path.basename(m.output)) : undefined;
      const alphaUrl = m.alpha ? opts.rawUrl.replace(/[^/]+$/, path.basename(m.alpha)) : undefined;
      const project = await opts.loadProject(opts.tenantId, opts.projectId);
      if (!project) return;
      let owned = 0;
      for (const t of project.takes || []) {
        if (takeCopies(t).raw !== opts.rawUrl) continue;
        if (blurUrl) t.blur = blurUrl;
        if (alphaUrl) t.alpha = alphaUrl;
        if (alphaUrl && m.silhouette) t.silhouette = m.silhouette;
        owned++;
        const miss = missingSpeakerCopies(project, t);
        again.blur = again.blur || miss.blur; again.alpha = again.alpha || miss.alpha;
      }
      const synced = syncSpeakerClips(project);
      ensureSpeakerNeeds(project);
      project.updated_at = new Date().toISOString();
      await opts.saveProject(project);
      console.log(`  take matte: ${[m.output, m.alpha].filter(Boolean).map((f) => path.basename(f!)).join(" + ")} in ${Math.round(m.ms / 1000)}s (${m.frames} frames); ${owned} take(s) updated, ${synced} clip field(s) re-pointed`);
      if (opts.afterSave) opts.afterSave(opts.tenantId, opts.projectId);
    } catch (e: any) {
      console.warn(`  take matte failed for ${path.basename(opts.rawUrl)}: ${e?.message || e}`);
    } finally {
      matteJobs.delete(key);
      if (again.blur || again.alpha) queueTakeMatte({ ...opts, ...again });
    }
  }, 50);
  return true;
}
