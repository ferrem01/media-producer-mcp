/**
 * Robust JSON parsing for LLM output.
 *
 * The #1 way an otherwise-valid-looking LLM JSON response fails to parse is a
 * literal control character (a raw newline, tab, or carriage return) sitting
 * inside a string value -- the model writes natural multi-line prose into a
 * field like "action" or "visual_notes" without escaping it to \n. JSON.parse
 * rejects that outright ("Expected ',' or ']' after array element", pointing
 * at the character right after the raw newline). This showed up switching the
 * codegen model to Sonnet 5 and killed a whole generation before a single
 * scene was built.
 */

/** Strip a ```json ... ``` (or bare ```) fence if the response is wrapped in one. */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const firstNewline = trimmed.indexOf("\n");
  let body = firstNewline > -1 ? trimmed.substring(firstNewline + 1) : trimmed;
  const lastFence = body.lastIndexOf("```");
  if (lastFence > -1) body = body.substring(0, lastFence);
  return body.trim();
}

/**
 * Escape literal control characters (\n, \r, \t) that appear INSIDE JSON
 * string literals, leaving everything outside strings (and already-escaped
 * sequences) untouched. A single forward scan tracking string/escape state --
 * safe because it only rewrites bytes that would otherwise make the JSON
 * invalid, never bytes that were already valid.
 */
function escapeControlCharsInStrings(raw: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      out += ch;
      continue;
    }
    if (ch === "\n") { out += "\\n"; continue; }
    if (ch === "\r") { continue; } // typically paired with \n; drop the bare CR
    if (ch === "\t") { out += "\\t"; continue; }
    out += ch;
  }
  return out;
}

/** Extract the outermost {...} or [...] substring, whichever starts first. */
function extractJsonSpan(raw: string): string | null {
  const firstObj = raw.indexOf("{");
  const firstArr = raw.indexOf("[");
  const useObj = firstObj >= 0 && (firstArr < 0 || firstObj < firstArr);
  const open = useObj ? "{" : "[";
  const close = useObj ? "}" : "]";
  const first = useObj ? firstObj : firstArr;
  const last = raw.lastIndexOf(close);
  if (first < 0 || last <= first) return null;
  return raw.substring(first, last + 1);
}

/**
 * Parse an LLM's JSON response, tolerating the common failure modes: a code
 * fence wrapper, and raw control characters inside string values. Tries, in
 * order: fenced-stripped as-is, sanitized, extracted-span as-is, extracted-span
 * sanitized. Throws with a truncated snippet of the original text if all fail.
 */
export function parseLlmJson(raw: string, context?: string): any {
  const stripped = stripFence(raw);

  const attempts: Array<() => any> = [
    () => JSON.parse(stripped),
    () => JSON.parse(escapeControlCharsInStrings(stripped)),
    () => {
      const span = extractJsonSpan(stripped);
      if (!span) throw new Error("no JSON span found");
      return JSON.parse(span);
    },
    () => {
      const span = extractJsonSpan(stripped);
      if (!span) throw new Error("no JSON span found");
      return JSON.parse(escapeControlCharsInStrings(span));
    },
  ];

  for (const attempt of attempts) {
    try { return attempt(); } catch { /* try the next strategy */ }
  }
  const label = context ? ` from ${context}` : "";
  throw new Error(`Invalid JSON${label}: ${stripped.substring(0, 300)}`);
}
