/**
 * RECAST: a speaker take performed by a cast actor (core/cast.ts).
 *
 * The take stays the film's clock and script. Its recast is the SAME
 * timeline performed by the actor through a vendor (core/performers):
 * HeyGen hears the voice and draws the whole person in one call (the actor
 * tests' winner); Kling and Runway map the recording's motion onto the
 * actor's portrait, a call per stretch of up to maxSeconds cut at the take's
 * pauses. The voice is converted to the actor's voice when one is asked
 * for; speech-to-speech keeps every word where it was, so captions,
 * stickers, word anchors and cuts still land. performTakeFile is the one
 * path. (Wan 2.2 Animate was the first route: chunked redraws whose seams
 * never held -- removed.)
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
import { projectDir, projectOutputDir } from "../persistence/paths.js";
import { resolveVideoPath } from "./video-path.js";
import { takeCopies, takeForClip, syncSpeakerClips } from "./speaker-layer.js";
import { getActor, portraitPath, type CastActor } from "./cast.js";
import { ffmpeg, convertVoice, durationOf } from "./actor-test.js";
import { PERFORMERS, getPerformer, defaultPerformer, type Performer, type PerformContext } from "./performers/index.js";

const execFileAsync = promisify(execFile);

export interface RecastStatus {
  project_id: string;
  actor: string | null;
  performer?: string;
  voice_id?: string;
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

// Atomic and in order: a status poll never reads a half-written file, and a
// progress write (fired without waiting) never lands after the final one.
const saveChains = new Map<string, Promise<void>>();
async function saveStatus(tenant: string, st: RecastStatus): Promise<void> {
  const f = statusFile(tenant, st.project_id), body = JSON.stringify(st, null, 2);
  const next = (saveChains.get(f) || Promise.resolve()).then(async () => {
    const tmp = `${f}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await fs.writeFile(tmp, body).then(() => fs.rename(tmp, f)).catch(() => fs.rm(tmp, { force: true }).catch(() => {}));
  });
  saveChains.set(f, next);
  await next;
}

/** Where to cut a take into calls of at most `max` seconds: at the middle of
 *  a pause, as late as fits, never before `min`, and never leaving a sliver
 *  of a call at the end. */
export function planChunks(duration: number, silences: Array<[number, number]>, max: number, min: number): Array<[number, number]> {
  const mids = silences.map(([a, b]) => (a + b) / 2).filter((m) => m > 0 && m < duration);
  const out: Array<[number, number]> = [];
  let pos = 0;
  while (duration - pos > max) {
    const inWindow = mids.filter((m) => m > pos + min && m <= pos + max);
    const cut = inWindow.length ? inWindow[inWindow.length - 1] : pos + max;
    out.push([pos, cut]);
    pos = cut;
  }
  if (duration - pos > 0.05) {
    // Fold a sliver into the chunk before -- while that chunk still fits a call.
    if (out.length && duration - pos < 1.2 && duration - out[out.length - 1][0] <= max + 0.5) out[out.length - 1][1] = duration;
    else out.push([pos, duration]);
  }
  return out;
}

