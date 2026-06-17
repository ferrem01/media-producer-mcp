/**
 * End-to-end: EXTRACT a brand logo from a live website, then prove it renders
 * in a short generated video. Exercises the logo-detection extractor (not an
 * uploaded logo) all the way through to a rendered frame.
 *
 *   1. extract_brand_from_website(getquotient.ai)  -> kit.logos[] populated
 *   2. generate(full, video)  -- a short logo-forward brand intro
 *   3. render(preview)
 *
 * Asserts: the extractor registered logo(s); the EXTRACTED logo file is
 * referenced in a rendered scene.html (so the renderer drew it); a valid MP4.
 * Frames are extracted so the logo is visible.
 *
 * Slow (live extraction + LLM + render). Run in the background.
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
const DATA_DIR = path.resolve(__dirname, "../test-output/logo-extract-video");
const FRAMES = "/tmp/logo-extract-video-frames";
const TENANT = "logovid";
const SITE = "https://getquotient.ai";
const LONG = 300_000;

function textOf(r: any): string {
  if (Array.isArray(r?.content)) return r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return JSON.stringify(r);
}
const J = (r: any) => { if (r?.isError) throw new Error("tool error: " + textOf(r).slice(0, 600)); return JSON.parse(textOf(r)); };

async function pollJob(c: Client, id: string, ms: number): Promise<any> {
  const s = Date.now(); let last = "";
  while (Date.now() - s < ms) {
    const job = J(await c.callTool({ name: "job", arguments: { action: "status", job_id: id } }));
    if (job.progress) { const t = `${job.progress.step} ${job.progress.percent}%`; if (t !== last) { console.log(`    ...${t}`); last = t; } }
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("poll timeout " + id);
}

const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (n: string, p: boolean, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`  [${p ? "PASS" : "FAIL"}] ${n}${d ? " -- " + d : ""}`); };

async function main() {
  console.log("=== Extract logo -> short video E2E ===\n");
  await fsp.rm(DATA_DIR, { recursive: true, force: true });
  await fsp.rm(FRAMES, { recursive: true, force: true });
  await fsp.mkdir(FRAMES, { recursive: true });

  const env: Record<string, string> = { ...process.env } as any;
  delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
  env.MP_DATA_DIR = DATA_DIR; env.MP_PORT = "0";
  const transport = new StdioClientTransport({ command: "node", args: [SERVER], env, stderr: "inherit" });
  const c = new Client({ name: "logo-extract-video", version: "1.0.0" }, { capabilities: {} });

  try {
    await c.connect(transport);

    // 1. Extract brand (logo) from the live site.
    console.log("-- 1. extract_brand_from_website --");
    const ext = J(await c.callTool({ name: "extract_brand_from_website", arguments: { tenant_id: TENANT, url: SITE, enhance: false } }, undefined, { timeout: LONG }));
    const kit = JSON.parse(await fsp.readFile(path.join(DATA_DIR, TENANT, "brand-kit", "brand-kit.json"), "utf-8"));
    const logos = kit.logos || [];
    check("extractor registered logo(s)", logos.length > 0, `${logos.length} logo(s): ${logos.map((l: any) => `${l.name}[${l.variant}/${l.theme}]`).join(", ")}`);
    check("logo candidates were found on the page", (ext.logo_candidates_found ?? 0) > 0, `${ext.logo_candidates_found} candidates`);
    const logoFiles = logos.map((l: any) => path.basename(l.url));

    // 2. Generate a short logo-forward brand intro.
    console.log("\n-- 2. generate(full, video) --");
    const gen = J(await c.callTool({
      name: "generate",
      arguments: {
        tenant_id: TENANT, mode: "full", target: "video",
        prompt: "A short ~8-second Quotient brand intro. Scene 1: a clean reveal of the Quotient brand LOGO IMAGE (use the brand logo from the kit, rendered as an <img>) centered on a brand-colored background. Scene 2: the tagline 'Your AI agent for creative work.' Use the Quotient brand colors and the logo image -- not a text wordmark.",
        voiceover: false, background_music: false,
        brief: { video_type: "brand", target_duration: 8 },
      },
    }));
    const gj = await pollJob(c, gen.job_id, 1_500_000);
    check("generate completed", gj.status === "completed", gj.error || gj.status);
    const pid = gj.projectId || gj.result?.project?.project_id;
    const projDir = path.join(DATA_DIR, TENANT, "projects", pid);

    // 3. Render.
    console.log("\n-- 3. render(preview) --");
    const ren = J(await c.callTool({ name: "render", arguments: { tenant_id: TENANT, project_id: pid, quality: "preview" } }));
    const rj = await pollJob(c, ren.job_id, 1_500_000);
    check("render completed", rj.status === "completed", rj.error || rj.status);
    const out = rj.outputPath || path.join(projDir, "output", "output.mp4");

    // PROOF: the EXTRACTED logo file is referenced in a rendered scene.html.
    const work = path.join(projDir, "_work");
    let logoScene: string | null = null;
    if (fs.existsSync(work)) {
      for (const d of fs.readdirSync(work).filter((x) => /^scene_\d+$/.test(x))) {
        const f = path.join(work, d, "scene.html");
        if (fs.existsSync(f)) {
          const html = fs.readFileSync(f, "utf-8");
          if (logoFiles.some((lf: string) => html.includes(lf))) { logoScene = d; break; }
        }
      }
    }
    check("extracted logo referenced in a rendered scene.html", !!logoScene, logoScene ? `${logoScene} draws ${logoFiles.find((lf: string) => fs.readFileSync(path.join(work, logoScene!, "scene.html"), "utf-8").includes(lf))}` : "logo extracted but NOT drawn in any scene");

    // Valid MP4 + frames.
    try {
      const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "default=nw=1", out]);
      const dur = parseFloat((stdout.match(/duration=([\d.]+)/) || [])[1] || "0");
      check("valid MP4 (h264)", /codec_name=h264/.test(stdout), `${dur.toFixed(1)}s`);
      const n = 6;
      for (let i = 0; i < n; i++) await exec("ffmpeg", ["-y", "-ss", String(Math.max(0.1, dur * (i + 0.5) / n)), "-i", out, "-frames:v", "1", path.join(FRAMES, `f${i}.png`)]);
      console.log(`\n   output: ${out}\n   frames: ${FRAMES}/f0..${n - 1}.png`);
    } catch (e: any) { check("valid MP4 (h264)", false, e.message); }

    const allPass = checks.every((c) => c.pass);
    console.log(`\n=== Extract-logo-to-video E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}) ===`);
    if (!allPass) process.exit(1);
  } finally {
    try { await c.close(); } catch { /* */ }
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
