import { describe, it, expect, vi, afterEach } from "vitest";
import { selectMusic } from "../src/audio/music.js";

// Instrumental-only by default: these films carry their story in on-screen
// type or narration, and lyrics fight both. Vocals only when a caller
// explicitly opts out with instrumental:false.

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.JAMENDO_CLIENT_ID;
});

function captureJamendoQuery(): { url: () => string } {
  let captured = "";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    captured = String(url);
    return new Response(JSON.stringify({ headers: { status: "success" }, results: [] }), { status: 200 });
  }));
  return { url: () => captured };
}

describe("music selection is instrumental by default", () => {
  it("asks Jamendo for instrumental tracks when the caller says nothing", async () => {
    process.env.JAMENDO_CLIENT_ID = "test-client";
    const q = captureJamendoQuery();
    await selectMusic({ mood: "corporate" });
    expect(q.url()).toContain("vocalinstrumental=instrumental");
  });

  it("allows vocals only on an explicit instrumental:false opt-out", async () => {
    process.env.JAMENDO_CLIENT_ID = "test-client";
    const q = captureJamendoQuery();
    await selectMusic({ mood: "corporate", instrumental: false });
    expect(q.url()).not.toContain("vocalinstrumental");
  });

  it("stock library filters vocal-flagged tracks under the default (source guard)", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(new URL("../src/audio/music.ts", import.meta.url), "utf-8");
    expect(src).toMatch(/opts\.instrumental !== false/);              // default true
    expect(src).toMatch(/instrumental \? manifest\.tracks\.filter\(t => t\.vocals !== true\)/);
  });
});
