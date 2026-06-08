/**
 * Component Catalog Builder
 *
 * Reads .schema.json files from the component library (and optionally
 * tenant-specific components) and builds a catalog the LLM can reference.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface ComponentCatalogEntry {
  type: string;
  category: string;
  label?: string;
  description?: string;
  data: Record<string, {
    type: string;
    label?: string;
    required?: boolean;
    optional?: boolean;
    placeholder?: string;
    items?: { type: string };
  }>;
  script_actions?: Array<{ action: string; description: string }>;
  default_cursor_targets?: Record<string, { x: string | number; y: string | number }>;
}

/**
 * Build the component catalog from schema files on disk.
 */
export async function buildComponentCatalog(
  componentLibDir: string,
  tenantComponentsDir?: string,
): Promise<ComponentCatalogEntry[]> {
  var catalog: ComponentCatalogEntry[] = [];

  // Scan built-in library
  await scanDirectory(componentLibDir, catalog);

  // Scan tenant components (if provided)
  if (tenantComponentsDir) {
    await scanDirectory(tenantComponentsDir, catalog);
  }

  return catalog;
}

async function scanDirectory(
  dir: string,
  catalog: ComponentCatalogEntry[],
): Promise<void> {
  try {
    var entries = await fs.readdir(dir, { withFileTypes: true });
    for (var entry of entries) {
      if (!entry.isDirectory() || entry.name === "shared") continue;

      var catDir = path.join(dir, entry.name);
      var files = await fs.readdir(catDir);

      for (var file of files) {
        if (!file.endsWith(".schema.json")) continue;

        try {
          var schemaPath = path.join(catDir, file);
          var raw = await fs.readFile(schemaPath, "utf-8");
          var schema = JSON.parse(raw);

          var compType = file.replace(".schema.json", "");
          catalog.push({
            type: compType,
            category: schema.category || entry.name,
            label: schema.label || compType.split("-").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" "),
            description: schema.description || "",
            data: schema.data || schema.properties || {},
            script_actions: schema.script_actions,
            default_cursor_targets: schema.default_cursor_targets,
          });
        } catch {
          // Skip invalid schemas
        }
      }
    }
  } catch {
    // Directory doesn't exist, skip
  }
}

/**
 * Format the catalog into a string the LLM can reference in prompts.
 */
export function formatCatalogForPrompt(catalog: ComponentCatalogEntry[]): string {
  if (catalog.length === 0) {
    return "(No components available in the library. All components must be custom-generated.)";
  }

  var lines: string[] = [];

  // Group by category
  var byCategory = new Map<string, ComponentCatalogEntry[]>();
  for (var entry of catalog) {
    var list = byCategory.get(entry.category);
    if (!list) {
      list = [];
      byCategory.set(entry.category, list);
    }
    list.push(entry);
  }

  for (var [category, entries] of byCategory) {
    lines.push(`### ${category}`);
    lines.push("");

    for (var comp of entries) {
      lines.push(`**${comp.type}**${comp.label ? ` - ${comp.label}` : ""}`);
      if (comp.description) {
        lines.push(`  ${comp.description}`);
      }

      var dataKeys = Object.keys(comp.data);
      if (dataKeys.length > 0) {
        lines.push("  Data fields:");
        for (var key of dataKeys) {
          var field = comp.data[key];
          var reqStr = field.required ? " (required)" : field.optional ? " (optional)" : "";
          var typeStr = field.type;
          if (field.items) typeStr += `<${field.items.type}>`;
          lines.push(`    - ${key}: ${typeStr}${reqStr}${field.label ? ` -- ${field.label}` : ""}`);
        }
      }

      if (comp.script_actions && comp.script_actions.length > 0) {
        lines.push("  🎬 Scriptable -- supports interactive animations via script + cursor_targets in data:");
        for (var sa of comp.script_actions) {
          lines.push(`    - ${sa.action}: ${sa.description}`);
        }
        if (comp.default_cursor_targets) {
          var targetNames = Object.keys(comp.default_cursor_targets);
          lines.push(`  Default cursor targets: ${targetNames.join(", ")}`);
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}
