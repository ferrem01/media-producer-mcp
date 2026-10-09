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
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SAMPLE_WORK_URL_PREFIX = "/assets/_system/sample-work/";

/** src/core -> src/sample-work (dist/core -> dist/sample-work after the build's copy). */
export function sampleWorkDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "sample-work");
}
