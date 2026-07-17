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

/** Vision model selection. Screen MATCHING (pins: "which screenshot is it")
 *  is easy -- a small model handles it. Bounding-box ESTIMATION (callouts)
 *  is not: haiku persistently answered in pixels regardless of prompt, so
 *  callouts use the session's main model. Override both with MP_VISION_MODEL. */
function visionConfig(llmConfig: LLMConfig, task: "match" | "bbox"): LLMConfig {
  const override = process.env.MP_VISION_MODEL;
  if (override) return { ...llmConfig, model: override };
  return task === "match"
    ? { ...llmConfig, model: "claude-haiku-4-5-20251001" }
    : { ...llmConfig };
}

/** Extract one downscaled JPEG still; returns the file path + data URL.
 *  Caller's tmpDir is removed wholesale, so no per-file cleanup here. */
async function extractStill(
  videoPath: string,
  at: number,
  tmpDir: string,
): Promise<{ path: string; url: string } | null> {
  const out = path.join(tmpDir, `vg_${Math.round(at * 10)}_${crypto.randomBytes(3).toString("hex")}.jpg`);
  try {
    await execFileAsync("ffmpeg", [
      "-ss", String(Math.max(0, at)), "-i", videoPath,
      "-frames:v", "1", "-vf", "scale=1024:-2", "-q:v", "6", "-y", out,
    ], { timeout: 30_000 });
    const buf = await fs.readFile(out);
    return { path: out, url: `data:image/jpeg;base64,${buf.toString("base64")}` };
  } catch {
    return null;
  }
}

async function stillDataUrl(videoPath: string, at: number, tmpDir: string): Promise<string | null> {
  const still = await extractStill(videoPath, at, tmpDir);
  return still?.url ?? null;
}

