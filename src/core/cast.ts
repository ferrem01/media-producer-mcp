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

export async function getActor(tenant: string, id: string): Promise<CastActor | null> {
  return (await listCast(tenant)).find((a) => a.id === id) || null;
}

export function portraitPath(tenant: string, actor: CastActor): string {
  return path.join(config.dataDir, tenant, actor.portrait);
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
}): Promise<CastActor> {
  // A portrait can be anyone's face: whoever adds it vouches for it. A
  // HeyGen look already passed HeyGen's own consent (or is a stock presenter).
  // A fictional actor is a generated face: the adder vouches it is nobody's.
  if (!opts.heygen_look_id && opts.consent !== true && opts.fictional !== true) throw new Error("Confirm this is you, or a person who agreed to be cast (consent: true), or a generated person (fictional: true)");
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
    await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...(at != null ? ["-ss", String(at)] : []), "-i", src,
      "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "2", path.join(config.dataDir, tenant, rel)]);
  } finally {
    if (fetched) await fs.rm(fetched, { force: true }).catch(() => {});
  }
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

/** A model sheet (a tenant file) as cast/<id>-sheet.jpg, at full detail:
 *  a wide sheet's face is a third of its width. */
async function saveSheet(tenant: string, id: string, file: string): Promise<string> {
  const tenantDir = path.resolve(config.dataDir, tenant);
  const src = path.resolve(tenantDir, String(file || "").replace(/^\/+/, ""));
  if (!src.startsWith(tenantDir + path.sep)) throw new Error("sheet must be a path inside the tenant");
  await fs.access(src).catch(() => { throw new Error("sheet not found"); });
  await fs.mkdir(castDir(tenant), { recursive: true });
  const rel = path.join("cast", `${id}-sheet.jpg`);
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-frames:v", "1", "-vf", "scale='min(2048,iw)':-2", "-q:v", "2", path.join(config.dataDir, tenant, rel)]);
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
  if (actor.sheet) await fs.rm(path.join(config.dataDir, tenant, actor.sheet), { force: true }).catch(() => {});
  return true;
}
