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
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { projectOutputDir } from "../persistence/paths.js";
import { loadProject } from "../persistence/project.js";
import { resolveVideoPath } from "./video-path.js";

const execFileAsync = promisify(execFile);

export type ActorProvider = "wan" | "wan-move" | "runway" | "seedance" | "seedance-t2v" | "wan-s2v";
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

const KEYS: Record<ActorProvider, string> = { wan: "FAL_KEY", "wan-move": "FAL_KEY", runway: "RUNWAYML_API_SECRET", seedance: "FAL_KEY", "seedance-t2v": "FAL_KEY", "wan-s2v": "FAL_KEY" };
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

async function ffmpeg(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...args], { maxBuffer: 20 * 1024 * 1024 });
}

async function dataUri(file: string, mime: string): Promise<string> {
  return `data:${mime};base64,${(await fs.readFile(file)).toString("base64")}`;
}

async function okJson(r: Response, what: string): Promise<any> {
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

async function download(url: string, file: string): Promise<void> {
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
async function runWan(src: string, img: string, mode: "replace" | "move"): Promise<string> {
  const headers = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const sub = await okJson(await fetch(`https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/${mode}`, {
    method: "POST", headers,
    body: JSON.stringify({ video_url: src, image_url: img, resolution: "720p", video_quality: "high" }),
  }), "fal submit");
  const statusUrl: string = sub.status_url, responseUrl: string = sub.response_url;
  if (!statusUrl || !responseUrl) throw new Error("fal submit: no status_url in the reply");
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("fal: timed out");
    await sleep(POLL_MS);
    const st = await okJson(await fetch(statusUrl, { headers }), "fal status");
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
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`wan s2v: ${st.status}`);
  }
  const res = await okJson(await fetch(responseUrl, { headers }), "wan s2v result");
  const url = res?.video?.url;
  if (!url) throw new Error("wan s2v result: no video url");
  return url;
}

export const WAN_S2V_DEFAULT_PROMPT = "The man in the picture talks to the camera in a relaxed, conversational, slightly amused way, with natural small head movements and a casual hand gesture. The camera stays still. Real amateur home footage.";

/** Runway Act-Two: POST /v1/character_performance, poll /v1/tasks/{id}. */
async function runRunway(src: string, img: string, ratio: string): Promise<string> {
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
    if (task.status === "SUCCEEDED") {
      const url = Array.isArray(task.output) ? task.output[0] : null;
      if (!url) throw new Error("runway: no output url");
      return url;
    }
    if (task.status === "FAILED" || task.status === "CANCELLED") throw new Error(`runway: ${task.failure || task.failureCode || task.status}`);
  }
}

async function listVoices(): Promise<any[]> {
  const headers = { "xi-api-key": String(process.env.ELEVENLABS_API_KEY) };
  const j = await okJson(await fetch("https://api.elevenlabs.io/v1/voices", { headers }), "elevenlabs voices");
  return j?.voices || [];
}

/** A voice by id or by name ("Brian" matches "Brian - Deep, Resonant..."). */
function findVoice(voices: any[], want: string): { id: string; name: string } | null {
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
async function convertVoice(wav: string, out: string, voiceId: string): Promise<void> {
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
}): Promise<ActorTest> {
  const project = await loadProject(opts.tenant, opts.project);
  if (!project) throw new Error("Project not found");
  const clip = ((project as any).speaker_track?.clips || []).find((c: any) => c.scene_index === opts.scene_index);
  if (!clip && !opts.video_from) throw new Error(`Scene ${opts.scene_index + 1} has no speaker clip`);
  const tenantDir = path.resolve(config.dataDir, opts.tenant);
  const fromFile = async (ref: { test: string; file: string }, what: string): Promise<string> => {
    if (!isActorTestId(String(ref?.test || "")) || !/^[A-Za-z0-9_.-]+$/.test(String(ref?.file || ""))) throw new Error(`${what}: bad reference`);
    const abs = path.join(actorTestDir(opts.tenant, opts.project, ref.test), ref.file);
    await fs.access(abs).catch(() => { throw new Error(`${what} not found: ${ref.test}/${ref.file}`); });
    return abs;
  };
  const textOnly = !!opts.providers?.length && opts.providers.every((p) => p === "seedance-t2v");
  let img: { path: string; at?: number } | null = null;
  if (opts.image_from) img = { path: await fromFile(opts.image_from, "image_from"), at: Math.max(0, Number(opts.image_from.at) || 0) };
  else if (!(textOnly && !opts.image)) {
    const imgAbs = path.resolve(tenantDir, String(opts.image || "").replace(/^\/+/, ""));
    if (!imgAbs.startsWith(tenantDir + path.sep)) throw new Error("image must be a path inside the tenant");
    await fs.access(imgAbs).catch(() => { throw new Error(`image not found: ${opts.image}`); });
    img = { path: imgAbs };
  }
  const src = opts.video_from
    ? { path: await fromFile(opts.video_from, "video_from"), start: 0, end: null as number | null }
    : { path: resolveVideoPath(clip.source, config.dataDir), start: Number(clip.trim_start) || 0, end: clip.trim_end == null ? null : Number(clip.trim_end) };
  const line = String((project as any).storyboard?.scenes?.[opts.scene_index]?.voiceover_text || "").trim();
  const wanted = (opts.providers && opts.providers.length ? opts.providers : (["wan", "runway"] as ActorProvider[]))
    .filter((p): p is ActorProvider => ["wan", "wan-move", "runway", "seedance", "seedance-t2v", "wan-s2v"].includes(p));
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
  void run(test, src, img, frame, opts.voice_id, opts.prompt, line)
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

async function run(test: ActorTest, src: { path: string; start: number; end: number | null }, img: { path: string; at?: number } | null, frame: [number, number], voiceId?: string, prompt?: string, line = ""): Promise<void> {
  const dir = actorTestDir(test.tenant_id, test.project_id, test.id);
  const f = (name: string) => path.join(dir, name);

  // What every provider sees: the scene's slice of the take at 720 wide,
  // and the portrait as a modest JPEG (both well under the data-URI caps).
  await ffmpeg(["-ss", String(src.start), ...(src.end != null ? ["-to", String(src.end)] : []), "-i", src.path,
    "-vf", "scale=720:-2", "-r", "30", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
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

async function durationOf(file: string): Promise<number | null> {
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
