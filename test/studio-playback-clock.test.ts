import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { chromium, type Browser } from "playwright";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// Studio playback on a speaker film whose scenes are windows of ONE take
// (proj_86591051, "record all"), with the composite's crossfades overlapping
// the scenes. Marc: "during the zoom and screen cross over the studio UI
// jumps ... not just sound but the whole film", and "the sound effects are in
// the effects layer but you can't hear them".

function wav(seconds: number, rate = 48000): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 880) * 12000), 44 + i * 2);
  return b;
}

// Three scenes cut from one 12s take at 4s and 8s; the film overlaps each cut
// by a 0.44s crossfade, so scene starts sit at 0, 3.56, 7.12 (total 11.12).
const OV = 0.44;
const META = [{ id: "scene_001", start: 0, duration: 4 }, { id: "scene_002", start: 4 - OV, duration: 4 }, { id: "scene_003", start: 8 - 2 * OV, duration: 4 }];
const TOTAL = 12 - 2 * OV;
const COMPOSITE = `<!doctype html><html><body style="margin:0;background:transparent"><script>
  var t = 0;
  window.__MP_TIMELINE = { time: function(v){ if (v === undefined) return t; t = v; return this; }, pause: function(){ return this; }, duration: function(){ return ${TOTAL}; }, progress: function(){ return t / ${TOTAL}; } };
  window.__MP_DURATION = ${TOTAL};
  window.__MP_SCENE_META = ${JSON.stringify(META)};
  window.__MP_READY = true;
</script></body></html>`;

let take: Buffer | null = null;
let browser: Browser;
beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "spk-"));
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=720x900:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
      "-t", "12", "-c:v", "libvpx-vp9", "-b:v", "2500k", "-deadline", "realtime", "-cpu-used", "8", "-g", "360", "-c:a", "libopus", "-b:a", "48k", path.join(dir, "take.webm")]);
    take = await fs.readFile(path.join(dir, "take.webm"));
  } catch { take = null; }
  browser = await chromium.launch({ executablePath: process.env.MP_CHROMIUM_PATH || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
}, 60000);
afterAll(async () => { await browser?.close(); });

function project(extra: Record<string, unknown> = {}): any {
  return {
    tenant_id: "t1", project_id: "p1", name: "Clock", status: "generated",
    canvas: { width: 1080, height: 1350 },
    storyboard: { scenes: META.map((m) => ({ label: m.id, duration_seconds: 4 })) },
    scenes: META.map((m) => ({ id: m.id, label: m.id, duration_seconds: 4, components: [] })),
    audio: { tracks: [] },
    ...extra,
  };
}

