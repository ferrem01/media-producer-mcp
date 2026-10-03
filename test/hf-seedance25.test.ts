import { describe, it, expect, vi, afterEach } from "vitest";

// Seedance 2.5 through HIGGSFIELD's API (Marc: "are we allowed to call the
// Seedance 2.5 model?"). Our fal route was refused on a photoreal face; the
// actor test's hf-seedance25 provider measures Higgsfield's route: the
// motion as @Video1, the actor as @Image1, by public URL.

afterEach(() => { vi.unstubAllGlobals(); delete process.env.HF_API_KEY_ID; delete process.env.HF_API_KEY_SECRET; delete process.env.MP_ACTOR_POLL_MS; });

describe("Seedance 2.5 on Higgsfield", () => {
  it("submits the references by URL, polls the request, and returns the video -- or the refusal, word for word", async () => {
    process.env.HF_API_KEY_ID = "id"; process.env.HF_API_KEY_SECRET = "sec"; process.env.MP_ACTOR_POLL_MS = "1";
    const sent: any[] = [];
    let polls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      if (init?.method === "POST") {
        sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ request_id: "r1", status_url: "https://api.higgsfield.ai/requests/r1/status" }), { status: 200 });
      }
      polls++;
      return new Response(JSON.stringify(polls < 2 ? { status: "in_progress", request_id: "r1" } : { status: "completed", request_id: "r1", video: { url: "https://cdn/out.mp4" } }), { status: 200 });
    }));
    const { runHiggsfieldSeedance25 } = await import("../src/core/actor-test.js");
    const url = await runHiggsfieldSeedance25("https://x/source.mp4", "https://x/actor.jpg", 3.2, "9:16");
    expect(url).toBe("https://cdn/out.mp4");
    expect(sent[0].url).toBe("https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video");
    expect(sent[0].headers.Authorization).toBe("Key id:sec");
    expect(sent[0].body).toMatchObject({ video_urls: ["https://x/source.mp4"], image_urls: ["https://x/actor.jpg"], duration: 4, aspect_ratio: "9:16", resolution: "480p", generate_audio: false });

    polls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: any) => init?.method === "POST"
      ? new Response(JSON.stringify({ request_id: "r2", status_url: "https://api.higgsfield.ai/requests/r2/status" }), { status: 200 })
      : new Response(JSON.stringify({ status: "failed", request_id: "r2", error: "likeness of a real person" }), { status: 200 })));
    await expect(runHiggsfieldSeedance25("https://x/s.mp4", "https://x/a.jpg", 5, "9:16")).rejects.toThrow(/failed -- likeness of a real person/);
  });
});
