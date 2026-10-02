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
 *
 * THE STUDIO CORRECTION (core/take-studio.ts) rides in the same encode,
 * ahead of the look: every booth take is queued here on arrival, soft or
 * natural, so it lands corrected. A re-grade keeps the take's setting
 * (`take.correct`, on unless set false) unless the job says otherwise, and
 * reuses the stats measured the first time (`take.grade.measured`: the
 * kept original never changes).
 *
 * THE FILL LIGHT (core/take-studio.ts, faceFillGraph) rides there too,
 * between the correction and the look: `take.fill` 0-1, absent = the
 * default (0.5), 0 = off. A re-grade keeps the take's value unless the job
 * sets one.
 *
 * Studio sees the job while it runs (core/take-jobs.ts) and a failure after
 * (`take.job_error`).
 */

import path from "node:path";
import { recutProjectTakes } from "./take-edits.js";
import { gradeTake, type TakeLook } from "./take-sanitize.js";
import { queueTakeMatte } from "./take-matte.js";
import { takeCopies, syncSpeakerClips, missingSpeakerCopies } from "./speaker-layer.js";
import { ensureSpeakerNeeds } from "./take-needs.js";
import { takeJobSet, takeJobDone, markTakeJobError } from "./take-jobs.js";

export interface TakeGradeJob {
  tenantId: string;
  projectId: string;
  /** The take's file as stored (/assets/...); every take cut from it follows. */
  rawUrl: string;
  look: TakeLook;
  strength?: number;
  /** The studio correction: true/false sets it; absent keeps the take's
   *  own setting (on unless `take.correct === false`). */
  correct?: boolean;
  /** The fill light, 0-1: a number sets it; absent keeps the take's own
   *  (the default when it has none). */
  fill?: number;
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
  const what = [job.look === "soft" ? `soft ${Math.round((job.strength ?? 0.5) * 100)}` : "natural", ...(typeof job.fill === "number" ? [`fill ${Math.round(job.fill * 100)}`] : [])];
  if (running.has(key)) { waiting.set(key, job); takeJobSet(job.tenantId, job.projectId, job.rawUrl, "grade", "running", what); return; }
  running.add(key);
  takeJobSet(job.tenantId, job.projectId, job.rawUrl, "grade", "running", what);
  setTimeout(async () => {
    try {
      const before = await job.loadProject(job.tenantId, job.projectId);
      const owner = (before?.takes || []).find((t: any) => takeCopies(t).raw === job.rawUrl);
      const currentLook: TakeLook = owner?.look === "soft" && !owner?.ungraded ? "soft" : "natural";
      const correct = job.correct ?? (owner?.correct !== false);
      const fill = typeof job.fill === "number" ? job.fill : typeof owner?.fill === "number" ? owner.fill : undefined;
      const g = await gradeTake(job.resolvePath(job.rawUrl), {
        look: job.look, strength: job.strength, currentLook, correct, fill,
        stats: owner?.grade?.measured, face: owner?.face,
      });
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
        if (g.correct) delete t.correct; else t.correct = false;
        // The dial as set (0 = off); a take that had no face to fill keeps
        // the setting, and `fill_applied` says what the encode did.
        if (typeof job.fill === "number") t.fill = job.fill;
        t.fill_applied = g.fill;
        // What the correction measured (kept either way: a later "on" reuses
        // it) and what it applied.
        const measured = g.studio?.measured || t.grade?.measured;
        if (g.studio) {
          const { notes, ...applied } = g.studio.applied;
          t.grade = { measured, ...applied, notes };
        } else if (measured) t.grade = { measured, off: true };
        else delete t.grade;
        // The copies were cut from the old grade: drop them; the matte
        // makes them again from this one. A clip playing a dropped copy goes
        // back to the raw take first (left on the copy, no take owned it).
        for (const c of project.speaker_track?.clips || []) {
          if (c.source && (c.source === t.blur || c.source === t.alpha)) c.source = job.rawUrl;
        }
        if (t.blur) { delete t.blur; }
        if (t.alpha) { delete t.alpha; }
        owned++;
      }
      syncSpeakerClips(project);
      ensureSpeakerNeeds(project);
      markTakeJobError(project, job.rawUrl, "grade", null, (t) => takeCopies(t).raw);
      for (const t of project.takes || []) {
        if (takeCopies(t).raw !== job.rawUrl) continue;
        const m = missingSpeakerCopies(project, t);
        rematte.blur = rematte.blur || m.blur; rematte.alpha = rematte.alpha || m.alpha;
      }
      project.updated_at = stamp;
      await job.saveProject(project);
      // A take cut by hand plays cut copies of the old grade: cut the new one.
      await recutProjectTakes(job.tenantId, job.projectId, job.dataDir).catch((e) => console.warn(`  take grade: re-cutting failed: ${e?.message || e}`));
      const studioNote = g.studio ? `, studio ${g.studio.applied.filter === "null" ? "clean (nothing to correct)" : `wb ${g.studio.applied.wb.join("/")} skin ${g.studio.applied.skin} ev ${g.studio.applied.ev} curve ${g.studio.applied.contrast}`}` : g.correct ? ", studio skipped" : ", studio off";
      console.log(`  take grade: ${path.basename(job.rawUrl)} -> ${g.look}${g.look === "soft" ? ` ${g.strength}` : ""}${g.baseSoft ? " (over the old base)" : ""}${studioNote} in ${Math.round(g.ms / 1000)}s; ${owned} take(s)`);
      if (rematte.blur || rematte.alpha) {
        queueTakeMatte({
          tenantId: job.tenantId, projectId: job.projectId, rawUrl: job.rawUrl, dataDir: job.dataDir, strength: job.matteStrength ?? (typeof owner?.blur_strength === "number" ? owner.blur_strength : undefined),
          blur: rematte.blur, alpha: rematte.alpha,
          resolvePath: job.resolvePath, loadProject: job.loadProject, saveProject: job.saveProject, afterSave: job.afterSave,
        });
      }
      if (job.afterSave) job.afterSave(job.tenantId, job.projectId);
    } catch (e: any) {
      console.warn(`  take grade failed for ${path.basename(job.rawUrl)}: ${e?.message || e}`);
      try {
        const project = await job.loadProject(job.tenantId, job.projectId);
        if (project && markTakeJobError(project, job.rawUrl, "grade", String(e?.message || e), (t) => takeCopies(t).raw)) {
          project.updated_at = new Date().toISOString();
          await job.saveProject(project);
        }
      } catch { /* the log line above is the record */ }
    } finally {
      running.delete(key);
      const next = waiting.get(key);
      if (next) { waiting.delete(key); queueTakeGrade(next); }
      else takeJobDone(job.tenantId, job.projectId, job.rawUrl, "grade");
    }
  }, 50);
}
