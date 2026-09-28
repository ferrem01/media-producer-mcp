/**
 * Serve a file from disk over HTTP the way a video player needs it: streamed
 * (never read whole into memory), with byte ranges.
 *
 * The /output route read the whole render into memory and answered every
 * request 200 with the full body. A browser's <video> asks for ranges, and
 * Safari on an iPhone will not play an MP4 whose server does not answer
 * them (Marc: "the videos we're producing are not playing in Slack
 * correctly" -- a 19 MB film, a Range request, 19 MB back).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import type http from "node:http";

export interface ServeFileOptions {
  contentType: string;
  /** Cache-Control header (default no-cache). */
  cacheControl?: string;
  /** Content-Disposition (default inline). */
  disposition?: string;
}

/** Parse a single "bytes=a-b" range against a size. Null when absent or unsatisfiable. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number, end: number;
  if (m[1] === "") {
    // suffix: the last N bytes
    const n = Number(m[2]);
    if (!n) return "unsatisfiable";
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** Stream `fullPath` to `res`, honouring a Range request. Returns false (and sends nothing) when the file is missing. */
export async function serveFile(req: http.IncomingMessage, res: http.ServerResponse, fullPath: string, opts: ServeFileOptions): Promise<boolean> {
  const st = await fsp.stat(fullPath).catch(() => null);
  if (!st || !st.isFile()) return false;
  const size = st.size;
  const etag = `"${size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const base: Record<string, string | number> = {
    "Content-Type": opts.contentType,
    "Accept-Ranges": "bytes",
    "Content-Disposition": opts.disposition || "inline",
    "Cache-Control": opts.cacheControl || "no-cache",
    "Last-Modified": st.mtime.toUTCString(),
    ETag: etag,
  };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, base);
    res.end();
    return true;
  }
  const range = parseRange(req.headers.range as string | undefined, size);
  if (range === "unsatisfiable") {
    res.writeHead(416, { ...base, "Content-Range": `bytes */${size}` });
    res.end();
    return true;
  }
  const head = req.method === "HEAD";
  if (range) {
    res.writeHead(206, { ...base, "Content-Length": range.end - range.start + 1, "Content-Range": `bytes ${range.start}-${range.end}/${size}` });
    if (head) { res.end(); return true; }
    fs.createReadStream(fullPath, { start: range.start, end: range.end }).on("error", () => res.destroy()).pipe(res);
    return true;
  }
  res.writeHead(200, { ...base, "Content-Length": size });
  if (head) { res.end(); return true; }
  fs.createReadStream(fullPath).on("error", () => res.destroy()).pipe(res);
  return true;
}

/** Content type from a file extension, for the media and image files the server hands out. */
export function contentTypeFor(file: string): string {
  const ext = (file.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase();
  return ({ ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".json": "application/json" } as Record<string, string>)[ext] || "application/octet-stream";
}
