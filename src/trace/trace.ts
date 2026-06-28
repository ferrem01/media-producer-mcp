/**
 * Trace Infrastructure for the Media Producer Pipeline
 *
 * Captures structured traces from every pipeline operation end-to-end.
 * Traces are written to tenant-specific JSONL files and a global system file.
 *
 * Modeled after video-producer-mcp's trace system, adapted for media-producer's
 * multi-format pipeline (components, scenes, projects, presentations).
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

// ── Constants ──

const SYSTEM_TRACE_DIR = path.join(config.dataDir, "_system", "traces");
const SYSTEM_TRACE_FILE = path.join(SYSTEM_TRACE_DIR, "traces.jsonl");

// Ensure system trace directory exists
try { fs.mkdirSync(SYSTEM_TRACE_DIR, { recursive: true }); } catch {}

const TRACE_RETENTION_MS = 48 * 60 * 60 * 1000; // 48 hours
let lastPruneTime = 0;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // prune at most once per hour

// ── Types ──

export type OperationType =
  | "generate"
  | "expand"
  | "storyboard_project"
  | "storyboard_scene"
  | "storyboard_scene_codegen"
  | "component_generate"
  | "critique"
  | "render"
  | "render_scene"
  | "render_transition";

export interface TraceEvent {
  type: string;
  timestamp: string;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface PipelineTrace {
  trace_id: string;
  ts: string;
  operation: OperationType;
  tenant_id: string;
  project_id: string;
  prompt: string;
  canvas?: { width: number; height: number; fps: number };
  has_brand_kit: boolean;
  storyboard?: { scene_count: number; components: string[]; format: string };
  component_gen?: { type: string; source_length: number; llm_duration_ms: number };
  critiques: Array<{ round: number; score: number; issues: number; revised: boolean; accepted: boolean }>;
  render?: {
    job_id: string;
    format: string;
    scenes: number;
    duration_ms: number;
    output_size_bytes?: number;
    error?: string;
  };
  events: TraceEvent[];
  outcome: "success" | "partial" | "failed";
  total_duration_ms: number;
  error?: string;
}

export interface TraceAnalysis {
  total_traces: number;
  by_outcome: { success: number; partial: number; failed: number };
  by_operation: Record<string, number>;
  critique: {
    total_rounds: number;
    avg_score: number;
    revision_rate_pct: number;
  };
  component_gen: {
    total: number;
    avg_llm_ms: number;
    avg_source_length: number;
  };
  timing: {
    avg_total_ms: number;
    p50_total_ms: number;
    p95_total_ms: number;
  };
  render: {
    total: number;
    errors: number;
    avg_duration_ms: number;
    by_format: Record<string, number>;
  };
}

// ── Helpers ──

function traceId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `tr_${ts}_${rand}`;
}

/** Simple string hash (first 12 hex chars). */
export function hashPrompt(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0").slice(0, 12);
}

function tenantTraceDir(tenantId: string): string {
  return path.join(config.dataDir, tenantId, "traces");
}

function tenantTraceFile(tenantId: string): string {
  return path.join(tenantTraceDir(tenantId), "traces.jsonl");
}

// ── TraceBuilder ──

/**
 * Builder for constructing a trace incrementally during a pipeline operation.
 *
 * Create at the start of an operation, call setters as the pipeline progresses,
 * and call finish() in a finally block to write the trace.
 */
export class TraceBuilder {
  private trace: Partial<PipelineTrace>;
  private startTime: number;
  private pendingEventStart = 0;
  private pendingEvent: Partial<TraceEvent> | null = null;

  constructor(operation: OperationType, tenantId: string, projectId: string, prompt: string) {
    this.startTime = Date.now();
    this.trace = {
      trace_id: traceId(),
      ts: new Date().toISOString(),
      operation,
      tenant_id: tenantId,
      project_id: projectId,
      prompt,
      has_brand_kit: false,
      critiques: [],
      events: [],
      outcome: "success",
    };
  }

