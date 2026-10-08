import { describe, it, expect } from "vitest";
import { frameFilter, frameFileFor, wideFileFor, asRecastFrame } from "../src/core/recast.js";
import { softenCastPunchIns, PUNCH_ON_PERSON, PUNCH_ON_CAST } from "../src/core/speaker-layer.js";
import { personCameraMoves } from "../src/llm/scene-generator.js";

// HOW FAR BACK A RECAST SITS (Marc, Oct 6: "when I recast it puts the camera
// so close ... I want to be further back and I have the footage"). His twin
// is a LANDSCAPE HeyGen look: covering a portrait frame keeps the middle
// third of its width, ~1.8x in -- and the creator-cut punch-ins added 1.22x.

describe("recast framing", () => {
  it("tight covers the frame around the face; medium and wide pull back over a soft copy of the shot", () => {
    const face = { cx: 0.62, cy: 0.4 };
    expect(frameFilter(1920, 1080, 1080, 1920, "tight", face)).toBe("[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920:1576:0,setsar=1[v]");
    const m = frameFilter(1920, 1080, 1080, 1920, "medium", face);
    expect(m).toContain("boxblur=");                                    // the soft fill above and below
    expect(m).toContain("[b]scale=2730:1536:flags=lanczos,crop=1080:1536:");  // 80% of the frame's height
    expect(m).toContain("overlay=0:192");                               // centred top to bottom
    const fx = Number(/crop=1080:1536:(\d+):0/.exec(m)![1]);
    expect(Math.abs(fx + 540 - 0.62 * 2730)).toBeLessThan(4);           // around the face
    expect(frameFilter(1920, 1080, 1080, 1920, "wide", face)).toContain("[b]scale=2218:1248");  // 65%
  });
  it("a picture of the take's own shape is just covered, whatever the frame", () => {
    expect(frameFilter(1080, 1920, 1080, 1920, "wide", null)).toBe("[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1[v]");
  });
  it("names the kept original and each frame's fit beside the recast", () => {
    const f = "/assets/t/projects/p/assets/take-1.actor-marc-heygen.mp4";
    expect(wideFileFor(f)).toBe("/assets/t/projects/p/assets/take-1.actor-marc-heygen.original.mp4");
    expect(frameFileFor(f, "medium")).toBe("/assets/t/projects/p/assets/take-1.actor-marc-heygen.medium.mp4");
    expect(frameFileFor(frameFileFor(f, "medium"), "tight")).toBe(f);
    expect(wideFileFor(frameFileFor(f, "wide"))).toBe("/assets/t/projects/p/assets/take-1.actor-marc-heygen.original.mp4");
    expect(frameFileFor(f, "wide")).not.toBe(wideFileFor(f));          // the wide fit never overwrites the original
    expect(asRecastFrame("medium")).toBe("medium");
    expect(asRecastFrame("huge")).toBeNull();
  });
});

describe("gentler punch-ins where a cast actor performs", () => {
  it("eases the rule's 1.22x zooms to 1.1x on recast scenes only, leaving hand-set moves alone", () => {
    const rule = () => [{ at: 0.2, type: "zoom", x: 50, y: 42, scale: PUNCH_ON_PERSON, duration: 0.45 }, { at: 1, type: "reset" }];
    const project: any = {
      scenes: [{ camera_moves: rule() }, { camera_moves: [...rule(), { at: 3, type: "zoom", anchor: "chart.body", scale: PUNCH_ON_PERSON }] }, { camera_moves: rule() }],
      takes: [{ id: "a", scene_index: 0, source: "/a.mp4", actors: { marc: { file: "/a.actor.mp4" } } },
              { id: "b", scene_index: 1, source: "/b.mp4", actors: { marc: { file: "/b.actor.mp4" } } },
              { id: "c", scene_index: 2, source: "/c.mp4" }],
      speaker_track: { clips: [{ scene_index: 0, source: "/a.actor.mp4" }, { scene_index: 1, source: "/b.actor.mp4" }, { scene_index: 2, source: "/c.mp4" }] },
      speaker_cast: "marc",
    };
    expect(softenCastPunchIns(project)).toBe(2);
    expect(project.scenes[0].camera_moves[0].scale).toBe(PUNCH_ON_CAST);
    expect(project.scenes[1].camera_moves[2].scale).toBe(PUNCH_ON_PERSON);   // anchored: hand-set
    expect(project.scenes[2].camera_moves[0].scale).toBe(PUNCH_ON_PERSON);   // no recast: the recording
    expect(softenCastPunchIns(project)).toBe(0);                             // idempotent
  });
  it("a scene planned for a cast actor is built with the gentler punch-in", () => {
    const o = { grammar: "creator-cut", duration: 8, takeover: false };
    expect(personCameraMoves([], o)![0].scale).toBe(PUNCH_ON_PERSON);
    expect(personCameraMoves([], { ...o, cast: true })![0].scale).toBe(PUNCH_ON_CAST);
  });
});
