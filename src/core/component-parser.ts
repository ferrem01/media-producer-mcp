/**
 * Single-file component parser.
 *
 * Parses .component.html files into their three sections:
 *   <template>  -- HTML structure
 *   <style scoped> -- CSS (auto-scoped per instance)
 *   <script>    -- GSAP timeline factory
 */

export interface ParsedComponent {
  template: string;
  style: string;
  script: string;
  schema?: Record<string, unknown>;
}

/**
 * Parse a single-file .component.html into its sections.
 */
export function parseComponent(source: string): ParsedComponent {
  const template = extractSection(source, "template");
  const style = extractSection(source, "style");
  const script = extractSection(source, "script");
  const schema = extractSchema(source);

  if (!template) {
    throw new Error("Component missing <template> section");
  }
  if (!script) {
    throw new Error("Component missing <script> section");
  }

  return { template, style: style ?? "", script, schema };
}

/**
 * Extract content between opening and closing tags.
 * Handles attributes on the opening tag (e.g. <style scoped>).
 */
function extractSection(source: string, tag: string): string | null {
  // Match <tag ...> or <tag> through </tag>
  const regex = new RegExp(
    `<${tag}(?:\\s[^>]*)?>\\s*([\\s\\S]*?)\\s*</${tag}>`,
    "i"
  );
  const match = source.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract embedded schema from <meta name="component-schema"> if present.
 */
function extractSchema(source: string): Record<string, unknown> | undefined {
  const metaRegex = /<meta\s+name=["']component-schema["']\s+content='([^']*)'/i;
  const match = source.match(metaRegex);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Bind data to a template by replacing {{key}} placeholders.
 * Handles nested keys with dot notation: {{user.name}}.
 * Leaves unmatched placeholders empty.
 */
export function bindTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
    const value = resolveKey(data, key);
    if (value === undefined || value === null) return "";
    return escapeHtml(String(value));
  });
}

function resolveKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Scope CSS selectors by prefixing them with [data-cid="<instanceId>"].
 * This prevents style collisions between component instances.
 */
export function scopeCSS(css: string, instanceId: string): string {
  const scope = `[data-cid="${instanceId}"]`;
  const lines = css.split("\n");
  const output: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Pass through @-rules (imports, keyframes, media)
    if (trimmed.startsWith("@")) {
      output.push(line);
      continue;
    }

    // Pass through closing braces, empty lines, comments
    if (!trimmed || trimmed === "}" || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      output.push(line);
      continue;
    }

    // Lines that contain a { are selector lines
    if (trimmed.includes("{")) {
      // Extract selector part (everything before the {)
      const braceIdx = trimmed.indexOf("{");
      const selectorPart = trimmed.substring(0, braceIdx);
      const rest = trimmed.substring(braceIdx);

      const scoped = selectorPart
        .split(",")
        .map((sel) => {
          const s = sel.trim();
          if (!s) return s;
          if (s === ":root" || s === "html" || s === "body") return scope;
          return `${scope} ${s}`;
        })
        .join(", ");

      output.push(`${scoped} ${rest}`);
      continue;
    }

    // Everything else (property declarations) passes through
    output.push(line);
  }

  return output.join("\n");
}
