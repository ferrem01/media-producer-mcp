/**
 * ACTOR TEST (an experiment, nothing in a film changes): one scene of the
 * speaker's take, performed by a synthetic actor.
 *
 * Marc: record anywhere -- "on the toilet" -- and still ship a professional
 * film, because performance transfer redraws the person, the hair, the light
 * and the room from a reference portrait while keeping HIS timing, gestures
 * and mouth. The test sends one scene's slice of the take to each provider
 * that has a key, converts the voice so a new face does not speak with his
 * voice (speech-to-speech keeps the delivery, so word anchors would hold),
 * and cuts a side-by-side to compare:
 *
 *   wan    -- Wan 2.2 Animate "replace" on fal (the engine under Higgsfield's
 *             Character Swap)                                 FAL_KEY
 *   runway -- Runway Act-Two (character_performance)          RUNWAYML_API_SECRET
 *   voice  -- ElevenLabs speech-to-speech, a stock voice      ELEVENLABS_API_KEY
 *
 * Inputs go as data URIs (a 5s 720p slice is ~2 MB; both providers accept
 * them). Files land in the project's output dir under actor-tests/<id>/,
 * reachable by URL like a render; status.json records every step.
 */
import { reportVendor, falJob } from "./vendor-status.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { projectOutputDir } from "../persistence/paths.js";
import { loadProject } from "../persistence/project.js";
import { resolveVideoPath } from "./video-path.js";
import { takeForClip, takeCopies } from "./speaker-layer.js";

const execFileAsync = promisify(execFile);

export type ActorProvider = "wan" | "wan-move" | "runway" | "seedance" | "seedance-t2v" | "wan-s2v" | "kling" | "heygen" | "heygen-avatar" | "heygen-v3" | "seedance25" | "genjutsu" | "hf-seedance25";
type StepStatus = "running" | "done" | "failed" | "skipped";

export interface ActorTest {
  id: string;
  tenant_id: string;
  project_id: string;
  scene_index: number;
  image: string;
  providers: ActorProvider[];
  voice: boolean;
  voice_name?: string;
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at?: string;
  steps: Record<string, { status: StepStatus; error?: string; seconds?: number }>;
  /** name -> file in the test's folder (source, actor, wan, runway, voice, compare). */
  files: Record<string, string>;
  error?: string;
}

const KEYS: Record<ActorProvider, string> = { wan: "FAL_KEY", "wan-move": "FAL_KEY", runway: "RUNWAYML_API_SECRET", seedance: "FAL_KEY", "seedance-t2v": "FAL_KEY", "wan-s2v": "FAL_KEY", kling: "FAL_KEY", heygen: "HEYGEN_API_KEY", "heygen-avatar": "HEYGEN_API_KEY", "heygen-v3": "HEYGEN_API_KEY", seedance25: "FAL_KEY", genjutsu: "HF_API_KEY_ID", "hf-seedance25": "HF_API_KEY_ID" };
const tests = new Map<string, ActorTest>();

export function isActorTestId(id: string): boolean {
  return /^[A-Za-z0-9_-]{10,32}$/.test(id);
}

export function actorTestDir(tenant: string, project: string, id: string): string {
  return path.join(projectOutputDir(tenant, project), "actor-tests", id);
}

async function save(t: ActorTest): Promise<void> {
  const dir = actorTestDir(t.tenant_id, t.project_id, t.id);
  await fs.writeFile(path.join(dir, "status.json"), JSON.stringify(t, null, 2));
}

export async function getActorTest(tenant: string, project: string, id: string): Promise<ActorTest | null> {
  if (!isActorTestId(id)) return null;
  const live = tests.get(id);
  if (live && live.tenant_id === tenant && live.project_id === project) return live;
  try {
    return JSON.parse(await fs.readFile(path.join(actorTestDir(tenant, project, id), "status.json"), "utf8")) as ActorTest;
  } catch {
    return null;
  }
}

/** COLLECT a Genjutsu job a test stopped waiting for (a timeout, a restart):
 *  the saved status URL is polled again, and the finished video becomes the
 *  test's result -- no second job, no second charge. Returns at once. */
export async function collectActorTest(tenant: string, project: string, id: string): Promise<ActorTest> {
  const test = await getActorTest(tenant, project, id);
  if (!test) throw new Error("Actor test not found");
  if (test.status === "running" && tests.has(id)) throw new Error("This test is still running");
  const f = (name: string) => path.join(actorTestDir(tenant, project, id), name);
  const req = await fs.readFile(f("genjutsu-request.json"), "utf8").then((t) => JSON.parse(t)?.status_url as string, () => "");
  if (!req) throw new Error("This test has no Higgsfield job to collect");
  test.status = "running"; delete test.error; delete test.finished_at;
  test.steps.genjutsu = { status: "running" };
  tests.set(id, test);
  await save(test);
  const t0 = Date.now();
  void (async () => {
    try {
      const url = await runGenjutsu("", [], { resume: req });
      await download(url, f("genjutsu-raw.mp4"));
      test.steps.genjutsu = { status: "done", seconds: Math.round((Date.now() - t0) / 100) / 10 };
      await finishTest(test, ["genjutsu"]);
    } catch (e: any) {
      test.steps.genjutsu = { status: "failed", error: String(e?.message || e).slice(0, 300) };
      test.status = "failed"; test.error = test.steps.genjutsu.error; test.finished_at = new Date().toISOString();
      await save(test);
    } finally { tests.delete(id); }
  })();
  return test;
}

export async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 20 * 1024 * 1024 });
}

export async function dataUri(file: string, mime: string): Promise<string> {
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
}

export async function okJson(r: Response, what: string): Promise<any> {
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) {
    // The provider's own words, never its echo of the input (a 422 repeats
    // every data URI sent -- 350 KB of base64 in status.json).
    const d = j?.detail;
    const msg = Array.isArray(d) ? d.map((x: any) => x?.msg || x?.type).filter(Boolean).join("; ") : typeof d === "string" ? d : j?.error || j?.message;
    throw new Error(`${what}: HTTP ${r.status} ${String(msg || text).replace(/data:[^"',\s]{40,}/g, "data:...").slice(0, 300)}`);
  }
  return j;
}

