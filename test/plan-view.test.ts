import { describe, it, expect } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";
import { planRows, planMarkdown, reorderBoard, shotKind } from "../src/core/film-plan.js";

// THE PLAN: the film as one table -- beat, time, shot, line. The board opens
// one scene with every field; the plan shows every scene with the four things
// two people planning a film weigh. It replaced the Script view, which showed
// the whole film but only its words.

function board(grammar = "creator-cut"): any {
  return {
    tenant_id: "t1", project_id: "p1", name: "Quotient Email Ad", status: "storyboard",
    treatment: { filmGrammar: grammar },
    canvas: { width: 1080, height: 1920 },
    scenes: [],
    takes: [{ id: "tk0", scene_index: 0, source: "a.webm", recorded_at: "x" }, { id: "tk2", scene_index: 2, source: "c.webm", recorded_at: "x" }],
    speaker_track: { clips: [{ source: "a.webm", scene_index: 0 }, { source: "c.webm", scene_index: 2 }] },
    storyboard: {
      narrative: "ad", estimated_duration: 12, audio: { music_mood: "x", voice: "nova", pacing: "fast" },
      scenes: [
        { label: "Hook", purpose: "stop the scroll", template: "", assets: [], duration_seconds: 3,
          visual_notes: "Tight on the speaker. Warm window light.", voiceover_text: "If you're still running email like it's 2015, you're using antiquated tools." },
        { label: "Start anywhere", purpose: "any surface", template: "", assets: [{ type: "screen_recording", description: "chat", status: "needed", priority: "critical", fallback: "", use: "split" }],
          duration_seconds: 4, visual_notes: "The chat on top.", shot: "The same ask typed in Claude, Slack and Quotient", voiceover_text: "Ask from Claude. From Slack. Or right in Quotient." },
        { label: "Hidden work", purpose: "the list and deliverability", template: "", assets: [], duration_seconds: 5, transparent_background: false,
          components: [{ type: "checklist-toggles", data: {} }], visual_notes: "A checklist ticks itself off | one row at a time.", voiceover_text: "" },
      ],
    },
  };
}

describe("the plan (core/film-plan.ts)", () => {
  it("reads what fills the frame off the scene's data", () => {
    const p = board();
    const rows = planRows(p);
    expect(rows.map((r) => r.shot_label)).toEqual(["Speaker", "Split", "Motion graphic"]);
    expect(rows.map((r) => [r.start, r.end])).toEqual([[0, 3], [3, 7], [7, 12]]);
    // The writer's own line wins; older boards fall back to the notes' first sentence.
    expect(rows[1].shot).toBe("The same ask typed in Claude, Slack and Quotient");
    expect(rows[1].shot_written).toBe(true);
    expect(rows[0].shot).toBe("Tight on the speaker.");
    expect(rows[0].shot_written).toBe(false);
    // A film no person carries: product mocks are Screen, b-roll Footage.
    expect(shotKind({ components: [{ type: "quotient-campaign", data: {} }] } as any, "hype-cut")).toBe("screen");
    expect(shotKind({ components: [{ type: "quotient-email" }] } as any, "tempo-cut")).toBe("screen");
    expect(shotKind({ broll_query: "an office" } as any, "launch-film")).toBe("footage");
    expect(shotKind({ hero_image: "a bridge" } as any, "editorial")).toBe("image");
    // A speaker component on any grammar is the person.
    expect(shotKind({ components: [{ type: "video", data: { src: "speaker" } }] } as any, "hype-cut")).toBe("speaker");
  });

  it("writes the markdown table the generate reply shows first", () => {
    const md = planMarkdown(board());
    const lines = md.split("\n");
    expect(lines[0]).toBe("| # | Beat | Time | Shot | Line |");
    expect(lines).toHaveLength(5);
    expect(lines[2]).toContain("| 1 | Hook | 0–3s | **Speaker**: Tight on the speaker. |");
    // A pipe in the notes cannot break the table.
    expect(lines[4]).toContain("ticks itself off \\| one row");
    expect(lines[4].endsWith("| — |")).toBe(true);
  });

  it("moves a scene with its takes and speaker clips, and refuses a non-permutation", () => {
    const p = board();
    expect(reorderBoard(p, [0, 0, 1])).toBe(false);
    expect(reorderBoard(p, [0, 1])).toBe(false);
    expect(p.storyboard.scenes[0].label).toBe("Hook");
    // Move "Hidden work" (2) to the front.
    expect(reorderBoard(p, [2, 0, 1])).toBe(true);
    expect(p.storyboard.scenes.map((s: any) => s.label)).toEqual(["Hidden work", "Hook", "Start anywhere"]);
    expect(p.takes.map((t: any) => [t.id, t.scene_index])).toEqual([["tk0", 1], ["tk2", 0]]);
    expect(p.speaker_track.clips.map((c: any) => [c.source, c.scene_index])).toEqual([["a.webm", 1], ["c.webm", 0]]);
    expect(p.storyboard.estimated_duration).toBe(12);
  });
});

