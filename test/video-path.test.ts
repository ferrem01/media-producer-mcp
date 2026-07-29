import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveVideoPath } from "../src/core/video-path.js";

// The DOM's video.src percent-encodes URLs on file:// pages; files live on
// disk under their ORIGINAL names. resolveVideoPath must bridge the two --
// a %20 path handed to ffmpeg silently extracted nothing and shipped a black
// video window (Jacob's "Connect Claude + Use Case.mp4", 2026-07-29).
describe("resolveVideoPath percent-encoding", () => {
  let dataDir: string;
  const rel = ["jacob", "projects", "proj_x", "assets"];
  const fname = "Connect Claude + Use Case.mp4";

  beforeAll(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vp-test-"));
    const dir = path.join(dataDir, ...rel);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fname), "x");
  });
  afterAll(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

  it("decodes %20 (and keeps literal +) from a file:// DOM src", () => {
    const src = "file:///assets/jacob/projects/proj_x/assets/Connect%20Claude%20+%20Use%20Case.mp4";
    expect(resolveVideoPath(src, dataDir)).toBe(path.join(dataDir, ...rel, fname));
  });

  it("still resolves an unencoded src", () => {
    const src = "/assets/jacob/projects/proj_x/assets/" + fname;
    expect(resolveVideoPath(src, dataDir)).toBe(path.join(dataDir, ...rel, fname));
  });

  it("falls back to the raw form when the literal %-named file exists", () => {
    const literal = "weird %20 name.mp4";
    fs.writeFileSync(path.join(dataDir, ...rel, literal), "x");
    const src = "/assets/jacob/projects/proj_x/assets/weird %20 name.mp4";
    expect(resolveVideoPath(src, dataDir)).toBe(path.join(dataDir, ...rel, literal));
  });

  it("decodes a file:// URL to an ABSOLUTE path (preview assembler pre-resolves assets)", () => {
    const abs = path.join(dataDir, ...rel, fname);
    const src = "file://" + abs.split("/").map(encodeURIComponent).join("/");
    expect(resolveVideoPath(src, dataDir)).toBe(abs);
  });

  it("passes external URLs through unchanged", () => {
    expect(resolveVideoPath("https://cdn.example.com/a%20b.mp4", dataDir)).toBe("https://cdn.example.com/a%20b.mp4");
  });
});
