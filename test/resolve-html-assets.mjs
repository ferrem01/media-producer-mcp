/**
 * Regression test for resolveHtmlAssetUrls.
 *
 * Guards the asset-URL corruption bug that hung renders: the data resolver
 * (resolveAssetUrls) already turns a component's background into an absolute
 * file:// URL, then resolveHtmlAssetUrls runs over the whole HTML. The old
 * blanket /assets/ regex re-matched the INNER /assets/ of that already-resolved
 * file:///.../brand-kit/assets/... URL and concatenated an http:// fallback onto
 * the file:// prefix -> file:///.../brand-kithttp://localhost:3200/assets/...
 * -> Playwright networkidle timeout -> scene worker exit 1 -> render fails.
 *
 * The fix: only resolve RELATIVE /assets/ URLs (preceded by a delimiter or
 * start-of-string), never /assets/ substrings already embedded in an absolute URL.
 *
 * Usage: node test/resolve-html-assets.mjs   (run after `npm run build`)
 */
import { resolveHtmlAssetUrls } from "../dist/core/scene-assembler.js";

const results = [];
function check(name, input, predicate) {
  const out = resolveHtmlAssetUrls(input, false);
  const ok = predicate(out);
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    console.log(`        in : ${input}`);
    console.log(`        out: ${out}`);
  }
}

// The bug: an already-resolved file:// brand-kit URL must pass through unchanged.
const resolved = '<div style="background-image:url(file:///data/media-producer/marc-getquotient-ai/brand-kit/assets/background/wave-purple-light.webp)"></div>';
check("already-resolved file:// brand-kit passes through unchanged",
  resolved, (out) => out === resolved && !out.includes("http://"));

const projResolved = '<video src="file:///data/media-producer/marc-getquotient-ai/projects/proj_x/assets/clip.mp4">';
check("already-resolved file:// project asset passes through unchanged",
  projResolved, (out) => out === projResolved && !out.includes("http://"));

// Genuine relative URLs must still resolve to file://.
check("relative brand-kit /assets/ resolves to file://",
  '<img src="/assets/marc-getquotient-ai/brand-kit/logo.svg">',
  (out) => out.includes("file://") && out.includes("/brand-kit/assets/logo.svg"));

check("relative /assets/ inside css url() resolves",
  ".x{background:url(/assets/marc-getquotient-ai/brand-kit/background/wave.webp)}",
  (out) => out.includes("file://") && !/url\(\/assets\//.test(out));

check("relative project /assets/ resolves to file://",
  '<video src="/assets/marc-getquotient-ai/projects/proj_x/assets/clip.mp4">',
  (out) => out.includes("file://") && out.includes("/projects/proj_x/assets/clip.mp4"));

const pass = results.every(Boolean);
console.log(`\n=== resolveHtmlAssetUrls: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
