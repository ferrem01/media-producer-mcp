import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The recast's Direction was a one-line box with grey example text that was
// never sent: an empty recast got HeyGen's own movement, not the calm
// presenter the generated take used. Marc: make it a text box with the
// default already in it, to change.
const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

describe("cast direction box", () => {
  it("is a full text box holding the house direction, sent as written", () => {
    const studio = read("src/preview-app/preview-app.ts");
    expect(studio).toMatch(/<textarea id="cast-motion"/);
    expect(studio).toMatch(/motion: \$\{JSON\.stringify\(DEFAULT_MOTION\)\}/);
    expect(studio).toMatch(/body\.motion = \(castUi\.motion \|\| ''\)\.trim\(\);/);
  });
});
