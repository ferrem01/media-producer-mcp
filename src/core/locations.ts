/**
 * LOCATIONS: the sets a tenant's generated scenes are performed in
 * (SPEC-cast-scenes.md). A location is one image, a CLEAN PLATE -- the room
 * with nobody in it -- so it pins the room, not a pose. A scene that names a
 * location gets its start frame drawn in that room and sends the plate to
 * Seedance as the room reference, which is what stopped the room drifting
 * (Oct 4: scenes 6-7 of the Dana film kept scene 1's room; the chained ones
 * had lost the painting and moved the shelves).
 *
 * Made three ways: drawn from a prompt (GPT Image), cleaned from a frame (GPT
 * Image edit: the same room, the person removed), or an upload used as it is.
 * Drawing takes a while, so a drawn location is listed at once with status
 * "drawing" and fills in when the image lands.
 *
 * Files: <dataDir>/<tenant>/locations/<id>.jpg, the list in locations.json.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";
import { generateImage, editImage } from "../media/image-gen.js";

const execFileAsync = promisify(execFile);

export interface Location {
  id: string;
  name: string;
  /** Tenant-relative path of the plate (locations/<id>.jpg); absent while drawing. */
  image?: string;
  /** What it was drawn from: the prompt, or the frame it was cleaned from. */
  prompt?: string;
  made_from: "prompt" | "frame" | "upload";
  /** Copied from a stock location (core/stock-locations.ts): its id. */
  stock?: string;
  status?: "drawing" | "failed";
  error?: string;
  created_at: string;
}

export type LocationShape = "wide" | "tall" | "square";

const dir = (tenant: string) => path.join(config.dataDir, tenant, "locations");
const listFile = (tenant: string) => path.join(dir(tenant), "locations.json");

export async function listLocations(tenant: string): Promise<Location[]> {
  try {
    return JSON.parse(await fs.readFile(listFile(tenant), "utf8")) as Location[];
  } catch {
    return [];
  }
}

export async function getLocation(tenant: string, id: string): Promise<Location | null> {
  return (await listLocations(tenant)).find((l) => l.id === id) || null;
}

/** The plate's file, or an error a scene can show. */
export async function locationImage(tenant: string, id: string): Promise<string> {
  const loc = await getLocation(tenant, id);
  if (!loc) throw new Error(`No location "${id}" (it was removed?)`);
  if (!loc.image) throw new Error(loc.status === "failed" ? `Location "${loc.name}" failed to draw: ${loc.error || "unknown"}` : `Location "${loc.name}" is still being drawn`);
  return path.join(config.dataDir, tenant, loc.image);
}

