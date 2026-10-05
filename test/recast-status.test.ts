import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// "Recasting is such a big job... it's hard to tell where it is and when
// it's going to be done" (Marc). Every vendor reply lands on its take, and
// Studio lists every take with what the vendor says, the time each has run,
// and a time left.

describe("what the vendor says", () => {
  it("reaches whoever listens for that piece of work, and nobody else", async () => {
    const { withVendorStatus, reportVendor, falJob } = await import("../src/core/vendor-status.js");
    const heard: any[] = [];
    reportVendor({ vendor: "heygen", status: "pending" });           // nobody listening: a no-op
    await withVendorStatus((v) => heard.push(v), async () => {
      reportVendor({ vendor: "kling", job: "r1", status: "IN_QUEUE", queue: 3 });
      await new Promise((r) => setTimeout(r, 5));                       // survives an await
      reportVendor({ vendor: "runway", status: "RUNNING", progress: 42, message: "x".repeat(400) });
    });
    expect(heard.map((h) => [h.vendor, h.status, h.queue, h.progress])).toEqual([["kling", "IN_QUEUE", 3, undefined], ["runway", "RUNNING", undefined, 0.42]]);
    expect(heard[1].message.length).toBe(300);
    expect(typeof heard[0].at).toBe("string");
    expect(falJob("https://queue.fal.run/fal-ai/kling/requests/abc-123/status")).toBe("abc-123");
  });

  it("every polling loop reports", () => {
    const at = fs.readFileSync(path.join(__dirname, "..", "src/core/actor-test.ts"), "utf8");
    expect((at.match(/reportVendor\(/g) || []).length).toBeGreaterThanOrEqual(10);
    const rw = fs.readFileSync(path.join(__dirname, "..", "src/core/performers/runway.ts"), "utf8");
    expect((rw.match(/reportVendor\(/g) || []).length).toBe(2);
  });
});

describe("where a recast is", () => {
  it("counts takes finished and estimates the time left from the slowest unfinished take", async () => {
    const { recastProgress } = await import("../src/core/recast.js");
    const now = Date.parse("2026-10-03T12:00:00Z");
    const ago = (s: number) => new Date(now - s * 1000).toISOString();
    const st: any = {
      status: "running", minutes_per_30s: 3, started_at: ago(90),
      files: [
        { status: "done" }, { status: "reused" }, { status: "failed" },
        { status: "running", seconds: 30, started_at: ago(60) },  // 3 min + 15 s expected, 60 s run -> 135
        { status: "running", seconds: 10, started_at: ago(60) },  // 60 + 15 - 60 -> 15
      ],
    };
    expect(recastProgress(st, now)).toEqual({ done: 2, total: 5, failed: 1, eta_seconds: 135 });
    expect(recastProgress({ ...st, status: "done" }, now)!.eta_seconds).toBe(0);
    expect(recastProgress({ ...st, minutes_per_30s: undefined }, now)!.eta_seconds).toBeNull();
    expect(recastProgress(null)).toBeNull();
  });

  it("each take carries its length, its times and the vendor's last reply; the routes hand Studio the progress", () => {
    const rc = fs.readFileSync(path.join(__dirname, "..", "src/core/recast.ts"), "utf8");
    expect(rc).toMatch(/withVendorStatus\(\(v\) => \{ f\.vendor = v; void saveStatus\(tenant, st\); \}/);
    expect(rc).toMatch(/f\.finished_at = new Date\(\)\.toISOString\(\);/);
    const idx = fs.readFileSync(path.join(__dirname, "..", "src/index.ts"), "utf8");
    expect(idx).toMatch(/recast: rcNow, progress: recastProgress\(rcNow\)/);
    expect(idx).toMatch(/jsonResponse\(res, 200, \{ jobs, errors, recast \}\)/);
  });

  it("Studio lists every take and keeps the count in the header pill", () => {
    const s = fs.readFileSync(path.join(__dirname, "..", "src/preview-app/preview-app.ts"), "utf8");
    expect(s).toMatch(/function rcVendorWord\(v\)/);
    expect(s).toMatch(/jobs = jobs\.concat\(\[\{ kind: 'recast'/);
  });
});

describe("the speaker lane after a recast", () => {
  it("reads the raw take's words for every copy, caches the silences, and draws the wave in a real colour", () => {
    const idx = fs.readFileSync(path.join(__dirname, "..", "src/index.ts"), "utf8");
    expect(idx).toMatch(/const tk = takeForClip\(project as any, c as any\) as any;\s*if \(tk\) \{/);
    const ms = fs.readFileSync(path.join(__dirname, "..", "src/core/measured-spine.ts"), "utf8");
    expect(ms).toMatch(/const silences = await cachedSilences\(file, cacheDir\);/);
    const s = fs.readFileSync(path.join(__dirname, "..", "src/preview-app/preview-app.ts"), "utf8");
    expect(s).not.toMatch(/ctx\.fillStyle = 'var\(--blue-300\)';/);
    expect(s).toMatch(/getPropertyValue\('--blue-300'\)/);
  });
});
