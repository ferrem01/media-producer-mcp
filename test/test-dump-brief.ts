/**
 * Dump the codegen brief that buildCodegenBrief produces for a
 * simulated storyboard builder output with components.
 * Compares it to the isolated test brief.
 */

import { buildComponentCatalog } from "../src/llm/catalog.js";
import { config } from "../src/config.js";

async function main() {
  var catalog = await buildComponentCatalog(config.componentLibDir);
  var catalogMap = new Map();
  for (var entry of catalog) {
    catalogMap.set(entry.type, entry);
  }

  // Simulate what the storyboard builder returns for a scene
  var planned = {
    label: "Scene 3 - The Blueprint Begins",
    duration_seconds: 8,
    description: "Split-screen chat and dashboard showing AI marketing in action",
    brief: "Left panel: a Quotient AI chat conversation. The user types 'Generate a LinkedIn campaign for our Q3 product launch' and the AI responds with a structured campaign plan. Right panel: a KPI dashboard with animated counters showing campaign metrics — impressions (245K), clicks (18.2K), conversion rate (4.7%). Chat appears first from left. Dashboard slides in from right at 3s. Subtle beam connector links the two panels. BG: dark navy gradient with grid. MG: chat + dashboard panels. FG: beam glow.",
    components: ["quotient-chat", "dashboard-kpi", "split-connector", "gradient-background"],
    voiceover_text: "One conversation. Real-time results."
  };

  // Replicate buildCodegenBrief logic
  var parts: string[] = [];
  parts.push(`Scene: "${planned.label}"`);
  parts.push(`Duration: ${planned.duration_seconds} seconds`);
  parts.push(`Description: ${planned.description}`);
  parts.push(`\nVisual Direction:\n${planned.brief}`);

  if (planned.components.length > 0) {
    parts.push(`\nUse these library components via <component> tags:`);
    for (var compType of planned.components) {
      parts.push(`  - <component type="${compType}" />`);
    }

    var schemasFound: string[] = [];
    for (var ct of planned.components) {
      var catalogEntry = catalogMap.get(ct);
      if (catalogEntry && catalogEntry.data && Object.keys(catalogEntry.data).length > 0) {
        var schemaLines: string[] = [];
        schemaLines.push(`### ${ct}`);
        if (catalogEntry.description) schemaLines.push(catalogEntry.description);
        schemaLines.push(`Embed: <component type="${ct}" data='{...}' />`);
        schemaLines.push("Data fields:");
        for (var [fieldName, field] of Object.entries(catalogEntry.data)) {
          var f = field as any;
          var reqStr = f.required ? " (required)" : " (optional)";
          var typeStr = f.type;
          if (f.items) typeStr += `<${f.items.type}>`;
          schemaLines.push(`  - ${fieldName}: ${typeStr}${reqStr}`);
        }
        schemasFound.push(schemaLines.join("\n"));
      }
    }

    if (schemasFound.length > 0) {
      parts.push(`\n## Component Schemas\n\n${schemasFound.join("\n\n")}`);
    }
  }

  if (planned.voiceover_text) {
    parts.push(`\nVoiceover: "${planned.voiceover_text}"`);
    parts.push(`Time the visual reveals to match the narration pacing.`);
  }

  var brief = parts.join("\n");

  console.log("=== BRIEF FROM PIPELINE (simulated buildCodegenBrief) ===");
  console.log("Length:", brief.length, "chars");
  console.log("Contains 'Component Schemas':", brief.includes("Component Schemas"));
  console.log();
  console.log(brief);
  console.log();
  console.log("=== END BRIEF ===");
}

main().catch(e => { console.error(e); process.exit(1); });
