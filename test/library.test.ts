import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

// THE LIBRARY. 251 films in one tenant and the only way in was a project id:
// twenty minutes of hunting for two films he had made himself. A search has
// to cover what a person remembers -- the title, the prompt, and the words ON
// SCREEN -- and copies of one idea (ten of them, in the real tenant) have to
// collapse into that idea rather than flooding the shelf.

async function seed(tenant: string) {
  const { createProject, saveProject } = await import("../src/persistence/project.js");
  const make = async (name: string, patch: Record<string, any>) => {
    const p = await createProject({ tenant_id: tenant, name, format: "video", frame: "16x9" } as any);
    Object.assign(p, patch);
    await saveProject(p as any);
    return p;
  };

  // Older films record the render only in their status: no `rendered` flag.
  await make("Every Call Is Content", {
    status: "rendered",
    prompt: "turn a customer call into marketing",
    scenes: [{ id: "s1", duration_seconds: 4, components: [
      { id: "c1", type: "st-statement", data: { text: "What if a sales call wrote your campaign?" } },
    ] }],
    updated_at: "2026-09-20T00:00:00.000Z",
  });
  // A copy of the same idea, newer, not rendered.
  await make("Every Call Is Content", {
    status: "generated",
    scenes: [{ id: "s1", duration_seconds: 3, components: [] }],
    updated_at: "2026-09-21T00:00:00.000Z",
  });
  await make("Claude Social Post Hype", {
    status: "storyboard",
    prompt: "an email from a customer becomes a launch post",
    scenes: [{ id: "s1", duration_seconds: 2.5, components: [
      { id: "c1", type: "gmail-reader", data: { subject: "We just launched!", body: "thanks to you" } },
    ] }],
    updated_at: "2026-09-19T00:00:00.000Z",
  });
  await make("An Archived Idea", {
    status: "generated", archived_at: "2026-09-18T00:00:00.000Z",
    scenes: [{ id: "s1", duration_seconds: 5, components: [] }],
  });
}

