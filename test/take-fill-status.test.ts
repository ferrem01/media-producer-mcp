import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { faceFillGraph, DEFAULT_FILL_STRENGTH } from "../src/core/take-studio.js";
import { gradeTake, gradeChain } from "../src/core/take-sanitize.js";
import { takeJobSet, takeJobProgress, takeJobDone, takeJobsFor, markTakeJobError } from "../src/core/take-jobs.js";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

const run = promisify(execFile);
const HERE = path.dirname(new URL(import.meta.url).pathname);

// Marc, 2026-09-27, on his booth take: "The dark side of my face looks
// sunken and I have bags under my eyes." And on Studio: "I wonder if it
// actually worked ... whether the inspector is hooked up to the back end."
// And: "can I get control as to how much the blur is?"

describe("the fill light: the face's shadows lifted, nothing else", () => {
  const region = { cx: 0.5, cy: 0.43, rx: 0.17, ry: 0.12 };

  it("is one input, one output: the frame, a lifted copy, and a mask that is a feathered face ellipse times a luma band", () => {
    const g = faceFillGraph(1080, 1920, region, 0.5);
    expect(g.startsWith("split=2[fillbase][fillsrc]")).toBe(true);
    expect(g.endsWith("[fillbase][fillover]overlay=format=auto")).toBe(true);
    // At 0.5, the side-by-side Marc saw: 0.2 -> 0.27, 0.45 -> 0.52.
    expect(g).toContain("curves=all='0/0 0.2/0.27 0.45/0.52 0.75/0.77 1/1'");
    // The mask: a quarter-size expression, scaled up and softened.
    expect(g).toContain("scale=270:480:flags=area,format=gray,geq=lum='255*pow(max(0,1-");
    expect(g).toContain("clip((176-lum(X,Y))/70,0,1)*clip((lum(X,Y)-45)/40,0,1)"); // the lit cheek and the pupils/brows left alone
    expect(g).toContain("scale=1080:1920:flags=bicubic,gblur=sigma=6");
    expect(DEFAULT_FILL_STRENGTH).toBe(0.5);
  });

  it("scales with strength, and is nothing at 0 or without a face", () => {
    expect(faceFillGraph(1080, 1920, region, 1)).toContain("0.2/0.34 0.45/0.59 0.75/0.79");
    expect(faceFillGraph(1080, 1920, region, 0)).toBe("");
    expect(faceFillGraph(1080, 1920, { cx: 0.5, cy: 0.5, rx: 0, ry: 0 }, 0.5)).toBe("");
  });

  it("sits between the correction and the look in the grade's one graph", () => {
    expect(gradeChain("eq=a", "", "hqdn3d")).toBe("eq=a,hqdn3d");
    expect(gradeChain("", "", "")).toBe("null");
    expect(gradeChain("eq=a", "split=2[x][y];[x][y]overlay", "hqdn3d")).toBe("eq=a,split=2[x][y];[x][y]overlay,hqdn3d");
    expect(gradeChain("", "split=2[x][y];[x][y]overlay", "")).toBe("split=2[x][y];[x][y]overlay");
  });

  it("really lifts a face's shadow and leaves the wall and the lit skin alone (ffmpeg)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fill-"));
    try {
      // A 270x480 frame: a mid-dark "shadow cheek" square in the face's
      // place, a bright "lit" square beside it, a grey wall around.
      const src = path.join(dir, "take-a.mp4");
      await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x9a9a9a:s=270x480:r=30:d=1",
        "-vf", "drawbox=x=115:y=180:w=20:h=30:color=0x6e6e6e:t=fill,drawbox=x=145:y=180:w=20:h=30:color=0xe0e0e0:t=fill",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", src]);
      const px = async (file: string, x: number, y: number) => {
        const { stdout } = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", `format=gray,crop=2:2:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { encoding: "buffer" as any });
        return (stdout as unknown as Buffer)[0];
      };
      const before = { shadow: await px(src, 125, 195), lit: await px(src, 155, 195), wall: await px(src, 20, 20) };
      const g = await gradeTake(src, { look: "natural", correct: false, face: { cx: 0.52, cy: 0.4, size: 0.2 }, fill: 0.8 });
      expect(g.fill).toBe(0.8);
      const after = { shadow: await px(src, 125, 195), lit: await px(src, 155, 195), wall: await px(src, 20, 20) };
      expect(after.shadow - before.shadow).toBeGreaterThan(8);         // the shadow is lifted
      expect(Math.abs(after.lit - before.lit)).toBeLessThanOrEqual(3); // the lit cheek is not
      expect(Math.abs(after.wall - before.wall)).toBeLessThanOrEqual(2); // nor the wall
      // Off: the original back, byte for byte.
      const off = await gradeTake(src, { look: "natural", correct: false, face: { cx: 0.52, cy: 0.4, size: 0.2 }, fill: 0 });
      expect(off.fill).toBe(0);
      expect(await px(src, 125, 195)).toBe(before.shadow);
      // No face: no fill, whatever the dial says.
      const blind = await gradeTake(src, { look: "natural", correct: false, face: null, fill: 1 });
      expect(blind.fill).toBe(0);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }, 60000);
});

