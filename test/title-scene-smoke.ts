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

    console.log(`\n-- waiting for job ${queued.job_id} --`);
    const waited = await client.callTool({
      name: "job",
      arguments: { action: "wait", job_id: queued.job_id, timeout_seconds: 240 },
    });
    const job = parse(waited);
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
