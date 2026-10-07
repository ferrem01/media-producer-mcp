import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// A SHEET FROM PHOTOS (Marc, Oct 7: "should we allow them to add multiple
// photos? And then that all feeds the model sheet?"): a real person added
// from one photo gets more angles, a model sheet is drawn from all of them
// faithful to the face, and nothing reads it until it is approved.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-actor-photos-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
const T = "t";
afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });
const still = (out: string, size: string) => run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=gray:s=${size}`, "-frames:v", "1", out]);
const until = async (fn: () => Promise<boolean>) => { for (let i = 0; i < 200; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 25)); } throw new Error("timed out"); };

describe("an actor's photos and the model sheet drawn from them", () => {
  it("takes up to five photos, draws a faithful sheet from the portrait and them as a draft, and uses or discards it", async () => {
    const A = path.join(DATA, T, "assets"); await fs.mkdir(A, { recursive: true });
    for (const n of ["me", "p1", "p2", "p3", "p4", "p5", "p6"]) await still(path.join(A, `${n}.png`), "600x800");
    const cast = await import("../src/core/cast.js");
    const marc = await cast.addActor(T, { name: "Marc", image: "assets/me.png", consent: true });
    expect(marc.photos).toBeUndefined();
    let a = await cast.addActorPhoto(T, marc.id, "assets/p1.png");
    a = await cast.addActorPhoto(T, marc.id, "assets/p2.png");
    expect(a.photos!.length).toBe(2);
    expect(a.photos![0]).toMatch(/^cast\/marc-photo-[0-9a-f]{6}\.jpg$/);
    await fs.access(path.join(DATA, T, a.photos![0]));
    await expect(cast.addActorPhoto(T, marc.id, "../../etc/passwd")).rejects.toThrow(/inside the tenant/);
    for (const n of ["p3", "p4", "p5"]) a = await cast.addActorPhoto(T, marc.id, `assets/${n}.png`);
    await expect(cast.addActorPhoto(T, marc.id, "assets/p6.png")).rejects.toThrow(/Up to 5 photos/);
    const gone = a.photos![4];
    a = await cast.removeActorPhoto(T, marc.id, 4);
    expect(a.photos!.length).toBe(4);
    await expect(fs.access(path.join(DATA, T, gone))).rejects.toThrow();
    await expect(cast.removeActorPhoto(T, marc.id, 9)).rejects.toThrow(/No such photo/);

    // The sheet: drawn from the portrait and every photo, a real face kept as it is.
    const calls: Array<{ prompt: string; images: string[]; outputPath: string }> = [];
    const draw = async (o: { prompt: string; images: string[]; outputPath: string }) => { calls.push(o); await still(o.outputPath, "1536x1024"); };
    a = await cast.startActorSheet(T, marc.id, draw);
    expect(a.sheet_job?.status).toBe("drawing");
    await until(async () => !!(await cast.getActor(T, marc.id))?.sheet_draft);
    expect(calls[0].images.length).toBe(5);                       // the portrait + 4 photos
    expect(calls[0].images[0]).toBe(path.join(DATA, T, "cast", "marc.jpg"));
    expect(calls[0].prompt).toMatch(/the 5 reference photos \(all the same person\)/);
    expect(calls[0].prompt).toMatch(/This is a real person: keep their exact face/);
    expect(calls[0].prompt).toMatch(/Do not beautify, slim, smooth, de-age or restyle them/);
    a = (await cast.getActor(T, marc.id))!;
    expect(a.sheet_draft!.file).toBe(path.join("cast", "marc-sheet-draft.jpg"));
    expect(a.sheet).toBeUndefined();                              // nothing reads a draft
    expect(a.sheet_job).toBeUndefined();

    a = await cast.useSheetDraft(T, marc.id);
    expect(a.sheet).toBe(path.join("cast", "marc-sheet.jpg"));
    expect(a.sheet_draft).toBeUndefined();
    await fs.access(path.join(DATA, T, a.sheet!));
    await expect(cast.useSheetDraft(T, marc.id)).rejects.toThrow(/No sheet draft/);

    // A second draw that is discarded leaves the sheet in use alone.
    await cast.startActorSheet(T, marc.id, draw);
    await until(async () => !!(await cast.getActor(T, marc.id))?.sheet_draft);
    a = await cast.discardSheetDraft(T, marc.id);
    expect(a.sheet_draft).toBeUndefined();
    expect(a.sheet).toBe(path.join("cast", "marc-sheet.jpg"));

    // A failed draw says why, and can be tried again.
    await cast.startActorSheet(T, marc.id, async () => { throw new Error("image model said no"); });
    await until(async () => (await cast.getActor(T, marc.id))?.sheet_job?.status === "failed");
    expect((await cast.getActor(T, marc.id))!.sheet_job!.error).toBe("image model said no");

    // Removing the actor removes every picture.
    const files = [a.portrait, a.sheet!, ...(a.photos || [])];
    expect(await cast.removeActor(T, marc.id)).toBe(true);
    for (const f of files) await expect(fs.access(path.join(DATA, T, f))).rejects.toThrow();
  });

  it("a generated person's prompt keeps the reference; a HeyGen look takes no photos", async () => {
    const { sheetPrompt } = await import("../src/core/cast.js");
    expect(sheetPrompt(1, false)).toMatch(/the reference photo\. /);
    expect(sheetPrompt(1, false)).not.toMatch(/real person/);
    const cast = await import("../src/core/cast.js");
    const file = path.join(DATA, T, "cast", "cast.json");
    const list = await cast.listCast(T);
    list.push({ id: "look", name: "Look", portrait: "cast/look.jpg", heygen_look_id: "abc", created_at: new Date().toISOString() });
    await fs.writeFile(file, JSON.stringify(list));
    await expect(cast.addActorPhoto(T, "look", "assets/p1.png")).rejects.toThrow(/HeyGen look/);
    await expect(cast.startActorSheet(T, "look")).rejects.toThrow(/HeyGen look/);
  });

  it("the server, the MCP tool and the Cast page carry it", async () => {
    const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");
    const idx = await read("src/index.ts");
    expect(idx).toContain("const castExtra = urlPath.match(/^\\/api\\/cast\\/([^/]+)\\/([A-Za-z0-9_-]+)\\/(photos|sheet-draft|model-sheet)(?:\\/(\\d+))?$/);");
    expect(idx).toMatch(/if \(act === "make"\) \{[\s\S]*?startActorSheet\(ceTenant, ceActor\)/);
    const server = await read("src/server.ts");
    expect(server).toMatch(/"add_photo", "remove_photo", "make_sheet", "use_sheet", "discard_sheet"/);
    const { getCastHtml } = await import("../src/cast-page.js");
    const html = getCastHtml();
    expect(html).toContain("function photosPanel(id)");
    expect(html).toContain('id="aMore" accept="image/*" multiple');
    expect(html).toContain("Use this sheet");
    expect(html).toMatch(/railApi\(base \+ '\/model-sheet', \{ method: 'POST', body: JSON\.stringify\(\{ action: 'make' \}\) \}\)/);
  });
});
