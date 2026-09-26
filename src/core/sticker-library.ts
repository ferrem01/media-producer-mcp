/**
 * THE HOUSE STICKER LIBRARY.
 *
 * Marc: "am i supposed to like go out and find all these stickers and
 * stickify a bunch of things or is there like a library somewhere of a base
 * set of stickers". A moment ("if I talk about money ... show a little stack
 * of money"; "MailChimp -- I don't want the logo, I want a little chimp")
 * wants a die-cut sticker, and a marketer has none.
 *
 * Three layers, one style:
 *  - the HOUSE SET: a starter catalogue made once with the image model,
 *    committed under src/stickers/ and copied into `_system/stickers` on
 *    first use (the foley pattern: a fresh server has it with no deploy step);
 *  - ON DEMAND: a name the set lacks is minted in the same house style
 *    (`mintSticker`) and joins the library for every tenant;
 *  - a sticker is addressed by NAME: `data.sticker: "money-stack"` on a
 *    sticker-prop or sticker-rain resolves to its file at assembly.
 *
 * A sticker is never a brand mark: the prompt forbids logos and text, so
 * "chimp" for MailChimp is a chimp, not their logo.
 */
import fs from "node:fs/promises";
import { DEFAULT_IMAGE_MODEL } from "../media/image-gen.js";
import fsSync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const STICKER_URL_PREFIX = "/assets/_system/stickers/";

export interface StickerSpec {
  name: string;
  /** What it draws, in the words the image model gets. */
  subject: string;
  /** What it is for, in the words a writer would search. */
  tags: string[];
}

export interface StickerEntry extends StickerSpec {
  file: string;
  url: string;
  source: "house" | "minted";
}