describe("what the take is doing: the job board and the failures", () => {
  it("tracks a grade and a matte per take file, with progress, and forgets them when done", () => {
    takeJobSet("t1", "p1", "/assets/t1/projects/p1/assets/take-a.mp4", "grade", "running", ["soft 80", "fill 50"]);
    takeJobSet("t1", "p1", "/assets/t1/projects/p1/assets/take-a.mp4", "matte", "running", ["blur"]);
    takeJobProgress("t1", "p1", "/assets/t1/projects/p1/assets/take-a.mp4", "matte", 42.4);
    takeJobSet("t1", "p2", "/assets/t1/projects/p2/assets/take-b.mp4", "grade", "running");
    const jobs = takeJobsFor("t1", "p1");
    expect(jobs.map((j) => j.kind).sort()).toEqual(["grade", "matte"]);
    expect(jobs.find((j) => j.kind === "matte")).toMatchObject({ pct: 42, what: ["blur"], state: "running" });
    expect(jobs.find((j) => j.kind === "grade")!.what).toEqual(["soft 80", "fill 50"]);
    takeJobDone("t1", "p1", "/assets/t1/projects/p1/assets/take-a.mp4", "matte");
    expect(takeJobsFor("t1", "p1").map((j) => j.kind)).toEqual(["grade"]);
    expect(takeJobsFor("t1", "p2")).toHaveLength(1); // another film's job is not this one's
    takeJobDone("t1", "p1", "/assets/t1/projects/p1/assets/take-a.mp4", "grade");
    takeJobDone("t1", "p2", "/assets/t1/projects/p2/assets/take-b.mp4", "grade");
  });

  it("a failure stays on every take cut from the file until that kind next succeeds", () => {
    const raw = "/assets/t/projects/p/assets/take-x.mp4";
    const project = { takes: [{ source: raw, scene_index: 0 }, { source: raw, scene_index: 1 }, { source: "/other.mp4", scene_index: 2 }] as any[] };
    expect(markTakeJobError(project, raw, "matte", "matte decode failed: no frames", (t) => t.source)).toBe(2);
    expect(project.takes[0].job_error).toMatchObject({ kind: "matte", message: "matte decode failed: no frames" });
    expect(project.takes[2].job_error).toBeUndefined();
    expect(markTakeJobError(project, raw, "grade", null, (t) => t.source)).toBe(0); // a grade success does not clear a matte failure
    expect(markTakeJobError(project, raw, "matte", null, (t) => t.source)).toBe(2);
    expect(project.takes[0].job_error).toBeUndefined();
  });

  it("the queues report to the board and record failures on the take", async () => {
    const grade = await fs.readFile(path.join(HERE, "../src/core/take-grade.ts"), "utf8");
    expect(grade).toContain('takeJobSet(job.tenantId, job.projectId, job.rawUrl, "grade", "running", what);');
    expect(grade).toContain('markTakeJobError(project, job.rawUrl, "grade", String(e?.message || e)');
    expect(grade).toContain('else takeJobDone(job.tenantId, job.projectId, job.rawUrl, "grade");');
    const matte = await fs.readFile(path.join(HERE, "../src/core/take-matte.ts"), "utf8");
    expect(matte).toContain('takeJobSet(opts.tenantId, opts.projectId, opts.rawUrl, "matte", "running", what);');
    expect(matte).toContain('takeJobProgress(opts.tenantId, opts.projectId, opts.rawUrl, "matte", (n / total) * 90);');
    expect(matte).toContain('markTakeJobError(project, opts.rawUrl, "matte", String(e?.message || e)');
    // The blur amount: the take's own dial when the caller gives none, kept on the take.
    expect(matte).toContain('if (t0) strength = t0.blur_strength;');
    expect(matte).toContain('if (blurUrl) { t.blur = blurUrl; if (typeof strength === "number") t.blur_strength = strength; }');
  });

  it("the server: GET /api/take-status behind the tenant choke point; fill on take-look; strength on speaker-background", async () => {
    const idx = await fs.readFile(path.join(HERE, "../src/index.ts"), "utf8");
    expect(idx).toMatch(/speaker-background\|take-look\|take-status\|/);
    expect(idx).toContain("const takeStatusMatch = urlPath.match(/^\\/api\\/take-status\\/([^/]+)\\/([^/]+)$/);");
    expect(idx).toContain('if (tlFillN !== undefined && !(tlFillN >= 0 && tlFillN <= 1)) { jsonResponse(res, 400, { error: "fill must be 0-1" }); return; }');
    expect(idx).toContain("if (sbReblur) sbMissing.blur = true;");
    const srv = await fs.readFile(path.join(HERE, "../src/server.ts"), "utf8");
    expect(srv).toContain('fill: z.coerce.number().min(0).max(1).optional().describe("look: fill light on the face\'s shadows 0-1 (omit to keep)"),');
  });
});

