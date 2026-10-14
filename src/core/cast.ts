/**
 * THE CAST: the actors a tenant can recast a speaker take as (core/recast.ts).
 *
 * An actor is a portrait and, optionally, a voice. The portrait is who Wan
 * redraws the person as (face, hair, clothes); the voice is an ElevenLabs
 * voice the take's audio is converted to (speech-to-speech keeps the
 * delivery, so every word stays where it was). No voice: the actor speaks
 * with the recording's own voice.
 *
 * An actor can instead be a HEYGEN LOOK (heygen_look_id): a look HeyGen
 * trained (the person's digital twin, a photo look of them on a sofa, or
 * a stock presenter). HeyGen then draws the whole performance from the
 * take's audio -- the actor tests' winner: "the best eyes and the best
 * mouth", the voice "perfectly lip synced". The portrait is the look's
 * preview, for showing who it is.
 *
 * Portraits are copied into <dataDir>/<tenant>/cast/<id>.jpg, so an actor
 * outlives the image or test it was made from. The list lives beside them
 * in cast.json.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { actorTestDir, isActorTestId, getHeygenLook, download } from "./actor-test.js";
import { uprightInput } from "./image-orient.js";
import type { ActorFoundation, ActorLook } from "./actor-foundation.js";

const execFileAsync = promisify(execFile);

export interface CastActor {
  id: string;
  name: string;
  /** Tenant-relative path of the portrait (cast/<id>.jpg). */
  portrait: string;
  voice_id?: string;
  voice_name?: string;
  /** A HeyGen look id: HeyGen performs the take (core/recast.ts). */
  heygen_look_id?: string;
  /** A portrait actor's consent: the person who added it said this is
   *  them, or someone who agreed to be cast. HeyGen looks carry HeyGen's. */
  consent?: { at: string };
  /** A generated person (a model sheet and a start frame made by an image
   *  model): nobody's likeness, so no consent -- the adder said so. */
  fictional?: { at: string };
  /** Tenant-relative path of the model sheet (cast/<id>-sheet.jpg): the same
   *  person from several angles. The portrait is the start frame drawn from
   *  it. Genjutsu gets both (a second reference image). */
  sheet?: string;
  /** SAVED DATA ONLY: the photos and the drawn sheet draft of the retired
   *  "sheet from photos" path (a real person is a foundation now,
   *  SPEC-real-person.md). Nothing reads them; their files go with the actor. */
  photos?: string[];
  sheet_draft?: { file: string };
  /** A real person's foundation (core/actor-foundation.ts): the three clips
   *  they recorded, and what is pulled from them. A real person added on the
   *  guided flow has no portrait file until the close clip lands. */
  foundation?: ActorFoundation;
  /** A real person's looks: what they wear in a scene (the foundation is
   *  who they are; a look is words for the clothes). */
  looks?: ActorLook[];
  /** The look a scene wears when it names none. */
  default_look?: string;
  created_at: string;
}

function castDir(tenant: string): string {
  return path.join(config.dataDir, tenant, "cast");
}

export async function listCast(tenant: string): Promise<CastActor[]> {
  try {
    return JSON.parse(await fs.readFile(path.join(castDir(tenant), "cast.json"), "utf8")) as CastActor[];
  } catch {
    return [];
  }
}

/** Write the cast list. */
export async function writeCast(tenant: string, cast: CastActor[]): Promise<void> {
  await fs.mkdir(castDir(tenant), { recursive: true });
  await fs.writeFile(path.join(castDir(tenant), "cast.json"), JSON.stringify(cast, null, 2));
}

export async function getActor(tenant: string, id: string): Promise<CastActor | null> {
  return (await listCast(tenant)).find((a) => a.id === id) || null;
}

export function portraitPath(tenant: string, actor: CastActor): string {
  return path.join(config.dataDir, tenant, actor.portrait);
}

/** An actor ready to perform: a real person added on the guided flow has
 *  no picture until their foundation's close clip lands. */
export async function needPicture(tenant: string, actor: CastActor): Promise<CastActor> {
  if (!actor.foundation) return actor;
  const has = await fs.access(portraitPath(tenant, actor)).then(() => true, () => false);
  if (!has) throw new Error(`${actor.name} has no picture yet: record their foundation on the Cast page first`);
  return actor;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "actor";
}

/** Add an actor. The portrait is a tenant file (`image`, tenant-relative),
 *  a frame of an actor test's file (`from`: {project, test, file, at}), or
 *  a HeyGen look's preview (`heygen_look_id`; the name defaults to the look's). */
