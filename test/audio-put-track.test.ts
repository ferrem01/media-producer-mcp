import { describe, it, expect } from "vitest";
import { putTrack } from "../src/audio/tracks.js";

// Re-voicing vo_scene_2 with audio add left three copies of the line on the
// film (Oct 8, proj_f5c104bb): an add with a known id replaces that track.
describe("putTrack", () => {
  const t = (id: string, source = id) => ({ id, type: "voiceover" as const, source, volume: 1 });
  it("replaces a track with the same id, in its place", () => {
    const out = putTrack([t("a"), t("b"), t("c")], t("b", "new"));
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(out[1].source).toBe("new");
  });
  it("appends a new id, and collapses copies already stacked", () => {
    expect(putTrack([t("a")], t("b")).map((x) => x.id)).toEqual(["a", "b"]);
    expect(putTrack([t("a"), t("b"), t("b")], t("b", "n")).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
