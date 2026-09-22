import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

// A marketer has no sound library (Marc: "I don't know of any library for
// sound effects... maybe we should start building a library"), and the free
// catalogues all want a key. So the house set is synthesized here, and the
// fetched shelf (Freesound, CC0 only) sits beside it when a key exists.
describe("the house foley set", () => {
  it("renders every effect: the right length, audible, peak-normalized, and the SAME sound on every machine", async () => {
    const { FOLEY_SET, renderFoley, wavBytes } = await import("../src/audio/foley.js");
    expect(FOLEY_SET.length).toBeGreaterThanOrEqual(12);
    for (const spec of FOLEY_SET) {
      const buf = renderFoley(spec.id);
      expect(buf.length).toBe(Math.round(spec.duration * 48000));
      let peak = 0, sum = 0;
      for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); peak = Math.max(peak, a); sum += a; }
      expect(peak).toBeGreaterThan(0.5);          // audible
      expect(peak).toBeLessThanOrEqual(1);        // never clipped
      expect(sum / buf.length).toBeGreaterThan(0.001); // not one lone spike
      // Deterministic: the seeded PRNG, never the platform's.
      const again = renderFoley(spec.id);
      expect(Buffer.from(wavBytes(again))).toEqual(Buffer.from(wavBytes(buf)));
    }
    expect(() => renderFoley("nope")).toThrow(/Unknown foley id/);
    const src = await read("src/audio/foley.ts");
    expect(src).not.toMatch(/Math\.random/);
  });

  it("writes a real WAV: RIFF header, 16-bit mono at 48k, the data length the samples need", async () => {
    const { renderFoley, wavBytes } = await import("../src/audio/foley.js");
    const samples = renderFoley("tick");
    const w = wavBytes(samples);
    expect(w.subarray(0, 4).toString()).toBe("RIFF");
    expect(w.subarray(8, 12).toString()).toBe("WAVE");
    expect(w.readUInt16LE(22)).toBe(1);          // mono
    expect(w.readUInt32LE(24)).toBe(48000);      // sample rate
    expect(w.readUInt16LE(34)).toBe(16);         // bit depth
    expect(w.readUInt32LE(40)).toBe(samples.length * 2);
    expect(w.length).toBe(44 + samples.length * 2);
  });

  it("mints the library once and leaves it alone after: files, a manifest, idempotent", async () => {
    const { ensureFoleyLibrary, FOLEY_SET } = await import("../src/audio/foley.js");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-foley-"));
    const first = await ensureFoleyLibrary(dir);
    expect(first.length).toBe(FOLEY_SET.length);
    const one = path.join(dir, `${FOLEY_SET[0].id}.wav`);
    const stat = await fs.stat(one);
    const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
    expect(manifest.effects.map((e: any) => e.id)).toEqual(FOLEY_SET.map((f) => f.id));
    expect(manifest.effects.every((e: any) => e.source === "house")).toBe(true);
    await new Promise((r) => setTimeout(r, 12));
    await ensureFoleyLibrary(dir);
    expect((await fs.stat(one)).mtimeMs).toBe(stat.mtimeMs);  // not re-synthesized
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("the sound-effect library", () => {
  it("always has the house shelf; a query filters it by name or tag; Freesound is absent without a key and CC0-only with one", async () => {
    const { listSfxOptions, searchFreesound } = await import("../src/audio/sfx.js");
    const key = process.env.FREESOUND_API_KEY;
    delete process.env.FREESOUND_API_KEY;
    try {
      const all = await listSfxOptions();
      expect(all.house.length).toBeGreaterThanOrEqual(12);
      expect(all.house.every((o) => o.id.startsWith("house-") && o.license && o.preview_url?.startsWith("/assets/_system/sfx/"))).toBe(true);
      expect(all.freesound).toEqual([]);
      expect(all.freesound_configured).toBe(false);
      const whoosh = await listSfxOptions({ query: "whoosh" });
      expect(whoosh.house.length).toBeGreaterThan(0);
      expect(whoosh.house.every((o) => /whoosh/i.test(o.title) || o.tags.includes("whoosh"))).toBe(true);
      // A query that matches nothing falls back to the whole shelf rather than an empty picker.
      expect((await listSfxOptions({ query: "zzzz" })).house.length).toBe(all.house.length);
      expect(await searchFreesound("whoosh")).toEqual([]);   // no key, no call
    } finally { if (key) process.env.FREESOUND_API_KEY = key; }
    const src = await read("src/audio/sfx.ts");
    // CC0 is part of the QUERY, not a post-filter: nothing else ever enters the library.
    expect(src).toMatch(/license:"Creative Commons 0"/);
    expect(src).toMatch(/is not CC0 -- the library takes CC0 only/);
  });

  it("a pick lands in the project's assets: the house file copied, an unknown id refused, Freesound refused without a key", async () => {
    const { resolveSfxChoice } = await import("../src/audio/sfx.js");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-sfxpick-"));
    const picked = await resolveSfxChoice("house-whoosh-soft", dir);
    expect(picked.url).toMatch(/^\/assets\//);
    expect(picked.localPath).toBe(path.join(dir, "sfx-whoosh-soft.wav"));
    expect((await fs.stat(picked.localPath)).size).toBeGreaterThan(1000);
    expect(picked.duration).toBeGreaterThan(0);
    await expect(resolveSfxChoice("house-nope", dir)).rejects.toThrow(/Unknown house effect/);
    await expect(resolveSfxChoice("whoosh", dir)).rejects.toThrow(/expected house-\.\.\. or freesound-\.\.\./);
    const key = process.env.FREESOUND_API_KEY;
    delete process.env.FREESOUND_API_KEY;
    try { await expect(resolveSfxChoice("freesound-1", dir)).rejects.toThrow(/free API key/); }
    finally { if (key) process.env.FREESOUND_API_KEY = key; }
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("the tool places one by id and lists the shelves; Studio has a route for the picker and one that serves the house files", async () => {
    const srv = await read("src/server.ts");
    expect(srv).toMatch(/action: z\.enum\(\["add", "update", "remove", "search", "search_sfx"\]\)/);
    expect(srv).toMatch(/sfx: z\.string\(\)\.optional\(\)\.describe\("A sound effect id from action='search_sfx'/);
    expect(srv).toMatch(/if \(params\.action === "search_sfx"\) \{/);
    // A search needs no track -- the schema demanded one, so neither search action could be called at all.
    expect(srv).toMatch(/\}\)\.optional\(\)\.describe\("The track to add, update or remove\. The search actions need no track\."\),/);
    expect(srv).toMatch(/if \(!params\.track\) return err\("track is required for add, update and remove"\);/);
    expect(srv).toMatch(/const picked = await resolveSfxChoice\(params\.track\.sfx, projectAssetsDir\(params\.tenant_id, params\.project_id\)\);/);
    const idx = await read("src/index.ts");
    expect(idx).toMatch(/\/api\\\/sfx-options\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\$\//);
    expect(idx).toMatch(/\/assets\\\/_system\\\/sfx\\\/\(\[\^\/\]\+\)\$\//);
    expect(idx).toMatch(/music\|music-options\|sfx-options\|arm-need/);
  });

  it("an effect on the film is the person's: it rides through a rebuild like any hand-added track", async () => {
    const { handAddedTracks } = await import("../src/llm/pipeline.js");
    const kept = handAddedTracks([
      { id: "music_bed", type: "music", source: "/x/bed.mp3", volume: 0.4 },
      { id: "sfx_whoosh_1", type: "sfx", source: "/assets/t/projects/p/assets/sfx-whoosh-soft.wav", volume: 0.5, start_time: 8.4 },
    ] as any);
    expect(kept.map((t) => t.id)).toEqual(["sfx_whoosh_1"]);
  });
});
