/**
 * Regression test for localizeRemoteMedia (the render b-roll hang fix).
 *
 * A scene worker loads HTML via file:// and waits for `networkidle`. A remote
 * <video> -- e.g. a Pexels clip an agent embedded directly in a JS data object
 * instead of using the downloaded local b-roll -- keeps streaming, so
 * networkidle never fires and page.goto times out, failing the whole scene.
 *
 * Asserts: (1) a remote media URL embedded in a JS data object is downloaded and
 * rewritten to a file:// path that exists on disk; (2) font/CDN URLs are left
 * untouched; (3) a failed download drops the reference (no remote URL left to
 * hang on).
 *
 * Usage: node test/remote-media.mjs   (run after `npm run build`)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localizeRemoteMedia } from "../dist/core/remote-media.js";

const results = [];
function ok(name, cond) { results.push(cond); console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); }

const destDir = fs.mkdtempSync(path.join(os.tmpdir(), "rmtest_"));
const realFetch = globalThis.fetch;

// --- Case 1+2: media URL in a JS data object gets localized; fonts untouched ---
const VID = "https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4";
const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap" rel="stylesheet">
</head><body>
<script>var data={"src":"${VID}","object_fit":"cover"};</script>
</body></html>`;

globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([0, 1, 2, 3]).buffer });
let out = await localizeRemoteMedia(html, destDir);

ok("remote media URL no longer present", !out.includes(VID));
const fileMatch = out.match(/file:\/\/(\S+?\.mp4)/);
ok("rewritten to a file:// path", !!fileMatch);
ok("downloaded file exists on disk", !!fileMatch && fs.existsSync(fileMatch[1]));
ok("font/CDN URL left untouched", out.includes("https://fonts.googleapis.com/css2?family=Inter"));

// --- Case 3: failed download drops the reference (no remote URL left) ---
globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
const html2 = `<video src="https://example.com/missing.mp4"></video>`;
const out2 = await localizeRemoteMedia(html2, destDir);
ok("failed download leaves no remote URL to hang on", !out2.includes("https://example.com/missing.mp4"));

globalThis.fetch = realFetch;
fs.rmSync(destDir, { recursive: true, force: true });

const pass = results.every(Boolean);
console.log(`\n=== localizeRemoteMedia: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
