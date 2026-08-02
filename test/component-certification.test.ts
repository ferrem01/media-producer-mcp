import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleScene } from "../src/core/scene-assembler.js";
import { measureLayout } from "../src/core/layout-metrics.js";
import { measureTextContrast } from "../src/core/text-contrast.js";
import { sampleDataFor } from "./helpers/sample-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");

// THE CERTIFICATION SWEEP. Every component, booted with synthesized schema
// data on a light AND a dark ground, measured by the real gates. Films
// sample 4-6 components per generation, so chasing library chrome one film
// at a time is a slot machine (proj_92c3aa27 rolled flowchart/stat-card/
// canva-editor -- none of which any earlier run had touched). This
// enumerates every offender in one pass.
//
// Only COMPONENT-INTERNAL defect classes count: illegible chrome, clipped
// text, ghost panels, collisions, off-canvas overflow. dead_frame is a SCENE
// composition judgment and is excluded (a lone accent on an empty stage is
// the test rig, not the component).
//
// Heavy (hundreds of browser boots): skipped unless MP_CERT_SWEEP=1, so PR
// CI stays fast. Run it when touching component chrome:
//   MP_CERT_SWEEP=1 MP_CHROMIUM_PATH=... npx vitest run test/component-certification.test.ts
// Report lands in test-output/certification-report.json.

const W = 1920, H = 1080;
const DUR = 3;
const SKIP_CATEGORIES = new Set(["effects", "threed"]); // text-free visual worlds
const SKIP_TYPES = new Set([
  "lottie-accent",      // needs a bundled asset file
  "screencast-frame",   // needs real footage
  "speaker-frame",      // needs the camera underlay
]);

const GROUNDS: Array<{ theme: "light" | "dark"; background: string; text: string }> = [
  { theme: "light", background: "#ffffff", text: "#17171c" },
  { theme: "dark", background: "#0f172a", text: "#ffffff" },
];

function boxFor(category: string): { x: string; y: string; width: string; height: string } {
  if (category === "scene-templates") return { x: "0%", y: "0%", width: "100%", height: "100%" };
  if (["titles", "captions", "cta", "props", "system"].includes(category))
    return { x: "10%", y: "30%", width: "80%", height: "40%" };
  return { x: "8%", y: "8%", width: "84%", height: "84%" };
}

interface Finding { component: string; category: string; theme: string; type: string; detail: string; }

describe.skipIf(!process.env.MP_CERT_SWEEP)("component library certification", () => {
  it("every component's own chrome passes the gates on both grounds", async () => {
    const findings: Finding[] = [];
    // MP_CERT_ONLY=comma,separated,types re-runs just those components --
    // the fix loop shouldn't pay for the whole library per iteration.
    const only = process.env.MP_CERT_ONLY ? new Set(process.env.MP_CERT_ONLY.split(",")) : null;
    const cats = (await fs.readdir(LIB, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name !== "shared" && !SKIP_CATEGORIES.has(d.name))
      .map((d) => d.name);

    for (const cat of cats) {
      const files = (await fs.readdir(path.join(LIB, cat))).filter((f) => f.endsWith(".component.html"));
      for (const f of files) {
        const type = f.replace(".component.html", "");
        if (SKIP_TYPES.has(type)) continue;
        if (only && !only.has(type)) continue;
        const source = await fs.readFile(path.join(LIB, cat, f), "utf-8");
        let schemaData: Record<string, never> = {};
        try {
          schemaData = JSON.parse(await fs.readFile(path.join(LIB, cat, `${type}.schema.json`), "utf-8")).data || {};
        } catch { /* schema-less component: boot with empty data */ }

        for (const g of GROUNDS) {
          const data = sampleDataFor(schemaData, g.theme);
          let html: string;
          try {
            html = await assembleScene({
              scene: {
                id: "s1", label: type, duration_seconds: DUR, background: g.background,
                components: [{ id: "c0", type, position: boxFor(cat), data }],
              } as never,
              components: [{ type, source }],
              brandKit: { colors: { background: g.background, text: g.text, primary: "#393bf5" }, fonts: [] } as never,
              canvas: { width: W, height: H } as never,
              gsapDir: path.resolve(__dirname, "../vendor/gsap"),
            } as never);
          } catch (e) {
            findings.push({ component: type, category: cat, theme: g.theme, type: "assemble_error", detail: String((e as Error)?.message).slice(0, 160) });
            continue;
          }
          const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cert-"));
          const htmlPath = path.join(dir, "scene.html");
          await fs.writeFile(htmlPath, html);
          try {
            // Two probe times: the transient-entrance filter needs a moment
            // where the text has fully arrived, or a masked entrance reads as
            // clipped forever (first sweep flagged half the caption family at
            // "0:1" mid-roll).
            const contrast = await measureTextContrast({ htmlPath, width: W, height: H, atTimes: [DUR * 0.5, DUR * 0.85] });
            for (const d of contrast) {
              findings.push({ component: type, category: cat, theme: g.theme, type: `contrast:${d.reason}`, detail: `"${d.text}" ${d.contrast}:1 (needs ${d.threshold}:1)` });
            }
            const layout = await measureLayout({ htmlPath, width: W, height: H, atTimes: [DUR * 0.7] });
            for (const d of layout) {
              if (d.type === "dead_frame") continue; // scene judgment, not component chrome
              findings.push({ component: type, category: cat, theme: g.theme, type: d.type, detail: d.detail.slice(0, 160) });
            }
          } catch (e) {
            findings.push({ component: type, category: cat, theme: g.theme, type: "probe_error", detail: String((e as Error)?.message).slice(0, 160) });
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          }
          const mine = findings.filter((x) => x.component === type && x.theme === g.theme);
          console.log(`[cert] ${cat}/${type} (${g.theme}): ${mine.length === 0 ? "clean" : mine.map((m) => m.type).join(", ")}`);
        }
      }
    }

    const outDir = path.resolve(__dirname, "../test-output");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, process.env.MP_CERT_REPORT || "certification-report.json"), JSON.stringify(findings, null, 2));
    const byComponent = new Map<string, number>();
    for (const f of findings) byComponent.set(`${f.category}/${f.component}`, (byComponent.get(`${f.category}/${f.component}`) || 0) + 1);
    console.log(`\n[cert] ${findings.length} finding(s) across ${byComponent.size} component(s):`);
    for (const [k, n] of [...byComponent.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

    expect(findings, `${findings.length} certification finding(s) -- see test-output/certification-report.json`).toEqual([]);
  }, 5_400_000);
});
