/**
 * Vision grounding for the narrated-screencast recipe.
 *
 * Motion analysis can only see THAT pixels changed, never WHAT they are -- a
 * spinner, a hover state, and the button the narrator names are identical to
 * a 64x36 gray diff. That blindness forced conservatism: pins only snapped
 * within +/-6s (a wrong pin is worse than none), and callouts pointed at
 * "where pixels moved" instead of "the thing being named".
 *
 * This module adds eyes at the two decision points:
 *  - groundChapterPins: for each UNPINNED chapter boundary, extract stills at
 *    the candidate seams in a WIDE window (safe now, because a model verifies
 *    the match) and ask which screen -- if any -- is what the chapter's
 *    narration begins talking about.
 *  - groundCallouts: for each action-cue sentence, extract the frame at that
 *    moment and ask for the bounding box of the element being referenced, or
 *    nothing.
 *
 * Character preserved: vision only GROUNDS proposals. No confident answer ->
 * no pin, no callout. Results are ordinary pins / component data, editable in
 * Studio. Everything is best-effort: any failure degrades to the motion-only
 * behavior.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { parseLlmJson } from "./json-repair.js";
import { mapSourceTime, type MediaSegment } from "../core/media-edl.js";
import type { MediaPin } from "../core/types.js";
import type { PlannedCallout, CalloutCaption } from "../core/callout-plan.js";

const execFileAsync = promisify(execFile);

/** Small vision calls only need a small model; override with MP_VISION_MODEL. */
function visionConfig(llmConfig: LLMConfig): LLMConfig {
  return { ...llmConfig, model: process.env.MP_VISION_MODEL || "claude-haiku-4-5-20251001" };
}

/** Extract one downscaled JPEG still and return it as a data URL. */
async function stillDataUrl(videoPath: string, at: number, tmpDir: string): Promise<string | null> {
  const out = path.join(tmpDir, `vg_${Math.round(at * 10)}_${crypto.randomBytes(3).toString("hex")}.jpg`);
  try {
    await execFileAsync("ffmpeg", [
      "-ss", String(Math.max(0, at)), "-i", videoPath,
      "-frames:v", "1", "-vf", "scale=1024:-2", "-q:v", "6", "-y", out,
    ], { timeout: 30_000 });
    const buf = await fs.readFile(out);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    await fs.unlink(out).catch(() => {});
  }
}

const img = (url: string): LLMContentPart => ({ type: "image_url", image_url: { url } });
const txt = (text: string): LLMContentPart => ({ type: "text", text });

// ── Chapter pin grounding ───────────────────────────────────────────────────

export interface GroundPinsOpts {
  videoPath: string;
  /** Unpinned boundaries: scene-local out time + the chapter's opening narration. */
  boundaries: Array<{ out: number; label: string; openingText: string }>;
  /** Current (pinned) playback map -- for the proportional guess. */
  segments: MediaSegment[];
  /** Hard visual seams (source seconds) to consider as candidates. */
  transitions: number[];
  srcDur: number;
  llmConfig: LLMConfig;
  /** Candidate search window around the guess (default 30s). */
  window?: number;
}

/**
 * For each boundary, show the model stills taken just after each candidate
 * seam and ask which screen matches what the narration begins describing.
 * Returns confident pins only (model may answer "none").
 */
export async function groundChapterPins(opts: GroundPinsOpts): Promise<MediaPin[]> {
  const window = opts.window ?? 30;
  const cfg = visionConfig(opts.llmConfig);
  const tmpDir = path.join(os.tmpdir(), `mp_vg_${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const pins: MediaPin[] = [];
  try {
    for (const b of opts.boundaries) {
      const guess = mapSourceTime(opts.segments, b.out);
      const candidates = opts.transitions
        .filter((t) => Math.abs(t - guess) <= window && t > 0.5 && t < opts.srcDur - 4)
        .sort((x, y) => Math.abs(x - guess) - Math.abs(y - guess))
        .slice(0, 4)
        .sort((x, y) => x - y);
      if (!candidates.length) continue;

      const parts: LLMContentPart[] = [
        txt(
          `A narrated product walkthrough. At this moment the narrator begins a new section` +
          ` ("${b.label}") with: "${b.openingText.slice(0, 300)}"\n\n` +
          `Below are ${candidates.length} screenshots taken at page changes in the recording, labeled in order. ` +
          `Which screenshot shows the screen the narrator is STARTING to talk about?`,
        ),
      ];
      candidates.forEach((t, i) => {
        parts.push(txt(`Screenshot ${String.fromCharCode(65 + i)} (at ${Math.round(t)}s):`));
      });
      // Interleave label/image pairs (labels first keeps prompts compact even
      // if a still fails to extract -- we drop the pair).
      const labeled: Array<{ letter: string; t: number; url: string }> = [];
      for (let i = 0; i < candidates.length; i++) {
        const url = await stillDataUrl(opts.videoPath, candidates[i] + 0.8, tmpDir);
        if (url) labeled.push({ letter: String.fromCharCode(65 + i), t: candidates[i], url });
      }
      if (!labeled.length) continue;
      const content: LLMContentPart[] = [parts[0]];
      for (const l of labeled) {
        content.push(txt(`Screenshot ${l.letter} (page change at ${Math.round(l.t)}s):`));
        content.push(img(l.url));
      }
      content.push(
        txt(
          `Reply with ONLY JSON: {"match": "<letter or none>", "confidence": "high"|"low"}. ` +
          `Answer "none" unless one screenshot clearly IS the screen for this section's opening.`,
        ),
      );

      try {
        const raw = await callLLM(cfg, [{ role: "user", content }], { maxTokens: 100, temperature: 0 });
        const ans = parseLlmJson(raw, "pin-grounding");
        const letter = typeof ans?.match === "string" ? ans.match.trim().toUpperCase() : "NONE";
        const hit = labeled.find((l) => l.letter === letter);
        if (hit && ans?.confidence === "high") {
          pins.push({ out: Math.round(b.out * 100) / 100, src: hit.t, word: b.label });
          console.log(`  Vision pins: "${b.label}" -> seam ${hit.t.toFixed(1)}s (was guessing ${guess.toFixed(1)}s)`);
        } else {
          console.log(`  Vision pins: "${b.label}" -- no confident screen match (${labeled.length} candidates)`);
        }
      } catch (e: any) {
        console.warn(`  Vision pins: call failed for "${b.label}" (${e?.message || e})`);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  return pins;
}