describe("the plan view in Studio", () => {
  it("replaces Script on the rail's switch", () => {
    const html = getPreviewHtml();
    expect(html).toMatch(/function renderDraftModes[\s\S]{0,200}getElementById\('scene-list-head'\)/);
    expect(html).toContain('data-mode="plan"');
    expect(html).not.toContain('data-mode="script"');
    expect(html).not.toContain("renderScriptView");
  });

  it("estimates speech at a narration pace, and its regexes survive the template literal", () => {
    const html = getPreviewHtml();
    const src = html.match(/var SPEECH_WPS[\s\S]*?\n {2}}/)?.[0];
    expect(src).toBeTruthy();
    const speechSeconds = new Function(`${src}\nreturn speechSeconds;`)() as (t: string) => number;
    expect(speechSeconds("one two three four five six seven eight nine ten one two")).toBeCloseTo(12 / 2.6, 2);
    expect(speechSeconds("Hello there.\n(pause)\nAnd we are back.")).toBeCloseTo(6 / 2.6 + 0.6, 2);
    expect(speechSeconds("")).toBe(0);
    expect(html).toContain("/^\\(pause\\)$/i");
    expect(html).toContain("t.split(/\\s+/)");
  });

  it("shows the whole film as a table, saves a cell through the board's PATCH, and moves a beat by dragging", async () => {
    const project = board();
    const patches: Array<{ url: string; body: any }> = [];
    const orders: any[] = [];
    const html = getPreviewHtml();
    const server = http.createServer((req, res) => {
      const url = req.url || "/";
      let raw = "";
      req.on("data", (c) => { raw += c; });
      req.on("end", () => {
        const json = (b: unknown) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
        const path = url.split("?")[0];
        if (path === "/auth/me") return json({ email: "m@x.ai", tenant_id: "t1" });
        if (path === "/api/projects/t1") return json([{ project_id: "p1", name: project.name, status: "storyboard" }]);
        if (path === "/api/projects/t1/p1") return json(project);
        if (path === "/api/storyboard/t1/p1/plan") return json({ rows: planRows(project) });
        if (path === "/api/storyboard/t1/p1/order" && req.method === "POST") {
          const body = JSON.parse(raw || "{}");
          orders.push(body.order);
          reorderBoard(project, body.order);
          return json({ ok: true, rows: planRows(project) });
        }
        const m = path.match(/^\/api\/storyboard\/t1\/p1\/scenes\/(\d+)$/);
        if (m && req.method === "PATCH") {
          const body = JSON.parse(raw || "{}");
          patches.push({ url: path, body });
          const s = project.storyboard.scenes[Number(m[1])];
          if (typeof body.voiceover_text === "string") s.voiceover_text = body.voiceover_text;
          if (typeof body.label === "string") s.label = body.label;
          if (typeof body.shot === "string") { if (body.shot) s.shot = body.shot; else delete s.shot; }
          return json({ ok: true, scene: s });
        }
        if (path.startsWith("/api/")) return json({});
        if (path.endsWith(".png")) { res.writeHead(404); return res.end(); }
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
      await page.waitForSelector('.dv-mode[data-mode="plan"]', { timeout: 15000 });
      await page.click('.dv-mode[data-mode="plan"]');
      await page.waitForSelector(".pv-row");

      // Every scene, four columns.
      expect(await page.$$eval(".pv-row", (r) => r.length)).toBe(3);
      expect(await page.$$eval(".pv-kind", (k) => k.map((x) => x.textContent))).toEqual(["Speaker:", "Split:", "Motion graphic:"]);
      expect(await page.$$eval(".pv-time", (k) => k.map((x) => (x.firstChild as Text).textContent))).toEqual(["0–3s", "3–7s", "7–12s"]);
      // A line longer than its beat says so: 13 words is ~5s of speech in 3s.
      expect(await page.textContent('.pv-time[data-i="0"] .pv-fit')).toMatch(/of speech/);

      // Edit a line: it saves through the board's own per-scene PATCH.
      await page.click('.pv-line[data-i="1"]');
      await page.keyboard.press("End");
      await page.keyboard.type(" Anywhere.");
      await page.click(".pv-title");
      await page.waitForFunction(() => !document.querySelector(".pv-cell.saving"));
      await expect.poll(() => patches.length).toBe(1);
      expect(patches[0].url).toBe("/api/storyboard/t1/p1/scenes/1");
      expect(patches[0].body).toEqual({ voiceover_text: "Ask from Claude. From Slack. Or right in Quotient. Anywhere." });

      // Enter commits a beat name.
      await page.click('.pv-beat[data-i="2"]');
      await page.keyboard.press("Control+A");
      await page.keyboard.type("Handled");
      await page.keyboard.press("Enter");
      await expect.poll(() => patches.length).toBe(2);
      expect(patches[1].body).toEqual({ label: "Handled" });

      // Drag "Handled" (row 3) above row 1 by its grip.
      const grip = await page.$('.pv-row[data-i="2"] .pv-grip');
      const target = await page.$('.pv-row[data-i="0"]');
      const g = (await grip!.boundingBox())!;
      const t = (await target!.boundingBox())!;
      await page.mouse.move(g.x + g.width / 2, g.y + 10);
      await page.mouse.down();
      await page.mouse.move(t.x + 200, t.y + 6, { steps: 8 });
      await page.mouse.move(t.x + 200, t.y + 4, { steps: 2 });
      await page.mouse.up();
      await expect.poll(() => orders.length).toBe(1);
      expect(orders[0]).toEqual([2, 0, 1]);
      await page.waitForFunction(() => document.querySelector('.pv-beat[data-i="0"]')?.textContent === "Handled");
      expect(await page.$$eval(".pv-beat", (b) => b.map((x) => x.textContent))).toEqual(["Handled", "Hook", "Start anywhere"]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await new Promise<void>((r) => server.close(() => r()));
    }
  }, 60000);
});