export async function download(url: string, file: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download: HTTP ${r.status}`);
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DEADLINE_MS = 25 * 60 * 1000;
const POLL_MS = Number(process.env.MP_ACTOR_POLL_MS) || 5000;

/** Wan 2.2 Animate through fal's queue: submit, poll, fetch. "replace"
 *  swaps the person inside the recorded room; "move" animates the portrait
 *  in the portrait's own setting with the take's motion. */
export async function runWan(src: string, img: string, mode: "replace" | "move", opts: {
  /** A request already submitted (its fal urls): poll it instead of paying again. */
  resume?: { status_url: string; response_url: string };
  /** Called with the request's urls as soon as fal queues it, so a restart can resume. */
  onSubmit?: (req: { status_url: string; response_url: string }) => void | Promise<void>;
  deadlineMs?: number;
  /** The same seed on every chunk of a take: each run makes the same choices. */
  seed?: number;
} = {}): Promise<string> {
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  let statusUrl: string, responseUrl: string;
  if (opts.resume?.status_url && opts.resume?.response_url) {
    statusUrl = opts.resume.status_url; responseUrl = opts.resume.response_url;
  } else {
    const sub = await okJson(await fetch(`https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/${mode}`, {
      method: "POST", headers,
      body: JSON.stringify({ video_url: src, image_url: img, resolution: "720p", video_quality: "high", ...(opts.seed != null ? { seed: opts.seed } : {}) }),
    }), "fal submit");
    statusUrl = sub.status_url; responseUrl = sub.response_url;
    if (!statusUrl || !responseUrl) throw new Error("fal submit: no status_url in the reply");
    await opts.onSubmit?.({ status_url: statusUrl, response_url: responseUrl });
  }
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > (opts.deadlineMs || DEADLINE_MS)) throw new Error("fal: timed out");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "fal status");
    reportVendor({ vendor: "fal", job: falJob(statusUrl), status: st.status, queue: st.queue_position });
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`fal: ${st.status}`);
  }
  const res = await okJson(await fetch(responseUrl, { headers }), "fal result");
  const url = res?.video?.url;
  if (!url) throw new Error("fal result: no video url");
  return url;
}

/** Seedance 2.0 reference-to-video on fal: NOBODY performs -- the model
 *  invents the shot (a walk down a street, a kitchen) from the portrait and
 *  the prompt, and lip-syncs the actor to the audio reference. */
async function runSeedance(img: string | null, audio: string | null, prompt: string, seconds: number, aspect: string): Promise<string> {
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  // With a portrait and a voice: reference-to-video. With neither: text-to-video
  // -- ByteDance refuses realistic faces as references ("likenesses of real
  // people", measured on our generated actor), so the actor is described.
  const route = img ? "reference-to-video" : "text-to-video";
  const refs = img ? { image_urls: [img], ...(audio ? { audio_urls: [audio] } : {}) } : {};
  const sub = await okJson(await fetch(`https://queue.fal.run/bytedance/seedance-2.0/${route}`, {
    method: "POST", headers,
    body: JSON.stringify({ prompt, ...refs, duration: String(seconds), aspect_ratio: aspect, resolution: "720p", generate_audio: true }),
  }), "seedance submit");
  const statusUrl: string = sub.status_url, responseUrl: string = sub.response_url;
  if (!statusUrl || !responseUrl) throw new Error("seedance submit: no status_url in the reply");
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("seedance: timed out");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "seedance status");
    reportVendor({ vendor: "seedance", job: falJob(statusUrl), status: st.status, queue: st.queue_position });
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`seedance: ${st.status}`);
  }
  const res = await okJson(await fetch(responseUrl, { headers }), "seedance result");
  const url = res?.video?.url;
  if (!url) throw new Error("seedance result: no video url");
  return url;
}

/** Text-to-video: the actor, the shot and the line, all in words. */
export function seedanceTextPrompt(line: string): string {
  return `Handheld selfie-style phone video, vertical. A friendly American man around 40 with short tousled dark-blond hair, light stubble and blue-grey eyes, wearing a charcoal henley, walks slowly down a sunny, tree-lined city sidewalk, holding the phone at arm's length, looking into the lens and talking to the camera in a relaxed, conversational, slightly amused tone. He says: "${line.replace(/"/g, "'")}" Natural daylight, realistic skin, real phone footage, ambient street sound, no music, no text, no subtitles.`;
}

export const SEEDANCE_DEFAULT_PROMPT = "@Image1 is the person. Handheld selfie-style phone video: they walk slowly down a sunny, tree-lined city sidewalk, holding the phone at arm's length, looking into the lens and talking to the camera, saying exactly the words in @Audio1 with their lips in sync with @Audio1. Natural daylight, realistic skin, casual and friendly, real phone footage, no text, no music.";

/** Wan 2.2 Speech-to-Video on fal: ONE still (the actor in the scene) and
 *  an audio track -> the person talks, face and body, inside that picture.
 *  The same still every scene is the same man in the same room. At most
 *  120 frames, so the frame rate stretches to cover the line. */
async function runWanS2V(img: string, audio: string, secs: number, prompt: string): Promise<string> {
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const fps = Math.max(16, Math.min(30, Math.floor(120 / Math.max(1, secs))));
  const frames = Math.max(40, Math.min(120, Math.ceil((secs * fps) / 4) * 4));
  const sub = await okJson(await fetch("https://queue.fal.run/fal-ai/wan/v2.2-14b/speech-to-video", {
    method: "POST", headers,
    body: JSON.stringify({ prompt, image_url: img, audio_url: audio, num_frames: frames, frames_per_second: fps, resolution: "720p", video_quality: "high" }),
  }), "wan s2v submit");
  const statusUrl: string = sub.status_url, responseUrl: string = sub.response_url;
  if (!statusUrl || !responseUrl) throw new Error("wan s2v submit: no status_url in the reply");
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("wan s2v: timed out");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "wan s2v status");
    reportVendor({ vendor: "wan", job: falJob(statusUrl), status: st.status, queue: st.queue_position });
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`wan s2v: ${st.status}`);
  }
  const res = await okJson(await fetch(responseUrl, { headers }), "wan s2v result");
  const url = res?.video?.url;
  if (!url) throw new Error("wan s2v result: no video url");
  return url;
}

export const WAN_S2V_DEFAULT_PROMPT = "The man in the picture talks to the camera in a relaxed, conversational, slightly amused way, with natural small head movements and a casual hand gesture. The camera stays still. Real amateur home footage.";

/** Kling 3.0 Motion Control (Pro) on fal: the take's movement, timing and
 *  expression mapped onto the character image -- face, clothes and setting
 *  from the image -- in ONE call of up to 30 s (character_orientation
 *  "video"). No chunks, so no seams (the Wan recast's problem). */
/** A fal queue job: submit, poll its status, collect the result's video. */
async function falVideo(route: string, body: Record<string, unknown>, what: string): Promise<string> {
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const sub = await okJson(await fetch(`https://queue.fal.run/${route}`, { method: "POST", headers, body: JSON.stringify(body) }), `${what} submit`);
  const statusUrl: string = sub.status_url, responseUrl: string = sub.response_url;
  if (!statusUrl || !responseUrl) throw new Error(`${what} submit: no status_url in the reply`);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error(`${what}: timed out`);
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), `${what} status`);
    reportVendor({ vendor: what, job: falJob(statusUrl), status: st.status, queue: st.queue_position });
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`${what}: ${st.status}`);
  }
  const res = await okJson(await fetch(responseUrl, { headers }), `${what} result`);
  const url = res?.video?.url;
  if (!url) throw new Error(`${what} result: no video url`);
  return url;
}

/** Kling AI Avatar v2 Pro (on fal): a portrait and a voice (2-60 s, 5 MB)
 *  -> the portrait talking, lip-synced, its motion Kling's own. */
export async function runKlingAvatar(img: string, audio: string, prompt?: string): Promise<string> {
  return falVideo("fal-ai/kling-video/ai-avatar/v2/pro", { image_url: img, audio_url: audio, ...(prompt ? { prompt } : {}) }, "kling avatar");
}

/** HIGGSFIELD GENJUTSU Motion Transfer (api.higgsfield.ai): the recording's
 *  motion, timing and camera rebuilt with the person in the reference
 *  image(s) -- the Recast in Higgsfield's reels. Public URLs only; 4-30 s
 *  (longer is trimmed). A resumable job: `resume` is a status_url saved
 *  by `onSubmit`. */
export const GENJUTSU_PROMPT = "Replace the person in the video with the person in the reference image: the same face, hair and clothes. " +
  "Keep the motion, gestures, hand positions, head movement, timing, lip movement, expressions, camera and room of the video exactly. Photorealistic.";
/** Genjutsu took 20.5 min for 30 s at 1080p, and over 25 min once (measured):
 *  give it an hour before giving up -- and keep the job, so it can be collected. */
const GENJUTSU_DEADLINE_MS = 60 * 60 * 1000;
export const GENJUTSU_SCENE_PROMPT = "Replace the person in the video with the person in the first reference image: the same face, hair and clothes. " +
  "Place them in the setting of the second reference image (the room, the desk, the lighting). " +
  "Keep the motion, gestures, hand positions, head movement, timing, lip movement, expressions and camera framing of the video exactly. Photorealistic.";
