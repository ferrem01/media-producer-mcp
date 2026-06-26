/**
 * Live Studio test: a REAL simple generate -> render, then load the preview SPA
 * (Studio) against the rendered project and screenshot it.
 *
 * Phase 1 (generate): spawn the server on stdio (auth off), call `generate`
 *   mode='full' with a tiny 3-scene prompt, poll the job to completion.
 * Phase 2 (studio): spawn the HTTP server on the SAME data dir, load
 *   /preview?tenant&project, drive Play, and screenshot.
 *
 * Usage: node test/studio-live.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "dist/index.js");
const DATA = path.join(ROOT, "test-output/studio-live");
const SHOTS = "/tmp/studio-live";
const PORT = 3219;
const TENANT = "studio-demo";

const PROMPT =
  "A short 3-scene launch video for Quotient, a B2B marketing platform that runs " +
  "campaigns on autopilot. Scene 1: bold title 'Marketing on autopilot'. " +
  "Scene 2: a single big stat — '3x faster campaigns'. Scene 3: a call to action — " +
  "'Start free today'. Clean, modern, confident.";

function textOf(result) {
  if (!Array.isArray(result?.content)) return "";
  return result.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
function parseJson(result) {
  try { return JSON.parse(textOf(result)); } catch { return null; }
}

async function main() {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });

  // ---- Phase 1: generate + render over MCP stdio ----
  console.log("=== Phase 1: generate + render ===\n");
  const env = { ...process.env, MP_DATA_DIR: DATA, MP_PORT: "0", MP_PROGRESS: "1" };
  delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
  const transport = new StdioClientTransport({ command: "node", args: [ENTRY], env, stderr: "inherit" });
  const client = new Client({ name: "studio-live", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  console.log("connected to MCP server (stdio)\n");

  const t0 = Date.now();
  const gen = await client.callTool({
    name: "generate",
    arguments: {
      tenant_id: TENANT,
      prompt: PROMPT,
      target: "video",
      mode: "full",
      brief: { target_duration: 16 }, // -> 3 scenes (the floor)
    },
  });
  const genJson = parseJson(gen);
  console.log("generate ->", JSON.stringify(genJson)?.slice(0, 300));
  const jobId = genJson?.job_id;
  const projectId = genJson?.project_id;
  if (!jobId) { console.error("no job_id returned"); process.exit(1); }

  // Poll the job
  let project = projectId;
  let status = "queued";
  while (status === "running" || status === "queued") {
    await new Promise((r) => setTimeout(r, 5000));
    const job = parseJson(await client.callTool({
      name: "get", arguments: { tenant_id: TENANT, target: "job", job_id: jobId },
    }));
    status = job?.status || status;
    const p = job?.progress;
    const secs = Math.round((Date.now() - t0) / 1000);
    if (p) console.log(`  [${secs}s] ${status} — ${p.step} ${p.percent}%${p.detail ? " · " + p.detail : ""}${p.etaSeconds ? " · eta " + p.etaSeconds + "s" : ""}`);
    else console.log(`  [${secs}s] ${status}`);
    if (job?.result?.project_id) project = job.result.project_id;
    if (status === "failed") {
      console.error("job failed:", JSON.stringify(job).slice(0, 1000)); process.exit(1);
    }
    if (status === "completed") break;
  }
  console.log(`\ngenerate+render done in ${Math.round((Date.now() - t0) / 1000)}s — project=${project}\n`);
  await client.close();

  // ---- Phase 2: serve Studio + screenshot ----
  console.log("=== Phase 2: Studio ===\n");
  const httpEnv = { ...process.env, MP_DATA_DIR: DATA, MP_PORT: String(PORT) };
  delete httpEnv.AUTH_TOKENS; delete httpEnv.SESSION_SECRET;
  const server = spawn("node", [ENTRY], { env: httpEnv, stdio: ["ignore", "ignore", "inherit"] });
  let browser;
  try {
    // wait for HTTP up
    const start = Date.now();
    let up = false;
    while (Date.now() - start < 30000) {
      try { if ((await fetch(`http://localhost:${PORT}/preview`)).ok) { up = true; break; } } catch { /* */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log("server up:", up);

    browser = await chromium.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const url = `http://localhost:${PORT}/preview?tenant=${TENANT}&project=${project}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector(".scene-item", { timeout: 15000 }).catch(() => {});
    const scenes = await page.locator(".scene-item").count();
    console.log("scenes listed:", scenes);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SHOTS, "studio-loaded.png") });

    // Try to play
    const playBtn = page.locator("#play-btn");
    if (await playBtn.count()) {
      await playBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SHOTS, "studio-playing.png") });
      const t = await page.locator("#time-display").innerText().catch(() => "");
      console.log("time-display after play:", t);
    }
    console.log(`\nStudio URL (local): ${url}`);
    console.log(`screenshots: ${SHOTS}/`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill("SIGTERM");
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
