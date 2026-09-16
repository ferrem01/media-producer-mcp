import { describe, it, expect } from "vitest";
import {
  ensureSpeakerNeeds, openTakeNeeds, activeTake, attachTake, waitForTake, resolveTakeWaiters, pendingTakeWaiters,
  TAKE_NEED_DESCRIPTION,
} from "../src/core/take-needs.js";
import { migrateProject } from "../src/persistence/project.js";
import { speakerClipForScene } from "../src/core/speaker-track.js";

function speakerProject(lines: Array<string | undefined>): any {
  return {
    project_id: "proj_t", tenant_id: "t", status: "storyboard",
    canvas: { width: 1080, height: 1920, frame: "9x16", fps: 30, background: "#000" },
    treatment: { filmGrammar: "speaker" },
    storyboard: { narrative: "n", scenes: lines.map((v, i) => ({ label: `S${i + 1}`, voiceover_text: v, duration_seconds: 5, assets: [] })) },
    scenes: [],
  };
}

describe("speaker needs", () => {
  it("a speaker board declares one camera take per scene with spoken lines, carrying the script", () => {
    const p = speakerProject(["Hook line.", undefined, "Close line."]);
    expect(ensureSpeakerNeeds(p)).toBe(true);
    const needs = p.storyboard.scenes.map((s: any) => s.assets.find((a: any) => a.type === "camera_video"));
    expect(needs[0]).toMatchObject({ description: TAKE_NEED_DESCRIPTION, status: "needed", priority: "critical", recording_instructions: "Hook line." });
    expect(needs[1]).toBeUndefined();               // no lines, nothing to record
    expect(needs[2].recording_instructions).toBe("Close line.");
    expect(openTakeNeeds(p)).toEqual([0, 2]);
    expect(ensureSpeakerNeeds(p)).toBe(false);      // idempotent
  });

  it("is only for speaker films", () => {
    const p = speakerProject(["Hook line."]); p.treatment.filmGrammar = "hype-cut";
    expect(ensureSpeakerNeeds(p)).toBe(false);
    expect(p.storyboard.scenes[0].assets).toEqual([]);
  });

  it("follows the script when the board is revised", () => {
    const p = speakerProject(["Hook line."]); ensureSpeakerNeeds(p);
    p.storyboard.scenes[0].voiceover_text = "Better hook.";
    expect(ensureSpeakerNeeds(p)).toBe(true);
    expect(p.storyboard.scenes[0].assets[0].recording_instructions).toBe("Better hook.");
  });
});

describe("attaching takes", () => {
  it("fills the scene's need, becomes that scene's clip in scene order, and is recorded", () => {
    const p = speakerProject(["A", "B"]); ensureSpeakerNeeds(p);
    const t2 = attachTake(p, { scene_index: 1, source: "/assets/t/projects/proj_t/assets/b.mp4", recorded_at: "now", capture: "canvas" });
    const t1 = attachTake(p, { scene_index: 0, source: "/assets/t/projects/proj_t/assets/a.mp4", recorded_at: "now", capture: "canvas" });
    expect(p.speaker_track.clips.map((c: any) => [c.scene_index, c.source])).toEqual([[0, t1.source], [1, t2.source]]);
    expect(openTakeNeeds(p)).toEqual([]);
    expect(p.storyboard.scenes[0].assets[0]).toMatchObject({ status: "provided", path: t1.source });
    expect(p.takes.map((t: any) => t.id)).toEqual(["take_0", "take_1"]);
    expect(activeTake(p, 1)).toBe(p.takes[0]);
  });

  it("a new take for the same scene replaces its clip and keeps the older record", () => {
    const p = speakerProject(["A"]); ensureSpeakerNeeds(p);
    attachTake(p, { scene_index: 0, source: "/x/first.mp4", recorded_at: "1", capture: "raw" });
    const again = attachTake(p, { scene_index: 0, source: "/x/second.mp4", recorded_at: "2", capture: "canvas" });
    expect(p.speaker_track.clips).toHaveLength(1);
    expect(p.speaker_track.clips[0].source).toBe("/x/second.mp4");
    expect(p.takes).toHaveLength(2);
    expect(activeTake(p, 0)).toBe(again);
    expect(p.storyboard.scenes[0].assets[0].path).toBe("/x/second.mp4");
  });

  it("a take remembers the lines it was recorded against, so a later edit can be flagged", () => {
    const p = speakerProject(["Your campaign is live.\n(pause)\nNow what?"]); ensureSpeakerNeeds(p);
    const t = attachTake(p, { scene_index: 0, source: "/x/t.mp4", recorded_at: "1", capture: "canvas" });
    expect(t.lines).toBe("Your campaign is live.\n(pause)\nNow what?");
    p.storyboard.scenes[0].voiceover_text = "Your campaign is live.\nNow what?";
    expect(activeTake(p, 0)!.lines).not.toBe(p.storyboard.scenes[0].voiceover_text);
  });

  it("the single `take` record of older projects migrates to takes[] for scene 0", () => {
    const p = migrateProject({
      project_id: "old", canvas: { width: 1080, height: 1920, frame: "9x16" },
      take: { source: "/x/t.mp4", recorded_at: "then", duration: 17 },
      speaker_track: { clips: [{ source: "/x/t.mp4", start: 0 }] },
    }) as any;
    expect(p.take).toBeUndefined();
    expect(p.takes).toEqual([{ id: "take_0", scene_index: 0, capture: "raw", source: "/x/t.mp4", recorded_at: "then", duration: 17 }]);
    // ...and the clip it points at is stamped as scene 0's, so the need
    // reads provided (measured live: proj_c210e5e1 showed "Needs a take"
    // with a take attached).
    expect(p.speaker_track.clips[0].scene_index).toBe(0);
    expect(activeTake(p, 0)).toBe(p.takes[0]);
  });

  it("leaves legacy clips without a take UNSTAMPED: they are the continuous track, not one take per scene", () => {
    // The first migration stamped these 0, 1 -- which turned a single
    // continuous recording into "scene 0's take" and blanked every later
    // scene's camera. A clip is per-scene only when a recorded take says so.
    const p = migrateProject({ project_id: "old", canvas: { width: 1920, height: 1080, frame: "16x9" },
      speaker_track: { clips: [{ source: "/x/a.mp4" }, { source: "/x/b.mp4" }] } }) as any;
    expect(p.speaker_track.clips.map((c: any) => c.scene_index)).toEqual([undefined, undefined]);
  });
});

