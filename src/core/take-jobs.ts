/**
 * WHAT THE TAKE IS DOING RIGHT NOW -- the grade (soft look, correction,
 * fill light) and the matte (blurred room, cut-out) run in the background
 * for minutes, and Studio showed nothing while they did (Marc, 2026-09-27:
 * "I wonder if it actually worked ... I'm starting to wonder whether the
 * inspector is hooked up to the back end").
 *
 * An in-memory board of the jobs running or waiting per take file, with
 * the matte's progress, read by GET /api/take-status/{tenant}/{project}.
 * A job that FAILS leaves its reason on the take itself (`take.job_error`,
 * persisted: it outlives a restart and a closed tab) until the next run of
 * that kind succeeds. A restart forgets running jobs -- they died with the
 * process -- so the board never claims work that is not happening.
 */

export type TakeJobKind = "grade" | "matte";

export interface TakeJobState {
  /** The take file as stored (/assets/...): every scene cut from it shares the job. */
  raw: string;
  kind: TakeJobKind;
  state: "queued" | "running";
  started_at: string;
  /** 0-100 when the job can count (the matte counts frames). */
  pct?: number;
  /** What the job makes: the look it applies, or the copies (blur, alpha). */
  what?: string[];
}

/** What a failed job leaves on the take. */
export interface TakeJobError { kind: TakeJobKind; message: string; at: string }

const board = new Map<string, TakeJobState>();
const keyOf = (tenant: string, project: string, raw: string, kind: TakeJobKind) => `${tenant}/${project}\u0000${raw}\u0000${kind}`;

export function takeJobSet(tenant: string, project: string, raw: string, kind: TakeJobKind, state: TakeJobState["state"], what?: string[]): void {
  const k = keyOf(tenant, project, raw, kind);
  const prev = board.get(k);
  board.set(k, { raw, kind, state, started_at: state === "running" && prev?.state !== "running" ? new Date().toISOString() : prev?.started_at || new Date().toISOString(), ...(what ? { what } : prev?.what ? { what: prev.what } : {}) });
}

export function takeJobProgress(tenant: string, project: string, raw: string, kind: TakeJobKind, pct: number): void {
  const j = board.get(keyOf(tenant, project, raw, kind));
  if (j) j.pct = Math.max(0, Math.min(99, Math.round(pct)));
}

export function takeJobDone(tenant: string, project: string, raw: string, kind: TakeJobKind): void {
  board.delete(keyOf(tenant, project, raw, kind));
}

/** Every job running or waiting on this project's takes. */
export function takeJobsFor(tenant: string, project: string): TakeJobState[] {
  const pre = `${tenant}/${project}\u0000`;
  const out: TakeJobState[] = [];
  for (const [k, j] of board) if (k.startsWith(pre)) out.push({ ...j });
  return out;
}

/** Record (or clear, with `err` null) a failure on every take cut from `raw`. */
export function markTakeJobError(project: any, raw: string, kind: TakeJobKind, err: string | null, takeRaw: (t: any) => string): number {
  let n = 0;
  for (const t of project?.takes || []) {
    if (takeRaw(t) !== raw) continue;
    if (err) { t.job_error = { kind, message: err.slice(0, 300), at: new Date().toISOString() } satisfies TakeJobError; n++; }
    else if (t.job_error && t.job_error.kind === kind) { delete t.job_error; n++; }
  }
  return n;
}