export async function runGenjutsu(video: string, images: string[], opts: { prompt?: string; resolution?: string; resume?: string; onSubmit?: (statusUrl: string) => Promise<void> | void; deadlineMs?: number } = {}): Promise<string> {
  const id = process.env.HF_API_KEY_ID, secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) throw new Error("HF_API_KEY_ID / HF_API_KEY_SECRET are not set");
  const headers = { Authorization: `Key ${id}:${secret}`, "Content-Type": "application/json" };
  let statusUrl = opts.resume;
  if (!statusUrl) {
    const sub = await okJson(await fetch("https://api.higgsfield.ai/higgsfield/genjutsu/motion-transfer/v1.0", {
      method: "POST", headers: { ...headers, "Idempotency-Key": crypto.randomBytes(12).toString("hex") },
      body: JSON.stringify({ video_url: video, image_urls: images.slice(0, 8), prompt: opts.prompt ?? GENJUTSU_PROMPT, resolution: opts.resolution || "1080p" }),
    }), "genjutsu submit");
    statusUrl = sub?.status_url || (sub?.request_id ? `https://api.higgsfield.ai/requests/${sub.request_id}/status` : "");
    if (!statusUrl) throw new Error(`genjutsu submit: ${JSON.stringify(sub).slice(0, 200)}`);
    await opts.onSubmit?.(statusUrl);
  }
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > (opts.deadlineMs || GENJUTSU_DEADLINE_MS)) throw new Error("genjutsu: timed out (the job is kept: collect it later)");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "genjutsu status");
    reportVendor({ vendor: "higgsfield", job: st?.id || st?.request_id, status: st.status, progress: typeof st?.progress === "number" ? st.progress : undefined });
    if (st.status === "completed") {
      const url = st?.video?.url || st?.videos?.[0]?.url;
      if (!url) throw new Error("genjutsu: completed without a video url");
      return url;
    }
    if (["failed", "canceled", "cancelled", "nsfw", "error"].includes(String(st.status))) throw new Error(`genjutsu: ${st.error || st.message || st.status}`);
  }
}

/** Seedance 2.5 reference-to-video used as a RECAST (the Higgsfield
 *  Genjutsu idea): the take as @Video1 (its motion, timing, camera, room),
 *  the actor's portrait as @Image1 (who performs it). Up to 30 s. Our 2.0
 *  test was refused on a realistic face; this measures whether 2.5 is. */
const SEEDANCE25_RECAST_PROMPT = "Recast @Video1: replace the person in @Video1 with the person in @Image1 -- the same face, hair and clothes as @Image1. " +
  "Keep everything else from @Video1 exactly: the motion, gestures, hand positions, head movement, timing, lip movement, expressions, camera framing and the room. " +
  "Photorealistic, natural skin, no stylization.";
export async function runSeedance25Recast(video: string, img: string, seconds: number, aspect: string, prompt?: string): Promise<string> {
  return falVideo("bytedance/seedance-2.5/reference-to-video", {
    prompt: prompt || SEEDANCE25_RECAST_PROMPT, video_urls: [video], image_urls: [img],
    duration: String(Math.max(4, Math.min(30, Math.round(seconds)))), aspect_ratio: aspect, resolution: "720p", generate_audio: false,
  }, "seedance 2.5");
}

/** Seedance 2.5 reference-to-video through HIGGSFIELD's API (not fal): the
 *  same recast idea as runSeedance25Recast -- the motion from @Video1, the
 *  person from @Image1. Our fal call was refused on a photoreal face; this
 *  measures whether Higgsfield's route is. Public URLs only (asset:// is
 *  rejected there). */
export async function runHiggsfieldSeedance25(video: string, img: string, seconds: number, aspect: string, opts: { prompt?: string; resolution?: string; onSubmit?: (statusUrl: string) => Promise<void> | void } = {}): Promise<string> {
  const id = process.env.HF_API_KEY_ID, secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) throw new Error("HF_API_KEY_ID / HF_API_KEY_SECRET are not set");
  const headers = { Authorization: `Key ${id}:${secret}`, "Content-Type": "application/json" };
  const sub = await okJson(await fetch("https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video", {
    method: "POST", headers: { ...headers, "Idempotency-Key": crypto.randomBytes(12).toString("hex") },
    body: JSON.stringify({
      prompt: opts.prompt || SEEDANCE25_RECAST_PROMPT, video_urls: [video], image_urls: [img],
      duration: Math.max(4, Math.min(30, Math.round(seconds))), aspect_ratio: aspect, resolution: opts.resolution || "480p", generate_audio: false,
    }),
  }), "higgsfield seedance 2.5 submit");
  const statusUrl = sub?.status_url || (sub?.request_id ? `https://api.higgsfield.ai/requests/${sub.request_id}/status` : "");
  if (!statusUrl) throw new Error(`higgsfield seedance 2.5 submit: ${JSON.stringify(sub).slice(0, 300)}`);
  await opts.onSubmit?.(statusUrl);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > GENJUTSU_DEADLINE_MS) throw new Error("higgsfield seedance 2.5: timed out");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "higgsfield seedance 2.5 status");
    reportVendor({ vendor: "higgsfield seedance", job: st?.request_id, status: st.status });
    if (st.status === "completed") {
      const url = st?.video?.url || st?.videos?.[0]?.url;
      if (!url) throw new Error("higgsfield seedance 2.5: completed without a video url");
      return url;
    }
    if (["failed", "canceled", "cancelled", "nsfw", "error"].includes(String(st.status))) throw new Error(`higgsfield seedance 2.5: ${st.status}${st.error || st.message ? " -- " + (st.error || st.message) : ""} ${JSON.stringify(st).slice(0, 300)}`);
  }
}

export async function runKling(src: string, img: string, prompt?: string): Promise<string> {
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const sub = await okJson(await fetch("https://queue.fal.run/fal-ai/kling-video/v3/pro/motion-control", {
    method: "POST", headers,
    body: JSON.stringify({ image_url: img, video_url: src, character_orientation: "video", keep_original_sound: true, ...(prompt ? { prompt } : {}) }),
  }), "kling submit");
  const statusUrl: string = sub.status_url, responseUrl: string = sub.response_url;
  if (!statusUrl || !responseUrl) throw new Error("kling submit: no status_url in the reply");
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("kling: timed out");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "kling status");
    reportVendor({ vendor: "kling", job: falJob(statusUrl), status: st.status, queue: st.queue_position });
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`kling: ${st.status}`);
  }
  const res = await okJson(await fetch(responseUrl, { headers }), "kling result");
  const url = res?.video?.url;
  if (!url) throw new Error("kling result: no video url");
  return url;
}

/** HeyGen Avatar IV: a photo and an audio track -> the photo talks (a
 *  generated performance: lips to the audio, motion invented). The photo
 *  and the audio are uploaded as assets, the video generated, its status
 *  polled. HeyGen's own messages come back on any failure. */
