/**
 * Auto-wire regression: an embedded <component> whose timeline the scene's
 * createTimeline NEVER wires must STILL animate. The codegen frequently embeds
 * a block (esp. ambient backgrounds: gradient-background, mesh-gradient,
 * depth-blur) but forgets to `tl.add(ctx.getComponentTimeline(id))`. The
 * assembler auto-adds any registered-but-unconsumed component timeline so the
 * block's motion (incl. ambient loops) plays regardless.
 *
 * Assembles such a scene, loads it headless, and asserts the embedded
 * mesh-gradient's animated state differs across two seek times.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleCodegenScene } from "../dist/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GSAP = path.join(ROOT, "vendor/gsap");
const OUT = "/tmp/autowire-scene.html";

const checks: { name: string; pass: boolean }[] = [];
const chk = (name: string, pass: boolean) => { checks.push({ name, pass }); console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}`); };

// Scene embeds mesh-gradient but its createTimeline only animates a headline --
// it NEVER calls ctx.getComponentTimeline, so the mesh is "unwired".
const sceneSource = `
<template>
  <div class="scene">
    <component type="mesh-gradient" data='{}' style="position:absolute;inset:0;" />
    <h1 class="headline">Hello</h1>
  </div>
</template>
<style scoped>
  .scene { width:100%; height:100%; position:relative; overflow:hidden; }
  .headline { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:#fff; font-size:80px; }
</style>
<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    tl.from(el.querySelector('.headline'), { opacity: 0, y: 40, duration: 0.6 }, 0);
    return tl; // mesh-gradient intentionally left unwired
  }
</script>`;

async function main() {
  console.log("=== Auto-wire (unwired embedded block still animates) E2E ===\n");
  const meshSource = fs.readFileSync(path.join(ROOT, "src/components/effects/mesh-gradient.component.html"), "utf8");
  const brandKit: any = { colors: { primary: "#393bf5", background: "#0b0b14", text: "#fff" }, fonts: [{ family: "Inter", source: "google", weights: [400, 700] }], style: { motion: "cinematic" } };
  const canvas: any = { width: 1280, height: 720, preset: "landscape", fps: 30, background: "#0b0b14" };

  const html = await assembleCodegenScene({
    sceneSource,
    componentSources: [{ type: "mesh-gradient", source: meshSource }],
    brandKit, canvas, duration: 5, sceneId: "autowire_test", gsapDir: GSAP,
  });
  fs.writeFileSync(OUT, html);
  chk("assembled HTML emits the auto-wire loop", /Auto-wire dropped component timelines/.test(html));

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto("file://" + OUT);
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 60000 });
    const sampleAt = (t: number) => page.evaluate((time: number) => {
      (window as any).__MP_TIMELINE.time(time);
      const el = document.querySelector('[data-comp-type="mesh-gradient"]');
      if (!el) return { dur: 0, sig: "" };
      const sig: string[] = [];
      el.querySelectorAll("*").forEach((k) => { const s = getComputedStyle(k as Element); sig.push(s.transform + "|" + s.opacity + "|" + s.backgroundPosition); });
      return { dur: (window as any).__MP_TIMELINE.duration(), sig: sig.join("##") };
    }, t);
    const a = await sampleAt(0.1);
    const b = await sampleAt(2.0);
    chk("master timeline has a duration (component timeline added)", a.dur > 0);
    chk("unwired mesh-gradient ambient motion is PLAYING (state differs t=0.1 vs t=2.0)", !!a.sig && !!b.sig && a.sig !== b.sig);
  } finally {
    await browser.close();
  }

  const allPass = checks.every((c) => c.pass);
  console.log(`\n=== Auto-wire E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}) ===`);
  if (!allPass) process.exit(1);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