export async function silencesOf(file: string): Promise<Array<[number, number]>> {
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

/** A public URL for a work file (a vendor fetches a large source by URL
 *  rather than a data URI): copied into the project's output under _cast/,
 *  which is served, when the server has a public https address. */
function castPublicUrl(tenant: string, projectId: string): (file: string) => Promise<string | null> {
  return async (file) => {
    if (!config.publicUrl.startsWith("https://")) return null;
    const dir = path.join(projectOutputDir(tenant, projectId), "_cast");
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now().toString(36)}-${path.basename(file)}`;
    await fs.copyFile(file, path.join(dir, name));
    return `${config.publicUrl}/output/${encodeURIComponent(tenant)}/projects/${encodeURIComponent(projectId)}/_cast/${name}`;
  };
}

/** A take performed by a cast actor through one vendor (core/performers):
 *  the voice made (the take's own, or the actor's converted -- the delivery
 *  kept), the picture made (video-driven when the vendor can copy the
 *  recording's motion: the take cut at its pauses into calls of at most
 *  maxSeconds, each held to its own length; else audio-driven from the
 *  voice), then fitted to exactly the take's frame, 30 fps and length with
 *  the voice laid under it. */
export async function performTakeFile(opts: {
  rawAbs: string;
  outAbs: string;
  performer: Performer;
  ctx: PerformContext;
  voiceId?: string;
  onChunk?: (done: number, total: number) => void;
}): Promise<void> {
  const { rawAbs, outAbs, performer, ctx } = opts;
  await fs.mkdir(ctx.workDir, { recursive: true });
  const w = (n: string) => path.join(ctx.workDir, n);
  const duration = await durationOf(rawAbs);
  if (!duration) throw new Error("could not read the take's length");
  const [W, H] = [ctx.width, ctx.height];
  const have = async (f: string) => fs.stat(f).then((x) => x.size > 0, () => false);

  ctx.onStage?.("voice");
  let audio = w("take.mp3");
  if (!(await have(audio))) await ffmpeg(["-i", rawAbs, "-vn", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", audio]);
  if (opts.voiceId) {
    if (!(await have(w("voice.mp3")))) {
      await ffmpeg(["-i", rawAbs, "-vn", "-ac", "1", "-ar", "44100", w("take.wav")]);
      await convertVoice(w("take.wav"), w("voice.mp3"), opts.voiceId);
    }
    audio = w("voice.mp3");
  }

  ctx.onStage?.(performer.id);
  let picture: string;
  // A vendor that can copy the recording's motion does (that is why it was
  // picked for a recast); an audio-driven one draws from the voice.
  if (!performer.fromVideo && performer.fromAudio) {
    picture = await performer.fromAudio(audio, ctx);
  } else if (performer.fromVideo) {
    const max = performer.maxSeconds || 30;
    const chunks = duration <= max ? [[0, duration] as [number, number]] : planChunks(duration, await silencesOf(rawAbs), max, Math.min(3, max / 2));
    let done = 0;
    opts.onChunk?.(0, chunks.length);
    await pool(chunks, 4, async ([a, b], i) => {
      const fit = w(`fit-${i}.mp4`);
      if (!(await have(fit))) {
        const src = w(`src-${i}.mp4`);
        await ffmpeg(["-ss", String(a), "-to", String(b), "-i", rawAbs, "-vf", "scale=720:-2", "-r", "30",
          "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", src]);
        const made = await performer.fromVideo!(src, `c${i}`, ctx);
        // Exactly the stretch's length at the take's frame: a short return holds its last frame.
        await ffmpeg(["-i", made, "-an", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${Math.ceil(b - a) + 1}`,
          "-t", (b - a).toFixed(3), "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", fit]);
      }
      opts.onChunk?.(++done, chunks.length);
    });
    await fs.writeFile(w("fit-list.txt"), chunks.map((_, i) => `file '${w(`fit-${i}.mp4`)}'`).join("\n"));
    await ffmpeg(["-f", "concat", "-safe", "0", "-i", w("fit-list.txt"), "-c", "copy", w("picture.mp4")]);
    picture = w("picture.mp4");
  } else {
    throw new Error(`${performer.label} cannot perform a take`);
  }

  ctx.onStage?.("fit");
  // Exactly the take's frame (cover), rate and length: a short return holds its last frame.
  await ffmpeg(["-i", picture, "-i", opts.voiceId ? audio : rawAbs, "-map", "0:v:0", "-map", "1:a:0",
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${Math.ceil(duration) + 1}`,
    "-af", opts.voiceId ? "loudnorm=I=-16:TP=-1.5:LRA=11,pan=stereo|c0=c0|c1=c0" : "anull",
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", duration.toFixed(3), "-movflags", "+faststart", outAbs]);
}

/** The work dir of one take's recast by one actor through one vendor. */
function recastWorkDir(tenant: string, projectId: string, actorId: string, performer: string, i: number): string {
  return path.join(projectDir(tenant, projectId), "_work", `recast-${actorId}-${performer}-${i}`);
}

/** Who performed an existing recast: recorded since vendors became a
 *  choice; before that a HeyGen look's recast was HeyGen's, any other Wan's. */
function madeBy(entry: any): string {
  return entry?.performer || (entry?.heygen_look_id ? "heygen" : "wan"); // "wan": a pre-choice recast, never reused
}

/** Recast every take the speaker track plays as the actor (or, with null,
 *  put the recording's own person back). `performer` picks the vendor
 *  (default: HeyGen for a HeyGen look, else the best video-driven vendor
 *  with a key); `voice_id` an ElevenLabs voice the delivery is converted to
 *  ("mine" keeps the recording's voice; omitted, the actor's own voice).
 *  Returns at once; the work runs on. */
export async function startRecast(tenant: string, projectId: string, actorId: string | null, opts: { fresh?: boolean; performer?: string; voice_id?: string; motion?: string } = {}): Promise<RecastStatus> {
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
  const performer = opts.performer ? getPerformer(opts.performer) : defaultPerformer(actor);
  if (!performer) throw new Error(`No performer "${opts.performer}" (${PERFORMERS.map((p) => p.id).join(", ")})`);
  if (!process.env[performer.key]) throw new Error(`${performer.label} is not set up on this server (${performer.key})`);
  const voiceId = opts.voice_id === undefined ? actor.voice_id : opts.voice_id === "mine" ? undefined : opts.voice_id || undefined;
  if (voiceId && !process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
  st.performer = performer.id;
  if (voiceId) st.voice_id = voiceId;
  // The raw files behind the track's clips (a one-take film is one file).
  const raws = new Set<string>();
  for (const clip of (project as any).speaker_track?.clips || []) {
    const take = takeForClip(project as any, clip);
    if (take) raws.add(takeCopies(take).raw);
  }
  if (!raws.size) throw new Error("This film has no speaker take to recast");
  for (const raw of raws) {
    const existing = ((project as any).takes || []).find((t: any) => takeCopies(t).raw === raw && t.actors?.[actor.id]?.file)?.actors?.[actor.id];
    // Reused only when it is the same performance: the same vendor, voice
    // and look, and the file is still there. fresh: made again regardless.
    const reusable = !opts.fresh && existing && madeBy(existing) === performer.id && existing.voice_id === voiceId
      && existing.heygen_look_id === actor.heygen_look_id
      && (await fs.access(resolveVideoPath(existing.file, config.dataDir)).then(() => true, () => false));
    const file = reusable ? existing.file : raw.replace(/(\.[^./]+)?$/, `.actor-${actor.id}-${performer.id}.mp4`);
    st.files.push({ raw, file, status: reusable ? "reused" : "running", chunks_done: 0, chunks_total: 0 });
  }
  running.set(key, st);
  await saveStatus(tenant, st);
  void runRecast(tenant, projectId, actor, performer, voiceId, st, opts.motion?.trim() || undefined).catch(async (e) => {
    st.status = "failed"; st.error = e?.message || String(e); st.finished_at = new Date().toISOString();
    await saveStatus(tenant, st);
    running.delete(key);
  });
  return st;
}

async function runRecast(tenant: string, projectId: string, actor: CastActor, performer: Performer, voiceId: string | undefined, st: RecastStatus, motion?: string): Promise<void> {
  const key = `${tenant}/${projectId}`;
  const publicUrl = castPublicUrl(tenant, projectId);
  await Promise.all(st.files.map(async (f, i) => {
    if (f.status === "reused") return;
    try {
      const rawAbs = resolveVideoPath(f.raw, config.dataDir);
      const [width, height] = await sizeOf(rawAbs);
      await performTakeFile({
        rawAbs, outAbs: resolveVideoPath(f.file, config.dataDir), performer, voiceId,
        ctx: {
          tenant, actor, portraitAbs: portraitPath(tenant, actor), width, height, publicUrl, motion,
          workDir: recastWorkDir(tenant, projectId, actor.id, performer.id, i),
          onStage: (stage) => { f.stage = stage; void saveStatus(tenant, st); },
        },
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
      if (hit && hit.status === "done") t.actors = { ...(t.actors || {}), [actor.id]: { file: hit.file, performer: performer.id, ...(voiceId ? { voice_id: voiceId } : {}), ...(actor.heygen_look_id ? { heygen_look_id: actor.heygen_look_id } : {}), made_at: now } };
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
  await saveStatus(tenant, st);
  running.delete(key);
  // The pieces were only a means: keep the recast, drop the pieces.
  for (let i = 0; i < st.files.length; i++) await fs.rm(recastWorkDir(tenant, projectId, actor.id, performer.id, i), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(projectOutputDir(tenant, projectId), "_cast"), { recursive: true, force: true }).catch(() => {});
}
