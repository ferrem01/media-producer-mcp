/**
 * Component Reference Library
 *
 * Provides curated production component source code as reference examples
 * for the freeform scene generator. The LLM studies these patterns
 * (shadows, easing, layout, GSAP techniques) and adapts them — it does
 * NOT copy-paste template structure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var COMPONENTS_ROOT = path.resolve(__dirname, "..", "components");

interface ReferenceComponent {
  /** Relative path from src/components/ */
  file: string;
  /** Human-readable name */
  name: string;
  /** What patterns this component demonstrates */
  demonstrates: string;
}

/**
 * Curated set of our best components.
 * Order matters: most broadly useful first (used for truncation priority).
 */
var CURATED_COMPONENTS: ReferenceComponent[] = [
  {
    file: "mockups/chat-simulator.component.html",
    name: "Chat Simulator",
    demonstrates: "Cursor animation, typing effects, UI interaction simulation, message staggering",
  },
  {
    file: "mockups/dashboard-kpi.component.html",
    name: "Dashboard KPI",
    demonstrates: "Data visualization, metric cards, chart animation, number counters",
  },
  {
    file: "layouts/browser-frame.component.html",
    name: "Browser Frame",
    demonstrates: "Device framing, chrome styling, realistic UI containers",
  },
  {
    file: "data-viz/metric-dashboard.component.html",
    name: "Metric Dashboard",
    demonstrates: "Charts, animated counters, data-driven animation, grid layouts",
  },
  {
    file: "titles/hero-reveal.component.html",
    name: "Hero Reveal",
    demonstrates: "Text animation, dramatic reveal, staggered entrance, clip-path techniques",
  },
];

/** Cached result */
var _library: string | null = null;

/**
 * Load and format the component reference library.
 *
 * Returns a formatted string with each component's source and annotations.
 * Results are cached after first call.
 *
 * @param maxChars - Maximum total characters for the reference library (default 15000).
 *                   If all components exceed this, the set is truncated to fit.
 */
export function getComponentReferenceLibrary(maxChars: number = 15000): string {
  if (_library !== null) return _library;

  var sections: string[] = [];
  var totalChars = 0;

  for (var comp of CURATED_COMPONENTS) {
    var filePath = path.join(COMPONENTS_ROOT, comp.file);
    var source: string;
    try {
      source = fs.readFileSync(filePath, "utf-8");
    } catch {
      console.warn(`Component reference not found: ${filePath}`);
      continue;
    }

    var section = formatComponent(comp, source);

    // Check if adding this component would exceed the limit
    if (totalChars + section.length > maxChars && sections.length > 0) {
      console.log(
        `Component reference library truncated at ${sections.length} components ` +
        `(${totalChars} chars) to stay under ${maxChars} char limit`,
      );
      break;
    }

    sections.push(section);
    totalChars += section.length;
  }

  _library = sections.join("\n\n---\n\n");
  return _library;
}

/**
 * Format a single component for the reference library.
 */
function formatComponent(comp: ReferenceComponent, source: string): string {
  return `### ${comp.name}
**Demonstrates:** ${comp.demonstrates}

> Study the patterns here (shadows, easing, layout, GSAP techniques) and adapt them for your scene. Do NOT copy-paste — use the techniques, not the templates.

\`\`\`html
${source.trim()}
\`\`\``;
}
