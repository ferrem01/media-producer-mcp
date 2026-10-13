/**
 * THE HOUSE SAMPLE WORK: finished marketing pieces for made-up brands (deck
 * slides, landing pages, social posts, emails, event cards), generated once
 * with the image model and committed under src/sample-work/. The asset wall
 * (components/media/asset-wall) shows them when a film has no work of its
 * own. Marc, Oct 9, after the first wall drew its cards in HTML: "they need
 * to look like really nice assets ... right now they look like our basic web
 * shapes in a pattern." The manifest a page reads is in
 * components/shared/samples.js; the files are served from here as-is (no
 * copy into the data dir: they never change at runtime).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SAMPLE_WORK_URL_PREFIX = "/assets/_system/sample-work/";

/** src/core -> src/sample-work (dist/core -> dist/sample-work after the build's copy). */
export function sampleWorkDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "sample-work");
}

// ── THE SAMPLE LIBRARY ────────────────────────────────────────────────
// The house set as one shared library, beside the music and sound
// libraries: the same for every tenant, read-only, browsed in Studio, listed
// by the MCP (list target 'samples'), and offered to the storyboard writer so
// a beat that shows an email, a post or a blog shows a finished one instead
// of a drawn mock. The one source of truth is the manifest the pages read
// (components/shared/samples.js); it is evaluated here once.
export interface SamplePiece {
  id: string;
  title: string;
  src: string;
  /** email | social | blog | landing | slide | event */
  kind: string;
  brand: string;
  brand_name: string;
  /** height / width */
  ratio: number;
  /** social: linkedin | instagram | story | tiktok | x | youtube | pinterest */
  platform?: string;
  /** blog: post | index */
  page?: string;
  /** email: the lifecycle step (welcome, cart, win-back, ...) */
  flow?: string;
}

let cache: SamplePiece[] | null = null;

/** components/shared/samples.js beside this module's tree (src or dist). */
function manifestPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "components", "shared", "samples.js");
}

export function loadSampleLibrary(): SamplePiece[] {
  if (cache) return cache;
  const win: any = {};
  new Function("window", fs.readFileSync(manifestPath(), "utf-8"))(win);
  const S = win.mpSamples;
  cache = (S?.work || []).map((w: any) => ({
    id: w.id, title: w.title, src: w.src, kind: w.kind, brand: w.brand,
    brand_name: S.brand(w.brand)?.name || w.brand, ratio: w.ratio,
    ...(w.platform ? { platform: w.platform } : {}), ...(w.page ? { page: w.page } : {}), ...(w.flow ? { flow: w.flow } : {}),
  }));
  return cache!;
}

export interface SampleFilter { kind?: string; brand?: string; platform?: string; flow?: string; q?: string }

export function listSamples(f: SampleFilter = {}): SamplePiece[] {
  const q = (f.q || "").trim().toLowerCase();
  return loadSampleLibrary().filter((p) =>
    (!f.kind || p.kind === f.kind) && (!f.brand || p.brand === f.brand) &&
    (!f.platform || p.platform === f.platform) && (!f.flow || p.flow === f.flow) &&
    (!q || (p.title + " " + p.id + " " + p.brand_name).toLowerCase().includes(q)));
}

/** The library as the storyboard writer sees it: one line a piece, grouped by area. */
export function sampleLibraryPromptSection(): string {
  const all = loadSampleLibrary();
  if (!all.length) return "";
  const AREAS: Array<[string, string]> = [["email", "Emails"], ["social", "Social posts"], ["blog", "Blogs"], ["landing", "Landing pages"], ["event", "Event pieces"], ["slide", "Deck slides"]];
  const tag = (p: SamplePiece) => [p.flow, p.platform, p.page].filter(Boolean).join(", ");
  const groups = AREAS.map(([k, label]) => {
    const rows = all.filter((p) => p.kind === k);
    return rows.length ? `${label}:\n` + rows.map((p) => `- "${p.title}"${tag(p) ? ` [${tag(p)}]` : ""} -- ${p.src}`).join("\n") : "";
  }).filter(Boolean).join("\n");
  return `\n\n## The Sample Library (finished marketing work for made-up brands -- the house set every film may use)\n` +
    `When a beat SHOWS marketing output -- an email, a lifecycle flow, a social post, a blog, a landing page, an event piece -- show a FINISHED piece from here, not a drawn mock or a text card: they are designed, full-length and beautiful. ` +
    `Prefer the brand's own work from the Brand Library above when it has the piece. ` +
    `Use them by exact url: an "image" component (data.src = the url; a phone frame, a fan of cards, a click-stream stop), index-reel items[].src (one per item), or "asset-wall" for many at once (layout scroll with kinds ["email"] or ["blog"], feed for social, fly with kinds ["event"], burst with one brand for a whole campaign). ` +
    `A lifecycle series reads best from ONE brand: Flowpath is a B2B SaaS lifecycle, Maré an ecommerce one.\n` + groups;
}
