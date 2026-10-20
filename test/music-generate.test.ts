import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// "We need to find some new music ... it's the same fucking song. Every
// time" (Marc, 2026-10-08): each film gets its own bed from ElevenLabs'
// music model, cut to the film's length, placed as its music track.
describe("generated music", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("asks for an instrumental of the given length and writes it into the film's audio folder", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gen-music-"));
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, init });
      return new Response(Buffer.from("ID3fake"), { status: 200, headers: { "song-id": "song_123" } });
    }) as any;
    const { generateMusic } = await import("../src/audio/music-generate.js");
    const made = await generateMusic({ prompt: "driving electronic, 120 BPM", seconds: 23.4, name: "Five tools", outDir: dir, fetchImpl });
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128");
    expect(calls[0].init.headers["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(calls[0].init.body)).toEqual({ prompt: "driving electronic, 120 BPM", model_id: "music_v1", force_instrumental: true, music_length_ms: 23400 });
    expect(path.dirname(made.file)).toBe(dir);
    expect(path.basename(made.file)).toMatch(/^music-five-tools-[0-9a-f]{6}\.mp3$/);
    expect(await fs.readFile(made.file, "utf8")).toBe("ID3fake");
    expect(made).toMatchObject({ seconds: 23.4, instrumental: true, song_id: "song_123" });
  });

  it("clamps the length, allows vocals when asked, and needs the key and a prompt", async () => {
    const { musicRequestBody } = await import("../src/audio/music-generate.js");
    expect(musicRequestBody({ prompt: "x", seconds: 1 }).music_length_ms).toBe(3000);
    expect(musicRequestBody({ prompt: "x", seconds: 9999 }).music_length_ms).toBe(600000);
    expect(musicRequestBody({ prompt: "x" }).music_length_ms).toBeUndefined();
    expect(musicRequestBody({ prompt: "x", instrumental: false }).force_instrumental).toBe(false);
    expect(() => musicRequestBody({ prompt: "  " })).toThrow(/prompt/);
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { generateMusic } = await import("../src/audio/music-generate.js");
    await expect(generateMusic({ prompt: "x", outDir: os.tmpdir() })).rejects.toThrow(/ELEVENLABS_API_KEY/);
  });

  it("the audio tool makes it and places it as the film's ONE music track", async () => {
    const server = await fs.readFile(path.join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain('"generate_sfx", "generate_music"');
    expect(server).toMatch(/if \(params\.action === "generate_music"\) \{[\s\S]*?generateMusic\([\s\S]*?const track = placeMusicBed\(project as any, \{/);
  });

  it("one bed per film: placing a bed replaces every music track by type and ducking follows it", async () => {
    const { placeMusicBed, MUSIC_BED_ID } = await import("../src/audio/music-generate.js");
    const p: any = { audio: { tracks: [{ id: "music_bed", type: "music", source: "a" }, { id: "bgm", type: "music", source: "b" }, { id: "vo_scene_0", type: "voiceover", source: "v" }], ducking: { enabled: true, duck_track: "bgm" } } };
    placeMusicBed(p, { source: "new.mp3", volume: 0.14 });
    expect(p.audio.tracks.map((t: any) => `${t.id}:${t.source}`)).toEqual(["vo_scene_0:v", `${MUSIC_BED_ID}:new.mp3`]);
    expect(p.audio.ducking.duck_track).toBe(MUSIC_BED_ID);
  });

  it("the build makes the film its own bed at its length, under the voice, keeping the level; no bed -> nothing made", async () => {
    const { ownMusicBed, filmMusicPrompt } = await import("../src/audio/music-generate.js");
    expect(filmMusicPrompt({ mood: "driving", bpm: 118, seconds: 26, voiced: true })).toMatch(/pop-electronic.*sparse and low-key.*no heavy techno kick.*118 BPM.*26 seconds.*under a voice.*no vocals/);
    const asked: any[] = [];
    const make = async (o: any) => { asked.push(o); return { file: "/tmp/own.mp3", prompt: o.prompt, seconds: o.seconds, model: "music_v1", instrumental: true }; };
    const p: any = { name: "Six Tabs", scenes: [{ duration_seconds: 4 }, { duration_seconds: 21.3 }], audio: { tracks: [{ id: "music_bed", type: "music", source: "/lib/same-song.mp3", volume: 0.18, loop: true, trim_start: 2 }] } };
    const bed = await ownMusicBed(p, { mood: "driving", voiced: true, outDir: "/tmp", make: make as any });
    expect(asked[0].seconds).toBe(27);
    expect(bed).toMatchObject({ id: "music_bed", source: "/tmp/own.mp3", volume: 0.18, duration: 25.3 });
    expect(p.audio.tracks).toHaveLength(1);
    expect(p.audio.tracks[0].trim_start).toBeUndefined();
    expect(await ownMusicBed({ scenes: [{ duration_seconds: 5 }], audio: { tracks: [] } } as any, { outDir: "/tmp", make: make as any })).toBeNull();
    expect(asked).toHaveLength(1);
  });

  it("is the build's default, except for a chosen bed, the brand kit's, one prep made, or a music-first cut", async () => {
    const pipe = await fs.readFile(path.join(process.cwd(), "src/llm/pipeline.ts"), "utf8");
    expect(pipe).toMatch(/!opts\.chosenMusic && musicTrack\?\.source !== "brand-kit" && musicTrack\?\.source !== "generated" && !musicFirstCut && process\.env\.ELEVENLABS_API_KEY/);
    expect(pipe).toMatch(/const bed = await ownMusicBed\(project as any/);
    expect(pipe).not.toMatch(/id: "bgm"/);
  });

  it("the bed ducks under the voice once there is a voice", async () => {
    const { duckUnderVoice } = await import("../src/audio/music-generate.js");
    const p: any = { audio: { tracks: [{ id: "music_bed", type: "music" }, { id: "vo_scene_0", type: "voiceover" }] } };
    expect(duckUnderVoice(p)).toBe(true);
    expect(p.audio.ducking).toMatchObject({ enabled: true, duck_track: "music_bed", trigger_track: "voiceover" });
    expect(duckUnderVoice({ audio: { tracks: [{ id: "music_bed", type: "music" }] } } as any)).toBe(false);
    const pipe = await fs.readFile(path.join(process.cwd(), "src/llm/pipeline.ts"), "utf8");
    expect(pipe).toMatch(/if \(duckUnderVoice\(project as any\)\)/);
  });

  // "I can't stand that song that you keep using" (Marc, Oct 18): a voiceless
  // music-first cut kept the library pick, and the library search was ordered
  // by popularity and took the first hit -- the same song on every such film.
  describe("a music-first cut makes its own bed before the storyboard", () => {
    const kit: any = { assets: [] };
    const ctx = (over: any = {}) => ({ prompt: "an ad", brandKit: kit, tenantId: "t", format: "video" as const, backgroundMusic: true, sceneCount: 6, musicDir: "/tmp/beds", ...over });
    const fakes = () => {
      const made: any[] = [];
      const picked: any[] = [];
      vi.doMock("../src/audio/music-generate.js", async (orig) => ({
        ...(await orig<any>()),
        generateMusic: async (o: any) => { made.push(o); return { file: "/tmp/beds/music-upbeat-abc123.mp3", prompt: o.prompt, seconds: o.seconds, model: "music_v1", instrumental: true, song_id: "song_9" }; },
      }));
      vi.doMock("../src/audio/music.js", async (orig) => ({
        ...(await orig<any>()),
        selectMusic: async (o: any) => { picked.push(o); return { id: "jamendo-1129271", title: "Same Song", artist: "x", duration: 120, path: "/lib/same.mp3", source: "jamendo", license: "CC" }; },
      }));
      vi.doMock("../src/audio/beat-map.js", () => ({ analyzeBeats: async () => ({ bpm: 118, barSec: 2.03, firstDownbeatSec: 0, confidence: 0.8 }) }));
      return { made, picked };
    };
    afterEach(() => { vi.doUnmock("../src/audio/music-generate.js"); vi.doUnmock("../src/audio/music.js"); vi.doUnmock("../src/audio/beat-map.js"); });

    it("cuts to a bed made for the film, at its length with a margin, in its mood", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "k");
      const { made, picked } = fakes();
      const { runGrammarPrep } = await import("../src/llm/grammar-prep.js");
      const prep = await runGrammarPrep("hype-cut", ctx({ musicMood: "upbeat" }));
      expect(picked).toHaveLength(0);
      expect(made[0]).toMatchObject({ seconds: 42, outDir: "/tmp/beds" }); // 6 scenes x 5.5 s x 1.25
      expect(made[0].prompt).toMatch(/^upbeat, modern instrumental.*42 seconds.*no vocals/);
      expect(prep.music).toMatchObject({ source: "generated", path: "/tmp/beds/music-upbeat-abc123.mp3", id: "generated-song_9" });
      expect(prep.beatMap?.bpm).toBe(118);
    });

    it("the brand kit's music, the board's chosen bed, no key, or a failed generation keep the old order", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "k");
      const { made, picked } = fakes();
      const { runGrammarPrep } = await import("../src/llm/grammar-prep.js");
      await runGrammarPrep("hype-cut", ctx({ brandKit: { assets: [{ type: "music", name: "ours", url: "/k/ours.mp3" }] } }));
      const chosen: any = { id: "c", title: "Picked", artist: "", duration: 60, path: "/c.mp3", source: "stock", license: "" };
      expect((await runGrammarPrep("hype-cut", ctx({ chosenMusic: chosen }))).music).toBe(chosen);
      expect(made).toHaveLength(0);
      expect(picked).toHaveLength(1);
      vi.stubEnv("ELEVENLABS_API_KEY", "");
      expect((await runGrammarPrep("hype-cut", ctx())).music?.source).toBe("jamendo");
      expect(made).toHaveLength(0);
    });

    it("a failed generation falls back to the library", async () => {
      vi.stubEnv("ELEVENLABS_API_KEY", "k");
      const { ownFilmBed } = await import("../src/llm/grammar-prep.js");
      await expect(ownFilmBed({ musicDir: "/tmp" }, "calm", 30, async () => { throw new Error("HTTP 402"); })).rejects.toThrow(/402/);
      const src = await fs.readFile(path.join(process.cwd(), "src/llm/grammar-prep.ts"), "utf8");
      expect(src).toMatch(/own bed not made[\s\S]*?return null;[\s\S]*?if \(!music\) \{[\s\S]*?selectMusic\(/);
    });

    it("the build moves the bed into the film's audio folder, and the library pick is random, not the top hit", async () => {
      const pipe = await fs.readFile(path.join(process.cwd(), "src/llm/pipeline.ts"), "utf8");
      expect(pipe).toMatch(/musicDir: path\.join\(tenantDir\(opts\.tenant_id\), "_staging", "music"\)/);
      expect(pipe).toMatch(/if \(musicTrack\.source === "generated"\) \{[\s\S]*?fs\.rename\(musicTrack\.path, dest\)/);
      const music = await fs.readFile(path.join(process.cwd(), "src/audio/music.ts"), "utf8");
      expect(music).toMatch(/playable\[Math\.floor\(Math\.random\(\) \* playable\.length\)\]/);
      expect(music).not.toMatch(/return results\.find\(\(t\) => t\.audiodownload \|\| t\.audio\) \|\| null/);
    });
  });
});