/** The house set. Names are the address; subjects feed the house prompt. */
export const HOUSE_STICKERS: readonly StickerSpec[] = [
  { name: "money-stack", subject: "a thick stack of green dollar bills held with a paper band", tags: ["money", "cash", "revenue", "pay", "budget", "rich"] },
  { name: "dollar-bill", subject: "a single green dollar bill, slightly curled", tags: ["money", "cash", "bill", "dollar", "rain"] },
  { name: "coin", subject: "a shiny gold coin with a simple star in the middle", tags: ["money", "coin", "gold", "cost", "cheap"] },
  { name: "money-bag", subject: "a bulging burlap money bag tied with rope, a dollar sign shape stitched on it", tags: ["money", "bag", "profit", "savings"] },
  { name: "credit-card", subject: "a generic blue credit card with a gold chip, no text", tags: ["pay", "card", "purchase", "checkout"] },
  { name: "chimp", subject: "a cheerful cartoon chimpanzee face, big grin", tags: ["chimp", "monkey", "ape", "mailchimp", "email"] },
  { name: "dinosaur", subject: "a friendly green cartoon dinosaur, a little clumsy", tags: ["old", "outdated", "legacy", "ancient", "dinosaur"] },
  { name: "floppy-disk", subject: "a retro blue floppy disk", tags: ["old", "retro", "outdated", "legacy", "save", "2015"] },
  { name: "fax-machine", subject: "a beige retro fax machine with paper coming out", tags: ["old", "outdated", "legacy", "office"] },
  { name: "snail", subject: "a slow cartoon snail with a spiral shell", tags: ["slow", "wait", "delay", "sluggish"] },
  { name: "rocket", subject: "a red and white cartoon rocket blasting off with a flame", tags: ["launch", "fast", "growth", "boost", "rocket"] },
  { name: "fire", subject: "a bright orange cartoon flame", tags: ["fire", "hot", "trending", "lit", "burn"] },
  { name: "lightning-bolt", subject: "a yellow lightning bolt", tags: ["fast", "power", "energy", "instant", "zap"] },
  { name: "clock", subject: "a round red alarm clock with two bells on top", tags: ["time", "clock", "hours", "late", "deadline", "morning"] },
  { name: "hourglass", subject: "a wooden hourglass with golden sand running", tags: ["time", "wait", "hours", "patience"] },
  { name: "calendar", subject: "a tear-off desk calendar page with a red top, no numbers", tags: ["date", "schedule", "week", "monday", "plan"] },
  { name: "coffee-cup", subject: "a steaming takeaway coffee cup with a sleeve", tags: ["coffee", "morning", "monday", "tired", "break"] },
  { name: "laptop", subject: "an open silver laptop with a blank blue screen", tags: ["work", "computer", "laptop", "desk"] },
  { name: "envelope", subject: "a white paper envelope with a red wax heart seal", tags: ["email", "mail", "message", "inbox", "newsletter"] },
  { name: "inbox-tray", subject: "a desk inbox tray overflowing with papers", tags: ["inbox", "email", "overload", "busy", "backlog"] },
  { name: "megaphone", subject: "a red megaphone", tags: ["announce", "marketing", "launch", "shout", "promo"] },
  { name: "lightbulb", subject: "a glowing yellow light bulb", tags: ["idea", "insight", "smart", "tip"] },
  { name: "target", subject: "a red and white archery target with an arrow in the bullseye", tags: ["goal", "target", "aim", "accuracy", "hit"] },
  { name: "magnifying-glass", subject: "a magnifying glass with a wooden handle", tags: ["search", "find", "research", "look", "analyze"] },
  { name: "chart-up", subject: "a white card with a green bar chart and an arrow going up", tags: ["growth", "up", "results", "analytics", "numbers", "win"] },
  { name: "chart-down", subject: "a white card with a red line chart and an arrow going down", tags: ["down", "loss", "decline", "bad", "numbers"] },
  { name: "spreadsheet", subject: "a messy green spreadsheet grid on a paper sheet", tags: ["spreadsheet", "excel", "data", "manual", "report"] },
  { name: "trophy", subject: "a shiny gold trophy cup", tags: ["win", "award", "best", "success", "champion"] },
  { name: "crown", subject: "a gold crown with red gems", tags: ["king", "best", "top", "winner", "royal"] },
  { name: "medal", subject: "a gold medal on a blue ribbon", tags: ["award", "first", "winner", "prize"] },
  { name: "star", subject: "a plump yellow star", tags: ["star", "rating", "favorite", "review", "great"] },
  { name: "sparkles", subject: "a cluster of three yellow sparkles", tags: ["magic", "new", "ai", "shine", "wow"] },
  { name: "heart", subject: "a glossy red heart", tags: ["love", "like", "favorite", "care"] },
  { name: "thumbs-up", subject: "a yellow cartoon hand giving a thumbs up", tags: ["yes", "good", "approve", "like", "ok"] },
  { name: "thumbs-down", subject: "a yellow cartoon hand giving a thumbs down", tags: ["no", "bad", "dislike", "fail"] },
  { name: "check-mark", subject: "a bold green check mark", tags: ["done", "yes", "correct", "complete", "handled"] },
  { name: "cross-mark", subject: "a bold red X mark", tags: ["no", "wrong", "fail", "stop", "error"] },
  { name: "warning-sign", subject: "a yellow triangular warning sign with an exclamation shape", tags: ["warning", "danger", "careful", "alert", "risk"] },
  { name: "party-popper", subject: "a party popper bursting with colourful confetti", tags: ["celebrate", "launch", "party", "yay", "live"] },
  { name: "brain", subject: "a pink cartoon brain", tags: ["think", "smart", "ai", "brain", "strategy"] },
  { name: "robot", subject: "a friendly round silver robot with blue eyes", tags: ["ai", "robot", "automation", "bot", "agent"] },
  { name: "mind-blown", subject: "a cartoon head with the top exploding in colourful smoke, amazed face", tags: ["wow", "amazed", "shock", "mind blown"] },
  { name: "sleeping-face", subject: "a round yellow face asleep with a Z-shaped snore bubble, no letters", tags: ["boring", "tired", "sleep", "slow"] },
  { name: "handshake", subject: "two cartoon hands shaking", tags: ["deal", "partner", "agree", "team", "customer"] },
];

/** The house style every sticker is drawn in (house set and minted alike). */
export function stickerPrompt(subject: string): string {
  return `A single die-cut sticker of ${subject}. Flat 2D vector illustration: bold clean shapes, a few soft cel-shaded highlights, rich saturated colours, a dark outline on the art, and a thick uniform white die-cut border following the whole silhouette. No text, no letters, no numbers, no logos or brand marks. One object only, centered, filling most of the canvas, on a fully transparent background.`;
}

/** A cutout prompt written for the old Veo route ("flat sticker art centered
 *  on a plain solid green background, static shot") reduced to what to draw:
 *  the house prompt supplies the style and the transparent ground. */
