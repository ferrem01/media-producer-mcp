import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../src/config.js";
import { deployLockPath, writeDeployLock, isDeploying, machineStats } from "../src/core/server-health.js";
import { queueJob } from "../src/core/job-queue.js";

// Deploys that don't kill renders, and a box you can see (Oct 6: a render
// cut off by a deploy's reload; the next one starved by its leftovers).
describe("the deploy lock and the box's health", () => {
  // Its own data dir: test files run side by side, and a lock in the shared
  // one would refuse THEIR jobs.
  const was = config.dataDir;
  beforeAll(() => { config.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-")); });
  afterAll(() => { fs.rmSync(config.dataDir, { recursive: true, force: true }); config.dataDir = was; });
  afterEach(() => { fs.rmSync(deployLockPath(), { force: true }); });

  it("refuses new renders and builds while a deploy is under way, and lets a take through", () => {
    expect(isDeploying()).toBe(false);
    writeDeployLock("master");
    expect(isDeploying()).toBe(true);
    expect(() => queueJob("render", "t", async () => null)).toThrow(/server is updating/);
    expect(() => queueJob("generate", "t", async () => null)).toThrow(/nothing was started/);
    expect(queueJob("take", "t", async () => null).type).toBe("take");     // a wait, not work
    // A lock left by a deploy that died is ignored after half an hour.
    const old = new Date(Date.now() - 31 * 60 * 1000);
    fs.utimesSync(deployLockPath(), old, old);
    expect(isDeploying()).toBe(false);
  });

  it("reports memory, load, browsers and render workers", () => {
    const s: any = machineStats();
    expect(s.memory_mb.total).toBeGreaterThan(0);
    expect(s.memory_mb.server_rss).toBeGreaterThan(0);
    expect(typeof s.load_1m).toBe("number");
    expect(s.browsers).toBeGreaterThanOrEqual(0);
    expect(s.render_workers).toBeGreaterThanOrEqual(0);
  });

  it("is wired: /health reports it, /api/deploy writes the lock, deploy.sh removes it and waits for running jobs; workers die with their server; leftovers are swept at start", () => {
    const index = fs.readFileSync("src/index.ts", "utf8");
    expect(index).toMatch(/busy: listAllJobs\(\)/);
    expect(index).toMatch(/deploying: isDeploying\(\),\s*\.\.\.machineStats\(\)/);
    expect(index).toContain("writeDeployLock(branch);");
    expect(index).toContain("MP_DEPLOY_LOCK: deployLockPath()");
    expect(index).toMatch(/const n = sweepOrphans\(\)/);
    const sh = fs.readFileSync("scripts/deploy.sh", "utf8");
    expect(sh).toContain(`trap 'rm -f "\${MP_DEPLOY_LOCK:-}"' EXIT`);
    expect(sh.indexOf('"busy":')).toBeLessThan(sh.indexOf("pm2 reload"));
    for (const w of ["src/core/scene-worker.ts", "src/core/capture-worker.ts"]) {
      const src = fs.readFileSync(w, "utf8");
      expect(src).toContain('process.on("disconnect", () => process.exit(1));');
      expect(src).toContain("process.channel?.unref();");               // or a finished worker never exits
    }
    const sweep = fs.readFileSync("src/core/server-health.ts", "utf8");
    expect(sweep).toMatch(/if \(p\.ppid !== 1 \|\| p\.pid === process\.pid\) continue;/);   // only orphans
  });
});
