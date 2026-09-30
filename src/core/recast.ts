/**
 * RECAST: a speaker take performed by a cast actor (core/cast.ts).
 *
 * The take stays the film's clock and script. Its recast is the SAME
 * timeline redrawn by Wan 2.2 Animate "replace" from the actor's portrait --
 * the person's face, hair and clothes become the actor's; the motion, timing,
 * expressions, room and light stay the recording's (the actor tests on Old
 * Chimp: the most real of every route tried). The voice is converted to the
 * actor's voice when they have one; speech-to-speech keeps every word where
 * it was, so captions, stickers, word anchors and cuts still land.
 *
 * Wan returns at most ~4.3 s (129 frames at 30 fps), so the
 * take is cut into chunks of at most CHUNK_MAX seconds at its pauses, each
 * chunk sent with TAIL seconds of overrun and trimmed back to its own length
 * (a short return holds its last frame for the gap). The chunks run side by
 * side and are stitched back to exactly the take's length at its resolution.
 *
 * A recast is a copy of the take like the matte's blur and alpha copies:
 * take.actors[actorId].file, and project.speaker_cast picks who plays
 * (syncSpeakerClips points every clip at it). The raw take is never touched;
 * clearing speaker_cast puts the recording's own person back.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { loadProject, saveProject } from "../persistence/project.js";
import { projectDir } from "../persistence/paths.js";
import { resolveVideoPath } from "./video-path.js";
import { takeCopies, takeForClip, syncSpeakerClips } from "./speaker-layer.js";
import { getActor, portraitPath, type CastActor } from "./cast.js";
import { ffmpeg, dataUri, download, runWan, convertVoice, durationOf } from "./actor-test.js";
import { matteTake, alphaCopyName } from "./take-matte.js";

const execFileAsync = promisify(execFile);

// Wan returns ~129 frames a call (4.31 s of 4.75 s in at 30 fps). Sent at
// 16 fps -- Wan's own rate -- the same frames cover ~8 s (measured: 8.13 s
// in, 8.13 s out), so a chunk + its overrun stays under 8 s and a 30 s take
// is 4 chunks, not 9: half the seams. The picture is interpolated back to
// the take's 30 fps after the stitch.
export const CHUNK_MAX = 7.5;
const CHUNK_MIN = 2.5;
const TAIL = 0.4;
export const WAN_FPS = 16;
// The chunk plan's version: chunks cut under another plan are not reused.
const PLAN_VERSION = 2;
// Every chunk at once (a 30 s take is ~9): one round of Wan, not three.
const PARALLEL = 12;
// One slow chunk must not hold a film for an hour: give up, submit again.
const CHUNK_DEADLINE_MS = 18 * 60 * 1000;

export interface RecastStatus {
  project_id: string;
  actor: string | null;
  status: "running" | "done" | "failed" | "interrupted";
  started_at: string;
  finished_at?: string;
  files: Array<{ raw: string; file: string; status: "running" | "done" | "failed" | "reused"; chunks_done: number; chunks_total: number; stage?: string; error?: string }>;
  error?: string;
}

const running = new Map<string, RecastStatus>();

function statusFile(tenant: string, project: string): string {
  return path.join(projectDir(tenant, project), "recast.json");
}

export async function getRecastStatus(tenant: string, project: string): Promise<RecastStatus | null> {
  const live = running.get(`${tenant}/${project}`);
  if (live) return live;
  try {
    const st = JSON.parse(await fs.readFile(statusFile(tenant, project), "utf8")) as RecastStatus;
    // "running" on disk with nothing running here: the server restarted
    // under it (measured: a pilot stuck at "8 of 9" forever). Its finished
    // chunks are still on disk; starting it again resumes from them.
    if (st.status === "running") st.status = "interrupted";
    return st;
  } catch { return null; }
}

async function saveStatus(tenant: string, st: RecastStatus): Promise<void> {
  await fs.writeFile(statusFile(tenant, st.project_id), JSON.stringify(st, null, 2)).catch(() => {});
}

/** Where to cut: at the middle of a pause, as late as fits in CHUNK_MAX, and
 *  never leaving a sliver of a chunk at the end. */
