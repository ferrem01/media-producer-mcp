/**
 * Render Queue
 *
 * Async job management for renders. Now a thin wrapper over the unified job-queue.
 */

import { renderProject as renderProjectCore, type RenderOptions } from "./render.js";
import { loadProject, saveProject } from "../persistence/project.js";
import { withProjectLock } from "./project-lock.js";
import { projectDir, projectOutputDir, projectAssetsDir } from "../persistence/paths.js";
import { ensureSoundFiles } from "./scene-sfx.js";
import { resolveSfxChoice } from "../audio/sfx.js";
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
  /** True when this is the render already in flight, handed back rather than
   *  a second one started beside it. */
  reused?: boolean;
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
export function activeRender(tenantId: string, projectId: string): Job | null {
  return (
    listAllJobs(tenantId, "render").find(
      (j) => j.projectId === projectId && (j.status === "running" || j.status === "queued"),
    ) || null
  );
}

export function queueRender(
  tenantId: string,
  projectId: string,
  options?: {
    quality?: "preview" | "production";
    audioOnly?: boolean;
    trace?: TraceBuilder;
  },
): RenderJob {
  // ONE RENDER PER FILM. The queue is fire-and-forget with no concurrency
  // limit, so pressing Render again on a film that is already rendering does
  // not queue behind it -- it runs a SECOND full render alongside the first,
  // each forking a browser per scene. Measured on a 12-scene film: both jobs
  // alive, both crawling, a five-minute render turned into twenty. Hand back
  // the render already working instead.
  const inFlight = activeRender(tenantId, projectId);
  if (inFlight) return { ...toRenderJob(inFlight), reused: true };

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
  // Per-JOB work dir, not a shared per-project one: when a render fails,
  // its still-running sibling scene workers are killed, but any that slip
  // through (or a crashed server's orphans) must never share frame dirs
  // with a later render of the same project -- a leftover worker's
  // post-encode cleanup deleting the new run's frames mid-capture was the
  // "Could find no file ... frames" stitch failure.
  const workDir = renderWorkDir(job.tenantId, projectId, job.id);

  try {
    // Load to save holds the film (core/project-lock.ts): the render's
    // start writes its status and the cues' files on the film as it is.
    const project = await withProjectLock(job.tenantId, projectId, async () => {
      const project = await loadProject(job.tenantId, projectId);
      if (!project) {
        job.status = "failed";
        job.error = "Project not found";
        job.completedAt = Date.now();
        return null;
      }

      if (project.scenes.length === 0) {
        job.status = "failed";
        job.error = "Project has no scenes";
        job.completedAt = Date.now();
        return null;
      }

      // The scenes' sound cues get their files before the render mixes them
      // (a cue planned on the board has an id; the file is copied in once).
      try {
        const assets = projectAssetsDir(job.tenantId, projectId);
        await ensureSoundFiles(project, (id) => resolveSfxChoice(id, assets));
      } catch (e: any) { console.warn(`  sound cues: ${e?.message || e}`); }

      // Update project status
      project.status = "rendering";
      await saveProject(project);
      return project;
    });
    if (!project) return;

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
      workDir,
      componentLibDir: config.componentLibDir,
      gsapDir: config.gsapDir,
      // Project-local scene components first, then the TENANT component
      // library: captured components live FLAT in its root and playground
      // customs under custom/. Without these, components the operator minted
      // are invisible to film renders -- scenes assembled EMPTY.
      extraComponentDirs: [
        path.join(projectDir(job.tenantId, projectId), "components"),
        path.join(config.dataDir, job.tenantId, "components"),
        path.join(config.dataDir, job.tenantId, "components", "custom"),
      ],
      outputPath,
      audioOnly: options?.audioOnly,
      onProgress: (percent, detail) => {
        job.progress = { step: detail || "rendering", percent };
      },
    };

    const result = await renderProjectCore(renderOpts);
    // Web-ready whatever path wrote it: the index before the media.
    if (result.outputPath) {
      const { ensureFaststart } = await import("./encode.js");
      if (await ensureFaststart(result.outputPath)) console.log(`  render: moved the MP4 index to the front (${path.basename(result.outputPath)})`);
    }

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
    await withProjectLock(job.tenantId, projectId, async () => {
      const projectAtEnd = await loadProject(job.tenantId, projectId);
      if (projectAtEnd) {
        projectAtEnd.status = "rendered";
        await saveProject(projectAtEnd);
      }
    });
  } catch (err: any) {
    job.status = "failed";
    job.error = err.message || "Unknown error";
    job.completedAt = Date.now();

    trace.setOutcome("failed", job.error);

    // Try to update project status
    try {
      await withProjectLock(job.tenantId, projectId, async () => {
        const project = await loadProject(job.tenantId, projectId);
        if (project) {
          project.status = "failed";
          await saveProject(project);
        }
      });
    } catch {
      // ignore
    }
  } finally {
    // The work dir is scratch: every scene's PNG frames, transitions, the
    // speaker base. Nothing reads it once the job ends (the scene cache copies
    // its mp4s out, audio_only re-muxes output.mp4), and left behind it filled
    // the droplet's disk -- 90 GB of _work/job_* by Oct 28, renders and takes
    // failing on a full disk.
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    if (!options?.trace) {
      trace.finish();
    }
  }
}

function renderWorkDir(tenantId: string, projectId: string, jobId: string): string {
  return path.join(projectDir(tenantId, projectId), "_work", jobId);
}

/**
 * Delete render work dirs (`<project>/_work/job_*`) older than `maxAgeMs`,
 * across every tenant. A job removes its own dir when it ends; this catches
 * the ones a killed or redeployed server never got to. Only `job_*` dirs --
 * the other _work entries (performs, voice previews, recasts) are reused
 * caches. Returns how many dirs it removed.
 */
export async function sweepRenderWorkDirs(
  dataDir: string = config.dataDir,
  maxAgeMs: number = 60 * 60 * 1000,
): Promise<number> {
  const cutoff = Date.now() - maxAgeMs;
  const list = (dir: string) => fs.readdir(dir).catch(() => [] as string[]);
  let removed = 0;
  for (const tenant of await list(dataDir)) {
    const projects = path.join(dataDir, tenant, "projects");
    for (const project of await list(projects)) {
      const work = path.join(projects, project, "_work");
      for (const entry of await list(work)) {
        if (!entry.startsWith("job_")) continue;
        const dir = path.join(work, entry);
        const stat = await fs.stat(dir).catch(() => null);
        if (!stat?.isDirectory() || stat.mtimeMs > cutoff) continue;
        await fs.rm(dir, { recursive: true, force: true });
        removed++;
      }
    }
  }
  return removed;
}
