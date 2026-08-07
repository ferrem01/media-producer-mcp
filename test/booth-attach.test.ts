/**
 * Mode B booth attach (SPEC-recorder.md): narration recorded AGAINST the
 * locked cut is laid on top of the project without touching picture. These
 * tests mock the media probes (ffmpeg/whisper) and verify the pure assembly
 * logic: scene targeting + offset, caption shifting, retake idempotence, and
 * the picture-lock guarantee.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/core/auto-compress.js", () => ({
  probeMediaDuration: vi.fn(async () => 38.2),
  proposeSceneCompression: vi.fn(),
  proposeChapterPins: vi.fn(),
}));
vi.mock("../src/core/sentence-spine.js", () => ({
  getSentenceSpine: vi.fn(async () => ({
    sentences: [
      { text: "Welcome to the walkthrough.", start: 1.0, end: 3.0, words: 4 },
      { text: "Here we open chat history.", start: 8.0, end: 10.5, words: 5 },
      { text: "And this caption lands after the scene ends.", start: 40.0, end: 42.0, words: 8 },
    ],
    chapters: [
      { title: "", start: 1.0, end: 10.5, firstSentence: 0, lastSentence: 1 },
    ],
  })),
}));
vi.mock("../src/audio/music.js", () => ({
  selectMusic: vi.fn(async () => ({ path: "/music/bed.mp3", title: "Calm Bed", artist: "Test", source: "jamendo" })),
}));
vi.mock("../src/core/video-normalize.js", () => ({
  probeVideo: vi.fn(async () => ({ videoCodec: null, audioCodec: "opus" })),
  remuxMediaRecorderFile: vi.fn(async () => false),
}));

import { attachBoothNarration } from "../src/llm/narrated-screencast.js";
import { getSentenceSpine } from "../src/core/sentence-spine.js";
import { selectMusic } from "../src/audio/music.js";
import { probeVideo } from "../src/core/video-normalize.js";

function recorderProject(): any {
  return {
    project_id: "proj_test",
    tenant_id: "t",
    scenes: [
      {
        id: "intro", label: "Branded Intro", duration_seconds: 6.1,
        components: [{ id: "intro_v", type: "screencast-frame", data: {} }],
      },
      {
        id: "screencast", label: "Walkthrough", duration_seconds: 26.9,
        components: [{ id: "screencast_v", type: "screencast-frame", data: {} }],
        media_edits: {
          screencast: {
            segments: [{ src_start: 0, src_end: 74.25, rate: 2.76 }],
            pins: [], cuts: [],
            rate_regions: [{ src_start: 0.5, src_end: 3.8, rate: 8 }],
          },
        },
      },
      {
        id: "outro", label: "Branded Outro", duration_seconds: 5.2,
        components: [{ id: "outro_v", type: "screencast-frame", data: {} }],
      },
    ],
  };
}

describe("attachBoothNarration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attaches narration + shifted captions to the media-edits scene", async () => {
    const project = recorderProject();
    const res = await attachBoothNarration({ project, narrationSource: "/assets/t/take.webm" });

    const tracks = (project.audio as any).tracks;
    expect(tracks[0]).toMatchObject({ id: "narration", source: "/assets/t/take.webm" });
    expect((project.audio as any).ducking).toMatchObject({ duck_track: "music_bed", trigger_track: "narration" });

    const overlay = project.scenes[1].components.find((c: any) => c.id === "narration_overlay");
    expect(overlay).toBeTruthy();
    // Captions shift by the 6.1s intro: the sentence spoken DURING the intro
    // (1-3s) and the one past the 26.9s scene end both drop; only the 8s one
    // lands, at scene-local time.
    expect(overlay.data.captions).toHaveLength(1);
    expect(overlay.data.captions[0].start).toBeCloseTo(8.0 - 6.1, 2);
    expect(res.captions).toBe(1);
    expect(project.status).toBe("generated");
  });

  it("never touches picture: scenes, durations and media edits stay identical", async () => {
    const project = recorderProject();
    const before = JSON.parse(JSON.stringify(project.scenes)).map((s: any) => {
      delete s.components; // overlay add is the one allowed change
      return s;
    });
    await attachBoothNarration({ project, narrationSource: "/assets/t/take.webm" });
    const after = JSON.parse(JSON.stringify(project.scenes)).map((s: any) => {
      delete s.components;
      return s;
    });
    expect(after).toEqual(before);
  });

  it("retake replaces the narration track and overlay without duplicating, and keeps the bed", async () => {
    const project = recorderProject();
    await attachBoothNarration({ project, narrationSource: "/assets/t/take1.webm" });
    await attachBoothNarration({ project, narrationSource: "/assets/t/take2.webm" });

    const tracks = (project.audio as any).tracks;
    expect(tracks.filter((t: any) => t.id === "narration")).toHaveLength(1);
    expect(tracks.find((t: any) => t.id === "narration").source).toBe("/assets/t/take2.webm");
    expect(tracks.filter((t: any) => t.id === "music_bed")).toHaveLength(1);
    expect(selectMusic).toHaveBeenCalledTimes(1); // bed picked once, kept on retake

    const overlays = project.scenes[1].components.filter((c: any) => c.id === "narration_overlay");
    expect(overlays).toHaveLength(1);
  });

  it("narrationStartsAt (Mode A): captions stay scene-local, track gets start_time", async () => {
    const project = recorderProject();
    await attachBoothNarration({
      project,
      narrationSource: "/assets/t/live.m4a",
      narrationStartsAt: 6.1, // live narration begins WITH the demo scene
    });
    const overlay = project.scenes[1].components.find((c: any) => c.id === "narration_overlay");
    // Narration-file times ARE scene times now: 1.0s and 8.0s both land unshifted.
    expect(overlay.data.captions.map((c: any) => c.start)).toEqual([1.0, 8.0]);
    const narr = (project.audio as any).tracks.find((t: any) => t.id === "narration");
    expect(narr.start_time).toBeCloseTo(6.1, 3);
  });

  it("camera take (video booth recording): PiP bubble with film-offset EDL", async () => {
    (probeVideo as any).mockResolvedValueOnce({ videoCodec: "vp9", audioCodec: "opus" });
    const project = recorderProject();
    await attachBoothNarration({ project, narrationSource: "/assets/t/booth-take-1.webm" });

    const scene = project.scenes[1];
    const pip = scene.components.find((c: any) => c.id === "booth_pip");
    expect(pip).toBeTruthy();
    expect(pip.data.video_url).toBe("/assets/t/booth-take-1.webm");
    // Take runs on the film clock from 0; the walkthrough starts at 6.1s, so
    // the bubble's EDL offsets 6.1s into the take for the scene's 26.9s.
    const key = Object.keys(scene.media_edits).find((k) => k.includes("booth-take-1.webm"))!;
    expect(scene.media_edits[key].segments[0].src_start).toBeCloseTo(6.1, 2);
    expect(scene.media_edits[key].segments[0].src_end).toBeCloseTo(Math.min(38.2, 6.1 + 26.9), 1);
  });

  it("audio-only take adds no bubble", async () => {
    const project = recorderProject();
    await attachBoothNarration({ project, narrationSource: "/assets/t/take.webm" });
    expect(project.scenes[1].components.find((c: any) => c.id === "booth_pip")).toBeUndefined();
  });

  it("records the take as the SPEAKER lane (no EDL -- locked-cut take plays straight)", async () => {
    const project = recorderProject();
    await attachBoothNarration({ project, narrationSource: "/assets/t/take2.webm" });
    expect((project as any).speaker.clips).toEqual([
      { at: 0, source: "/assets/t/take2.webm", derived_audio: "/assets/t/take2.webm" },
    ]);
  });

  // You are the speaker. A booth take is the film's VOICE, and the speaker
  // lane is film-level -- it no more needs a screen recording than a music bed
  // does. This used to throw "project has no screencast scene to narrate",
  // which meant a hype-cut, an editorial film, or any film without a
  // recording in it could not carry your own voice. The throw was guarding a
  // caption-offset calculation, not the audio.
  it("narrates a film with NO screencast in it -- a hype-cut, say", async () => {
    const project: any = {
      project_id: "p", tenant_id: "t",
      scenes: [
        { id: "s1", duration_seconds: 5, components: [{ type: "kinetic-text" }] },
        { id: "s2", duration_seconds: 6, components: [{ type: "quotient-chat" }] },
      ],
    };
    const res = await attachBoothNarration({ project, narrationSource: "/assets/t/take.webm" });

    // The voice is the point, and it lands twice: as the audio the render
    // mixes, and as the speaker lane Studio draws.
    expect((project.audio as any).tracks[0].id).toBe("narration");
    expect((project.audio as any).tracks[0].type).toBe("voiceover");
    expect((project as any).speaker.clips[0].source).toBe("/assets/t/take.webm");

    // Captions and chapter cards are scene-local decorations with nowhere to
    // live here. They are SKIPPED, and the summary says so rather than
    // implying a spine was attached.
    expect(res.captions).toBe(0);
    expect(res.chapters).toBe(0);
    expect(res.summary).toContain("you are the speaker");
    for (const sc of project.scenes) {
      expect((sc.components || []).some((c: any) => c.type === "narration-track")).toBe(false);
    }
  });

  it("degrades to bare narration when whisper is unavailable", async () => {
    (getSentenceSpine as any).mockResolvedValueOnce(null);
    const project = recorderProject();
    const res = await attachBoothNarration({ project, narrationSource: "/assets/t/take.webm" });
    expect(res.captions).toBe(0);
    expect(res.summary).toContain("no spine");
    expect((project.audio as any).tracks[0].id).toBe("narration");
  });
});
