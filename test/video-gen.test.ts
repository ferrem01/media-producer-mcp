import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateVideoClip } from "../src/media/video-gen.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Diffusion video (Veo via the Gemini API): the third media fetcher. Mocked
// end-to-end -- submit returns an operation, polls resolve it, the file URI
// downloads an mp4 -- plus the degrade-to-null contract on every failure mode.

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

const FAKE_MP4 = Buffer.alloc(64 * 1024, 7); // >10KB so the size sanity check passes

function mockVeo(behavior: { pollsUntilDone?: number; filtered?: boolean } = {}) {
  const pollsUntilDone = behavior.pollsUntilDone ?? 1;
  let polls = 0;
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes(":predictLongRunning")) {
      expect((init?.headers as any)["x-goog-api-key"]).toBe("test-gemini-key");
      return new Response(JSON.stringify({ name: "models/veo/operations/op123" }), { status: 200 });
    }
    if (String(url).includes("/operations/op123")) {
      polls++;
      if (polls < pollsUntilDone) return new Response(JSON.stringify({ done: false }), { status: 200 });
      const response = behavior.filtered
        ? { generateVideoResponse: { generatedSamples: [], raiMediaFilteredCount: 1 } }
        : { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/f1:download?alt=media" } }] } };
      return new Response(JSON.stringify({ done: true, response }), { status: 200 });
    }
    if (String(url).includes("files/f1:download")) {
      return new Response(FAKE_MP4, { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }));
  return calls;
}

describe("generateVideoClip (Veo)", () => {
  it("submits, polls the operation, downloads the clip, and honors the aspect ratio", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const calls = mockVeo({ pollsUntilDone: 2 });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "veo-"));
    try {
      const result = await generateVideoClip({
        prompt: "a wall of glowing sticky notes collapsing into one clean card, slow push-in",
        aspectRatio: "9:16",
        outputDir: dir,
        filename: "genvid_scene_0.mp4",
      });
      expect(result).not.toBeNull();
      expect((await fs.stat(result!.localPath)).size).toBe(FAKE_MP4.length);
      // The submit call carried the vertical aspect ratio.
      const submitBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
      expect(submitBody.parameters.aspectRatio).toBe("9:16");
      expect(submitBody.instances[0].prompt).toContain("sticky notes");
      // 1 submit + 2 polls + 1 download
      expect(calls).toHaveLength(4);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }, 60000);

  it("returns null without the key (never throws)", async () => {
    const result = await generateVideoClip({
      prompt: "x", aspectRatio: "16:9", outputDir: os.tmpdir(), filename: "never.mp4",
    });
    expect(result).toBeNull();
  });

  it("returns null when the safety filter eats the clip", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    mockVeo({ filtered: true });
    const result = await generateVideoClip({
      prompt: "x", aspectRatio: "16:9", outputDir: os.tmpdir(), filename: "filtered.mp4",
    });
    expect(result).toBeNull();
  }, 60000);
});

describe("gen_video wiring (source guards)", () => {
  const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

  it("storyboard exposes the third media hint with the stock-can't-contain rule", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/gen_video.*mutually exclusive with broll_query\/hero_image/);
    expect(sb).toMatch(/Generated video \(gen_video\)/);
    expect(sb).toMatch(/stock search cannot plausibly contain/);
    expect(sb).toMatch(/0-1 per film/);
  });

  it("pipeline feeds generated clips into the b-roll channel, capped and key-gated", async () => {
    const p = await read("../src/llm/pipeline.ts");
    expect(p).toMatch(/process\.env\.GEMINI_API_KEY/);
    expect(p).toMatch(/MAX_GEN_VIDEO/);
    expect(p).toMatch(/canvas\.height > canvas\.width \? "9:16" : "16:9"/);
    expect(p).toMatch(/genvid_scene_/);
    expect(p).toMatch(/gen_video but GEMINI_API_KEY is not set/); // loud fallback log
  });

  it("footage survives the critique loop: threaded regens + dropped-footage gate", async () => {
    // proj_b84a8e84: 4/5 fetched clips dropped, every drop at attempts:2 --
    // regens rebuilt scenes without the footage and nothing noticed.
    const p = await read("../src/llm/pipeline.ts");
    expect(p.match(/brollVideoUrl: opts\.brollVideoUrl/g)?.length).toBeGreaterThanOrEqual(2); // regen + template swap
    expect(p).toMatch(/brollVideoUrl: brollUrlMap\.get\(i\)/);
    expect(p).toMatch(/type: "dropped_footage"/);
  });

  it("authored compositions place fetched media as their backdrop", async () => {
    // proj_b84a8e84 scene 7: hero still generated and orphaned -- the
    // deterministic path had no media channel at all.
    const sg = await read("../src/llm/scene-generator.ts");
    expect(sg).toMatch(/MEDIA BACKDROP/);
    expect(sg).toMatch(/opts\.brollVideoUrl \|\| opts\.imageUrl/);
    expect(sg).toMatch(/overlay_opacity: 0\.35/); // legibility scrim over hero stills
  });

  it("captions over a media backdrop get light ink (the scrim is dark)", async () => {
    // proj_cd8a6fb6 scene 7: near-black caption on a dark-scrimmed still, 1.39:1.
    const sg = await read("../src/llm/scene-generator.ts");
    expect(sg).toMatch(/\(w \|\| mediaBackdrop\) && \(isCaptionRole/);
    expect(sg).toMatch(/mediaBackdrop \? false : w!\.theme === "light"/);
  });

  it("an explicitly briefed generated shot makes gen_video mandatory", async () => {
    // proj_cd8a6fb6: the brief said "generate this shot" and the storyboard
    // shipped the centerpiece as an empty gradient instead.
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toMatch(/MANDATORY WHEN BRIEFED/);
  });
});
