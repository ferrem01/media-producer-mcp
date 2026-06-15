/**
 * Smoke test: generate a simple title scene (image) end-to-end via the MCP server.
 *
 * Spawns the built server on stdio, calls `generate` (target=image), waits for the
 * async job to finish, and prints the resulting project + output paths.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../dist/index.js");
const TENANT = "smoke-test";

function textOf(result: any): string {
  if (Array.isArray(result?.content)) {
    return result.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
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
 * Poll a job to completion via short `job status` requests. Avoids the `job`
 * tool's `wait` action, which blocks a single MCP request beyond the client
 * SDK's default per-request timeout (~60s) on longer jobs.
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
  console.log("=== Title Scene Smoke Test ===\n");

  // Run the child server in dev mode (no auth). Auth isn't under test here;
  // the generate -> render pipeline is. Strip the auth-enabling env vars so
  // isAuthEnabled() is false and tools don't require a token.
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

  const client = new Client({ name: "smoke-test", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log("Connected.\n");

    console.log('-- generate (target=image): "title scene" --');
    const gen = await client.callTool({
      name: "generate",
      arguments: {
        tenant_id: TENANT,
        target: "image",
        prompt:
          'A clean, modern title card that reads "Media Producer MCP" as the headline ' +
          'with the subtitle "End-to-end smoke test". Centered text, gradient background.',
      },
    });
    const queued = parse(gen);
    console.log("  ", JSON.stringify(queued));
    if (!queued.job_id) throw new Error("No job_id returned from generate");

    console.log(`\n-- polling job ${queued.job_id} --`);
    const job = await pollJob(client, queued.job_id, { timeoutMs: 600_000 });
    console.log("  status:", job.status);
    if (job.progress) console.log("  progress:", JSON.stringify(job.progress));
    if (job.error) console.log("  error:", job.error);

    const projectId = job.projectId || job.result?.projectId || job.result?.project_id;
    if (projectId) {
      console.log(`\n-- get project ${projectId} --`);
      const got = await client.callTool({
        name: "get",
        arguments: { tenant_id: TENANT, project_id: projectId },
      });
      const proj = parse(got);
      console.log("  name:", proj.name);
      console.log("  status:", proj.status);
      console.log("  format:", proj.format);
      console.log("  scenes:", (proj.scenes || []).length);
      console.log("  preview_url:", proj.preview_url || job.preview_url);
    }

    console.log("\n  full job payload:");
    console.log(JSON.stringify(job, null, 2).substring(0, 1500));

    if (job.status !== "completed") {
      console.error("\n=== FAILED: job did not complete ===");
      process.exit(1);
    }
    console.log("\n=== Title Scene Smoke Test Complete ===");
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
