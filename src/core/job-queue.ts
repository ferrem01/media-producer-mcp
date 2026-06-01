/**
 * Job Queue
 *
 * Unified async job system for renders and generates.
 * Both job types share the same in-memory store and status API.
 */

import crypto from "node:crypto";

export interface Job {
  id: string;
  type: "render" | "generate";
  tenantId: string;
  projectId?: string;
  status: "queued" | "running" | "completed" | "failed";
  progress?: { step: string; percent: number };
  startedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
  // Render-specific
  outputPath?: string;
  format?: string;
  durationMs?: number;
  frameCount?: number;
}

// In-memory job store (shared by render and generate)
const jobs = new Map<string, Job>();

/**
 * Queue a job. Creates the job record, kicks off the runner in the background,
 * and returns the job immediately with status "queued".
 */
export function queueJob(
  type: "render" | "generate",
  tenantId: string,
  runner: (job: Job) => Promise<unknown>,
): Job {
  const id = `job_${crypto.randomUUID().slice(0, 8)}`;
  const job: Job = {
    id,
    type,
    tenantId,
    status: "queued",
  };

  jobs.set(id, job);

  // Fire and forget
  (async () => {
    job.status = "running";
    job.startedAt = Date.now();
    try {
      const result = await runner(job);
      // Only mark completed if the runner hasn't already set a terminal status
      if (job.status === "running") {
        job.status = "completed";
        job.completedAt = Date.now();
        job.result = result;
      }
    } catch (err: any) {
      job.status = "failed";
      job.error = err.message || "Unknown error";
      job.completedAt = Date.now();
    }
  })().catch((err) => {
    console.error(`Job ${id} (${type}) unhandled error:`, err);
  });

  return job;
}

/**
 * Get a job by ID.
 */
export function getJob(jobId: string): Job | null {
  return jobs.get(jobId) || null;
}

/**
 * List jobs, optionally filtered by tenant and/or type.
 */
export function listAllJobs(tenantId?: string, type?: "render" | "generate"): Job[] {
  let all = Array.from(jobs.values());
  if (tenantId) {
    all = all.filter((j) => j.tenantId === tenantId);
  }
  if (type) {
    all = all.filter((j) => j.type === type);
  }
  return all;
}
