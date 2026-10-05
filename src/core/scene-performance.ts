/**
 * A SCENE PERFORMED BY A CAST ACTOR, with no recording of it -- the pipeline
 * Marc's AI cast brief asked for and Oct 4 proved: a cast member defined by
 * a model sheet, a START FRAME drawn for the scene's shot, the scene's line
 * VOICED in the actor's voice, all of it handed to SEEDANCE 2.5 (Atlas), and
 * the result attached as that scene's take -- so captions, word anchors,
 * trims and the speaker lane work as on a recording.
 *
 *   frame   -- GPT Image draws the actor from the portrait and sheet in the
 *              shot asked for ("walks toward the camera down a hallway").
 *              Cheap: drawn and redrawn until it is right, before any video.
 *   voice   -- "script": the scene's line read by ElevenLabs in the actor's
 *              voice; "take": the scene's recording converted to it
 *              (speech-to-speech -- Marc's inflection kept, Oct 4).
 *   perform -- a 480p DRAFT first; the FINAL renders the same shot at 1080p
 *              from the draft's id. Seedance's own sound is kept: it is the
 *              voice the lips were made to.
 *
 * The scene's state lives on its storyboard scene (`performance`), written
 * load-mutate-save in one breath, one writer per film at a time.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { loadProject, saveProject } from "../persistence/project.js";
import { projectDir, projectOutputDir } from "../persistence/paths.js";
import { resolveVideoPath } from "./video-path.js";
import { getActor, listCast, portraitPath, type CastActor } from "./cast.js";
import { resolvePlan, planState, planLine, planField, writePlan, applyPlanEdit, defaultEngine, type ResolvedPlan } from "./cast-plan.js";
import { getPerformer } from "./performers/index.js";
import { getHeygenLook } from "./actor-test.js";
import { ffmpeg, download, durationOf, convertVoice } from "./actor-test.js";
import { elevenSpeech, heygenSpeech, spokenParts, DEFAULT_MOTION } from "./generated-take.js";
import { takeForClip, takeCopies } from "./speaker-layer.js";
import { takeWindow, cutClock, cutFileFor } from "./take-clock.js";
import { editImage } from "../media/image-gen.js";
import { locationImage } from "./locations.js";
import { seedanceShot, seedanceFinal, speakingPrompt, silentPrompt, seedanceRatio, seedanceRefs } from "./seedance.js";
import { withVendorStatus, type VendorStatus } from "./vendor-status.js";
import type { ScenePerformance, CastPlan } from "./types.js";

/** Where an actor stands when no shot is given. */
export const DEFAULT_SHOT = "A selfie-style medium close-up in a bright modern office, the person talking straight to the camera";
/** One Seedance call is at most 30 s. */
const MAX_VOICE_SECONDS = 29;

