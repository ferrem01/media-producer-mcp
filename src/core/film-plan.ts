/**
 * THE PLAN: a film as one table -- beat, time, shot, line -- one row per
 * scene. It is the view two people plan a film in: the whole film on one
 * screen, and for each beat only what a reviewer weighs (what is it for, when
 * does it land, what fills the frame, what is said). The board shows one scene
 * with every field open; the plan shows every scene with four.
 *
 * The SHOT column is the only derived one. Its kind (Speaker / Split / Screen
 * / Footage / Image / Motion graphic) is read off the scene's data, so it can
 * never disagree with what the build will do; its sentence is the writer's
 * `shot` line, or the first sentence of the visual notes on older boards.
 *
 * One module, used by Studio's Plan view (GET /api/storyboard/{t}/{p}/plan) and by the
 * generate reply's markdown table, so the two never disagree.
 */
import type { Project, StoryboardScene } from "./types.js";
import { personCarries } from "./take-needs.js";

export type ShotKind = "speaker" | "cutaway" | "split" | "screen" | "footage" | "image" | "graphic";

export const SHOT_LABEL: Record<ShotKind, string> = {
  speaker: "Speaker",
  cutaway: "Speaker + cutaway",
  split: "Split",
  screen: "Screen",
  footage: "Footage",
  image: "Image",
  graphic: "Motion graphic",
};

/** A product surface: the library's mockups, and a tenant's captured screens
 *  (which carry the product's name as their prefix, e.g. quotient-email). */
const SCREEN_TYPE = /^(quotient-|audience-|claude-|slack-|gmail-|email-|chat-|canva-|code-|browser-|device-|screencast|video-call|calendar-view|kanban-board|form-wizard|dashboard-kpi|notification-stack|tool-screen|retro-post|composer)/;

function compTypes(scene: StoryboardScene): string[] {
  return (scene.components || []).map((c: any) => (typeof c === "string" ? c : c?.type)).filter(Boolean);
}

function hasSpeakerComponent(scene: StoryboardScene): boolean {
  return (scene.components || []).some((c: any) => c && typeof c === "object" && c.type === "video" && c.data?.src === "speaker");
}

/** What fills the frame, read off the scene's data. */
export function shotKind(scene: StoryboardScene, grammar?: unknown): ShotKind {
  const s: any = scene || {};
  const assets: any[] = Array.isArray(s.assets) ? s.assets : [];
  const personOn = (personCarries(grammar) && s.transparent_background !== false) || hasSpeakerComponent(scene);
  if (personOn) {
    if (assets.some((a) => a?.use === "split")) return "split";
    // A library screen cast AS the split (cut in, data.use "split").
    if ((scene.components || []).some((c: any) => c && typeof c === "object" && c.data?.use === "split")) return "split";
    // A proof that CUTS IN on a word (SPEC-creator-cut.md) takes the frame
    // for part of the beat: the person, then the screen, then the person.
    // Reading that as plain "Speaker" hid a one-second flash of Claude in a
    // beat the brief wanted full-screen (measured live, proj_4dfaa63e).
    const cutIn = (scene.components || []).some((c: any) => {
      const e = c && typeof c === "object" ? c.enter : null;
      return !!e && typeof e === "object" && e.effect === "cut";
    }) || assets.some((a) => a?.use === "cutaway" || (a?.type && a.type !== "camera_video" && !a?.use && a?.at));
    return cutIn ? "cutaway" : "speaker";
  }
  if (assets.some((a) => a?.type === "camera_video" && a?.use === "clip")) return "speaker";
  const types = compTypes(scene);
  const tpl = String(s.scene_template?.type || "");
  if (assets.some((a) => a?.type === "screen_recording") || types.some((t) => SCREEN_TYPE.test(t)) || /screen|browser|device/.test(tpl)) return "screen";
  if (s.broll_query || s.gen_video || assets.some((a) => a?.type === "stock_footage")) return "footage";
  if (s.hero_image) return "image";
  return "graphic";
}

