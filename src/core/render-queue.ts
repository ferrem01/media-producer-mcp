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
    const outputPath = path.join(
      projectOutputDir(job.tenantId, projectId),
      `output.${ext}`,
    );

    const renderOpts: RenderOptions = {
      project,
      workDir: path.join(projectDir(job.tenantId, projectId), "_work"),
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      extraComponentDirs: [path.join(projectDir(job.tenantId, projectId), "components")],
      outputPath,
      audioOnly: options?.audioOnly,
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

    // Update project status
    project.status = "rendered";
    await saveProject(project);
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
