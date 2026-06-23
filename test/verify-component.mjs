/**
 * Single-component verification harness.
 *
 * Usage: node test/verify-component.mjs <component.html> <type> '<sampleDataJson>'
 *
 * Assembles the component into a minimal codegen scene that WIRES its timeline,
 * renders it headless, and asserts:
 *   - the page reaches __MP_READY (no fatal script error during build)
 *   - the master timeline has a real (non-zero) duration
 *   - no console errors fired while seeking across the timeline
 *   - the component's rendered subtree changes between two seek times (it animates)
 *
 * Exit 0 = pass. Used by both humans and subagents to prove a new block is valid.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { assembleCodegenScene } from "../dist/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GSAP = path.join(ROOT, "vendor/gsap");

const [compPath, type, dataJson] = process.argv.slice(2);
if (!compPath || !type) {
  console.error("usage: node test/verify-component.mjs <component.html> <type> '<sampleDataJson>'");
  process.exit(2);
}
const data = dataJson ? JSON.parse(dataJson) : {};
const source = fs.readFileSync(path.resolve(compPath), "utf8");

// Scene embeds the component and wires its timeline at t=0.
const sceneSource = `
<template>
  <div class="scene">
    <component type="${type}" data='${JSON.stringify(data).replace(/'/g, "&#39;")}' style="position:absolute;inset:0;" />
  </div>
</template>
<style scoped>
  .scene { width:100%; height:100%; position:relative; overflow:hidden; }
</style>
<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    tl.add(ctx.getComponentTimeline('comp_0'), 0);
    return tl;
  }
</script>`;

const brandKit = { colors: { primary: "#6366f1", secondary: "#8b5cf6", accent: "#a78bfa", surface: "#1e1b4b", background: "#0b0b14", text: "#ffffff", text_muted: "#94a3b8" }, fonts: [{ family: "Inter", source: "google", weights: [400, 600, 800] }], style: { motion: "cinematic", border_radius: "14px" } };
const canvas = { width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#0b0b14" };

const checks = [];
const chk = (n, p, d = "") => { checks.push(p); console.log(`  [${p ? "PASS" : "FAIL"}] ${n}${d ? " -- " + d : ""}`); };

async function main() {
  console.log(`=== verify component: ${type} ===`);
  const html = await assembleCodegenScene({
    sceneSource, componentSources: [{ type, source }],
    brandKit, canvas, duration: 6, sceneId: `verify_${type}`, gsapDir: GSAP,
  });
  const out = `/tmp/verify-${type}.html`;
  fs.writeFileSync(out, html);

  const errors = [];
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    // Ignore resource-load failures (e.g. Google Fonts CDN cert errors in the
    // sandbox) -- we only care about real JS/script errors in the component.
    const isNetworkNoise = (s) => /Failed to load resource|net::ERR|ERR_CERT|favicon/i.test(s);
    page.on("console", (m) => { if (m.type() === "error" && !isNetworkNoise(m.text())) errors.push(m.text()); });
    page.on("pageerror", (e) => { if (!isNetworkNoise(String(e))) errors.push(String(e)); });
    await page.goto("file://" + out);
    let ready = true;
    try { await page.waitForFunction(() => window.__MP_READY === true, { timeout: 30000 }); }
    catch { ready = false; }
    chk("page reaches __MP_READY", ready);

    const sampleAt = (t) => page.evaluate((time) => {
      try { window.__MP_TIMELINE.time(time); } catch (e) {}
      const el = document.querySelector('[data-comp-type]');
      let sig = "";
      if (el) el.querySelectorAll("*").forEach((k) => { const s = getComputedStyle(k); sig += s.transform + s.opacity + s.left + s.width + (k.textContent || "").slice(0, 20); });
      return { dur: (window.__MP_TIMELINE && window.__MP_TIMELINE.duration && window.__MP_TIMELINE.duration()) || 0, sig };
    }, t);
    const a = await sampleAt(0.2);
    const b = await sampleAt(2.5);
    chk("master timeline has duration > 0", a.dur > 0, `dur=${a.dur}`);
    chk("component animates (state differs across time)", !!a.sig && a.sig !== b.sig);
    chk("no console / page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  } finally {
    await browser.close();
  }
  const allPass = checks.every(Boolean);
  console.log(`=== ${type}: ${allPass ? "PASS" : "FAIL"} (${checks.filter(Boolean).length}/${checks.length}) ===`);
  process.exit(allPass ? 0 : 1);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