// ── Callout grounding ───────────────────────────────────────────────────────

export interface GroundCalloutsOpts {
  videoPath: string;
  /** Action-cue sentences, scene-local times. */
  cues: CalloutCaption[];
  chapterMoments: Array<{ at: number }>;
  segments: MediaSegment[];
  sceneDur: number;
  llmConfig: LLMConfig;
  maxCallouts?: number;
  minSpacing?: number;
}

/**
 * For each cue sentence, show the model the frame at that moment and ask for
 * the bounding box of the UI element the narrator is referencing. "Nothing
 * clearly referenced" is a valid -- and common -- answer.
 */
export async function groundCallouts(opts: GroundCalloutsOpts): Promise<PlannedCallout[]> {
  const maxCallouts = opts.maxCallouts ?? 6;
  const minSpacing = opts.minSpacing ?? 18;
  const cfg = visionConfig(opts.llmConfig);
  const tmpDir = path.join(os.tmpdir(), `mp_vg_${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const out: PlannedCallout[] = [];
  try {
    for (const cue of opts.cues) {
      if (out.length >= maxCallouts) break;
      const at = Math.max(0.2, cue.start);
      if (at < 4 || at > opts.sceneDur - 8) continue;
      if (opts.chapterMoments.some((c) => Math.abs(c.at - at) < 5)) continue;
      const prev = out[out.length - 1];
      if (prev && at - prev.at < minSpacing) continue;

      const srcT = mapSourceTime(opts.segments, at + 0.5);
      const url = await stillDataUrl(opts.videoPath, srcT, tmpDir);
      if (!url) continue;

      try {
        const raw = await callLLM(cfg, [{
          role: "user",
          content: [
            txt(
              `This frame is from a narrated product walkthrough. The narrator says: ` +
              `"${cue.text.slice(0, 240)}"\n\n` +
              `If the frame clearly shows the specific UI element the narrator is referring to ` +
              `(a button, tab, field, panel), reply with ONLY JSON in PERCENTAGES of the ` +
              `frame (0-100, NOT pixels):\n` +
              `{"found": true, "x": <left edge as % of frame width>, "y": <top edge as % of ` +
              `frame height>, "w": <width %>, "h": <height %>}\n` +
              `Example: {"found": true, "x": 31, "y": 62, "w": 38, "h": 14}\n` +
              `The box must cover the element's COMPLETE visual container -- the whole ` +
              `input box, card, button, or panel including its border and any controls ` +
              `inside it -- never just the text within it. When the narrator references a ` +
              `message being typed, that means the entire composer box.\n` +
              `If nothing specific is clearly identifiable, reply {"found": false}. ` +
              `Prefer {"found": false} over guessing.`,
            ),
            img(url),
          ],
        }], { maxTokens: 120, temperature: 0 });
        const ans = parseLlmJson(raw, "callout-grounding");
        const nums = [ans?.x, ans?.y, ans?.w, ans?.h];
        // Pixel-looking answers (anything past 100) are REJECTED, not clamped:
        // clamping flattened them all into an identical bottom-right sliver.
        const validPct = nums.every((v: any) => typeof v === "number" && v >= 0 && v <= 100);
        if (ans?.found === true && validPct && ans.w >= 2 && ans.h >= 1.5 && ans.x + ans.w <= 104 && ans.y + ans.h <= 104) {
          const x = Math.min(92, Math.max(0, ans.x));
          const y = Math.min(92, Math.max(0, ans.y));
          const w = Math.min(60, Math.max(8, ans.w), 100 - x);
          const h = Math.min(55, Math.max(6, ans.h), 100 - y);
          out.push({
            at: Math.round(at * 100) / 100,
            dur: Math.round(Math.min(6, Math.max(3.5, cue.end - cue.start)) * 10) / 10,
            x: Math.round(x * 10) / 10,
            y: Math.round(y * 10) / 10,
            w: Math.round(w * 10) / 10,
            h: Math.round(h * 10) / 10,
          });
          console.log(`  Vision callouts: ${at.toFixed(0)}s "${cue.text.slice(0, 40)}..." -> box ${x.toFixed(0)},${y.toFixed(0)} ${w.toFixed(0)}x${h.toFixed(0)}%`);
        }
      } catch (e: any) {
        console.warn(`  Vision callouts: call failed at ${at.toFixed(0)}s (${e?.message || e})`);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  return out;
}