describe("the take job's waiter", () => {
  it("resolves when a take attaches to the project, or to the scene it waits on", async () => {
    const any = waitForTake("t", "p");
    const s1 = waitForTake("t", "p", 1);
    expect(pendingTakeWaiters("t", "p")).toBe(2);
    const t0 = { id: "take_0", scene_index: 0, source: "/x/0.mp4", recorded_at: "now" };
    expect(resolveTakeWaiters("t", "p", t0)).toBe(1);         // the any-scene waiter only
    expect(await any).toBe(t0);
    expect(pendingTakeWaiters("t", "p")).toBe(1);
    const t1 = { id: "take_1", scene_index: 1, source: "/x/1.mp4", recorded_at: "now" };
    expect(resolveTakeWaiters("t", "p", t1)).toBe(1);
    expect(await s1).toBe(t1);
    expect(pendingTakeWaiters("t", "p")).toBe(0);
    expect(resolveTakeWaiters("t", "other", t1)).toBe(0);     // other projects untouched
  });
});

describe("a waiting take job", () => {
  it("never blocks a deploy (it is a wait, not work)", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/\(j\.status === "running" \|\| j\.status === "queued"\) && j\.type !== "take"\)/);
  });
});

describe("the preview's camera under a scene", () => {
  const scenes = [{ duration_seconds: 9.99 }, { duration_seconds: 6.67 }, { duration_seconds: 9.96 }];
  it("per-scene takes: the scene's own clip from its own trim (measured live: three takes previewed as the first, seeked to the film start)", () => {
    const clips = [
      { source: "/a/t0.mp4", start: 0, scene_index: 0, trim_start: 0.22, trim_end: 10.21 },
      { source: "/a/t1.mp4", start: 0, scene_index: 1, trim_start: 0.78, trim_end: 7.45 },
      { source: "/a/t2.mp4", start: 0, scene_index: 2, trim_start: 0.95, trim_end: 10.91 },
    ];
    expect(speakerClipForScene(clips, scenes, 1)).toEqual({ source: "/a/t1.mp4", offset: 0.78 });
    expect(speakerClipForScene(clips, scenes, 2)).toEqual({ source: "/a/t2.mp4", offset: 0.95 });
    expect(speakerClipForScene(clips.slice(0, 2), scenes, 2)).toBeNull(); // no take yet: no camera, not the wrong one
  });
  it("one continuous track: the first clip at the scene's film start", () => {
    const clips = [{ source: "/a/all.mp4", start: 0, trim_start: 1 }];
    expect(speakerClipForScene(clips, scenes, 0)).toEqual({ source: "/a/all.mp4", offset: 1 });
    expect(speakerClipForScene(clips, scenes, 2)).toEqual({ source: "/a/all.mp4", offset: 1 + 9.99 + 6.67 });
    expect(speakerClipForScene(undefined, scenes, 0)).toBeNull();
  });
});

describe("the desktop Studio's camera follows the scene too", () => {
  it("swaps the speaker element's source per scene and maps the clock through the active clip", async () => {
    const fs = await import("node:fs/promises");
    const app = await fs.readFile(new URL("../src/preview-app/preview-app.ts", import.meta.url), "utf8");
    expect(app).toMatch(/function speakerClipForTime\(time\)/);
    expect(app).toMatch(/x\.scene_index === si/);
    expect(app).toMatch(/var want = speakerClipForTime\(time\);/);
    expect(app).toMatch(/el\.src\.indexOf\(wantBase\) < 0/);          // the source swaps at the cut
    expect(app).toMatch(/\? speakerFilmTime\(spkEl\.currentTime\)/);   // the one-stream clock goes through the active clip
    expect(app).not.toMatch(/time \+ state\.speakerTrimStart/);          // no site still assumes film time 0 = clips[0]
  });
});