  setCanvas(width: number, height: number, fps: number): this {
    this.trace.canvas = { width, height, fps };
    return this;
  }

  setBrandKit(hasBrandKit: boolean): this {
    this.trace.has_brand_kit = hasBrandKit;
    return this;
  }

  setStoryboard(data: { scene_count: number; components: string[]; format: string }): this {
    this.trace.storyboard = data;
    return this;
  }

  setComponentGen(type: string, source_length: number, llm_duration_ms: number): this {
    this.trace.component_gen = { type, source_length, llm_duration_ms };
    return this;
  }

  addCritique(round: number, score: number, issues_count: number, revised: boolean, accepted: boolean): this {
    this.trace.critiques!.push({ round, score, issues: issues_count, revised, accepted });
    return this;
  }

  setRender(job_id: string, format: string, scenes_count: number, duration_ms: number, output_size_bytes?: number, error?: string): this {
    this.trace.render = { job_id, format, scenes: scenes_count, duration_ms, output_size_bytes, error };
    return this;
  }

  /** Log a one-off step event with auto-timestamp. */
  logEvent(type: string, data?: Record<string, unknown>): this {
    this.trace.events!.push({
      type,
      timestamp: new Date().toISOString(),
      ...data,
    });
    return this;
  }

  /** Start timing an event. Call endEvent() when done. */
  beginEvent(type: string, data?: Record<string, unknown>): this {
    this.pendingEventStart = Date.now();
    this.pendingEvent = { type, ...data };
    return this;
  }

  /** End the pending timed event. */
  endEvent(data?: Record<string, unknown>): this {
    if (!this.pendingEvent) return this;
    const event: TraceEvent = {
      ...this.pendingEvent,
      ...data,
      type: this.pendingEvent.type as string,
      timestamp: new Date(this.pendingEventStart).toISOString(),
      duration_ms: Date.now() - this.pendingEventStart,
    };
    this.pendingEvent = null;
    this.trace.events!.push(event);
    return this;
  }

  setOutcome(outcome: PipelineTrace["outcome"], error?: string): this {
    this.trace.outcome = outcome;
    this.trace.error = error;
    return this;
  }

  /** Get the trace ID for correlation. */
  get id(): string {
    return this.trace.trace_id!;
  }

  /** Finalize and write the trace to both tenant and global JSONL files. */
  finish(): PipelineTrace {
    this.trace.total_duration_ms = Date.now() - this.startTime;
    const full = this.trace as PipelineTrace;
    appendTrace(full);
    this.emitWarnings(full);
    return full;
  }

  private emitWarnings(trace: PipelineTrace): void {
    if (trace.total_duration_ms > 120_000) {
      console.warn(`[trace] slow_pipeline trace_id=${trace.trace_id} duration_ms=${trace.total_duration_ms} operation=${trace.operation}`);
    }
    if (trace.outcome === "failed") {
      console.error(`[trace] pipeline_failed trace_id=${trace.trace_id} operation=${trace.operation} error=${trace.error}`);
    }
  }
}

// ── File I/O ──