describe("the tenant library", () => {
  it("searches the title, the prompt and the words on screen, and keeps the archive out of the way", async () => {
    const tenant = `t-lib-${Date.now()}`;
    await seed(tenant);
    const { searchLibrary } = await import("../src/core/library.js");

    // The shelf: three films, the archived one is not on it.
    const all = await searchLibrary(tenant, {});
    expect(all.counts.all).toBe(3);
    expect(all.counts.archived).toBe(1);
    expect(all.cards.some((c) => c.name === "An Archived Idea")).toBe(false);

    // The two copies of one idea collapse into one card that carries the other.
    const call = all.cards.find((c) => c.name === "Every Call Is Content")!;
    expect(call).toBeTruthy();
    expect(call.copies?.length).toBe(1);
    // The rendered one leads: it is the one you actually want to watch --
    // and it is recognised from its status alone.
    expect(call.rendered).toBe(true);
    expect(all.counts.rendered).toBe(1);

    // A phrase that only exists ON SCREEN.
    const onScreen = await searchLibrary(tenant, { q: "sales call" });
    expect(onScreen.cards.map((c) => c.name)).toContain("Every Call Is Content");

    // A phrase that only exists in the PROMPT.
    const byPrompt = await searchLibrary(tenant, { q: "launch post" });
    expect(byPrompt.cards.map((c) => c.name)).toEqual(["Claude Social Post Hype"]);

    // The title beats a word buried in a component.
    const byName = await searchLibrary(tenant, { q: "hype" });
    expect(byName.cards[0].name).toBe("Claude Social Post Hype");

    // Every token must land somewhere: a search is a filter, not a suggestion.
    expect((await searchLibrary(tenant, { q: "sales call unicorn" })).cards).toHaveLength(0);

    // The archive is its own shelf.
    const archived = await searchLibrary(tenant, { archived: true });
    expect(archived.cards.map((c) => c.name)).toEqual(["An Archived Idea"]);
  });

  it("carries the facts a card needs, including a date for films that have none", async () => {
    const tenant = `t-lib2-${Date.now()}`;
    const { createProject, saveProject } = await import("../src/persistence/project.js");
    const p = await createProject({ tenant_id: tenant, name: "Undated", format: "video", frame: "9x16" } as any);
    p.scenes = [
      { id: "s1", duration_seconds: 2.5, components: [] },
      { id: "s2", duration_seconds: 3.1, components: [] },
    ] as any;
    delete (p as any).updated_at;
    delete (p as any).created_at;
    await saveProject(p as any);

    const { searchLibrary } = await import("../src/core/library.js");
    const card = (await searchLibrary(tenant, {})).cards[0];
    expect(card.scene_count).toBe(2);
    expect(card.duration_seconds).toBe(5.6);
    expect(card.frame).toBe("9x16");
    // 111 of 251 real films had no updated_at; sorting cannot have holes.
    expect(card.touched_at).toBeTruthy();
    expect(Number.isNaN(Date.parse(card.touched_at))).toBe(false);
  });

  it("filters by state", async () => {
    const tenant = `t-lib3-${Date.now()}`;
    await seed(tenant);
    const { searchLibrary } = await import("../src/core/library.js");
    expect((await searchLibrary(tenant, { filter: "rendered" })).cards.every((c) => c.rendered)).toBe(true);
    // "Claude Social Post Hype" has a scene with a component in it, so it is
    // BUILT even though its status still reads "storyboard" -- which is the
    // whole point: the shelf describes what a film IS, not what a status field
    // was last set to. A board is a film with nothing in its scenes yet.
    const boards = await searchLibrary(tenant, { filter: "board" });
    expect(boards.cards.map((c) => c.name)).toEqual([]);
    const built = await searchLibrary(tenant, { filter: "built" });
    expect(built.cards.map((c) => c.name)).toContain("Claude Social Post Hype");
  });

  it("calls a film BUILT when it has scenes, whatever its status field says", async () => {
    const tenant = `t-lib4-${Date.now()}`;
    const { createProject, saveProject } = await import("../src/persistence/project.js");
    // The shape found in the wild: a finished film whose status was knocked
    // back to "storyboard" by a board edit. Five of them, two with an mp4.
    const p = await createProject({ tenant_id: tenant, name: "Knocked Back", format: "video", frame: "16x9" } as any);
    p.status = "storyboard";
    p.scenes = [{ id: "s1", duration_seconds: 4, components: [{ id: "c", type: "st-statement", data: {} }] }] as any;
    await saveProject(p as any);
    // And a real board: a scene list with nothing in it yet.
    const b = await createProject({ tenant_id: tenant, name: "Actually A Board", format: "video", frame: "16x9" } as any);
    b.status = "storyboard";
    b.scenes = [] as any;
    await saveProject(b as any);

    const { searchLibrary } = await import("../src/core/library.js");
    const r = await searchLibrary(tenant, {});
    const built = r.cards.find((c) => c.name === "Knocked Back")!;
    const board = r.cards.find((c) => c.name === "Actually A Board")!;
    expect(built.built, "a film with scenes is built").toBe(true);
    expect(board.built, "an empty board is not").toBe(false);
    expect(r.counts.built).toBe(1);
    expect(r.counts.board).toBe(1);
    expect((await searchLibrary(tenant, { filter: "built" })).cards.map((c) => c.name)).toEqual(["Knocked Back"]);
    expect((await searchLibrary(tenant, { filter: "board" })).cards.map((c) => c.name)).toEqual(["Actually A Board"]);
  });

  it("does not let a board edit unbuild a film", async () => {
    // The cause: update({storyboard}) set status = "storyboard" unconditionally,
    // so repairing a board relabelled a rendered film as a board.
    const src = await fs.readFile(path.resolve(import.meta.dirname, "../src/server.ts"), "utf-8");
    expect(src).not.toMatch(/\n {10}project\.status = "storyboard";/);
    expect(src).toMatch(/if \(project\.status === "draft"\) project\.status = "storyboard";/);
  });
});
