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

/**
 * Poll a job to completion via short `job status` requests.
 *
 * We intentionally do NOT use the `job` tool's `wait` action: that blocks
 * server-side in a single MCP request for the full duration, which exceeds the
 * MCP client SDK's default per-request timeout (~60s) on longer renders (e.g.
 * video). Polling keeps each request short and lets us wait as long as needed.
 */
async function pollJob(
  client: Client,
  jobId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<any> {
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const intervalMs = opts.intervalMs ?? 3_000;
  const start = Date.now();
  let lastStep = "";
  while (Date.now() - start < timeoutMs) {
    const res = await client.callTool({
      name: "job",
      arguments: { action: "status", job_id: jobId },
    });
    const job = parse(res);
    if (job.progress) {
      const tag = `${job.progress.step} ${job.progress.percent}%`;
      if (tag !== lastStep) {
        console.log(`  ...${tag}`);
        lastStep = tag;
      }
    }
    if (job.status === "completed" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Polling timed out after ${timeoutMs}ms (job ${jobId})`);
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

    console.log(`\n-- polling render job ${queued.job_id} --`);
    const job = await pollJob(client, queued.job_id, { timeoutMs: 600_000 });
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
