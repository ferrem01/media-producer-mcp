/**
 * What a brief LOCKS (SPEC-briefs.md, the sheet-row test): the hook, the
 * storyline's mechanics, the must-say lines and the end line are the
 * instructions a marketing brief gives verbatim. A feedback redraft rewrites
 * the whole board, and measured live (proj_3ce292de) a "tighten it and add
 * the close" pass rewrote the hook sentence and dropped the burst of task
 * cards the storyline was built on -- because the redraft was handed only
 * the feedback and the previous narrative, never the brief. Now every
 * redraft carries the brief's locks as non-negotiable, and the board is
 * checked against them afterwards.
 */

export interface BriefLocks {
  /** Quoted lines the brief wants verbatim (the hook, the end line, must-say lines). */
  quotes: string[];
  /** Named sections a redraft must keep the substance of. */
  sections: Array<{ name: string; text: string }>;
}

// A header may carry an aside before its colon: "STORYLINE (follow this beat
// for beat):", "CTA / END LINE, verbatim:".
const SECTION_RE = /^\s*(?:#+\s*)?(opening hook|hook|storyline|story line|problem|cta\s*\/\s*end line|end line|cta|must[- ]say(?: lines)?|visual direction|quotient solution|solution)\s*(?:\([^)]*\))?\s*(?:,[^:\n]*)?\s*[:\-–]\s*(.*)$/i;

/** Pull the locks out of a brief's prose. Quotes of four words or more count;
 *  so does any quoted line introduced by "verbatim"/"exactly"/"must say". */
export function extractBriefLocks(brief: string | undefined | null): BriefLocks {
  const text = String(brief || "");
  const quotes = new Set<string>();
  for (const m of text.matchAll(/[“"]([^”"\n]{6,240})[”"]/g)) {
    const q = m[1].trim();
    const words = q.split(/\s+/).length;
    const intro = text.slice(Math.max(0, m.index! - 60), m.index!).toLowerCase();
    if (words >= 4 || /verbatim|exactly|must[- ]say|end line|hook/.test(intro)) quotes.add(q);
  }
  const sections: BriefLocks["sections"] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SECTION_RE);
    if (!m) continue;
    let body = m[2].trim();
    let j = i + 1;
    while (j < lines.length && lines[j].trim() && !SECTION_RE.test(lines[j])) { body += (body ? " " : "") + lines[j].trim(); j++; }
    if (body) sections.push({ name: m[1].toLowerCase().replace(/\s+/g, " "), text: body });
  }
  return { quotes: [...quotes], sections };
}

/** The block a redraft prompt carries. Empty when the brief locks nothing. */
export function briefLockBlock(locks: BriefLocks): string {
  if (!locks.quotes.length && !locks.sections.length) return "";
  const out: string[] = ["## LOCKED BY THE BRIEF (a redraft keeps these; the feedback below changes nothing here)"];
  if (locks.quotes.length) {
    out.push("Lines that appear on screen or in the voiceover VERBATIM, exactly as written:");
    for (const q of locks.quotes) out.push(`- "${q}"`);
  }
  for (const s of locks.sections) out.push(`${s.name.toUpperCase()}: ${s.text}`);
  out.push("Keep the storyline's mechanics beat for beat (what appears, what it turns into, where the hard cut lands). Tightening a scene shortens it; it never removes the thing the beat exists to show.");
  return out.join("\n");
}

// JSON.stringify writes a newline as the two characters \n; treat those as space too.
// Words only: the writer breaks a locked sentence across lines, stars a
// word for emphasis (*remembers*) and moves a comma -- none of that is a
// dropped line (measured live, proj_6c7bd4ca: three false warnings).
const norm = (s: string) => s.toLowerCase().replace(/\\[nrt]/g, " ").replace(/[“”"'’‘*_]/g, "").replace(/[.,;:!?()\-–—/]+/g, " ").replace(/\s+/g, " ").trim();

/** Locked quotes the board does not carry anywhere (voiceover, template slots, component data). */
export function missingLocks(storyboard: unknown, locks: BriefLocks): string[] {
  const hay = norm(JSON.stringify(storyboard || {}));
  return locks.quotes.filter((q) => !hay.includes(norm(q)));
}

/** A compact record of the board being revised, for the redraft prompt. */
export function previousBoardBlock(storyboard: any): string {
  const scenes: any[] = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  if (!scenes.length) return "";
  const out = ["## PREVIOUS STORYBOARD (the board being revised -- keep every scene the feedback does not name, cast and copy included)"];
  scenes.forEach((s, i) => {
    const comps = (s.components || []).map((c: any) => (typeof c === "string" ? c : c?.type)).filter(Boolean);
    const cast = s.scene_template?.type ? `template ${s.scene_template.type}` : comps.length ? `components ${comps.join(", ")}` : "no cast";
    const extras = [s.hero_image ? `hero_image: ${s.hero_image}` : "", s.broll_query ? `broll: ${s.broll_query}` : "", Array.isArray(s.assets) && s.assets.length ? `needs: ${s.assets.map((a: any) => a?.type).filter(Boolean).join(", ")}` : ""].filter(Boolean);
    out.push(`${i + 1}. ${s.label || "Scene " + (i + 1)} [${s.duration_seconds ?? "?"}s] -- ${cast}${extras.length ? " -- " + extras.join("; ") : ""}`);
    if (s.voiceover_text) out.push(`   VO: ${String(s.voiceover_text).replace(/\s+/g, " ").trim()}`);
    if (s.purpose) out.push(`   purpose: ${String(s.purpose).replace(/\s+/g, " ").trim()}`);
  });
  return out.join("\n");
}
