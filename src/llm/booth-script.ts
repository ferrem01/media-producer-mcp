/**
 * Booth teleprompter script (SPEC-recorder.md, Mode B upgrade): draft a
 * narration script TIMED TO THE LOCKED CUT, so the booth take is read, not
 * improvised. The drafter sees the film's real structure -- which spans play
 * at 1x vs timelapse, what the user clicked and where they navigated (sidecar
 * ground truth), chapter marks -- and budgets words per span at speaking
 * pace. The user edits the script in the booth before recording; since the
 * script is known, captions stop depending on whisper hearing correctly.
 */

import path from "node:path";
import { callLLM, type LLMConfig } from "./client.js";
import { parseLlmJson } from "./json-repair.js";
import { resolveVideoPath } from "../core/video-path.js";
import type { Project, Scene } from "../core/types.js";

export interface ScriptCue {
  /** Film-clock seconds this line should start. */
  at: number;
  text: string;
}

export interface BoothScript {
  cues: ScriptCue[];
  drafted_at: string;
  /** True once the user has edited it in the booth. */
  edited?: boolean;
}

const WORDS_PER_SECOND = 2.4;

/** Order + clamp + de-empty a cue list against the film length. Exported for
 *  tests and for validating user edits on save. */
export function sanitizeCues(cues: unknown, filmDur: number): ScriptCue[] {
  if (!Array.isArray(cues)) return [];
  return (cues as Array<{ at?: unknown; text?: unknown }>)
    .map((c) => ({
      at: Math.max(0, Math.round((Number(c?.at) || 0) * 10) / 10),
      text: String(c?.text || "").trim().replace(/\s+/g, " ").slice(0, 400),
    }))
    .filter((c) => c.text && c.at < Math.max(1, filmDur - 1))
    .sort((a, b) => a.at - b.at);
}

/** Map a SOURCE-clock second through the scene's EDL segments to the film
 *  clock (scene-local), or null when the moment was cut. */
function srcToSceneTime(
  segments: Array<{ src_start: number; src_end: number; rate: number }>,
  src: number,
): number | null {
  let acc = 0;
  for (const s of segments) {
    const rate = s.rate || 1;
    const len = (s.src_end - s.src_start) / rate;
    if (src >= s.src_start && src < s.src_end) return acc + (src - s.src_start) / rate;
    acc += len;
  }
  return null;
}

function fmtT(t: number): string {
  return `${t.toFixed(1)}s`;
}

/** Build the timeline brief the LLM writes against. Exported for tests. */
export function describeFilmForScript(project: Project, sidecar?: {
  navigations?: Array<{ t: number; url?: string; title?: string }>;
  clicks?: Array<{ t: number; label?: string }>;
  chapters?: Array<{ t: number; label?: string }>;
} | null): { brief: string; filmDur: number } {
  const scenes: Scene[] = project.scenes || [];
  const lines: string[] = [];
  let offset = 0;
  let filmDur = 0;
  for (const s of scenes) {
    const dur = s.duration_seconds || 0;
    filmDur += dur;
    const edit = (s as any).media_edits?.screencast;
    if (!edit?.segments?.length) {
      const kind = /intro/i.test(s.id) ? "branded logo intro (no product on screen)"
        : /outro/i.test(s.id) ? "branded outro card"
        : s.label || s.id;
      lines.push(`${fmtT(offset)}-${fmtT(offset + dur)}: ${kind}`);
    } else {
      const segs = edit.segments as Array<{ src_start: number; src_end: number; rate: number }>;
      const events: string[] = [];
      const toScene = (srcMs: number) => srcToSceneTime(segs, srcMs / 1000);
      for (const n of sidecar?.navigations || []) {
        const t = toScene(n.t);
        if (t !== null) events.push(`    at ${fmtT(offset + t)}: page becomes "${(n.title || n.url || "?").slice(0, 60)}"`);
      }
      for (const c of (sidecar?.clicks || []).filter((c) => c.label)) {
        const t = toScene(c.t);
        if (t !== null) events.push(`    at ${fmtT(offset + t)}: user clicks "${c.label!.slice(0, 40)}"`);
      }
      for (const ch of sidecar?.chapters || []) {
        const t = toScene(ch.t);
        if (t !== null) events.push(`    at ${fmtT(offset + t)}: CHAPTER MARK "${(ch.label || "").slice(0, 50)}"`);
      }
      let acc = 0;
      for (const seg of segs) {
        const rate = seg.rate || 1;
        const len = (seg.src_end - seg.src_start) / rate;
        const a = offset + acc;
        const b = a + len;
        if (rate <= 1.01) {
          lines.push(`${fmtT(a)}-${fmtT(b)}: REAL-TIME demo footage (budget ~${Math.max(3, Math.round(len * WORDS_PER_SECOND))} words)`);
        } else {
          lines.push(`${fmtT(a)}-${fmtT(b)}: TIMELAPSE ${rate}x (waiting compressed; at most one short bridging line, ~${Math.max(3, Math.round(len * WORDS_PER_SECOND))} words)`);
        }
        acc += len;
      }
      lines.push(...events.sort());
    }
    offset += dur;
  }
  return { brief: lines.join("\n"), filmDur: Math.round(filmDur * 10) / 10 };
}