async function heygenUpload(file: string, contentType: string): Promise<any> {
  const r = await fetch("https://upload.heygen.com/v1/asset", {
    method: "POST", headers: { "X-Api-Key": String(process.env.HEYGEN_API_KEY), "Content-Type": contentType },
    body: await fs.readFile(file),
  });
  const j = await okJson(r, "heygen upload");
  if (!j?.data) throw new Error(`heygen upload: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data;
}

async function runHeygen(imgFile: string, audioFile: string, orientation: "portrait" | "landscape" | "square", motion?: string): Promise<string> {
  const img = await heygenUpload(imgFile, "image/jpeg");
  const aud = await heygenUpload(audioFile, "audio/mpeg");
  const headers = { "X-Api-Key": String(process.env.HEYGEN_API_KEY), "Content-Type": "application/json" };
  const gen = await okJson(await fetch("https://api.heygen.com/v2/video/av4/generate", {
    method: "POST", headers,
    body: JSON.stringify({
      image_key: img.image_key || img.id,
      video_title: "MegaMedia actor test",
      audio_asset_id: aud.id,
      video_orientation: orientation,
      fit: "cover",
      ...(motion ? { custom_motion_prompt: motion, enhance_custom_motion_prompt: true } : {}),
    }),
  }), "heygen generate");
  const videoId = gen?.data?.video_id;
  if (!videoId) throw new Error(`heygen generate: ${JSON.stringify(gen).slice(0, 200)}`);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("heygen: timed out");
    await sleep(Math.max(POLL_MS, 20) * 2);
    const st = await okJson(await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers }), "heygen status");
    const d = st?.data || {};
    reportVendor({ vendor: "heygen", job: videoId, status: d.status });
    if (d.status === "completed" && d.video_url) return d.video_url;
    if (d.status === "failed") throw new Error(`heygen: ${JSON.stringify(d.error || d).slice(0, 200)}`);
  }
}

/** The avatars on the HeyGen account (a digital twin among them): id, name
 *  and preview, for picking the one to drive. Photo avatars ("talking
 *  photos") are listed too. */
export async function listHeygenAvatars(): Promise<Array<{ id: string; name: string; kind: string; preview?: string }>> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
  const j = await okJson(await fetch("https://api.heygen.com/v2/avatars", { headers: { "X-Api-Key": String(process.env.HEYGEN_API_KEY) } }), "heygen avatars");
  const d = j?.data || {};
  return [
    ...(d.avatars || []).map((a: any) => ({ id: a.avatar_id, name: a.avatar_name, kind: "avatar", preview: a.preview_image_url })),
    ...(d.talking_photos || []).map((a: any) => ({ id: a.talking_photo_id, name: a.talking_photo_name, kind: "talking_photo", preview: a.preview_image_url })),
  ];
}

/** A saved HeyGen avatar (a digital twin) driven by an audio track: the
 *  person's own voice, lip-synced by HeyGen (POST /v2/video/generate). */
async function runHeygenAvatar(avatarId: string, audioFile: string, width: number, height: number): Promise<string> {
  const aud = await heygenUpload(audioFile, "audio/mpeg");
  const headers = { "X-Api-Key": String(process.env.HEYGEN_API_KEY), "Content-Type": "application/json" };
  const gen = await okJson(await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST", headers,
    body: JSON.stringify({
      video_inputs: [{ character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" }, voice: { type: "audio", audio_asset_id: aud.id } }],
      dimension: { width, height },
    }),
  }), "heygen avatar generate");
  const videoId = gen?.data?.video_id;
  if (!videoId) throw new Error(`heygen avatar generate: ${JSON.stringify(gen).slice(0, 200)}`);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("heygen avatar: timed out");
    await sleep(Math.max(POLL_MS, 20) * 2);
    const st = await okJson(await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, { headers }), "heygen status");
    const d = st?.data || {};
    reportVendor({ vendor: "heygen", job: videoId, status: d.status });
    if (d.status === "completed" && d.video_url) return d.video_url;
    if (d.status === "failed") throw new Error(`heygen avatar: ${JSON.stringify(d.error || d).slice(0, 200)}`);
  }
}

/** HeyGen's v3 API. A LOOK is one outfit/setting of an avatar (a digital
 *  twin, or a photo avatar like "Marc in green shirt"); its id is what a
 *  video names. New looks are generated from a prompt on an existing one
 *  ("on a couch in a grey sweater"). */
const HEYGEN_V3 = "https://api.heygen.com/v3";
function heygenHeaders(json = true): Record<string, string> {
  return { "X-Api-Key": String(process.env.HEYGEN_API_KEY), ...(json ? { "Content-Type": "application/json" } : {}) };
}

export interface HeygenLook { id: string; name: string; type: string; group_id?: string; status?: string; engines?: string[]; preview?: string; orientation?: string; default_voice_id?: string }
function toLook(l: any): HeygenLook {
  return { id: l.id, name: l.name, type: l.avatar_type, group_id: l.group_id, status: l.status, engines: l.supported_api_engines, preview: l.preview_image_url, orientation: l.preferred_orientation, default_voice_id: l.default_voice_id || undefined };
}

/** The account's own looks (not HeyGen's stock presenters). */
export async function listHeygenLooks(): Promise<HeygenLook[]> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
  const out: HeygenLook[] = [];
  let token = "";
  for (let page = 0; page < 20; page++) {
    const r = await heygenLookPage({ ownership: "private", token });
    out.push(...r.looks);
    if (!r.next_token) break;
    token = r.next_token;
  }
  return out;
}

/** One page of looks: the account's own ("private") or HeyGen's stock
 *  presenters ("public"), optionally by gender, for browsing. */
export async function heygenLookPage(opts: { ownership: "private" | "public"; token?: string; limit?: number; gender?: string }): Promise<{ looks: HeygenLook[]; next_token: string | null }> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
  const fetchPage = async (token?: string) => {
    const q = new URLSearchParams({ ownership: opts.ownership, limit: String(Math.max(1, Math.min(50, opts.limit || 50))) });
    if (token) q.set("token", token);
    const j = await okJson(await fetch(`${HEYGEN_V3}/avatars/looks?${q}`, { headers: heygenHeaders(false) }), "heygen looks");
    const looks: HeygenLook[] = (j?.data || []).map((l: any) => ({ ...toLook(l), ...(l.gender ? { gender: l.gender } : {}) }));
    return { looks, next: j?.has_more && j?.next_token ? String(j.next_token) : null };
  };
  if (!opts.gender) {
    const one = await fetchPage(opts.token);
    return { looks: one.looks, next_token: one.next };
  }
  // HeyGen cannot filter by gender and lists one person's ~20 looks together:
  // the first three pages of stock presenters are all men, so a one-page
  // filter showed no women at all (Marc). Page on until there are some.
  const want = opts.gender.toLowerCase();
  const out: HeygenLook[] = [];
  let token = opts.token, next: string | null = null;
  for (let i = 0; i < 12; i++) {
    const pg = await fetchPage(token);
    out.push(...pg.looks.filter((l: any) => !l.gender || String(l.gender).toLowerCase() === want));
    next = pg.next;
    if (out.length >= 24 || !next) break;
    token = next;
  }
  return { looks: out, next_token: next };
}

export async function getHeygenLook(id: string): Promise<HeygenLook> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
  const j = await okJson(await fetch(`${HEYGEN_V3}/avatars/looks/${encodeURIComponent(id)}`, { headers: heygenHeaders(false) }), "heygen look");
  return toLook(j?.data || {});
}

/** The account's own HeyGen voices (voice clones), for a generated take. */
export interface HeygenVoice { id: string; name: string; language?: string; gender?: string; preview?: string; engines?: string[]; default_engine?: string }
export async function listHeygenVoices(): Promise<HeygenVoice[]> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
  const out: HeygenVoice[] = [];
  let token = "";
  for (let page = 0; page < 10; page++) {
    const j = await okJson(await fetch(`${HEYGEN_V3}/voices?type=private&limit=100${token ? `&token=${encodeURIComponent(token)}` : ""}`, { headers: heygenHeaders(false) }), "heygen voices");
    out.push(...(j?.data || []).map((v: any) => ({
      id: v.voice_id, name: v.name, language: v.language, gender: v.gender, preview: v.preview_audio_url || undefined,
      engines: Array.isArray(v.available_engines) ? v.available_engines : undefined, default_engine: v.default_engine || undefined,
    })));
    if (!j?.has_more || !j?.next_token) break;
    token = j.next_token;
  }
  return out;
}

/** A new look from a prompt, based on an existing look (avatar_id) or
 *  group. Returns at once with status "processing"; poll getHeygenLook. */
export async function createHeygenLook(opts: { prompt: string; name?: string; avatar_id?: string; avatar_group_id?: string; aspect_ratio?: string }): Promise<HeygenLook> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
  const prompt = String(opts.prompt || "").trim().slice(0, 1000);
  if (!prompt) throw new Error("prompt is required");
  if (!opts.avatar_id && !opts.avatar_group_id) throw new Error("avatar_id or avatar_group_id is required");
  const j = await okJson(await fetch(`${HEYGEN_V3}/avatars`, {
    method: "POST", headers: heygenHeaders(),
    body: JSON.stringify({
      type: "prompt", name: String(opts.name || prompt).slice(0, 60), prompt,
      ...(opts.avatar_id ? { avatar_id: opts.avatar_id } : { avatar_group_id: opts.avatar_group_id }),
      aspect_ratio: opts.aspect_ratio || "9:16",
    }),
  }), "heygen create look");
  const item = j?.data?.avatar_item;
  if (!item?.id) throw new Error(`heygen create look: ${JSON.stringify(j).slice(0, 200)}`);
  return { id: item.id, name: item.name, type: item.avatar_type, group_id: j.data.avatar_group?.id, status: item.status };
}

async function heygenAssetV3(file: string, type: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([await fs.readFile(file)], { type }), path.basename(file));
  const j = await okJson(await fetch(`${HEYGEN_V3}/assets`, { method: "POST", headers: heygenHeaders(false), body: form }), "heygen asset");
  if (!j?.data?.asset_id) throw new Error(`heygen asset: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data.asset_id;
}

/** A v3 video: a look (avatar_id) or a portrait, driven by an audio track,
 *  with an optional motion prompt, expressiveness and engine. */
export async function runHeygenV3(opts: {
  lookId?: string; imgFile?: string; audioFile: string; aspect: string; motion?: string; expressiveness?: string; engine?: string;
  resolution?: string;
  /** A video HeyGen already has (submitted before a restart): collect it. */
  resume?: string;
  onSubmit?: (videoId: string) => Promise<void> | void;
}): Promise<string> {
  const videoId = opts.resume || await submitHeygenV3(opts);
  if (!opts.resume) await opts.onSubmit?.(videoId);
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("heygen v3: timed out");
    await sleep(Math.max(POLL_MS, 20) * 2);
    const d = (await okJson(await fetch(`${HEYGEN_V3}/videos/${encodeURIComponent(videoId)}`, { headers: heygenHeaders(false) }), "heygen v3 status"))?.data || {};
    reportVendor({ vendor: "heygen", job: videoId, status: d.status, progress: typeof d.progress === "number" ? d.progress : undefined, message: d.failure_message });
    if (d.status === "completed" && d.video_url) return d.video_url;
    if (d.status === "failed") throw new Error(`heygen v3: ${d.failure_message || d.failure_code || "failed"}`);
  }
}

