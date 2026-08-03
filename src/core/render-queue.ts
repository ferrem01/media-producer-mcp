/**
 * Render Queue
 *
 * Async job management for renders. Now a thin wrapper over the unified job-queue.
 */

import { renderProject as renderProjectCore, type RenderOptions } from "./render.js";
import { loadProject, saveProject } from "../persistence/project.js";
import { projectDir, projectOutputDir } from "../persistence/paths.js";
import { config } from "../config.js";
import { llmConfigFromEnv } from "../llm/client.js";
import path from "node:path";
import fs from "node:fs/promises";
import { TraceBuilder } from "../trace/index.js";
import { queueJob, getJob, listAllJobs, type Job } from "./job-queue.js";

export interface RenderJob {
  id: string;
  tenantId: string;
  projectId: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress?: { scene: number; totalScenes: number; percent: number };
  startedAt?: number;
  completedAt?: number;
  outputPath?: string;
  error?: string;
  format?: string;
  durationMs?: number;
  frameCount?: number;
}

/**
 * Adapt a unified Job to the legacy RenderJob shape.
 */
function toRenderJob(job: Job): RenderJob {
  const statusMap: Record<string, RenderJob["status"]> = {
    queued: "queued",
    running: "rendering",
    completed: "completed",
    failed: "failed",
  };
  return {
    id: job.id,
    tenantId: job.tenantId,
    projectId: job.projectId || "",
    status: statusMap[job.status] || "queued",
    progress: job.progress
      ? { scene: 0, totalScenes: 0, percent: job.progress.percent }
      : undefined,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    outputPath: job.outputPath,
    error: job.error,
    format: job.format,
    durationMs: job.durationMs,
    frameCount: job.frameCount,
  };
}

/**
 * Queue a render job. Returns the job immediately with status "queued".
 * The render runs in the background.
 */
export function queueRender(
  tenantId: string,
  projectId: string,
  options?: {
    quality?: "preview" | "production";
    audioOnly?: boolean;
    trace?: TraceBuilder;
  },
): RenderJob {
  const job = queueJob("render", tenantId, async (j) => {
    j.projectId = projectId;
    await runRender(j, projectId, options);
  });
  job.projectId = projectId;

  return toRenderJob(job);
}

/**
 * Get a job's current status.
 */
export function getJobStatus(jobId: string): RenderJob | null {
  const job = getJob(jobId);
  if (!job) return null;
  return toRenderJob(job);
}

/**
 * List all jobs, optionally filtered by tenant.
 */
export function listJobs(tenantId?: string): RenderJob[] {
  return listAllJobs(tenantId, "render").map(toRenderJob);
}

/**
 * Run the actual render in the background.
 */
async function runRender(
  job: Job,
  projectId: string,
  options?: {
    quality?: "preview" | "production";
    audioOnly?: boolean;
    trace?: TraceBuilder;
  },
): Promise<void> {
  const trace = options?.trace || new TraceBuilder("render", job.tenantId, projectId, "render");

  try {
    const project = await loadProject(job.tenantId, projectId);
    if (!project) {
      job.status = "failed";
      job.error = "Project not found";
      job.completedAt = Date.now();
      return;
    }

    if (project.scenes.length === 0) {
      job.status = "failed";
      job.error = "Project has no scenes";
      job.completedAt = Date.now();
      return;
    }

    // Update project status
    project.status = "rendering";
    await saveProject(project);

    job.progress = { step: "rendering", percent: 0 };

    const ext = project.format === "video" || project.format === "slideshow" ? "mp4" : "png";
    await fs.mkdir(projectOutputDir(job.tenantId, projectId), { recursive: true });
    const outputPath = path.join(
      projectOutputDir(job.tenantId, projectId),
      `output.${ext}`,
    );

    // Deep clone project so render pipeline mutations (speaker resolution etc.)
    // don't persist back to project.json
    const projectForRender = JSON.parse(JSON.stringify(project));

    // Preview quality: render fewer frames for fast iteration. Scenes are
    // px-based, so we DON'T shrink the canvas (that would reflow the layout) --
    // we only lower the framerate. (Production keeps the full canvas fps.)
    // Resolution downscaling is handled separately via deviceScaleFactor.
    if (options?.quality === "preview"
        && (projectForRender.format === "video" || projectForRender.format === "slideshow")) {
      if (projectForRender.canvas?.fps > config.previewQuality.fps) {
        const fullFps = projectForRender.canvas.fps;
        projectForRender.canvas.fps = config.previewQuality.fps;
        console.log(`  Preview quality: ${projectForRender.canvas.fps}fps (was ${fullFps}fps)`);
      }
      // Skip the film-grade re-encode in previews -- it costs a full-video
      // encode pass and previews are about iteration speed, not finish.
      projectForRender.film_grade = "none";
    }

    const renderOpts: RenderOptions = {
      project: projectForRender,
      // Per-JOB work dir, not a shared per-project one: when a render fails,
      // its still-running sibling scene workers are killed, but any that slip
      // through (or a crashed server's orphans) must never share frame dirs
      // with a later render of the same project -- a leftover worker's
      // post-encode cleanup deleting the new run's frames mid-capture was the
      // "Could find no file ... frames" stitch failure.
      workDir: path.join(projectDir(job.tenantId, projectId), "_work", job.id),
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      extraComponentDirs: [path.join(projectDir(job.tenantId, projectId), "components")],
      outputPath,
      audioOnly: options?.audioOnly,
      onProgress: (percent, detail) => {
        job.progress = { step: detail || "rendering", percent };
      },
    };

    const result = await renderProjectCore(renderOpts);

    // Update job with results
    job.status = "completed";
    job.completedAt = Date.now();
    job.outputPath = result.outputPath;
    job.format = result.format;
    job.durationMs = result.durationMs;
    job.frameCount = result.frameCount;
    job.progress = { step: "complete", percent: 100 };

    // Trace render outcome
    trace.setRender(
      job.id,
      result.format || "mp4",
      project.scenes.length,
      job.durationMs || (Date.now() - (job.startedAt || Date.now())),
      undefined,
    );
    trace.setOutcome("success");

    // Update project status. RELOAD from disk first: `project` is the
    // snapshot loaded when the job STARTED -- renders run for many minutes,
    // and saving the stale object here silently clobbers any edit the user
    // made mid-render (scenes added, copy changed). Patch status only.
    const projectAtEnd = await loadProject(job.tenantId, projectId);
    if (projectAtEnd) {
      projectAtEnd.status = "rendered";
      await saveProject(projectAtEnd);
    }
  } catch (err: any) {
    job.status = "failed";
    job.error = err.message || "Unknown error";
    job.completedAt = Date.now();

    trace.setOutcome("failed", job.error);

    // Try to update project status
    try {
      const project = await loadProject(job.tenantId, projectId);
      if (project) {
        project.status = "failed";
        await saveProject(project);
      }
    } catch {
      // ignore
    }
  } finally {
    if (!options?.trace) {
      trace.finish();
    }
  }
}
