// Big-boy E2E: a Quotient x Canva connector launch video, driven entirely
// through the real MCP tool surface (extract_brand_from_website -> generate -> render).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs"; import { execFile } from "node:child_process"; import { promisify } from "node:util";
const ex = promisify(execFile);
const DD = process.cwd() + "/test-output/canva-launch";
const TENANT = "quotient";
const FRAMES = "/tmp/canva-launch-frames";
fs.rmSync(DD, { recursive: true, force: true });
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const env = { ...process.env, MP_DATA_DIR: DD, MP_PORT: "0" }; delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
const t = new StdioClientTransport({ command: "node", args: [process.cwd() + "/dist/index.js"], env, stderr: "inherit" });
const c = new Client({ name: "canva-launch", version: "1" }, { capabilities: {} });
await c.connect(t);
const J = (x) => { if (x?.isError || !x?.content?.[0]?.text) { console.error("TOOL ERROR:", JSON.stringify(x, null, 2).slice(0, 2000)); throw new Error("tool error"); } return JSON.parse(x.content[0].text); };
const poll = async (id, ms) => { const s = Date.now(); let l = ""; while (Date.now() - s < ms) { const r = J(await c.callTool({ name: "job", arguments: { action: "status", job_id: id } })); if (r.progress && `${r.progress.step} ${r.progress.percent}` !== l) { l = `${r.progress.step} ${r.progress.percent}`; console.log("  ..." + l); } if (r.status === "completed" || r.status === "failed") return r; await new Promise(x => setTimeout(x, 4000)); } throw new Error("timeout"); };

// 1. Pull the Quotient brand kit from the live site.
console.log(">>> extract_brand_from_website(getquotient.ai)...");
const ext = J(await c.callTool({ name: "extract_brand_from_website", arguments: { tenant_id: TENANT, url: "https://getquotient.ai", enhance: true } }, undefined, { timeout: 300000 }));
console.log("   brand keys:", Object.keys(ext).join(", "));
try { const kit = JSON.parse(fs.readFileSync(`${DD}/${TENANT}/brand-kit/brand-kit.json`, "utf-8")); console.log("   primary:", kit.colors?.primary, "| logos:", (kit.logos || []).length, "| fonts:", (kit.fonts || []).map(f => f.family).join(",")); } catch (e) { console.log("   (no kit file)"); }

const PROMPT = `A polished ~40-second product LAUNCH video for the Quotient x Canva connector -- how Quotient's AI agent and Canva work together end to end. Brand it as Quotient using the Quotient brand kit (colors, fonts, logo). Premium, cinematic SaaS-launch aesthetic with smooth, confident motion and crisp UI.

Structure it as a HERO OPEN, THREE use-case beats, and a SOCIAL payoff:

1. HERO OPEN: "Quotient x Canva" title reveal with the Quotient logo and brand colors. Subtitle: "Your AI agent, now creating in Canva."

2. USE CASE 1 -- Generate -> Design -> Edit -> Return: In the Quotient agent chat (use the quotient-chat component), the user asks for an image; the agent calls its generate-image tool and returns an asset card with the generated image. That image is sent to Canva (use the canva-editor component) where a design is created and a cursor adds a HEADLINE/title onto it. It returns to Quotient as a finished asset. Components: quotient-chat, canva-editor.

3. USE CASE 2 -- Search & Import: In the Canva editor (canva-editor component), browse a grid of several existing designs you've made, then import one back into Quotient as an asset. Components: canva-editor, quotient-chat.

4. USE CASE 3 -- Generate a Canva design: From Quotient, call Canva's generate-design; show a design generating in the Canva editor (canva-editor component) and being pulled back into Quotient as an asset. Components: canva-editor, quotient-chat.

5. SOCIAL PAYOFF: Take one of those assets and drop it into a social post (use the quotient-social component) -- the asset lands in a LinkedIn-style published post, ready to ship. End on a clean Quotient logo lockup with the tagline "From prompt to post."

Use the library mockup components (quotient-chat, canva-editor, quotient-social) for every UI moment so they look real, with scripted cursor interactions where it fits. Keep transitions premium and the pacing confident.`;

// 2. Generate (full): plan + scenes.
console.log("\n>>> generate(full, video)...");
const g = J(await c.callTool({ name: "generate", arguments: { tenant_id: TENANT, mode: "full", target: "video", prompt: PROMPT, voiceover: true, background_music: true, brief: { video_type: "product_launch", target_duration: 40 } } }));
const gj = await poll(g.job_id, 1800000);
console.log(">>> generate:", gj.status, gj.error || "");
if (gj.status !== "completed") { console.error("GENERATE FAILED"); await c.close(); process.exit(1); }
const pid = gj.projectId || gj.result?.project?.project_id;
const proj = JSON.parse(fs.readFileSync(`${DD}/${TENANT}/projects/${pid}/project.json`, "utf-8"));
console.log(`>>> project ${pid}: ${(proj.scenes || []).length} scenes`);
(proj.scenes || []).forEach((s, i) => console.log(`   scene ${i + 1}: ${JSON.stringify(s.label)} comps=[${(s.components || []).map(c => c.type || c).join(",")}]${s.background_video ? " [broll]" : ""}`));

// 3. Render.
console.log("\n>>> render(preview)...");
const r = J(await c.callTool({ name: "render", arguments: { tenant_id: TENANT, project_id: pid, quality: "preview" } }));
const rj = await poll(r.job_id, 1800000);
console.log(">>> render:", rj.status, rj.error || "");
const out = rj.outputPath || `${DD}/${TENANT}/projects/${pid}/output/output.mp4`;
console.log(">>> output:", out);

// 4. Extract frames across the video.
try {
  const d = parseFloat((await ex("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", out])).stdout) || 40;
  const n = 8;
  for (let i = 0; i < n; i++) { await ex("ffmpeg", ["-y", "-ss", String(Math.max(0.1, d * (i + 0.5) / n)), "-i", out, "-frames:v", "1", `${FRAMES}/f${i}.png`]); }
  console.log(`>>> frames: ${FRAMES}/f0..${n - 1}.png  (duration ${d.toFixed(1)}s)`);
} catch (e) { console.log("   frame extract failed:", e.message); }
await c.close();
console.log("\n=== DONE ===");
