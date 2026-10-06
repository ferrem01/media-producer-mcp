/**
 * THE BOX'S HEALTH, AND DEPLOYS THAT DON'T KILL RENDERS (Oct 6). Marc's render
 * started while a deploy was building; the reload cut it off, and the next
 * render died with Chromium's GPU process killed (exit 9) -- most likely the
 * cut-off render's browser still holding memory. Three things here:
 *
 *   - THE DEPLOY LOCK: /api/deploy writes it, scripts/deploy.sh removes it.
 *     While it stands, new renders and builds are refused with a clear
 *     message (core/job-queue.ts) -- the reload can no longer land mid-job.
 *   - MACHINE STATS for /health: memory, load, running jobs, Chromium
 *     processes -- so a remote session can see the box instead of guessing.
 *   - THE ORPHAN SWEEP at startup: render workers and their browsers left
 *     behind by a killed server (reparented to init) are stopped.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";

/** A lock older than this is a deploy that died without cleaning up. */
const LOCK_MAX_AGE_MS = 30 * 60 * 1000;

export function deployLockPath(): string {
  return path.join(config.dataDir, "_system", "deploy.lock");
}

export function writeDeployLock(branch: string): void {
  fs.mkdirSync(path.dirname(deployLockPath()), { recursive: true });
  fs.writeFileSync(deployLockPath(), JSON.stringify({ branch, started_at: new Date().toISOString() }));
}

/** True while a deploy is under way (and not stale). */
export function isDeploying(): boolean {
  try {
    const st = fs.statSync(deployLockPath());
    return Date.now() - st.mtimeMs < LOCK_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Linux processes as {pid, ppid, cmd}; [] where /proc is not there. */
function processes(): Array<{ pid: number; ppid: number; cmd: string }> {
  const out: Array<{ pid: number; ppid: number; cmd: string }> = [];
  let ids: string[] = [];
  try { ids = fs.readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch { return out; }
  for (const id of ids) {
    try {
      const stat = fs.readFileSync(`/proc/${id}/stat`, "utf8");
      // pid (comm) state ppid ... -- comm may hold spaces, so split after ")".
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      const cmd = fs.readFileSync(`/proc/${id}/cmdline`, "utf8").replace(/\0/g, " ").trim();
      out.push({ pid: Number(id), ppid, cmd });
    } catch { /* gone, or not ours to read */ }
  }
  return out;
}

const isBrowser = (cmd: string) => /chrom(e|ium)|headless_shell/i.test(cmd) && /playwright/i.test(cmd);
const isWorker = (cmd: string) => /\/dist\/core\/(scene|capture)-worker\.js/.test(cmd);

/** Free space where renders write: Chromium keeps its shared memory in /tmp
 *  (--disable-dev-shm-usage), frames and work dirs land there and in the
 *  data dir. A full disk breaks screenshots while RAM looks fine. */
function diskFree(dir: string): { free_mb: number; used_pct: number } | null {
  try {
    const st = fs.statfsSync(dir);
    const total = st.blocks * st.bsize, free = st.bavail * st.bsize;
    return { free_mb: Math.round(free / 1048576), used_pct: total ? Math.round((1 - free / total) * 100) : 0 };
  } catch { return null; }
}

export function machineStats(): Record<string, unknown> {
  const mb = (b: number) => Math.round(b / 1048576);
  const procs = processes();
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  // Browser MAIN processes (no --type=) and who holds them: this server, a
  // render worker, init (an orphan), or something else -- by parent name.
  const owners: Record<string, number> = {};
  for (const p of procs) {
    if (!isBrowser(p.cmd) || /--type=/.test(p.cmd)) continue;
    const parent = byPid.get(p.ppid);
    const who = p.ppid === process.pid ? "this server" : p.ppid === 1 ? "init (orphan)"
      : parent && isWorker(parent.cmd) ? "render worker"
      : parent ? (/dist\/index\.js/.test(parent.cmd) ? "another server process" : parent.cmd.split(" ")[0].split("/").pop() || "?") : "?";
    owners[who] = (owners[who] || 0) + 1;
  }
  return {
    memory_mb: { total: mb(os.totalmem()), free: mb(os.freemem()), server_rss: mb(process.memoryUsage().rss) },
    load_1m: Math.round(os.loadavg()[0] * 100) / 100,
    disk: { tmp: diskFree(os.tmpdir()), data: diskFree(config.dataDir) },
    browsers: procs.filter((p) => isBrowser(p.cmd)).length,
    browser_owners: owners,
    render_workers: procs.filter((p) => isWorker(p.cmd)).length,
  };
}

/** Stop render workers and browsers a killed server left behind: only
 *  orphans (reparented to init, ppid 1), never a live server's children. */
export function sweepOrphans(): number {
  let killed = 0;
  for (const p of processes()) {
    if (p.ppid !== 1 || p.pid === process.pid) continue;
    if (!isWorker(p.cmd) && !isBrowser(p.cmd)) continue;
    try { process.kill(p.pid, "SIGKILL"); killed++; } catch { /* already gone */ }
  }
  return killed;
}
