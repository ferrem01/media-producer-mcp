import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// "What about eleven labs" (Marc, 2026-10-01): a sound no library has --
// the FAHHH meme, the Vine boom -- is made from a sentence with ElevenLabs'
// sound-effects model, kept on a generated shelf, and placed like any other.
describe("generated sound effects", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

  it("asks ElevenLabs for the prompt, keeps a house-format WAV, and lists it on the generated shelf", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gen-sfx-"));
    vi.stubEnv("MP_DATA_DIR", dir);
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    const mp3 = path.join(dir, "src.mp3");
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=300:duration=1.2", "-ac", "2", "-c:a", "libmp3lame", mp3]);
    const bytes = await fs.readFile(mp3);
    const calls: any[] = [];
    vi.stubGlobal("fetch", async (url: string, init: any) => { calls.push({ url, init }); return new Response(bytes, { status: 200 }); });
    const { generateSfx, listGeneratedSfx, GEN_SFX_DIR } = await import("../src/audio/sfx-generate.js");
    const made = await generateSfx({ prompt: "a man yelling FAHHH, loud", seconds: 1.2, name: "fahhh" });
    expect(calls[0].url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/sound-generation/);
    expect(calls[0].init.headers["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(calls[0].init.body)).toMatchObject({ text: "a man yelling FAHHH, loud", duration_seconds: 1.2 });
    expect(made.id).toMatch(/^gen-fahhh-[0-9a-f]{6}$/);
    const wav = await fs.readFile(path.join(GEN_SFX_DIR, made.file));
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(made.duration).toBeGreaterThan(1);
    expect((await listGeneratedSfx()).map((e) => e.id)).toEqual([made.id]);
    const { listSfxOptions, resolveSfxChoice } = await import("../src/audio/sfx.js");
    const opts = await listSfxOptions({ query: "fahhh" });
    expect(opts.generated.map((o) => o.id)).toEqual([made.id]);
    const got = await resolveSfxChoice(made.id, path.join(dir, "t", "projects", "p", "assets"));
    expect(got.url).toMatch(new RegExp(`/sfx-${made.id}\\.wav$`));
  }, 60000);

  it("needs the key, and a generated id is a sound a cue or palette can name", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const { generateSfx } = await import("../src/audio/sfx-generate.js");
    await expect(generateSfx({ prompt: "boom" })).rejects.toThrow(/ELEVENLABS_API_KEY/);
    const { normalizeSoundId, normalizeSoundCues } = await import("../src/core/scene-sfx.js");
    expect(normalizeSoundId("gen-fahhh-1a2b3c")).toBe("gen-fahhh-1a2b3c");
    expect(normalizeSoundId("gen-../x")).toBeNull();
    expect(normalizeSoundCues([{ at: 1, role: "attention" }], { attention: "gen-fahhh-1a2b3c" })[0].id).toBe("gen-fahhh-1a2b3c");
  });

  it("the audio tool generates; the update tool sets the film's palette and re-points its role cues", async () => {
    const server = await fs.readFile("src/server.ts", "utf-8");
    expect(server).toMatch(/if \(params\.action === "generate_sfx"\) \{/);
    expect(server).toMatch(/sfx_palette: z\.record\(z\.enum\(\["attention", "transition", "tension", "payoff", "right", "wrong", "comedy"\]\), z\.string\(\)\)/);
    expect(server).toMatch(/if \(Array\.isArray\(sc\?\.sfx\) && sc\.sfx\.some\(\(c: any\) => c\?\.role\)\) sc\.sfx = normalizeSoundCues\(sc\.sfx, \(project as any\)\.sfx_palette\);/);
    const index = await fs.readFile("src/index.ts", "utf-8");
    expect(index).toMatch(/const genSfxMatch = urlPath\.match\(\/\^\\\/assets\\\/_system\\\/sfx\\\/generated\\\/\(\[\^\/\]\+\)\$\/\);/);
    const studio = await fs.readFile("src/preview-app/preview-app.ts", "utf-8");
    expect(studio).toMatch(/\.concat\(\(r && r\.generated\) \|\| \[\], \(r && r\.freesound\) \|\| \[\]\)/);
    const foley = await fs.readFile("src/audio/foley.ts", "utf-8");
    expect(foley).toMatch(/if \(!have \|\| !have\.equals\(want\)\) await fs\.writeFile\(full, want\);/);
  });
});