// One writer per tenant: a drawing landing never loses an add beside it.
const chains = new Map<string, Promise<unknown>>();
function edit<T>(tenant: string, fn: (list: Location[]) => T): Promise<T> {
  const next = (chains.get(tenant) || Promise.resolve()).catch(() => {}).then(async () => {
    const list = await listLocations(tenant);
    const out = fn(list);
    await fs.mkdir(dir(tenant), { recursive: true });
    const tmp = `${listFile(tenant)}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(list, null, 2));
    await fs.rename(tmp, listFile(tenant));
    return out;
  });
  chains.set(tenant, next);
  return next as Promise<T>;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "location";
}

/** A tenant file from a tenant-relative path or a served asset URL
 *  (/assets/<tenant>/projects/<p>/assets/<file>, what Studio holds). */
function tenantFile(tenant: string, ref: string): string {
  const tenantDir = path.resolve(config.dataDir, tenant);
  let rel = String(ref || "").trim();
  const asset = `/assets/${tenant}/`;
  if (rel.startsWith(asset)) rel = rel.slice(asset.length);
  const abs = path.resolve(tenantDir, rel.replace(/^\/+/, ""));
  if (!abs.startsWith(tenantDir + path.sep)) throw new Error("image must be a file of this workspace");
  if (!/\.(jpe?g|png|webp)$/i.test(abs)) throw new Error("image must be a jpg, png or webp");
  return abs;
}

/** What a plate drawn from a prompt is told. */
export function platePrompt(prompt: string): string {
  return `${prompt.trim().replace(/\.?$/, ".")} ` +
    "An empty set with nobody in it: a real photograph of the room from where a camera would stand to film a person in it, " +
    "the room's walls, furniture, windows and light clearly visible, natural light, no people, no text, no logos.";
}

/** What a frame is told to become: the same room, the person gone. */
export const CLEAN_PROMPT = "The exact same room as the reference image -- the same walls, furniture, plants, windows, art, colours and light, " +
  "from the same camera position -- with nobody in it: remove every person and fill in what was behind them. A real photograph, no text.";

const sizeOf = (shape: LocationShape) => shape === "tall" ? "1024x1536" as const : shape === "square" ? "1024x1024" as const : "1536x1024" as const;

async function shapeOfFile(file: string): Promise<LocationShape> {
  try {
    const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file]);
    const [w, h] = stdout.trim().split("x").map(Number);
    return h > w * 1.1 ? "tall" : w > h * 1.1 ? "wide" : "square";
  } catch {
    return "wide";
  }
}

async function savePlate(tenant: string, id: string, src: string): Promise<string> {
  await fs.mkdir(dir(tenant), { recursive: true });
  const rel = path.join("locations", `${id}.jpg`);
  const { uprightInput } = await import("./image-orient.js");
  const up = await uprightInput(src);
  await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", ...up.pre, "-i", src, "-frames:v", "1", "-vf", up.vf("scale='min(1536,iw)':-2"), "-q:v", "2", path.join(config.dataDir, tenant, rel)]);
  return rel;
}

/** Add a location. `prompt` alone: drawn. `image` (a tenant file or asset
 *  URL): cleaned of people (default), or kept as it is with `clean: false`.
 *  Returns at once; a drawn plate lands later (status "drawing" until then). */
export async function addLocation(tenant: string, opts: { name: string; prompt?: string; image?: string; clean?: boolean; shape?: LocationShape }): Promise<Location> {
  const name = String(opts.name || "").trim().slice(0, 60);
  if (!name) throw new Error("name is required");
  const prompt = String(opts.prompt || "").trim().slice(0, 2000);
  const src = opts.image ? tenantFile(tenant, opts.image) : null;
  if (!src && !prompt) throw new Error("Give a prompt to draw the location from, or an image of it");
  if (src) await fs.access(src).catch(() => { throw new Error("image not found"); });
  const draws = !src || opts.clean !== false;
  if (draws && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set (locations are drawn by GPT Image)");

  const loc = await edit(tenant, (list) => {
    let lid = slug(name);
    while (list.some((l) => l.id === lid)) lid = `${slug(name)}-${crypto.randomBytes(2).toString("hex")}`;
    const made: Location = {
      id: lid, name, made_from: src ? (draws ? "frame" : "upload") : "prompt",
      ...(prompt ? { prompt } : {}),
      ...(draws ? { status: "drawing" as const } : {}),
      created_at: new Date().toISOString(),
    };
    list.push(made);
    return made;
  });
  if (!draws) {
    const image = await savePlate(tenant, loc.id, src!);
    return edit(tenant, (list) => { const l = list.find((x) => x.id === loc.id)!; l.image = image; return l; });
  }
  void (async () => {
    const work = path.join(dir(tenant), `_draw-${loc.id}-${Date.now()}.png`);
    try {
      if (src) await editImage({ prompt: prompt ? `${CLEAN_PROMPT} ${prompt}` : CLEAN_PROMPT, images: [src], outputPath: work, size: sizeOf(opts.shape || await shapeOfFile(src)) });
      else await generateImage({ prompt: platePrompt(prompt), outputPath: work, size: sizeOf(opts.shape || "wide") });
      const image = await savePlate(tenant, loc.id, work);
      await edit(tenant, (list) => { const l = list.find((x) => x.id === loc.id); if (l) { l.image = image; delete l.status; delete l.error; } });
    } catch (e: any) {
      await edit(tenant, (list) => { const l = list.find((x) => x.id === loc.id); if (l) { l.status = "failed"; l.error = String(e?.message || e).slice(0, 300); } }).catch(() => {});
    } finally {
      await fs.rm(work, { force: true }).catch(() => {});
    }
  })();
  return loc;
}

/** A STOCK location into the tenant's library (once: chosen again, the same
 *  one comes back), so a scene names it like any other. */
export async function addStockLocation(tenant: string, stockId: string): Promise<Location> {
  const { getStockLocation, stockLocationFile } = await import("./stock-locations.js");
  const st = getStockLocation(stockId);
  if (!st) throw new Error(`No stock location "${stockId}"`);
  const have = (await listLocations(tenant)).find((l) => l.stock === st.id && l.image);
  if (have) return have;
  const loc = await edit(tenant, (list) => {
    let lid = slug(st.name);
    while (list.some((l) => l.id === lid)) lid = `${slug(st.name)}-${crypto.randomBytes(2).toString("hex")}`;
    const made: Location = { id: lid, name: st.name, prompt: st.prompt, made_from: "upload", stock: st.id, created_at: new Date().toISOString() };
    list.push(made);
    return made;
  });
  const image = await savePlate(tenant, loc.id, stockLocationFile(st.id));
  return edit(tenant, (list) => { const l = list.find((x) => x.id === loc.id)!; l.image = image; return l; });
}

export async function renameLocation(tenant: string, id: string, name: string): Promise<Location> {
  const n = String(name || "").trim().slice(0, 60);
  if (!n) throw new Error("name can't be empty");
  return edit(tenant, (list) => {
    const l = list.find((x) => x.id === id);
    if (!l) throw new Error("No such location");
    l.name = n;
    return l;
  });
}

/** Remove a location and its plate. Takes made in it stay as they are; a
 *  scene still naming it says so the next time it is performed. */
export async function removeLocation(tenant: string, id: string): Promise<boolean> {
  const gone = await edit(tenant, (list) => {
    const i = list.findIndex((x) => x.id === id);
    return i < 0 ? null : list.splice(i, 1)[0];
  });
  if (!gone) return false;
  if (gone.image) await fs.rm(path.join(config.dataDir, tenant, gone.image), { force: true }).catch(() => {});
  return true;
}