describe("Studio: the dials and the status line", () => {
  const html = getPreviewHtml();
  it("carries the fill light and, on a blurred scene, the blur amount", () => {
    expect(html).toMatch(/class="prop-fill-on"/);
    expect(html).toMatch(/type="range" class="prop-fill" min="0\.05" max="1" step="0\.05"/);
    expect(html).toMatch(/type="range" class="prop-blur" min="0" max="1" step="0\.05"/);
    expect(html).toContain("{ scene_index: siU, background: 'blur', strength: bv }");
    expect(html).toContain("fill: fv }");
  });
  it("polls /take-status while work runs and shows it in the job pill: counts, says Done, offers Retry on a failure", () => {
    expect(html).toContain("api('/take-status/' + encodeURIComponent(state.tenantId)");
    expect(html).toContain("'Blurring the background'");
    expect(html).toContain("'Applying the look'");
    expect(html).toContain("Done \u2014 the preview has the new version.");
    expect(html).toContain('<a class="jp-retry">Retry</a><a class="jp-close">Dismiss</a>');
    // Marc: the progress belongs in the pill at the bottom, and it stays
    // until the work is done -- not hidden in the inspector.
    expect(html).toContain('<div id="job-pill"></div>');
    expect(html).toContain('<span class="jp-note">edits to this take wait their turn</span>');
    expect(html).toContain("body.has-job-pill #studio-toast { bottom: 62px; }");
    expect(html).not.toContain('class="prop-take-status"');
    // A film opened while work runs shows it from the start.
    expect(html).toMatch(/jobPillHide\(\); takeStatus\.wasBusy = false;\s*setTimeout\(watchTakeStatus, 0\);/);
    // A re-made blur copy (same url) reloads the preview like a re-grade.
    expect(html).toContain("t.blur_strength == null ? '' : t.blur_strength");
  });
});