export async function draftBoothScript(opts: {
  project: Project;
  dataDir?: string;
  llmConfig: LLMConfig;
}): Promise<BoothScript> {
  const { project } = opts;

  // Sidecar ground truth, when the footage came from the recorder extension.
  let sidecar: any = null;
  try {
    const target = (project.scenes || []).find((s) => (s as any).media_edits?.screencast);
    const comp: any = (target?.components || []).find((c: any) => c.type === "screencast-frame");
    if (comp?.data?.video_url) {
      const { loadRecorderEvents } = await import("../core/recorder-events.js");
      sidecar = await loadRecorderEvents(resolveVideoPath(comp.data.video_url, opts.dataDir));
    }
  } catch { /* heuristic timeline still works */ }

  const { brief, filmDur } = describeFilmForScript(project, sidecar);
  const productContext = [
    project.prompt && `The film is about: ${project.prompt}`,
    project.brand_kit?.guidelines && `Brand voice hints: ${project.brand_kit.guidelines.slice(0, 400)}`,
  ].filter(Boolean).join("\n");

  const raw = await callLLM(
    opts.llmConfig,
    [{
      role: "user",
      content:
        `Write a voiceover script for a ${filmDur}s product-walkthrough film. A human will READ this aloud ` +
        `while the film plays (teleprompter), so it must fit the clock: people speak ~${WORDS_PER_SECOND} words/second. ` +
        `Respect every span's word budget -- an overlong line is worse than a short one.\n\n` +
        `Film timeline (film-clock seconds):\n${brief}\n\n${productContext}\n\n` +
        `Rules:\n` +
        `- Conversational first person ("Here I'm...", "Now watch..."), present tense, no marketing fluff.\n` +
        `- Describe what is ON SCREEN when it's on screen; use the page/click events as anchors.\n` +
        `- Timelapse spans get at most ONE short bridging line ("While the agents work...").\n` +
        `- The intro/outro bookends: one short opening hook over the intro, one closing line over the outro.\n` +
        `- 1-2 sentences per cue. Leave breathing gaps; do not wall-to-wall the clock.\n\n` +
        `Reply with ONLY a JSON array: [{"at": <film seconds>, "text": "..."}] sorted by "at".`,
    }],
    { maxTokens: 1500, temperature: 0.5 },
  );
  const cues = sanitizeCues(parseLlmJson(raw, "booth-script"), filmDur);
  if (!cues.length) throw new Error("script drafting returned no usable cues");
  return { cues, drafted_at: new Date().toISOString() };
}