async function submitHeygenV3(opts: { lookId?: string; imgFile?: string; audioFile: string; aspect: string; motion?: string; expressiveness?: string; engine?: string; resolution?: string }): Promise<string> {
  const audio = await heygenAssetV3(opts.audioFile, opts.audioFile.endsWith(".wav") ? "audio/wav" : "audio/mpeg");
  const who = opts.lookId
    ? { type: "avatar", avatar_id: opts.lookId }
    : { type: "image", image: { type: "asset_id", asset_id: await heygenAssetV3(String(opts.imgFile), "image/jpeg") } };
  const gen = await okJson(await fetch(`${HEYGEN_V3}/videos`, {
    method: "POST", headers: heygenHeaders(),
    body: JSON.stringify({
      ...who, audio_asset_id: audio, aspect_ratio: opts.aspect, fit: "cover", title: "MegaMedia actor test",
      ...(opts.motion ? { motion_prompt: opts.motion } : {}),
      ...(opts.expressiveness ? { expressiveness: opts.expressiveness } : {}),
      ...(opts.engine ? { engine: { type: opts.engine } } : {}),
      ...(opts.resolution ? { resolution: opts.resolution } : {}),
    }),
  }), "heygen v3 generate");
  const videoId = gen?.data?.video_id;
  if (!videoId) throw new Error(`heygen v3 generate: ${JSON.stringify(gen).slice(0, 200)}`);
  return videoId;
}

/** The API balance. HeyGen keeps API credits apart from the web app's, so
 *  "tons of credits" in the app can still be "Insufficient credit" here. */
export async function heygenQuota(): Promise<unknown> {
  if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
  return (await okJson(await fetch("https://api.heygen.com/v2/user/remaining_quota", { headers: heygenHeaders(false) }), "heygen quota"))?.data ?? null;
}

/** Runway Act-Two: POST /v1/character_performance, poll /v1/tasks/{id}. */
export async function runRunway(src: string, img: string, ratio: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`,
    "X-Runway-Version": "2024-11-06",
    "Content-Type": "application/json",
  };
  const sub = await okJson(await fetch("https://api.dev.runwayml.com/v1/character_performance", {
    method: "POST", headers,
    body: JSON.stringify({
      model: "act_two",
      character: { type: "image", uri: img },
      reference: { type: "video", uri: src },
      ratio,
      bodyControl: true,
      expressionIntensity: 3,
    }),
  }), "runway submit");
  if (!sub?.id) throw new Error("runway submit: no task id");
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("runway: timed out");
    await sleep(POLL_MS);
    const task = await okJson(await fetch(`https://api.dev.runwayml.com/v1/tasks/${sub.id}`, { headers }), "runway task");
    reportVendor({ vendor: "runway", job: sub.id, status: task.status, progress: typeof task.progress === "number" ? task.progress : undefined, message: task.failure });
    if (task.status === "SUCCEEDED") {
      const url = Array.isArray(task.output) ? task.output[0] : null;
      if (!url) throw new Error("runway: no output url");
      return url;
    }
    if (task.status === "FAILED" || task.status === "CANCELLED") throw new Error(`runway: ${task.failure || task.failureCode || task.status}`);
  }
}

export async function listVoices(): Promise<any[]> {
  const headers = { "xi-api-key": String(process.env.ELEVENLABS_API_KEY) };
  const j = await okJson(await fetch("https://api.elevenlabs.io/v1/voices", { headers }), "elevenlabs voices");
  return j?.voices || [];
}

/** A voice by id or by name ("Brian" matches "Brian - Deep, Resonant..."). */
export function findVoice(voices: any[], want: string): { id: string; name: string } | null {
  const w = want.toLowerCase();
  const hit = voices.find((v) => v.voice_id === want) || voices.find((v) => String(v.name).toLowerCase() === w)
    || voices.find((v) => String(v.name).toLowerCase().startsWith(w));
  return hit ? { id: hit.voice_id, name: hit.name } : null;
}

/** A stock ElevenLabs voice: the caller's pick, else a premade female voice. */
async function pickVoice(voiceId?: string): Promise<{ id: string; name: string }> {
  if (voiceId) return { id: voiceId, name: voiceId };
  const voices = await listVoices();
  const female = voices.filter((v) => v.category === "premade" && String(v.labels?.gender || "").toLowerCase() === "female");
  const prefer = ["Sarah", "Jessica", "Laura", "Alice", "Matilda"];
  const hit = prefer.map((n) => female.find((v) => String(v.name).startsWith(n))).find(Boolean) || female[0] || voices[0];
  if (!hit) throw new Error("elevenlabs: no voices on the account");
  return { id: hit.voice_id, name: hit.name };
}

