import { describe, it, expect, vi, afterEach } from "vitest";

// "there is no women that come up" (Marc, Cast -> HeyGen presenters ->
// Women). HeyGen lists one person's ~20 looks together and cannot filter by
// gender; its first three pages of stock presenters are all men, so a
// one-page filter came back empty. A filtered request pages on until it has
// some.

afterEach(() => { vi.unstubAllGlobals(); delete process.env.HEYGEN_API_KEY; });

const look = (id: string, gender: string) => ({ id, name: id, avatar_type: "photo_avatar", gender, preview_image_url: "https://x/p.jpg", preferred_orientation: "landscape" });

describe("HeyGen presenters by gender", () => {
  it("pages past a run of men to find women, and hands back where it stopped", async () => {
    process.env.HEYGEN_API_KEY = "k";
    const pages: Record<string, any> = {
      "": { data: Array.from({ length: 50 }, (_, i) => look(`dante-${i}`, "male")), has_more: true, next_token: "p2" },
      p2: { data: Array.from({ length: 50 }, (_, i) => look(`brody-${i}`, "male")), has_more: true, next_token: "p3" },
      p3: { data: [...Array.from({ length: 20 }, (_, i) => look(`beck-${i}`, "male")), ...Array.from({ length: 30 }, (_, i) => look(`elise-${i}`, "female"))], has_more: true, next_token: "p4" },
    };
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const tok = new URL(url).searchParams.get("token") || "";
      calls.push(tok);
      return new Response(JSON.stringify(pages[tok]), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const { heygenLookPage } = await import("../src/core/actor-test.js");
    const women = await heygenLookPage({ ownership: "public", gender: "female" });
    expect(women.looks.length).toBe(30);
    expect(women.looks.every((l: any) => l.gender === "female")).toBe(true);
    expect(women.next_token).toBe("p4");
    expect(calls).toEqual(["", "p2", "p3"]);
    // Unfiltered: one page, as before.
    calls.length = 0;
    const all = await heygenLookPage({ ownership: "public" });
    expect(all.looks.length).toBe(50);
    expect(calls).toEqual([""]);
  });
});
