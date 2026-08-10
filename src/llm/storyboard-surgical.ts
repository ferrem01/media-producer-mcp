/**
 * SURGICAL storyboard ops: revise ONE scene, or author ONE new scene to
 * insert -- the rest of the board is untouched by construction, not by
 * instruction.
 *
 * The board-level revision path (queueStoryboardGeneration + feedback)
 * re-runs the whole storyboard build: right for "re-break the story",
 * wrong for "punch up panel 3" -- the first live use asked to add one
 * opening scene and got every scene re-interpreted. Here the LLM is
 * handed the scene's existing JSON (Marc: "pass in the scene and
 * regenerate with the prompts") plus the rest of the board as READ-ONLY
 * context, must return exactly one scene object, and the caller splices
 * it -- other scenes stay byte-identical because we never rewrite them.
 */
import { callLLM, type LLMConfig } from "./client.js";
import type { Project } from "../core/types.js";

export interface SurgicalSceneOp {
  /** Revise the scene at this index in place... */
  scene_index?: number;
  /** ...or author a NEW scene and insert it at this index (0 = the front). */
  insert_at?: number;
  feedback: string;
}

const SCENE_SCHEMA_NOTE = `A scene is a JSON object with:
- "label" (string), "purpose" (string), "voiceover_text" (string, optional), "duration_seconds" (number)
- "visual_notes" (string): the full visual direction -- BG/MG/FG, mood, motion
- "beats": [{"label", "duration_seconds", "action", "voiceover_text"?}] summing to the scene duration
- EITHER "components": [{"type": "<library type>", "data": {... including "script": [{action, at, ...}] for performable surfaces}}]
  OR "scene_template": {"type": "st-...", "data": {...}} for designer-built full-scene compositions
- "camera_moves" (optional): [{"at", "type": "zoom"|"reset", "anchor"?, "scale"?, "duration"?}]
- "template": "" and "assets": [] (keep as-is)`;

function boardContext(project: Project): string {
  const sb: any = (project as any).storyboard || {};
  const treatment: any = (project as any).treatment || {};
  const scenes = (sb.scenes || []) as any[];
  return [
    `FILM: "${sb.narrative || (project as any).name}" -- ${scenes.length} scenes, ~${Math.round(sb.estimated_duration || 0)}s.`,
    treatment.filmGrammar ? `Grammar: ${treatment.filmGrammar}.` : "",
    treatment.directorNote ? `Director's note: ${treatment.directorNote}` : "",
    `THE BOARD (read-only context -- you cannot change these scenes):`,
    JSON.stringify(scenes.map((s, i) => ({
      index: i, label: s.label, purpose: s.purpose, duration_seconds: s.duration_seconds,
      voiceover_text: s.voiceover_text,
      components: (s.components || []).map((c: any) => (typeof c === "string" ? c : c.type)),
      scene_template: s.scene_template?.type,
    })), null, 1),
  ].filter(Boolean).join("\n\n");
}

/** Strip markdown fences and parse the one scene object the LLM returns. */
function parseSceneJson(text: string): any {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("LLM returned no JSON object");
  const scene = JSON.parse(stripped.slice(start, end + 1));
  if (!scene.label || !Number(scene.duration_seconds)) {
    throw new Error("revised scene is missing label/duration_seconds");
  }
  if (!Array.isArray(scene.components) && !scene.scene_template) scene.components = scene.components || [];
  scene.template = scene.template || "";
  scene.assets = Array.isArray(scene.assets) ? scene.assets : [];
  return scene;
}

/**
 * Run one surgical op against the project's storyboard IN MEMORY: mutates
 * project.storyboard.scenes (splice or replace) and the estimated duration.
 * The caller saves and re-photographs. Returns the authored scene.
 */
export async function reviseDraftSceneSurgical(
  project: Project,
  op: SurgicalSceneOp,
  llmConfig: LLMConfig,
): Promise<any> {
  const sb: any = (project as any).storyboard;
  const scenes: any[] = sb?.scenes || [];
  if (!scenes.length && op.scene_index !== undefined) throw new Error("board has no scenes");

  const isInsert = op.insert_at !== undefined;
  const idx = isInsert
    ? Math.max(0, Math.min(scenes.length, Number(op.insert_at)))
    : Number(op.scene_index);
  if (!isInsert && (isNaN(idx) || idx < 0 || idx >= scenes.length)) {
    throw new Error(`scene_index ${op.scene_index} out of range (${scenes.length} scenes)`);
  }

  const target = isInsert ? null : scenes[idx];
  const neighborTypes = [...new Set(scenes.flatMap((s: any) =>
    (s.components || []).map((c: any) => (typeof c === "string" ? c : c.type))))];

  const system = [
    `You are a film director doing a SURGICAL edit on one scene of an approved storyboard. Every other scene is LOCKED -- the caller splices your output in; you cannot touch anything else, so do not try.`,
    SCENE_SCHEMA_NOTE,
    `Component types already proven on this board (prefer these; their data shapes are shown in the scene JSON): ${neighborTypes.join(", ") || "(none)"}.`,
    `Return EXACTLY ONE scene as a single JSON object. No prose, no markdown fences, no array.`,
    boardContext(project),
  ].join("\n\n");

  const user = isInsert
    ? `Author ONE NEW scene to insert at position ${idx} (${idx === 0 ? "the very front of the film" : `between "${scenes[idx - 1]?.label}" and "${scenes[idx]?.label || "the end"}"`}).\n\nDirection: ${op.feedback}\n\nMake it flow into its neighbors (match the world/continuity conventions visible in their visual_notes). Return the new scene's JSON only.`
    : `Revise this scene against the direction below. Keep everything the direction does not ask to change -- same cast, same beats, same timings -- and edit surgically.\n\nTHE SCENE AS IT IS:\n${JSON.stringify(target, null, 1)}\n\nDirection: ${op.feedback}\n\nReturn the revised scene's JSON only.`;

  const text = await callLLM(llmConfig, [{ role: "user", content: user }], {
    systemPrompt: system, maxTokens: 8000, temperature: 0.4,
  });
  const scene = parseSceneJson(text);

  if (isInsert) scenes.splice(idx, 0, scene);
  else scenes[idx] = scene;
  sb.estimated_duration = scenes.reduce((sum: number, s: any) => sum + (Number(s.duration_seconds) || 0), 0);
  return scene;
}
