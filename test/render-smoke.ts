/**
 * Render smoke test: render an already-generated project via the MCP server.
 *
 * Reuses the same data dir/tenant as the generate smoke test, renders the
 * given project (PROJECT_ID env, default proj_549c952b), waits for the async
 * render job, and prints the output path(s). Optional RENDER_FORMAT env
 * overrides the output format (e.g. "video" to exercise the ffmpeg encode).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../dist/index.js");
const TENANT = "smoke-test";
const PROJECT_ID = process.env.PROJECT_ID || "proj_549c952b";
const RENDER_FORMAT = process.env.RENDER_FORMAT; // optional override

function textOf(result: any): string {
  if (Array.isArray(result?.content)) {
    return result.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  }
  return JSON.stringify(result);
}
function parse(result: any): any {
  try {
    return JSON.parse(textOf(result));
  } catch {
    return { _raw: textOf(result) };
  }
}

async function main() {
  console.log("=== Render Smoke Test ===\n");
  console.log("  project:", PROJECT_ID, RENDER_FORMAT ? `(format override: ${RENDER_FORMAT})` : "");

  const childEnv: Record<string, string> = { ...process.env } as Record<string, string>;
  delete childEnv.AUTH_TOKENS;
  delete childEnv.SESSION_SECRET;
  childEnv.MP_DATA_DIR = path.resolve(__dirname, "../test-output/smoke-test");
  childEnv.MP_PORT = "0";

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    env: childEnv,
  });
  const client = new Client({ name: "render-smoke", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log("Connected.\n");

    const renderArgs: Record<string, unknown> = { tenant_id: TENANT, project_id: PROJECT_ID };
    if (RENDER_FORMAT) renderArgs.format = RENDER_FORMAT;

    console.log("-- render --");
    const rendered = await client.callTool({ name: "render", arguments: renderArgs });
    const queued = parse(rendered);
    console.log("  ", JSON.stringify(queued));
    if (!queued.job_id) throw new Error("No job_id returned from render: " + JSON.stringify(queued));

    console.log(`\n-- waiting for render job ${queued.job_id} --`);
    const waited = await client.callTool({
      name: "job",
      arguments: { action: "wait", job_id: queued.job_id, timeout_seconds: 300 },
    });
    const job = parse(waited);
    console.log("  status:", job.status);
    if (job.progress) console.log("  progress:", JSON.stringify(job.progress));
    if (job.error) console.log("  error:", job.error);

    console.log("\n  full job payload:");
    console.log(JSON.stringify(job, null, 2).substring(0, 2000));

    if (job.status !== "completed") {
      console.error("\n=== FAILED: render job did not complete ===");
      process.exit(1);
    }
    console.log("\n=== Render Smoke Test Complete ===");
  } catch (err: any) {
    console.error("Test error:", err.message || err);
    process.exit(1);
  } finally {
    try {
      await client.close();
    } catch {
      /* server may have exited */
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
