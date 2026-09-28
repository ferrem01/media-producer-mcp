import { describe, it, expect, beforeAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Marc: "right now I'm downloading the file and uploading it to Slack and
// it's losing resolution and it's all bad and slow... the videos we're
// producing are not playing in Slack correctly." A render was served whole
// (no byte ranges -- an iPhone will not play that), its index sat at the end
// of the file (players download everything before frame one), and the only
// link was the raw output path that every re-render overwrites.

const run = promisify(execFile);
const DATA = path.join(os.tmpdir(), `mp-share-${process.pid}`);
process.env.MP_DATA_DIR = DATA;

/** A 2s test film with the index at the END (ffmpeg's default without +faststart). */
async function makeFilm(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", file]);
}

describe("serveFile: streamed, with byte ranges", () => {
  it("parses ranges: open-ended, suffix, clamped, unsatisfiable", async () => {
    const { parseRange } = await import("../src/core/serve-file.js");
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
  });

  it("answers a Range request 206 with exactly the bytes asked for; a plain GET 200; HEAD with no body", async () => {
    const { serveFile } = await import("../src/core/serve-file.js");
    const file = path.join(DATA, "blob.bin");
    await fs.mkdir(DATA, { recursive: true });
    const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
    await fs.writeFile(file, bytes);
    const srv = http.createServer((req, res) => { serveFile(req, res, file, { contentType: "video/mp4" }).then((ok) => { if (!ok) { res.writeHead(404); res.end(); } }); });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const part = await fetch(base, { headers: { Range: "bytes=100-199" } });
      expect(part.status).toBe(206);
      expect(part.headers.get("content-range")).toBe("bytes 100-199/1000");
      expect(part.headers.get("accept-ranges")).toBe("bytes");
      expect(Buffer.from(await part.arrayBuffer())).toEqual(bytes.subarray(100, 200));
      const whole = await fetch(base);
      expect(whole.status).toBe(200);
      expect(Number(whole.headers.get("content-length"))).toBe(1000);
      expect((await whole.arrayBuffer()).byteLength).toBe(1000);
      const head = await fetch(base, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(Number(head.headers.get("content-length"))).toBe(1000);
      expect((await fetch(base, { headers: { Range: "bytes=5000-" } })).status).toBe(416);
    } finally { srv.close(); }
  });
});

describe("a render is web-ready: the index before the media", () => {
  it("moves a trailing moov to the front without re-encoding, and leaves a fast file alone", async () => {
    const { ensureFaststart, topLevelAtoms } = await import("../src/core/encode.js");
    const file = path.join(DATA, "slow.mp4");
    await makeFilm(file);
    const before = await topLevelAtoms(file);
    expect(before.indexOf("moov")).toBeGreaterThan(before.indexOf("mdat"));
    expect(await ensureFaststart(file)).toBe(true);
    const after = await topLevelAtoms(file);
    expect(after.indexOf("moov")).toBeLessThan(after.indexOf("mdat"));
    expect(await ensureFaststart(file)).toBe(false);
  });

  it("the final audio mux and the stream-copy concat both write +faststart", async () => {
    const mixer = await fs.readFile(path.resolve(__dirname, "../src/audio/mixer.ts"), "utf-8");
    expect(mixer).toMatch(/"-movflags", "\+faststart",\s*\n\s*"-y",\s*\n\s*opts\.outputPath/);
    const encode = await fs.readFile(path.resolve(__dirname, "../src/core/encode.ts"), "utf-8");
    expect(encode).toMatch(/"-c", "copy",\s*\n\s*"-movflags", "\+faststart",\s*\n\s*outputPath/);
    const queue = await fs.readFile(path.resolve(__dirname, "../src/core/render-queue.ts"), "utf-8");
    expect(queue).toMatch(/ensureFaststart\(result\.outputPath\)/);
  });
});

describe("share links", () => {
  const T = "acme", P = "proj_share1";
  beforeAll(async () => {
    const { projectOutputDir } = await import("../src/persistence/paths.js");
    await makeFilm(path.join(projectOutputDir(T, P), "output.mp4"));
  });

  it("snapshots the latest render under an unguessable token, with a poster; the page carries preview tags; turning it off kills it", async () => {
    const { createShare, getShare, listShares, revokeShare, shareFiles, watchPageHtml, isShareToken } = await import("../src/core/shares.js");
    const { topLevelAtoms } = await import("../src/core/encode.js");
    const { projectOutputDir } = await import("../src/persistence/paths.js");
    const s = await createShare(T, P, "Launch film");
    expect(isShareToken(s.token)).toBe(true);
    expect(s.token).not.toContain(P);
    expect(s.title).toBe("Launch film");
    expect(s.width).toBe(320); expect(s.height).toBe(180);
    expect(s.duration).toBeGreaterThan(1.5);
    const files = shareFiles(s);
    // The snapshot is web-ready even though the render it copied was not.
    const atoms = await topLevelAtoms(files.video);
    expect(atoms.indexOf("moov")).toBeLessThan(atoms.indexOf("mdat"));
    expect((await fs.stat(files.poster)).size).toBeGreaterThan(500);
    // A later render does not change what the link plays.
    const snapBefore = await fs.readFile(files.video);
    await fs.writeFile(path.join(projectOutputDir(T, P), "output.mp4"), "a newer render");
    expect(await fs.readFile(files.video)).toEqual(snapBefore);
    expect((await getShare(s.token))?.project_id).toBe(P);
    expect((await listShares(T, P)).map((x) => x.token)).toEqual([s.token]);
    const html = watchPageHtml(s, "https://mm.example");
    expect(html).toContain(`<meta property="og:video" content="https://mm.example/watch/${s.token}/video.mp4">`);
    expect(html).toContain(`<meta property="og:image" content="https://mm.example/watch/${s.token}/poster.jpg">`);
    expect(html).toContain("playsinline");
    expect(html).not.toContain(P);
    // Another project cannot turn it off; its own can.
    expect(await revokeShare(T, "proj_other", s.token)).toBe(false);
    expect(await revokeShare(T, P, s.token)).toBe(true);
    expect(await getShare(s.token)).toBeNull();
    await expect(fs.stat(files.video)).rejects.toThrow();
  });

  it("refuses to share a film that was never rendered, and a malformed token finds nothing", async () => {
    const { createShare, getShare } = await import("../src/core/shares.js");
    await expect(createShare(T, "proj_never", "x")).rejects.toThrow(/not been rendered/);
    expect(await getShare("../../etc/passwd")).toBeNull();
  });

  it("is wired: public /watch routes, a tenant-scoped /api/share, streaming /output that hides snapshots, and a Share button in Studio", async () => {
    const idx = await fs.readFile(path.resolve(__dirname, "../src/index.ts"), "utf-8");
    expect(idx).toMatch(/const watchMatch = urlPath\.match\(/);
    expect(idx).toMatch(/\|render-status\|share\|job\|/);
    expect(idx).toMatch(/serveFile\(req, res, fullPath, \{ contentType: contentTypeFor\(fullPath\) \}\)/);
    expect(idx).toMatch(/\(\^\|\\\/\)shares\\\//);
    // The public routes sit before the auth wall.
    expect(idx.indexOf("const watchMatch")).toBeLessThan(idx.indexOf("// ── Auth for all non-health routes ──"));
    const studio = await fs.readFile(path.resolve(__dirname, "../src/preview-app/preview-app.ts"), "utf-8");
    expect(studio).toContain('id="share-btn"');
    expect(studio).toMatch(/api\('POST', '\/share\/' \+ state\.tenantId/);
  });
});
