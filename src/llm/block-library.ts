/**
 * Block Library
 *
 * Unified index of all component .html files as composable "blocks."
 * The LLM reads block source and inlines/adapts it when generating scenes.
 * Replaces both the rigid component catalog (for codegen) and the
 * curated component-reference.ts (which only loaded 5 components).
 *
 * Components on disk are unchanged -- this is a read-only index.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var COMPONENTS_ROOT = path.resolve(__dirname, "..", "components");

// ── Types ──

export interface Block {
  /** Component type name, e.g. "quotient-chat" */
  type: string;
  /** Category folder, e.g. "mockups", "data-viz" */
  category: string;
  /** Human-readable label */
  label: string;
  /** What this block is good for */
  description: string;
  /** Searchable tags */
  tags: string[];
  /** Relative path from components root */
  relPath: string;
  /** Approximate source size in bytes */
  sizeBytes: number;
  /** What patterns/techniques this block demonstrates */
  demonstrates: string;
  /** Whether this block has script actions (interactive/scriptable) */
  scriptable: boolean;
}

// ── Curated metadata for blocks that deserve richer descriptions ──
// Blocks not in this map get auto-generated descriptions from their schema.

var BLOCK_META: Record<string, { demonstrates: string; tags?: string[] }> = {
  "quotient-chat": {
    demonstrates: "Chat interface, message bubbles, typing indicator, conversation flow, agent/user roles",
    tags: ["chat", "conversation", "messages", "typing", "agent", "ui", "saas"],
  },
  "canva-editor": {
    demonstrates: "Design editor UI, sidebar tools, canvas area, zoom controls, page navigation",
    tags: ["editor", "design", "canvas", "tools", "sidebar", "creative"],
  },
  "quotient-social": {
    demonstrates: "Social media post editor, LinkedIn-style preview, status bar, engagement metrics, embed card",
    tags: ["social", "linkedin", "post", "editor", "engagement", "publish"],
  },
  "chat-simulator": {
    demonstrates: "Cursor animation, typing effects, UI interaction simulation, message staggering",
    tags: ["chat", "cursor", "typing", "interaction", "animation"],
  },
  "claude-chat-composer": {
    demonstrates: "AI chat composer, multi-level menu, connector toggles, model selector, two-tier popover",
    tags: ["chat", "composer", "menu", "toggles", "ai", "claude"],
  },
  "dashboard-kpi": {
    demonstrates: "KPI cards, sparkline charts, metric counters, grid layout, data visualization",
    tags: ["dashboard", "kpi", "metrics", "charts", "data", "grid"],
  },
  "browser-frame": {
    demonstrates: "Browser chrome, address bar, tab strip, realistic device framing",
    tags: ["browser", "frame", "chrome", "device", "mockup"],
  },
  "metric-dashboard": {
    demonstrates: "Charts, animated counters, data-driven animation, responsive grid",
    tags: ["metrics", "dashboard", "charts", "counters", "data-viz"],
  },
  "hero-reveal": {
    demonstrates: "Text animation, dramatic reveal, staggered entrance, clip-path techniques",
    tags: ["text", "reveal", "title", "entrance", "clip-path", "hero"],
  },
  "slack-workspace": {
    demonstrates: "Slack UI mockup, channel list, messages, threads, workspace sidebar",
    tags: ["slack", "workspace", "messages", "channels", "ui", "saas"],
  },
  "code-editor": {
    demonstrates: "Code editor UI, syntax highlighting, line numbers, file tabs, terminal",
    tags: ["code", "editor", "syntax", "terminal", "dev"],
  },
  "kanban-board": {
    demonstrates: "Kanban columns, draggable cards, status labels, project management UI",
    tags: ["kanban", "board", "cards", "project", "management"],
  },
  "split-screen": {
    demonstrates: "Two-panel layout, side-by-side comparison, responsive split",
    tags: ["split", "layout", "comparison", "panels", "side-by-side"],
  },
};

// ── Singleton cache ──

var _blocks: Block[] | null = null;
var _sourceCache: Map<string, string> = new Map();

/**
 * Build the block index by scanning the components directory.
 * Cached after first call.
 */
export async function getBlockLibrary(): Promise<Block[]> {
  if (_blocks !== null) return _blocks;

  var blocks: Block[] = [];

  try {
    var categories = await fs.readdir(COMPONENTS_ROOT, { withFileTypes: true });

    for (var cat of categories) {
      if (!cat.isDirectory() || cat.name === "shared") continue;

      var catDir = path.join(COMPONENTS_ROOT, cat.name);
      var files = await fs.readdir(catDir);

      for (var file of files) {
        if (!file.endsWith(".component.html")) continue;

        var type = file.replace(".component.html", "");
        var filePath = path.join(catDir, file);
        var relPath = path.join(cat.name, file);

        // Try to read schema for description
        var schemaPath = path.join(catDir, type + ".schema.json");
        var description = "";
        var scriptable = false;
        var schemaDescription = "";

        try {
          var schemaRaw = await fs.readFile(schemaPath, "utf-8");
          var schema = JSON.parse(schemaRaw);
          schemaDescription = schema.description || "";
          scriptable = !!(schema.script_actions && schema.script_actions.length > 0);
        } catch {
          // No schema -- that's fine
        }

        // Get file size
        var stat = await fs.stat(filePath);

        // Build block entry
        var meta = BLOCK_META[type];
        var label = type.split("-").map(function(w) {
          return w.charAt(0).toUpperCase() + w.slice(1);
        }).join(" ");

        blocks.push({
          type,
          category: cat.name,
          label,
          description: schemaDescription || `${label} block`,
          tags: meta?.tags || buildAutoTags(type, cat.name),
          relPath,
          sizeBytes: stat.size,
          demonstrates: meta?.demonstrates || schemaDescription || `${label} UI patterns`,
          scriptable,
        });
      }
    }
  } catch (err) {
    console.error("[block-library] Failed to scan components:", err);
  }

  _blocks = blocks;
  return blocks;
}

