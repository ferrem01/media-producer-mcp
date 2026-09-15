/**
 * Script notation for spoken lines (SPEC-take-flow.md).
 *
 * A voiceover_text is written for a person to read off a prompter, so the
 * silences have to be visible on the page, not only in the delivery:
 *
 *   - one sentence per line: the line break is a BREATH (~0.3s);
 *   - a line that says only "(pause)": a deliberate BEAT (~1s).
 *
 * Everything that counts, times or shows the script goes through here so
 * the three readers agree: the prompter (take page), the asserted spine
 * (anchors before a take exists) and the board/Studio display.
 */

export const LINE_BREATH_S = 0.3;
export const PAUSE_BEAT_S = 1.0;
export const PAUSE_GLYPH = "•••"; // •••

const PAUSE_LINE = /^\(\s*pause\s*\)$/i;
const PAUSE_TOKEN = /^\(\s*pause\s*\)[.,!?]*$/i;

export interface ScriptLine {
  /** The spoken text of the line; empty for a pause line. */
  text: string;
  /** Silence AFTER this line, in seconds (a breath, or the beat itself). */
  gapAfter: number;
  pause: boolean;
}

/** The script as lines the reader sees: sentences and pause beats. Blank
 *  lines are dropped; the last spoken line carries no trailing breath. */
export function scriptLines(script: string): ScriptLine[] {
  const raw = String(script || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ScriptLine[] = raw.map((l) => (PAUSE_LINE.test(l) ? { text: "", gapAfter: PAUSE_BEAT_S, pause: true } : { text: l, gapAfter: LINE_BREATH_S, pause: false }));
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].pause) continue;
    out[i].gapAfter = 0; // nothing follows the last spoken line
    break;
  }
  return out;
}

/** The words a person actually says: pause markers are not words. */
export function scriptWords(script: string): string[] {
  return scriptLines(script)
    .filter((l) => !l.pause)
    .flatMap((l) => l.text.split(/\s+/).filter((w) => w && !PAUSE_TOKEN.test(w)));
}

/** Seconds of authored silence in the script (breaths + beats). */
export function scriptGaps(script: string): number {
  return round(scriptLines(script).reduce((s, l) => s + l.gapAfter, 0));
}

/** How long the script takes to say at speaking pace, silences included. */
export function speakingEstimate(script: string, wordsPerSecond = 2.4): number {
  const words = scriptWords(script).length;
  if (!words) return 0;
  return round(words / wordsPerSecond + scriptGaps(script));
}

/** The script for display: pause lines become the glyph the prompter shows. */
export function displayScript(script: string): string {
  return scriptLines(script).map((l) => (l.pause ? PAUSE_GLYPH : l.text)).join("\n");
}

function round(n: number): number { return Math.round(n * 1000) / 1000; }
