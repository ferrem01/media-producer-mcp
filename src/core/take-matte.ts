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
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
}

export interface MatteResult {
  output: string;
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
 * Blur the room behind the person. Writes <name>-blur<ext> beside the
 * input and returns its path; the input is untouched.
 */
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
  const output = `${base}-blur.mp4`;

  // ── Pass 1: decode small, matte, write the alpha ─────────────────────
  const dec = spawn("ffmpeg", ["-hide_banner", "-v", "error", "-i", input, "-vf", `fps=${fps},scale=${mw}:${mh}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
  let decErr = "";
  dec.stderr.on("data", (d) => { decErr += String(d); });
  // Registered NOW: with the matte slower than the decode, ffmpeg closes
  // long before the last frame is matted, and a listener attached after
  // the loop waits forever (measured: a 3 s slice never returned).
  const decDone = new Promise<number>((r) => dec.on("close", (c) => r(c ?? 0)));
  const alphaOut = fs.createWriteStream(alphaRaw);
  const zero = new ort.Tensor("float32", new Float32Array([0]), [1, 1, 1, 1]);
  let r1 = zero, r2 = zero, r3 = zero, r4 = zero;
  const dsr = new ort.Tensor("float32", new Float32Array([1]), [1]);
  const src = new Float32Array(3 * mh * mw);
  const plane = mh * mw;
  let frames = 0;
  let carry: Buffer = Buffer.alloc(0);
  const runFrame = async (rgb: Buffer) => {
    for (let i = 0; i < plane; i++) { src[i] = rgb[i * 3] / 255; src[plane + i] = rgb[i * 3 + 1] / 255; src[2 * plane + i] = rgb[i * 3 + 2] / 255; }
    const out = await session.run({ src: new ort.Tensor("float32", src, [1, 3, mh, mw]), r1i: r1, r2i: r2, r3i: r3, r4i: r4, downsample_ratio: dsr });
    r1 = out.r1o; r2 = out.r2o; r3 = out.r3o; r4 = out.r4o;
    const pha: Float32Array = out.pha.data;
    const a = Buffer.allocUnsafe(plane);
    for (let i = 0; i < plane; i++) { const v = pha[i]; a[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255); }
    if (!alphaOut.write(a)) await new Promise<void>((r) => alphaOut.once("drain", () => r()));
    frames++;
    if (opts.onProgress && frames % 100 === 0) opts.onProgress(frames, 0);
  };
  for await (const chunk of dec.stdout as AsyncIterable<Buffer>) {
    let buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    let off = 0;
    while (buf.length - off >= frameBytes) { await runFrame(buf.subarray(off, off + frameBytes)); off += frameBytes; }
    carry = off < buf.length ? Buffer.from(buf.subarray(off)) : Buffer.alloc(0);
  }
  await new Promise<void>((resolve, reject) => { alphaOut.end(() => resolve()); alphaOut.on("error", reject); });
  const decCode = await decDone;
  if (decCode !== 0 || !frames) { await fsp.unlink(alphaRaw).catch(() => {}); throw new Error(`matte decode failed: ${decErr.slice(-300) || "no frames"}`); }

  // ── Pass 2: blur the room, the person over it, the sound carried ─────
  const args = ["-hide_banner", "-y", "-v", "error",
    "-i", input,
    "-f", "rawvideo", "-pix_fmt", "gray", "-video_size", `${mw}x${mh}`, "-framerate", String(fps), "-i", alphaRaw,
    "-filter_complex", matteFilterGraph(probe.width, probe.height, opts.strength),
    "-map", "[out]"];
  if (probe.hasAudio) args.push("-map", "0:a:0", "-c:a", "copy");
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
  } catch (e: any) {
    await fsp.unlink(output).catch(() => {});
    throw new Error(`matte composite failed: ${String(e?.stderr || e?.message || e).slice(-400)}`);
  } finally {
    await fsp.unlink(alphaRaw).catch(() => {});
  }
  return { output, frames, ms: Date.now() - t0, model_size: ms, fps };
}

/**
 * THE BLUR RUNS AFTER THE ATTACH. Minutes of matting inside the attach
 * request held the connection past the proxy's limit (measured live: the
 * call dropped at 300 s). The take lands at once, unblurred; this job
 * mattes the file in the background and swaps every take and clip that
 * points at the raw file to the blurred copy, then saves. Studio's live
 * sync picks up the new version. One job per file at a time.
 */
const blurJobs = new Set<string>();
export function queueTakeBlur(opts: {
  tenantId: string;
  projectId: string;
  /** The take's url as stored (/assets/...). */
  rawUrl: string;
  dataDir: string;
  strength?: number;
  resolvePath: (url: string) => string;
  loadProject: (t: string, p: string) => Promise<any>;
  saveProject: (project: any) => Promise<void>;
  afterSave?: (tenantId: string, projectId: string) => void;
}): boolean {
  const key = `${opts.tenantId}/${opts.projectId}/${opts.rawUrl}`;
  if (blurJobs.has(key)) return false;
  blurJobs.add(key);
  setTimeout(async () => {
    try {
      const m = await matteTake(opts.resolvePath(opts.rawUrl), { dataDir: opts.dataDir, strength: opts.strength, onProgress: (n) => console.log(`  take blur: ${n} frames...`) });
      const blurUrl = opts.rawUrl.replace(/[^/]+$/, path.basename(m.output));
      const project = await opts.loadProject(opts.tenantId, opts.projectId);
      if (!project) return;
      let swapped = 0;
      for (const t of project.takes || []) {
        if (t.source === opts.rawUrl) { t.source = blurUrl; t.background = { mode: "blur", source_raw: opts.rawUrl, strength: opts.strength, ms: m.ms }; swapped++; }
      }
      for (const c of project.speaker_track?.clips || []) if (c.source === opts.rawUrl) c.source = blurUrl;
      for (const sc of project.storyboard?.scenes || []) for (const a of sc.assets || []) if (a && a.type === "camera_video" && a.path === opts.rawUrl) a.path = blurUrl;
      project.updated_at = new Date().toISOString();
      await opts.saveProject(project);
      console.log(`  take blur: ${path.basename(m.output)} in ${Math.round(m.ms / 1000)}s (${m.frames} frames); ${swapped} take(s) swapped`);
      if (opts.afterSave) opts.afterSave(opts.tenantId, opts.projectId);
    } catch (e: any) {
      console.warn(`  take blur failed for ${path.basename(opts.rawUrl)}: ${e?.message || e}`);
    } finally {
      blurJobs.delete(key);
    }
  }, 50);
  return true;
}
