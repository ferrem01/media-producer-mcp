/**
 * Render Queue
 *
 * Async job management for renders. Accepts a render request, returns a job ID
 * immediately, and runs the render in the background.
 */

import { renderProject as renderProjectCore, type RenderOptions } from "./render.js";
import { loadProject, saveProject } from "../persistence/project.js";
import { projectDir, projectOutputDir } from "../persistence/paths.js";
import { config } from "../config.js";
import { llmConfigFromEnv } from "../llm/client.js";
import path from "node:path";
import crypto from "node:crypto";
import { TraceBuilder } from "../trace/index.js";

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

// In-memory job store
const jobs = new Map<string, RenderJob>();

/**
 * Queue a render job. Returns the job immediately with status "queued".
 * The render runs in the background.
 */
export function queueRender(
  tenantId: string,
  projectId: string,
  options?: {
    quality?: "preview" | "production";
    critique?: boolean;
    maxRevisions?: number;
    originalPrompt?: string;
    trace?: TraceBuilder;
  },
): RenderJob {
  const id = `job_${crypto.randomUUID().slice(0, 8)}`;
  const job: RenderJob = {
    id,
    tenantId,
    projectId,
    status: "queued",
  };

  jobs.set(id, job);

  // Fire and forget -- run the render in the background
  runRender(job, options).catch((err) => {
    console.error(`Render job ${id} failed:`, err);
  });

  return job;
}

/**
 * Get a job's current status.
 */
export function getJobStatus(jobId: string): RenderJob | null {
  return jobs.get(jobId) || null;
}

/**
 * List all jobs, optionally filtered by tenant.
 */
export function listJobs(tenantId?: string): RenderJob[] {
  const all = Array.from(jobs.values());
  if (tenantId) {
    return all.filter((j) => j.tenantId === tenantId);
  }
  return all;
}

/**
 * Run the actual render in the background.
 */
async function runRender(
  job: RenderJob,
  options?: {
    quality?: "preview" | "production";
    critique?: boolean;
    maxRevisions?: number;
    originalPrompt?: string;
    trace?: TraceBuilder;
  },
): Promise<void> {
  job.status = "rendering";
  job.startedAt = Date.now();
  const trace = options?.trace || new TraceBuilder("render", job.tenantId, job.projectId, options?.originalPrompt || "render");

  try {
    const project = await loadProject(job.tenantId, job.projectId);
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

    job.progress = { scene: 0, totalScenes: project.scenes.length, percent: 0 };

    const ext = project.format === "video" || project.format === "slideshow" ? "mp4" : "png";
    const outputPath = path.join(
      projectOutputDir(job.tenantId, job.projectId),
      `output.${ext}`,
    );

    const renderOpts: RenderOptions = {
      project,
      workDir: path.join(projectDir(job.tenantId, job.projectId), "_work"),
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      outputPath,
      critique: options?.critique,
      maxRevisions: options?.maxRevisions,
      originalPrompt: options?.originalPrompt,
    };

    if (options?.critique) {
      try {
        renderOpts.llmConfig = llmConfigFromEnv();
      } catch {
        // LLM not configured, skip critique
      }
    }

    const result = await renderProjectCore(renderOpts);

    // Update job with results
    job.status = "completed";
    job.completedAt = Date.now();
    job.outputPath = result.outputPath;
    job.format = result.format;
    job.durationMs = result.durationMs;
    job.frameCount = result.frameCount;
    job.progress = {
      scene: project.scenes.length,
      totalScenes: project.scenes.length,
      percent: 100,
    };

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
      const project = await loadProject(job.tenantId, job.projectId);
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
