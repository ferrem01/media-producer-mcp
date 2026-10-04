import { describe, it, expect, afterAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A CAST MEMBER made from a model sheet (Marc's AI cast brief): a generated
// person -- the start frame is the portrait, the sheet it was drawn from rides
// along, no consent (nobody's likeness), the voice set later. Genjutsu, the
// one-to-one vendor Marc picked (Oct 4: "number four is probably the better
// one"), gets the start frame and the sheet.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-cast-member-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
process.env.MP_ACTOR_POLL_MS = "5";
const T = "t";

afterAll(async () => { vi.unstubAllGlobals(); await fs.rm(DATA, { recursive: true, force: true }); });

const still = (out: string, size: string) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=gray:s=${size}`, "-frames:v", "1", out]);

describe("a cast member from a model sheet", () => {
  it("is fictional instead of consented, keeps its sheet, takes a voice later, and leaves no files when removed", async () => {
    await fs.mkdir(path.join(DATA, T, "assets"), { recursive: true });
    await still(path.join(DATA, T, "assets", "dana-headshot.png"), "752x1344");
    await still(path.join(DATA, T, "assets", "dana-sheet.png"), "2048x1152");
    const { addActor, updateActor, removeActor, listCast } = await import("../src/core/cast.js");
    await expect(addActor(T, { name: "Dana", image: "assets/dana-headshot.png" })).rejects.toThrow(/fictional: true/);
    const dana = await addActor(T, { name: "Dana", image: "assets/dana-headshot.png", sheet: "assets/dana-sheet.png", fictional: true });
    expect(dana.fictional?.at).toBeTruthy();
    expect(dana.consent).toBeUndefined();
    expect(dana.sheet).toBe(path.join("cast", "dana-sheet.jpg"));
    const sheetAbs = path.join(DATA, T, dana.sheet!);
    const probe = await run("ffmpeg", ["-hide_banner", "-i", sheetAbs]).then(() => "", (e: any) => String(e.stderr || ""));
    expect(probe).toMatch(/2048x1152/);   // full detail, not the portrait's 1024

    // The voice comes later (a library voice added in ElevenLabs), and can be cleared.
    let a = await updateActor(T, "dana", { voice_id: "v_lib", voice_name: "Library voice" });
    expect([a.voice_id, a.voice_name]).toEqual(["v_lib", "Library voice"]);
    a = await updateActor(T, "dana", { voice_id: "" });
    expect(a.voice_id).toBeUndefined();
    expect((await listCast(T))[0].voice_id).toBeUndefined();
    await expect(updateActor(T, "dana", { name: "  " })).rejects.toThrow(/empty/);
    await expect(updateActor(T, "nobody", { name: "x" })).rejects.toThrow(/No such actor/);

    expect(await removeActor(T, "dana")).toBe(true);
    await expect(fs.access(sheetAbs)).rejects.toThrow();
  });

  it("Genjutsu gets the start frame and then the sheet, with a prompt that says what the sheet is", async () => {
    const d = path.join(DATA, "hf"); await fs.mkdir(d, { recursive: true });
    const take = path.join(d, "take.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=180x320:rate=30:duration=5",
      "-f", "lavfi", "-i", "sine=frequency=300:duration=5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", take]);
    const portrait = path.join(d, "p.png"); await still(portrait, "256x384");
    const sheet = path.join(d, "s.png"); await still(sheet, "2048x1152");
    const back = path.join(d, "back.mp4");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=navy:s=360x640:r=24:d=5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", back]);
    const mp4 = await fs.readFile(back);
    const subs: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      const u = String(url);
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (u.endsWith("/genjutsu/motion-transfer/v1.0")) { subs.push(JSON.parse(init.body)); return json({ request_id: "r1", status_url: "https://api.higgsfield.ai/requests/r1/status" }); }
      if (u.endsWith("/requests/r1/status")) return json({ status: "completed", video: { url: "https://cdn/hf.mp4" } });
      if (u === "https://cdn/hf.mp4") return new Response(mp4, { status: 200 });
      throw new Error("unexpected fetch " + u);
    }));
    process.env.HF_API_KEY_ID = "kid"; process.env.HF_API_KEY_SECRET = "ksec";
    const { performTakeFile } = await import("../src/core/recast.js");
    const { getPerformer } = await import("../src/core/performers/index.js");
    const { GENJUTSU_SHEET_PROMPT } = await import("../src/core/actor-test.js");
    await performTakeFile({ rawAbs: take, outAbs: path.join(d, "out.mp4"), performer: getPerformer("higgsfield")!, ctx: {
      tenant: T, actor: { id: "dana", name: "Dana", portrait: "", created_at: "" }, portraitAbs: portrait, sheetAbs: sheet,
      workDir: path.join(d, "work"), width: 180, height: 320, publicUrl: async (f: string) => `https://pub.example/${path.basename(f)}`,
    } });
    expect(subs[0].image_urls).toEqual(["https://pub.example/portrait.jpg", "https://pub.example/sheet.jpg"]);
    expect(subs[0].prompt).toBe(GENJUTSU_SHEET_PROMPT);
    expect(subs[0].prompt).toMatch(/second reference image is that same person's character sheet/);
    delete process.env.HF_API_KEY_ID; delete process.env.HF_API_KEY_SECRET;
  }, 120000);

  it("a recast made before the sheet is made again once the actor has one (Genjutsu only)", () => {
    const src = (require("node:fs") as typeof import("node:fs")).readFileSync(path.join(__dirname, "..", "src/core/recast.ts"), "utf8");
    expect(src).toMatch(/&& \(existing\.sheet \|\| undefined\) === \(sheetFor\(tenant, actor, performer\.id\) \? actor\.sheet : undefined\)/);
    expect(src).toMatch(/return pid === "higgsfield" && actor\.sheet \?/);
  });
});
