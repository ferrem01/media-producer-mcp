/**
 * Runtime-gate smoke test (deterministic, no LLM, no MCP).
 *
 * Exercises validateSceneRuntime() directly: it must FLAG a scene whose GSAP
 * timeline callback throws while seeking (the "badge.textContent on a null
 * element" class of codegen bug) and PASS a scene that null-guards its lookups.
 *
 * This is the correctness counterpart to the vision critique -- the gate that
 * catches "broken" animations the vision model can't see (the frame still
 * renders). Guards the quality-pass runtime check from regressing.
 *
 * Run: npx tsx test/runtime-gate-smoke.ts   (requires `npm run build` first)
 */

import { validateSceneRuntime } from "../dist/core/capture.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GSAP = "file://" + path.resolve(__dirname, "../vendor/gsap/gsap.min.js");

function sceneHtml(body: string, script: string): string {
  return `<!DOCTYPE html><html><head><script src="${GSAP}"></script></head><body>
<div id="stage">${body}</div>
<script>(function(){var tl=gsap.timeline({paused:true});${script}
window.__MP_TIMELINE=tl;window.__MP_DURATION=2;window.__MP_READY=true;})();</script></body></html>`;
}

async function main() {
  console.log("=== Runtime Gate Smoke Test ===\n");
  const dir = fs.mkdtempSync("/tmp/rtgate-");

  // Broken: a timeline callback touches #badge, which is NOT in the template.
  const broken = path.join(dir, "broken.html");
  fs.writeFileSync(broken, sceneHtml(
    `<div id="title">Hi</div>`,
    `gsap.from('#title',{opacity:0,duration:0.3},0); tl.add(function(){ document.querySelector('#badge').textContent='3'; }, 0.5);`,
  ));

  // Clean: the same idea, but null-guarded and the element exists.
  const clean = path.join(dir, "clean.html");
  fs.writeFileSync(clean, sceneHtml(
    `<div id="title">Hi</div><div id="badge">0</div>`,
    `gsap.from('#title',{opacity:0,duration:0.3},0); tl.add(function(){ var b=document.querySelector('#badge'); if(b) b.textContent='3'; }, 0.5);`,
  ));

  const brokenResult = await validateSceneRuntime({ htmlPath: broken, width: 640, height: 360, duration: 2 });
  const cleanResult = await validateSceneRuntime({ htmlPath: clean, width: 640, height: 360, duration: 2 });
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`broken: ok=${brokenResult.ok}${brokenResult.error ? ` error="${brokenResult.error}" @${brokenResult.atTime}s` : ""}`);
  console.log(`clean:  ok=${cleanResult.ok}${cleanResult.error ? ` error="${cleanResult.error}"` : ""}`);

  const pass = brokenResult.ok === false && /null/.test(brokenResult.error || "") && cleanResult.ok === true;
  console.log(`\n=== Runtime Gate Smoke Test: ${pass ? "PASS" : "FAIL"} ===`);
  if (!pass) process.exit(1);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
