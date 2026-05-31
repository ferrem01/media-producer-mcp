/**
 * MCP Client Connection Test
 *
 * Spawns the media-producer-mcp server as a child process on stdio,
 * connects via the MCP protocol, and validates tool listing + basic operations.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, "../dist/index.js");

async function main() {
  console.log("=== MCP Client Connection Test ===\n");

  // 1. Create transport (spawn server as child process)
  console.log("Starting MCP server on stdio...");
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    env: {
      ...process.env,
      // Ensure data dir doesn't conflict with production
      MP_DATA_DIR: path.resolve(__dirname, "../test-output/mcp-client"),
      MP_PORT: "0", // disable HTTP server for stdio-only test
    },
  });

  const client = new Client(
    { name: "test-mcp-client", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);
    console.log("Connected to MCP server.\n");

    // 2. List tools
    console.log("-- Listing tools --");
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name);
    console.log(`  Found ${toolNames.length} tools:`);
    for (const name of toolNames) {
      console.log(`    - ${name}`);
    }
    console.log("");

    // Verify expected tools exist
    const expectedTools = ["create", "get", "list", "add", "update", "remove", "render", "generate"];
    const missing = expectedTools.filter((t) => !toolNames.includes(t));
    if (missing.length > 0) {
      console.warn(`  WARNING: Missing expected tools: ${missing.join(", ")}`);
    } else {
      console.log(`  All expected tools present.\n`);
    }

    // 3. Create a project
    console.log("-- Creating project --");
    const createResult = await client.callTool({
      name: "create",
      arguments: {
        tenant_id: "test-mcp",
        name: "MCP Client Test Project",
        format: "image",
      },
    });
    console.log(`  Result:`, JSON.stringify(createResult.content, null, 2).substring(0, 500));

    // Extract project_id from the result
    let projectId: string | undefined;
    if (Array.isArray(createResult.content)) {
      for (const block of createResult.content) {
        if (block.type === "text" && typeof block.text === "string") {
          try {
            const parsed = JSON.parse(block.text);
            projectId = parsed.project_id;
          } catch {
            // Try to extract from text
            const match = block.text.match(/project_id["\s:]+([a-zA-Z0-9_-]+)/);
            if (match) projectId = match[1];
          }
        }
      }
    }

    if (!projectId) {
      console.log("  Could not extract project_id, skipping dependent tests.\n");
    } else {
      console.log(`  Project ID: ${projectId}\n`);

      // 4. Add a scene via the "add" tool
      console.log("-- Adding scene --");
      const addResult = await client.callTool({
        name: "add",
        arguments: {
          tenant_id: "test-mcp",
          project_id: projectId,
          scene: {
            id: "scene-mcp-test",
            duration_seconds: 3,
            label: "Hero Scene",
            components: [],
          },
        },
      });
      console.log(`  Result:`, JSON.stringify(addResult.content, null, 2).substring(0, 500));
      console.log("");

      // 5. Get the project back
      console.log("-- Getting project --");
      const getResult = await client.callTool({
        name: "get",
        arguments: {
          tenant_id: "test-mcp",
          project_id: projectId,
        },
      });
      console.log(`  Result:`, JSON.stringify(getResult.content, null, 2).substring(0, 500));
      console.log("");

      // 6. List projects
      console.log("-- Listing projects --");
      const listResult = await client.callTool({
        name: "list",
        arguments: {
          tenant_id: "test-mcp",
        },
      });
      console.log(`  Result:`, JSON.stringify(listResult.content, null, 2).substring(0, 500));
      console.log("");
    }

    console.log("=== MCP Client Connection Test Complete ===");
  } catch (err: any) {
    console.error("Test error:", err.message || err);
    process.exit(1);
  } finally {
    try {
      await client.close();
    } catch {
      // Server may have already exited
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
