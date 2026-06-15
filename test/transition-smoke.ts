/**
 * Multi-scene transition render smoke test.
 *
 * Renders a 2-scene video so the inter-scene transition path runs (extract
 * last frame of scene A + first frame of scene B, render the transition, concat
 * scene + transition + scene). Deterministic, no LLM calls -- fixtures are
 * hand-crafted codegen scenes on disk.
 *
 * Runs at 15fps ON PURPOSE: extractLastFrame used to seek to a fixed
 * (duration - 0.05s) offset, which lands past the final frame at low fps and
 * produced an empty frameA.png -> the transition step failed with
 * "ENOENT ... transition_0_1/frameA.png". This test pins that the render
 * completes regardless of fps and that the output contains both scenes plus a
 * transition (total duration noticeably longer than a single scene).
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
const DATA_DIR = path.resolve(__dirname, "../test-output/transition-smoke");
const TENANT = "transition-smoke";
const PROJECT_ID = "proj_transition";
const SCENE_SECONDS = 2;
const TRANSITION_SECONDS = 0.5;

function textOf(result: any): string {
  if (Array.isArray(result?.content)) {
    return result.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  }
  return JSON.stringify(result);
}
function parse(result: any): any {
  try { return JSON.parse(textOf(result)); } catch { return { _raw: textOf(result) }; }
}

async function pollJob(client: Client, jobId: string, timeoutMs = 600_000): Promise<any> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const res = await client.callTool({ name: "job", arguments: { action: "status", job_id: jobId } });
    const job = parse(res);
    if (job.progress) {
      const tag = `${job.progress.step} ${job.progress.percent}%`;
      if (tag !== last) { console.log(`  ...${tag}`); last = tag; }
    }
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`Polling timed out after ${timeoutMs}ms (job ${jobId})`);
}

const BRAND_KIT = {
  colors: {
    primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA",
    background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8",
  },
  fonts: [{ family: "Inter", source: "google", weights: [400, 600, 800] }],
  style: { border_radius: "12px", motion: "cinematic" },
};

function sceneComponent(label: string, bg: string): string {
  return `<template><div class="s">${label}</div></template>
<style scoped>.s{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${bg};color:#fff;font-size:80px;font-family:Inter,sans-serif;}</style>
<script>function createTimeline(el, data, ctx){var tl=gsap.timeline();tl.from(el,{autoAlpha:0,duration:0.3},0);return tl;}</script>`;
}

async function setupFixtures(): Promise<void> {
  const projDir = path.join(DATA_DIR, TENANT, "projects", PROJECT_ID);
  const compDir = path.join(projDir, "components");
  await fs.rm(projDir, { recursive: true, force: true });
  await fs.mkdir(compDir, { recursive: true });

  await fs.writeFile(path.join(compDir, "scene_one.component.html"), sceneComponent("One", "#1e293b"));
  await fs.writeFile(path.join(compDir, "scene_two.component.html"), sceneComponent("Two", "#3b1e52"));

  const project = {
    project_id: PROJECT_ID,
    tenant_id: TENANT,
    name: "Transition Smoke Test",
    format: "video",
    status: "generated",
    // 15fps on purpose -- exercises the low-fps last-frame extraction.
    canvas: { width: 640, height: 360, preset: "landscape", fps: 15, background: "#000000" },
    brand_kit: BRAND_KIT,
    scenes: [
      { id: "scene_a", label: "One", duration_seconds: SCENE_SECONDS,
        components: [{ id: "comp_0", type: "scene_one", data: {}, z_index: 10 }] },
      { id: "scene_b", label: "Two", duration_seconds: SCENE_SECONDS,
        transition_in: { type: "crossfade", duration_seconds: TRANSITION_SECONDS },
        components: [{ id: "comp_0", type: "scene_two", data: {}, z_index: 10 }] },
    ],
  };
  await fs.writeFile(path.join(projDir, "project.json"), JSON.stringify(project, null, 2));
}

async function main() {
  console.log("=== Transition Smoke Test ===\n");
  await setupFixtures();

  const childEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  delete childEnv.AUTH_TOKENS;
  delete childEnv.SESSION_SECRET;
  childEnv.MP_DATA_DIR = DATA_DIR;
  childEnv.MP_PORT = "0";

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    env: childEnv,
    stderr: "pipe",
  });
  let stderrBuf = "";
  const client = new Client({ name: "transition-smoke", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    transport.stderr?.on("data", (c: Buffer) => { stderrBuf += c.toString(); });
    console.log("Connected.\n");

    console.log("-- render (2 scenes @ 15fps, crossfade) --");
    const rendered = await client.callTool({
      name: "render",
      arguments: { tenant_id: TENANT, project_id: PROJECT_ID, quality: "preview" },
    });
    const queued = parse(rendered);
    console.log("  ", JSON.stringify(queued));
    if (!queued.job_id) throw new Error("No job_id from render: " + JSON.stringify(queued));

    console.log(`\n-- polling render job ${queued.job_id} --`);
    const job = await pollJob(client, queued.job_id);
    console.log("  status:", job.status);
    if (job.error) console.log("  error:", job.error);

    // ── Assertions ──
    const emptyFrame = /Output file is empty/.test(stderrBuf);
    const enoent = /ENOENT[^\n]*frameA\.png/.test(stderrBuf);

    let duration = 0;
    let mp4Ok = false;
    const outPath = job.outputPath || path.join(DATA_DIR, TENANT, "projects", PROJECT_ID, "output", "output.mp4");
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
        "-of", "default=noprint_wrappers=1", outPath,
      ]);
      duration = parseFloat((stdout.match(/duration=([\d.]+)/) || [])[1] || "0");
      mp4Ok = /codec_name=h264/.test(stdout);
      console.log(stdout.split("\n").map((l) => "    " + l).join("\n"));
    } catch (e: any) {
      console.log(`  ffprobe failed: ${e.message}`);
    }

    // Expect both scenes + transition: 2 + 2 + 0.5 = 4.5s. Allow generous slack.
    const expected = SCENE_SECONDS * 2 + TRANSITION_SECONDS;
    const durationOk = duration >= expected - 0.6;

    console.log("\n-- assertions --");
    console.log(`  render status: ${job.status}`);
    console.log(`  no 'Output file is empty': ${!emptyFrame}`);
    console.log(`  no frameA.png ENOENT:      ${!enoent}`);
    console.log(`  mp4 valid (h264):          ${mp4Ok}`);
    console.log(`  duration ${duration.toFixed(2)}s >= ${(expected - 0.6).toFixed(2)}s (2 scenes + transition): ${durationOk}`);

    const pass = job.status === "completed" && !emptyFrame && !enoent && mp4Ok && durationOk;
    console.log(`\n=== Transition Smoke Test: ${pass ? "PASS" : "FAIL"} ===`);
    if (!pass) process.exit(1);
  } catch (err: any) {
    console.error("Test error:", err.message || err);
    console.error("--- server stderr tail ---\n" + stderrBuf.slice(-2000));
    process.exit(1);
  } finally {
    try { await client.close(); } catch { /* server may have exited */ }
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