/**
 * Search the block library by query string.
 * Matches against type, label, description, tags, and demonstrates.
 */
export async function searchBlocks(query: string): Promise<Block[]> {
  var blocks = await getBlockLibrary();
  var q = query.toLowerCase();
  var terms = q.split(/\s+/).filter(function(t) { return t.length > 1; });

  var scored = blocks.map(function(block) {
    var score = 0;
    var searchable = [
      block.type,
      block.label,
      block.description,
      block.demonstrates,
      block.category,
      ...block.tags,
    ].join(" ").toLowerCase();

    for (var term of terms) {
      if (block.type.includes(term)) score += 10;
      if (block.tags.some(function(t) { return t.includes(term); })) score += 5;
      if (searchable.includes(term)) score += 2;
    }

    return { block, score };
  });

  return scored
    .filter(function(s) { return s.score > 0; })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 10)
    .map(function(s) { return s.block; });
}

/**
 * Read a block's source HTML.
 * Results are cached in memory.
 */
export async function readBlockSource(type: string): Promise<string | null> {
  if (_sourceCache.has(type)) return _sourceCache.get(type)!;

  var blocks = await getBlockLibrary();
  var block = blocks.find(function(b) { return b.type === type; });
  if (!block) return null;

  try {
    var source = await fs.readFile(
      path.join(COMPONENTS_ROOT, block.relPath),
      "utf-8",
    );
    _sourceCache.set(type, source);
    return source;
  } catch {
    return null;
  }
}

/**
 * Read multiple blocks and format them for composition.
 * Returns a structured guide with all sources and composition instructions.
 */
export async function composeBlocks(types: string[]): Promise<string> {
  var sources: Array<{ type: string; source: string; block: Block }> = [];

  for (var type of types) {
    var source = await readBlockSource(type);
    if (!source) continue;
    var blocks = await getBlockLibrary();
    var block = blocks.find(function(b) { return b.type === type; });
    if (block) sources.push({ type, source, block });
  }

  if (sources.length === 0) {
    return "No matching blocks found. Use search_library to find available blocks.";
  }

  var lines: string[] = [
    `## Block Composition Guide (${sources.length} blocks)`,
    "",
    "You have the full source for each block below. To compose them into one scene:",
    "",
    "1. Study each block's <template> HTML -- inline the parts you need into your scene layout",
    "2. Each block's <style scoped> CSS should be adapted with a wrapper class to avoid collisions",
    "   e.g. .block-chat { ... } and .block-editor { ... }",
    "3. Each block has a createTimeline(el, data, ctx) function. Rename them:",
    "   e.g. createTimeline_chat(el, data, ctx), createTimeline_editor(el, data, ctx)",
    "4. Your scene's master createTimeline() orchestrates the block timelines:",
    "",
    "```javascript",
    "function createTimeline(el, data, ctx) {",
    "  var tl = gsap.timeline();",
    "  var totalDuration = ctx.duration;",
    "",
    "  // Beat 1: show chat block",
    "  tl.addLabel('chat', 0);",
    "  var chatTl = createTimeline_chat(el.querySelector('.block-chat'), chatData, ctx);",
    "  tl.add(chatTl, 'chat');",
    "",
    "  // Beat 2: slide chat left, bring in editor",
    "  tl.addLabel('editor', 8);",
    "  tl.to('.block-chat', { left: '5%', width: '45%', duration: 0.8 }, 'editor');",
    "  var editorTl = createTimeline_editor(el.querySelector('.block-editor'), editorData, ctx);",
    "  tl.add(editorTl, 'editor');",
    "",
    "  return tl;",
    "}",
    "```",
    "",
    "5. Position blocks with absolute positioning within a shared container",
    "6. Blocks start hidden (opacity: 0) and are revealed by your choreography",
    "7. Keep the Build-Breathe-Resolve pattern across the full scene duration",
    "",
  ];

  for (var s of sources) {
    lines.push(`### Block: ${s.type}`);
    lines.push(`**${s.block.label}** (${s.block.category}) -- ${s.block.demonstrates}`);
    lines.push(`Scriptable: ${s.block.scriptable ? "Yes (has script actions)" : "No"}`);
    lines.push(`Size: ${(s.block.sizeBytes / 1024).toFixed(1)}KB`);
    lines.push("");
    lines.push("```html");
    lines.push(s.source.trim());
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format search results for LLM display.
 */
export function formatSearchResults(blocks: Block[]): string {
  if (blocks.length === 0) return "No blocks found matching your query.";

  return blocks.map(function(b) {
    var tags = b.tags.slice(0, 4).join(", ");
    return `- **${b.type}** (${b.category}) -- ${b.description}${b.scriptable ? " 🎬" : ""}\n  Demonstrates: ${b.demonstrates}\n  Tags: ${tags}`;
  }).join("\n\n");
}

// ── Helpers ──

function buildAutoTags(type: string, category: string): string[] {
  var tags = type.split("-").filter(function(t) { return t.length > 2; });
  tags.push(category);
  return tags;
}
