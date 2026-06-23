/**
 * Visual QUALITY audit (not just "does it render").
 *
 * For each component: assemble -> render real frames in a headless browser ->
 * build a contact sheet -> run the PRODUCTION vision critique (critiqueCorrectness,
 * the same gate used at generation time) to actively HUNT for layout defects:
 * overlap, off_canvas (clipped), illegible, stray_ui, off_brand_theme.
 *
 * This catches blocks that pass the 4/4 structural harness but LOOK broken
 * (text overflowing a panel, elements off-canvas, low-contrast text, collisions).
 *
 * Usage: node test/quality-audit.mjs <category-dir...>   (defaults to the new categories)
 * Writes per-component frames to /tmp/qa/<type>/ and prints a scorecard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { assembleCodegenScene } from "../dist/core/scene-assembler.js";
import { critiqueCorrectness } from "../dist/llm/correctness-critique.js";
import { config } from "../dist/config.js";

const ex = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GSAP = path.join(ROOT, "vendor/gsap");
const COMP = path.join(ROOT, "src/components");
const QA = "/tmp/qa";

const CATS = process.argv.slice(2).length ? process.argv.slice(2)
  : ["system", "threed", "maps", "social", "code", "captions", "effects", "data-viz"];

// benign data covering common fields; array-driven blocks fall back to their defaults
const DATA = { text: "Quotient scales demand generation", title: "Quotient", body: "You reached 2.5M users",
  label: "Revenue", app: "Quotient", artist: "Quotient", command: "npm run launch",
  code: "function launch(){\n  return scale(demand);\n}", language: "js",
  from_label: "San Francisco", to_label: "Tokyo", location_label: "New York",
  words: ["Fast", "Smart", "Bold"], emphasis: ["scales"] };

const brandKit = { colors: { primary: "#6366f1", secondary: "#8b5cf6", accent: "#a78bfa", surface: "#1e1b4b", background: "#0b0b14", text: "#ffffff", text_muted: "#94a3b8" }, fonts: [{ family: "Inter", source: "google", weights: [400, 600, 800] }], style: { motion: "cinematic", border_radius: "14px" } };
const canvas = { width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#0b0b14" };

function sceneFor(type) {
  return `<template><div class="scene"><component type="${type}" data='${JSON.stringify(DATA).replace(/'/g, "&#39;")}' style="position:absolute;inset:0;" /></div></template>
<style scoped>.scene{width:100%;height:100%;position:relative;overflow:hidden;background:#0b0b14;}</style>
<script>function createTimeline(el,data,ctx){var tl=gsap.timeline();tl.add(ctx.getComponentTimeline('comp_0'),0);return tl;}</script>`;
}

async function main() {
  fs.rmSync(QA, { recursive: true, force: true }); fs.mkdirSync(QA, { recursive: true });
  // collect components from the requested categories
  const items = [];
  for (const cat of CATS) {
    const dir = path.join(COMP, cat);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".component.html"))) {
      const type = f.replace(".component.html", "");
      let desc = type;
      const schemaP = path.join(dir, type + ".schema.json");
      try { const s = JSON.parse(fs.readFileSync(schemaP, "utf8")); desc = s.description || s.label || type; } catch {}
      items.push({ cat, type, source: path.join(dir, f), brief: desc });
    }
  }
  console.log(`=== Visual QUALITY audit: ${items.length} components across [${CATS.join(", ")}] ===\n`);

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const results = [];
  try {
    for (const it of items) {
      const outDir = path.join(QA, it.type); fs.mkdirSync(outDir, { recursive: true });
      let html;
      try {
        html = await assembleCodegenScene({ sceneSource: sceneFor(it.type), componentSources: [{ type: it.type, source: fs.readFileSync(it.source, "utf8") }], brandKit, canvas, duration: 6, sceneId: "qa_" + it.type, gsapDir: GSAP });
      } catch (e) { results.push({ ...it, pass: false, defects: [{ type: "assemble_error", detail: e.message.slice(0, 120) }] }); continue; }
      const file = path.join(outDir, "scene.html"); fs.writeFileSync(file, html);

      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const times = [1.0, 2.5, 4.0, 5.5];
      try {
        await page.goto("file://" + file);
        await page.waitForFunction(() => window.__MP_READY === true, { timeout: 30000 });
        const frames = [];
        for (let i = 0; i < times.length; i++) {
          await page.evaluate((t) => { try { window.__MP_TIMELINE.time(t); } catch {} }, times[i]);
          await page.waitForTimeout(120);
          const fp = path.join(outDir, `f${i}.png`); await page.screenshot({ path: fp });
          frames.push(fp);
        }
        // contact sheet: a horizontal 1x4 time strip (left->right = earlier->later)
        // so the critique reads it as one element over time, not 4 scattered elements.
        const sheet = path.join(outDir, "contact.png");
        await ex("ffmpeg", ["-y", "-i", frames[0], "-i", frames[1], "-i", frames[2], "-i", frames[3], "-filter_complex", "[0][1][2][3]hstack=inputs=4,scale=1920:-1", sheet]);
        const finalB64 = fs.readFileSync(frames[3]).toString("base64");
        const sheetB64 = fs.readFileSync(sheet).toString("base64");
        const brief = `A single motion-graphics component "${it.type}": ${it.brief}. All of its content must be fully ON-CANVAS, legible (readable contrast), and free of overlapping/colliding/clipped text.`;
        const crit = await critiqueCorrectness({ finalFrameBase64: finalB64, contactSheetBase64: sheetB64, contactTimestamps: times, briefText: brief, brandTheme: "dark", llmConfig: config.critiqueLlm });
        results.push({ ...it, pass: crit.pass, defects: crit.defects });
        console.log(`  [${crit.pass ? "PASS" : "DEFECT"}] ${it.cat}/${it.type}${crit.pass ? "" : " -- " + crit.defects.map((d) => d.type).join(",")}`);
      } catch (e) {
        results.push({ ...it, pass: false, defects: [{ type: "render_error", detail: e.message.slice(0, 120) }] });
        console.log(`  [ERROR] ${it.cat}/${it.type} -- ${e.message.slice(0, 80)}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }

  const clean = results.filter((r) => r.pass);
  console.log(`\n=== SCORECARD: ${clean.length}/${results.length} clean (${Math.round(100 * clean.length / results.length)}%) ===`);
  const defective = results.filter((r) => !r.pass);
  if (defective.length) {
    console.log(`\nComponents with defects (${defective.length}):`);
    for (const d of defective) console.log(`  - ${d.cat}/${d.type}: ${d.defects.map((x) => `[${x.type}] ${x.detail}`).join(" | ")}`);
  }
  fs.writeFileSync(path.join(QA, "scorecard.json"), JSON.stringify(results, null, 2));
  console.log(`\nframes + scorecard in ${QA}/`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
