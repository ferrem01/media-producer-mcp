import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A film built scene by scene with `add` never gets a storyboard, so it stays
// "draft" -- and render refused it (proj_790dc4fa, the develop. rebuild).
// A draft WITH scenes renders; an empty draft still asks for a storyboard.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("render gate", () => {
  it("lets a hand-built draft (one with scenes) render", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/server.ts"), "utf-8");
    expect(src).toContain('if (project.status === "draft" && !(project.scenes || []).length) {');
    expect(src).toContain("Project needs a storyboard first.");
  });
});