type Attacher = (tenant: string, project: string, url: string, sceneIndex: number, extra: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;
let attacher: Attacher | null = null;
/** index.ts owns the take attach (sanitize, transcribe, re-time). */
export function registerSceneAttacher(fn: Attacher): void { attacher = fn; }

const running = new Set<string>();
/** The vendor's last reply per scene job (queue place, status): Studio's wait. */
const vendorNow = new Map<string, VendorStatus>();
const chains = new Map<string, Promise<unknown>>();

/** Change a scene's performance: load, mutate, save, one writer per film. */
async function patch(tenant: string, projectId: string, si: number, fn: (perf: ScenePerformance, scene: any) => void): Promise<ScenePerformance> {
  const k = `${tenant}/${projectId}`;
  const next = (chains.get(k) || Promise.resolve()).catch(() => {}).then(async () => {
    const project = await loadProject(tenant, projectId);
    if (!project) throw new Error("Project not found");
    const scene: any = (project as any).storyboard?.scenes?.[si];
    if (!scene) throw new Error(`No scene ${si + 1}`);
    const perf: ScenePerformance = scene.performance || { actor: "", shot: DEFAULT_SHOT, voice_source: "script" };
    fn(perf, scene);
    scene.performance = perf;
    project.updated_at = new Date().toISOString();
    await saveProject(project);
    return perf;
  });
  chains.set(k, next);
  return next as Promise<ScenePerformance>;
}

/** A public URL for a file (Atlas fetches by URL): copied under the film's
 *  output, which the server serves. */
async function publicUrl(tenant: string, projectId: string, abs: string): Promise<string> {
  if (!config.publicUrl.startsWith("https://")) throw new Error("Seedance fetches its inputs by URL: the server needs its public https address");
  const dir = path.join(projectOutputDir(tenant, projectId), "_perform");
  await fs.mkdir(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}-${path.basename(abs)}`;
  await fs.copyFile(abs, path.join(dir, name));
  return `${config.publicUrl}/output/${encodeURIComponent(tenant)}/projects/${encodeURIComponent(projectId)}/_perform/${name}`;
}

const assetsDir = (tenant: string, projectId: string) => path.join(config.dataDir, tenant, "projects", projectId, "assets");
const assetUrl = (tenant: string, projectId: string, name: string) => `/assets/${tenant}/projects/${projectId}/assets/${name}`;
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

async function loadScene(tenant: string, projectId: string, si: number) {
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const scene: any = (project as any).storyboard?.scenes?.[si];
  if (!scene) throw new Error(`No scene ${si + 1} (the film has ${((project as any).storyboard?.scenes || []).length})`);
  return { project, scene };
}

async function needActor(tenant: string, id: string | undefined): Promise<CastActor> {
  if (!id) throw new Error("actor is required (a cast actor id)");
  const actor = await getActor(tenant, id);
  if (!actor) throw new Error(`No cast actor "${id}"`);
  return actor;
}

/** The scene's plan (core/cast-plan.ts): its own fields over the film's. */
async function planOf(tenant: string, project: any, si: number): Promise<ResolvedPlan> {
  return resolvePlan(project, si, await listCast(tenant), !!sceneRecording(project, si));
}

/** A direct action (Studio's buttons, the cast tool) is a choice: the scene's
 *  plan follows it, so the board says what the scene now is. Only fields that
 *  differ from what the scene already resolves to are written. */
function followPlan(scene: any, project: any, want: Partial<CastPlan>, before: ResolvedPlan): void {
  const fields: Record<string, unknown> = {};
  if (want.actor !== undefined && want.actor !== before.actor) fields.actor = want.actor;
  if (want.how !== undefined && want.how !== before.how) fields.how = want.how;
  if (want.engine !== undefined && want.engine !== before.engine) fields.engine = want.engine;
  if (want.location !== undefined && (want.location || "") !== (before.location || "")) fields.location = want.location || "";
  if (!Object.keys(fields).length) return;
  // Clearing a location the film supplies would only inherit it back: say none.
  const film: CastPlan = project?.storyboard?.cast_plan || {};
  if (fields.location === "" && film.location) fields.location = null;
  const next = writePlan(scene.performer, fields);
  if (next) scene.performer = next; else delete scene.performer;
}

/** The start frame prompt: the same person, in this shot, at this shape. */
export function framePrompt(shot: string, vertical: boolean, sheet: boolean, location = false): string {
  const refs = location
    ? (sheet ? "the first two reference images (their portrait and their character sheet)" : "the first reference image")
    : `the reference image${sheet ? "s (the first is their portrait, the second their character sheet)" : ""}`;
  return `The exact same person as in ${refs}: ` +
    "the same face, hair, skin, clothes and accessories. " +
    (location ? "The last reference image is the room they are in: keep that exact room -- the same walls, furniture, plants, windows, art and light -- seen from where this shot needs. " : "") +
    `${shot.trim().replace(/\.?$/, ".")} ` +
    // Framed as the shot says: a wide couch shot must not be pulled into a
    // close-up (Marc, Oct 4: "further back from camera ... sitting in a couch").
    `A ${vertical ? "vertical" : "horizontal"} photograph from a real camera, framed exactly as described, the face clearly visible, ` +
    "realistic skin texture, natural light, no text, no logos.";
}

/** A written prompt: undefined keeps what the scene has, "" goes back to the
 *  default, text replaces it. */
function setPrompt(p: ScenePerformance, key: "frame_prompt" | "video_prompt", v: string | undefined): boolean {
  if (v === undefined) return false;
  const t = String(v).trim().slice(0, 4000);
  const before = p[key];
  if (t) p[key] = t; else delete p[key];
  return before !== p[key];
}

/** A scene's location: undefined keeps it, "" clears it, an id sets it.
 *  A new location drops the picked frame unless it was drawn there (a frame
 *  in another room would fight the plate), and the draft with it. */
function setLocation(p: ScenePerformance, v: string | undefined): boolean {
  if (v === undefined) return false;
  const next = String(v).trim();
  if ((p.location || "") === next) return false;
  if (next) p.location = next; else delete p.location;
  const picked = (p.frames || []).find((f) => f.url === p.frame);
  if (p.frame && (picked?.location || "") !== next) delete p.frame;
  delete p.draft;
  return true;
}

/** The prompts a scene uses unless it says otherwise: built from the shot. */
export function defaultPrompts(shot: string, vertical: boolean, sheet: boolean, room = false, location = false): { frame_prompt: string; video_prompt: string } {
  return { frame_prompt: framePrompt(shot, vertical, sheet, location), video_prompt: `${seedanceRefs((sheet ? 2 : 1) + (room ? 1 : 0), true, false, room)} ${speakingPrompt(shot)}` };
}

async function drawFrame(tenant: string, projectId: string, actor: CastActor, shot: string, width: number, height: number, prompt?: string, locationAbs?: string): Promise<string> {
  const vertical = height > width;
  const sheetAbs = actor.sheet ? path.join(config.dataDir, tenant, actor.sheet) : undefined;
  const work = path.join(projectDir(tenant, projectId), "_work");
  await fs.mkdir(work, { recursive: true });
  const drawn = path.join(work, `frame-${stamp()}.png`);
  await editImage({ prompt: prompt || framePrompt(shot, vertical, !!sheetAbs, !!locationAbs), images: [portraitPath(tenant, actor), ...(sheetAbs ? [sheetAbs] : []), ...(locationAbs ? [locationAbs] : [])], outputPath: drawn, size: vertical ? "1024x1536" : height === width ? "1024x1024" : "1536x1024" });
  // Cut to the film's exact shape (2:3 drawn, 9:16 wanted), centred.
  const name = `frame-${actor.id}-${stamp()}.jpg`;
  await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
  const ar = `${width}/${height}`;
  await ffmpeg(["-i", drawn, "-vf", `crop='min(iw,ih*${ar})':'min(ih,iw/(${ar}))',scale=${vertical ? "720:-2" : "-2:720"}`, "-frames:v", "1", "-q:v", "2", path.join(assetsDir(tenant, projectId), name)]);
  await fs.rm(drawn, { force: true }).catch(() => {});
  return assetUrl(tenant, projectId, name);
}

/** Draw (or redraw) a scene's start frame. Returns at once; the frame lands
 *  on the scene's performance (frames, frame). */
export async function startSceneFrame(tenant: string, projectId: string, si: number, opts: { actor?: string; shot?: string; frame_prompt?: string; location?: string }): Promise<ScenePerformance> {
  const { project, scene } = await loadScene(tenant, projectId, si);
  const prev: ScenePerformance | undefined = scene.performance;
  const plan = await planOf(tenant, project, si);
  const actor = await needActor(tenant, opts.actor || plan.actor || prev?.actor);
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (the start frame is drawn by GPT Image)");
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const shot = String(opts.shot ?? prev?.shot ?? DEFAULT_SHOT).trim().slice(0, 1000) || DEFAULT_SHOT;
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  // The room: the one asked for, else the plan's.
  const where = opts.location !== undefined ? opts.location : (planField(project, si, "location") || "");
  if (where) await locationImage(tenant, where);
  running.add(key);
  const perf = await patch(tenant, projectId, si, (p, sc) => {
    if (p.actor && p.actor !== actor.id) { delete p.frames; delete p.frame; delete p.draft; delete p.final; }
    p.actor = actor.id; p.shot = shot; setPrompt(p, "frame_prompt", opts.frame_prompt);
    // A location chosen now is the room: an older raw room reference yields.
    if (setLocation(p, where)) delete p.room_url;
    followPlan(sc, project, { ...(opts.actor && plan.how !== "record" ? { actor: actor.id } : {}), ...(opts.location !== undefined ? { location: opts.location } : {}) }, plan);
    p.status = "running"; p.stage = "frame"; delete p.error;
    p.started_at = new Date().toISOString(); delete p.finished_at;
  });
  const prompt = perf.frame_prompt;
  const location = perf.location;
  void (async () => {
    try {
      const url = await drawFrame(tenant, projectId, actor, shot, W, H, prompt, location ? await locationImage(tenant, location) : undefined);
      // Free before "done": a poll that reads done may start the next job at once.
      running.delete(key);
      await patch(tenant, projectId, si, (p) => {
        p.frames = [...(p.frames || []), { url, shot, ...(prompt ? { prompt } : {}), ...(location ? { location } : {}), made_at: new Date().toISOString() }].slice(-6);
        p.frame = url; p.status = "done"; delete p.stage; p.finished_at = new Date().toISOString();
      });
    } catch (e: any) {
      running.delete(key);
      await patch(tenant, projectId, si, (p) => { p.status = "failed"; p.error = String(e?.message || e).slice(0, 300); delete p.stage; p.finished_at = new Date().toISOString(); }).catch(() => {});
    } finally { running.delete(key); }
  })();
  return perf;
}

/** The frame a scene ENDS on, as it plays (its clip's file, at its trim):
 *  the next scene's start frame, so the two link without a jump (Marc,
 *  Oct 4: "linking of scenes visually"). */
export async function lastFrameOf(tenant: string, projectId: string, si: number, actorId: string, width: number, height: number): Promise<string> {
  const project = await loadProject(tenant, projectId);
  const clip = ((project as any)?.speaker_track?.clips || []).find((c: any) => c.scene_index === si);
  if (!clip?.source) throw new Error(`Scene ${si + 1} has no take to continue from`);
  const file = resolveVideoPath(clip.source, config.dataDir);
  const end = clip.trim_end != null ? Number(clip.trim_end) : await durationOf(file);
  if (!end) throw new Error(`Scene ${si + 1}'s take has no length`);
  const name = `frame-${actorId}-from-s${si + 1}-${stamp()}.jpg`;
  await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
  const ar = `${width}/${height}`;
  const vertical = height > width;
  await ffmpeg(["-ss", String(Math.max(0, end - 0.08)), "-i", file, "-frames:v", "1",
    "-vf", `crop='min(iw,ih*${ar})':'min(ih,iw/(${ar}))',scale=${vertical ? "720:-2" : "-2:720"}:flags=lanczos`, "-q:v", "2", path.join(assetsDir(tenant, projectId), name)]);
  return assetUrl(tenant, projectId, name);
}

/** Start a scene from the previous one's last frame (or any scene's):
 *  the frame is cut from that take, not drawn -- quick and free. */
export async function continueSceneFrom(tenant: string, projectId: string, si: number, opts: { actor?: string; from_scene: number; shot?: string }): Promise<ScenePerformance> {
  const { project, scene } = await loadScene(tenant, projectId, si);
  const prev: ScenePerformance | undefined = scene.performance;
  const actor = await needActor(tenant, opts.actor || (await planOf(tenant, project, si)).actor || prev?.actor);
  const from = Number(opts.from_scene);
  if (!Number.isInteger(from) || from < 0 || from === si) throw new Error("from_scene must be another scene (0-based)");
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  const url = await lastFrameOf(tenant, projectId, from, actor.id, W, H);
  return patch(tenant, projectId, si, (p) => {
    if (p.actor && p.actor !== actor.id) { delete p.frames; delete p.frame; delete p.draft; delete p.final; }
    p.actor = actor.id;
    if (opts.shot !== undefined) p.shot = String(opts.shot).trim().slice(0, 1000) || DEFAULT_SHOT;
    p.frames = [...(p.frames || []), { url, shot: p.shot, from_scene: from, made_at: new Date().toISOString() }].slice(-6);
    p.frame = url;
  });
}

/** Set a scene's location without drawing or performing (Studio's picker):
 *  "" clears it. A new location drops a frame drawn elsewhere and the draft. */
export async function setSceneLocation(tenant: string, projectId: string, si: number, location: string): Promise<ScenePerformance> {
  const { project } = await loadScene(tenant, projectId, si);
  if (location) await locationImage(tenant, location);
  const plan = await planOf(tenant, project, si);
  return patch(tenant, projectId, si, (p, sc) => {
    if (setLocation(p, location)) delete p.room_url;
    // The scene's plan says where it is set (none: over the film's, too).
    followPlan(sc, project, { location }, { ...plan, location: planField(project, si, "location") || undefined });
  });
}

/** Change the cast plan (the film's and/or scenes'), on the film's writer
 *  chain so it never loses a perform's write. Nothing is made. */
export async function editCastPlan(tenant: string, projectId: string, edit: Parameters<typeof applyPlanEdit>[2]): Promise<void> {
  const k = `${tenant}/${projectId}`;
  const next = (chains.get(k) || Promise.resolve()).catch(() => {}).then(async () => {
    const project = await loadProject(tenant, projectId);
    if (!project) throw new Error("Project not found");
    await applyPlanEdit(tenant, project, edit);
    project.updated_at = new Date().toISOString();
    await saveProject(project);
  });
  chains.set(k, next);
  await next;
}

/** Pick which drawn frame the scene uses. */
export async function pickSceneFrame(tenant: string, projectId: string, si: number, url: string): Promise<ScenePerformance> {
  return patch(tenant, projectId, si, (p) => {
    if (!(p.frames || []).some((f) => f.url === url)) throw new Error("That frame was not drawn for this scene");
    p.frame = url;
  });
}

/** The scene's latest RECORDING (not a performance): the clip's take when it
 *  is one, else the newest recorded take for the scene -- a performance
 *  attached on top leaves the recording in the film's takes. */
export function sceneRecording(project: any, si: number): any | null {
  const clip = (project?.speaker_track?.clips || []).find((c: any) => c.scene_index === si);
  const onClip = clip ? takeForClip(project, clip) : null;
  if (onClip && !(onClip as any).performed_by) return onClip;
  const takes = (project?.takes || []).filter((t: any) => t.scene_index === si && !t.performed_by);
  return takes.length ? takes[takes.length - 1] : null;
}

/** Put the scene's recording back: re-attached if a performance replaced
 *  it, and the scene cast as the recording (no recast plays). */
export async function useSceneRecording(tenant: string, projectId: string, si: number): Promise<{ reattached: boolean }> {
  const doAttach = attacher;
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const rec = sceneRecording(project, si);
  if (!rec) throw new Error(`Scene ${si + 1} has no recording`);
  const clip = ((project as any).speaker_track?.clips || []).find((c: any) => c.scene_index === si);
  const onClip = clip ? takeForClip(project as any, clip) : null;
  let reattached = false;
  if (onClip !== rec) {
    if (!doAttach) throw new Error("Takes cannot be attached here");
    const out = await doAttach(tenant, projectId, rec.source, si, { capture: rec.capture || "raw", look: rec.look || "natural", correct: rec.correct !== false, performed_by: undefined });
    if (out.status !== 200) throw new Error(String(out.body?.error || `attach failed (${out.status})`));
    reattached = true;
  }
  const { setSceneCast } = await import("./recast.js");
  await setSceneCast(tenant, projectId, [si], null);
  return { reattached };
}

/** 10 ms loudness envelope of a file's sound (16 kHz mono). */
async function envelope(file: string, work: string): Promise<Float32Array> {
  const pcm = path.join(work, `env-${crypto.randomBytes(3).toString("hex")}.raw`);
  await ffmpeg(["-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", pcm]);
  const buf = await fs.readFile(pcm);
  await fs.rm(pcm, { force: true }).catch(() => {});
  const n = Math.floor(buf.length / 2), hop = 160, out = new Float32Array(Math.floor(n / hop));
  for (let f = 0; f < out.length; f++) {
    let s = 0;
    for (let i = 0; i < hop; i++) { const v = buf.readInt16LE((f * hop + i) * 2) / 32768; s += v * v; }
    out[f] = Math.sqrt(s / hop);
  }
  return out;
}

/** How far the voice file must move to line up with the video's own read
 *  (s; positive = later), by cross-correlating their envelopes within
 *  +-0.6 s. 0 when the match is too weak to trust. */
export function bestLag(video: Float32Array, voice: Float32Array, maxFrames = 60): { lag: number; score: number } {
  const norm = (a: Float32Array) => { let m = 0; for (const v of a) m += v; m /= a.length || 1; let sd = 0; for (const v of a) sd += (v - m) ** 2; sd = Math.sqrt(sd / (a.length || 1)) || 1; return Float32Array.from(a, (v) => (v - m) / sd); };
  const a = norm(video), b = norm(voice);
  let best = 0, bestScore = -Infinity;
  for (let lag = -maxFrames; lag <= maxFrames; lag++) {
    let s = 0, n = 0;
    for (let i = 0; i < b.length; i++) { const j = i + lag; if (j < 0 || j >= a.length) continue; s += a[j] * b[i]; n++; }
    const score = n ? s / n : -Infinity;
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  return bestScore >= 0.3 ? { lag: best / 100, score: bestScore } : { lag: 0, score: bestScore };
}

/** The exact voice file laid over the video in place of the model's read,
 *  shifted to line up with it, padded to the video's length. */
export async function layVoice(videoAbs: string, voiceAbs: string, outAbs: string, work: string): Promise<number> {
  const { lag } = bestLag(await envelope(videoAbs, work), await envelope(voiceAbs, work));
  const shift = lag > 0 ? `adelay=${Math.round(lag * 1000)}:all=1,` : lag < 0 ? `atrim=start=${(-lag).toFixed(3)},asetpts=PTS-STARTPTS,` : "";
  // An explicit length: an endless apad with -shortest never ended under a
  // copied video stream (measured: the encode hung).
  const dur = (await durationOf(videoAbs)) || 0;
  if (!dur) throw new Error("the video has no length");
  await ffmpeg(["-i", videoAbs, "-i", voiceAbs, "-filter_complex", `[1:a]${shift}apad=whole_dur=${dur.toFixed(3)},atrim=0:${dur.toFixed(3)}[a]`, "-map", "0:v:0", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", dur.toFixed(3), "-movflags", "+faststart", outAbs]);
  return lag;
}

/** The median pitch of a voice (Hz): 40 ms frames, autocorrelation within
 *  70-400 Hz, voiced frames only; 0 when nothing voiced was found. A
 *  MEASUREMENT only -- nothing here changes a voice. */
export async function voicePitch(file: string, work: string, start?: number, end?: number): Promise<number> {
  const pcm = path.join(work, `pitch-${crypto.randomBytes(3).toString("hex")}.raw`);
  await fs.mkdir(work, { recursive: true });
  await ffmpeg([...(start != null ? ["-ss", String(start)] : []), ...(end != null ? ["-to", String(end)] : []), "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", pcm]);
  const buf = await fs.readFile(pcm);
  await fs.rm(pcm, { force: true }).catch(() => {});
  const n = Math.floor(buf.length / 2), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(i * 2) / 32768;
  const sr = 16000, w = 640, hop = 160, lo = Math.floor(sr / 400), hi = Math.floor(sr / 70);
  const win = Float32Array.from({ length: w }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (w - 1)));
  const f0: number[] = [], fr = new Float32Array(w);
  for (let s = 0; s + w <= n; s += hop) {
    let e = 0;
    for (let i = 0; i < w; i++) { fr[i] = x[s + i] * win[i]; e += fr[i] * fr[i]; }
    if (Math.sqrt(e / w) < 0.02) continue;
    let best = 0, bk = 0;
    for (let k = lo; k < hi; k++) { let c = 0; for (let i = 0; i + k < w; i++) c += fr[i] * fr[i + k]; if (c > best) { best = c; bk = k; } }
    if (bk && best / e > 0.45) f0.push(sr / bk);
  }
  if (!f0.length) return 0;
  f0.sort((a, b) => a - b);
  return Math.round(f0[Math.floor(f0.length / 2)]);
}

/** The actor's voice in this film so far: the median pitch of their other
 *  performed scenes (each measured once from its take and remembered). */
async function filmVoicePitch(tenant: string, projectId: string, actorId: string, exceptSi: number, work: string): Promise<number> {
  const project = await loadProject(tenant, projectId);
  const board: any[] = (project as any)?.storyboard?.scenes || [];
  const clips: any[] = (project as any)?.speaker_track?.clips || [];
  const found: number[] = [];
  for (let i = 0; i < board.length; i++) {
    const p = board[i]?.performance;
    if (i === exceptSi || !p || p.actor !== actorId) continue;
    const clip = clips.find((c) => c.scene_index === i);
    const take: any = clip ? takeForClip(project as any, clip) : null;
    if (!take?.performed_by || take.performed_by.actor !== actorId) continue;
    let hz = Number(p.voice_hz) || 0;
    if (!hz) {
      hz = await voicePitch(resolveVideoPath(clip.source, config.dataDir), work, clip.trim_start, clip.trim_end).catch(() => 0);
      if (hz) { const si = i, v = hz; await patch(tenant, projectId, si, (q) => { q.voice_hz = v; }).catch(() => {}); }
    }
    if (hz) found.push(hz);
  }
  if (!found.length) return 0;
  found.sort((a, b) => a - b);
  return found[Math.floor(found.length / 2)];
}

/** How far a voice may sit from the actor's other scenes before the scene
 *  stops for a look (scene 3 at 160 Hz against 186-200 was 17% off). */
const PITCH_TOLERANCE = 0.1;

/** The voice that reads a scene's script: ElevenLabs v4, which follows
 *  delivery tags ([excited], [whispers]...), "..." pauses, CAPITALS and
 *  /IPA/ (Marc, Oct 4: control "the pauses ... the inflection ... the
 *  emphasis ... the pronunciation"). MP_TTS_MODEL overrides it. */
export const SCRIPT_VOICE_MODEL = process.env.MP_TTS_MODEL || "eleven_v4";

/** What the script voice reads: the scene's delivery when written, else
 *  its line -- "(pause)" lines become a pause v4 reads ("..."), emphasis
 *  asterisks go. v4 takes no <break> tags. */
export function deliveryText(line: string, delivery?: string): string {
  const d = String(delivery || "").trim();
  if (d) return d;
  return spokenParts(line).map((p) => p.join(" ")).join(" ... ");
}

/** The scene's voice as an MP3 at -14 LUFS (what the proven run sent). */
async function sceneVoice(tenant: string, projectId: string, si: number, actor: CastActor, source: "script" | "take", workDir: string): Promise<{ file: string; seconds: number }> {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!actor.voice_id) throw new Error(`${actor.name} has no voice: give the actor an ElevenLabs voice (cast update_actor voice_id)`);
  const w = (n: string) => path.join(workDir, n);
  const said = w("said.mp3");
  if (source === "script") {
    const { scene } = await loadScene(tenant, projectId, si);
    const text = deliveryText(String(scene.voiceover_text || ""), scene.performance?.delivery);
    if (!text) throw new Error(`Scene ${si + 1} has no lines to read`);
    await elevenSpeech(text, actor.voice_id, said, SCRIPT_VOICE_MODEL);
  } else {
    const project = await loadProject(tenant, projectId);
    const take = sceneRecording(project, si);
    if (!take) throw new Error(`Scene ${si + 1} has no recording to convert: record it, or voice the script`);
    // The take as the scene plays it: its window, through its cuts.
    const raw = takeCopies(take).raw;
    const cut = cutFileFor(take, raw);
    const onCut = !!cut && cut !== raw;
    const win = takeWindow(take);
    const start = onCut ? cutClock(take.cuts, win.start) : win.start;
    const end = onCut ? cutClock(take.cuts, win.end) : win.end;
    await ffmpeg(["-ss", String(start), ...(end > start ? ["-to", String(end)] : []), "-i", resolveVideoPath(onCut ? cut! : raw, config.dataDir),
      "-vn", "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", w("take.wav")]);
    await convertVoice(w("take.wav"), said, actor.voice_id);
  }
  const src = said;
  const file = w("voice.mp3");
  // The scene's pace: a tempo change (pitch kept) before anyone hears it.
  const speed = voiceSpeedOf((await loadScene(tenant, projectId, si)).scene.performance);
  await ffmpeg(["-i", src, "-af", `${speed !== 1 ? `atempo=${speed},` : ""}loudnorm=I=-14:TP=-1.5:LRA=11`, "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", file]);
  const seconds = (await durationOf(file)) || 0;
  if (seconds > MAX_VOICE_SECONDS) throw new Error(`Scene ${si + 1}'s line runs ${seconds.toFixed(1)} s; one Seedance shot holds ${MAX_VOICE_SECONDS} s -- split the scene`);
  return { file, seconds };
}

function perfDelivery(scene: any): string | undefined { return scene?.performance?.delivery || undefined; }
/** A scene's read speed, clamped to what still sounds like a person. */
export function voiceSpeedOf(perf: ScenePerformance | undefined): number {
  const v = Number(perf?.voice_speed);
  return v > 0 ? Math.round(Math.max(0.8, Math.min(1.25, v)) * 100) / 100 : 1;
}
function setSpeed(p: ScenePerformance, v: number | undefined): boolean {
  if (v === undefined) return false;
  const before = voiceSpeedOf(p);
  const next = Math.round(Math.max(0.8, Math.min(1.25, Number(v) || 1)) * 100) / 100;
  if (next === 1) delete p.voice_speed; else p.voice_speed = next;
  return before !== next;
}

/** The scene's heard voice, when it is still the one to send. */
function heardVoice(perf: ScenePerformance, actorId: string, line: string, voiceId?: string): NonNullable<ScenePerformance["voice_preview"]> | null {
  const vp = perf.voice_preview;
  if (!vp || vp.actor !== actorId || vp.source !== (perf.voice_source || "script")) return null;
  if (voiceId !== undefined && vp.voice_id && vp.voice_id !== voiceId) return null;
  if (vp.line !== undefined && vp.line !== line) return null;
  if (vp.source === "script" && (vp.delivery || "") !== (perf.delivery || "")) return null;
  if ((vp.speed || 1) !== voiceSpeedOf(perf)) return null;
  return vp;
}
async function useHeard(vp: NonNullable<ScenePerformance["voice_preview"]>, workDir: string): Promise<{ file: string; seconds: number }> {
  const file = path.join(workDir, "voice.mp3");
  await fs.copyFile(resolveVideoPath(vp.url, config.dataDir), file);
  return { file, seconds: (await durationOf(file)) || vp.seconds };
}

/** Perform a scene: frame (drawn if none), voice, Seedance, attach. A draft
 *  first (480p); `quality: "final"` renders the draft's shot at 1080p.
 *  Returns at once; the work runs on (poll getScenePerformances). */
export async function startScenePerformance(tenant: string, projectId: string, si: number, opts: {
  actor?: string; shot?: string; voice_source?: "script" | "take"; quality?: "draft" | "final";
  /** Full prompts in place of the defaults ("" back to the default). */
  frame_prompt?: string; video_prompt?: string;
  voice_track?: "converted" | "seedance";
  /** Make it even when the pitch check would stop it. */
  force?: boolean;
  /** The delivery the script voice reads ("" back to the plain line). */
  delivery?: string;
  /** The room reference: a project image asset ("" for none). */
  room_url?: string;
  /** The location (a tenant location id; "" for none). */
  location?: string;
  /** Who makes it: "seedance" or "heygen" (a HeyGen look's own setting).
   *  Omitted: the plan's engine for this actor, else the best for them. */
  engine?: "seedance" | "heygen";
  /** HeyGen: a direction for the movement ("" for none). */
  motion?: string;
  /** The read speed (1 = as voiced, up to 1.25). */
  voice_speed?: number;
}): Promise<ScenePerformance> {
  const doAttach = attacher;
  if (!doAttach) throw new Error("Takes cannot be attached here");
  const { project, scene } = await loadScene(tenant, projectId, si);
  const grammar = (project as any).treatment?.filmGrammar;
  if (grammar !== "speaker" && grammar !== "creator-cut") throw new Error("A performed scene needs a film a person carries (speaker or creator-cut)");
  const prev: ScenePerformance | undefined = scene.performance;
  const plan = await planOf(tenant, project, si);
  const actor = await needActor(tenant, opts.actor || plan.actor || prev?.actor);
  const engine = opts.engine || (plan.how === "generate" && plan.actor === actor.id && plan.engine ? plan.engine : defaultEngine("generate", actor));
  if (engine === "heygen") return startSceneHeygen(tenant, projectId, si, actor, plan, opts);
  if (engine !== "seedance") throw new Error(`${engine} cannot perform a scene from its line (seedance or heygen)`);
  if (!process.env.ATLASCLOUD_API_KEY) throw new Error("Seedance is not set up on this server (ATLASCLOUD_API_KEY)");
  if (!actor.voice_id) throw new Error(`${actor.name} has no voice: give the actor an ElevenLabs voice first`);
  const quality = opts.quality === "final" ? "final" : "draft";
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const shot = String(opts.shot ?? prev?.shot ?? DEFAULT_SHOT).trim().slice(0, 1000) || DEFAULT_SHOT;
  const source = opts.voice_source || prev?.voice_source || "script";
  if (opts.room_url) {
    const prefix = `/assets/${tenant}/projects/${projectId}/assets/`;
    if (!opts.room_url.startsWith(prefix) || opts.room_url.includes("..") || !/\.(jpe?g|png|webp)$/i.test(opts.room_url)) throw new Error("room_url must be an image asset of this film");
    if (!(await fs.stat(resolveVideoPath(opts.room_url, config.dataDir)).then(() => true, () => false))) throw new Error("room_url not found");
  }
  // The location the take is made in (asked for, else the plan's), checked
  // before anything is spent. A final finishing its draft keeps the draft's.
  const finishingDraft = quality === "final" && !!prev?.draft?.draft_id && opts.location === undefined;
  const where = opts.location !== undefined ? opts.location : (planField(project, si, "location") || "");
  if (!finishingDraft && where) await locationImage(tenant, where);
  running.add(key);
  const perf = await patch(tenant, projectId, si, (p, sc) => {
    if (p.actor && p.actor !== actor.id) { delete p.frames; delete p.frame; delete p.draft; delete p.final; }
    if (p.shot !== shot || p.voice_source !== source) delete p.draft;
    // The first frame is drawn for the shot: a new shot draws a new one (the
    // panel no longer shows frames -- Marc: "just go create the first frame").
    if (p.shot !== shot && p.frame && !(p.frames || []).some((f) => f.url === p.frame && f.from_scene != null)) delete p.frame;
    setPrompt(p, "frame_prompt", opts.frame_prompt);
    // A new video prompt is a new shot: the draft no longer stands.
    if (setPrompt(p, "video_prompt", opts.video_prompt)) delete p.draft;
    p.actor = actor.id; p.shot = shot; p.voice_source = source;
    if (opts.voice_track) p.voice_track = opts.voice_track;
    if (opts.delivery !== undefined) { const d = String(opts.delivery).trim().slice(0, 4000); if (d) p.delivery = d; else delete p.delivery; }
    // A new pace is a new read: the draft no longer stands.
    if (setSpeed(p, opts.voice_speed)) delete p.draft;
    if (!finishingDraft && setLocation(p, where) && opts.room_url === undefined) delete p.room_url;
    // Performing it IS the choice: the scene's plan is this actor, generated with Seedance.
    followPlan(sc, project, { actor: actor.id, how: "generate", engine: "seedance", ...(opts.location !== undefined ? { location: opts.location } : {}) }, plan);
    if (opts.room_url !== undefined) { if (opts.room_url) p.room_url = opts.room_url; else delete p.room_url; }
    p.status = "running"; p.stage = "voice"; delete p.error; delete p.pitch_check; p.started_at = new Date().toISOString(); delete p.finished_at;
  });
  const release = () => { running.delete(key); vendorNow.delete(key); };
  void runPerformance(tenant, projectId, si, actor, quality, doAttach, release, opts.force === true).catch(async (e) => {
    release();
    await patch(tenant, projectId, si, (p) => { p.status = "failed"; p.error = String(e?.message || e).slice(0, 300); delete p.stage; p.finished_at = new Date().toISOString(); }).catch(() => {});
  }).finally(() => { running.delete(key); vendorNow.delete(key); });
  return perf;
}

/** HEYGEN GENERATES THE SCENE: the actor's look (or portrait) speaks the
 *  scene's line -- the look is the setting, so there is no frame and no
 *  location. The voice: the actor's ElevenLabs voice (the v4 delivery, or the
 *  recording converted), else the look's own HeyGen voice. Our voice is laid
 *  under HeyGen's picture (its own copy is re-encoded). No draft: HeyGen's
 *  one render is the take. Returns at once. */
async function startSceneHeygen(tenant: string, projectId: string, si: number, actor: CastActor, plan: ResolvedPlan, opts: {
  voice_source?: "script" | "take"; delivery?: string; motion?: string;
}): Promise<ScenePerformance> {
  const doAttach = attacher;
  if (!doAttach) throw new Error("Takes cannot be attached here");
  if (!process.env.HEYGEN_API_KEY) throw new Error("HeyGen is not set up on this server (HEYGEN_API_KEY)");
  const { project, scene } = await loadScene(tenant, projectId, si);
  const prev: ScenePerformance | undefined = scene.performance;
  const source = opts.voice_source || prev?.voice_source || "script";
  let lookVoice = "";
  if (!actor.voice_id) {
    if (!actor.heygen_look_id) throw new Error(`${actor.name} has no voice: give the actor an ElevenLabs voice first`);
    if (source === "take") throw new Error(`${actor.name} has no ElevenLabs voice to convert your recording to: give the actor one, or read the script`);
    lookVoice = (await getHeygenLook(actor.heygen_look_id)).default_voice_id || "";
    if (!lookVoice) throw new Error(`${actor.name}'s look has no HeyGen voice of its own: give the actor an ElevenLabs voice`);
  }
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const motion = opts.motion === undefined ? DEFAULT_MOTION : String(opts.motion).trim().slice(0, 1000);
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  running.add(key);
  const perf = await patch(tenant, projectId, si, (p, sc) => {
    if (p.actor && p.actor !== actor.id) { delete p.frames; delete p.frame; delete p.draft; delete p.final; }
    p.actor = actor.id; p.voice_source = source;
    if (opts.delivery !== undefined) { const d = String(opts.delivery).trim().slice(0, 4000); if (d) p.delivery = d; else delete p.delivery; }
    p.status = "running"; p.stage = "voice"; delete p.error; delete p.pitch_check; p.started_at = new Date().toISOString(); delete p.finished_at;
    followPlan(sc, project, { actor: actor.id, how: "generate", engine: "heygen" }, plan);
  });
  const release = () => { running.delete(key); vendorNow.delete(key); };
  const stage = (st: string) => patch(tenant, projectId, si, (p) => { p.stage = st; });
  void (async () => {
    const voiceDir = path.join(projectDir(tenant, projectId), "_work", `heygen-s${si + 1}`);
    await fs.mkdir(voiceDir, { recursive: true });
    let voice: { file: string; seconds: number };
    if (actor.voice_id) voice = await sceneVoice(tenant, projectId, si, actor, source, voiceDir);
    else {
      const line = spokenParts(String((await loadScene(tenant, projectId, si)).scene.voiceover_text || "")).map((x) => x.join(" ")).join(" ... ");
      if (!line) throw new Error(`Scene ${si + 1} has no lines to read`);
      const said = path.join(voiceDir, "said.mp3"), file = path.join(voiceDir, "voice.mp3");
      await heygenSpeech(line, lookVoice, said);
      await ffmpeg(["-i", said, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", file]);
      voice = { file, seconds: (await durationOf(file)) || 0 };
    }
    const voiceName = `voice-${actor.id}-s${si + 1}-${stamp()}.mp3`;
    await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
    await fs.copyFile(voice.file, path.join(assetsDir(tenant, projectId), voiceName));
    const voiceUrl = assetUrl(tenant, projectId, voiceName);
    // One work dir per voice and direction: a restart collects the HeyGen job
    // it submitted; a new line or direction is a new job.
    const hash = crypto.createHash("sha1").update(await fs.readFile(voice.file)).update(`|${actor.id}|${motion}`).digest("hex").slice(0, 12);
    const workDir = path.join(projectDir(tenant, projectId), "_work", `heygen-s${si + 1}-${hash}`);
    await fs.mkdir(workDir, { recursive: true });
    await fs.copyFile(voice.file, path.join(workDir, "voice.mp3"));
    await stage("heygen");
    const picture = await getPerformer("heygen")!.fromAudio!(path.join(workDir, "voice.mp3"), {
      tenant, actor, portraitAbs: portraitPath(tenant, actor), workDir, width: W, height: H, ...(motion ? { motion } : {}),
    });
    await stage("attach");
    const name = `take-performed-${actor.id}-s${si + 1}-final-heygen-${stamp()}.mp4`;
    await ffmpeg(["-i", picture, "-i", voice.file, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", path.join(assetsDir(tenant, projectId), name)]);
    const url = assetUrl(tenant, projectId, name);
    const out = await doAttach(tenant, projectId, url, si, { performed_by: { actor: actor.id, engine: "heygen", quality: "final" } });
    if (out.status !== 200) throw new Error(String(out.body?.error || `attach failed (${out.status})`));
    release();
    await patch(tenant, projectId, si, (p) => {
      const now = new Date().toISOString();
      p.final = { url, made_at: now };
      p.voice_url = voiceUrl;
      p.made_with = { actor: actor.id, engine: "heygen", ...(actor.voice_id ? { voice_id: actor.voice_id } : {}) };
      p.status = "done"; delete p.stage; p.finished_at = now;
    });
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  })().catch(async (e) => {
    release();
    await patch(tenant, projectId, si, (p) => { p.status = "failed"; p.error = String(e?.message || e).slice(0, 300); delete p.stage; p.finished_at = new Date().toISOString(); }).catch(() => {});
  }).finally(release);
  return perf;
}

async function runPerformance(tenant: string, projectId: string, si: number, actor: CastActor, quality: "draft" | "final", attach: Attacher, release: () => void, force = false): Promise<void> {
  const stage = (s: string) => patch(tenant, projectId, si, (p) => { p.stage = s; });
  const { project, scene } = await loadScene(tenant, projectId, si);
  const perf: ScenePerformance = scene.performance;
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  const workDir = path.join(projectDir(tenant, projectId), "_work", `perform-s${si + 1}`);
  await fs.mkdir(workDir, { recursive: true });

  // A final finishing a draft: Atlas's draft-complete inherits the draft's
  // frame, prompt, voice and seed -- nothing is made or sent again.
  const finishing = quality === "final" && !!perf.draft?.draft_id;
  let frame = perf.frame;
  let voice: { file: string; seconds: number } | null = null;
  let voiceUrl = perf.voice_url;
  let inputs = `final:${perf.draft?.draft_id || ""}`;
  // The location's plate: the room the frame is drawn in and Seedance keeps.
  const locationAbs = !finishing && perf.location ? await locationImage(tenant, perf.location) : undefined;
  const roomAbs = perf.room_url ? resolveVideoPath(perf.room_url, config.dataDir) : locationAbs;
  if (!finishing) {
    // The frame: the one picked, else one drawn now.
    if (!frame) {
      await stage("frame");
      frame = await drawFrame(tenant, projectId, actor, perf.shot, W, H, perf.frame_prompt, locationAbs);
      const made = frame;
      await patch(tenant, projectId, si, (p) => { p.frames = [...(p.frames || []), { url: made, shot: perf.shot, ...(perf.frame_prompt ? { prompt: perf.frame_prompt } : {}), ...(perf.location ? { location: perf.location } : {}), made_at: new Date().toISOString() }].slice(-6); p.frame = made; });
    }
    await stage("voice");
    // The voice heard is the voice sent: a scene whose heard read still
    // matches (actor, source, delivery, line) gives Seedance that very file,
    // not a fresh render with its own intonation.
    const heard = heardVoice(perf, actor.id, String(scene.voiceover_text || ""), actor.voice_id);
    voice = heard ? await useHeard(heard, workDir) : await sceneVoice(tenant, projectId, si, actor, perf.voice_source, workDir);
    // THE PITCH CHECK, before Seedance is paid: the voice against the
    // actor's other scenes in this film. A line spoken low converts low
    // (scene 3: 160 Hz against 186-200), and Seedance copies it faithfully.
    const hz = await voicePitch(voice.file, workDir).catch(() => 0);
    const recHz = perf.voice_source === "take" ? await voicePitch(path.join(workDir, "take.wav"), workDir).catch(() => 0) : 0;
    const reference = hz ? await filmVoicePitch(tenant, projectId, actor.id, si, workDir).catch(() => 0) : 0;
    await patch(tenant, projectId, si, (p) => { if (hz) p.voice_hz = hz; if (recHz) p.recording_hz = recHz; else delete p.recording_hz; });
    if (!force && hz && reference && Math.abs(hz / reference - 1) > PITCH_TOLERANCE) {
      const check = { hz, reference, ...(recHz ? { recording_hz: recHz } : {}) };
      await patch(tenant, projectId, si, (p) => { p.pitch_check = check; });
      const pct = Math.round((hz / reference - 1) * 100);
      throw new Error(`Pitch check: the voice is ${hz} Hz, ${Math.abs(pct)}% ${pct < 0 ? "lower" : "higher"} than ${actor.name}'s other scenes (${reference} Hz)` +
        `${recHz ? `; your recording is ${recHz} Hz` : ""}. Nothing was sent to Seedance. ${perf.voice_source === "take" ? "Re-record the scene in your usual voice, or make it anyway." : "Make it anyway, or change the line."}`);
    }
    // The voice kept beside the take: heard, checked.
    const voiceName = `voice-${actor.id}-s${si + 1}-${stamp()}.mp3`;
    await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
    await fs.copyFile(voice.file, path.join(assetsDir(tenant, projectId), voiceName));
    voiceUrl = assetUrl(tenant, projectId, voiceName);
    const voiceHash = crypto.createHash("sha1").update(await fs.readFile(voice.file)).digest("hex").slice(0, 12);
    inputs = [actor.id, actor.sheet || "", frame, perf.shot, perf.voice_source, voiceHash, perf.video_prompt || "", perf.room_url || "", perf.location || ""].join("|");
  }
  const videoPrompt = perf.video_prompt || speakingPrompt(perf.shot);

  await stage(quality === "final" ? "final" : "draft");
  const kept = path.join(workDir, `seedance-${quality}.json`);
  const prior = await fs.readFile(kept, "utf8").then((t) => JSON.parse(t), () => null);
  const resume = prior && prior.inputs === inputs ? String(prior.prediction_id) : undefined;
  const onSubmit = async (id: string) => { await fs.writeFile(kept, JSON.stringify({ inputs, prediction_id: id })); };
  const vkey = `${tenant}/${projectId}/${si}`;
  const result = await withVendorStatus((v) => { vendorNow.set(vkey, v); }, async () => {
    if (finishing) return seedanceFinal(perf.draft!.draft_id!, { resume, onSubmit });
    const frameAbs = resolveVideoPath(frame!, config.dataDir);
    const images = [await publicUrl(tenant, projectId, frameAbs)];
    if (actor.sheet) images.push(await publicUrl(tenant, projectId, path.join(config.dataDir, tenant, actor.sheet)));
    if (roomAbs) images.push(await publicUrl(tenant, projectId, roomAbs));
    return seedanceShot({
      images, audio: await publicUrl(tenant, projectId, voice!.file), prompt: videoPrompt, room: !!roomAbs,
      // A breath of room past the voice (the proven run gave 10.03 s of voice
      // 10 s and held sync: headroom is not what keeps the lips on).
      seconds: voice!.seconds + 0.3, ratio: seedanceRatio(W, H), draft: quality === "draft", resume, onSubmit,
    });
  });

  vendorNow.delete(vkey);
  await stage("attach");
  const raw = `take-performed-${actor.id}-s${si + 1}-${quality}-${stamp()}.mp4`;
  await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
  await download(result.url, path.join(assetsDir(tenant, projectId), raw));
  const seedanceUrl = assetUrl(tenant, projectId, raw);
  // The sound: the exact voice file lined up to the video (default), or
  // the model's own read.
  let url = seedanceUrl, offset: number | undefined;
  if (perf.voice_track === "converted" && voiceUrl) {
    const name = `take-performed-${actor.id}-s${si + 1}-${quality}-voiced-${stamp()}.mp4`;
    offset = await layVoice(path.join(assetsDir(tenant, projectId), raw), resolveVideoPath(voiceUrl!, config.dataDir), path.join(assetsDir(tenant, projectId), name), workDir);
    url = assetUrl(tenant, projectId, name);
  }
  const out = await attach(tenant, projectId, url, si, { performed_by: { actor: actor.id, engine: "seedance", quality } });
  if (out.status !== 200) throw new Error(String(out.body?.error || `attach failed (${out.status})`));
  await fs.rm(kept, { force: true }).catch(() => {});
  // Free before "done": a poll that reads done may start the final at once.
  release();
  await patch(tenant, projectId, si, (p) => {
    const now = new Date().toISOString();
    if (quality === "draft") p.draft = { url, ...(result.draftId ? { draft_id: result.draftId } : {}), inputs, made_at: now };
    else p.final = { url, made_at: now };
    if (voiceUrl) p.voice_url = voiceUrl; else delete p.voice_url;
    p.seedance_url = seedanceUrl;
    p.made_with = { actor: actor.id, engine: "seedance", ...(actor.voice_id ? { voice_id: actor.voice_id } : {}), ...(p.location ? { location: p.location } : {}) };
    if (offset !== undefined) p.voice_offset = offset; else delete p.voice_offset;
    p.status = "done"; delete p.stage; p.finished_at = now;
  });
}

/** Change a performed scene's sound without making it again: "converted"
 *  lays the exact voice file over the video Seedance made (lined up), or
 *  "seedance" puts the model's own read back. Re-attached as the scene's
 *  take. For a scene made before the voice was kept, the voice from its
 *  work folder (the last one made for the scene) is used and kept. */
export async function revoiceScene(tenant: string, projectId: string, si: number, opts: { voice_track?: "converted" | "seedance" } = {}): Promise<ScenePerformance> {
  const doAttach = attacher;
  if (!doAttach) throw new Error("Takes cannot be attached here");
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const { project, scene } = await loadScene(tenant, projectId, si);
  const perf: ScenePerformance | undefined = scene.performance;
  const clip = ((project as any).speaker_track?.clips || []).find((c: any) => c.scene_index === si);
  const take: any = clip ? takeForClip(project as any, clip) : null;
  if (!perf || !take?.performed_by) throw new Error(`Scene ${si + 1} is not performed by a cast actor`);
  const track = opts.voice_track || "seedance";
  const seedanceUrl = perf.seedance_url || take.source;
  const workDir = path.join(projectDir(tenant, projectId), "_work", `perform-s${si + 1}`);
  running.add(key);
  try {
    let voiceUrl = perf.voice_url;
    if (!voiceUrl) {
      const old = path.join(workDir, "voice.mp3");
      if (!(await fs.stat(old).then(() => true, () => false))) throw new Error(`Scene ${si + 1}'s voice file is gone: perform it again`);
      const name = `voice-${perf.actor}-s${si + 1}-${stamp()}.mp3`;
      await fs.copyFile(old, path.join(assetsDir(tenant, projectId), name));
      voiceUrl = assetUrl(tenant, projectId, name);
    }
    let url = seedanceUrl, offset: number | undefined;
    if (track === "converted") {
      const name = `take-performed-${perf.actor}-s${si + 1}-${take.performed_by.quality}-voiced-${stamp()}.mp4`;
      await fs.mkdir(workDir, { recursive: true });
      offset = await layVoice(resolveVideoPath(seedanceUrl, config.dataDir), resolveVideoPath(voiceUrl, config.dataDir), path.join(assetsDir(tenant, projectId), name), workDir);
      url = assetUrl(tenant, projectId, name);
    }
    const out = await doAttach(tenant, projectId, url, si, { performed_by: take.performed_by });
    if (out.status !== 200) throw new Error(String(out.body?.error || `attach failed (${out.status})`));
    return await patch(tenant, projectId, si, (p) => {
      p.voice_track = track; p.voice_url = voiceUrl; p.seedance_url = seedanceUrl;
      if (offset !== undefined) p.voice_offset = offset; else delete p.voice_offset;
      if (take.performed_by.quality === "final" && p.final) p.final.url = url;
      else if (p.draft) p.draft.url = url;
    });
  } finally { running.delete(key); }
}

/** Put an EARLIER performance of this scene back as its take: a
 * take-performed-* asset made for this scene, re-attached (no new
 * generation). `draft_id`, when known, lets its final be finished. */
export async function restoreSceneTake(tenant: string, projectId: string, si: number, opts: { url: string; draft_id?: string }): Promise<ScenePerformance> {
  const doAttach = attacher;
  if (!doAttach) throw new Error("Takes cannot be attached here");
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const { scene } = await loadScene(tenant, projectId, si);
  const perf: ScenePerformance | undefined = scene.performance;
  if (!perf?.actor) throw new Error(`Scene ${si + 1} has no performance`);
  const prefix = `/assets/${tenant}/projects/${projectId}/assets/`;
  const name = String(opts.url || "").startsWith(prefix) ? String(opts.url).slice(prefix.length) : "";
  const m = /^take-performed-([A-Za-z0-9_-]+?)-s(\d+)-(draft|final)-[^/]+\.mp4$/.exec(name);
  if (!m || Number(m[2]) !== si + 1) throw new Error(`That is not a performance of scene ${si + 1}`);
  if (!(await fs.stat(path.join(assetsDir(tenant, projectId), name)).then(() => true, () => false))) throw new Error("That file is gone");
  const quality = m[3] as "draft" | "final";
  running.add(key);
  try {
    const out = await doAttach(tenant, projectId, opts.url, si, { performed_by: { actor: m[1], engine: "seedance", quality } });
    if (out.status !== 200) throw new Error(String(out.body?.error || `attach failed (${out.status})`));
    return await patch(tenant, projectId, si, (p) => {
      const now = new Date().toISOString();
      if (quality === "final") p.final = { url: opts.url, made_at: now };
      else { p.draft = { url: opts.url, ...(opts.draft_id ? { draft_id: String(opts.draft_id) } : {}), inputs: "restored", made_at: now }; delete p.final; }
      p.seedance_url = opts.url; delete p.voice_url; delete p.voice_offset; p.voice_track = "seedance";
    });
  } finally { running.delete(key); }
}

/** HEAR THE VOICE before Seedance: the scene's voice made on its own
 *  (cents, seconds) -- the delivery read by the script voice, or the
 *  recording converted -- kept as an asset, with its pitch. `delivery`
 *  given is kept on the scene. */
export async function previewSceneVoice(tenant: string, projectId: string, si: number, opts: { actor?: string; voice_source?: "script" | "take"; delivery?: string;
  /** Hear the line in ANOTHER voice (the voice picker): nothing on the scene
   *  or the actor changes. */
  voice_id?: string;
  /** The read speed (1 = as voiced, up to 1.25), kept on the scene. */
  voice_speed?: number }): Promise<{ url: string; seconds: number; hz: number; delivery?: string; voice_id: string }> {
  const { project, scene } = await loadScene(tenant, projectId, si);
  const prev: ScenePerformance | undefined = scene.performance;
  const actor = await needActor(tenant, opts.actor || (await planOf(tenant, project, si)).actor || prev?.actor);
  const source = opts.voice_source || prev?.voice_source || "script";
  if (opts.delivery !== undefined || opts.voice_speed !== undefined || !prev?.actor) {
    await patch(tenant, projectId, si, (p) => {
      if (!p.actor) p.actor = actor.id;
      setSpeed(p, opts.voice_speed);
      if (opts.delivery !== undefined) { const d = String(opts.delivery).trim().slice(0, 4000); if (d) p.delivery = d; else delete p.delivery; }
    });
  }
  const trying = !!opts.voice_id && opts.voice_id !== actor.voice_id;
  if (opts.voice_id && !/^[A-Za-z0-9]+$/.test(opts.voice_id)) throw new Error("Not a voice id");
  const speaker: CastActor = trying ? { ...actor, voice_id: opts.voice_id } : actor;
  const workDir = path.join(projectDir(tenant, projectId), "_work", `voice-preview-s${si + 1}${trying ? "-try" : ""}`);
  await fs.mkdir(workDir, { recursive: true });
  const voice = await sceneVoice(tenant, projectId, si, speaker, source, workDir);
  const name = `voice-preview-${actor.id}-s${si + 1}${trying ? "-try" : ""}-${stamp()}.mp3`;
  await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
  await fs.copyFile(voice.file, path.join(assetsDir(tenant, projectId), name));
  const hz = await voicePitch(voice.file, workDir).catch(() => 0);
  const url = assetUrl(tenant, projectId, name), seconds = Math.round(voice.seconds * 100) / 100;
  // A voice being tried is only heard; nothing is kept.
  if (trying) return { url, seconds, hz, voice_id: opts.voice_id!, ...(perfDelivery(scene) ? { delivery: perfDelivery(scene) } : {}) };
  // Kept on the scene: the take panel shows the voice is ready (Marc: "it
  // doesn't seem to acknowledge that there was already voice generated").
  const after = await patch(tenant, projectId, si, (p) => {
    p.voice_preview = { url, seconds, hz, actor: actor.id, voice_id: actor.voice_id, source, line: String(scene.voiceover_text || ""), ...(p.delivery ? { delivery: p.delivery } : {}), ...(voiceSpeedOf(p) !== 1 ? { speed: voiceSpeedOf(p) } : {}), made_at: new Date().toISOString() };
  });
  return { url, seconds, hz, voice_id: String(actor.voice_id || ""), ...(after?.delivery ? { delivery: after.delivery } : {}) };
}

/** THE VOICE THE PLAN SAYS, at the build: every scene planned as GENERATE by
 *  an actor with a voice gets its line read in that voice (its delivery, if
 *  any) -- the very file its take will be performed to -- and the build's
 *  scratch read under the scene points at it, so the film plays Dana before
 *  any video is made (Marc, Oct 5: the generic scratch voice "doesn't really
 *  make sense"). A scene with a performed take, or no line, is left alone.
 *  Returns the scenes voiced. */
export async function voicePlanScenes(tenant: string, projectId: string): Promise<number[]> {
  const project: any = await loadProject(tenant, projectId);
  if (!project?.storyboard?.scenes?.length) return [];
  const grammar = project.treatment?.filmGrammar;
  if (grammar !== "speaker" && grammar !== "creator-cut") return [];
  if (!process.env.ELEVENLABS_API_KEY) return [];
  const actors = await listCast(tenant);
  const done: number[] = [];
  for (let si = 0; si < project.storyboard.scenes.length; si++) {
    const sc = project.storyboard.scenes[si];
    const line = String(sc?.voiceover_text || "").trim();
    if (!line) continue;
    const plan = resolvePlan(project, si, actors, !!sceneRecording(project, si));
    const actor = plan.how === "generate" && plan.actor ? actors.find((a) => a.id === plan.actor) : null;
    if (!actor?.voice_id) continue;
    const clip = (project.speaker_track?.clips || []).find((c: any) => c.scene_index === si);
    if (clip && (takeForClip(project, clip) as any)?.performed_by) continue;
    const perf: ScenePerformance = sc.performance || { actor: actor.id, shot: DEFAULT_SHOT, voice_source: "script" };
    let vp = heardVoice({ ...perf, voice_source: perf.voice_source || "script" }, actor.id, String(sc.voiceover_text || ""), actor.voice_id);
    if (!vp) {
      try { await previewSceneVoice(tenant, projectId, si, { actor: actor.id, voice_source: "script" }); } catch (e: any) { console.warn(`  voice the plan: scene ${si + 1}: ${e?.message || e}`); continue; }
      vp = (await loadScene(tenant, projectId, si)).scene.performance?.voice_preview || null;
    }
    if (!vp) continue;
    done.push(si);
    // The scratch read under the scene plays the actor's voice.
    const k = `${tenant}/${projectId}`;
    const abs = resolveVideoPath(vp.url, config.dataDir);
    const next = (chains.get(k) || Promise.resolve()).catch(() => {}).then(async () => {
      const p: any = await loadProject(tenant, projectId);
      const tr = (p?.audio?.tracks || []).find((t: any) => t.id === `vo_scene_${si}`);
      if (tr) { tr.source = abs; tr.voice_of = actor.id; p.updated_at = new Date().toISOString(); await saveProject(p); }
    });
    chains.set(k, next);
    await next;
  }
  return done;
}

/** Every scene's performer at a glance: who plays it, and any performance. */
export async function getScenePerformances(tenant: string, projectId: string) {
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const clips = (project as any).speaker_track?.clips || [];
  const actors = await listCast(tenant);
  const { listLocations } = await import("./locations.js");
  const locations = await listLocations(tenant);
  const vertical = (Number(project.canvas?.height) || 1920) > (Number(project.canvas?.width) || 1080);
  return ((project as any).storyboard?.scenes || []).map((s: any, i: number) => {
    const pa = s.performance?.actor ? actors.find((a) => a.id === s.performance.actor) : null;
    const defaults = defaultPrompts(s.performance?.shot || DEFAULT_SHOT, vertical, pa ? !!pa.sheet : true, !!(s.performance?.room_url || s.performance?.location), !!s.performance?.location);
    const clip = clips.find((c: any) => c.scene_index === i);
    const take: any = clip ? takeForClip(project as any, clip) : null;
    const cast = s.cast !== undefined ? s.cast : (project as any).speaker_cast ?? null;
    const hasRec = !!sceneRecording(project, i);
    const plan = resolvePlan(project as any, i, actors, hasRec);
    const st = planState(project as any, i, plan, take ? { performed_by: take.performed_by || null, recast_by: Object.keys(take.actors || {}) } : null, hasRec);
    // Made in a voice the actor no longer has: stale, said why.
    const madeVoice = s.performance?.made_with?.voice_id, nowVoice = plan.actor ? actors.find((a) => a.id === plan.actor)?.voice_id : undefined;
    if (st.state === "ready" && plan.how === "generate" && madeVoice && nowVoice && madeVoice !== nowVoice) { st.state = "stale"; st.why = "made in another voice"; }
    return {
      scene_index: i, label: s.label, lines: String(s.voiceover_text || ""),
      take: take ? { performed_by: take.performed_by || null, recast_by: Object.keys(take.actors || {}) } : null,
      has_recording: hasRec,
      // The plan (core/cast-plan.ts): what the scene should be, and whether its take is it.
      plan, plan_line: planLine(plan, actors, locations), state: st.state, ...(st.why ? { why: st.why } : {}),
      performer: s.performer || null,
      cast, cast_follows_film: s.cast === undefined,
      performance: s.performance || null,
      // What the scene uses when it writes no prompt of its own.
      defaults,
      actor_clip: s.actor_clip || null,
      actor_clips: s.actor_clips || (s.actor_clip ? [s.actor_clip] : []),
      running: running.has(`${tenant}/${projectId}/${i}`),
      vendor: vendorNow.get(`${tenant}/${projectId}/${i}`) || null,
    };
  });
}

/** B-ROLL OF A CAST ACTOR: no speech -- Dana at her desk with a coffee, under
 *  the scene's voice. A frame drawn for the shot, a silent Seedance shot at
 *  720p (no draft: a cutaway is short and must look finished), laid over the
 *  scene as a video component from `at` for its length. Returns at once; the
 *  clip lands on the scene (`actor_clip`). */
export async function startActorClip(tenant: string, projectId: string, si: number, opts: {
  actor?: string; shot: string; seconds?: number; at?: number;
  /** How long it is ON SCREEN (s). Seedance makes at least 4 s; a montage
   *  beat shows 0.6-2.5 s of it (the reel Marc sent: a cut every ~2 s). */
  show?: number;
  /** Where it is set: a location id, "" none (a one-off place the shot
   *  describes: a car, a park). Omitted: the scene's. */
  location?: string;
}): Promise<Record<string, unknown>> {
  const { project, scene } = await loadScene(tenant, projectId, si);
  const actor = await needActor(tenant, opts.actor || (await planOf(tenant, project, si)).actor || scene.performance?.actor);
  if (!process.env.ATLASCLOUD_API_KEY) throw new Error("Seedance is not set up on this server (ATLASCLOUD_API_KEY)");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (the frame is drawn by GPT Image)");
  const shot = String(opts.shot || "").trim().slice(0, 1000);
  // The b-roll is set where the scene is (the plan's location, else the last
  // one used) unless it names its own place.
  const clipWhere = opts.location !== undefined ? (opts.location || undefined) : (planField(project, si, "location") ?? scene.performance?.location);
  if (clipWhere) await locationImage(tenant, clipWhere);
  if (!shot) throw new Error("shot is required: what the actor does (\"sips a coffee at her desk, looking out the window\")");
  const show = Number(opts.show) > 0 ? Math.max(0.3, Math.min(15, Number(opts.show))) : undefined;
  const seconds = Math.max(4, Math.min(15, Math.round(Number(opts.seconds) || (show ? Math.ceil(show) : 5))));
  const onScreen = show ? Math.min(show, seconds) : seconds;
  const at = Math.max(0, Math.round((Number(opts.at) || 0) * 100) / 100);
  // Several clips per scene (a montage), one per start time: a new clip at
  // the same start replaces that one.
  const key = `${tenant}/${projectId}/${si}/clip@${at}`;
  if (running.has(key)) throw new Error(`A clip at ${at} s in scene ${si + 1} is already being made`);
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  const setClip = (fn: (c: any, sc: any, p: any) => void) => {
    const k = `${tenant}/${projectId}`;
    const next = (chains.get(k) || Promise.resolve()).catch(() => {}).then(async () => {
      const p = await loadProject(tenant, projectId);
      const sc: any = (p as any)?.storyboard?.scenes?.[si];
      if (!p || !sc) throw new Error("The scene is gone");
      sc.actor_clips = Array.isArray(sc.actor_clips) ? sc.actor_clips : (sc.actor_clip ? [sc.actor_clip] : []);
      let c = sc.actor_clips.find((x: any) => Number(x?.at || 0) === at);
      if (!c) { c = {}; sc.actor_clips.push(c); sc.actor_clips.sort((a: any, b: any) => Number(a.at || 0) - Number(b.at || 0)); }
      fn(c, sc, p);
      // The last one touched, for the card that shows one.
      sc.actor_clip = c;
      p.updated_at = new Date().toISOString();
      await saveProject(p);
      return c;
    });
    chains.set(k, next);
    return next;
  };
  running.add(key);
  const started = await setClip((c) => { for (const k of Object.keys(c)) delete c[k]; Object.assign(c, { actor: actor.id, shot, seconds, ...(show ? { show: onScreen } : {}), ...(clipWhere ? { location: clipWhere } : {}), at, status: "running", started_at: new Date().toISOString() }); });
  void (async () => {
    try {
      // In the scene's location when it has one: the cutaway is the same room.
      const loc = clipWhere ? await locationImage(tenant, clipWhere) : undefined;
      const frame = await drawFrame(tenant, projectId, actor, shot, W, H, undefined, loc);
      const images = [await publicUrl(tenant, projectId, resolveVideoPath(frame, config.dataDir))];
      if (actor.sheet) images.push(await publicUrl(tenant, projectId, path.join(config.dataDir, tenant, actor.sheet)));
      if (loc) images.push(await publicUrl(tenant, projectId, loc));
      const r = await seedanceShot({ images, prompt: silentPrompt(shot), room: !!loc, seconds, ratio: seedanceRatio(W, H), draft: false, resolution: "720p" });
      const work = path.join(projectDir(tenant, projectId), "_work");
      await fs.mkdir(work, { recursive: true });
      const raw = path.join(work, `clip-${stamp()}.mp4`);
      await download(r.url, raw);
      // Silent: the scene's voice plays under it.
      const name = `clip-${actor.id}-s${si + 1}-${stamp()}.mp4`;
      await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
      await ffmpeg(["-i", raw, "-an", "-c:v", "copy", "-movflags", "+faststart", path.join(assetsDir(tenant, projectId), name)]);
      await fs.rm(raw, { force: true }).catch(() => {});
      const url = assetUrl(tenant, projectId, name);
      await setClip((c, sc, p) => {
        const comp = { type: "video", position: { x: 0, y: 0, width: "100%", height: "100%" }, z_index: 12,
          data: { src: url, object_fit: "cover", actor_clip: actor.id, clip_at: at },
          enter: { effect: "cut", at }, exit: { effect: "cut", at: Math.round((at + onScreen) * 100) / 100 } };
        // One clip per start time: a new one at the same start replaces it.
        const mine = (x: any) => x && x.type === "video" && x.data && x.data.actor_clip && Number(x.data.clip_at ?? x.enter?.at ?? 0) === at;
        sc.components = [...(sc.components || []).filter((x: any) => !mine(x)), comp];
        const built: any = (p.scenes || [])[si];
        if (built) built.components = [...(built.components || []).filter((x: any) => !mine(x)), { id: `actor_clip_${si}_${String(at).replace(".", "_")}`, ...comp }];
        running.delete(key);
        Object.assign(c, { status: "done", url, finished_at: new Date().toISOString() });
      });
    } catch (e: any) {
      running.delete(key);
      await setClip((c) => Object.assign(c, { status: "failed", error: String(e?.message || e).slice(0, 300), finished_at: new Date().toISOString() })).catch(() => {});
    } finally { running.delete(key); }
  })();
  return started;
}