/** The shot's sentence: the writer's `shot` line, else the opening sentence of
 *  the visual notes, clipped to a table cell. */
export function shotText(scene: StoryboardScene): string {
  const own = String((scene as any)?.shot || "").trim();
  if (own) return own;
  const notes = String(scene?.visual_notes || "").replace(/\s+/g, " ").trim();
  if (!notes) return "";
  const first = notes.match(/^.*?[.!?](?=\s|$)/)?.[0] || notes;
  return first.length > 160 ? first.slice(0, 157).replace(/\s+\S*$/, "") + "…" : first;
}

export interface PlanRow {
  index: number;
  beat: string;
  start: number;
  end: number;
  shot_kind: ShotKind;
  shot_label: string;
  shot: string;
  /** true when the sentence is the writer's own `shot` line, not derived. */
  shot_written: boolean;
  line: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function planRows(project: Project): PlanRow[] {
  const scenes = project.storyboard?.scenes || [];
  const grammar = (project.treatment as any)?.filmGrammar;
  let t = 0;
  return scenes.map((s, i) => {
    const d = Number(s.duration_seconds) || 0;
    const kind = shotKind(s, grammar);
    const row: PlanRow = {
      index: i,
      beat: s.label || `Scene ${i + 1}`,
      start: round1(t),
      end: round1(t + d),
      shot_kind: kind,
      shot_label: SHOT_LABEL[kind],
      shot: shotText(s),
      shot_written: !!String((s as any).shot || "").trim(),
      line: String(s.voiceover_text || "").trim(),
    };
    t += d;
    return row;
  });
}

function secs(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

/** The plan as a markdown table, for the generate reply: the first thing a
 *  person reacts to is the whole film, not a JSON board. */
export function planMarkdown(project: Project): string {
  const rows = planRows(project);
  if (!rows.length) return "";
  const out = ["| # | Beat | Time | Shot | Line |", "|---|---|---|---|---|"];
  for (const r of rows) {
    const shot = `**${r.shot_label}**${r.shot ? ": " + r.shot : ""}`;
    const line = r.line ? `“${r.line}”` : "—";
    out.push(`| ${r.index + 1} | ${cell(r.beat)} | ${secs(r.start)}–${secs(r.end)}s | ${cell(shot)} | ${cell(line)} |`);
  }
  return out.join("\n");
}

/**
 * Move the board's scenes into a new order: `order[k]` is the old index of the
 * scene that lands at position k. Everything that points at a scene BY ITS
 * POSITION follows it -- the takes recorded for it and the speaker clips cut
 * for it -- so dragging a row never hands a scene someone else's take.
 * Returns false (and changes nothing) when `order` is not a permutation.
 */
export function reorderBoard(project: Project, order: number[]): boolean {
  const scenes = project.storyboard?.scenes;
  if (!scenes || !Array.isArray(order) || order.length !== scenes.length) return false;
  const seen = new Set<number>();
  for (const o of order) {
    if (!Number.isInteger(o) || o < 0 || o >= scenes.length || seen.has(o)) return false;
    seen.add(o);
  }
  const newIndexOf = new Map<number, number>();
  order.forEach((oldIdx, newIdx) => newIndexOf.set(oldIdx, newIdx));
  project.storyboard!.scenes = order.map((o) => scenes[o]);
  for (const t of (project as any).takes || []) {
    if (typeof t?.scene_index === "number" && newIndexOf.has(t.scene_index)) t.scene_index = newIndexOf.get(t.scene_index);
  }
  for (const c of (project as any).speaker_track?.clips || []) {
    if (typeof c?.scene_index === "number" && newIndexOf.has(c.scene_index)) c.scene_index = newIndexOf.get(c.scene_index);
  }
  project.storyboard!.estimated_duration = project.storyboard!.scenes
    .reduce((sum, s) => sum + (Number(s.duration_seconds) || 0), 0);
  return true;
}
