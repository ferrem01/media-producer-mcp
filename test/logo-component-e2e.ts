/**
 * Tests the unified `logo` component (logo.dev) "in its entirety".
 *
 * Part 1 — API / nuance probe (fast, deterministic): build logo.dev URLs exactly
 *   the way the component does and fetch them, exercising every exposed nuance:
 *   dark theme, light theme, greyscale, and -- the important one -- fallback.
 *   A known domain returns a real logo; an UNKNOWN domain returns a monogram
 *   (200) when fallback=monogram, but 404 when fallback=404. This proves the
 *   fallback param is wired and prevents broken images in B2B logo walls.
 *
 * Part 2 — component in a video (slow): generate a short B2B video that uses the
 *   `logo` component three ways (a prominent hero logo, a "trusted by" ROW, an
 *   "integrations" GRID), render it, assert the rendered HTML pulls from
 *   img.logo.dev, and extract frames so the logos are visible.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "../dist/index.js");
const DATA_DIR = path.resolve(__dirname, "../test-output/logo-component");
const FRAMES = "/tmp/logo-component-frames";
const TENANT = "logocomp";
const TOKEN = process.env.MP_LOGODEV_TOKEN || "pk_B_cdrQLyTkSFPzSMm52goQ";

const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (n: string, p: boolean, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`  [${p ? "PASS" : "FAIL"}] ${n}${d ? " -- " + d : ""}`); };

// Mirror the component's URL construction.
function logoUrl(domain: string, opts: { theme?: string; greyscale?: boolean; fallback?: string; size?: number; format?: string } = {}): string {
  const size = opts.size ?? 128;
  const params = [`token=${encodeURIComponent(TOKEN)}`, `format=${opts.format ?? "png"}`, `size=${size * 2}`];
  if (opts.greyscale) params.push("greyscale=true");
  if (opts.theme && opts.theme !== "auto") params.push(`theme=${opts.theme}`);
  if (opts.fallback) params.push(`fallback=${opts.fallback}`);
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params.join("&")}`;
}
async function status(url: string): Promise<{ ok: boolean; code: number; type: string }> {
  try { const r = await fetch(url); return { ok: r.ok, code: r.status, type: r.headers.get("content-type") || "" }; }
  catch (e: any) { return { ok: false, code: 0, type: "ERR:" + e.message }; }
}

function textOf(r: any): string {
  if (Array.isArray(r?.content)) return r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return JSON.stringify(r);
}
const J = (r: any) => { if (r?.isError) throw new Error("tool error: " + textOf(r).slice(0, 600)); return JSON.parse(textOf(r)); };
async function pollJob(c: Client, id: string, ms: number): Promise<any> {
  const s = Date.now(); let last = "";
  while (Date.now() - s < ms) {
    const j = J(await c.callTool({ name: "job", arguments: { action: "status", job_id: id } }));
    if (j.progress) { const t = `${j.progress.step} ${j.progress.percent}%`; if (t !== last) { console.log(`    ...${t}`); last = t; } }
    if (j.status === "completed" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("poll timeout " + id);
}

async function main() {
  console.log("=== logo component (logo.dev) E2E ===\n");
  await fsp.rm(DATA_DIR, { recursive: true, force: true });
  await fsp.rm(FRAMES, { recursive: true, force: true });
  await fsp.mkdir(FRAMES, { recursive: true });

  // ── Part 1: API / nuance probe ──
  console.log("-- Part 1: logo.dev API nuances --");
  const known = "stripe.com";
  const unknown = "nope-" + Date.now() + "-notarealcompany.com";
  const dark = await status(logoUrl(known, { theme: "dark" }));
  check("known domain, dark theme -> image", dark.ok && /image\//.test(dark.type), `${dark.code} ${dark.type}`);
  const light = await status(logoUrl(known, { theme: "light" }));
  check("known domain, light theme -> image", light.ok && /image\//.test(light.type), `${light.code} ${light.type}`);
  const grey = await status(logoUrl(known, { theme: "dark", greyscale: true }));
  check("known domain, greyscale -> image", grey.ok && /image\//.test(grey.type), `${grey.code} ${grey.type}`);
  const mono = await status(logoUrl(unknown, { fallback: "monogram" }));
  check("UNKNOWN domain + fallback=monogram -> 200 (no broken image)", mono.ok, `${mono.code} ${mono.type}`);
  const no404 = await status(logoUrl(unknown, { fallback: "404" }));
  check("UNKNOWN domain + fallback=404 -> NOT 200 (proves fallback matters)", !no404.ok, `${no404.code}`);

  // ── Part 2: component rendered in a video ──
  const env: Record<string, string> = { ...process.env } as any;
  delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
  env.MP_DATA_DIR = DATA_DIR; env.MP_PORT = "0";
  const transport = new StdioClientTransport({ command: "node", args: [SERVER], env, stderr: "inherit" });
  const c = new Client({ name: "logo-component", version: "1.0.0" }, { capabilities: {} });
  try {
    await c.connect(transport);
    console.log("\n-- Part 2: generate(full, video) using the logo component --");
    const gen = J(await c.callTool({
      name: "generate",
      arguments: {
        tenant_id: TENANT, mode: "full", target: "video",
        prompt: "A short B2B SaaS video, dark theme. Use the `logo` component for all company logos. Scene 1: a single HERO logo -- one prominent, centered company logo (domain stripe.com, prominent). Scene 2: a 'Trusted by' ROW -- five company logos in a horizontal row: stripe.com, slack.com, notion.so, figma.com, linear.app. Scene 3: an 'Integrates with' GRID -- a heading above a grid of company logos: salesforce.com, hubspot.com, zapier.com, github.com. Every logo must use the logo component.",
        voiceover: false, background_music: false,
        brief: { video_type: "product_launch", target_duration: 14 },
      },
    }));
    const gj = await pollJob(c, gen.job_id, 1_800_000);
    check("generate completed", gj.status === "completed", gj.error || gj.status);
    const pid = gj.projectId || gj.result?.project?.project_id;
    const projDir = path.join(DATA_DIR, TENANT, "projects", pid);

    console.log("\n-- render(preview) --");
    const ren = J(await c.callTool({ name: "render", arguments: { tenant_id: TENANT, project_id: pid, quality: "preview" } }));
    const rj = await pollJob(c, ren.job_id, 1_800_000);
    check("render completed", rj.status === "completed", rj.error || rj.status);
    const out = rj.outputPath || path.join(projDir, "output", "output.mp4");

    // The rendered HTML must pull company logos from logo.dev.
    const work = path.join(projDir, "_work");
    let logoRefs = 0, fallbackRefs = 0;
    if (fs.existsSync(work)) {
      for (const d of fs.readdirSync(work).filter((x) => /^scene_\d+$/.test(x))) {
        const f = path.join(work, d, "scene.html");
        if (fs.existsSync(f)) {
          const html = fs.readFileSync(f, "utf-8");
          // Assert the logo.dev URL is baked into the <img src> (not just present
          // in an animation script that may never run) -- this is what makes the
          // logo actually load.
          logoRefs += (html.match(/<img[^>]*src="https:\/\/img\.logo\.dev/g) || []).length;
          fallbackRefs += (html.match(/fallback=monogram/g) || []).length;
        }
      }
    }
    check("logo.dev URLs baked into <img src> (logos will load)", logoRefs > 0, `${logoRefs} <img src=logo.dev> across scenes`);
    check("monogram fallback applied in rendered output", fallbackRefs > 0, `${fallbackRefs} fallback=monogram refs`);

    try {
      const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "default=nw=1", out]);
      const dur = parseFloat((stdout.match(/duration=([\d.]+)/) || [])[1] || "0");
      check("valid MP4 (h264)", /codec_name=h264/.test(stdout), `${dur.toFixed(1)}s`);
      const n = 6;
      for (let i = 0; i < n; i++) await exec("ffmpeg", ["-y", "-ss", String(Math.max(0.1, dur * (i + 0.5) / n)), "-i", out, "-frames:v", "1", path.join(FRAMES, `f${i}.png`)]);
      console.log(`\n   output: ${out}\n   frames: ${FRAMES}/f0..${n - 1}.png`);
    } catch (e: any) { check("valid MP4 (h264)", false, e.message); }

    const allPass = checks.every((c) => c.pass);
    console.log(`\n=== logo component E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}) ===`);
    if (!allPass) process.exit(1);
  } finally {
    try { await c.close(); } catch { /* */ }
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
