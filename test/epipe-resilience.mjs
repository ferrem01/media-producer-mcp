/**
 * EPIPE resilience regression.
 *
 * scene-worker is forked with stdio:"inherit" and logs progress heavily. Under
 * concurrent load the parent's pipe buffer can fill; a write to stdout then
 * throws EPIPE as an UNHANDLED 'error' event, crashing the worker mid-render and
 * failing the whole render (observed 3x under load, incl. concurrency=6 runs).
 *
 * scene-worker.ts installs `process.stdout/​stderr.on("error", ...)` guards so a
 * broken pipe on a LOG line is dropped instead of crashing. This test reproduces
 * the exact condition (child floods stdout, parent destroys the read end) and
 * asserts: WITHOUT the guard the child exits non-zero (crash); WITH the guard it
 * exits 0 (survives + finishes its work). Deterministic, no LLM/render.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHILD = "/tmp/epipe-child.mjs";

// A child that mimics the worker: optionally installs the SAME guard as
// scene-worker.ts, then floods stdout while "doing work", then exits cleanly.
fs.writeFileSync(CHILD, `
const guard = process.argv[2] === "guard";
if (guard) {
  process.stdout.on("error", (e) => { if (e && e.code === "EPIPE") return; });
  process.stderr.on("error", (e) => { if (e && e.code === "EPIPE") return; });
}
let done = false;
setTimeout(() => { done = true; }, 800); // simulate real render work continuing
const iv = setInterval(() => {
  for (let i = 0; i < 200; i++) console.log("  Capture progress: " + i + "% (frame " + i + "/200)");
  if (done) { clearInterval(iv); process.exit(0); }
}, 20);
`);

function run(mode) {
  return new Promise((resolve) => {
    const c = spawn("node", [CHILD, mode], { stdio: ["ignore", "pipe", "ignore"] });
    setTimeout(() => { try { c.stdout.destroy(); } catch {} }, 60); // parent stops draining -> EPIPE
    c.on("exit", (code) => resolve(code));
  });
}

const checks = [];
const chk = (n, p, d = "") => { checks.push(p); console.log(`  [${p ? "PASS" : "FAIL"}] ${n}${d ? " -- " + d : ""}`); };

async function main() {
  console.log("=== EPIPE resilience (broken pipe on a log line must not crash a render) ===\n");
  const noguard = await run("noguard");
  const guarded = await run("guard");
  chk("WITHOUT guard: child crashes on EPIPE (exit != 0)", noguard !== 0, `exit=${noguard}`);
  chk("WITH guard: child survives EPIPE and finishes (exit == 0)", guarded === 0, `exit=${guarded}`);
  // sanity: confirm scene-worker actually ships the guard
  const worker = fs.readFileSync(path.resolve(__dirname, "../dist/core/scene-worker.js"), "utf8");
  chk("scene-worker installs the stdout/stderr EPIPE guard", /process\.stdout\.on\("error"/.test(worker) && /EPIPE/.test(worker));
  const allPass = checks.every(Boolean);
  console.log(`\n=== EPIPE resilience: ${allPass ? "PASS" : "FAIL"} (${checks.filter(Boolean).length}/${checks.length}) ===`);
  if (!allPass) process.exit(1);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
