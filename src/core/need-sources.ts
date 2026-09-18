/**
 * THE SOURCES (SPEC-briefs.md): every need on the board is collected its
 * own way, in the board. A camera take is recorded on the phone or
 * uploaded; a screen recording is recorded with the Recorder or uploaded;
 * b-roll is found (Pexels) or uploaded; an illustration or mock is drawn
 * (image generation) or uploaded. Every source ends in the same write --
 * `provideAsset` -- and the build casts the file into the slot it holds.
 * This module is the table Studio renders and the server's two make-it
 * sources (find, draw); record and upload have their own routes.
 */

import type { AssetRequirement, AssetRequirementType, Project } from "./types.js";

export type NeedSource = "record" | "recorder" | "find" | "draw" | "upload";

/** How each kind of need can be collected, in the order Studio shows them. */
export const NEED_SOURCES: Record<AssetRequirementType, NeedSource[]> = {
  camera_video: ["record", "upload"],
  screen_recording: ["recorder", "upload"],
  screenshot: ["recorder", "upload"],
  stock_footage: ["find", "upload"],
  illustration: ["draw", "upload"],
  mockup: ["draw", "upload"],
  ai_image: ["draw", "upload"],
  photo: ["find", "upload"],
  product_shot: ["upload"],
};

export function needSources(type: AssetRequirementType): NeedSource[] {
  return NEED_SOURCES[type] || ["upload"];
}

/** The build's own prompt for an idea beat: one object, flat art, no words.
 *  Shared with the pipeline so a redraw from Studio matches the build's. */
export function drawPrompt(need: Pick<AssetRequirement, "description" | "focus">, override?: string): string {
  const subject = String(override || need.description || "").trim();
  return `${subject}. ${need.focus ? `The eye goes to: ${String(need.focus).trim()}. ` : ""}A single clear subject, flat illustrated art with soft depth, one palette, generous empty margin around the subject, no text, no letters, no logos.`;
}

/** Is the film's frame taller than wide (portrait b-roll, tall drawings)? */
export function tallFrame(project: Pick<Project, "treatment"> | null | undefined): boolean {
  const f = String((project?.treatment as any)?.frame || "16x9");
  return f === "9x16" || f === "4x5";
}