function appendTrace(trace: PipelineTrace): void {
  const line = JSON.stringify(trace) + "\n";

  // Write to tenant-specific file
  try {
    const dir = tenantTraceDir(trace.tenant_id);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(tenantTraceFile(trace.tenant_id), line);
  } catch (err) {
    console.error(`[trace] tenant write error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Write to global system file
  try {
    fs.appendFileSync(SYSTEM_TRACE_FILE, line);
  } catch (err) {
    console.error(`[trace] system write error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Throttled pruning
  const now = Date.now();
  if (now - lastPruneTime > PRUNE_INTERVAL_MS) {
    lastPruneTime = now;
    pruneTraces();
  }
}

// ── Read & Query ──

/**
 * Read traces, optionally filtered. Reads from tenant file if tenantId given,
 * otherwise from the global system file.
 */
export function readTraces(opts?: {
  tenantId?: string;
  since?: string;
  operation?: OperationType;
  limit?: number;
}): PipelineTrace[] {
  try {
    const filePath = opts?.tenantId
      ? tenantTraceFile(opts.tenantId)
      : SYSTEM_TRACE_FILE;

    const raw = fs.readFileSync(filePath, "utf8");
    let traces = raw.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as PipelineTrace);

    if (opts?.tenantId && !opts.tenantId.startsWith("_")) {
      traces = traces.filter((t) => t.tenant_id === opts.tenantId);
    }
    if (opts?.since) traces = traces.filter((t) => t.ts >= opts.since!);
    if (opts?.operation) traces = traces.filter((t) => t.operation === opts.operation);
    if (opts?.limit) traces = traces.slice(-opts.limit);

    return traces;
  } catch {
    return [];
  }
}

// ── Analysis ──

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function analyzeTraces(traces: PipelineTrace[]): TraceAnalysis {
  if (traces.length === 0) return emptyAnalysis();

  const byOutcome = { success: 0, partial: 0, failed: 0 };
  const byOperation: Record<string, number> = {};
  const durations: number[] = [];

  let totalCritiqueRounds = 0;
  let totalCritiqueScore = 0;
  let revisedCount = 0;

  let compGenCount = 0;
  let compGenLlmMs = 0;
  let compGenSourceLen = 0;

  let renderCount = 0;
  let renderErrors = 0;
  const renderDurations: number[] = [];
  const renderByFormat: Record<string, number> = {};

  for (const t of traces) {
    byOutcome[t.outcome]++;
    byOperation[t.operation] = (byOperation[t.operation] || 0) + 1;
    durations.push(t.total_duration_ms);

    for (const c of t.critiques) {
      totalCritiqueRounds++;
      totalCritiqueScore += c.score;
      if (c.revised) revisedCount++;
    }

    if (t.component_gen) {
      compGenCount++;
      compGenLlmMs += t.component_gen.llm_duration_ms;
      compGenSourceLen += t.component_gen.source_length;
    }

    if (t.render) {
      renderCount++;
      renderDurations.push(t.render.duration_ms);
      if (t.render.error) renderErrors++;
      renderByFormat[t.render.format] = (renderByFormat[t.render.format] || 0) + 1;
    }
  }

  return {
    total_traces: traces.length,
    by_outcome: byOutcome,
    by_operation: byOperation,
    critique: {
      total_rounds: totalCritiqueRounds,
      avg_score: totalCritiqueRounds > 0 ? +(totalCritiqueScore / totalCritiqueRounds).toFixed(1) : 0,
      revision_rate_pct: totalCritiqueRounds > 0 ? Math.round((revisedCount / totalCritiqueRounds) * 100) : 0,
    },
    component_gen: {
      total: compGenCount,
      avg_llm_ms: compGenCount > 0 ? Math.round(compGenLlmMs / compGenCount) : 0,
      avg_source_length: compGenCount > 0 ? Math.round(compGenSourceLen / compGenCount) : 0,
    },
    timing: {
      avg_total_ms: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      p50_total_ms: percentile(durations, 0.5),
      p95_total_ms: percentile(durations, 0.95),
    },
    render: {
      total: renderCount,
      errors: renderErrors,
      avg_duration_ms: renderDurations.length > 0 ? Math.round(renderDurations.reduce((a, b) => a + b, 0) / renderDurations.length) : 0,
      by_format: renderByFormat,
    },
  };
}

function emptyAnalysis(): TraceAnalysis {
  return {
    total_traces: 0,
    by_outcome: { success: 0, partial: 0, failed: 0 },
    by_operation: {},
    critique: { total_rounds: 0, avg_score: 0, revision_rate_pct: 0 },
    component_gen: { total: 0, avg_llm_ms: 0, avg_source_length: 0 },
    timing: { avg_total_ms: 0, p50_total_ms: 0, p95_total_ms: 0 },
    render: { total: 0, errors: 0, avg_duration_ms: 0, by_format: {} },
  };
}

// ── Pruning ──

/**
 * Remove trace entries older than 48 hours from both tenant and global files.
 */
export function pruneTraces(): { removed: number; kept: number } {
  let totalRemoved = 0;
  let totalKept = 0;

  // Prune global file
  const globalResult = pruneFile(SYSTEM_TRACE_FILE);
  totalRemoved += globalResult.removed;
  totalKept += globalResult.kept;

  // Prune tenant files
  try {
    const entries = fs.readdirSync(config.dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const traceFile = path.join(config.dataDir, entry.name, "traces", "traces.jsonl");
      if (fs.existsSync(traceFile)) {
        const result = pruneFile(traceFile);
        totalRemoved += result.removed;
        totalKept += result.kept;
      }
    }
  } catch {
    // data dir might not exist yet
  }

  if (totalRemoved > 0) {
    console.log(`[trace] pruned ${totalRemoved} entries, kept ${totalKept}`);
  }

  return { removed: totalRemoved, kept: totalKept };
}

function pruneFile(filePath: string): { removed: number; kept: number } {
  try {
    const cutoff = new Date(Date.now() - TRACE_RETENTION_MS).toISOString();
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const kept: string[] = [];
    let removed = 0;

    for (const line of lines) {
      try {
        const trace = JSON.parse(line);
        if (trace.ts >= cutoff) {
          kept.push(line);
        } else {
          removed++;
        }
      } catch {
        removed++; // malformed line
      }
    }

    if (removed > 0) {
      fs.writeFileSync(filePath, kept.join("\n") + (kept.length > 0 ? "\n" : ""));
    }

    return { removed, kept: kept.length };
  } catch {
    return { removed: 0, kept: 0 };
  }
}

// ── Daily Digest ──

/**
 * Generate a text summary of pipeline health for monitoring.
 */
export function dailyDigest(hoursBack = 24): string {
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();
  const traces = readTraces({ since });
  const analysis = analyzeTraces(traces);

  const lines: string[] = [];
  lines.push(`=== Media Producer Trace Digest (last ${hoursBack}h) ===`);
  lines.push(`Total operations: ${analysis.total_traces}`);
  lines.push(`Success: ${analysis.by_outcome.success}, Partial: ${analysis.by_outcome.partial}, Failed: ${analysis.by_outcome.failed}`);
  lines.push(`Avg pipeline time: ${(analysis.timing.avg_total_ms / 1000).toFixed(1)}s (p95: ${(analysis.timing.p95_total_ms / 1000).toFixed(1)}s)`);

  if (Object.keys(analysis.by_operation).length > 0) {
    lines.push(`\nBy operation:`);
    for (const [op, count] of Object.entries(analysis.by_operation)) {
      lines.push(`  ${op}: ${count}`);
    }
  }

  if (analysis.by_outcome.failed > 0) {
    lines.push(`\n⚠ ${analysis.by_outcome.failed} failures in last ${hoursBack}h`);
    const failures = traces.filter(t => t.outcome === "failed").slice(-5);
    for (const f of failures) {
      lines.push(`  - ${f.operation} ${f.project_id}: ${f.error?.slice(0, 100) || "unknown"}`);
    }
  }

  if (analysis.critique.total_rounds > 0) {
    lines.push(`\nCritique: ${analysis.critique.total_rounds} rounds, avg score ${analysis.critique.avg_score}, ${analysis.critique.revision_rate_pct}% revised`);
  }

  if (analysis.component_gen.total > 0) {
    lines.push(`\nComponent gen: ${analysis.component_gen.total} total, avg LLM ${(analysis.component_gen.avg_llm_ms / 1000).toFixed(1)}s`);
  }

  if (analysis.render.total > 0) {
    lines.push(`\nRenders: ${analysis.render.total} total, ${analysis.render.errors} errors`);
    if (analysis.render.avg_duration_ms > 0) {
      lines.push(`  Avg render time: ${(analysis.render.avg_duration_ms / 1000).toFixed(1)}s`);
    }
  }

  return lines.join("\n");
}

// Prune on startup
pruneTraces();
