/**
 * Proves the render-determinism fix (scene-assembler.ts): loose GSAP animations
 * the codegen creates outside the master timeline are FOLDED onto the master at
 * assembly time, so the renderer's single `master.time(t)` seek renders every
 * animation frame-accurately. Without it, loose tweens free-run on wall-clock
 * time between screenshots and jitter in the captured video.
 *
 * Mirrors what the assembler emits: a master timeline, some loose tweens, then
 * the re-parent loop. Asserts the same frame-time renders byte-identically.
 *
 * Usage: node test/render-determinism.mjs
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gsap = fs.readFileSync(path.resolve(__dirname, "../node_modules/gsap/dist/gsap.min.js"), "utf8");

// The re-parent snippet exactly as scene-assembler.ts injects it.
const REPARENT = `try {
  gsap.globalTimeline.getChildren(false, true, true).forEach(function (a) {
    if (a !== master && a.parent === gsap.globalTimeline) { master.add(a, a.startTime()); }
  });
} catch (e) {}`;

function html(withFix) {
  return `<!doctype html><body style="margin:0;width:1920px;height:1080px;background:#0b0b14">
  <div id="logo" style="position:absolute;left:910px;top:490px;width:100px;height:100px;background:#fff"></div>
  <script>${gsap}</script><script>(function(){
    var master = gsap.timeline({ paused: true });
    master.from('#logo', { y: 200, duration: 1 }, 0);
    // loose tweens the "components" created (NOT on master) -- what jitters
    gsap.to('#logo', { scale: 1.5, repeat: -1, yoyo: true, duration: 0.8, ease: 'sine.inOut' });
    gsap.to('#logo', { rotation: 360, repeat: -1, duration: 2, ease: 'none' });
    ${withFix ? REPARENT : ""}
    window.__MP_TIMELINE = master; window.__MP_READY = true;
  })();</script></body>`;
}

async function run(withFix) {
  fs.writeFileSync("/tmp/rd.html", html(withFix));
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto("file:///tmp/rd.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__MP_READY === true);
  const at = async (t) => { await page.evaluate((t) => { try { window.__MP_TIMELINE.time(t); } catch {} }, t);
    return crypto.createHash("md5").update(await page.screenshot({ type: "png" })).digest("hex"); };
  const h1 = await at(2.0);
  for (const t of [2.1, 2.2, 2.3, 2.4, 2.5]) await at(t); // real frames in between (forces rAF)
  const h2 = await at(2.0);
  const s = []; for (const t of [2.0, 2.2, 2.4]) s.push(await at(t)); // must still differ (animates)
  await browser.close();
  return { sameT: h1 === h2, animates: new Set(s).size > 1 };
}

const off = await run(false);
const on = await run(true);
console.log("WITHOUT re-parent: same-frame identical?", off.sameT);
console.log("WITH re-parent:    same-frame identical?", on.sameT, "| animates:", on.animates);
const pass = on.sameT && on.animates && !off.sameT;
console.log(`\n=== render determinism: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
