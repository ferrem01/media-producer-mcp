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

const execFileAsync = promisify(execFile);

// Wan returned 4.31 s for 4.75 s in (129 frames at 30 fps, twice): the
// chunk plus its overrun stays under that, so a chunk comes back whole.
export const CHUNK_MAX = 4.0;
const CHUNK_MIN = 1.5;
const TAIL = 0.25;
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
  files: Array<{ raw: string; file: string; status: "running" | "done" | "failed" | "reused"; chunks_done: number; chunks_total: number; error?: string }>;
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
    if (out.length && duration - pos < 1.2) out[out.length - 1][1] = duration; // fold a sliver into the chunk before
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
export async function recastFile(opts: {
  rawAbs: string;
  outAbs: string;
  workDir: string;
  portraitAbs: string;
  voiceId?: string;
  onChunk?: (done: number, total: number) => void;
}): Promise<void> {
  const { rawAbs, outAbs, workDir } = opts;
  await fs.mkdir(workDir, { recursive: true });
  const w = (n: string) => path.join(workDir, n);
  const duration = await durationOf(rawAbs);
  if (!duration) throw new Error("could not read the take's length");
  // RESUME: a restart (or a stalled chunk) must not throw away chunks
  // already paid for. The plan is kept beside them; the same take and
  // length reuse it, and every chunk already on disk is kept.
  let chunks = planChunks(duration, await silencesOf(rawAbs));
  const planKey = { raw: path.basename(rawAbs), duration: Number(duration.toFixed(3)) };
  try {
    const prev = JSON.parse(await fs.readFile(w("plan.json"), "utf8"));
    if (prev.raw === planKey.raw && prev.duration === planKey.duration && Array.isArray(prev.chunks)) chunks = prev.chunks;
    else { await fs.rm(workDir, { recursive: true, force: true }); await fs.mkdir(workDir, { recursive: true }); }
  } catch { /* first run */ }
  await fs.writeFile(w("plan.json"), JSON.stringify({ ...planKey, chunks }));
  const have = async (f: string) => fs.stat(f).then((x) => x.size > 0, () => false);
  const [W, H] = await sizeOf(rawAbs);
  await ffmpeg(["-i", opts.portraitAbs, "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", w("actor.jpg")]);
  const img = await dataUri(w("actor.jpg"), "image/jpeg");
  let done = 0;
  for (let i = 0; i < chunks.length; i++) if (await have(w(`chunk-${i}.mp4`))) done++;
  opts.onChunk?.(done, chunks.length);
  await pool(chunks, PARALLEL, async ([a, b], i) => {
    const len = b - a;
    const src = w(`src-${i}.mp4`), raw = w(`wan-${i}.mp4`), fit = w(`chunk-${i}.mp4`), req = w(`wan-${i}.json`);
    if (await have(fit)) return; // finished before a restart
    if (!(await have(raw))) {
      await ffmpeg(["-ss", String(a), "-to", String(Math.min(duration, b + TAIL)), "-i", rawAbs,
        "-vf", "scale=720:-2", "-r", "30", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", src]);
      const uri = await dataUri(src, "video/mp4");
      const remember = async (r: { status_url: string; response_url: string }) => { await fs.writeFile(req, JSON.stringify(r)); };
      const prior = await fs.readFile(req, "utf8").then((t) => JSON.parse(t), () => null);
      let url: string;
      try {
        // A request fal already has (submitted before a restart): collect it.
        url = await runWan(uri, img, "replace", { resume: prior || undefined, onSubmit: remember, deadlineMs: CHUNK_DEADLINE_MS });
      } catch {
        // Stalled or failed: submit fresh, once.
        await fs.rm(req, { force: true });
        url = await runWan(uri, img, "replace", { onSubmit: remember, deadlineMs: CHUNK_DEADLINE_MS });
      }
      await download(url, raw);
    }
    // Exactly the chunk's length: the overrun trimmed off, a short return
    // holding its last frame.
    await ffmpeg(["-i", raw, "-an", "-vf", `fps=30,scale=${W}:${H}:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=${TAIL + 1}`,
      "-t", len.toFixed(3), "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", fit]);
    opts.onChunk?.(++done, chunks.length);
  });
  await fs.writeFile(w("list.txt"), chunks.map((_, i) => `file '${w(`chunk-${i}.mp4`)}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", w("list.txt"), "-c", "copy", w("picture.mp4")]);
  // The voice: the actor's when they have one (the delivery kept), else the take's own.
  let audio = rawAbs;
  if (opts.voiceId) {
    await ffmpeg(["-i", rawAbs, "-vn", "-ac", "1", "-ar", "44100", w("take.wav")]);
    await convertVoice(w("take.wav"), w("voice.mp3"), opts.voiceId);
    audio = w("voice.mp3");
  }
  await ffmpeg(["-i", w("picture.mp4"), "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-af", opts.voiceId ? "loudnorm=I=-16:TP=-1.5:LRA=11,pan=stereo|c0=c0|c1=c0" : "anull",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", duration.toFixed(3), "-movflags", "+faststart", outAbs]);
}

/** Recast every take the speaker track plays as the actor (or, with null,
 *  put the recording's own person back). Returns at once; the work runs on. */
export async function startRecast(tenant: string, projectId: string, actorId: string | null): Promise<RecastStatus> {
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
    const reusable = existing && existing.actors[actor.id].voice_id === actor.voice_id
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
