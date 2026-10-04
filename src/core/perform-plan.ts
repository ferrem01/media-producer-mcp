/**
 * PERFORM THE PLAN (SPEC-cast-scenes.md, phase C): every scene whose take
 * does not answer its cast plan (state todo or stale), made the way the plan
 * says -- in one go, with the cost shown first. Never automatic: the caller
 * asks for the estimate, then confirms.
 *
 *   generate + Seedance  a 480p draft per scene (startScenePerformance)
 *   recast               one recast job per actor and engine, those scenes only
 *   record               the recording back (free); a scene with no recording
 *                        waits for the booth
 *   generate + HeyGen    the look speaks the line (its look is the setting;
 *                        HeyGen API credits, no draft)
 *
 * FINALS ALL: every ready scene with a draft and no final, finished at 1080p
 * from its draft (Atlas draft-complete: the same shot, nothing sent again).
 */
import { loadProject } from "../persistence/project.js";
import { listCast } from "./cast.js";
import { resolvePlan, planState, ENGINE_LABEL, type ResolvedPlan } from "./cast-plan.js";
import { takeForClip } from "./speaker-layer.js";
import { getScenePerformances, sceneRecording, startScenePerformance, useSceneRecording } from "./scene-performance.js";

/** Atlas's Seedance 2.5 prices (Oct 2026): a 480p draft and a 1080p final, per
 *  second billed (a shot is at least 4 s). */
export const SEEDANCE_DRAFT_USD_PER_S = 0.134;
export const SEEDANCE_FINAL_USD_PER_S = 0.30;

export interface PlannedScene {
  index: number;
  label?: string;
  plan: ResolvedPlan;
  state: string;
  why?: string;
  /** What performing the plan does here. */
  action: "perform" | "recast" | "recording" | "final" | "skip";
  /** Why a scene is skipped, or what it waits for. */
  note?: string;
  seconds?: number;
  usd?: number;
}

const billed = (s: number) => Math.max(4, Math.ceil(s + 0.3));

/** A scene's length for the estimate: the built scene's, else the board's. */
function sceneSeconds(project: any, si: number): number {
  return Number(project.scenes?.[si]?.duration_seconds) || Number(project.storyboard?.scenes?.[si]?.duration_seconds) || 5;
}

/** What performing the plan would do, scene by scene, and what it costs. */
export async function planPerformance(tenant: string, projectId: string, opts: { scenes?: number[] } = {}): Promise<{ scenes: PlannedScene[]; usd: number; minutes: number }> {
  const project: any = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const actors = await listCast(tenant);
  const only = opts.scenes?.length ? new Set(opts.scenes) : null;
  const clips = project.speaker_track?.clips || [];
  const out: PlannedScene[] = [];
  (project.storyboard?.scenes || []).forEach((sc: any, i: number) => {
    if (only && !only.has(i)) return;
    const hasRec = !!sceneRecording(project, i);
    const plan = resolvePlan(project, i, actors, hasRec);
    const clip = clips.find((c: any) => c.scene_index === i);
    const take: any = clip ? takeForClip(project, clip) : null;
    const st = planState(project, i, plan, take ? { performed_by: take.performed_by || null, recast_by: Object.keys(take.actors || {}) } : null, hasRec);
    const row: PlannedScene = { index: i, ...(sc.label ? { label: sc.label } : {}), plan, state: st.state, ...(st.why ? { why: st.why } : {}), action: "skip" };
    if (sc.performance?.status === "running") row.note = "already being worked on";
    else if (st.state === "ready") row.note = "ready";
    else if (plan.how === "record") {
      if (hasRec) row.action = "recording"; else row.note = "waits for your recording (the booth)";
    } else if (plan.how === "recast") {
      if (hasRec) row.action = "recast"; else row.note = "a recast needs your recording of the scene first";
    } else if (plan.engine === "seedance") {
      row.action = "perform";
      row.seconds = billed(sceneSeconds(project, i));
      row.usd = Math.round(row.seconds * SEEDANCE_DRAFT_USD_PER_S * 100) / 100;
    } else if (plan.engine === "heygen") {
      // HeyGen bills its own API credits; its one render is the take (no draft).
      row.action = "perform";
      row.seconds = Math.ceil(sceneSeconds(project, i));
      row.note = "HeyGen API credits";
    } else row.note = `${ENGINE_LABEL[plan.engine || ""] || plan.engine} per scene is not built yet`;
    out.push(row);
  });
  const usd = Math.round(out.reduce((a, r) => a + (r.usd || 0), 0) * 100) / 100;
  // Seedance drafts run side by side (~2-4 min); recasts one job after another.
  const recastGroups = new Set(out.filter((r) => r.action === "recast").map((r) => `${r.plan.actor}|${r.plan.engine}`)).size;
  const minutes = (out.some((r) => r.action === "perform") ? 4 : 0) + recastGroups * 6;
  return { scenes: out, usd, minutes };
}

