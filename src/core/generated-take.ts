/**
 * A GENERATED TAKE: the film's script performed with no recording at all.
 *
 * Marc: "I want the option" -- a HeyGen look reading the storyboard in a
 * generated voice, beside the record-then-recast route (his real voice,
 * which is what makes it read as him). The voice is made first, one scene
 * at a time, by HeyGen (the look's own voice -- his HeyGen voice clone on
 * his looks) or ElevenLabs (a clone or a stock voice), joined with a short
 * pause between scenes. That audio goes to HeyGen in ONE call, exactly as a
 * recast does, on Avatar V when the look offers it.
 *
 * The result is then attached like a booth recording (scene_index "all"):
 * sanitized, transcribed, split into scene windows, the scenes re-timed to
 * it -- a generated take is just a take, so captions, word anchors and cuts
 * work unchanged. The attach itself lives in index.ts and is passed in.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { loadProject } from "../persistence/project.js";
import { projectDir } from "../persistence/paths.js";
import { getActor, portraitPath, type CastActor } from "./cast.js";
import { ffmpeg, download, durationOf, getHeygenLook, listHeygenVoices } from "./actor-test.js";
import { getPerformer, PERFORMERS, type Performer } from "./performers/index.js";

export type VoiceProvider = "heygen" | "elevenlabs";

export interface GeneratedTakeStatus {
  project_id: string;
  actor: string;
  performer: string;
  voice: { provider: VoiceProvider; id: string };
  status: "running" | "done" | "failed" | "interrupted";
  stage?: string;
  started_at: string;
  finished_at?: string;
  /** The take's asset URL once made. */
  url?: string;
  seconds?: number;
  error?: string;
}

/** Between scenes: a breath, so the split finds each scene's first words. */
const SCENE_GAP = 0.6;
/** A "(pause)" line in the script. */
const PAUSE = 1.0;

const running = new Map<string, GeneratedTakeStatus>();
// index.ts owns the take attach (sanitize, transcribe, split, re-time); it
// registers it here so the MCP tool can start a generated take too.
type Attacher = (tenant: string, project: string, url: string) => Promise<{ status: number; body: Record<string, unknown> }>;
let attacher: Attacher | null = null;
export function registerTakeAttacher(fn: Attacher): void { attacher = fn; }
const statusFile = (tenant: string, project: string) => path.join(projectDir(tenant, project), "generated-take.json");

export async function getGeneratedTakeStatus(tenant: string, project: string): Promise<GeneratedTakeStatus | null> {
  const live = running.get(`${tenant}/${project}`);
  if (live) return live;
  try {
    const st = JSON.parse(await fs.readFile(statusFile(tenant, project), "utf8")) as GeneratedTakeStatus;
    if (st.status === "running") st.status = "interrupted";
    return st;
  } catch { return null; }
}

async function save(tenant: string, st: GeneratedTakeStatus): Promise<void> {
  await fs.writeFile(statusFile(tenant, st.project_id), JSON.stringify(st, null, 2)).catch(() => {});
}

/** A scene's lines as spoken parts: "(pause)" lines split them, emphasis
 *  marks go (the voice reads words, not asterisks). */
export function spokenParts(text: string): string[][] {
  const parts: string[][] = [[]];
  for (const raw of String(text || "").split(/\n+/)) {
    const line = raw.replace(/\*/g, "").trim();
    if (!line) continue;
    if (/^\(pause\)$/i.test(line)) { parts.push([]); continue; }
    parts[parts.length - 1].push(line);
  }
  return parts.filter((p) => p.length);
}

/** The speech engine a HeyGen voice allows: its saved default, else the
 *  best it offers. HeyGen refuses a voice whose saved engine is not
 *  available for speech (measured on Marc's clone: "The requested or saved
 *  voice engine is not available for speech generation"), so one is named. */
