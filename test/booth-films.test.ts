import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boothFilms } from "../src/core/booth-films.js";
import { TAKE_NEED_DESCRIPTION } from "../src/core/take-needs.js";

// GET /api/booth-films/{tenant} (SPEC-remote-booth.md): the tenant's
// person-carried films with their scenes and what each still needs -- the
// remote booth's film picker (the phone moves between films in Studio). Marc: "I
// have to remove the camera from the stand and then scan the QR for each."

const HERE = path.dirname(fileURLToPath(import.meta.url));
const need = (status: "needed" | "provided") => ({ type: "camera_video", description: TAKE_NEED_DESCRIPTION, status, priority: "critical" });
const proj = (id: string, grammar: string, updated: string, scenes: any[], extra: any = {}) => ({
  project_id: id, tenant_id: "acme", name: id.toUpperCase(), canvas: { width: 1920, height: 1080 }, updated_at: updated,
  treatment: { filmGrammar: grammar, frame: "16x9" }, scenes: [], storyboard: { scenes }, ...extra,
}) as any;

describe("boothFilms", () => {
  const list = boothFilms([
    proj("proj_done", "speaker", "2026-09-26T12:00:00Z", [{ label: "Scene 1", voiceover_text: "Hi.", assets: [need("provided")] }]),
    proj("proj_hype", "hype-cut", "2026-09-26T13:00:00Z", [{ label: "Scene 1", voiceover_text: "Go.", assets: [] }]),
    proj("proj_old", "creator-cut", "2026-09-20T09:00:00Z", [
      { label: "Scene 1", voiceover_text: "One.", assets: [need("needed")] },
      { label: "Card", voiceover_text: "", assets: [] },
    ]),
    proj("proj_new", "speaker", "2026-09-25T09:00:00Z", [
      { label: "Scene 1", voiceover_text: "Hello there.", duration_seconds: 4, assets: [need("provided")] },
      { label: "Scene 2", voiceover_text: "Second line.", assets: [need("needed")] },
    ]),
    proj("proj_empty", "speaker", "2026-09-26T14:00:00Z", []),
  ]);

  it("lists only person-carried films (speaker, creator-cut) that have a board", () => {
    expect(list.map((f) => f.project_id).sort()).toEqual(["proj_done", "proj_new", "proj_old"]);
  });

  it("puts the films still owed a take first, newest first, then the rest", () => {
    expect(list.map((f) => f.project_id)).toEqual(["proj_new", "proj_old", "proj_done"]);
  });

  it("says what each scene still needs, with its lines and the film's frame", () => {
    const f = list[0];
    expect(f).toMatchObject({ name: "PROJ_NEW", grammar: "speaker", frame: "16x9", canvas: { width: 1920, height: 1080 }, open: 1 });
    expect(f.scenes).toEqual([
      { index: 0, label: "Scene 1", lines: "Hello there.", need: "provided", duration: 4 },
      { index: 1, label: "Scene 2", lines: "Second line.", need: "needed", duration: undefined },
    ]);
    expect(list[1].scenes[1].need).toBe("none"); // no lines: no take asked
    expect(list[2].open).toBe(0);
  });
});

describe("the route (source guards)", () => {
  it("is tenant-scoped at the choke point and reads only the URL's (= the token's) tenant", async () => {
    const src = await fs.readFile(path.resolve(HERE, "../src/index.ts"), "utf-8");
    // The choke point 403s a token of any other tenant before the handler.
    expect(src).toMatch(/\|booth-script\|booth-films\|speaker-cut\|/);
    const at = src.indexOf("const boothFilmsMatch");
    expect(at).toBeGreaterThan(0);
    // ...and it runs AFTER the auth middleware and the tenant guard.
    expect(at).toBeGreaterThan(src.indexOf("requireTenant(req, res, decodeURIComponent(tenantSeg[1]))"));
    const block = src.slice(at, at + 700);
    expect(block).toMatch(/boothFilms\(await loadProjects\(bfTenant\)\)/);
    expect(block).toMatch(/const bfTenant = decodeURIComponent\(boothFilmsMatch\[1\]\);/);
  });

  it("serves the two remote-booth pages behind the auth middleware, like /take", async () => {
    const src = await fs.readFile(path.resolve(HERE, "../src/index.ts"), "utf-8");
    const mw = src.indexOf("Auth for all non-health routes");
    for (const route of ['urlPath === "/remote-booth"', 'urlPath === "/remote-camera"']) {
      expect(src.indexOf(route)).toBeGreaterThan(mw);
    }
    // The QR route draws the camera link for a session (and refuses a malformed id).
    expect(src).toMatch(/\/remote-camera\?tenant=\$\{encodeURIComponent\(tqTenant\)\}&session=\$\{encodeURIComponent\(session\)\}/);
    expect(src).toMatch(/if \(session && !\/\^rb_\[A-Za-z0-9_-\]\{16,64\}\$\/\.test\(session\)\)/);
  });
});