/** Perform the plan: start every scene's job. Returns at once (poll the
 *  scenes). Recasts start one actor/engine group; the rest are reported to
 *  run next (a film holds one recast job at a time). */
export async function performPlan(tenant: string, projectId: string, opts: { scenes?: number[] } = {}): Promise<{ started: number[]; recast?: { actor: string; engine?: string; scenes: number[] }; waiting: Array<{ index: number; note: string }>; usd: number }> {
  const { scenes, usd } = await planPerformance(tenant, projectId, opts);
  const started: number[] = [];
  const waiting: Array<{ index: number; note: string }> = [];
  for (const r of scenes) {
    try {
      if (r.action === "perform") { await startScenePerformance(tenant, projectId, r.index, { quality: "draft" }); started.push(r.index); }
      else if (r.action === "recording") { await useSceneRecording(tenant, projectId, r.index); started.push(r.index); }
    } catch (e: any) {
      waiting.push({ index: r.index, note: String(e?.message || e) });
    }
  }
  // Recasts: grouped by actor and engine.
  const groups = new Map<string, PlannedScene[]>();
  for (const r of scenes.filter((x) => x.action === "recast")) {
    const k = `${r.plan.actor}|${r.plan.engine || ""}`;
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  let recast: { actor: string; engine?: string; scenes: number[] } | undefined;
  const { startRecast } = await import("./recast.js");
  for (const [k, rows] of groups) {
    const [actor, engine] = k.split("|");
    if (recast) { rows.forEach((r) => waiting.push({ index: r.index, note: `recast as ${actor} next (one recast job at a time): perform the plan again when this one is done` })); continue; }
    try {
      await startRecast(tenant, projectId, actor, { performer: engine || undefined, scenes: rows.map((r) => r.index) });
      recast = { actor, ...(engine ? { engine } : {}), scenes: rows.map((r) => r.index) };
    } catch (e: any) {
      rows.forEach((r) => waiting.push({ index: r.index, note: String(e?.message || e) }));
    }
  }
  for (const r of scenes) if (r.action === "skip" && r.note && r.note !== "ready") waiting.push({ index: r.index, note: r.note });
  return { started, ...(recast ? { recast } : {}), waiting, usd };
}

/** Which ready drafts can be finished at 1080p, and the cost. */
export async function planFinals(tenant: string, projectId: string, opts: { scenes?: number[] } = {}): Promise<{ scenes: Array<{ index: number; seconds: number; usd: number }>; usd: number }> {
  const project: any = await loadProject(tenant, projectId);
  if (!project) throw new Error("Project not found");
  const only = opts.scenes?.length ? new Set(opts.scenes) : null;
  const rows = (await getScenePerformances(tenant, projectId)).filter((s: any) => {
    const p = s.performance;
    if (only && !only.has(s.scene_index)) return false;
    return p && p.draft?.draft_id && p.status !== "running" && s.state === "ready" &&
      (!p.final || String(p.final.made_at) < String(p.draft.made_at));
  }).map((s: any) => {
    const seconds = billed(sceneSeconds(project, s.scene_index));
    return { index: s.scene_index as number, seconds, usd: Math.round(seconds * SEEDANCE_FINAL_USD_PER_S * 100) / 100 };
  });
  return { scenes: rows, usd: Math.round(rows.reduce((a: number, r: { usd: number }) => a + r.usd, 0) * 100) / 100 };
}

export async function finalsAll(tenant: string, projectId: string, opts: { scenes?: number[] } = {}): Promise<{ started: number[]; failed: Array<{ index: number; error: string }>; usd: number }> {
  const plan = await planFinals(tenant, projectId, opts);
  const started: number[] = [];
  const failed: Array<{ index: number; error: string }> = [];
  for (const r of plan.scenes) {
    try { await startScenePerformance(tenant, projectId, r.index, { quality: "final" }); started.push(r.index); }
    catch (e: any) { failed.push({ index: r.index, error: String(e?.message || e) }); }
  }
  return { started, failed, usd: plan.usd };
}
