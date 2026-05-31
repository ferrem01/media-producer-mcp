/**
 * media-producer-mcp entry point.
 *
 * Starts the MCP server on stdio transport and an HTTP health endpoint.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import http from "node:http";
import { createMcpServer } from "./server.js";
import { config } from "./config.js";

async function main() {
  // Create MCP server
  const server = createMcpServer();

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Start HTTP health endpoint
  const httpServer = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "media-producer-mcp", version: "0.1.0" }));
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  httpServer.listen(config.port, () => {
    console.error(`media-producer-mcp health endpoint on :${config.port}`);
    console.error(`Data directory: ${config.dataDir}`);
    console.error(`Component library: ${config.componentLibDir}`);
    console.error(`MCP server ready on stdio`);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