describe("a re-grade never strands a clip on a dropped copy (Marc's Instagram take, scene 1)", () => {
  it("a clip left on the take's old blur copy is still the take's: sync puts it back on the raw take, the need stays provided, the matte is asked again", async () => {
    const { syncSpeakerClips, missingSpeakerCopies, takeOwns } = await import("../src/core/speaker-layer.js");
    const { activeTake } = await import("../src/core/take-needs.js");
    const raw = "/assets/t/projects/p/assets/take-2026-09-26T21-50-54-542Z.mp4";
    const blur = "/assets/t/projects/p/assets/take-2026-09-26T21-50-54-542Z-blur.mp4";
    // What the live project held: the grade dropped `take.blur`, the clip kept playing it.
    const project: any = {
      treatment: { filmGrammar: "speaker" },
      scenes: [{ id: "s1", components: [{ type: "video", data: { src: "speaker", background: "blur" } }] }],
      takes: [{ id: "take_7", scene_index: 0, source: raw }],
      speaker_track: { clips: [{ scene_index: 0, source: blur, start: 0 }] },
    };
    expect(takeOwns(project.takes[0], blur)).toBe(true); // the copy's NAME is the take's
    expect(takeOwns(project.takes[0], "/assets/t/projects/p/assets/take-other-blur.mp4")).toBe(false);
    expect(activeTake(project, 0)?.id).toBe("take_7");
    expect(missingSpeakerCopies(project, project.takes[0]).blur).toBe(true); // so the matte runs again
    syncSpeakerClips(project);
    expect(project.speaker_track.clips[0].source).toBe(raw); // no copy yet: the raw take plays
  });

  it("the grade puts clips back on the raw take before it drops the copies", async () => {
    const grade = await fs.readFile(path.join(HERE, "../src/core/take-grade.ts"), "utf8");
    const i = grade.indexOf("if (c.source && (c.source === t.blur || c.source === t.alpha)) c.source = job.rawUrl;");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(grade.indexOf("if (t.blur) { delete t.blur; }"));
  });

  it("a matte asked for while one runs waits and runs next, merged (the newest blur amount wins), instead of being dropped", async () => {
    const matte = await fs.readFile(path.join(HERE, "../src/core/take-matte.ts"), "utf8");
    expect(matte).toContain("mattePending.set(key, { ...opts, blur: !!(opts.blur || prev?.blur), alpha: !!(opts.alpha || prev?.alpha), strength: opts.strength ?? prev?.strength });");
    expect(matte).toContain("if (next) queueTakeMatte({ ...next, blur: !!(next.blur || again.blur), alpha: !!(next.alpha || again.alpha) });");
  });
});

describe("the blur amount, previewed on one frame", () => {
  it("POST /api/blur-preview returns a PNG of the frame at the asked strength; Studio lays it over the speaker video until the copy lands", async () => {
    const idx = await fs.readFile(path.join(HERE, "../src/index.ts"), "utf8");
    expect(idx).toMatch(/take-status\|blur-preview\|/);
    expect(idx).toContain("const png = await blurPreviewFrame(resolveVideoPath(bpRaw, config.dataDir), { at: bpAt, strength: bpStrength, dataDir: config.dataDir });");
    expect(idx).toContain('res.writeHead(200, { "Content-Type": "image/png"');
    // The asked amount is on the take at once, so the dial holds it.
    expect(idx).toContain("for (const t of sbProj.takes || []) if (takeCopies(t).raw === sbRawAll) t.blur_strength = sbStrengthN;");
    const html = getPreviewHtml();
    expect(html).toContain('<img id="blur-preview"');
    expect(html).toContain("showBlurPreview(siU, bv);");
    expect(html).toContain("fetch(withToken('/api/blur-preview/'");
    // Gone on play and when the new copy lands.
    expect(html).toMatch(/function togglePlay\(\) \{\s*hideBlurPreview\(\);/);
    expect(html).toMatch(/if \(regraded\) \{\s*hideBlurPreview\(\);/);
  });
});

describe("a take re-made in place plays its new version (Marc: \"I just changed the fill light and it did not update the video in Studio\")", () => {
  it("Studio's speaker urls carry ?v= the grade's time (plus the blur amount for the blurred copy)", () => {
    const html = getPreviewHtml();
    expect(html).toContain("if (source.startsWith('/assets/')) return takeVersioned(source);");
    expect(html).toContain("var v = t.graded_at + (url === t.blur && t.blur_strength != null ? ':' + t.blur_strength : '');");
  });
  it("the composite's speaker refs are versioned the same way; the asset route matches the path, not the query", async () => {
    const idx = await fs.readFile(path.join(HERE, "../src/index.ts"), "utf8");
    expect(idx).toContain("const u0 = ref0 ? ver(ref0.source, speakerUrlFromSource(ref0.source)) : undefined;");
    expect(idx).toContain('const urlPath = url.split("?")[0];');
  });
});
