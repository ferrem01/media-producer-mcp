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
 * sanitized.
 *
 * On total failure, the thrown error carries the REAL underlying SyntaxError
 * (message + position) plus a window of text around that position, not just
 * the first 300 characters of a possibly-thousands-of-characters response --
 * a truncated-at-the-start error is nearly useless when the break is deep
 * inside a large storyboard (this bit us: the first version of this function
 * printed a clean-looking opening brace and nothing about where it actually
 * broke).
 */
export function parseLlmJson(raw: string, context?: string): any {
  const stripped = stripFence(raw);
  const span = extractJsonSpan(stripped);

  const attempts: Array<{ label: string; text: string }> = [
    { label: "raw", text: stripped },
    { label: "sanitized", text: escapeControlCharsInStrings(stripped) },
    ...(span ? [{ label: "span", text: span }] : []),
    ...(span ? [{ label: "span+sanitized", text: escapeControlCharsInStrings(span) }] : []),
  ];

  let lastError: unknown;
  let lastText = stripped;
  for (const a of attempts) {
    try { return JSON.parse(a.text); }
    catch (e) { lastError = e; lastText = a.text; }
  }

  const label = context ? ` from ${context}` : "";
  const msg = lastError instanceof Error ? lastError.message : String(lastError);

  // V8's JSON.parse error format varies by Node version: older versions say
  // "...at position N" (a plain offset); newer versions embed a "...snippet..."
  // context window directly in the message instead. Handle both so the thrown
  // error is actually diagnostic regardless of which Node runs this.
  let around = "";
  const posMatch = msg.match(/position (\d+)/);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const start = Math.max(0, pos - 150);
    const end = Math.min(lastText.length, pos + 150);
    around = ` | around position ${pos}: ${JSON.stringify(lastText.slice(start, end))}`;
  } else {
    // Newer-V8 format embeds a snippet like: ..."broken text" is not valid JSON
    const snippetMatch = msg.match(/\.\.\.("(?:[^"\\]|\\.)*")/);
    if (snippetMatch) {
      try {
        const needle = JSON.parse(snippetMatch[1]);
        const idx = lastText.indexOf(needle);
        if (idx >= 0) {
          const start = Math.max(0, idx - 150);
          const end = Math.min(lastText.length, idx + needle.length + 150);
          around = ` | around position ${idx}: ${JSON.stringify(lastText.slice(start, end))}`;
        }
      } catch { /* snippet wasn't valid JSON itself -- skip */ }
    }
  }
  throw new Error(`Invalid JSON${label}: ${msg}${around} | full text (${stripped.length} chars, first 2000 shown): ${stripped.slice(0, 2000)}`);
}
