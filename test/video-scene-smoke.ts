/**
 * Video-in-scene render smoke test.
 *
 * Verifies that a codegen scene containing a video renders correctly through
 * the refactored scene-worker / codegen-assembler path, in two authoring
 * styles:
 *   1. a raw <video> element written directly in the scene HTML
 *   2. a <component type="video"> tag (library video component)
 *
 * The video is referenced by a REALISTIC relative asset URL
 * (/assets/{tenant}/projects/{proj}/assets/clip.mp4), NOT a file:// URL --
 * because file:// is the one format the renderer's resolveVideoPath() always
 * handled, so a file:// test would pass even while real (normalized) URLs fail.
 *
 * Each variant is a SINGLE-scene project (no inter-scene transition), so the
 * test isolates video-asset resolution from the separate multi-scene
 * transition path.
 *
 * Failure signature of the bug this guards against: the renderer logs
 * "Warning: Video file not found: ..." and silently drops the video.
 *
 * Fixtures are hand-crafted on disk so the test is deterministic (no LLM calls).
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
const DATA_DIR = path.resolve(__dirname, "../test-output/video-smoke");
const SRC_MP4 = path.resolve(__dirname, "../public/poc-connector.mp4");
const TENANT = "video-smoke";

interface Variant {
  projectId: string;
  componentType: string;
  componentHtml: (videoUrl: string) => string;
}

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
      if (tag !== last) { console.log(`    ...${tag}`); last = tag; }
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

const VARIANTS: Variant[] = [
  {
    projectId: "proj_video_raw",
    componentType: "scene_video_raw",
    componentHtml: (videoUrl) =>
`<template>
  <div class="vid-raw">
    <video src="${videoUrl}" muted playsinline></video>
  </div>
</template>
<style scoped>
  .vid-raw { position: relative; width: 100%; height: 100%; background: #101820; }
  .vid-raw video { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
<script>
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  tl.from(el, { autoAlpha: 0, duration: 0.3 }, 0);
  return tl;
}
</script>`,
  },
  {
    projectId: "proj_video_comp",
    componentType: "scene_video_comp",
    componentHtml: (videoUrl) =>
`<template>
  <div class="vid-comp">
    <component type="video" data='{"src":"${videoUrl}","object_fit":"cover"}' />
  </div>
</template>
<style scoped>
  .vid-comp { position: relative; width: 100%; height: 100%; background: #101820; }
</style>
<script>
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  tl.add(ctx.getComponentTimeline('comp_0'), 0);
  return tl;
}
</script>`,
  },
];

async function setupVariant(v: Variant): Promise<string> {
  const projDir = path.join(DATA_DIR, TENANT, "projects", v.projectId);
  const compDir = path.join(projDir, "components");
  const assetsDir = path.join(projDir, "assets");
  await fs.rm(projDir, { recursive: true, force: true });
  await fs.mkdir(compDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.copyFile(SRC_MP4, path.join(assetsDir, "clip.mp4"));

  // Realistic normalized asset URL (relative, host-stripped).
  const videoUrl = `/assets/${TENANT}/projects/${v.projectId}/assets/clip.mp4`;
  await fs.writeFile(path.join(compDir, `${v.componentType}.component.html`), v.componentHtml(videoUrl));

  const project = {
    project_id: v.projectId,
    tenant_id: TENANT,
    name: `Video Scene Smoke (${v.componentType})`,
    format: "video",
    status: "generated",
    canvas: { width: 640, height: 360, preset: "landscape", fps: 15, background: "#000000" },
    brand_kit: BRAND_KIT,
    scenes: [
      { id: "scene_main", label: v.componentType, duration_seconds: 2,
        components: [{ id: "comp_0", type: v.componentType, data: {}, z_index: 10 }] },
    ],
  };
  await fs.writeFile(path.join(projDir, "project.json"), JSON.stringify(project, null, 2));
  return videoUrl;
}

async function main() {
  console.log("=== Video Scene Smoke Test ===\n");

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
  const client = new Client({ name: "video-scene-smoke", version: "1.0.0" }, { capabilities: {} });

  const results: { variant: string; pass: boolean; reason: string }[] = [];

  try {
    await client.connect(transport);
    transport.stderr?.on("data", (c: Buffer) => { stderrBuf += c.toString(); });
    console.log("Connected.\n");

    for (const v of VARIANTS) {
      console.log(`-- variant: ${v.componentType} --`);
      const videoUrl = await setupVariant(v);
      console.log(`  asset URL: ${videoUrl}`);
      const before = stderrBuf.length;

      const rendered = await client.callTool({
        name: "render",
        arguments: { tenant_id: TENANT, project_id: v.projectId, quality: "preview" },
      });
      const queued = parse(rendered);
      if (!queued.job_id) { results.push({ variant: v.componentType, pass: false, reason: "no job_id: " + JSON.stringify(queued) }); continue; }

      const job = await pollJob(client, queued.job_id);
      const slice = stderrBuf.slice(before);
      const notFound = (slice.match(/Video file not found: [^\n]+/g) || []);

      let mp4Ok = false;
      const outPath = job.outputPath || path.join(DATA_DIR, TENANT, "projects", v.projectId, "output", "output.mp4");
      try {
        const { stdout } = await execFileAsync("ffprobe", [
          "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
          "-of", "default=noprint_wrappers=1", outPath,
        ]);
        mp4Ok = /codec_name=h264/.test(stdout) || /duration=/.test(stdout);
      } catch { /* mp4Ok stays false */ }

      const pass = job.status === "completed" && notFound.length === 0 && mp4Ok;
      const reason = pass
        ? `ok (status=${job.status}, mp4Ok=${mp4Ok})`
        : `status=${job.status}, videoNotFound=${notFound.length}, mp4Ok=${mp4Ok}` +
          (job.error ? `, error=${job.error}` : "") +
          (notFound.length ? `\n      ${notFound.join("\n      ")}` : "");
      console.log(`  -> ${pass ? "PASS" : "FAIL"}: ${reason}\n`);
      results.push({ variant: v.componentType, pass, reason });
    }

    const allPass = results.length === VARIANTS.length && results.every((r) => r.pass);
    console.log("-- summary --");
    for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.variant}`);
    console.log(`\n=== Video Scene Smoke Test: ${allPass ? "PASS" : "FAIL"} ===`);
    if (!allPass) process.exit(1);
  } catch (err: any) {
    console.error("Test error:", err.message || err);
    console.error("--- server stderr tail ---\n" + stderrBuf.slice(-2000));
    process.exit(1);
  } finally {
    try { await client.close(); } catch { /* server may have exited */ }
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
