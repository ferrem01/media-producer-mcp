// Re-render the existing logo-broll-hero project to verify the edge-seam fix.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs"; import { execFile } from "node:child_process"; import { promisify } from "node:util";
const ex = promisify(execFile);
const DD = process.cwd() + "/test-output/logo-broll-hero";
const TENANT = "qtest";
const PID = process.argv[2] || "proj_095d3bce";
const env = { ...process.env, MP_DATA_DIR: DD, MP_PORT: "0" }; delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
const t = new StdioClientTransport({ command: "node", args: [process.cwd() + "/dist/index.js"], env, stderr: "inherit" });
const c = new Client({ name: "rr", version: "1" }, { capabilities: {} }); await c.connect(t);
const J = (x) => JSON.parse(x.content[0].text);
const poll = async (id, ms) => { const s = Date.now(); let l = ""; while (Date.now() - s < ms) { const r = J(await c.callTool({ name: "job", arguments: { action: "status", job_id: id } })); if (r.progress && `${r.progress.step}` !== l) { l = `${r.progress.step}`; console.log("  ..." + l); } if (r.status === "completed" || r.status === "failed") return r; await new Promise(x => setTimeout(x, 4000)); } throw new Error("timeout"); };
console.log(">>> re-render", PID);
const r = J(await c.callTool({ name: "render", arguments: { tenant_id: TENANT, project_id: PID, quality: "preview" } }));
const rj = await poll(r.job_id, 1800000); console.log(">>> render:", rj.status, rj.error || "");
const out = rj.outputPath; console.log(">>> output:", out);
// Re-extract the b-roll scene corner (scene_0) to compare.
const sc0 = `${DD}/${TENANT}/projects/${PID}/_work/scene_0/scene.mp4`;
if (fs.existsSync(sc0)) {
  await ex("ffmpeg", ["-y", "-ss", "2", "-i", sc0, "-frames:v", "1", "/tmp/fix_full.png"]);
  await ex("ffmpeg", ["-y", "-i", "/tmp/fix_full.png", "-vf", "crop=400:300:1520:780,scale=800:600:flags=neighbor", "/tmp/fix_corner.png"]);
  await ex("ffmpeg", ["-y", "-i", "/tmp/fix_full.png", "-vf", "crop=1920:50:0:1030", "/tmp/fix_bottom.png"]);
  console.log(">>> frames: /tmp/fix_corner.png /tmp/fix_bottom.png");
}
await c.close();
