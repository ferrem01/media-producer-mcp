import { describe, it, expect } from "vitest";
import { normalizeDownloadUrl } from "../src/server.js";

describe("normalizeDownloadUrl: share links -> direct download", () => {
  it("Google Drive /file/d/<id>/view -> uc?export=download", () => {
    expect(normalizeDownloadUrl("https://drive.google.com/file/d/ABC123/view?usp=sharing"))
      .toBe("https://drive.google.com/uc?export=download&id=ABC123&confirm=t");
  });
  it("Google Drive ?id=<id> form", () => {
    expect(normalizeDownloadUrl("https://drive.google.com/open?id=XYZ789"))
      .toBe("https://drive.google.com/uc?export=download&id=XYZ789&confirm=t");
  });
  it("Dropbox share link -> dl=1", () => {
    expect(normalizeDownloadUrl("https://www.dropbox.com/s/abc/cam.mp4?dl=0"))
      .toContain("dl=1");
  });
  it("leaves an already-direct URL untouched", () => {
    const u = "https://example.com/assets/cam.mp4";
    expect(normalizeDownloadUrl(u)).toBe(u);
  });
  it("returns non-URL input unchanged", () => {
    expect(normalizeDownloadUrl("not a url")).toBe("not a url");
  });
});
