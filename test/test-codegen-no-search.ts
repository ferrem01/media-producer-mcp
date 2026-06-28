/**
 * Isolated test: Can the codegen LLM generate a scene with component tags
 * when given pre-supplied schemas and NO search_library tool?
 *
 * Simulates what happens when the storyboard builder provides component hints
 * and schemas are inlined in the brief. The LLM should go straight
 * to writing and submitting.
 *
 * Usage: npx tsx test/test-codegen-no-search.ts
 */

import { generateSceneAgentic } from "../src/llm/agentic-codegen.js";
import { buildComponentCatalog } from "../src/llm/catalog.js";
import { llmConfigFromEnv } from "../src/llm/client.js";
import { config } from "../src/config.js";

async function main() {
  console.log("=== Codegen No-Search Test ===\n");

  var llmConfig = llmConfigFromEnv();
  console.log(`LLM: ${llmConfig.provider} / ${llmConfig.model}\n`);

  // 1. Build a brief exactly like buildCodegenBrief would
  //    Simulating storyboard builder output: components: ["quotient-chat", "dashboard-kpi"]

  var catalog = await buildComponentCatalog(config.componentLibDir);
  var catalogMap = new Map();
  for (var entry of catalog) {
    catalogMap.set(entry.type, entry);
  }

  // Build schema sections for each component
  function buildSchema(compType: string): string {
    var catalogEntry = catalogMap.get(compType);
    if (!catalogEntry || !catalogEntry.data) return "";
    var lines: string[] = [];
    lines.push(`### ${compType}`);
    if (catalogEntry.description) lines.push(catalogEntry.description);
    lines.push(`Embed: \`<component type="${compType}" data='{...}' />\``);
    lines.push("Data fields:");
    for (var [fieldName, field] of Object.entries(catalogEntry.data)) {
      var f = field as any;
      var reqStr = f.required ? " (required)" : " (optional)";
      var typeStr = f.type;
      if (f.items) typeStr += `<${f.items.type}>`;
      var extra = "";
      if (f.placeholder) extra += ` e.g. "${f.placeholder}"`;
      if (f.default !== undefined) extra += ` default: ${JSON.stringify(f.default)}`;
      if (f.enum) extra += ` values: ${f.enum.join(", ")}`;
      lines.push(`  - \`${fieldName}\`: ${typeStr}${reqStr}${extra}`);
      if (f.items && f.items.properties) {
        for (var [propName, prop] of Object.entries(f.items.properties)) {
          var p = prop as any;
          var propReq = p.required ? " (required)" : "";
          var propEnum = p.enum ? ` values: ${p.enum.join(", ")}` : "";
          lines.push(`      - \`${propName}\`: ${p.type}${propReq}${propEnum}`);
        }
      }
    }
    return lines.join("\n");
  }

  var chatSchema = buildSchema("quotient-chat");
  var dashSchema = buildSchema("dashboard-kpi");

  // This is exactly what buildCodegenBrief produces
  var sceneBrief = `Scene: "The Blueprint Begins"
Duration: 8 seconds
Description: Split-screen chat and dashboard showing AI marketing in action

Visual Direction:
Split-screen layout. Left panel: an AI chat conversation where a user types "Generate a LinkedIn campaign for our Q3 product launch" and the assistant responds with a structured campaign plan including phases and projected metrics. Right panel: a KPI dashboard with animated counters showing campaign performance -- impressions (245K), clicks (18.2K), and conversion rate (4.7%). The chat appears first from the left with a smooth slide, then the dashboard slides in from the right at 3 seconds. A subtle beam connector links the two panels at center. Dark background with grid texture. BG: dark navy gradient. MG: chat panel, dashboard panel. FG: beam connector with glow.

Use these library components via <component> tags:
  - <component type="quotient-chat" />
  - <component type="dashboard-kpi" />

## Component Schemas

${chatSchema}

${dashSchema}`;

  console.log("Scene brief length:", sceneBrief.length, "chars");
  console.log("Brief includes schemas:", sceneBrief.includes("Component Schemas"));
  console.log();

  var brandKit = {
    name: "Test",
    colors: {
      primary: "#6366f1",
      secondary: "#8b5cf6",
      accent: "#10b981",
      background: "#0f172a",
      text: "#e2e8f0",
    },
    fonts: [{ family: "Inter", weights: ["400", "600", "700"] }],
    logos: [],
    style: {
      border_radius: "12px",
      motion: "cinematic",
    },
  };

  var canvas = { width: 1920, height: 1080, fps: 30, background: "#0f172a" };

  var startTime = Date.now();

  var html = await generateSceneAgentic({
    sceneBrief,
    sceneLabel: "The Blueprint Begins",
    sceneDescription: "Split-screen chat and dashboard showing AI marketing in action",
    sceneDuration: 8,
    sceneIndex: 0,
    totalScenes: 1,
    prompt: "Quotient AI marketing platform demo video",
    llmConfig,
    brandKit: brandKit as any,
    canvas,
  });

  var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n--- Generated in ${elapsed}s (${html.length} chars) ---\n`);

  // Check for component tags
  var componentTagRegex = /<component\s+[^>]*type\s*=\s*["']([^"']+)["'][^>]*>/gi;
  var matches = [...html.matchAll(componentTagRegex)];
  var componentTypes = matches.map(m => m[1]);

  console.log("=== RESULTS ===\n");

  if (componentTypes.length > 0) {
    console.log(`✅ PASS: Found ${componentTypes.length} <component> tag(s):`);
    for (var type of componentTypes) {
      console.log(`   - <component type="${type}" />`);
    }
  } else {
    console.log("❌ FAIL: No <component> tags found in output.");
  }

  // Structure checks
  console.log();
  console.log("Structure checks:");
  console.log(`  <template>: ${/<template/i.test(html) ? "✓" : "✗"}`);
  console.log(`  <script>: ${/<script/i.test(html) ? "✓" : "✗"}`);
  console.log(`  createTimeline: ${/createTimeline/i.test(html) ? "✓" : "✗"}`);
  console.log(`  getComponentTimeline: ${/getComponentTimeline/i.test(html) ? "✓" : "✗"}`);

  // Write output
  var fs = await import("node:fs/promises");
  await fs.writeFile("/tmp/codegen-no-search-output.html", html, "utf-8");
  console.log(`\nFull output written to: /tmp/codegen-no-search-output.html`);

  console.log("\n=== Test Complete ===");
  process.exit(componentTypes.length > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
