/**
 * Browser-pool regression.
 *
 * In-process captures used to cold-launch a fresh Chromium per call (seconds
 * each). capture.ts now reuses one pooled browser and only opens/closes a page.
 * This asserts the reuse: the first capture pays the one-time launch, but
 * subsequent captures are an order of magnitude faster (page-only). Guards
 * against regressing to per-call launches. Deterministic, no LLM/render.
 */
import fs from "node:fs";
import { captureSingleFrame, closePooledBrowser, pooledLaunchCount } from "../dist/core/capture.js";

const HTML = `<html><body style="background:#0b0b14"><h1 style="color:#fff">Quotient</h1>
<script>window.__MP_TIMELINE={time:()=>{}};window.__MP_READY=true;</script></body></html>`;
const HP = "/tmp/pool-scene.html";

const checks = [];
const chk = (n, p, d = "") => { checks.push(p); console.log(`  [${p ? "PASS" : "FAIL"}] ${n}${d ? " -- " + d : ""}`); };

async function main() {
  console.log("=== Browser pool reuse ===\n");
  fs.writeFileSync(HP, HTML);
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await captureSingleFrame({ htmlPath: HP, outputPath: `/tmp/pool_${i}.png`, width: 1280, height: 720, atTime: 1 });
    times.push(Date.now() - t0);
  }
  const launches = pooledLaunchCount();
  await closePooledBrowser();
  const restAvg = times.slice(1).reduce((a, b) => a + b, 0) / (times.length - 1);
  console.log(`  per-call ms: ${times.join(", ")}`);
  console.log(`  browser launches for 5 captures: ${launches} | pooled-reuse avg: ${Math.round(restAvg)}ms`);
  chk("all 5 captures produced output", times.length === 5 && [0, 1, 2, 3, 4].every((i) => fs.existsSync(`/tmp/pool_${i}.png`)));
  // Deterministic proof of reuse: 5 captures must launch the browser exactly ONCE
  // (cold-launch timing is unreliable across warm/cold OS cache, so count launches).
  chk("5 captures launched the browser exactly once (pooled, not per-call)", launches === 1, `launches=${launches}`);
  const allPass = checks.every(Boolean);
  console.log(`\n=== Browser pool: ${allPass ? "PASS" : "FAIL"} (${checks.filter(Boolean).length}/${checks.length}) ===`);
  if (!allPass) process.exit(1);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