const ENGINE_ORDER = ["elevenlabs_v3", "elevenlabs", "starfish", "orca"];
const engineMemo = new Map<string, string | null>();
export function pickHeygenEngine(v: { engines?: string[]; default_engine?: string } | undefined): string | null {
  const allowed = v?.engines || [];
  if (v?.default_engine && (!allowed.length || allowed.includes(v.default_engine))) return v.default_engine;
  return ENGINE_ORDER.find((e) => allowed.includes(e)) || allowed[0] || null;
}
async function heygenEngine(voiceId: string): Promise<string | null> {
  if (engineMemo.has(voiceId)) return engineMemo.get(voiceId)!;
  const own = await listHeygenVoices().catch(() => []);
  const engine = pickHeygenEngine(own.find((v) => v.id === voiceId));
  engineMemo.set(voiceId, engine);
  return engine;
}

async function heygenSpeech(text: string, voiceId: string, out: string): Promise<void> {
  const engine = await heygenEngine(voiceId);
  const r = await fetch("https://api.heygen.com/v3/voices/speech", {
    method: "POST", headers: { "X-Api-Key": String(process.env.HEYGEN_API_KEY), "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId, ...(engine ? { engine } : {}) }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.data?.audio_url) throw new Error(`heygen speech: HTTP ${r.status} ${String(j?.error?.message || j?.message || JSON.stringify(j)).slice(0, 200)}`);
  await download(j.data.audio_url, out);
}

async function elevenSpeech(text: string, voiceId: string, out: string): Promise<void> {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": String(process.env.ELEVENLABS_API_KEY), "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!r.ok) throw new Error(`elevenlabs speech: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  await fs.writeFile(out, Buffer.from(await r.arrayBuffer()));
}

/** The whole read: every scene's parts spoken, joined with silence, one WAV. */
export async function speakScript(scenes: string[], voice: { provider: VoiceProvider; id: string }, workDir: string): Promise<string> {
  const w = (n: string) => path.join(workDir, n);
  const list: string[] = [];
  const silence = async (secs: number) => {
    const f = w(`gap-${secs}.wav`);
    await fs.access(f).catch(() => ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", String(secs), "-c:a", "pcm_s16le", f]));
    return f;
  };
  let n = 0;
  for (let s = 0; s < scenes.length; s++) {
    const parts = spokenParts(scenes[s]);
    if (!parts.length) continue;
    if (list.length) list.push(await silence(SCENE_GAP));
    for (let p = 0; p < parts.length; p++) {
      if (p) list.push(await silence(PAUSE));
      const mp3 = w(`line-${n}.mp3`), wav = w(`line-${n}.wav`);
      n++;
      const have = await fs.stat(wav).then((x) => x.size > 0, () => false);
      if (!have) {
        const text = parts[p].join(" ");
        await (voice.provider === "heygen" ? heygenSpeech(text, voice.id, mp3) : elevenSpeech(text, voice.id, mp3));
        await ffmpeg(["-i", mp3, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", wav]);
      }
      list.push(wav);
    }
  }
  if (!list.length) throw new Error("The storyboard has no lines to read");
  await fs.writeFile(w("voice-list.txt"), list.map((f) => `file '${f}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", w("voice-list.txt"), "-c:a", "pcm_s16le", w("voice.wav")]);
  return w("voice.wav");
}

/** Make the take and attach it. Returns at once; the work runs on.
 *  `attach(url)` attaches a project asset as a whole-film take (index.ts). */
export async function startGeneratedTake(tenant: string, projectId: string, opts: {
  actor: string;
  /** The vendor that performs it: one driven by audio (default HeyGen). */
  performer?: string;
  voice?: VoiceProvider;
  voice_id?: string;
}, attach?: (url: string) => Promise<{ status: number; body: Record<string, unknown> }>): Promise<GeneratedTakeStatus> {
  const registered = attacher;
  const doAttach = attach || (registered ? (url: string) => registered(tenant, projectId, url) : null);
  if (!doAttach) throw new Error("Takes cannot be attached here");
  const key = `${tenant}/${projectId}`;
  if (running.get(key)?.status === "running") throw new Error("A generated take for this film is already running");
  const project = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const grammar = (project as any).treatment?.filmGrammar;
  if (grammar !== "speaker" && grammar !== "creator-cut") throw new Error("A generated take needs a film a person carries (speaker or creator-cut)");
  const actor = await getActor(tenant, opts.actor);
  if (!actor) throw new Error(`No cast actor "${opts.actor}"`);
  const performer = getPerformer(opts.performer || "heygen");
  if (!performer) throw new Error(`No performer "${opts.performer}" (${PERFORMERS.map((p) => p.id).join(", ")})`);
  if (!performer.fromAudio) throw new Error(`${performer.label} copies a recording's motion, so it cannot perform a script alone -- use a vendor driven by audio (HeyGen)`);
  if (!process.env[performer.key]) throw new Error(`${performer.label} is not set up on this server (${performer.key})`);
  const scenes = ((project as any).storyboard?.scenes || []).map((s: any) => String(s?.voiceover_text || ""));
  if (!scenes.some((t: string) => spokenParts(t).length)) throw new Error("The storyboard has no lines to read");
  // The voice: HeyGen's (the look's own unless one is named) or ElevenLabs'
  // (the one named, else the actor's).
  const provider: VoiceProvider = opts.voice === "elevenlabs" ? "elevenlabs" : "heygen";
  let voiceId = opts.voice_id || "";
  if (provider === "elevenlabs") {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");
    voiceId ||= actor.voice_id || "";
    if (!voiceId) throw new Error("Name an ElevenLabs voice (voice_id), or give the actor one");
  } else {
    if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is not set");
    if (!voiceId && actor.heygen_look_id) voiceId = (await getHeygenLook(actor.heygen_look_id)).default_voice_id || "";
    if (!voiceId) throw new Error("Name a HeyGen voice (voice_id): this actor has no HeyGen voice of its own");
  }
  const st: GeneratedTakeStatus = { project_id: projectId, actor: actor.id, performer: performer.id, voice: { provider, id: voiceId }, status: "running", started_at: new Date().toISOString() };
  running.set(key, st);
  await save(tenant, st);
  void run(tenant, projectId, actor, performer, scenes, st, doAttach).catch(async (e) => {
    st.status = "failed"; st.error = String(e?.message || e).slice(0, 300); st.finished_at = new Date().toISOString();
    running.delete(key);
    await save(tenant, st);
  });
  return st;
}

async function run(tenant: string, projectId: string, actor: CastActor, performer: Performer, scenes: string[], st: GeneratedTakeStatus,
  attach: (url: string) => Promise<{ status: number; body: Record<string, unknown> }>): Promise<void> {
  const key = `${tenant}/${projectId}`;
  // One work dir per actor, vendor and voice: a restart keeps the lines and
  // the submitted video; another voice starts clean.
  const workDir = path.join(projectDir(tenant, projectId), "_work", `generated-take-${actor.id}-${performer.id}-${st.voice.provider}-${st.voice.id}`.replace(/[^A-Za-z0-9_.-]/g, "_"));
  await fs.mkdir(workDir, { recursive: true });
  const w = (n: string) => path.join(workDir, n);
  const stage = async (s: string) => { st.stage = s; await save(tenant, st); };

  await stage("voice");
  const wav = await speakScript(scenes, st.voice, workDir);
  if (!(await fs.stat(w("voice.mp3")).then((x) => x.size > 0, () => false))) await ffmpeg(["-i", wav, "-c:a", "libmp3lame", "-b:a", "192k", w("voice.mp3")]);

  await stage(performer.id);
  const project = await loadProject(tenant, projectId);
  const W = Number((project as any)?.canvas?.width) || 1080, H = Number((project as any)?.canvas?.height) || 1920;
  const picture = await performer.fromAudio!(w("voice.mp3"), { tenant, actor, portraitAbs: portraitPath(tenant, actor), workDir, width: W, height: H });

  await stage("attach");
  // Into the project's assets under a take-* name, the voice laid under the
  // picture (HeyGen's copy of it is re-encoded; ours is the one we made).
  const name = `take-generated-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
  const assets = path.join(config.dataDir, tenant, "projects", projectId, "assets");
  await fs.mkdir(assets, { recursive: true });
  await ffmpeg(["-i", picture, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", path.join(assets, name)]);
  const url = `/assets/${tenant}/projects/${projectId}/assets/${name}`;
  const out = await attach(url);
  if (out.status !== 200) throw new Error(String(out.body?.error || `attach failed (${out.status})`));
  st.url = url;
  st.seconds = Number(((await durationOf(path.join(assets, name))) || 0).toFixed(2));
  st.status = "done";
  st.stage = undefined;
  st.finished_at = new Date().toISOString();
  running.delete(key);
  await save(tenant, st);
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}