export function planChunks(duration: number, silences: Array<[number, number]>): Array<[number, number]> {
  const mids = silences.map(([a, b]) => (a + b) / 2).filter((m) => m > 0 && m < duration);
  const out: Array<[number, number]> = [];
  let pos = 0;
  while (duration - pos > CHUNK_MAX) {
    const inWindow = mids.filter((m) => m > pos + CHUNK_MIN && m <= pos + CHUNK_MAX);
    const cut = inWindow.length ? inWindow[inWindow.length - 1] : pos + CHUNK_MAX;
    out.push([pos, cut]);
    pos = cut;
  }
  if (duration - pos > 0.05) {
    // Fold a sliver into the chunk before -- while that chunk still fits a call.
    if (out.length && duration - pos < 1.2 && duration - out[out.length - 1][0] <= CHUNK_MAX + 0.5) out[out.length - 1][1] = duration;
    else out.push([pos, duration]);
  }
  return out;
}

async function silencesOf(file: string): Promise<Array<[number, number]>> {
  let err = "";
  try { err = String((await execFileAsync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.2", "-f", "null", "-"], { maxBuffer: 16 * 1024 * 1024 })).stderr || ""); }
  catch (e: any) { err = String(e?.stderr || ""); }
  const out: Array<[number, number]> = [];
  let start: number | null = null;
  for (const line of err.split("\n")) {
    const s = line.match(/silence_start: (-?[\d.]+)/);
    if (s) { start = Math.max(0, Number(s[1])); continue; }
    const e = line.match(/silence_end: ([\d.]+)/);
    if (e && start != null) { out.push([start, Number(e[1])]); start = null; }
  }
  return out;
}

async function sizeOf(file: string): Promise<[number, number]> {
  let err = "";
  try { await execFileAsync("ffmpeg", ["-hide_banner", "-i", file]); } catch (e: any) { err = String(e?.stderr || ""); }
  const m = err.match(/Video:.*?, (\d{2,5})x(\d{2,5})/);
  return m ? [Number(m[1]), Number(m[2])] : [1080, 1920];
}

async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

/** Recast one take file: chunk, redraw each chunk, stitch, voice. */
/** A stable seed per actor: every chunk of every take makes the same choices. */
export function actorSeed(actorId: string): number {
  let h = 2166136261;
  for (const ch of actorId) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2147483647;
}

/** KEEP THE ROOM: the redrawn person pasted over the recording, the rest of
 *  the frame the recording's own. Every chunk re-imagined the room around
 *  the person a little differently (measured on the Old Chimp pilot: wall
 *  art, shelves, plants changing at each seam); outside the people the real
 *  room now shows through, identical everywhere. The mask is BOTH people
 *  (the recording's person and the actor), grown and softened, so no edge
 *  of the one who recorded peeks out from behind the actor. Alphas are the
 *  matte's VP9 alpha copies (decoded with libvpx to keep the alpha). */
export function keepRoomGraph(width: number, height: number, grow = 18): string {
  const dil = Array.from({ length: Math.max(1, Math.round(grow / 3)) }, () => "dilation").join(",");
  return [
    `[2:v]scale=${width}:${height},format=rgba,alphaextract[ma]`,
    `[3:v]scale=${width}:${height},format=rgba,alphaextract[aa]`,
    `[ma][aa]blend=all_mode=lighten,${dil},gblur=sigma=${Math.max(2, grow / 3)}[m]`,
    `[1:v]scale=${width}:${height},format=rgba[fgc]`,
    `[fgc][m]alphamerge[fg]`,
    `[0:v]scale=${width}:${height},format=rgba[bg]`,
    `[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[out]`,
  ].join(";");
}

export async function keepRoom(orig: string, actor: string, origAlpha: string, actorAlpha: string, out: string): Promise<void> {
  const [W, H] = await sizeOf(actor);
  await ffmpeg(["-i", orig, "-i", actor, "-c:v", "libvpx-vp9", "-i", origAlpha, "-c:v", "libvpx-vp9", "-i", actorAlpha,
    "-filter_complex", keepRoomGraph(W, H), "-map", "[out]", "-an", "-r", "30",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", out]);
}

/** Recast one take file: a reference pass, chunks redrawn in parallel with
 *  one seed, stitched, interpolated to 30 fps, the room kept, the voice. */
export async function recastFile(opts: {
  rawAbs: string;
  outAbs: string;
  workDir: string;
  portraitAbs: string;
  voiceId?: string;
  seed?: number;
  /** Paste the person over the recording's own room (needs the matte). Default true. */
  keepRoom?: boolean;
  /** The matte: (video) -> its alpha copy. Injected so tests need no model. */
  matte?: (video: string) => Promise<string>;
  /** "mci" (motion-compensated, the default) or "blend" (fast, for tests). */
  interpolate?: "mci" | "blend";
  onChunk?: (done: number, total: number) => void;
  onStage?: (stage: string) => void;
}): Promise<void> {
  const { rawAbs, outAbs, workDir } = opts;
  await fs.mkdir(workDir, { recursive: true });
  const w = (n: string) => path.join(workDir, n);
  const duration = await durationOf(rawAbs);
  if (!duration) throw new Error("could not read the take's length");
  // RESUME: a restart (or a stalled chunk) must not throw away chunks
  // already paid for. The plan is kept beside them; the same take, length
  // and plan version reuse it, and every chunk already on disk is kept.
  let chunks = planChunks(duration, await silencesOf(rawAbs));
  const planKey = { v: PLAN_VERSION, raw: path.basename(rawAbs), duration: Number(duration.toFixed(3)) };
  try {
    const prev = JSON.parse(await fs.readFile(w("plan.json"), "utf8"));
    if (prev.v === planKey.v && prev.raw === planKey.raw && prev.duration === planKey.duration && Array.isArray(prev.chunks)) chunks = prev.chunks;
    else { await fs.rm(workDir, { recursive: true, force: true }); await fs.mkdir(workDir, { recursive: true }); }
  } catch { /* first run */ }
  await fs.writeFile(w("plan.json"), JSON.stringify({ ...planKey, chunks }));
  const have = async (f: string) => fs.stat(f).then((x) => x.size > 0, () => false);
  const [W, H] = await sizeOf(rawAbs);
  const seed = opts.seed;
  const remembering = (req: string) => async (r: { status_url: string; response_url: string }) => { await fs.writeFile(req, JSON.stringify(r)); };
  const redraw = async (srcUri: string, img: string, req: string): Promise<string> => {
    const prior = await fs.readFile(req, "utf8").then((t) => JSON.parse(t), () => null);
    try {
      // A request fal already has (submitted before a restart): collect it.
      return await runWan(srcUri, img, "replace", { resume: prior || undefined, onSubmit: remembering(req), deadlineMs: CHUNK_DEADLINE_MS, seed });
    } catch {
      // Stalled or failed: submit fresh, once.
      await fs.rm(req, { force: true });
      return await runWan(srcUri, img, "replace", { onSubmit: remembering(req), deadlineMs: CHUNK_DEADLINE_MS, seed });
    }
  };
  const cut = async (a: number, b: number, file: string) => {
    await ffmpeg(["-ss", String(a), "-to", String(Math.min(duration, b)), "-i", rawAbs,
      "-vf", "scale=720:-2", "-r", String(WAN_FPS), "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", file]);
  };

  // THE REFERENCE PASS: every chunk re-imagined the actor from the portrait
  // and landed on a slightly different man (hair and face shifting at each
  // seam). One short redraw of the take's opening, and a frame of it -- the
  // actor as he looks IN this room, this light -- becomes the reference
  // every chunk is drawn from.
  opts.onStage?.("reference");
  if (!(await have(w("reference.jpg")))) {
    await ffmpeg(["-i", opts.portraitAbs, "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", w("portrait.jpg")]);
    if (!(await have(w("ref-wan.mp4")))) {
      await cut(0, Math.min(duration, 2.5), w("ref-src.mp4"));
      const url = await redraw(await dataUri(w("ref-src.mp4"), "video/mp4"), await dataUri(w("portrait.jpg"), "image/jpeg"), w("ref.json"));
      await download(url, w("ref-wan.mp4"));
    }
    const refLen = (await durationOf(w("ref-wan.mp4"))) || 1;
    await ffmpeg(["-ss", (refLen / 2).toFixed(2), "-i", w("ref-wan.mp4"), "-frames:v", "1", "-q:v", "2", w("reference.jpg")]);
  }
  const img = await dataUri(w("reference.jpg"), "image/jpeg");

  opts.onStage?.("chunks");
  let done = 0;
  for (let i = 0; i < chunks.length; i++) if (await have(w(`chunk-${i}.mp4`))) done++;
  opts.onChunk?.(done, chunks.length);
  await pool(chunks, PARALLEL, async ([a, b], i) => {
    const len = b - a;
    const src = w(`src-${i}.mp4`), raw = w(`wan-${i}.mp4`), fit = w(`chunk-${i}.mp4`);
    if (await have(fit)) return; // finished before a restart
    if (!(await have(raw))) {
      await cut(a, b + TAIL, src);
      await download(await redraw(await dataUri(src, "video/mp4"), img, w(`wan-${i}.json`)), raw);
    }
    // Exactly the chunk's length at Wan's rate: the overrun trimmed off, a
    // short return holding its last frame.
    await ffmpeg(["-i", raw, "-an", "-vf", `fps=${WAN_FPS},scale=720:-2,setsar=1,tpad=stop_mode=clone:stop_duration=${TAIL + 1}`,
      "-t", len.toFixed(3), "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", fit]);
    opts.onChunk?.(++done, chunks.length);
  });

  opts.onStage?.("stitch");
  await fs.writeFile(w("list.txt"), chunks.map((_, i) => `file '${w(`chunk-${i}.mp4`)}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", w("list.txt"), "-c", "copy", w("picture16.mp4")]);
  // Back to the take's 30 fps: motion-compensated in-betweens (a talking
  // person interpolates well), at Wan's size, then up to the take's.
  // (obmc + epzs: half the time of aobmc/vsbmc, measured 16.5 s vs 29 s per
  // 3 s at 720x1280, with the same look on a talking person.)
  const interp = opts.interpolate === "blend" ? "framerate=fps=30" : "minterpolate=fps=30:mi_mode=mci:mc_mode=obmc:me=epzs";
  await ffmpeg(["-i", w("picture16.mp4"), "-vf", `${interp},scale=${W}:${H}:flags=lanczos,setsar=1`,
    "-t", duration.toFixed(3), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", w("picture.mp4")]);
  let picture = w("picture.mp4");
  if (opts.keepRoom !== false && opts.matte) {
    opts.onStage?.("room");
    try {
      const [origAlpha, actorAlpha] = [await opts.matte(rawAbs), await opts.matte(picture)];
      await keepRoom(rawAbs, picture, origAlpha, actorAlpha, w("picture-room.mp4"));
      picture = w("picture-room.mp4");
    } catch (e: any) {
      console.warn(`  recast: kept the redrawn room (${String(e?.message || e).slice(0, 200)})`);
    }
  }
  opts.onStage?.("voice");
  // The voice: the actor's when they have one (the delivery kept), else the take's own.
  let audio = rawAbs;
  if (opts.voiceId) {
    await ffmpeg(["-i", rawAbs, "-vn", "-ac", "1", "-ar", "44100", w("take.wav")]);
    await convertVoice(w("take.wav"), w("voice.mp3"), opts.voiceId);
    audio = w("voice.mp3");
  }
  await ffmpeg(["-i", picture, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-af", opts.voiceId ? "loudnorm=I=-16:TP=-1.5:LRA=11,pan=stereo|c0=c0|c1=c0" : "anull",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", duration.toFixed(3), "-movflags", "+faststart", outAbs]);
}

/** Recast every take the speaker track plays as the actor (or, with null,
 *  put the recording's own person back). Returns at once; the work runs on. */
export async function startRecast(tenant: string, projectId: string, actorId: string | null, opts: { fresh?: boolean } = {}): Promise<RecastStatus> {
  const key = `${tenant}/${projectId}`;
  if (running.get(key)?.status === "running") throw new Error("A recast of this film is already running");
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const st: RecastStatus = { project_id: projectId, actor: actorId, status: "running", started_at: new Date().toISOString(), files: [] };
  if (!actorId) {
    delete (project as any).speaker_cast;
    syncSpeakerClips(project as any);
    await saveProject(project);
    st.status = "done"; st.finished_at = new Date().toISOString();
    await saveStatus(tenant, st);
    return st;
  }
  const actor = await getActor(tenant, actorId);
  if (!actor) throw new Error(`No cast actor "${actorId}"`);
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY is not set");
  if (actor.voice_id && !process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
  // The raw files behind the track's clips (a one-take film is one file).
  const raws = new Set<string>();
  for (const clip of (project as any).speaker_track?.clips || []) {
    const take = takeForClip(project as any, clip);
    if (take) raws.add(takeCopies(take).raw);
  }
  if (!raws.size) throw new Error("This film has no speaker take to recast");
  for (const raw of raws) {
    const file = raw.replace(/(\.[^./]+)?$/, `.actor-${actor.id}.mp4`);
    const existing = ((project as any).takes || []).find((t: any) => takeCopies(t).raw === raw && t.actors?.[actor.id]?.file);
    // fresh: made again (a better method, a new take of the same actor).
    const reusable = !opts.fresh && existing && existing.actors[actor.id].voice_id === actor.voice_id
      && (await fs.access(resolveVideoPath(file, config.dataDir)).then(() => true, () => false));
    st.files.push({ raw, file, status: reusable ? "reused" : "running", chunks_done: 0, chunks_total: 0 });
  }
  running.set(key, st);
  await saveStatus(tenant, st);
  void runRecast(tenant, projectId, actor, st).catch(async (e) => {
    st.status = "failed"; st.error = e?.message || String(e); st.finished_at = new Date().toISOString();
    running.delete(key);
    await saveStatus(tenant, st);
  });
  return st;
}

async function runRecast(tenant: string, projectId: string, actor: CastActor, st: RecastStatus): Promise<void> {
  const key = `${tenant}/${projectId}`;
  await Promise.all(st.files.map(async (f, i) => {
    if (f.status === "reused") return;
    try {
      await recastFile({
        rawAbs: resolveVideoPath(f.raw, config.dataDir),
        outAbs: resolveVideoPath(f.file, config.dataDir),
        workDir: path.join(projectDir(tenant, projectId), "_work", `recast-${actor.id}-${i}`),
        portraitAbs: portraitPath(tenant, actor),
        voiceId: actor.voice_id,
        seed: actorSeed(actor.id),
        keepRoom: true,
        interpolate: process.env.MP_RECAST_INTERP === "blend" ? "blend" : "mci",
        // The matte's alpha copy: the take's own (made once, reused) and the redrawn picture's.
        matte: async (video) => {
          const alpha = alphaCopyName(video);
          if (await fs.stat(alpha).then((x) => x.size > 0, () => false)) return alpha;
          const r = await matteTake(video, { dataDir: config.dataDir, blur: false, alpha: true });
          if (!r.alpha) throw new Error("the matte made no alpha");
          return r.alpha;
        },
        onStage: (stage) => { f.stage = stage; void saveStatus(tenant, st); },
        onChunk: (done, total) => { f.chunks_done = done; f.chunks_total = total; void saveStatus(tenant, st); },
      });
      f.status = "done";
    } catch (e: any) {
      f.status = "failed"; f.error = String(e?.message || e).slice(0, 300);
    }
    await saveStatus(tenant, st);
  }));
  const ok = st.files.filter((f) => f.status === "done" || f.status === "reused");
  if (ok.length) {
    // Reload: the recast ran for minutes and the film may have been edited.
    const project = await loadProject(tenant, projectId);
    if (!project) throw new Error("Project vanished");
    const now = new Date().toISOString();
    for (const t of (project as any).takes || []) {
      const hit = ok.find((f) => f.raw === takeCopies(t).raw);
      if (hit) t.actors = { ...(t.actors || {}), [actor.id]: { file: hit.file, ...(actor.voice_id ? { voice_id: actor.voice_id } : {}), made_at: now } };
    }
    // The actor performs only when every file made it: half a film in one
    // face and half in another is worse than none.
    if (ok.length === st.files.length) (project as any).speaker_cast = actor.id;
    syncSpeakerClips(project as any);
    await saveProject(project);
  }
  st.status = ok.length === st.files.length ? "done" : "failed";
  if (st.status === "failed") st.error = st.files.find((f) => f.error)?.error || "a take could not be recast";
  st.finished_at = new Date().toISOString();
  running.delete(key);
  await saveStatus(tenant, st);
  // The chunks were only a means: keep the recast, drop the pieces.
  for (let i = 0; i < st.files.length; i++) await fs.rm(path.join(projectDir(tenant, projectId), "_work", `recast-${actor.id}-${i}`), { recursive: true, force: true }).catch(() => {});
}

/** A PREVIEW from the chunks that are done: the finished run from the start,
 *  stitched with the matching span of the voice, written to the project's
 *  output as recast-preview-<actor>.mp4. For judging the look while a chunk
 *  is still out (Marc: "skip the last chunk and see if the pilot works").
 *  The film is not touched. */
export async function previewRecast(tenant: string, projectId: string, actorId: string): Promise<{ file: string; seconds: number; chunks: number; of: number }> {
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const actor = await getActor(tenant, actorId);
  if (!actor) throw new Error(`No cast actor "${actorId}"`);
  const workDir = path.join(projectDir(tenant, projectId), "_work", `recast-${actor.id}-0`);
  const w = (n: string) => path.join(workDir, n);
  const plan = JSON.parse(await fs.readFile(w("plan.json"), "utf8").catch(() => { throw new Error("No recast of this film has started"); }));
  const chunks: Array<[number, number]> = plan.chunks || [];
  let n = 0;
  while (n < chunks.length && (await fs.stat(w(`chunk-${n}.mp4`)).then((x) => x.size > 0, () => false))) n++;
  if (!n) throw new Error("No chunk is finished yet");
  const end = chunks[n - 1][1];
  const raw = ((project as any).takes || []).map((t: any) => takeCopies(t).raw).find((r: string) => path.basename(resolveVideoPath(r, config.dataDir)) === plan.raw);
  if (!raw) throw new Error("The take behind the recast is gone");
  const rawAbs = resolveVideoPath(raw, config.dataDir);
  const outDir = path.join(config.dataDir, tenant, "projects", projectId, "output");
  await fs.mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `recast-preview-${actor.id}.mp4`);
  await fs.writeFile(w("preview-list.txt"), chunks.slice(0, n).map((_, i) => `file '${w(`chunk-${i}.mp4`)}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", w("preview-list.txt"), "-c", "copy", w("preview-picture.mp4")]);
  let audio = rawAbs;
  if (actor.voice_id) {
    await ffmpeg(["-i", rawAbs, "-t", end.toFixed(3), "-vn", "-ac", "1", "-ar", "44100", w("preview.wav")]);
    await convertVoice(w("preview.wav"), w("preview-voice.mp3"), actor.voice_id);
    audio = w("preview-voice.mp3");
  }
  await ffmpeg(["-i", w("preview-picture.mp4"), "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-af", actor.voice_id ? "loudnorm=I=-16:TP=-1.5:LRA=11,pan=stereo|c0=c0|c1=c0" : "anull",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", end.toFixed(3), "-movflags", "+faststart", out]);
  return { file: `recast-preview-${actor.id}.mp4`, seconds: Number(end.toFixed(2)), chunks: n, of: chunks.length };
}