describe("every lane follows the scene, not the first clip", () => {
  it("Studio: per-scene pieces, transcript times taken as film times", async () => {
    const fs = await import("node:fs/promises");
    const app = await fs.readFile(new URL("../src/preview-app/preview-app.ts", import.meta.url), "utf8");
    expect(app).toMatch(/function speakerTrackIsPerScene\(\)/);
    expect(app).toMatch(/var wOff = speakerTrackIsPerScene\(\) \? 0 :/);
    expect(app).toMatch(/Take for scene ' \+ \(si \+ 1\)/);
  });
  it("server: transcript, waveform and the scene still come from the scene's own take; no stage camera over the camera", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/segments: laneWords\(lane2, bySrc2\)/);
    expect(src).toMatch(/peaks: lanePeaks\(lane, bySrc, total, 6\)/);
    expect(src).toMatch(/speakerOffset: noCamera \? undefined : thRef \? thRef\.offset : undefined/);
    const pipe = await fs.readFile(new URL("../src/llm/pipeline.ts", import.meta.url), "utf8");
    // A zoom on an over-camera scene zooms the person: re-aimed at the face, never dropped.
    expect(pipe).toMatch(/camera move\(s\) re-aimed at the/);
    expect(pipe).toMatch(/if \(m\.anchor !== undefined \|\| m\.target !== undefined\) \{ delete m\.anchor; delete m\.target; reaimed\+\+; \}/);
  });
});

describe("the camera rides the rig, the cut is a swap, the lane shows the takes", () => {
  it("Studio: a standby camera is preloaded with the next take and swapped in at the cut; the rig camera hides the plain one", async () => {
    const fs = await import("node:fs/promises");
    const app = await fs.readFile(new URL("../src/preview-app/preview-app.ts", import.meta.url), "utf8");
    expect(app).toMatch(/id="speaker-bg2"/);
    expect(app).toMatch(/function preloadNextSpeakerClip\(time\)/);
    expect(app).toMatch(/els\.speakerBg = sby; els\.speakerBg2 = el;/);
    expect(app).toMatch(/!sceneHasRigCamera\(state\.currentSceneIndex\)/);
    expect(app).toMatch(/\/take-poster\//);                                       // the speaker lane wears the take's picture
    expect(app).toMatch(/'&camera=0' : ''/);                                       // the filmstrip shows the scene, not the camera
    const server = await fs.readFile(new URL("../src/index.ts", import.meta.url), "utf8");
    expect(server).toMatch(/\|take\|take-poster\|storyboard\)/);                   // tenant-guarded
    expect(server).toMatch(/speakerRefs\[sc0\.id\] = \{ url: u0, offset: ref0!\.offset \}/);
  });
});

describe("the Studio draft view shows the film's frame", () => {
  it("sets --mp-frame from the canvas, lays a tall still beside its record, and the rail thumbs follow", async () => {
    const fs = await import("node:fs/promises");
    const app = await fs.readFile(new URL("../src/preview-app/preview-app.ts", import.meta.url), "utf8");
    expect(app).toMatch(/setProperty\('--mp-frame', fw \+ '\/' \+ fh\)/);
    expect(app).toMatch(/classList\.toggle\('frame-tall', fh > fw\)/);
    expect(app).toMatch(/\.dv-still \{ width: 100%; aspect-ratio: var\(--mp-frame, 16\/9\)/);
    expect(app).toMatch(/body\.frame-tall \.dv-card \{ display: grid; grid-template-columns: 300px/);
    expect(app).toMatch(/\.dv-rail-thumb \{ width: 100%; aspect-ratio: var\(--mp-frame, 16\/9\)/);
    expect(app).toMatch(/h \+= '<div class="dv-body">';/);
  });
});

describe("a continuous speaker track keeps no scene markers", () => {
  it("migration stamps scene_index only on clips that are recorded takes; a lone continuous clip stays unstamped", () => {
    const cont = migrateProject({ project_id: "c", canvas: { width: 1080, height: 1920, frame: "9x16" },
      speaker_track: { clips: [{ source: "/x/whole-film.mp4", start: 0 }] } }) as any;
    expect(cont.speaker_track.clips[0].scene_index).toBeUndefined();
    const legacyConcat = migrateProject({ project_id: "l", canvas: { width: 1920, height: 1080, frame: "16x9" },
      speaker_track: { clips: [{ source: "/x/a.mp4", start: 0 }, { source: "/x/b.mp4", start: 0 }] } }) as any;
    expect(legacyConcat.speaker_track.clips.map((c: any) => c.scene_index)).toEqual([undefined, undefined]);
    const withTake = migrateProject({ project_id: "t", canvas: { width: 1080, height: 1920, frame: "9x16" },
      takes: [{ id: "take_0", scene_index: 2, source: "/x/t2.mp4", recorded_at: "1" }],
      speaker_track: { clips: [{ source: "/x/t2.mp4", start: 0 }] } }) as any;
    expect(withTake.speaker_track.clips[0].scene_index).toBe(2);
  });
});
