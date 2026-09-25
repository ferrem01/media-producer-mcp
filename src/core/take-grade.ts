/**
 * THE SOFT LOOK, ON A DIAL (core/take-sanitize.ts, gradeTake).
 *
 * Grading runs in the background, after the take lands: a bilateral pass
 * over a minute-long "record all" take takes minutes on the server, and the
 * attach request must stay under the proxy's limit (the matte moved out of
 * the request for the same reason). The take plays ungraded until the grade
 * lands, then the project saves and Studio's live sync refreshes it.
 *
 * Studio re-grades the same way (POST /api/take-look): every grade starts
 * from the kept original, so the dial goes down as well as up. The blurred
 * and alpha copies are made FROM the graded take, so a grade drops them and
 * queues the matte again -- the matte always runs after the grade.
 */

import path from "node:path";
import { gradeTake, type TakeLook } from "./take-sanitize.js";
import { queueTakeMatte } from "./take-matte.js";
import { takeCopies, syncSpeakerClips, missingSpeakerCopies } from "./speaker-layer.js";
import { ensureSpeakerNeeds } from "./take-needs.js";

export interface TakeGradeJob {
  tenantId: string;
  projectId: string;
  /** The take's file as stored (/assets/...); every take cut from it follows. */
  rawUrl: string;
  look: TakeLook;
  strength?: number;
  /** The background blur's strength, for the matte the grade queues. */
  matteStrength?: number;
  dataDir: string;
  resolvePath: (url: string) => string;
  loadProject: (t: string, p: string) => Promise<any>;
  saveProject: (project: any) => Promise<void>;
  afterSave?: (tenantId: string, projectId: string) => void;
}

// One grade per file at a time; a newer request made while one runs
// replaces any waiting one (the last slider position wins).
const running = new Set<string>();
const waiting = new Map<string, TakeGradeJob>();

export function takeGradeRunning(tenantId: string, projectId: string, rawUrl: string): boolean {
  const key = `${tenantId}/${projectId}/${rawUrl}`;
  return running.has(key) || waiting.has(key);
}

export function queueTakeGrade(job: TakeGradeJob): void {
  const key = `${job.tenantId}/${job.projectId}/${job.rawUrl}`;
  if (running.has(key)) { waiting.set(key, job); return; }
  running.add(key);
  setTimeout(async () => {
    try {
      const before = await job.loadProject(job.tenantId, job.projectId);
      const owner = (before?.takes || []).find((t: any) => takeCopies(t).raw === job.rawUrl);
      const currentLook: TakeLook = owner?.look === "soft" && !owner?.ungraded ? "soft" : "natural";
      const g = await gradeTake(job.resolvePath(job.rawUrl), { look: job.look, strength: job.strength, currentLook });
      const project = await job.loadProject(job.tenantId, job.projectId);
      if (!project) return;
      const ungradedUrl = job.rawUrl.replace(/[^/]+$/, path.basename(g.ungraded));
      const stamp = new Date().toISOString();
      const rematte = { blur: false, alpha: false };
      let owned = 0;
      for (const t of project.takes || []) {
        if (takeCopies(t).raw !== job.rawUrl) continue;
        t.look = g.look;
        if (g.look === "soft") t.soft_strength = g.strength; else delete t.soft_strength;
        t.ungraded = ungradedUrl;
        if (g.baseSoft) t.ungraded_soft = true;
        t.graded_at = stamp;
        // The copies were cut from the old grade: drop them; the matte
        // makes them again from this one.
        if (t.blur) { delete t.blur; }
        if (t.alpha) { delete t.alpha; }
        owned++;
      }
      syncSpeakerClips(project);
      ensureSpeakerNeeds(project);
      for (const t of project.takes || []) {
        if (takeCopies(t).raw !== job.rawUrl) continue;
        const m = missingSpeakerCopies(project, t);
        rematte.blur = rematte.blur || m.blur; rematte.alpha = rematte.alpha || m.alpha;
      }
      project.updated_at = stamp;
      await job.saveProject(project);
      console.log(`  take grade: ${path.basename(job.rawUrl)} -> ${g.look}${g.look === "soft" ? ` ${g.strength}` : ""}${g.baseSoft ? " (over the old base)" : ""} in ${Math.round(g.ms / 1000)}s; ${owned} take(s)`);
      if (rematte.blur || rematte.alpha) {
        queueTakeMatte({
          tenantId: job.tenantId, projectId: job.projectId, rawUrl: job.rawUrl, dataDir: job.dataDir, strength: job.matteStrength,
          blur: rematte.blur, alpha: rematte.alpha,
          resolvePath: job.resolvePath, loadProject: job.loadProject, saveProject: job.saveProject, afterSave: job.afterSave,
        });
      }
      if (job.afterSave) job.afterSave(job.tenantId, job.projectId);
    } catch (e: any) {
      console.warn(`  take grade failed for ${path.basename(job.rawUrl)}: ${e?.message || e}`);
    } finally {
      running.delete(key);
      const next = waiting.get(key);
      if (next) { waiting.delete(key); queueTakeGrade(next); }
    }
  }, 50);
}