export async function addActor(tenant: string, opts: {
  name?: string;
  image?: string;
  from?: { project: string; test: string; file: string; at?: number };
  voice_id?: string;
  voice_name?: string;
  heygen_look_id?: string;
  /** Required for a portrait: this is me, or a person who agreed to be cast. */
  consent?: boolean;
  /** Instead of consent: a generated person, nobody real. */
  fictional?: boolean;
  /** The model sheet, a tenant file (see CastActor.sheet). */
  sheet?: string;
  /** A real person added on the guided flow (SPEC-real-person.md): no photo
   *  -- the portrait is pulled from the foundation they record next. */
  real?: boolean;
}): Promise<CastActor> {
  // A portrait can be anyone's face: whoever adds it vouches for it. A
  // HeyGen look already passed HeyGen's own consent (or is a stock presenter).
  // A fictional actor is a generated face: the adder vouches it is nobody's.
  if (!opts.heygen_look_id && opts.consent !== true && opts.fictional !== true) throw new Error("Confirm this is you, or a person who agreed to be cast (consent: true), or a generated person (fictional: true)");
  if (opts.real) return addRealPerson(tenant, String(opts.name || ""), opts);
  const look = opts.heygen_look_id ? await getHeygenLook(String(opts.heygen_look_id)) : null;
  if (look && look.status && look.status !== "completed") throw new Error(`That HeyGen look is ${look.status}, not ready yet`);
  const name = String(opts.name || look?.name || "").trim().slice(0, 60);
  if (!name) throw new Error("name is required");
  const tenantDir = path.resolve(config.dataDir, tenant);
  let src: string;
  let at: number | undefined;
  let fetched: string | null = null;
  if (look) {
    // Only HeyGen's own file hosts: the preview URL comes back from their API.
    const host = (() => { try { return new URL(String(look.preview || "")).hostname; } catch { return ""; } })();
    if (!/(^|\.)heygen\.(ai|com)$/.test(host)) throw new Error("That HeyGen look has no preview image");
    await fs.mkdir(castDir(tenant), { recursive: true });
    fetched = path.join(castDir(tenant), `_look-${crypto.randomBytes(4).toString("hex")}`);
    await download(String(look.preview), fetched);
    src = fetched;
  } else if (opts.from) {
    const f = opts.from;
    if (!/^proj_[A-Za-z0-9_-]+$/.test(String(f.project || "")) || !isActorTestId(String(f.test || "")) || !/^[A-Za-z0-9_.-]+$/.test(String(f.file || ""))) throw new Error("from: bad reference");
    src = path.join(actorTestDir(tenant, f.project, f.test), f.file);
    at = Math.max(0, Number(f.at) || 0);
  } else {
    src = path.resolve(tenantDir, String(opts.image || "").replace(/^\/+/, ""));
    if (!src.startsWith(tenantDir + path.sep)) throw new Error("image must be a path inside the tenant");
  }
  await fs.access(src).catch(() => { throw new Error("portrait not found"); });
  const cast = await listCast(tenant);
  let id = slug(name);
  while (cast.some((a) => a.id === id)) id = `${slug(name)}-${crypto.randomBytes(2).toString("hex")}`;
  await fs.mkdir(castDir(tenant), { recursive: true });
  const rel = path.join("cast", `${id}.jpg`);
  try {
    // A photo from a phone stands upright (its EXIF turn applied); a frame of a test is a video frame.
    const up = opts.from ? { pre: [] as string[], vf: (r: string) => r } : await uprightInput(src);
    await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...up.pre, ...(at != null ? ["-ss", String(at)] : []), "-i", src,
      "-frames:v", "1", "-vf", up.vf("scale='min(1024,iw)':-2"), "-q:v", "2", path.join(config.dataDir, tenant, rel)]);
  } finally {
    if (fetched) await fs.rm(fetched, { force: true }).catch(() => {});
  }
  // The upload was only the way in: the cast keeps its own copy.
  if (!look && !opts.from) await dropIntake(tenant, src);
  const sheet = opts.sheet ? await saveSheet(tenant, id, opts.sheet) : undefined;
  const actor: CastActor = {
    id, name, portrait: rel,
    ...(opts.voice_id ? { voice_id: String(opts.voice_id), voice_name: String(opts.voice_name || opts.voice_id) } : {}),
    ...(look ? { heygen_look_id: look.id } : opts.fictional === true && opts.consent !== true ? { fictional: { at: new Date().toISOString() } } : { consent: { at: new Date().toISOString() } }),
    ...(sheet ? { sheet } : {}),
    created_at: new Date().toISOString(),
  };
  cast.push(actor);
  await fs.writeFile(path.join(castDir(tenant), "cast.json"), JSON.stringify(cast, null, 2));
  return actor;
}

/** A real person with no picture yet: consented, named, and waiting for the
 *  foundation recording that makes their portrait. */
async function addRealPerson(tenant: string, rawName: string, opts: { consent?: boolean; voice_id?: string; voice_name?: string }): Promise<CastActor> {
  if (opts.consent !== true) throw new Error("Confirm this is you, or a person who agreed to be cast (consent: true)");
  const name = rawName.trim().slice(0, 60);
  if (!name) throw new Error("name is required");
  const cast = await listCast(tenant);
  let id = slug(name);
  while (cast.some((a) => a.id === id)) id = `${slug(name)}-${crypto.randomBytes(2).toString("hex")}`;
  const now = new Date().toISOString();
  const actor: CastActor = {
    id, name, portrait: path.join("cast", `${id}.jpg`),
    ...(opts.voice_id ? { voice_id: String(opts.voice_id), voice_name: String(opts.voice_name || opts.voice_id) } : {}),
    consent: { at: now }, foundation: { clips: [], stills: [] }, created_at: now,
  };
  cast.push(actor);
  await writeCast(tenant, cast);
  return actor;
}

