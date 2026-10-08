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

  it("the audio tool makes it and places it as the film's music track", async () => {
    const server = await fs.readFile(path.join(process.cwd(), "src/server.ts"), "utf8");
    expect(server).toContain('"generate_sfx", "generate_music"');
    expect(server).toMatch(/if \(params\.action === "generate_music"\) \{[\s\S]*?generateMusic\([\s\S]*?project\.audio\.tracks = \[\.\.\.project\.audio\.tracks\.filter\(\(t\) => t\.id !== id\), track\];/);
  });
});