/** Draw a red rectangle (pixel coords) on a still; returns the data URL. */
async function drawBoxDataUrl(
  stillPath: string,
  box: { x: number; y: number; w: number; h: number },
  tmpDir: string,
): Promise<string | null> {
  const out = path.join(tmpDir, `vgbox_${crypto.randomBytes(3).toString("hex")}.jpg`);
  try {
    await execFileAsync("ffmpeg", [
      "-i", stillPath,
      "-vf", `drawbox=x=${Math.round(box.x)}:y=${Math.round(box.y)}:w=${Math.round(box.w)}:h=${Math.round(box.h)}:color=red:t=5`,
      "-q:v", "6", "-y", out,
    ], { timeout: 15_000 });
    const buf = await fs.readFile(out);
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
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
  const cfg = visionConfig(opts.llmConfig, "match");
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
        const raw = await callLLM(cfg, [{ role: "user", content }], { maxTokens: 300, temperature: 0 });
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
  const cfg = visionConfig(opts.llmConfig, "bbox");
  const tmpDir = path.join(os.tmpdir(), `mp_vg_${crypto.randomBytes(4).toString("hex")}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const out: PlannedCallout[] = [];

  // The stills are scaled to 1024 wide; height follows the source's aspect.
  // Claude's grounding training speaks PIXELS -- every model kept answering
  // in pixels no matter how loudly the prompt demanded percentages. So ask
  // in its native dialect and convert deterministically.
  let imgW = 1024, imgH = 576;
  try {
    const { probeVideoMeta } = await import("../core/asset-intel.js");
    const meta = await probeVideoMeta(opts.videoPath);
    if (meta?.width && meta?.height) imgH = Math.round((1024 * meta.height) / meta.width / 2) * 2;
  } catch { /* default 16:9 */ }

  try {
    for (const cue of opts.cues) {
      if (out.length >= maxCallouts) break;
      const at = Math.max(0.2, cue.start);
      if (at < 4 || at > opts.sceneDur - 8) continue;
      if (opts.chapterMoments.some((c) => Math.abs(c.at - at) < 5)) continue;
      const prev = out[out.length - 1];
      if (prev && at - prev.at < minSpacing) continue;

      // Accept a numeric box in either dialect; return PIXELS or null.
      const toPixelBox = (ans: any): { x: number; y: number; w: number; h: number } | null => {
        const nums = [ans?.x, ans?.y, ans?.w, ans?.h];
        if (!nums.every((v: any) => typeof v === "number" && v >= 0)) return null;
        if (nums.every((v: number) => v <= 100) && ans.x + ans.w <= 104 && ans.y + ans.h <= 104) {
          if (ans.w < 2 || ans.h < 1.5) return null;
          return { x: (ans.x / 100) * imgW, y: (ans.y / 100) * imgH, w: (ans.w / 100) * imgW, h: (ans.h / 100) * imgH };
        }
        if (ans.x < imgW && ans.y < imgH && ans.x + ans.w <= imgW * 1.04 && ans.y + ans.h <= imgH * 1.04) {
          if (ans.w < imgW * 0.02 || ans.h < imgH * 0.015) return null;
          return { x: ans.x, y: ans.y, w: ans.w, h: ans.h };
        }
        return null;
      };

      try {
        // ── Propose, sampling the callout's ACTUAL first displayed frame.
        // Cues sit right at content-change moments (the narrator announces
        // the thing as it appears), and through a ~3-4x timelapse even half
        // a second of output time crosses the seam: a "+0.5s" nudge showed
        // the model the world AFTER the change while the callout's opening
        // seconds displayed the world BEFORE it -- box perfect, content one
        // seam ahead (measured via the segment map + the Studio src
        // tooltip). If the first frame doesn't show the referenced thing
        // yet, shift the callout 2s later once and retry, so the callout
        // appears WHEN the thing does. ──
        let calloutAt = at;
        let still: { path: string; url: string } | null = null;
        let box: { x: number; y: number; w: number; h: number } | null = null;
        for (const shift of [0, 2]) {
          calloutAt = at + shift;
          if (calloutAt > opts.sceneDur - 8) break;
          if (opts.chapterMoments.some((c) => Math.abs(c.at - calloutAt) < 5)) continue;
          still = await extractStill(opts.videoPath, mapSourceTime(opts.segments, calloutAt + 0.1), tmpDir);
          if (!still) continue;
          const raw = await callLLM(cfg, [{
            role: "user",
            content: [
              txt(
                `This ${imgW}x${imgH} image is a frame from a narrated product walkthrough. ` +
                `The narrator says: "${cue.text.slice(0, 240)}"\n\n` +
                `If the frame clearly shows the specific UI element the narrator is referring to ` +
                `(a button, tab, field, panel), reply with ONLY JSON -- the bounding box in ` +
                `PIXELS of this ${imgW}x${imgH} image:\n` +
                `{"found": true, "x": <left px>, "y": <top px>, "w": <width px>, "h": <height px>}\n` +
                `The box must cover the element's COMPLETE visual container -- the whole ` +
                `input box, card, button, or panel including its border and any controls ` +
                `inside it -- never just the text within it. When the narrator references a ` +
                `message being typed, that means the entire composer box.\n` +
                `If nothing specific is clearly identifiable, reply {"found": false}. ` +
                `Prefer {"found": false} over guessing.`,
              ),
              img(still.url),
            ],
          }], { maxTokens: 500, temperature: 0 });
          const ans = parseLlmJson(raw, "callout-grounding");
          if (ans?.found === true) {
            box = toPixelBox(ans);
            if (!box) console.warn(`  Vision callouts: rejected malformed box at ${calloutAt.toFixed(0)}s -- raw: ${String(raw).slice(0, 160)}`);
            break;
          }
          console.log(`  Vision callouts: ${calloutAt.toFixed(0)}s -> not found${shift === 0 ? " (will try +2s)" : ""} -- raw: ${String(raw).slice(0, 120).replace(/\n/g, " ")}`);
        }
        if (!box || !still) continue;

        // ── Verify (aim check): draw the box, ask if it actually covers the
        // element; one correction round allowed, then drop. This catches
        // every coordinate-mismatch source at once (aspect math, rotation
        // metadata, plain bad aim), because it judges the VISUAL result --
        // the same picture the viewer would see. ──
        let verified = false;
        for (let round = 0; round < 2 && !verified; round++) {
          const boxedUrl = await drawBoxDataUrl(still.path, box, tmpDir);
          if (!boxedUrl) { verified = true; break; } // drawing infra failed, not the box -- ship unverified
          const vraw = await callLLM(cfg, [{
            role: "user",
            content: [
              txt(
                `The red rectangle on this ${imgW}x${imgH} image is a proposed highlight ` +
                `for what the narrator says: "${cue.text.slice(0, 240)}"\n\n` +
                `Does the red rectangle correctly cover the COMPLETE container of the ` +
                `referenced element? Reply with ONLY JSON:\n` +
                `{"ok": true} if it does;\n` +
                `{"ok": false, "x": <left px>, "y": <top px>, "w": <width px>, "h": <height px>} ` +
                `with a corrected box in pixels of this image if it misses or is badly sized;\n` +
                `{"ok": false} if the referenced element isn't actually visible.`,
              ),
              img(boxedUrl),
            ],
          }], { maxTokens: 500, temperature: 0 });
          const vans = parseLlmJson(vraw, "callout-verify");
          if (vans?.ok === true) { verified = true; break; }
          const corrected = toPixelBox(vans);
          if (!corrected) {
            console.log(`  Vision callouts: ${at.toFixed(0)}s -> verify says miss, no usable correction -- dropped`);
            box = null as any;
            break;
          }
          box = corrected; // second round verifies the correction
        }
        if (!box) continue;
        if (!verified) {
          console.log(`  Vision callouts: ${at.toFixed(0)}s -> correction did not verify -- dropped`);
          continue;
        }

        // ── Stability check: the box is verified for ONE instant, but the
        // callout holds for several seconds of OUTPUT time -- which can be
        // 4x that in source time through a timelapsed stretch. If the
        // footage moves on (bubble collapses, page scrolls), the target
        // walks out from under the box (measured: geometry pixel-exact,
        // content different by the end of the window). Verify the same box
        // on the window's LAST frame; on failure shrink the callout to its
        // minimum length and retry once, else drop. ──
        let dur = Math.min(6, Math.max(3.5, cue.end - cue.start));
        const startSrc = mapSourceTime(opts.segments, calloutAt + 0.1);
        for (let attempt = 0; attempt < 2; attempt++) {
          const endSrc = mapSourceTime(opts.segments, calloutAt + dur - 0.2); // the window's actual last frame
          if (Math.abs(endSrc - startSrc) < 1.5) break; // source barely advances -- stable
          const endStill = await extractStill(opts.videoPath, endSrc, tmpDir);
          if (!endStill) break;
          const endBoxed = await drawBoxDataUrl(endStill.path, box, tmpDir);
          if (!endBoxed) break;
          const eraw = await callLLM(cfg, [{
            role: "user",
            content: [
              txt(
                `The red rectangle on this ${imgW}x${imgH} image is a highlight for what the ` +
                `narrator says: "${cue.text.slice(0, 240)}"\n\n` +
                `Does the red rectangle still cover that element in THIS frame? ` +
                `Reply ONLY JSON: {"ok": true} or {"ok": false}.`,
              ),
              img(endBoxed),
            ],
          }], { maxTokens: 200, temperature: 0 });
          const eans = parseLlmJson(eraw, "callout-stability");
          if (eans?.ok === true) break;
          if (attempt === 0 && dur > 3.5) {
            dur = 3.5; // try the shortest window before giving up
            continue;
          }
          console.log(`  Vision callouts: ${at.toFixed(0)}s -> target moves during the window -- dropped`);
          box = null as any;
          break;
        }
        if (!box) continue;

        const px = (box.x / imgW) * 100, py = (box.y / imgH) * 100;
        const pw = (box.w / imgW) * 100, ph = (box.h / imgH) * 100;
        const x = Math.min(92, Math.max(0, px));
        const y = Math.min(92, Math.max(0, py));
        const w = Math.min(60, Math.max(8, pw), 100 - x);
        const h = Math.min(55, Math.max(6, ph), 100 - y);
        out.push({
          at: Math.round(calloutAt * 100) / 100,
          dur: Math.round(dur * 10) / 10,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          w: Math.round(w * 10) / 10,
          h: Math.round(h * 10) / 10,
        });
        console.log(`  Vision callouts: ${calloutAt.toFixed(0)}s "${cue.text.slice(0, 40)}..." -> verified box ${x.toFixed(0)},${y.toFixed(0)} ${w.toFixed(0)}x${h.toFixed(0)}%`);
      } catch (e: any) {
        console.warn(`  Vision callouts: call failed at ${at.toFixed(0)}s (${e?.message || e})`);
      }
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  return out;
}
