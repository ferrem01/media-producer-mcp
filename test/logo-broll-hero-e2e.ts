/**
 * End-to-end proof that a LOGO actually lands in a rendered video, alongside
 * B-ROLL (moving stock footage) and a HERO IMAGE (intentional still).
 *
 * Flow (all through MCP tool calls):
 *   1. upload(brand, logo)  -- register a deterministic neon-green "QTEST" logo
 *      (a local PNG, passed as a data: URL so there's no network flakiness).
 *   2. generate(full, video) -- a brand film whose prompt asks for an energetic
 *      MOVING opener (-> b-roll), a quiet STILL beat (-> hero_image), and a bold
 *      LOGO reveal (-> the QTEST logo drawn into a scene).
 *   3. render(preview)       -- MP4.
 *
 * Then it PROVES, not claims:
 *   - LOGO:  the final assembled HTML (_work/scene_N/scene.html) references the
 *            logo file -> the renderer actually drew it. Frames are extracted
 *            from that scene so you can SEE the logo.
 *   - BROLL: a scene carries background_video and a clip exists in stock/.
 *   - HERO:  a generated assets/hero_scene_*.png exists.
 *
 * Slow (LLM plan + codegen + image gen + Pexels + render). Run in the background.
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
const DATA_DIR = path.resolve(__dirname, "../test-output/logo-broll-hero");
const LOGO_FIXTURE = path.resolve(__dirname, "fixtures/test-logo.png");
const FRAMES_OUT = "/tmp/logo-broll-hero-frames";
const TENANT = "qtest";
const LONG = 300_000;

function textOf(r: any): string {
  if (Array.isArray(r?.content)) return r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return JSON.stringify(r);
}
const parse = (r: any) => { try { return JSON.parse(textOf(r)); } catch { return { _raw: textOf(r) }; } };

async function pollJob(client: Client, jobId: string, timeoutMs: number): Promise<any> {
  const start = Date.now(); let last = "";
  while (Date.now() - start < timeoutMs) {
    const job = parse(await client.callTool({ name: "job", arguments: { action: "status", job_id: jobId } }));
    if (job.progress) { const tag = `${job.progress.step} ${job.progress.percent}%`; if (tag !== last) { console.log(`    ...${tag}`); last = tag; } }
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 4_000));
  }
  throw new Error(`Polling timed out after ${timeoutMs}ms (job ${jobId})`);
}

const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => { checks.push({ name, pass, detail }); console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? " -- " + detail : ""}`); };

async function main() {
  console.log("=== Logo + B-roll + Hero E2E ===\n");
  await fsp.rm(DATA_DIR, { recursive: true, force: true });
  await fsp.rm(FRAMES_OUT, { recursive: true, force: true });
  await fsp.mkdir(FRAMES_OUT, { recursive: true });

  const env: Record<string, string> = { ...process.env } as any;
  delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
  env.MP_DATA_DIR = DATA_DIR; env.MP_PORT = "0";

  const transport = new StdioClientTransport({ command: "node", args: [SERVER], env, stderr: "pipe" });
  let stderrBuf = "";
  const client = new Client({ name: "logo-broll-hero", version: "1.0.0" }, { capabilities: {} });
  const kitPath = path.join(DATA_DIR, TENANT, "brand-kit", "brand-kit.json");
  const loadKit = async () => { try { return JSON.parse(await fsp.readFile(kitPath, "utf-8")); } catch { return null; } };

  try {
    await client.connect(transport);
    transport.stderr?.on("data", (c: Buffer) => { stderrBuf += c.toString(); });

    // 1. Register the logo (data: URL -> no network).
    console.log("-- 1. upload + register QTEST logo --");
    const b64 = (await fsp.readFile(LOGO_FIXTURE)).toString("base64");
    const dataUrl = `data:image/png;base64,${b64}`;
    const up = parse(await client.callTool(
      { name: "upload", arguments: { tenant_id: TENANT, target: "brand", asset_type: "logo", url: dataUrl, name: "qtest-logo" } },
      undefined, { timeout: LONG }));
    console.log("   logo served url:", up.url);
    const kit = await loadKit();
    const logoEntry = (kit?.logos || []).find((l: any) => /qtest-logo/.test(l.url || ""));
    check("logo registered in kit.logos[]", !!logoEntry, logoEntry?.url || JSON.stringify(kit?.logos));
    const logoFile = logoEntry?.url ? path.basename(logoEntry.url) : "qtest-logo.png";

    // 2. generate(full): ask for moving opener + still beat + logo reveal.
    console.log("\n-- 2. generate(full, video) --");
    const gen = parse(await client.callTool({
      name: "generate",
      arguments: {
        tenant_id: TENANT,
        mode: "full",
        target: "video",
        prompt:
          "A cinematic 20-second brand film for QTEST. OPEN on an energetic, MOVING real-world establishing shot (waves, a moving camera, kinetic energy). PARTWAY THROUGH, include one quiet, STILL, contemplative beat. END on a bold, full-screen reveal of the QTEST brand LOGO with the tagline 'Proof, not promises.' Use the brand logo on the closing scene.",
        voiceover: false,
        background_music: false,
        brief: { video_type: "brand", target_duration: 20 },
      },
    }));
    if (!gen.job_id) throw new Error("generate returned no job_id: " + JSON.stringify(gen));
    const genJob = await pollJob(client, gen.job_id, 1_500_000);
    check("generate completed", genJob.status === "completed", genJob.error || genJob.status);
    const projectId = genJob.projectId || genJob.result?.project?.project_id;
    if (!projectId) throw new Error("no project id from generate");
    const projDir = path.join(DATA_DIR, TENANT, "projects", projectId);
    const project = JSON.parse(await fsp.readFile(path.join(projDir, "project.json"), "utf-8"));
    console.log(`   project ${projectId}: ${(project.scenes || []).length} scenes`);
    check("project carries logo in brand kit", !!(project?.brand_kit?.logos?.length), `${project?.brand_kit?.logos?.length || 0} logo(s)`);

    // 3. render(preview).
    console.log("\n-- 3. render(preview) --");
    const ren = parse(await client.callTool({ name: "render", arguments: { tenant_id: TENANT, project_id: projectId, quality: "preview" } }));
    if (!ren.job_id) throw new Error("render returned no job_id: " + JSON.stringify(ren));
    const renJob = await pollJob(client, ren.job_id, 1_500_000);
    check("render completed", renJob.status === "completed", renJob.error || renJob.status);
    const outPath = renJob.outputPath || path.join(projDir, "output", "output.mp4");

    // ── PROOF: LOGO is in the rendered HTML ──
    console.log("\n-- proof: logo in rendered HTML --");
    const workDir = path.join(projDir, "_work");
    const sceneDirs = fs.existsSync(workDir) ? fs.readdirSync(workDir).filter((d) => /^scene_\d+$/.test(d)).sort((a, b) => +a.split("_")[1] - +b.split("_")[1]) : [];
    let logoSceneDir: string | null = null;
    for (const d of sceneDirs) {
      const htmlPath = path.join(workDir, d, "scene.html");
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, "utf-8");
        if (html.includes(logoFile)) { logoSceneDir = d; break; }
      }
    }
    check("logo file referenced in a rendered scene.html", !!logoSceneDir, logoSceneDir ? `${logoSceneDir} references ${logoFile}` : `no scene.html references ${logoFile}`);

    // ── PROOF: B-ROLL ──
    const brollScenes = (project.scenes || []).filter((s: any) => s.background_video);
    const stockDir = path.join(projDir, "stock");
    const stockClips = fs.existsSync(stockDir) ? fs.readdirSync(stockDir).filter((f) => f.endsWith(".mp4")) : [];
    check("at least one scene has b-roll background_video", brollScenes.length > 0, `${brollScenes.length} scene(s)`);
    check("b-roll clip fetched to stock/", stockClips.length > 0, stockClips.join(", "));

    // ── PROOF: HERO IMAGE ──
    const assetsDir = path.join(projDir, "assets");
    const heroImgs = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter((f) => /^hero_scene_.*\.png$/.test(f)) : [];
    const planHero = (project.plan?.scenes || []).filter((s: any) => s.hero_image);
    check("hero image generated to assets/", heroImgs.length > 0, heroImgs.join(", ") || `(plan requested ${planHero.length})`);

    // ── Extract frames so the logo is VISIBLE ──
    console.log("\n-- extracting frames --");
    if (logoSceneDir) {
      const sceneMp4 = path.join(workDir, logoSceneDir, "scene.mp4");
      if (fs.existsSync(sceneMp4)) {
        const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", sceneMp4]);
        const d = parseFloat(stdout) || 5;
        for (const [i, frac] of [0.4, 0.7, 0.95].entries()) {
          await exec("ffmpeg", ["-y", "-ss", String(Math.max(0.05, d * frac)), "-i", sceneMp4, "-frames:v", "1", path.join(FRAMES_OUT, `logo_${i}.png`)]);
        }
        console.log(`   logo frames: ${FRAMES_OUT}/logo_0..2.png (from ${logoSceneDir})`);
      }
    }
    // A frame from the final video for overall context.
    try {
      const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", outPath]);
      const d = parseFloat(stdout) || 20;
      for (const [i, frac] of [0.1, 0.45, 0.9].entries()) {
        await exec("ffmpeg", ["-y", "-ss", String(Math.max(0.1, d * frac)), "-i", outPath, "-frames:v", "1", path.join(FRAMES_OUT, `video_${i}.png`)]);
      }
    } catch { /* ignore */ }

    const allPass = checks.every((c) => c.pass);
    console.log(`\n=== Logo+B-roll+Hero E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}) ===`);
    console.log(`   output:  ${outPath}`);
    console.log(`   frames:  ${FRAMES_OUT}/`);
    if (!allPass) process.exit(1);
  } catch (err: any) {
    console.error("Test error:", err.message || err);
    console.error("--- server stderr tail ---\n" + stderrBuf.slice(-3000));
    process.exit(1);
  } finally {
    try { await client.close(); } catch { /* */ }
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
