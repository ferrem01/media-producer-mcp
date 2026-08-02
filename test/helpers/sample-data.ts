/**
 * Schema -> representative sample data, for the component certification sweep.
 *
 * The component schemas declare field shapes but carry no examples, so the
 * sweep synthesizes plausible data by type with name-aware strings: enough
 * for every text run, label, chip and panel to actually render, which is all
 * the gates need. Deterministic on purpose -- same schema, same data.
 */

type SchemaField = {
  type?: string;
  optional?: boolean;
  items?: SchemaField & { properties?: Record<string, SchemaField> };
  properties?: Record<string, SchemaField>;
  description?: string;
};

const BY_NAME: Array<[RegExp, unknown]> = [
  [/^(text|headline|title|claim|statement|line)$/i, "Marketing ships faster with one agent"],
  [/^(label|name)$/i, "LinkedIn"],
  [/^(kicker|tag|badge|chip)$/i, "5 CHANNELS"],
  [/^(meta|subtitle|subtext|caption|description|body)$/i, "Twelve deliverables, five channels, one review."],
  [/^(cta|button)$/i, "Try Quotient"],
  [/^(tagline)$/i, "One agent. Every channel."],
  [/^(quote)$/i, "It planned the whole launch before my coffee cooled."],
  [/^(author|speaker|owner|user)$/i, "Marc F."],
  [/^(handle|username)$/i, "@quotient"],
  [/^(url|href|link)$/i, "https://getquotient.ai"],
  [/^(src|image|image_url|logo|logo_url|avatar|poster|thumbnail)/i, ""],
  [/^(value|count|number|stat)$/i, 42],
  [/^(prefix)$/i, "$"],
  [/^(suffix|unit)$/i, "%"],
  [/^(percent|progress)$/i, 64],
  [/^(duration|seconds|at|delay|hold)$/i, 0.4],
  [/^(scene_index|index)$/i, "02 / 05"],
  [/^(date|time|updated)$/i, "Jul 9, 2026"],
  [/^(id|key|from|to)$/i, "a"],
];

function sampleString(name: string): string {
  for (const [re, v] of BY_NAME) if (re.test(name) && typeof v === "string") return v;
  return "Quotient launch";
}

function sampleValue(name: string, field: SchemaField, depth: number): unknown {
  for (const [re, v] of BY_NAME) if (re.test(name)) return v;
  const t = (field.type || "string").toLowerCase();
  if (t === "string") return sampleString(name);
  if (t === "number" || t === "integer") return 42;
  if (t === "boolean") return true;
  if (t === "array") {
    if (depth > 3) return [];
    const item = field.items || { type: "string" };
    const make = (i: number): unknown => {
      if (item.properties) {
        const o: Record<string, unknown> = {};
        for (const [k, f] of Object.entries(item.properties)) {
          o[k] = sampleValue(k, f, depth + 1);
        }
        // Distinct ids/labels so edges and lists read as real structures.
        if ("id" in o) o.id = String.fromCharCode(97 + i);
        if ("from" in o) o.from = String.fromCharCode(97 + i);
        if ("to" in o) o.to = String.fromCharCode(98 + i);
        if ("label" in o && typeof o.label === "string") {
          o.label = ["LinkedIn", "Email", "Blog"][i] || "Web";
        }
        return o;
      }
      return sampleValue(name.replace(/s$/, ""), item, depth + 1);
    };
    return [make(0), make(1), make(2)];
  }
  if (t === "object" && field.properties) {
    const o: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(field.properties)) o[k] = sampleValue(k, f, depth + 1);
    return o;
  }
  return sampleString(name);
}

/** Build sample data for a component schema's `data` block. */
export function sampleDataFor(
  schemaData: Record<string, SchemaField>,
  theme: "light" | "dark",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(schemaData || {})) {
    if (/^(script|camera|beats)$/i.test(name)) continue; // performables boot in default state
    if (name === "theme") { out.theme = theme; continue; }
    const v = sampleValue(name, field, 0);
    if (v !== "" || !/^(src|image|logo|avatar|poster|thumbnail)/i.test(name)) out[name] = v;
  }
  return out;
}
