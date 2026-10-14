/**
 * A REAL PERSON'S FOUNDATION (SPEC-real-person.md): the three clips a real
 * person records once, on the Cast page's guided flow, that everything the
 * avatar will look like is made from.
 *
 *   far   -- 60-90 s at about three meters, seated, knees up: how they look
 *            and move at the shot's distance. The best 15 s of it is the
 *            reference video Seedance takes (its limit).
 *   close -- 30 s at about one meter, chest up: the detail. Its middle frame
 *            is the front still, and the actor's portrait.
 *   turn  -- 10 s, a slow head turn left -> lens -> right: the three-quarter
 *            stills.
 *
 * Why recordings and not photos: the Oct 10-14 tests (proj_0b19db0e scene 3)
 * -- a drawn start frame wins over real photos and reads as "a drawing"; a
 * real recording as a video reference was "really really real". The light in
 * the foundation is the light on the face in every scene, so the flow coaches
 * it before anything is recorded.
 *
 * Files live beside the portrait: cast/<id>-foundation-<kind>.mp4,
 * cast/<id>-still-<kind>.jpg, cast/<id>-foundation-ref.mp4. Each clip can be
 * recorded again on its own; what is derived from it is remade with it.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { ffmpeg, durationOf } from "./actor-test.js";
import { detectSilence } from "./idle-silence.js";
import { listCast, writeCast, type CastActor } from "./cast.js";

export type FoundationKind = "far" | "close" | "turn";
export const FOUNDATION_KINDS: FoundationKind[] = ["far", "close", "turn"];
export type StillKind = "front" | "left" | "right";

export interface ActorFoundation {
  clips: { kind: FoundationKind; file: string; seconds: number; recorded_at: string }[];
  /** Pulled from the clips when they land (ffmpeg, no model). */
  stills: { kind: StillKind; file: string }[];
  /** The <=15 s of the far clip with the most speech: the reference video. */
  ref_video?: string;
  /** When the last of the three clips landed. */
  made_at?: string;
  /** A clip being made from its upload, or why it could not be. */
  work?: { kind: FoundationKind; status: "processing" | "failed"; started_at: string; error?: string }[];
}

/** A look: what a real person wears in a scene -- words, since Seedance
 *  dresses the person as the prompt says whatever they wore in the
 *  references (Oct 13: a polo became a black overshirt). */
export interface ActorLook { id: string; name: string; wardrobe: string; glasses?: boolean }

/** Three looks to start from (the guided flow offers them). */
export const SUGGESTED_LOOKS: Omit<ActorLook, "id">[] = [
  { name: "Founder", wardrobe: "a plain black overshirt over a dark t-shirt, dark trousers" },
  { name: "Keynote", wardrobe: "a navy suit and a white open-collar shirt, no tie" },
  { name: "Weekend", wardrobe: "a grey crew-neck sweater and jeans" },
];

/** A real person ready to perform from their foundation: all three clips,
 *  the reference video and the stills made. */
export function foundationReady(actor: CastActor): boolean {
  const f = actor.foundation;
  return isRealPerson(actor) && !!f && foundationState(actor).complete && !!f.ref_video && f.stills.length > 0;
}

/** The look a scene wears: the one it names, else the actor's default, else
 *  the first; none when the actor has no looks (they wear what they wore). */
export function resolveLook(actor: CastActor, want?: string | null): ActorLook | undefined {
  const looks = actor.looks || [];
  if (want) {
    const hit = looks.find((l) => l.id === want);
    if (!hit) throw new Error(`${actor.name} has no look "${want}" (${looks.map((l) => l.id).join(", ") || "no looks yet"})`);
    return hit;
  }
  return looks.find((l) => l.id === actor.default_look) || looks[0];
}

/** Set a real person's looks (the whole list) and default. Ids come from
 *  the names; a look keeps its id while its name is the same. */
export async function setLooks(tenant: string, actorId: string, looks: { id?: string; name: string; wardrobe: string; glasses?: boolean }[], defaultLook?: string): Promise<CastActor> {
  const cast = await listCast(tenant);
  const actor = cast.find((a) => a.id === actorId);
  if (!actor) throw new Error("No such actor");
  if (!isRealPerson(actor)) throw new Error("Looks are for a real person");
  if (looks.length > 12) throw new Error("At most 12 looks");
  const out: ActorLook[] = [];
  for (const l of looks) {
    const name = String(l.name || "").trim().slice(0, 40);
    const wardrobe = String(l.wardrobe || "").trim().slice(0, 300);
    if (!name || !wardrobe) throw new Error("A look needs a name and what they wear");
    let id = (l.id && /^[a-z0-9-]{1,40}$/.test(l.id) ? l.id : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32)) || "look";
    while (out.some((x) => x.id === id)) id = `${id}-2`;
    out.push({ id, name, wardrobe, ...(typeof l.glasses === "boolean" ? { glasses: l.glasses } : {}) });
  }
  actor.looks = out;
  const want = defaultLook !== undefined ? defaultLook : actor.default_look;
  if (want && out.some((l) => l.id === want)) actor.default_look = want;
  else if (out.length) actor.default_look = out[0].id;
  else delete actor.default_look;
  if (!out.length) delete actor.looks;
  await writeCast(tenant, cast);
  return actor;
}

