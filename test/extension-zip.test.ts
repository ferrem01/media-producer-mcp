import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// recorder-extension.zip is a CHECKED-IN artifact served verbatim at
// /extension.zip, while the landing page advertises the version from the
// SOURCE manifest. Nothing tied them together, so they drifted: the page
// said v0.11.0 and the download handed out v0.10.0 (the zip was last
// rebuilt for #501). This suite pins the zip to the source directory --
// touch recorder-extension/ without `npm run build:ext` and CI fails.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const zipPath = path.join(root, "recorder-extension.zip");
const srcDir = path.join(root, "recorder-extension");

function zipRead(entry: string): string {
  return execFileSync("unzip", ["-p", zipPath, entry], { encoding: "utf-8" });
}

describe("recorder-extension.zip (the downloadable served at /extension.zip)", () => {
  it("exists", () => {
    expect(fs.existsSync(zipPath)).toBe(true);
  });

  it("carries the same version the landing page advertises", () => {
    const srcVersion = JSON.parse(fs.readFileSync(path.join(srcDir, "manifest.json"), "utf-8")).version;
    const zipVersion = JSON.parse(zipRead("recorder-extension/manifest.json")).version;
    expect(zipVersion, "zip is stale -- run `npm run build:ext` and commit the zip").toBe(srcVersion);
  });

  it("is byte-identical to the source directory, file for file", () => {
    const files = fs.readdirSync(srcDir).filter((f) => !f.startsWith("."));
    expect(files.length).toBeGreaterThan(3);
    const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf-8" }).split("\n");
    for (const f of files) {
      expect(listing, `zip is missing ${f} -- run \`npm run build:ext\``).toContain(`recorder-extension/${f}`);
      const src = fs.readFileSync(path.join(srcDir, f));
      const zipped = execFileSync("unzip", ["-p", zipPath, `recorder-extension/${f}`]);
      expect(zipped.equals(src), `${f} in the zip differs from source -- run \`npm run build:ext\``).toBe(true);
    }
    // And nothing deleted from source lingers in the zip (zip -r on an
    // existing archive never removes entries; build:ext rebuilds fresh).
    for (const entry of listing) {
      if (!entry || entry.endsWith("/")) continue;
      const rel = entry.replace(/^recorder-extension\//, "");
      if (rel.includes("/")) continue; // no subdirs today; a new one must be covered above
      expect(fs.existsSync(path.join(srcDir, rel)), `zip carries deleted file ${rel} -- run \`npm run build:ext\``).toBe(true);
    }
  });
});
