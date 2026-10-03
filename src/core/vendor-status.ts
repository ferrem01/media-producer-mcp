/**
 * WHAT THE VENDOR SAYS, while a recast or a generated take waits on it.
 * Every polling loop (fal's queue -- Kling, Wan, Seedance --, HeyGen,
 * Runway, Higgsfield) reports each reply here; whoever started the work
 * listens for the duration of one take (`withVendorStatus`), so the status
 * reaches Studio without a callback threaded through every vendor call.
 * Marc: "it's hard to tell where it is and when it's going to be done."
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface VendorStatus {
  /** Who answered: "heygen", "kling", "runway", "higgsfield", ... */
  vendor: string;
  /** Its job id, when it gave one. */
  job?: string;
  /** Its status word, as it said it (IN_QUEUE, processing, RUNNING, ...). */
  status: string;
  /** Place in the vendor's queue, when it says. */
  queue?: number;
  /** 0-1, when it says. */
  progress?: number;
  message?: string;
  /** When this reply came. */
  at: string;
}

const store = new AsyncLocalStorage<(s: VendorStatus) => void>();

/** Listen to every vendor reply made inside `fn`. */
export function withVendorStatus<T>(listen: (s: VendorStatus) => void, fn: () => Promise<T>): Promise<T> {
  return store.run(listen, fn);
}

/** A polling loop's reply. A no-op when nobody listens. */
export function reportVendor(s: Omit<VendorStatus, "at">): void {
  const listen = store.getStore();
  if (!listen) return;
  const clean: VendorStatus = { vendor: s.vendor, status: String(s.status || "unknown"), at: new Date().toISOString() };
  if (s.job) clean.job = String(s.job);
  if (typeof s.queue === "number" && Number.isFinite(s.queue)) clean.queue = s.queue;
  if (typeof s.progress === "number" && Number.isFinite(s.progress)) clean.progress = Math.max(0, Math.min(1, s.progress > 1 ? s.progress / 100 : s.progress));
  if (s.message) clean.message = String(s.message).slice(0, 300);
  try { listen(clean); } catch { /* a listener never breaks the vendor call */ }
}

/** A fal request id from its status URL (.../requests/<id>/status). */
export function falJob(statusUrl: string): string | undefined {
  const m = String(statusUrl || "").match(/requests\/([^/?#]+)/);
  return m ? m[1] : undefined;
}