/** What each clip asks of the person, and the least we accept: a clip cut
 *  short is no foundation (a 3 s far clip holds no 15 s of talking). */
export const FOUNDATION_CLIPS: Record<FoundationKind, { target: number; min: number }> = {
  far: { target: 75, min: 20 },
  close: { target: 30, min: 8 },
  turn: { target: 12, min: 5 },
};

/** Seedance takes at most 15 s of reference video. */
export const REF_SECONDS = 15;

/** Where in the turn clip each three-quarter view is: the person looks left
 *  first, then the lens, then right, then back (the flow's instructions). */
const TURN_AT: Record<"left" | "right", number> = { left: 0.15, right: 0.6 };

/** A real person: a consented portrait actor, not a HeyGen look or a
 *  generated face -- the only kind a foundation is for. */
export function isRealPerson(actor: CastActor): boolean {
  return !!actor.consent && !actor.heygen_look_id && !actor.fictional;
}

/** Which clips are in, which are still to record. */
export function foundationState(actor: CastActor): { recorded: FoundationKind[]; missing: FoundationKind[]; complete: boolean } {
  const have = new Set((actor.foundation?.clips || []).map((c) => c.kind));
  const recorded = FOUNDATION_KINDS.filter((k) => have.has(k));
  const missing = FOUNDATION_KINDS.filter((k) => !have.has(k));
  return { recorded, missing, complete: missing.length === 0 };
}

/** The window of `seconds` with the most speech, skipping the first
 *  `settle` seconds (the person sitting back after pressing record). */
export function bestWindow(duration: number, silences: { from: number; to: number }[], seconds = REF_SECONDS, settle = 2): number {
  const room = duration - seconds;
  if (room <= 0) return 0;
  const first = Math.min(settle, room);
  let best = first, bestSilent = Infinity;
  for (let start = first; start <= room + 1e-6; start += 0.5) {
    const end = start + seconds;
    const silent = silences.reduce((s, r) => s + Math.max(0, Math.min(end, r.to) - Math.max(start, r.from)), 0);
    if (silent < bestSilent - 1e-6) { bestSilent = silent; best = start; }
  }
  return Math.round(best * 10) / 10;
}

/** Keep one clip of a real person's foundation, from a file on disk (an
 *  upload or the phone's recording), and remake what is derived from it.
 *  The file is the way in only: it is transcoded into the cast and left for
 *  the caller to delete. */
