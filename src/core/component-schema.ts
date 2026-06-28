/**
 * Component schema generation.
 *
 * Every component on disk is meant to be a pair: `{type}.component.html`
 * (the renderable template) and `{type}.schema.json` (the machine-readable
 * interface the storyboard builder/codegen catalog is built from). Without the schema,
 * a component renders fine when referenced by type but is INVISIBLE to the
 * storyboard builder -- it never gets proposed.
 *
 * This module is the single source of truth for turning a component's source
 * into that schema, so the generator and the playground stay consistent.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parseComponent } from "./component-parser.js";

export interface ComponentSchema {
  type: string;
  label: string;
  category: string;
  description: string;
  data: Record<string, unknown>;
}

function titleCase(type: string): string {
  return type
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Derive the `data` field map from a component's source by scanning for the
 * three ways a component reads data: `{{mustache}}` placeholders, `data.field`
 * / `data["field"]` references in the script, and `data-bind="field"` attrs.
 * Each discovered field becomes an optional string field (the storyboard builder mainly
 * needs to know the field *exists* and its name).
 */
export function deriveDataFields(source: string): Record<string, unknown> {
  const fields = new Set<string>();

  // {{field}}, {{{field}}}, {{#field}}, {{^field}} -- take the first segment
  const mustache = /\{\{\{?[#^/]?\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
  // data.field
  const dotAccess = /\bdata\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  // data["field"] / data['field']
  const bracketAccess = /\bdata\[\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s*\]/g;
  // data-bind="field"
  const dataBind = /data-bind=["']([a-zA-Z_][a-zA-Z0-9_]*)["']/g;

  for (const re of [mustache, dotAccess, bracketAccess, dataBind]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      fields.add(m[1]);
    }
  }

  const data: Record<string, unknown> = {};
  for (const name of fields) {
    data[name] = { type: "string", label: titleCase(name), optional: true };
  }
  return data;
}

/**
 * Build a schema object for a component from its source. Prefers an embedded
 * `<meta name="component-schema">` if present; otherwise derives `data` fields
 * from the source.
 */
export function buildComponentSchema(
  type: string,
  category: string,
  source: string,
  description = "Custom component",
): ComponentSchema {
  let embedded: Record<string, unknown> | undefined;
  try {
    embedded = parseComponent(source).schema;
  } catch {
    embedded = undefined;
  }

  const data =
    embedded && Object.keys(embedded).length > 0 ? embedded : deriveDataFields(source);

  return { type, label: titleCase(type), category, description, data };
}

/**
 * Write `{type}.schema.json` next to the component in `dir`. This is what keeps
 * a saved component visible to the storyboard builder. Safe to call right after writing
 * the `.component.html`.
 */
export async function writeComponentSchema(
  dir: string,
  type: string,
  category: string,
  source: string,
  description = "Custom component",
): Promise<string> {
  const schema = buildComponentSchema(type, category, source, description);
  const schemaPath = path.join(dir, `${type}.schema.json`);
  await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2), "utf-8");
  return schemaPath;
}
