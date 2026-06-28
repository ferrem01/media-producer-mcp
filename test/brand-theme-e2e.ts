/**
 * Brand-adherence E2E: a LIGHT brand (Quotient) must render an on-brand LIGHT
 * video -- not the dark "default" that reads as generic AI output.
 *
 * Seeds Quotient's real (light) brand kit, generates + renders a short video,
 * and asserts the rendered frames are LIGHT (mean luminance well above the
 * dark/light split). Also asserts the correctness gate is brand-theme aware:
 * it flags `off_brand_theme` on a dark frame for a light brand, and passes a
 * light frame.
 *
 * Slow (LLM storyboard/codegen + render). Run in the background.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { critiqueCorrectness } from "../dist/llm/correctness-critique.js";
import { config } from "../dist/config.js";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "../dist/index.js");
const DATA_DIR = path.resolve(__dirname, "../test-output/brand-theme");
const FRAMES = "/tmp/brand-theme-frames";
const TENANT = "quotient";

// Quotient's real (extracted) brand: LIGHT -- white background, dark ink text.
const BRAND_KIT = {
  colors: { primary: "#393bf5", secondary: "#59c2d4", accent: "#17171c", background: "#ffffff", surface: "#dfdfed", text: "#17171c", text_muted: "#8f8f9f" },
  fonts: [{ family: "ppNeueMontreal", source: "google", weights: [400, 600, 800] }, { family: "Inter", source: "google", weights: [400, 600] }],
  style: { border_radius: "12px", motion: "cinematic" },
};

function textOf(r: any): string {
  if (Array.isArray(r?.content)) return r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return JSON.stringify(r);
}
const J = (r: any) => { if (r?.isError) throw new Error("tool error: " + textOf(r).slice(0, 500)); return JSON.parse(textOf(r)); };
async function pollJob(c: Client, id: string, ms: number): Promise<any> {
  const s = Date.now();
  while (Date.now() - s < ms) {
    const j = J(await c.callTool({ name: "job", arguments: { action: "status", job_id: id } }));
    if (j.status === "completed" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("poll timeout " + id);
}
async function meanLuminance(framePath: string): Promise<number> {
  const { stderr } = await exec("ffmpeg", ["-i", framePath, "-vf", "signalstats,metadata=print", "-frames:v", "1", "-f", "null", "-"], { maxBuffer: 1e8 });
  const m = (stderr || "").match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (n: string, p: boolean, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`  [${p ? "PASS" : "FAIL"}] ${n}${d ? " -- " + d : ""}`); };

async function main() {
  console.log("=== Brand-adherence (light brand -> light video) E2E ===\n");
  await fsp.rm(DATA_DIR, { recursive: true, force: true });
  await fsp.rm(FRAMES, { recursive: true, force: true });
  await fsp.mkdir(FRAMES, { recursive: true });

  // Seed Quotient's light brand kit.
  await fsp.mkdir(path.join(DATA_DIR, TENANT, "brand-kit"), { recursive: true });
  await fsp.writeFile(path.join(DATA_DIR, TENANT, "brand-kit", "brand-kit.json"), JSON.stringify(BRAND_KIT, null, 2));

  const env: Record<string, string> = { ...process.env } as any;
  delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
  env.MP_DATA_DIR = DATA_DIR; env.MP_PORT = "0";
  const transport = new StdioClientTransport({ command: "node", args: [SERVER], env, stderr: "inherit" });
  const c = new Client({ name: "brand-theme", version: "1.0.0" }, { capabilities: {} });

  try {
    await c.connect(transport);

    // Generate + render a short video on the light brand.
    console.log("-- generate(full) + render on Quotient's LIGHT brand --");
    const gen = J(await c.callTool({ name: "generate", arguments: { tenant_id: TENANT, mode: "full", target: "video", prompt: "A 15-second 3-scene product video for Quotient, an AI demand-gen platform: hero title, key stats, closing CTA.", voiceover: false, brief: { video_type: "product_launch", target_duration: 15 } } }));
    const gj = await pollJob(c, gen.job_id, 1_800_000);
    check("generate completed", gj.status === "completed", gj.error || gj.status);
    const pid = gj.projectId || gj.result?.project?.project_id;
    const projDir = path.join(DATA_DIR, TENANT, "projects", pid);

    const ren = J(await c.callTool({ name: "render", arguments: { tenant_id: TENANT, project_id: pid, quality: "preview" } }));
    const rj = await pollJob(c, ren.job_id, 1_800_000);
    check("render completed", rj.status === "completed", rj.error || rj.status);
    const out = rj.outputPath || path.join(projDir, "output", "output.mp4");

    // BRAND ADHERENCE: every frame must read LIGHT (dark videos sit ~20-40,
    // light videos ~150-220 -- assert avg high and no frame slips dark).
    const dur = parseFloat((await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", out])).stdout) || 15;
    const lums: number[] = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const fp = path.join(FRAMES, `f${i}.png`);
      await exec("ffmpeg", ["-y", "-ss", String(Math.max(0.1, dur * (i + 0.5) / n)), "-i", out, "-frames:v", "1", fp]);
      lums.push(await meanLuminance(fp));
    }
    const avg = lums.reduce((a, b) => a + b, 0) / lums.length;
    const min = Math.min(...lums);
    console.log(`   frame luminance: [${lums.map((l) => l.toFixed(0)).join(", ")}] avg=${avg.toFixed(0)} min=${min.toFixed(0)}`);
    check("video renders ON-BRAND LIGHT (avg luminance > 140)", avg > 140, `avg=${avg.toFixed(0)}`);
    check("no scene slips dark (every frame luminance > 100)", min > 100, `min=${min.toFixed(0)}`);

    // CORRECTNESS GATE is brand-theme aware: dark frame on a light brand -> off_brand_theme.
    const darkFixture = path.join(FRAMES, "_dark.png");
    await exec("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=#0d0d1a:s=1280x720", "-frames:v", "1", darkFixture]);
    const b64 = (p: string) => fs.readFileSync(p).toString("base64");
    const darkRes = await critiqueCorrectness({ finalFrameBase64: b64(darkFixture), briefText: "A scene for Quotient (a LIGHT brand).", brandTheme: "light", llmConfig: config.critiqueLlm });
    check("gate flags off_brand_theme on a DARK scene for a light brand", darkRes.defects.some((d) => d.type === "off_brand_theme"), darkRes.defects.map((d) => d.type).join(",") || "none");
    const lightRes = await critiqueCorrectness({ finalFrameBase64: b64(path.join(FRAMES, "f1.png")), briefText: "A scene for Quotient (a LIGHT brand).", brandTheme: "light", llmConfig: config.critiqueLlm });
    check("gate does NOT flag off_brand_theme on a LIGHT scene", !lightRes.defects.some((d) => d.type === "off_brand_theme"), lightRes.defects.map((d) => d.type).join(",") || "clean");

    console.log(`\n   output: ${out}\n   frames: ${FRAMES}/`);
    const allPass = checks.every((c) => c.pass);
    console.log(`\n=== Brand-adherence E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}) ===`);
    if (!allPass) process.exit(1);
  } finally {
    try { await c.close(); } catch { /* */ }
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
