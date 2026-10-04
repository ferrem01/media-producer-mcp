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
import { getActor, portraitPath, type CastActor } from "./cast.js";
import { ffmpeg, download, durationOf, convertVoice } from "./actor-test.js";
import { elevenSpeech, scriptWithBreaks, spokenParts } from "./generated-take.js";
import { takeForClip, takeCopies } from "./speaker-layer.js";
import { takeWindow, cutClock, cutFileFor } from "./take-clock.js";
import { editImage } from "../media/image-gen.js";
import { seedanceShot, seedanceFinal, speakingPrompt, silentPrompt, seedanceRatio, seedanceRefs } from "./seedance.js";
import { withVendorStatus, type VendorStatus } from "./vendor-status.js";
import type { ScenePerformance } from "./types.js";

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
async function patch(tenant: string, projectId: string, si: number, fn: (perf: ScenePerformance) => void): Promise<ScenePerformance> {
  const k = `${tenant}/${projectId}`;
  const next = (chains.get(k) || Promise.resolve()).catch(() => {}).then(async () => {
    const project = await loadProject(tenant, projectId);
    if (!project) throw new Error("Project not found");
    const scene: any = (project as any).storyboard?.scenes?.[si];
    if (!scene) throw new Error(`No scene ${si + 1}`);
    const perf: ScenePerformance = scene.performance || { actor: "", shot: DEFAULT_SHOT, voice_source: "script" };
    fn(perf);
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

/** The start frame prompt: the same person, in this shot, at this shape. */
export function framePrompt(shot: string, vertical: boolean, sheet: boolean): string {
  return `The exact same person as in the reference image${sheet ? "s (the first is their portrait, the second their character sheet)" : ""}: ` +
    "the same face, hair, skin, clothes and accessories. " +
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

/** The prompts a scene uses unless it says otherwise: built from the shot. */
export function defaultPrompts(shot: string, vertical: boolean, sheet: boolean): { frame_prompt: string; video_prompt: string } {
  return { frame_prompt: framePrompt(shot, vertical, sheet), video_prompt: `${seedanceRefs(sheet ? 2 : 1, true)} ${speakingPrompt(shot)}` };
}

async function drawFrame(tenant: string, projectId: string, actor: CastActor, shot: string, width: number, height: number, prompt?: string): Promise<string> {
  const vertical = height > width;
  const sheetAbs = actor.sheet ? path.join(config.dataDir, tenant, actor.sheet) : undefined;
  const work = path.join(projectDir(tenant, projectId), "_work");
  await fs.mkdir(work, { recursive: true });
  const drawn = path.join(work, `frame-${stamp()}.png`);
  await editImage({ prompt: prompt || framePrompt(shot, vertical, !!sheetAbs), images: [portraitPath(tenant, actor), ...(sheetAbs ? [sheetAbs] : [])], outputPath: drawn, size: vertical ? "1024x1536" : height === width ? "1024x1024" : "1536x1024" });
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
export async function startSceneFrame(tenant: string, projectId: string, si: number, opts: { actor?: string; shot?: string; frame_prompt?: string }): Promise<ScenePerformance> {
  const { project, scene } = await loadScene(tenant, projectId, si);
  const prev: ScenePerformance | undefined = scene.performance;
  const actor = await needActor(tenant, opts.actor || prev?.actor);
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (the start frame is drawn by GPT Image)");
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const shot = String(opts.shot ?? prev?.shot ?? DEFAULT_SHOT).trim().slice(0, 1000) || DEFAULT_SHOT;
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  running.add(key);
  const perf = await patch(tenant, projectId, si, (p) => {
    if (p.actor && p.actor !== actor.id) { delete p.frames; delete p.frame; delete p.draft; delete p.final; }
    p.actor = actor.id; p.shot = shot; setPrompt(p, "frame_prompt", opts.frame_prompt);
    p.status = "running"; p.stage = "frame"; delete p.error;
    p.started_at = new Date().toISOString(); delete p.finished_at;
  });
  const prompt = perf.frame_prompt;
  void (async () => {
    try {
      const url = await drawFrame(tenant, projectId, actor, shot, W, H, prompt);
      // Free before "done": a poll that reads done may start the next job at once.
      running.delete(key);
      await patch(tenant, projectId, si, (p) => {
        p.frames = [...(p.frames || []), { url, shot, ...(prompt ? { prompt } : {}), made_at: new Date().toISOString() }].slice(-6);
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
  const actor = await needActor(tenant, opts.actor || prev?.actor);
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

/** The scene's voice as an MP3 at -14 LUFS (what the proven run sent). */
async function sceneVoice(tenant: string, projectId: string, si: number, actor: CastActor, source: "script" | "take", workDir: string): Promise<{ file: string; seconds: number }> {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
  if (!actor.voice_id) throw new Error(`${actor.name} has no voice: give the actor an ElevenLabs voice (cast update_actor voice_id)`);
  const w = (n: string) => path.join(workDir, n);
  const said = w("said.mp3");
  if (source === "script") {
    const { scene } = await loadScene(tenant, projectId, si);
    const text = String(scene.voiceover_text || "");
    if (!spokenParts(text).length) throw new Error(`Scene ${si + 1} has no lines to read`);
    await elevenSpeech(scriptWithBreaks([text], false), actor.voice_id, said);
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
  const file = w("voice.mp3");
  await ffmpeg(["-i", said, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", file]);
  const seconds = (await durationOf(file)) || 0;
  if (seconds > MAX_VOICE_SECONDS) throw new Error(`Scene ${si + 1}'s line runs ${seconds.toFixed(1)} s; one Seedance shot holds ${MAX_VOICE_SECONDS} s -- split the scene`);
  return { file, seconds };
}

/** Perform a scene: frame (drawn if none), voice, Seedance, attach. A draft
 *  first (480p); `quality: "final"` renders the draft's shot at 1080p.
 *  Returns at once; the work runs on (poll getScenePerformances). */
export async function startScenePerformance(tenant: string, projectId: string, si: number, opts: {
  actor?: string; shot?: string; voice_source?: "script" | "take"; quality?: "draft" | "final";
  /** Full prompts in place of the defaults ("" back to the default). */
  frame_prompt?: string; video_prompt?: string;
}): Promise<ScenePerformance> {
  const doAttach = attacher;
  if (!doAttach) throw new Error("Takes cannot be attached here");
  const { project, scene } = await loadScene(tenant, projectId, si);
  const grammar = (project as any).treatment?.filmGrammar;
  if (grammar !== "speaker" && grammar !== "creator-cut") throw new Error("A performed scene needs a film a person carries (speaker or creator-cut)");
  const prev: ScenePerformance | undefined = scene.performance;
  const actor = await needActor(tenant, opts.actor || prev?.actor);
  if (!process.env.ATLASCLOUD_API_KEY) throw new Error("Seedance is not set up on this server (ATLASCLOUD_API_KEY)");
  if (!actor.voice_id) throw new Error(`${actor.name} has no voice: give the actor an ElevenLabs voice first`);
  const quality = opts.quality === "final" ? "final" : "draft";
  const key = `${tenant}/${projectId}/${si}`;
  if (running.has(key)) throw new Error(`Scene ${si + 1} is already being worked on`);
  const shot = String(opts.shot ?? prev?.shot ?? DEFAULT_SHOT).trim().slice(0, 1000) || DEFAULT_SHOT;
  const source = opts.voice_source || prev?.voice_source || "script";
  running.add(key);
  const perf = await patch(tenant, projectId, si, (p) => {
    if (p.actor && p.actor !== actor.id) { delete p.frames; delete p.frame; delete p.draft; delete p.final; }
    if (p.shot !== shot || p.voice_source !== source) delete p.draft;
    setPrompt(p, "frame_prompt", opts.frame_prompt);
    // A new video prompt is a new shot: the draft no longer stands.
    if (setPrompt(p, "video_prompt", opts.video_prompt)) delete p.draft;
    p.actor = actor.id; p.shot = shot; p.voice_source = source;
    p.status = "running"; p.stage = "voice"; delete p.error; p.started_at = new Date().toISOString(); delete p.finished_at;
  });
  const release = () => { running.delete(key); vendorNow.delete(key); };
  void runPerformance(tenant, projectId, si, actor, quality, doAttach, release).catch(async (e) => {
    release();
    await patch(tenant, projectId, si, (p) => { p.status = "failed"; p.error = String(e?.message || e).slice(0, 300); delete p.stage; p.finished_at = new Date().toISOString(); }).catch(() => {});
  }).finally(() => { running.delete(key); vendorNow.delete(key); });
  return perf;
}

async function runPerformance(tenant: string, projectId: string, si: number, actor: CastActor, quality: "draft" | "final", attach: Attacher, release: () => void): Promise<void> {
  const stage = (s: string) => patch(tenant, projectId, si, (p) => { p.stage = s; });
  const { project, scene } = await loadScene(tenant, projectId, si);
  const perf: ScenePerformance = scene.performance;
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  const workDir = path.join(projectDir(tenant, projectId), "_work", `perform-s${si + 1}`);
  await fs.mkdir(workDir, { recursive: true });

  // The frame: the one picked, else one drawn now.
  let frame = perf.frame;
  if (!frame) {
    await stage("frame");
    frame = await drawFrame(tenant, projectId, actor, perf.shot, W, H, perf.frame_prompt);
    const made = frame;
    await patch(tenant, projectId, si, (p) => { p.frames = [...(p.frames || []), { url: made, shot: perf.shot, ...(perf.frame_prompt ? { prompt: perf.frame_prompt } : {}), made_at: new Date().toISOString() }].slice(-6); p.frame = made; });
  }
  await stage("voice");
  const voice = await sceneVoice(tenant, projectId, si, actor, perf.voice_source, workDir);
  const voiceHash = crypto.createHash("sha1").update(await fs.readFile(voice.file)).digest("hex").slice(0, 12);
  // What makes the shot: a final can finish the draft only if none changed.
  // (The script voice is made fresh each time and differs by a hair, so a
  // draft from the script is finished whatever the new read sounds like.)
  const videoPrompt = perf.video_prompt || speakingPrompt(perf.shot);
  const inputs = [actor.id, actor.sheet || "", frame, perf.shot, perf.voice_source, perf.voice_source === "take" ? voiceHash : "", perf.video_prompt || ""].join("|");

  await stage(quality === "final" ? "final" : "draft");
  const kept = path.join(workDir, `seedance-${quality}.json`);
  const prior = await fs.readFile(kept, "utf8").then((t) => JSON.parse(t), () => null);
  const resume = prior && prior.inputs === inputs ? String(prior.prediction_id) : undefined;
  const onSubmit = async (id: string) => { await fs.writeFile(kept, JSON.stringify({ inputs, prediction_id: id })); };
  const vkey = `${tenant}/${projectId}/${si}`;
  const result = await withVendorStatus((v) => { vendorNow.set(vkey, v); }, async () => {
    if (quality === "final" && perf.draft?.draft_id && perf.draft.inputs === inputs) return seedanceFinal(perf.draft.draft_id, { resume, onSubmit });
    const frameAbs = resolveVideoPath(frame!, config.dataDir);
    const images = [await publicUrl(tenant, projectId, frameAbs)];
    if (actor.sheet) images.push(await publicUrl(tenant, projectId, path.join(config.dataDir, tenant, actor.sheet)));
    return seedanceShot({
      images, audio: await publicUrl(tenant, projectId, voice.file), prompt: videoPrompt,
      // A breath of room past the voice (the proven run gave 10.03 s of voice
      // 10 s and held sync: headroom is not what keeps the lips on).
      seconds: voice.seconds + 0.3, ratio: seedanceRatio(W, H), draft: quality === "draft", resume, onSubmit,
    });
  });

  vendorNow.delete(vkey);
  await stage("attach");
  const name = `take-performed-${actor.id}-s${si + 1}-${quality}-${stamp()}.mp4`;
  await fs.mkdir(assetsDir(tenant, projectId), { recursive: true });
  await download(result.url, path.join(assetsDir(tenant, projectId), name));
  const url = assetUrl(tenant, projectId, name);
  const out = await attach(tenant, projectId, url, si, { performed_by: { actor: actor.id, engine: "seedance", quality } });
  if (out.status !== 200) throw new Error(String(out.body?.error || `attach failed (${out.status})`));
  await fs.rm(kept, { force: true }).catch(() => {});
  // Free before "done": a poll that reads done may start the final at once.
  release();
  await patch(tenant, projectId, si, (p) => {
    const now = new Date().toISOString();
    if (quality === "draft") p.draft = { url, ...(result.draftId ? { draft_id: result.draftId } : {}), inputs, made_at: now };
    else p.final = { url, made_at: now };
    p.status = "done"; delete p.stage; p.finished_at = now;
  });
}

/** Every scene's performer at a glance: who plays it, and any performance. */
export async function getScenePerformances(tenant: string, projectId: string) {
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const clips = (project as any).speaker_track?.clips || [];
  const { listCast } = await import("./cast.js");
  const actors = await listCast(tenant);
  const vertical = (Number(project.canvas?.height) || 1920) > (Number(project.canvas?.width) || 1080);
  return ((project as any).storyboard?.scenes || []).map((s: any, i: number) => {
    const pa = s.performance?.actor ? actors.find((a) => a.id === s.performance.actor) : null;
    const defaults = defaultPrompts(s.performance?.shot || DEFAULT_SHOT, vertical, pa ? !!pa.sheet : true);
    const clip = clips.find((c: any) => c.scene_index === i);
    const take: any = clip ? takeForClip(project as any, clip) : null;
    const cast = s.cast !== undefined ? s.cast : (project as any).speaker_cast ?? null;
    return {
      scene_index: i, label: s.label, lines: String(s.voiceover_text || ""),
      take: take ? { performed_by: take.performed_by || null, recast_by: Object.keys(take.actors || {}) } : null,
      has_recording: !!sceneRecording(project, i),
      cast, cast_follows_film: s.cast === undefined,
      performance: s.performance || null,
      // What the scene uses when it writes no prompt of its own.
      defaults,
      actor_clip: s.actor_clip || null,
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
export async function startActorClip(tenant: string, projectId: string, si: number, opts: { actor?: string; shot: string; seconds?: number; at?: number }): Promise<Record<string, unknown>> {
  const { project, scene } = await loadScene(tenant, projectId, si);
  const actor = await needActor(tenant, opts.actor || scene.performance?.actor);
  if (!process.env.ATLASCLOUD_API_KEY) throw new Error("Seedance is not set up on this server (ATLASCLOUD_API_KEY)");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (the frame is drawn by GPT Image)");
  const shot = String(opts.shot || "").trim().slice(0, 1000);
  if (!shot) throw new Error("shot is required: what the actor does (\"sips a coffee at her desk, looking out the window\")");
  const seconds = Math.max(4, Math.min(15, Math.round(Number(opts.seconds) || 5)));
  const at = Math.max(0, Number(opts.at) || 0);
  const key = `${tenant}/${projectId}/${si}/clip`;
  if (running.has(key)) throw new Error(`A clip for scene ${si + 1} is already being made`);
  const W = Number(project.canvas?.width) || 1080, H = Number(project.canvas?.height) || 1920;
  const setClip = (fn: (c: any, sc: any, p: any) => void) => {
    const k = `${tenant}/${projectId}`;
    const next = (chains.get(k) || Promise.resolve()).catch(() => {}).then(async () => {
      const p = await loadProject(tenant, projectId);
      const sc: any = (p as any)?.storyboard?.scenes?.[si];
      if (!p || !sc) throw new Error("The scene is gone");
      sc.actor_clip = sc.actor_clip || {};
      fn(sc.actor_clip, sc, p);
      p.updated_at = new Date().toISOString();
      await saveProject(p);
      return sc.actor_clip;
    });
    chains.set(k, next);
    return next;
  };
  running.add(key);
  const started = await setClip((c) => { for (const k of Object.keys(c)) delete c[k]; Object.assign(c, { actor: actor.id, shot, seconds, at, status: "running", started_at: new Date().toISOString() }); });
  void (async () => {
    try {
      const frame = await drawFrame(tenant, projectId, actor, shot, W, H);
      const images = [await publicUrl(tenant, projectId, resolveVideoPath(frame, config.dataDir))];
      if (actor.sheet) images.push(await publicUrl(tenant, projectId, path.join(config.dataDir, tenant, actor.sheet)));
      const r = await seedanceShot({ images, prompt: silentPrompt(shot), seconds, ratio: seedanceRatio(W, H), draft: false, resolution: "720p" });
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
          data: { src: url, object_fit: "cover", actor_clip: actor.id },
          enter: { effect: "cut", at }, exit: { effect: "cut", at: at + seconds } };
        // One actor clip per scene: a new one replaces the last.
        const mine = (x: any) => x && x.type === "video" && x.data && x.data.actor_clip;
        sc.components = [...(sc.components || []).filter((x: any) => !mine(x)), comp];
        const built: any = (p.scenes || [])[si];
        if (built) built.components = [...(built.components || []).filter((x: any) => !mine(x)), { id: `actor_clip_${si}`, ...comp }];
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
