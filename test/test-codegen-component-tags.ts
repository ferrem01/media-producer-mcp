/**
 * Isolated test: Does the codegen loop produce <component> tags?
 *
 * Calls generateFreeformAgentic with a scene brief that clearly
 * needs library components (chat panel, dashboard metrics), then
 * checks if the output HTML contains <component> tags.
 *
 * Usage: npx tsx test/test-codegen-component-tags.ts
 */

import { generateFreeformAgentic } from "../src/llm/freeform-agentic.js";
import { llmConfigFromEnv } from "../src/llm/client.js";

async function main() {
  console.log("=== Codegen Component Tag Test ===\n");

  const llmConfig = llmConfigFromEnv();
  console.log(`LLM: ${llmConfig.provider} / ${llmConfig.model}\n`);

  const brandKit = {
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

  const canvas = { width: 1920, height: 1080, fps: 30, background: "#0f172a" };

  // Scene that should clearly trigger component usage:
  // - A chat panel (quotient-chat exists in library)
  // - Dashboard metrics (metric-dashboard / dashboard-kpi exist)
  const sceneBrief = `Split-screen layout showing an AI marketing assistant in action.
Left side: A chat conversation panel where a user asks "Generate a LinkedIn campaign for our Q3 product launch"
and the AI assistant responds with a detailed campaign plan.
Right side: A dashboard with KPI metrics showing campaign performance -- impressions (245K), clicks (18.2K),
and conversion rate (4.7%) with animated counters.
The chat should appear first, then the dashboard slides in from the right after 3 seconds.`;

  console.log("Scene brief:");
  console.log("  " + sceneBrief.split("\n").join("\n  "));
  console.log();

  const startTime = Date.now();

  const html = await generateFreeformAgentic({
    sceneBrief,
    sceneLabel: "AI Marketing Assistant Demo",
    sceneDescription: "Split-screen chat + dashboard showing AI-powered marketing",
    sceneDuration: 8,
    sceneIndex: 0,
    totalScenes: 1,
    prompt: "Quotient AI marketing platform demo video",
    llmConfig,
    brandKit: brandKit as any,
    canvas,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n--- Generated in ${elapsed}s (${html.length} chars) ---\n`);

  // Check for component tags
  const componentTagRegex = /<component\s+[^>]*type\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const matches = [...html.matchAll(componentTagRegex)];
  const componentTypes = matches.map(m => m[1]);

  console.log("=== RESULTS ===\n");

  if (componentTypes.length > 0) {
    console.log(`✅ PASS: Found ${componentTypes.length} <component> tag(s):`);
    for (const type of componentTypes) {
      console.log(`   - <component type="${type}" />`);
    }
  } else {
    console.log("❌ FAIL: No <component> tags found in output.");
    console.log("   The LLM wrote everything from scratch instead of using library components.");
  }

  // Additional checks
  const hasTemplate = /<template/i.test(html);
  const hasScript = /<script/i.test(html);
  const hasCreateTimeline = /createTimeline/i.test(html);
  const hasGetComponentTimeline = /getComponentTimeline/i.test(html);

  console.log();
  console.log("Structure checks:");
  console.log(`  <template>: ${hasTemplate ? "✓" : "✗"}`);
  console.log(`  <script>: ${hasScript ? "✓" : "✗"}`);
  console.log(`  createTimeline: ${hasCreateTimeline ? "✓" : "✗"}`);
  console.log(`  getComponentTimeline: ${hasGetComponentTimeline ? "✓" : "✗"}`);

  // Show the tool call flow (search -> read_source -> submit)
  console.log();

  // Write the output for inspection
  const outPath = "/tmp/codegen-test-output.html";
  const fs = await import("node:fs/promises");
  await fs.writeFile(outPath, html, "utf-8");
  console.log(`Full output written to: ${outPath}`);

  console.log("\n=== Test Complete ===");
  process.exit(componentTypes.length > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
