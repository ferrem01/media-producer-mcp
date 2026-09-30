/**
 * THE CAST: the actors a tenant can recast a speaker take as (core/recast.ts).
 *
 * An actor is a portrait and, optionally, a voice. The portrait is who Wan
 * redraws the person as (face, hair, clothes); the voice is an ElevenLabs
 * voice the take's audio is converted to (speech-to-speech keeps the
 * delivery, so every word stays where it was). No voice: the actor speaks
 * with the recording's own voice.
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
import { actorTestDir, isActorTestId } from "./actor-test.js";

const execFileAsync = promisify(execFile);

export interface CastActor {
  id: string;
  name: string;
  /** Tenant-relative path of the portrait (cast/<id>.jpg). */
  portrait: string;
  voice_id?: string;
  voice_name?: string;
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

/** Add an actor. The portrait is a tenant file (`image`, tenant-relative) or
 *  a frame of an actor test's file (`from`: {project, test, file, at}). */
export async function addActor(tenant: string, opts: {
  name: string;
  image?: string;
  from?: { project: string; test: string; file: string; at?: number };
  voice_id?: string;
  voice_name?: string;
}): Promise<CastActor> {
  const name = String(opts.name || "").trim().slice(0, 60);
  if (!name) throw new Error("name is required");
  const tenantDir = path.resolve(config.dataDir, tenant);
  let src: string;
  let at: number | undefined;
  if (opts.from) {
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
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...(at != null ? ["-ss", String(at)] : []), "-i", src,
    "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "2", path.join(config.dataDir, tenant, rel)]);
  const actor: CastActor = {
    id, name, portrait: rel,
    ...(opts.voice_id ? { voice_id: String(opts.voice_id), voice_name: String(opts.voice_name || opts.voice_id) } : {}),
    created_at: new Date().toISOString(),
  };
  cast.push(actor);
  await fs.writeFile(path.join(castDir(tenant), "cast.json"), JSON.stringify(cast, null, 2));
  return actor;
}
