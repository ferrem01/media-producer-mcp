/**
 * Proves the deterministic-clock render fix used by capture-worker.ts.
 *
 * A loose GSAP animation (one NOT added to the master timeline -- e.g. an idle
 * pulse the codegen wrote) must, during render, advance SMOOTHLY frame to frame
 * and identically every run. Otherwise it free-runs on wall-clock time between
 * screenshots and jitters in the captured video.
 *
 * The fix: stop GSAP's rAF ticker (ticker.remove(updateRoot)) and per frame call
 * updateRoot(frame/fps) so the whole root renders at the exact frame time.
 *
 * Usage: node test/render-determinism.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gsap = fs.readFileSync(path.resolve(__dirname, "../node_modules/gsap/dist/gsap.min.js"), "utf8");
const FPS = 30, FRAMES = 24;

const HTML = `<!doctype html><body style="margin:0"><div id="logo"></div>
<script>${gsap}</script><script>
  var master = gsap.timeline({ paused: true });
  master.from('#logo', { y: 200, duration: 1 }, 0);
  // loose pulse -- intentionally NOT on the master timeline (this is what jitters)
  gsap.to('#logo', { scale: 1.5, repeat: -1, yoyo: true, duration: 0.8, ease: 'sine.inOut' });
  window.__MP_TIMELINE = master; window.__MP_READY = true;
</script></body>`;
fs.writeFileSync("/tmp/render-determinism.html", HTML);

async function series(useFix) {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("file:///tmp/render-determinism.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__MP_READY === true);
  if (useFix) await page.evaluate(() => {
    const g = window.gsap; g.ticker.lagSmoothing(0); g.ticker.remove(g.updateRoot);
  });
  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS;
    await page.evaluate(({ t, useFix }) => {
      if (useFix && window.gsap.updateRoot) window.gsap.updateRoot(t);
      try { window.__MP_TIMELINE.time(t); } catch {}
    }, { t, useFix });
    await page.screenshot({ type: "jpeg", quality: 90 }); // force a render, like the real loop
    out.push(Number(Number(await page.evaluate(() => window.gsap.getProperty('#logo', 'scale'))).toFixed(3)));
  }
  await browser.close();
  return out;
}

const a = await series(true);
const b = await series(true);

const reproducible = a.join() === b.join();
// the loose tween isn't frozen: it actually moves
const animates = new Set(a).size > 3;
// and moves smoothly: only a couple direction reversals (at the pulse peaks), not jittery
let reversals = 0;
for (let i = 2; i < a.length; i++) {
  const d1 = a[i - 1] - a[i - 2], d2 = a[i] - a[i - 1];
  if (d1 * d2 < 0 && Math.abs(d2) > 0.02) reversals++;
}
const smooth = reversals <= 3;

console.log("scale series:", a.join(" "));
console.log(`reproducible run-to-run: ${reproducible} | animates: ${animates} | smooth (reversals=${reversals}): ${smooth}`);
const pass = reproducible && animates && smooth;
console.log(`=== render determinism: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