/** ElevenLabs speech-to-speech: the delivery stays, the voice changes. */
export async function convertVoice(wav: string, out: string, voiceId: string): Promise<void> {
  const form = new FormData();
  form.append("audio", new Blob([await fs.readFile(wav)], { type: "audio/wav" }), "take.wav");
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("remove_background_noise", "true");
  const r = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": String(process.env.ELEVENLABS_API_KEY) }, body: form,
  });
  if (!r.ok) throw new Error(`elevenlabs speech-to-speech: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  await fs.writeFile(out, Buffer.from(await r.arrayBuffer()));
}

export async function startActorTest(opts: {
  tenant: string;
  project: string;
  scene_index: number;
  /** The actor's portrait, relative to the tenant's data dir (e.g. assets/generated/img_1.png). */
  image: string;
  providers?: ActorProvider[];
  voice?: boolean;
  voice_id?: string;
  /** seedance: the shot to invent (defaults to a walk down a sunny sidewalk). */
  prompt?: string;
  /** The portrait as a frame of an earlier test's file: {test, file, at}. */
  image_from?: { test: string; file: string; at?: number };
  /** The performance from an earlier test's file instead of the take -- e.g.
   *  a Seedance shot given one fixed face by Wan "replace". */
  video_from?: { test: string; file: string };
  /** A span of the scene clip's take file instead of the scene's own trim
   *  (seconds on that file) -- e.g. a 10 s run to measure how much Wan
   *  returns in one call. */
  source_range?: { start: number; end: number };
  /** The frame rate the source is sent at (default 30). Wan caps FRAMES, so
   *  a lower rate covers more seconds per call. */
  fps?: number;
  /** heygen-avatar: the saved HeyGen avatar to drive (a digital twin).
   *  heygen-v3: a look id (listHeygenLooks); without one it animates the portrait. */
  heygen_avatar_id?: string;
  /** genjutsu: a SETTING reference (tenant-relative image) -- the actor is
   *  placed there (a podcast set), the motion kept. */
  scene_image?: string;
  /** genjutsu / hf-seedance25: "480p" | "720p" | "1080p" (720p / 480p by default). */
  resolution?: string;
  /** The performance from a file of the tenant (e.g. a b-roll clip,
   *  "projects/<id>/assets/cb-walk-phone.mp4") instead of a speaker take. */
  video_asset?: string;
  /** Cap the source at this many seconds (a cheap test). */
  max_seconds?: number;
  /** heygen-v3: "low" | "medium" | "high" (Avatar IV). */
  expressiveness?: string;
  /** heygen-v3: "avatar_iv" | "avatar_v" | "avatar_iii" (HeyGen's default when omitted). */
  engine?: string;
}): Promise<ActorTest> {
  const project = await loadProject(opts.tenant, opts.project);
  if (!project) throw new Error("Project not found");
  const clip = ((project as any).speaker_track?.clips || []).find((c: any) => c.scene_index === opts.scene_index);
  if (!clip && !opts.video_from && !opts.video_asset) throw new Error(`Scene ${opts.scene_index + 1} has no speaker clip`);
  const tenantDir = path.resolve(config.dataDir, opts.tenant);
  const fromFile = async (ref: { test: string; file: string }, what: string): Promise<string> => {
    if (!isActorTestId(String(ref?.test || "")) || !/^[A-Za-z0-9_.-]+$/.test(String(ref?.file || ""))) throw new Error(`${what}: bad reference`);
    const abs = path.join(actorTestDir(opts.tenant, opts.project, ref.test), ref.file);
    await fs.access(abs).catch(() => { throw new Error(`${what} not found: ${ref.test}/${ref.file}`); });
    return abs;
  };
  // A text-only Seedance shot and a saved HeyGen avatar need no portrait.
  const textOnly = !!opts.providers?.length && opts.providers.every((p) => p === "seedance-t2v" || p === "heygen-avatar" || (p === "heygen-v3" && !!opts.heygen_avatar_id));
  if (opts.providers?.includes("heygen-avatar") && !opts.heygen_avatar_id) throw new Error("heygen-avatar needs heygen_avatar_id");
  let img: { path: string; at?: number } | null = null;
  if (opts.image_from) img = { path: await fromFile(opts.image_from, "image_from"), at: Math.max(0, Number(opts.image_from.at) || 0) };
  else if (!(textOnly && !opts.image)) {
    const imgAbs = path.resolve(tenantDir, String(opts.image || "").replace(/^\/+/, ""));
    if (!imgAbs.startsWith(tenantDir + path.sep)) throw new Error("image must be a path inside the tenant");
    await fs.access(imgAbs).catch(() => { throw new Error(`image not found: ${opts.image}`); });
    img = { path: imgAbs };
  }
  // The RECORDING, never a recast of it: a film cast as an actor points its
  // clips at the actor's file (measured: a Genjutsu trial on Old Chimp,
  // cast as the HeyGen sofa look, was fed the HeyGen video, not Marc).
  const rawSource = clip ? (takeCopies(takeForClip(project as any, clip) || null).raw || clip.source) : "";
  let assetAbs = "";
  if (opts.video_asset) {
    assetAbs = path.resolve(tenantDir, String(opts.video_asset).replace(/^\/+/, ""));
    if (!assetAbs.startsWith(tenantDir + path.sep)) throw new Error("video_asset must be a path inside the tenant");
    await fs.access(assetAbs).catch(() => { throw new Error(`video_asset not found: ${opts.video_asset}`); });
  }
  const src0 = assetAbs
    ? { path: assetAbs, start: 0, end: null as number | null }
    : opts.video_from
    ? { path: await fromFile(opts.video_from, "video_from"), start: 0, end: null as number | null }
    : opts.source_range && Number(opts.source_range.end) > Number(opts.source_range.start)
      ? { path: resolveVideoPath(rawSource, config.dataDir), start: Math.max(0, Number(opts.source_range.start)), end: Number(opts.source_range.end) }
      : { path: resolveVideoPath(rawSource, config.dataDir), start: Number(clip.trim_start) || 0, end: clip.trim_end == null ? null : Number(clip.trim_end) };
  const cap = Number(opts.max_seconds) > 0 ? Number(opts.max_seconds) : 0;
  const src = cap ? { ...src0, end: src0.end == null ? src0.start + cap : Math.min(src0.end, src0.start + cap) } : src0;
  const fps = Math.max(8, Math.min(60, Math.round(Number(opts.fps) || 30)));
  const line = String((project as any).storyboard?.scenes?.[opts.scene_index]?.voiceover_text || "").trim();
  const wanted = (opts.providers && opts.providers.length ? opts.providers : (["wan", "runway"] as ActorProvider[]))
    .filter((p): p is ActorProvider => ["wan", "wan-move", "runway", "seedance", "seedance-t2v", "wan-s2v", "kling", "heygen", "heygen-avatar", "heygen-v3", "seedance25", "genjutsu", "hf-seedance25"].includes(p));
  const providers = wanted.filter((p) => !!process.env[KEYS[p]]);
  if (!providers.length) throw new Error(`No provider key on the server (${wanted.map((p) => KEYS[p]).join(", ")})`);
  const voice = opts.voice !== false && !!process.env.ELEVENLABS_API_KEY;

  const test: ActorTest = {
    id: crypto.randomBytes(12).toString("base64url"),
    tenant_id: opts.tenant,
    project_id: opts.project,
    scene_index: opts.scene_index,
    image: opts.image_from ? `${opts.image_from.test}/${opts.image_from.file}@${opts.image_from.at || 0}` : opts.image || "",
    providers,
    voice,
    status: "running",
    started_at: new Date().toISOString(),
    steps: {},
    files: {},
  };
  for (const p of wanted) if (!providers.includes(p)) test.steps[p] = { status: "skipped", error: `${KEYS[p]} is not set` };
  if (!voice) test.steps.voice = { status: "skipped", error: opts.voice === false ? "not asked for" : "ELEVENLABS_API_KEY is not set" };
  await fs.mkdir(actorTestDir(opts.tenant, opts.project, test.id), { recursive: true });
  tests.set(test.id, test);
  await save(test);
  // The take is recorded at the film's frame, so the canvas says its shape.
  const frame: [number, number] = [Number((project as any).canvas?.width) || 1080, Number((project as any).canvas?.height) || 1920];
  let sceneAbs: string | undefined;
  if (opts.scene_image) {
    sceneAbs = path.resolve(tenantDir, String(opts.scene_image).replace(/^\/+/, ""));
    if (!sceneAbs.startsWith(tenantDir + path.sep)) throw new Error("scene_image must be a path inside the tenant");
    await fs.access(sceneAbs).catch(() => { throw new Error(`scene_image not found: ${opts.scene_image}`); });
  }
  void run(test, src, img, frame, opts.voice_id, opts.prompt, line, fps, opts.heygen_avatar_id, { expressiveness: opts.expressiveness, engine: opts.engine, sceneAbs, resolution: opts.resolution })
    .catch(async (e) => { test.status = "failed"; test.error = e?.message || String(e); test.finished_at = new Date().toISOString(); await save(test).catch(() => {}); });
  return test;
}

async function step<T>(test: ActorTest, name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  test.steps[name] = { status: "running" };
  await save(test).catch(() => {});
  try {
    const out = await fn();
    test.steps[name] = { status: "done", seconds: Math.round((Date.now() - t0) / 100) / 10 };
    return out;
  } catch (e: any) {
    test.steps[name] = { status: "failed", error: e?.message || String(e), seconds: Math.round((Date.now() - t0) / 100) / 10 };
    return null;
  } finally {
    await save(test).catch(() => {});
  }
}

async function run(test: ActorTest, src: { path: string; start: number; end: number | null }, img: { path: string; at?: number } | null, frame: [number, number], voiceId?: string, prompt?: string, line = "", fps = 30, heygenAvatarId?: string, heygenOpts: { expressiveness?: string; engine?: string; sceneAbs?: string; resolution?: string } = {}): Promise<void> {
  const dir = actorTestDir(test.tenant_id, test.project_id, test.id);
  const f = (name: string) => path.join(dir, name);

  // What every provider sees: the scene's slice of the take at 720 wide,
  // and the portrait as a modest JPEG (both well under the data-URI caps).
  await ffmpeg(["-ss", String(src.start), ...(src.end != null ? ["-to", String(src.end)] : []), "-i", src.path,
    "-vf", "scale=720:-2", "-r", String(fps), "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", f("source.mp4")]);
  test.files.source = "source.mp4";
  if (img) {
    // A still from a video (image_from with a time) or a picture as given.
    await ffmpeg([...(img.at != null ? ["-ss", String(img.at)] : []), "-i", img.path, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", f("actor.jpg")]);
    test.files.actor = "actor.jpg";
  }
  const srcSecs = (await durationOf(f("source.mp4"))) || (src.end != null ? src.end - src.start : 5);
  const [w, h] = frame;
  const ratio = h > w * 1.1 ? "720:1280" : w > h * 1.1 ? "1280:720" : "960:960";
  const srcUri = await dataUri(f("source.mp4"), "video/mp4");
  const imgUri = img ? await dataUri(f("actor.jpg"), "image/jpeg") : "";
  await save(test);

  const voiceJob = test.voice
    ? step(test, "voice", async () => {
        await ffmpeg(["-i", f("source.mp4"), "-vn", "-ac", "1", "-ar", "44100", f("take.wav")]);
        const v = await pickVoice(voiceId);
        test.voice_name = v.name;
        await convertVoice(f("take.wav"), f("voice.mp3"), v.id);
        test.files.voice = "voice.mp3";
      })
    : Promise.resolve(null);
  const provJobs = test.providers.map((p) => step(test, p, async () => {
    let url: string;
    if (p === "seedance-t2v") {
      // Nobody's face and nobody's voice: Seedance invents the man, the
      // walk and the delivery of the scene's line.
      const secs = Math.min(15, Math.max(4, Math.ceil(srcSecs)));
      const aspect = h > w * 1.1 ? (w / h < 0.65 ? "9:16" : "3:4") : w > h * 1.1 ? "16:9" : "1:1";
      url = await runSeedance(null, null, prompt || seedanceTextPrompt(line), secs, aspect);
    } else if (p === "heygen-avatar") {
      // The person's own saved avatar, lip-synced to the voice the test settled on.
      await voiceJob;
      if (!test.files.voice) await ffmpeg(["-i", f("source.mp4"), "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", f("take.mp3")]);
      const [vw, vh] = h > w * 1.1 ? [720, 1280] : w > h * 1.1 ? [1280, 720] : [960, 960];
      url = await runHeygenAvatar(String(heygenAvatarId), test.files.voice ? f("voice.mp3") : f("take.mp3"), vw, vh);
    } else if (p === "heygen-v3") {
      // A look (the twin, a photo avatar, a generated outfit) or the portrait.
      if (!heygenAvatarId && !img) throw new Error("heygen-v3 needs heygen_avatar_id (a look) or a portrait");
      await voiceJob;
      if (!test.files.voice) await ffmpeg(["-i", f("source.mp4"), "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", f("take.mp3")]);
      url = await runHeygenV3({
        lookId: heygenAvatarId || undefined, imgFile: img ? f("actor.jpg") : undefined,
        audioFile: test.files.voice ? f("voice.mp3") : f("take.mp3"),
        aspect: h > w * 1.1 ? "9:16" : w > h * 1.1 ? "16:9" : "1:1",
        motion: prompt, expressiveness: heygenOpts.expressiveness, engine: heygenOpts.engine,
      });
    } else if (p === "heygen") {
      // A generated performance from the portrait and the voice the test settled on.
      if (!img) throw new Error("heygen needs a portrait (image or image_from)");
      await voiceJob;
      if (!test.files.voice) await ffmpeg(["-i", f("source.mp4"), "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", f("take.mp3")]);
      url = await runHeygen(f("actor.jpg"), test.files.voice ? f("voice.mp3") : f("take.mp3"), h > w * 1.1 ? "portrait" : w > h * 1.1 ? "landscape" : "square", prompt);
    } else if (p === "genjutsu") {
      // URLs only: the test's public folder (source.mp4, actor.jpg).
      if (!img) throw new Error("genjutsu needs a portrait (image or image_from)");
      if (!config.publicUrl.startsWith("https://")) throw new Error("genjutsu needs the server's public https address (it fetches the video by URL)");
      const pub = `${config.publicUrl}/output/${encodeURIComponent(test.tenant_id)}/projects/${encodeURIComponent(test.project_id)}/actor-tests/${test.id}`;
      const images = [`${pub}/actor.jpg`];
      if (heygenOpts.sceneAbs) {
        // The setting as a second reference: the actor placed there.
        await ffmpeg(["-i", heygenOpts.sceneAbs, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", f("scene.jpg")]);
        test.files.scene = "scene.jpg";
        images.push(`${pub}/scene.jpg`);
      }
      // A test judges the look: 720p (cheaper) unless asked; films render at 1080p.
      url = await runGenjutsu(`${pub}/source.mp4`, images, {
        prompt: prompt || (heygenOpts.sceneAbs ? GENJUTSU_SCENE_PROMPT : undefined), resolution: heygenOpts.resolution || "720p",
        // The job, kept the moment Higgsfield takes it: a timeout or a restart
        // can collect the video instead of paying for another (measured: a
        // 720p run outlasted the old 25 min wait and was lost).
        onSubmit: async (statusUrl) => { await fs.writeFile(f("genjutsu-request.json"), JSON.stringify({ status_url: statusUrl })); },
      });
    } else if (p === "hf-seedance25") {
      if (!img) throw new Error("hf-seedance25 needs a portrait (image or image_from)");
      if (!config.publicUrl.startsWith("https://")) throw new Error("hf-seedance25 needs the server's public https address (Higgsfield fetches by URL)");
      const pub = `${config.publicUrl}/output/${encodeURIComponent(test.tenant_id)}/projects/${encodeURIComponent(test.project_id)}/actor-tests/${test.id}`;
      const aspect = h > w * 1.1 ? "9:16" : w > h * 1.1 ? "16:9" : "1:1";
      url = await runHiggsfieldSeedance25(`${pub}/source.mp4`, `${pub}/actor.jpg`, srcSecs, aspect, {
        prompt, resolution: heygenOpts.resolution || "480p",
        onSubmit: async (statusUrl) => { await fs.writeFile(f("hf-seedance25-request.json"), JSON.stringify({ status_url: statusUrl })); },
      });
    } else if (p === "seedance25") {
      if (!imgUri) throw new Error("seedance25 needs a portrait (image or image_from)");
      const pub = config.publicUrl.startsWith("https://")
        ? `${config.publicUrl}/output/${encodeURIComponent(test.tenant_id)}/projects/${encodeURIComponent(test.project_id)}/actor-tests/${test.id}`
        : "";
      const aspect = h > w * 1.1 ? "9:16" : w > h * 1.1 ? "16:9" : "1:1";
      url = await runSeedance25Recast(pub ? `${pub}/source.mp4` : srcUri, pub ? `${pub}/actor.jpg` : imgUri, srcSecs, aspect, prompt);
    } else if (p === "kling") {
      if (!imgUri) throw new Error("kling needs a portrait (image or image_from)");
      // A 30 s source is too big to inline comfortably: fal fetches it from
      // the test's public folder when the server has a public address.
      const pub = config.publicUrl.startsWith("https://")
        ? `${config.publicUrl}/output/${encodeURIComponent(test.tenant_id)}/projects/${encodeURIComponent(test.project_id)}/actor-tests/${test.id}`
        : "";
      url = await runKling(pub ? `${pub}/source.mp4` : srcUri, pub ? `${pub}/actor.jpg` : imgUri, prompt);
    } else if (p === "wan-s2v") {
      // One still, one voice: the same picture every scene is the same man.
      if (!imgUri) throw new Error("wan-s2v needs a portrait (image or image_from)");
      await voiceJob;
      if (!test.files.voice) await ffmpeg(["-i", f("source.mp4"), "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", f("take.mp3")]);
      const aud = test.files.voice ? f("voice.mp3") : f("take.mp3");
      url = await runWanS2V(imgUri, await dataUri(aud, "audio/mpeg"), srcSecs, prompt || WAN_S2V_DEFAULT_PROMPT);
    } else if (p === "seedance") {
      // Lip-synced to the voice the test settled on: the converted one
      // when there is one, else the take's own audio.
      await voiceJob;
      if (!test.files.voice) await ffmpeg(["-i", f("source.mp4"), "-vn", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", f("take.mp3")]);
      const aud = test.files.voice ? f("voice.mp3") : f("take.mp3");
      const secs = Math.min(15, Math.max(4, Math.ceil(srcSecs)));
      const aspect = h > w * 1.1 ? (w / h < 0.65 ? "9:16" : "3:4") : w > h * 1.1 ? "16:9" : "1:1";
      url = await runSeedance(imgUri, await dataUri(aud, "audio/mpeg"), prompt || SEEDANCE_DEFAULT_PROMPT, secs, aspect);
    } else {
      url = p === "runway" ? await runRunway(srcUri, imgUri, ratio) : await runWan(srcUri, imgUri, p === "wan-move" ? "move" : "replace");
    }
    await download(url, f(`${p}-raw.mp4`));
    return p;
  }));
  await voiceJob;
  const done = (await Promise.all(provJobs)).filter(Boolean) as ActorProvider[];

  await finishTest(test, done);
}

/** Each provider's raw video with sound, and the side-by-side; the test closes. */
async function finishTest(test: ActorTest, done: ActorProvider[]): Promise<void> {
  const f = (name: string) => path.join(actorTestDir(test.tenant_id, test.project_id, test.id), name);
  // Each result with sound: the converted voice when there is one, else
  // the take's own audio. The picture is re-encoded so every file streams.
  const audio = test.files.voice ? f("voice.mp3") : f("source.mp4");
  for (const p of done) {
    if ((p === "seedance" || p === "seedance-t2v") && (await hasAudio(f(`${p}-raw.mp4`)))) {
      // Seedance renders the voice itself, placed where it lip-synced it.
      await ffmpeg(["-i", f(`${p}-raw.mp4`), "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", f(`${p}.mp4`)]);
      test.files[p] = `${p}.mp4`;
      continue;
    }
    await ffmpeg(["-i", f(`${p}-raw.mp4`), "-i", audio, "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-shortest", "-movflags", "+faststart", f(`${p}.mp4`)]);
    test.files[p] = `${p}.mp4`;
  }
  // Side by side, same height: you (the take), then each actor.
  if (done.length) {
    const ins = [f("source.mp4"), ...done.map((p) => f(`${p}.mp4`))];
    const scaled = ins.map((_, i) => `[${i}:v]scale=-2:960,setsar=1,fps=30[v${i}]`).join(";");
    const stack = `${ins.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${ins.length}[v]`;
    await ffmpeg([...ins.flatMap((x) => ["-i", x]), "-i", audio,
      "-filter_complex", `${scaled};${stack}`, "-map", "[v]", "-map", `${ins.length}:a:0`,
      "-c:v", "libx264", "-crf", "22", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
      "-shortest", "-movflags", "+faststart", f("compare.mp4")]);
    test.files.compare = "compare.mp4";
  }
  test.status = done.length ? "done" : "failed";
  if (!done.length) test.error = "No provider returned a video";
  test.finished_at = new Date().toISOString();
  await fs.rm(f("take.wav"), { force: true }).catch(() => {});
  await fs.rm(f("take.mp3"), { force: true }).catch(() => {});
  await save(test);
}

export async function durationOf(file: string): Promise<number | null> {
  try { await execFileAsync("ffmpeg", ["-hide_banner", "-i", file]); return null; }
  catch (e: any) {
    const m = String(e?.stderr || "").match(/Duration: (\d+):(\d+):([\d.]+)/);
    return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
  }
}

async function hasAudio(file: string): Promise<boolean> {
  try { await execFileAsync("ffmpeg", ["-hide_banner", "-i", file]); return false; }
  catch (e: any) { return /Stream #\d+:\d+[^\n]*: Audio:/.test(String(e?.stderr || "")); }
}

/** THE VOICE LINEUP: one picture, several voices. Takes an earlier test's
 *  actor video (its raw provider output) and its source audio, converts the
 *  audio to each voice, and lays each onto the picture -- choosing a voice
 *  for a face costs seconds, not another video generation. */
export async function startVoiceLineup(opts: {
  tenant: string;
  project: string;
  from: string;
  voices: string[];
  picture?: ActorProvider;
}): Promise<ActorTest> {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
  const from = await getActorTest(opts.tenant, opts.project, opts.from);
  if (!from) throw new Error(`Actor test not found: ${opts.from}`);
  const picture = opts.picture || (from.providers.includes("wan") ? "wan" : from.providers[0]);
  const fromDir = actorTestDir(opts.tenant, opts.project, from.id);
  const pic = path.join(fromDir, `${picture}-raw.mp4`);
  await fs.access(pic).catch(() => { throw new Error(`That test has no ${picture} video`); });
  const wanted = (opts.voices || []).map(String).filter(Boolean).slice(0, 8);
  if (!wanted.length) throw new Error("voices is empty");
  const test: ActorTest = {
    id: crypto.randomBytes(12).toString("base64url"),
    tenant_id: opts.tenant, project_id: opts.project, scene_index: from.scene_index, image: from.image,
    providers: [], voice: true, status: "running", started_at: new Date().toISOString(), steps: {}, files: {},
  };
  const dir = actorTestDir(opts.tenant, opts.project, test.id);
  await fs.mkdir(dir, { recursive: true });
  tests.set(test.id, test);
  await save(test);
  void (async () => {
    const f = (n: string) => path.join(dir, n);
    await ffmpeg(["-i", path.join(fromDir, "source.mp4"), "-vn", "-ac", "1", "-ar", "44100", f("take.wav")]);
    const voices = await listVoices();
    for (const want of wanted) {
      await step(test, `voice:${want}`, async () => {
        const v = findVoice(voices, want);
        if (!v) throw new Error(`no voice named ${want} on the account`);
        const slug = v.name.split(/[^A-Za-z0-9]+/)[0].toLowerCase() || "voice";
        await convertVoice(f("take.wav"), f(`voice-${slug}.mp3`), v.id);
        await ffmpeg(["-i", pic, "-i", f(`voice-${slug}.mp3`), "-map", "0:v:0", "-map", "1:a:0",
          "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
          "-shortest", "-movflags", "+faststart", f(`${picture}-${slug}.mp4`)]);
        test.files[`${picture}-${slug}`] = `${picture}-${slug}.mp4`;
        test.files[`voice-${slug}`] = `voice-${slug}.mp3`;
      });
    }
    const ok = Object.keys(test.files).length > 0;
    test.status = ok ? "done" : "failed";
    if (!ok) test.error = "No voice converted";
    test.finished_at = new Date().toISOString();
    await fs.rm(f("take.wav"), { force: true }).catch(() => {});
    await save(test);
  })().catch(async (e) => { test.status = "failed"; test.error = e?.message || String(e); test.finished_at = new Date().toISOString(); await save(test).catch(() => {}); });
  return test;
}
