/**
 * End-to-end: a Quotient x Canva connector LAUNCH video, driven entirely through
 * the real MCP tool surface (extract_brand_from_website -> generate -> render).
 *
 * Covers the three connector use cases plus the social payoff:
 *   UC1  generate-image -> create a Canva design -> add a headline -> return as asset
 *   UC2  search existing Canva designs -> import one as an asset
 *   UC3  generate a Canva design -> pull it back as an asset
 *   payoff: drop an asset into a quotient-social post
 *
 * Asserts the run actually produced a launch video that uses the real library
 * mockup components (quotient-chat, canva-editor, quotient-social) -- not custom
 * UI -- and a valid MP4. Frames are extracted for a visual quality read.
 *
 * Slow (live brand extraction + LLM storyboard/codegen + image gen + TTS + render).
 * Run in the background.  Brand kit is pulled from getquotient.ai.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(__dirname, "../dist/index.js");
const DD = path.resolve(__dirname, "../test-output/canva-launch");
const TENANT = "quotient";
const FRAMES = "/tmp/canva-launch-frames";
const LONG = 300_000;

function textOf(r: any): string {
  if (Array.isArray(r?.content)) return r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  return JSON.stringify(r);
}
const J = (x: any) => { if (x?.isError || !x?.content?.[0]?.text) { throw new Error("tool error: " + textOf(x).slice(0, 800)); } return JSON.parse(textOf(x)); };

const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => { checks.push({ name, pass, detail }); console.log(`  [${pass ? "PASS" : "FAIL"}] ${name}${detail ? " -- " + detail : ""}`); };

async function pollJob(c: Client, id: string, ms: number): Promise<any> {
  const s = Date.now(); let last = "";
  while (Date.now() - s < ms) {
    const r = J(await c.callTool({ name: "job", arguments: { action: "status", job_id: id } }));
    if (r.progress && `${r.progress.step} ${r.progress.percent}` !== last) { last = `${r.progress.step} ${r.progress.percent}`; console.log("    ..." + last); }
    if (r.status === "completed" || r.status === "failed") return r;
    await new Promise((x) => setTimeout(x, 4000));
  }
  throw new Error("poll timeout " + id);
}

const PROMPT = `A polished product LAUNCH video for the Quotient x Canva connector -- how Quotient's AI agent and Canva work together end to end. Brand it as Quotient using the Quotient brand kit (colors, fonts, logo). Premium, cinematic SaaS-launch aesthetic with smooth, confident motion and crisp UI.

Structure it as a HERO OPEN, THREE use-case beats, and a SOCIAL payoff:

1. HERO OPEN: "Quotient x Canva" title reveal with the Quotient logo and brand colors. Subtitle: "Your AI agent, now creating in Canva."

2. USE CASE 1 -- Generate -> Design -> Edit -> Return: In the Quotient agent chat (quotient-chat component), the user asks for an image; the agent calls its generate-image tool and returns an asset card with the generated image. That image is sent to Canva (canva-editor component) where a design is created and a cursor adds a HEADLINE/title onto it. It returns to Quotient as a finished asset. Components: quotient-chat, canva-editor.

3. USE CASE 2 -- Search & Import: In the Canva editor (canva-editor component), browse a grid of several existing designs, then import one back into Quotient as an asset. Components: canva-editor, quotient-chat.

4. USE CASE 3 -- Generate a Canva design: From Quotient, call Canva's generate-design; show a design generating in the Canva editor (canva-editor component) and being pulled back into Quotient as an asset. Components: canva-editor, quotient-chat.

5. SOCIAL PAYOFF: Take one of those assets and drop it into a social post (quotient-social component) -- the asset lands in a LinkedIn-style published post, ready to ship. End on a clean Quotient logo lockup with the tagline "From prompt to post."

Use the library mockup components (quotient-chat, canva-editor, quotient-social) for every UI moment so they look real, with scripted cursor interactions where it fits. Keep transitions premium and the pacing confident.`;

async function main() {
  console.log("=== Quotient x Canva launch E2E ===\n");
  fs.rmSync(DD, { recursive: true, force: true });
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const env: Record<string, string> = { ...process.env } as any;
  delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
  env.MP_DATA_DIR = DD; env.MP_PORT = "0";
  const transport = new StdioClientTransport({ command: "node", args: [SERVER], env, stderr: "inherit" });
  const c = new Client({ name: "canva-launch", version: "1.0.0" }, { capabilities: {} });

  try {
    await c.connect(transport);

    // 1. Pull the Quotient brand kit from the live site.
    console.log("-- 1. extract_brand_from_website(getquotient.ai) --");
    J(await c.callTool({ name: "extract_brand_from_website", arguments: { tenant_id: TENANT, url: "https://getquotient.ai", enhance: true } }, undefined, { timeout: LONG }));
    const kit = JSON.parse(fs.readFileSync(path.join(DD, TENANT, "brand-kit", "brand-kit.json"), "utf-8"));
    check("brand kit extracted (non-default primary)", !!kit.colors?.primary && kit.colors.primary !== "#5B21B6", `primary=${kit.colors?.primary}, logos=${(kit.logos || []).length}`);

    // 2. Generate (full): storyboard + scenes.
    console.log("\n-- 2. generate(full, video) --");
    const g = J(await c.callTool({ name: "generate", arguments: { tenant_id: TENANT, mode: "full", target: "video", prompt: PROMPT, voiceover: true, background_music: true, brief: { video_type: "product_launch", target_duration: 40 } } }));
    const gj = await pollJob(c, g.job_id, 1_800_000);
    check("generate completed", gj.status === "completed", gj.error || gj.status);
    const pid = gj.projectId || gj.result?.project?.project_id;
    const projDir = path.join(DD, TENANT, "projects", pid);
    const proj = JSON.parse(fs.readFileSync(path.join(projDir, "project.json"), "utf-8"));
    console.log(`   ${pid}: ${(proj.scenes || []).length} scenes`);

    // 3. Render.
    console.log("\n-- 3. render(preview) --");
    const r = J(await c.callTool({ name: "render", arguments: { tenant_id: TENANT, project_id: pid, quality: "preview" } }));
    const rj = await pollJob(c, r.job_id, 1_800_000);
    check("render completed", rj.status === "completed", rj.error || rj.status);
    const out = rj.outputPath || path.join(projDir, "output", "output.mp4");

    // ── PROOF: the real library mockup components were used (not custom UI) ──
    const work = path.join(projDir, "_work");
    const countRefs = (needle: string) => {
      if (!fs.existsSync(work)) return 0;
      return fs.readdirSync(work).filter((d) => /^scene_\d+$/.test(d))
        .filter((d) => { const f = path.join(work, d, "scene.html"); return fs.existsSync(f) && fs.readFileSync(f, "utf-8").includes(needle); }).length;
    };
    for (const comp of ["quotient-chat", "canva-editor", "quotient-social"]) {
      check(`library component used: ${comp}`, countRefs(comp) > 0, `${countRefs(comp)} scene(s)`);
    }

    // ── valid MP4 + frames ──
    try {
      const { stdout } = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_name", "-of", "default=nw=1", out]);
      const dur = parseFloat((stdout.match(/duration=([\d.]+)/) || [])[1] || "0");
      check("valid MP4 (h264)", /codec_name=h264/.test(stdout), `${dur.toFixed(1)}s`);
      const n = 8;
      for (let i = 0; i < n; i++) await exec("ffmpeg", ["-y", "-ss", String(Math.max(0.1, dur * (i + 0.5) / n)), "-i", out, "-frames:v", "1", path.join(FRAMES, `f${i}.png`)]);
      console.log(`\n   output: ${out}\n   frames: ${FRAMES}/f0..${n - 1}.png`);
    } catch (e: any) { check("valid MP4 (h264)", false, e.message); }

    const allPass = checks.every((c) => c.pass);
    console.log(`\n=== Canva launch E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}) ===`);
    if (!allPass) process.exit(1);
  } finally {
    try { await c.close(); } catch { /* */ }
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
