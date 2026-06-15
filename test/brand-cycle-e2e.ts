/**
 * Full-cycle brand → generate → render end-to-end test (drives the live MCP server).
 *
 * Realistic flow, all through MCP tool calls:
 *   1. extract_brand_from_website(cushion.so, enhance) -> colors/fonts/guidelines
 *   2. upload(brand, logo)  + brand(logo=...)          -> register Cushion's logo
 *   3. upload(brand, background)                        -> Cushion hero image asset
 *   4. generate(mode="full", target="video")           -> plan + build scenes  (async job)
 *   5. render(quality="preview")                        -> MP4                  (async job)
 *
 * Asserts the brand kit actually picked up Cushion's design (a design_system was
 * extracted, a logo + background asset are registered) and that the generated
 * project carries that brand kit through to a valid rendered MP4. The "does it
 * LOOK like Cushion" judgement is left to the extracted frames (printed paths).
 *
 * Uses the network (cushion.so) and the LLM (Anthropic plan/codegen, OpenAI TTS,
 * Jamendo music). Slow -- run in the background.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../dist/index.js");
const DATA_DIR = path.resolve(__dirname, "../test-output/brand-cycle");
const TENANT = "cushion";
const SITE = "https://cushion.so";
const LOGO_URL = "https://cushion.so/favicon.svg";
const HERO_URL = "https://cushion.so/og-image.jpg";
const FRAMES_OUT = "/tmp/brand-cycle-frames";

const LONG = 300_000; // timeout for synchronous LLM/network tool calls

function textOf(result: any): string {
  if (Array.isArray(result?.content)) {
    return result.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  }
  return JSON.stringify(result);
}
function parse(result: any): any {
  try { return JSON.parse(textOf(result)); } catch { return { _raw: textOf(result) }; }
}

async function pollJob(client: Client, jobId: string, timeoutMs: number): Promise<any> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const res = await client.callTool({ name: "job", arguments: { action: "status", job_id: jobId } });
    const job = parse(res);
    if (job.progress) {
      const tag = `${job.progress.step} ${job.progress.percent}%`;
      if (tag !== last) { console.log(`    ...${tag}`); last = tag; }
    }
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 4_000));
  }
  throw new Error(`Polling timed out after ${timeoutMs}ms (job ${jobId})`);
}

const checks: { name: string; pass: boolean; detail: string }[] = [];
function check(name: string, pass: boolean, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? " -- " + detail : ""}`);
}

async function main() {
  console.log("=== Brand Cycle E2E (Cushion) ===\n");
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(FRAMES_OUT, { recursive: true });

  const childEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  delete childEnv.AUTH_TOKENS;
  delete childEnv.SESSION_SECRET;
  childEnv.MP_DATA_DIR = DATA_DIR;
  childEnv.MP_PORT = "0";

  const transport = new StdioClientTransport({ command: "node", args: [SERVER_ENTRY], env: childEnv, stderr: "pipe" });
  let stderrBuf = "";
  const client = new Client({ name: "brand-cycle-e2e", version: "1.0.0" }, { capabilities: {} });

  const brandKitPath = path.join(DATA_DIR, TENANT, "brand-kit", "brand-kit.json");
  const loadKit = async () => { try { return JSON.parse(await fs.readFile(brandKitPath, "utf-8")); } catch { return null; } };

  try {
    await client.connect(transport);
    transport.stderr?.on("data", (c: Buffer) => { stderrBuf += c.toString(); });
    console.log("Connected.\n");

    // 1. Extract brand from the live site (colors/fonts/guidelines).
    console.log("-- 1. extract_brand_from_website --");
    const ext = parse(await client.callTool(
      { name: "extract_brand_from_website", arguments: { tenant_id: TENANT, url: SITE, enhance: true } },
      undefined, { timeout: LONG },
    ));
    console.log("   extract keys:", Object.keys(ext).join(", "));
    const kitAfterExtract = await loadKit();
    check("brand kit written", !!kitAfterExtract);
    check("design_system extracted", !!kitAfterExtract?.design_system,
      kitAfterExtract?.design_system ? "present" : "missing");
    const primary = kitAfterExtract?.colors?.primary;
    check("colors extracted (not default purple)", !!primary && primary !== "#5B21B6", `primary=${primary}`);

    // 2. Upload + register Cushion's logo.
    console.log("\n-- 2. upload logo + register --");
    const logoUp = parse(await client.callTool(
      { name: "upload", arguments: { tenant_id: TENANT, target: "brand", asset_type: "logo", url: LOGO_URL, name: "cushion-logo" } },
      undefined, { timeout: LONG },
    ));
    console.log("   logo url:", logoUp.url);
    if (logoUp.url) {
      await client.callTool({ name: "brand", arguments: { tenant_id: TENANT, logo: { url: logoUp.url } } });
    }

    // 3. Upload Cushion hero image as a background asset (auto-registers).
    console.log("\n-- 3. upload background hero image --");
    const bgUp = parse(await client.callTool(
      { name: "upload", arguments: { tenant_id: TENANT, target: "brand", asset_type: "background", url: HERO_URL, name: "cushion-hero" } },
      undefined, { timeout: LONG },
    ));
    console.log("   background url:", bgUp.url);

    const kit = await loadKit();
    check("logo registered", !!(kit?.logo?.url || kit?.logos?.length), kit?.logo?.url || "");
    const bgAsset = (kit?.assets || []).find((a: any) => a.type === "background");
    check("background asset registered", !!bgAsset, bgAsset?.url || "");

    // 4. generate(full): plan + build scenes (async job).
    console.log("\n-- 4. generate(mode=full, target=video) --");
    const gen = parse(await client.callTool({
      name: "generate",
      arguments: {
        tenant_id: TENANT,
        mode: "full",
        target: "video",
        prompt: "A punchy 18-second brand promo for Cushion, the all-in-one business management app for freelancers and creative studios. Show how it brings invoicing, scheduling, time-tracking, and cash-flow forecasting into one calm, confident workspace. Use the brand colors, fonts, logo, and hero imagery.",
        voiceover: true,
        background_music: true,
        brief: { video_type: "promo", target_duration: 18 },
      },
    }));
    console.log("   ", JSON.stringify(gen));
    if (!gen.job_id) throw new Error("generate returned no job_id: " + JSON.stringify(gen));
    const genJob = await pollJob(client, gen.job_id, 1_500_000);
    check("generate completed", genJob.status === "completed", genJob.error || genJob.status);
    const projectId = genJob.projectId || genJob.result?.project?.project_id || genJob.result?.projectId;
    check("project id returned", !!projectId, projectId || "");
    if (!projectId) throw new Error("no project id from generate");

    // Inspect the generated project's brand kit.
    const projPath = path.join(DATA_DIR, TENANT, "projects", projectId, "project.json");
    const project = JSON.parse(await fs.readFile(projPath, "utf-8"));
    check("project uses Cushion primary color", project?.brand_kit?.colors?.primary === primary,
      `${project?.brand_kit?.colors?.primary}`);
    check("project carries logo", !!(project?.brand_kit?.logo?.url || project?.brand_kit?.logos?.length));
    console.log(`   scenes: ${(project.scenes || []).length}`);

    // 5. render(preview) -> MP4 (async job).
    console.log("\n-- 5. render(quality=preview) --");
    const ren = parse(await client.callTool({
      name: "render",
      arguments: { tenant_id: TENANT, project_id: projectId, quality: "preview" },
    }));
    console.log("   ", JSON.stringify(ren));
    if (!ren.job_id) throw new Error("render returned no job_id: " + JSON.stringify(ren));
    const renJob = await pollJob(client, ren.job_id, 1_500_000);
    check("render completed", renJob.status === "completed", renJob.error || renJob.status);

    const outPath = renJob.outputPath || path.join(DATA_DIR, TENANT, "projects", projectId, "output", "output.mp4");
    let duration = 0;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
        "-of", "default=noprint_wrappers=1", outPath,
      ]);
      duration = parseFloat((stdout.match(/duration=([\d.]+)/) || [])[1] || "0");
      check("valid MP4 (h264)", /codec_name=h264/.test(stdout), `${duration.toFixed(1)}s`);
      console.log(stdout.split("\n").map((l) => "    " + l).join("\n"));
    } catch (e: any) {
      check("valid MP4 (h264)", false, e.message);
    }

    // Extract frames for visual "looks like Cushion" judgement.
    if (duration > 0) {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t = Math.max(0.1, (duration * (i + 0.5)) / n);
        const fp = path.join(FRAMES_OUT, `frame_${i}.png`);
        try {
          await execFileAsync("ffmpeg", ["-y", "-ss", String(t), "-i", outPath, "-frames:v", "1", fp]);
        } catch { /* skip */ }
      }
      console.log(`\n   frames written to ${FRAMES_OUT}/`);
    }

    const allPass = checks.every((c) => c.pass);
    console.log(`\n=== Brand Cycle E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter(c => c.pass).length}/${checks.length}) ===`);
    console.log(`   output: ${outPath}`);
    if (!allPass) process.exit(1);
  } catch (err: any) {
    console.error("Test error:", err.message || err);
    console.error("--- server stderr tail ---\n" + stderrBuf.slice(-3000));
    process.exit(1);
  } finally {
    try { await client.close(); } catch { /* server may have exited */ }
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
