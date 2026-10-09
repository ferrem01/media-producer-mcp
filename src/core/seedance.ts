/**
 * SEEDANCE 2.5 through ATLAS CLOUD: the voice-driven performance proved on
 * Oct 4 (Marc's AI cast brief). One omni-reference call: the actor's start
 * frame and model sheet as reference images, the scene's voice as reference
 * audio, a shot direction in the prompt, the voice rendered by the model
 * itself (lip-synced -- the video keeps its own sound). ByteDance forbids a
 * true start frame beside references, so the frame is named in the prompt
 * ("@Image1 is the first frame"), its documented workaround.
 *
 * A DRAFT is a 480p preview billed as 480p; the FINAL renders the same shot
 * at 1080p from the draft's id (draft-complete: prompt, inputs, seed and
 * audio inherited), or straight at 1080p when there is no draft.
 *
 * Every job's prediction id is written by `onSubmit` the moment Atlas takes
 * it, and `resume` polls a kept id instead of paying again.
 */
import { okJson, NO_TEXT } from "./actor-test.js";
export { NO_TEXT };
import { reportVendor } from "./vendor-status.js";

const API = "https://api.atlascloud.ai/api/v1/model";
const POLL_MS = Number(process.env.MP_ACTOR_POLL_MS) || 5000;
const DEADLINE_MS = 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SeedanceResult { url: string; draftId?: string; predictionId: string }

/** The references named in the prompt, as Seedance cites them. */
export function seedanceRefs(images: number, audio: boolean, video = false, room = false): string {
  const names = ["@Image1 is the first frame of the video."];
  // The room reference, when there is one, is the LAST image.
  const sheets = images - 1 - (room && images > 1 ? 1 : 0);
  if (sheets > 0) names.push(`${Array.from({ length: sheets }, (_, i) => `@Image${i + 2}`).join(", ")} ${sheets > 1 ? "are" : "is"} the character sheet (the same person).`);
  if (room && images > 1) names.push(`@Image${images} is the room: keep this exact room, furniture, plants, windows and light throughout.`);
  if (video) names.push("@Video1 is the reference video.");
  if (audio) names.push("@Audio1 is the reference audio.");
  return names.join(" ");
}

/** A speaking shot: the person from the frame and sheet says the reference
 *  audio's words in the shot the scene asks for. */
export function speakingPrompt(shot: string): string {
  return "The person from the first frame and the character sheet (the same face, hair, clothes and accessories) talks directly to the camera. " +
    `${shot.trim().replace(/\.?$/, ".")} ` +
    "They speak exactly the words in the reference audio, in that exact voice and timing, with accurate lip sync. " +
    "Sound: their voice as it really sounds where they are in this shot -- the acoustics of that place " +
    "(a room sounds like a room, outdoors like outdoors, a car like a car), and if they hold a microphone, close and clear like that mic; " +
    "not a dry studio voiceover. No music. Realistic, natural light. " + NO_TEXT;
}

/** A shot with no speech (b-roll): the person in the action asked for. */
export function silentPrompt(shot: string): string {
  return "The person from the first frame and the character sheet (the same face, hair, clothes and accessories). " +
    `${shot.trim().replace(/\.?$/, ".")} ` +
    "They move naturally the whole time, from the very first frame -- gesturing, shifting, reacting, talking if the shot says so; never a held pose. " +
    "Realistic body movement and weight, natural light, cinematic. " + NO_TEXT;
}

async function poll(id: string, headers: Record<string, string>): Promise<SeedanceResult> {
  const url = `${API}/prediction/${id}`;
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > DEADLINE_MS) throw new Error("seedance: timed out (the job is kept: perform again to collect it)");
    await sleep(POLL_MS);
    const st = (await okJson(await fetch(url, { headers }), "seedance status"))?.data || {};
    reportVendor({ vendor: "atlas seedance", job: id, status: st.status });
    if (st.status === "completed" || st.status === "succeeded") {
      const out = st?.outputs?.[0];
      const video = typeof out === "string" ? out : out?.url;
      if (!video) throw new Error("seedance: completed without an output");
      const draftId = st.draft_id || st.draft?.id || (st.draft === true ? st.id : undefined);
      return { url: video, predictionId: id, ...(draftId ? { draftId: String(draftId) } : {}) };
    }
    if (["failed", "canceled", "cancelled", "error"].includes(String(st.status))) {
      throw new Error(`seedance: ${st.status}${st.error ? " -- " + st.error : ""}`);
    }
  }
}

function auth(): Record<string, string> {
  const key = process.env.ATLASCLOUD_API_KEY;
  if (!key) throw new Error("ATLASCLOUD_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function submit(body: Record<string, unknown>, what: string): Promise<string> {
  const sub = await okJson(await fetch(`${API}/generateVideo`, { method: "POST", headers: auth(), body: JSON.stringify(body) }), what);
  const id = sub?.data?.id;
  if (!id) throw new Error(`${what}: ${JSON.stringify(sub).slice(0, 300)}`);
  return String(id);
}

/** One Seedance 2.5 reference-to-video call. `images` by public URL (the
 *  start frame first, then the sheet); `audio` the voice (omitted: a silent
 *  shot, no audio made at all). */
export async function seedanceShot(opts: {
  images: string[]; audio?: string; prompt: string; seconds: number; ratio: string;
  /** The last image is the room reference (labelled so in the prompt). */
  room?: boolean;
  draft?: boolean; resolution?: string; resume?: string; onSubmit?: (predictionId: string) => Promise<void> | void;
}): Promise<SeedanceResult> {
  const headers = auth();
  let id = opts.resume;
  if (!id) {
    id = await submit({
      model: "bytedance/seedance-2.5/reference-to-video",
      // The references named first -- unless the prompt names them itself.
      prompt: /@Image1\b/.test(opts.prompt) ? opts.prompt : `${seedanceRefs(opts.images.length, !!opts.audio, false, !!opts.room)} ${opts.prompt}`,
      reference_images: opts.images.slice(0, 30),
      ...(opts.audio ? { reference_audios: [opts.audio] } : {}),
      duration: Math.max(4, Math.min(30, Math.ceil(opts.seconds))),
      ratio: opts.ratio,
      resolution: opts.resolution || (opts.draft === false ? "1080p" : "480p"),
      // Sound only for a speaking shot: a silent shot (b-roll) plays muted
      // under the scene's voice, and the audio Seedance invents for it was
      // what its copyright filter blocked (Marc's walk-in, Oct 8).
      generate_audio: !!opts.audio,
      watermark: false,
      draft: opts.draft !== false,
    }, "seedance submit");
    await opts.onSubmit?.(id);
  }
  return poll(id, headers);
}

/** The 1080p final of a draft: the same shot, nothing sent again. */
export async function seedanceFinal(draftId: string, opts: { resume?: string; onSubmit?: (predictionId: string) => Promise<void> | void } = {}): Promise<SeedanceResult> {
  const headers = auth();
  let id = opts.resume;
  if (!id) {
    id = await submit({ model: "bytedance/seedance-2.5/draft-complete", draft_id: draftId, watermark: false }, "seedance final");
    await opts.onSubmit?.(id);
  }
  return poll(id, headers);
}

/** Atlas's ratio for a canvas. */
export function seedanceRatio(width: number, height: number): string {
  return height > width * 1.1 ? "9:16" : width > height * 1.1 ? "16:9" : "1:1";
}