async function serve(p: any, files: Record<string, { body: Buffer; type: string }>) {
  const html = getPreviewHtml();
  const server = http.createServer((req, res) => {
    const u = (req.url || "/").split("?")[0];
    const json = (b: unknown) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
    if (u === "/auth/me") return json({ email: "m@x.ai", tenant_id: "t1" });
    if (u === "/api/projects/t1") return json([{ project_id: "p1", name: "Clock", status: "generated" }]);
    if (u === "/api/projects/t1/p1") return json(p);
    if (u === "/api/preview-composite/t1/p1") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(COMPOSITE); }
    if (u.startsWith("/api/")) return json({});
    const f = files[u.split("/").pop() || ""];
    if (f) {
      // Range requests: a video element seeks through them.
      const m = /bytes=(\d+)-(\d*)/.exec(String(req.headers.range || ""));
      if (m) {
        const a = Number(m[1]), z = m[2] ? Math.min(Number(m[2]), f.body.length - 1) : f.body.length - 1;
        res.writeHead(206, { "Content-Type": f.type, "Content-Range": `bytes ${a}-${z}/${f.body.length}`, "Content-Length": z - a + 1, "Accept-Ranges": "bytes" });
        return res.end(f.body.subarray(a, z + 1));
      }
      res.writeHead(200, { "Content-Type": f.type, "Content-Length": f.body.length, "Accept-Ranges": "bytes" });
      return res.end(f.body);
    }
    if (u.startsWith("/assets/") || u.startsWith("/output/")) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { server, port: (server.address() as AddressInfo).port };
}

describe("Studio playback clock", () => {
  it("never runs the film backwards at a cut between windows of one take", async () => {
    if (!take) return; // no ffmpeg to make the take
    const src = "/assets/t1/projects/p1/assets/take.webm";
    const p = project({ speaker_track: { clips: [0, 1, 2].map((i) => ({ source: src, start: 0, scene_index: i, trim_start: i * 4, trim_end: i * 4 + 4 })) } });
    const { server, port } = await serve(p, { "take.webm": { body: take, type: "video/webm" } });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/studio?tenant=t1&project=p1`);
      await page.waitForFunction(() => !(document.getElementById("play-btn") as HTMLButtonElement)?.disabled, undefined, { timeout: 20000 });
      // The transport's playhead, every frame.
      await page.evaluate(() => {
        const s = document.getElementById("timeline-slider") as HTMLInputElement || document.querySelector("input[type=range]") as HTMLInputElement;
        const out: number[] = ((window as any).__ph = []);
        const tick = () => { out.push(parseFloat(s.value)); requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await page.click("#play-btn");
      await page.waitForTimeout((TOTAL - 0.8) * 1000);
      const ph: number[] = await page.evaluate(() => (window as any).__ph);
      const t = ph.map((v) => (v / 1000) * TOTAL);
      let worst = 0, at = 0;
      for (let i = 1; i < t.length; i++) if (t[i - 1] - t[i] > worst) { worst = t[i - 1] - t[i]; at = t[i - 1]; }
      expect(worst, `playhead ran back ${worst.toFixed(3)}s at ${at.toFixed(2)}s`).toBeLessThan(0.02);
      expect(Math.max(...t)).toBeGreaterThan(8); // it played past both cuts
      expect(errors).toEqual([]);
    } finally { server.close(); }
  }, 60000);

  it("plays every short sound cue when the playhead crosses it", async () => {
    const p = project();
    p.scenes[0].sfx = [{ at: 0.6, id: "house-tick", src: "/assets/t1/projects/p1/assets/sfx-tick.wav", duration: 0.05 },
                       { at: 1.6, id: "house-click", src: "/assets/t1/projects/p1/assets/sfx-click.wav", duration: 0.09 }];
    p.scenes[1].sfx = [{ at: 0.4, id: "house-pop", src: "/assets/t1/projects/p1/assets/sfx-pop.wav", duration: 0.08 }];
    const w = (s: number) => ({ body: wav(s), type: "audio/wav" });
    const { server, port } = await serve(p, { "sfx-tick.wav": w(0.05), "sfx-click.wav": w(0.09), "sfx-pop.wav": w(0.08) });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // How far into each sound it really got. Studio's audio elements never
      // join the DOM, so listen on each one as it is made.
      await page.addInitScript(() => {
        const heard: Record<string, number> = ((window as any).__heard = {});
        const make = document.createElement.bind(document);
        (document as any).createElement = (tag: string, o?: any) => {
          const el = make(tag, o);
          if (String(tag).toLowerCase() === "audio") {
            const note = () => {
              const a = el as HTMLAudioElement;
              const k = (a.src || "").split("/").pop() || "";
              if (/^sfx-/.test(k)) heard[k] = Math.max(heard[k] || 0, a.ended ? a.duration : a.currentTime);
            };
            ["timeupdate", "ended", "pause"].forEach((ev) => el.addEventListener(ev, note));
          }
          return el;
        };
      });
      await page.goto(`http://127.0.0.1:${port}/studio?tenant=t1&project=p1`);
      await page.waitForFunction(() => !(document.getElementById("play-btn") as HTMLButtonElement)?.disabled, undefined, { timeout: 20000 });
      await page.waitForTimeout(800);
      await page.click("#play-btn");
      await page.waitForTimeout(5500);
      const heard = await page.evaluate(() => (window as any).__heard);
      for (const [k, d] of [["sfx-tick.wav", 0.05], ["sfx-click.wav", 0.09], ["sfx-pop.wav", 0.08]] as const) {
        expect(heard[k] || 0, `${k} played ${(heard[k] || 0).toFixed(3)}s of ${d}s`).toBeGreaterThan(d * 0.8);
      }
      expect(errors).toEqual([]);
    } finally { server.close(); }
  }, 60000);
});
