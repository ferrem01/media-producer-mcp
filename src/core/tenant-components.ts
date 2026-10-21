/**
 * A tenant's OWN components: web captures (mintCapturedComponent writes the
 * html FLAT at the tenant components root, its schema and reference
 * screenshot under captured/) and playground saves (html + schema in a
 * category subdir). One reader for every surface that lists or opens them --
 * the playground API and the MCP list/get tools -- so a capture is found the
 * same way everywhere.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { tenantComponentsDir } from "../persistence/paths.js";

export interface TenantComponentEntry {
  type: string;
  /** "captured" for a web capture, else the playground category dir. */
  category: string;
  label: string;
  description?: string;
  /** Web captures: where and when it was taken, and the region's size. */
  source_url?: string;
  captured_at?: string;
  width?: number;
  height?: number;
}

export interface TenantComponent extends TenantComponentEntry {
  source: string;
  schema: Record<string, unknown> | null;
  /** The capture's reference screenshot (its visual contract), if kept. */
  refPath?: string;
}

const TYPE_RE = /^[a-z0-9][a-z0-9-]*$/;

function titleCase(t: string): string {
  return t.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await fs.readFile(p, "utf-8")); } catch { return null; }
}

function entryOf(type: string, category: string, schema: Record<string, unknown> | null): TenantComponentEntry {
  const cap = (schema?.capture || {}) as Record<string, unknown>;
  return {
    type,
    category,
    label: typeof schema?.label === "string" ? schema.label : titleCase(type),
    ...(typeof schema?.description === "string" ? { description: schema.description } : {}),
    ...(typeof cap.source_url === "string" ? { source_url: cap.source_url } : {}),
    ...(typeof cap.captured_at === "string" ? { captured_at: cap.captured_at } : {}),
    ...(typeof cap.width === "number" ? { width: cap.width } : {}),
    ...(typeof cap.height === "number" ? { height: cap.height } : {}),
  };
}

/** Where a type's html and schema live: flat (a capture) first, then the
 *  category subdirs. */
async function locate(root: string, type: string): Promise<{ html: string; schema: string; category: string; ref?: string } | null> {
  const flat = path.join(root, `${type}.component.html`);
  if (await fs.access(flat).then(() => true, () => false)) {
    return { html: flat, schema: path.join(root, "captured", `${type}.schema.json`), category: "captured", ref: path.join(root, "captured", `${type}.capture-ref.png`) };
  }
  let dirs: string[] = [];
  try { dirs = (await fs.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return null; }
  for (const dir of dirs) {
    const html = path.join(root, dir, `${type}.component.html`);
    if (await fs.access(html).then(() => true, () => false)) return { html, schema: path.join(root, dir, `${type}.schema.json`), category: dir };
  }
  return null;
}

/** Every component in the tenant's own library. */
export async function listTenantComponents(tenantId: string, root = tenantComponentsDir(tenantId)): Promise<TenantComponentEntry[]> {
  const out: TenantComponentEntry[] = [];
  let entries: import("node:fs").Dirent[] = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(".component.html")) {
      const type = e.name.replace(".component.html", "");
      out.push(entryOf(type, "captured", await readJson(path.join(root, "captured", `${type}.schema.json`))));
      continue;
    }
    if (!e.isDirectory()) continue;
    let files: string[] = [];
    try { files = await fs.readdir(path.join(root, e.name)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".component.html")) continue;
      const type = f.replace(".component.html", "");
      out.push(entryOf(type, e.name, await readJson(path.join(root, e.name, `${type}.schema.json`))));
    }
  }
  return out.sort((a, b) => a.type.localeCompare(b.type));
}

/** One of the tenant's components: its html, schema and reference
 *  screenshot path. Null when the tenant has no such type. */
export async function readTenantComponent(tenantId: string, type: string, root = tenantComponentsDir(tenantId)): Promise<TenantComponent | null> {
  if (!TYPE_RE.test(type)) return null;
  const at = await locate(root, type);
  if (!at) return null;
  const schema = await readJson(at.schema);
  const refPath = at.ref && (await fs.access(at.ref).then(() => true, () => false)) ? at.ref : undefined;
  return { ...entryOf(type, at.category, schema), source: await fs.readFile(at.html, "utf-8"), schema, ...(refPath ? { refPath } : {}) };
}