export async function saveFoundationClip(tenant: string, actorId: string, kind: FoundationKind, src: string): Promise<CastActor> {
  if (!FOUNDATION_KINDS.includes(kind)) throw new Error("kind must be far, close or turn");
  const actor = (await listCast(tenant)).find((a) => a.id === actorId);
  if (!actor) throw new Error("No such actor");
  if (!isRealPerson(actor)) throw new Error("A foundation is for a real person (a consented actor, not a HeyGen look or a generated person)");
  const dir = path.join(config.dataDir, tenant, "cast");
  await fs.mkdir(dir, { recursive: true });
  const rel = (name: string) => path.join("cast", name);
  const abs = (r: string) => path.join(config.dataDir, tenant, r);
  // The phone's MediaRecorder file (webm, often with no duration header,
  // VP9 or HEVC) as a plain upright h264 mp4 no larger than 1080p, sound
  // kept -- and measured after, when it has a duration to read.
  const clip = rel(`${actorId}-foundation-${kind}.mp4`);
  const tmp = abs(clip) + ".part.mp4";
  try {
    await ffmpeg(["-i", src, "-vf", "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmp]);
  } catch {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw new Error(`That ${kind} clip could not be read as a video`);
  }
  const seconds = (await durationOf(tmp)) || 0;
  const need = FOUNDATION_CLIPS[kind].min;
  if (seconds < need) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw new Error(`That ${kind} clip is ${seconds.toFixed(1)} s; it needs at least ${need} s`);
  }
  await fs.rename(tmp, abs(clip));

  const stills: ActorFoundation["stills"] = (actor.foundation?.stills || []).slice();
  const putStill = async (still: StillKind, at: number) => {
    const file = rel(`${actorId}-still-${still}.jpg`);
    await ffmpeg(["-ss", String(Math.max(0, at)), "-i", abs(clip), "-frames:v", "1", "-q:v", "2", abs(file)]);
    const i = stills.findIndex((s) => s.kind === still);
    if (i >= 0) stills[i] = { kind: still, file }; else stills.push({ kind: still, file });
  };
  let refVideo = actor.foundation?.ref_video;
  if (kind === "close") {
    await putStill("front", seconds / 2);
    // The front still is the actor's face everywhere a portrait is shown.
    await ffmpeg(["-i", abs(rel(`${actorId}-still-front.jpg`)), "-vf", "scale='min(1024,iw)':-2", "-q:v", "2", abs(actor.portrait)]);
  } else if (kind === "turn") {
    await putStill("left", seconds * TURN_AT.left);
    await putStill("right", seconds * TURN_AT.right);
  } else {
    const silences = await detectSilence(abs(clip), { noiseDb: -35, minSeconds: 0.4 });
    const start = bestWindow(seconds, silences);
    refVideo = rel(`${actorId}-foundation-ref.mp4`);
    // No sound: the reference is who they are and how they move; the voice
    // of a scene comes from the scene.
    await ffmpeg(["-ss", String(start), "-i", abs(clip), "-t", String(Math.min(REF_SECONDS, seconds)), "-an",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", abs(refVideo)]);
  }

  // Written against a fresh read: a clip can land while another uploads.
  const cast = await listCast(tenant);
  const now = cast.find((a) => a.id === actorId);
  if (!now) throw new Error("No such actor");
  const clips = (now.foundation?.clips || []).filter((c) => c.kind !== kind);
  clips.push({ kind, file: clip, seconds: Math.round(seconds * 10) / 10, recorded_at: new Date().toISOString() });
  clips.sort((a, b) => FOUNDATION_KINDS.indexOf(a.kind) - FOUNDATION_KINDS.indexOf(b.kind));
  const keptStills = [...stills, ...(now.foundation?.stills || []).filter((s) => !stills.some((x) => x.kind === s.kind))];
  const work = now.foundation?.work;
  now.foundation = { clips, stills: keptStills, ...(refVideo ? { ref_video: refVideo } : {}), ...(work?.length ? { work } : {}) };
  if (foundationState(now).complete) now.foundation.made_at = new Date().toISOString();
  await writeCast(tenant, cast);
  return now;
}

/** Running clips, so a second upload of the same clip waits its turn. */
const running = new Map<string, Promise<unknown>>();

/** Take a clip's upload and make it in the background: the transcode of a
 *  phone's 75 s clip outlasts an HTTP request (measured: 80 s for 10 s of
 *  4K in the sandbox). The actor shows `work` while it runs, or why it
 *  failed; the upload file is removed when it is done either way. */
export async function startFoundationClip(tenant: string, actorId: string, kind: FoundationKind, intake: string): Promise<CastActor> {
  if (!FOUNDATION_KINDS.includes(kind)) throw new Error("kind must be far, close or turn");
  const cast = await listCast(tenant);
  const actor = cast.find((a) => a.id === actorId);
  if (!actor) throw new Error("No such actor");
  if (!isRealPerson(actor)) throw new Error("A foundation is for a real person (a consented actor, not a HeyGen look or a generated person)");
  actor.foundation = actor.foundation || { clips: [], stills: [] };
  actor.foundation.work = [...(actor.foundation.work || []).filter((w) => w.kind !== kind), { kind, status: "processing", started_at: new Date().toISOString() }];
  await writeCast(tenant, cast);
  const key = `${tenant}/${actorId}/${kind}`;
  const job = (running.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    let error: string | undefined;
    try { await saveFoundationClip(tenant, actorId, kind, intake); }
    catch (e: any) { error = String(e?.message || e).slice(0, 300); }
    finally { await fs.rm(intake, { force: true }).catch(() => {}); }
    const now = await listCast(tenant);
    const a = now.find((x) => x.id === actorId);
    if (!a?.foundation) return;
    const rest = (a.foundation.work || []).filter((w) => w.kind !== kind);
    if (error) rest.push({ kind, status: "failed", started_at: new Date().toISOString(), error });
    if (rest.length) a.foundation.work = rest; else delete a.foundation.work;
    await writeCast(tenant, now);
  });
  running.set(key, job);
  void job.finally(() => { if (running.get(key) === job) running.delete(key); });
  return actor;
}

/** For tests: wait for every clip in the background. */
export async function foundationIdle(): Promise<void> {
  await Promise.all([...running.values()].map((p) => p.catch(() => {})));
}