export function cutoutSubject(prompt: string): string {
  const s = String(prompt || "")
    .replace(/\b(?:flat\s+)?(?:die-?cut\s+)?sticker(?:\s+art)?\s+(?:of\s+)?/gi, "")
    .replace(/,?\s*(?:centered|centred)?\s*on\s+a\s+(?:plain\s+)?(?:solid\s+)?(?:green|white|chroma[- ]?key)\s+(?:background|screen)/gi, "")
    .replace(/,?\s*static(?:\s+shot)?\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");
  return s || String(prompt || "").trim();
}

export function stickerSlug(name: string): string {
  return String(name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function stickerUrl(name: string): string {
  return `${STICKER_URL_PREFIX}${stickerSlug(name)}.webp`;
}

export function stickerDir(dataDir: string): string {
  return path.join(dataDir, "_system", "stickers");
}

/** The committed house set: src/stickers next to src/core (dist/stickers
 *  after the build copies it). */
function bundledDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "stickers");
}

interface MintedIndex { version: 1; stickers: Array<StickerSpec & { file: string; minted_at: string }> }

async function readMinted(dir: string): Promise<MintedIndex> {
  try {
    const j = JSON.parse(await fs.readFile(path.join(dir, "minted.json"), "utf8"));
    if (j && Array.isArray(j.stickers)) return j;
  } catch { /* none yet */ }
  return { version: 1, stickers: [] };
}

/** Copy the committed house set into `_system/stickers` (once per file) and
 *  return the whole library: house set plus everything minted since. */
export async function ensureStickerLibrary(dataDir: string): Promise<StickerEntry[]> {
  const dir = stickerDir(dataDir);
  await fs.mkdir(dir, { recursive: true });
  const src = bundledDir();
  const out: StickerEntry[] = [];
  for (const spec of HOUSE_STICKERS) {
    const file = `${stickerSlug(spec.name)}.webp`;
    const dest = path.join(dir, file);
    // Copied when missing OR when the committed file changed (a redrawn
    // house set reaches a server that already holds the old one).
    const from = path.join(src, file);
    if (fsSync.existsSync(from) && (!fsSync.existsSync(dest) || fsSync.statSync(dest).size !== fsSync.statSync(from).size)) {
      await fs.copyFile(from, dest);
    }
    if (fsSync.existsSync(dest)) out.push({ ...spec, file, url: STICKER_URL_PREFIX + file, source: "house" });
  }
  const minted = await readMinted(dir);
  for (const m of minted.stickers) {
    if (out.some((e) => e.name === m.name)) continue;
    if (fsSync.existsSync(path.join(dir, m.file))) out.push({ name: m.name, subject: m.subject, tags: m.tags, file: m.file, url: STICKER_URL_PREFIX + m.file, source: "minted" });
  }
  return out;
}

/** Best library match for a word or phrase: exact name, then tag hits. */
export function findSticker(library: StickerEntry[], query: string): StickerEntry | null {
  const slug = stickerSlug(query);
  const exact = library.find((e) => stickerSlug(e.name) === slug);
  if (exact) return exact;
  const words = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let best: StickerEntry | null = null, bestScore = 0;
  for (const e of library) {
    const score = words.reduce((s, w) => s + (e.tags.includes(w) ? 2 : 0) + (e.name.includes(w) ? 1 : 0), 0);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}

/** Tighten the drawn PNG to its opaque pixels (plus a small margin), clear
 *  the near-transparent haze the model leaves round the art (a faint box
 *  behind some stickers), cap its size and write it as WebP with alpha (a 512px sticker is ~40KB, the PNG
 *  ~700KB), with ffmpeg alone: read the alpha plane raw, find the box, crop,
 *  scale, encode. */
export async function trimSticker(input: string, output: string, maxSide = 512, format: "webp" | "png" = "webp"): Promise<{ width: number; height: number }> {
  const probe = await execFileAsync("ffmpeg", ["-v", "error", "-i", input, "-vf", "alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "-"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 } as any);
  const buf = probe.stdout as unknown as Buffer;
  // The source is square (1024x1024) from the image model; derive W from the
  // byte count so any square works.
  const side = Math.round(Math.sqrt(buf.length));
  const W = side, H = side;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (buf[row + x] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) throw new Error("sticker came back empty (no opaque pixels)");
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const ow = Math.max(2, Math.round(cw * k / 2) * 2), oh = Math.max(2, Math.round(ch * k / 2) * 2);
  await execFileAsync("ffmpeg", ["-v", "error", "-y", "-i", input, "-vf", `crop=${cw}:${ch}:${x0}:${y0},scale=${ow}:${oh}:flags=lanczos,format=rgba,lutrgb=a='if(lt(val\\,40)\\,0\\,val)'`, ...(format === "png" ? ["-pix_fmt", "rgba"] : ["-c:v", "libwebp", "-lossless", "0", "-q:v", "88", "-pix_fmt", "yuva420p"]), output]);
  return { width: ow, height: oh };
}

/** Draw one sticker with the image model in the house style (transparent
 *  ground), trim it, and write it to `outFile`. */
export async function drawSticker(subject: string, outFile: string, opts: { apiKey?: string; format?: "webp" | "png"; maxSide?: number } = {}): Promise<{ width: number; height: number }> {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to draw a sticker");
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: DEFAULT_IMAGE_MODEL, prompt: stickerPrompt(subject), n: 1, size: "1024x1024", quality: "medium", background: "transparent", output_format: "png" }),
  });
  if (!r.ok) throw new Error(`image model ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  const j: any = await r.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new Error("image model returned no image");
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const raw = `${outFile}.raw.png`;
  await fs.writeFile(raw, Buffer.from(b64, "base64"));
  try { return await trimSticker(raw, outFile, opts.maxSide || 512, opts.format || "webp"); }
  finally { await fs.unlink(raw).catch(() => {}); }
}

const minting = new Map<string, Promise<StickerEntry>>();

/** Mint a sticker the library lacks, in the house style, and record it so
 *  every tenant can use it. `subject` is what to draw (defaults to the name).
 *  Concurrent calls for one name share the same draw. */
export async function mintSticker(dataDir: string, name: string, subject?: string, tags: string[] = []): Promise<StickerEntry> {
  const slug = stickerSlug(name);
  if (!slug) throw new Error("a sticker needs a name");
  const inFlight = minting.get(slug);
  if (inFlight) return inFlight;
  const job = (async () => {
    const dir = stickerDir(dataDir);
    const lib = await ensureStickerLibrary(dataDir);
    const have = lib.find((e) => stickerSlug(e.name) === slug);
    if (have) return have;
    const what = String(subject || name).trim();
    const file = `${slug}.webp`;
    await drawSticker(what, path.join(dir, file));
    const idx = await readMinted(dir);
    const words = what.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    const entry = { name: slug, subject: what, tags: Array.from(new Set([...tags.map((t) => t.toLowerCase()), ...slug.split("-"), ...words])), file, minted_at: new Date().toISOString() };
    idx.stickers = idx.stickers.filter((s) => s.name !== slug).concat(entry);
    await fs.writeFile(path.join(dir, "minted.json"), JSON.stringify(idx, null, 2));
    return { name: slug, subject: what, tags: entry.tags, file, url: STICKER_URL_PREFIX + file, source: "minted" as const };
  })();
  minting.set(slug, job);
  try { return await job; } finally { minting.delete(slug); }
}

/** Components that address stickers by name. */
const STICKER_TYPES = new Set(["sticker-prop", "sticker-rain"]);

/** Every sticker name a set of components uses. */
export function stickerNamesIn(components: Array<{ type?: string; data?: any }>): Array<{ name: string; subject?: string }> {
  const out: Array<{ name: string; subject?: string }> = [];
  for (const c of components || []) {
    if (!c || !STICKER_TYPES.has(String(c.type))) continue;
    const d = c.data || {};
    const names = [d.sticker, ...(Array.isArray(d.stickers) ? d.stickers : [])].filter((n) => typeof n === "string" && n.trim());
    for (const n of names) out.push({ name: n, subject: typeof d.sticker_subject === "string" ? d.sticker_subject : undefined });
  }
  return out;
}

/** Make sure every sticker the components name exists (minting the missing
 *  ones). Returns the names it minted and any it could not. */
export async function ensureStickerFiles(dataDir: string, components: Array<{ type?: string; data?: any }>): Promise<{ minted: string[]; failed: Array<{ name: string; error: string }> }> {
  const wanted = stickerNamesIn(components);
  const res = { minted: [] as string[], failed: [] as Array<{ name: string; error: string }> };
  if (!wanted.length) return res;
  const lib = await ensureStickerLibrary(dataDir);
  for (const w of wanted) {
    if (lib.some((e) => stickerSlug(e.name) === stickerSlug(w.name))) continue;
    try { await mintSticker(dataDir, w.name, w.subject); res.minted.push(stickerSlug(w.name)); }
    catch (e: any) { res.failed.push({ name: w.name, error: String(e?.message || e) }); }
  }
  return res;
}

/** Assembly: a sticker named in the data becomes the file it names (a
 *  sticker-prop with a sticker is an image sticker). Returns new data; the
 *  stored component keeps its name, so the library can redraw it. */
export function stickerData(type: string, data: Record<string, any>): Record<string, any> {
  if (!STICKER_TYPES.has(String(type)) || !data) return data;
  const d = { ...data };
  if (typeof d.sticker === "string" && d.sticker.trim() && !d.src) {
    d.src = stickerUrl(d.sticker);
    if (type === "sticker-prop" && (!d.kind || d.kind === "sticker")) d.kind = "image";
  }
  if (type === "sticker-rain" && Array.isArray(d.stickers) && !Array.isArray(d.srcs)) {
    d.srcs = d.stickers.filter((n: unknown) => typeof n === "string" && (n as string).trim()).map((n: string) => stickerUrl(n));
  }
  return d;
}