/** A model sheet (a tenant file) as cast/<id>-sheet.jpg, at full detail:
 *  a wide sheet's face is a third of its width. */
async function saveSheet(tenant: string, id: string, file: string): Promise<string> {
  const tenantDir = path.resolve(config.dataDir, tenant);
  const src = path.resolve(tenantDir, String(file || "").replace(/^\/+/, ""));
  if (!src.startsWith(tenantDir + path.sep)) throw new Error("sheet must be a path inside the tenant");
  await fs.access(src).catch(() => { throw new Error("sheet not found"); });
  await fs.mkdir(castDir(tenant), { recursive: true });
  const rel = path.join("cast", `${id}-sheet.jpg`);
  const up = await uprightInput(src);
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...up.pre, "-i", src, "-frames:v", "1", "-vf", up.vf("scale='min(2048,iw)':-2"), "-q:v", "2", path.join(config.dataDir, tenant, rel)]);
  await dropIntake(tenant, src);
  return rel;
}

/** Change an actor: its name, its voice (an ElevenLabs voice the recast
 *  converts the delivery to; "" clears it) or its model sheet. */
export async function updateActor(tenant: string, id: string, opts: { name?: string; voice_id?: string; voice_name?: string; sheet?: string }): Promise<CastActor> {
  const cast = await listCast(tenant);
  const actor = cast.find((a) => a.id === id);
  if (!actor) throw new Error("No such actor");
  if (opts.name != null) {
    const name = String(opts.name).trim().slice(0, 60);
    if (!name) throw new Error("name can't be empty");
    actor.name = name;
  }
  if (opts.voice_id != null) {
    if (opts.voice_id) { actor.voice_id = String(opts.voice_id); actor.voice_name = String(opts.voice_name || opts.voice_id); }
    else { delete actor.voice_id; delete actor.voice_name; }
  }
  if (opts.sheet) actor.sheet = await saveSheet(tenant, id, opts.sheet);
  await fs.writeFile(path.join(castDir(tenant), "cast.json"), JSON.stringify(cast, null, 2));
  return actor;
}

/** Remove an actor from the cast (and its portrait). Recasts already made
 *  stay on their takes; a film cast as them keeps playing them until recast. */
export async function removeActor(tenant: string, id: string): Promise<boolean> {
  const cast = await listCast(tenant);
  const actor = cast.find((a) => a.id === id);
  if (!actor) return false;
  await fs.writeFile(path.join(castDir(tenant), "cast.json"), JSON.stringify(cast.filter((a) => a.id !== id), null, 2));
  await fs.rm(portraitPath(tenant, actor), { force: true }).catch(() => {});
  const fd = actor.foundation;
  const foundation = fd ? [...fd.clips.map((c) => c.file), ...fd.stills.map((x) => x.file), ...(fd.ref_video ? [fd.ref_video] : [])] : [];
  for (const f of [actor.sheet, actor.sheet_draft?.file, ...(actor.photos || []), ...foundation]) if (f) await fs.rm(path.join(config.dataDir, tenant, f), { force: true }).catch(() => {});
  // And every upload a cast member was made from that is still lying in the
  // library (Marc: "delete all photos we have on the server of that person").
  await sweepIntake(tenant, 0);
  return true;
}

/** THE UPLOADS A CAST MEMBER IS MADE FROM: the Cast page sends each photo
 *  into the tenant library as cast-<ts>, cast-photo-<ts> or cast-sheet-<ts>
 *  (projects/library/assets) and the cast copies what it keeps -- so the
 *  upload itself is only the way in, and a face is not left lying around. */
const INTAKE = /^cast(-photo|-sheet)?-\d{4}-\d{2}-\d{2}T[\d-]+Z\.[A-Za-z0-9]{1,5}$/;
function intakeDir(tenant: string): string { return path.join(config.dataDir, tenant, "projects", "library", "assets"); }
/** Remove one upload once the cast has its copy (only a Cast-page upload). */
export async function dropIntake(tenant: string, src: string): Promise<void> {
  if (path.dirname(path.resolve(src)) === path.resolve(intakeDir(tenant)) && INTAKE.test(path.basename(src))) await fs.rm(src, { force: true }).catch(() => {});
}
/** Remove Cast-page uploads older than `minAgeMs` (a photo still on its way
 *  in, uploaded but not yet added, is younger). Returns how many went. */
export async function sweepIntake(tenant: string, minAgeMs = 10 * 60 * 1000): Promise<number> {
  const dir = intakeDir(tenant);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  let n = 0;
  for (const f of names) {
    if (!INTAKE.test(f)) continue;
    const st = await fs.stat(path.join(dir, f)).catch(() => null);
    if (!st || Date.now() - st.mtimeMs < minAgeMs) continue;
    await fs.rm(path.join(dir, f), { force: true }).catch(() => {});
    n++;
  }
  return n;
}
