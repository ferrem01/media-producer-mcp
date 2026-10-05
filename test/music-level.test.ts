import { describe, it, expect } from "vitest";
import { musicLevel, setMusicLevel } from "../src/audio/music-level.js";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

const film = (over: any = {}) => ({
  audio: {
    tracks: [{ id: "music_bed", type: "music", source: "/x.mp3", volume: 0.18 }, ...(over.voice ? [{ id: "vo_1", type: "voiceover", source: "/v.mp3", volume: 1 }] : [])],
    ducking: { enabled: true, duck_track: "music_bed", trigger_track: "voiceover", ducked_volume: 0.35, attack: 0.3, release: 1.4 },
  },
  ...(over.speaker ? { speaker_track: { clips: [{ id: "c1" }] } } : {}),
}) as any;

describe("the bed's level", () => {
  it("reads the level and the dip, and says when the bed actually dips", () => {
    expect(musicLevel(film({ voice: true }))).toEqual({ volume: 0.18, ducked_volume: 0.35, ducks: true, speaker: false });
    // A speaker film's voice is the speaker track: ducking hears no voiceover.
    expect(musicLevel(film({ speaker: true }))).toMatchObject({ ducks: false, speaker: true });
  });

  it("sets the level on every music clip and the dip on the ducking", () => {
    const p = film({ voice: true });
    p.audio.tracks.push({ id: "music_bed_2", type: "music", source: "/x.mp3", volume: 0.18, start_time: 20 });
    setMusicLevel(p, { volume: 0.1, ducked_volume: 0.5 });
    expect(p.audio.tracks.filter((t: any) => t.type === "music").map((t: any) => t.volume)).toEqual([0.1, 0.1]);
    expect(p.audio.ducking).toMatchObject({ ducked_volume: 0.5, release: 1.4 });
  });

  it("refuses a film with no bed and a level out of range", () => {
    expect(() => setMusicLevel({ audio: { tracks: [] } } as any, { volume: 0.2 })).toThrow(/no music bed/);
    expect(() => setMusicLevel(film(), { volume: 1.5 })).toThrow(/0 to 1/);
    expect(() => setMusicLevel(film(), {})).toThrow(/volume/);
  });

  it("Studio's music card has the dials, saves them, and the ducking loop reads the dip live", () => {
    const html = getPreviewHtml();
    expect(html).toContain("function muLevelHtml(lv)");
    expect(html).toContain("'/music-level/'");
    expect(html).toMatch(/var dk = cp && cp\.audio && cp\.audio\.ducking;/);
  });
});
