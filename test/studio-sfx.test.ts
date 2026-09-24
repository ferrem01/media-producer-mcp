import { describe, it, expect } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// Sound cues live on Studio's EFFECTS lane beside the zooms, not on the audio
// lane: a block per sound, an editor like the camera moves', an add at the
// playhead, and the preview plays them at the scene's start + at.

describe("sound cues in Studio", () => {
  it("draws them on the Effects lane, edits them there, and plays them in the preview", async () => {
    const project: any = {
      tenant_id: "t1", project_id: "p1", name: "Signals", status: "generated",
      canvas: { width: 1080, height: 1920 },
      storyboard: { scenes: [{ label: "Gap", voiceover_text: "Your emails live in a third.", duration_seconds: 4 }, { label: "Two", duration_seconds: 3 }] },
      scenes: [
        { id: "scene_001", label: "Gap", duration_seconds: 4, components: [],
          audio_hints: { voiceover_text: "Your emails live in a third." },
          sfx: [{ at: 1.2, id: "house-ding", src: "/assets/t1/projects/p1/assets/sfx-ding.wav", volume: 0.8, anchor: { word: "emails" } },
                { at: 3.1, id: "house-thud", src: "/assets/t1/projects/p1/assets/sfx-thud.wav" }] },
        { id: "scene_002", label: "Two", duration_seconds: 3, components: [] },
      ],
      audio: { tracks: [] },
    };
    const posts: any[] = [];
    const html = getPreviewHtml();
    const server = http.createServer((req, res) => {
      const url = req.url || "/";
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        const json = (b: unknown) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
        const p = url.split("?")[0];
        if (p === "/auth/me") return json({ email: "m@x.ai", tenant_id: "t1" });
        if (p === "/api/projects/t1") return json([{ project_id: "p1", name: "Signals", status: "generated" }]);
        if (p === "/api/projects/t1/p1") return json(project);
        if (p === "/api/sfx-options/t1/p1") return json({ house: [
          { id: "house-ding", title: "Ding", preview_url: "/assets/_system/sfx/ding.wav" },
          { id: "house-thud", title: "Thud", preview_url: "/assets/_system/sfx/thud.wav" },
          { id: "house-pop", title: "Pop", preview_url: "/assets/_system/sfx/pop.wav" } ], freesound: [] });
        if (p === "/api/scene-sfx/t1/p1" && req.method === "POST") {
          const b = JSON.parse(raw || "{}");
          posts.push(b);
          project.scenes[b.scene_index].sfx = b.sfx.map((c: any) => ({ ...c, at: typeof c.at === "number" ? c.at : 1.2, src: `/assets/t1/projects/p1/assets/sfx-${c.id}.wav` }));
          return json({ ok: true, sfx: project.scenes[b.scene_index].sfx });
        }
        if (p.startsWith("/api/")) return json({});
        if (p.startsWith("/assets/") || p.startsWith("/output/")) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    const browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/studio?tenant=t1&project=p1`);
      await page.waitForSelector("#fx-lane .fx-sfx", { timeout: 20000 });

      // Two blocks on the Effects lane, named, none on the audio lane.
      const blocks = await page.$$eval("#fx-lane .fx-sfx", (b) => b.map((x) => x.textContent));
      expect(blocks).toEqual(["\u{1F514} ding", "\u{1F514} thud"]);
      expect(await page.$$eval("#audio-lanes .audio-lane-seg.sfx", (s) => s.length)).toBe(0);
      // The preview plays them: initAudio makes an sfx element per cue at the
      // scene's start + at (flagged so the audio lane skips it).
      expect(html).toMatch(/start_time: sceneOffset\(si\) \+ \(Number\(cue\.at\) \|\| 0\), _cue: true/);
      expect(html).toContain("if (audio._cue) return; // a sound cue draws on the Effects lane");

      // Click the thud: the editor opens on it; switch it to pop on "third".
      await page.click("#fx-lane .fx-sfx:nth-of-type(2), #fx-lane .fx-sfx >> nth=1");
      await page.waitForSelector("#sfx-id option[value=house-pop]", { state: "attached" });
      await page.selectOption("#sfx-id", "house-pop");
      await page.selectOption("#sfx-word", "third");
      await page.click("#sfx-save");
      await expect.poll(() => posts.length).toBe(1);
      expect(posts[0].scene_index).toBe(0);
      expect(posts[0].sfx).toEqual([
        { id: "house-ding", volume: 0.8, at: { word: "emails" } },
        { id: "house-pop", volume: 0.8, at: "@third" },
      ]);
      await page.waitForFunction(() => [...document.querySelectorAll("#fx-lane .fx-sfx")].some((b) => b.textContent === "\u{1F514} pop"));

      // The lane's own add: a sound at the playhead, in the scene under it.
      await page.click("#lane-gutter .lg-fx");
      await page.waitForSelector("#sfx-save");
      expect(await page.textContent("#sfx-save")).toBe("Add sound");
      await page.click("#sfx-save");
      await expect.poll(() => posts.length).toBe(2);
      expect(posts[1].sfx).toHaveLength(3);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 60000);
});
