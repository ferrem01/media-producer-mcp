import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// "can you add a sorted by created date to the film list" (Marc). About half
// the tenant's films predate the stored created_at; those fall back to their
// folder's birth, else their first take, else their last change -- marked as
// a guess -- so the sort has no holes.

describe("the film list by date created", () => {
  it("sorts newest-made first, films without a stored date placed by their fallback", async () => {
    const tenant = `t-created-${Date.now()}`;
    const { createProject, saveProject } = await import("../src/persistence/project.js");
    const { searchLibrary } = await import("../src/core/library.js");
    const make = async (name: string, patch: Record<string, any>) => {
      const p: any = await createProject({ tenant_id: tenant, name, format: "video", frame: "16x9" } as any);
      for (const [k, v] of Object.entries(patch)) { if (v === undefined) delete p[k]; else p[k] = v; }
      await saveProject(p);
      return p;
    };
    await make("Old but edited yesterday", { created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-10-02T00:00:00.000Z" });
    await make("Made last", { created_at: "2026-09-30T00:00:00.000Z", updated_at: "2026-09-30T00:00:00.000Z" });
    await make("No stored date, an old take", { created_at: undefined, updated_at: "2026-09-29T00:00:00.000Z", takes: [{ id: "k", scene_index: 0, source: "/x.mp4", recorded_at: "2026-08-15T00:00:00.000Z" }] });

    const byCreated = await searchLibrary(tenant, { sort: "created" });
    expect(byCreated.cards.map((c) => c.name)).toEqual(["Made last", "Old but edited yesterday", "No stored date, an old take"]);
    const guess = byCreated.cards.find((c) => c.name.startsWith("No stored"))!;
    expect(guess.created_guess).toBe(true);
    expect(byCreated.cards[0].created).toBe("2026-09-30T00:00:00.000Z");
    expect(byCreated.cards[0].created_guess).toBeUndefined();

    // Last edited is unchanged: the old film edited yesterday leads.
    const recent = await searchLibrary(tenant, { sort: "recent" });
    expect(recent.cards[0].name).toBe("Old but edited yesterday");
  });

  it("the Films page offers it and shows when each film was made", () => {
    const ui = fs.readFileSync(path.join(__dirname, "..", "src/preview-app/library-app.ts"), "utf8");
    expect(ui).toMatch(/'created:Date created'/);
    expect(ui).toMatch(/'recent:Last edited'/);
    expect(ui).toMatch(/'made ' \+ esc\(fmtDate\(c\.created\)\)/);
  });
});
