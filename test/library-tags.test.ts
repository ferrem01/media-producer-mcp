import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// TAGS. Two hundred films and the search only knew what a film SAID. A tag is
// what Marc calls it -- "email", "creator ad", "test" -- free-form, his words,
// and the shelf narrows to films carrying every tag he picks.

const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

describe("normalizeTags", () => {
  it("lowercases, strips #, squashes space, dedupes and caps", async () => {
    const { normalizeTags } = await import("../src/core/library.js");
    expect(normalizeTags(["#Email", "email", "  Creator   Ad ", "", 3, "##Test"])).toEqual(["email", "creator ad", "test"]);
    expect(normalizeTags("analytics, speaker ,analytics")).toEqual(["analytics", "speaker"]);
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(["x".repeat(60)])[0].length).toBe(40);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length).toBe(20);
  });
});

describe("tags on the shelf", () => {
  it("filters to films carrying every tag, finds tags by search, and counts them", async () => {
    const tenant = `t-tags-${Date.now()}`;
    const { createProject, updateProject } = await import("../src/persistence/project.js");
    const { searchLibrary, forgetProject } = await import("../src/core/library.js");
    const make = async (name: string, tags: string[]) => {
      const p = await createProject({ tenant_id: tenant, name, format: "video", frame: "16x9" } as any);
      await updateProject(tenant, p.project_id, { tags } as any);
      forgetProject(tenant, p.project_id);
      return p;
    };
    await make("Signals Walkthrough", ["email", "speaker"]);
    await make("Flow Builder Teaser", ["email"]);
    await make("Wispr Style Ad", ["creator ad"]);

    const one = await searchLibrary(tenant, { tags: ["email"] });
    expect(one.total).toBe(2);
    const both = await searchLibrary(tenant, { tags: ["email", "speaker"] });
    expect(both.cards.map((c) => c.name)).toEqual(["Signals Walkthrough"]);
    expect(both.cards[0].tags).toEqual(["email", "speaker"]);

    // A search for the tag word finds the tagged film even though its name doesn't say it.
    const hit = await searchLibrary(tenant, { q: "creator ad" });
    expect(hit.cards[0].name).toBe("Wispr Style Ad");

    const all = await searchLibrary(tenant, {});
    expect(all.tag_counts[0]).toEqual({ tag: "email", count: 2 });
    expect(all.tag_counts.map((t) => t.tag).sort()).toEqual(["creator ad", "email", "speaker"]);

    // Clearing the tags removes the field.
    const { loadProject } = await import("../src/persistence/project.js");
    const p = await make("Untagged Later", ["tmp"]);
    await updateProject(tenant, p.project_id, { tags: [] } as any);
    expect((await loadProject(tenant, p.project_id) as any).tags).toBeUndefined();
  });
});

describe("tag wiring", () => {
  it("the API, the MCP tools and the library page all speak tags", () => {
    const index = read("src/index.ts");
    expect(index).toMatch(/qp\.getAll\("tag"\)/);
    expect(index).toMatch(/"tag"[\s\S]{0,80}"untag"|"untag"[\s\S]{0,80}"tag"/);
    const server = read("src/server.ts");
    expect(server).toMatch(/add_tags/);
    expect(server).toMatch(/remove_tags/);
    const ui = read("src/preview-app/library-app.ts");
    expect(ui).toMatch(/data-addtag/);
    expect(ui).toMatch(/renderTagFilters/);
    expect(ui).toMatch(/&tag=/);
    expect(ui).toMatch(/datalist id="alltags"/);
  });
});
