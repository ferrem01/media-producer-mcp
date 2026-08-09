import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATOR_PLAYBOOK } from "../src/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// THE GOLDEN WORKFLOW IS THE API'S SHAPE, NOT TRIBAL KNOWLEDGE.
//
// Both of the tenant's best films (proj_bf247f37 "Claude Social Post Hype",
// proj_21bd3c13 "Every Call Is Content") were made the same way: generate a
// storyboard, iterate it round and round with feedback until every beat was
// right, build the scenes once, then only small tweaks. Jake Moran's
// published workflow is the same loop ("storyboard as stills first; spend
// revisions on the scene that carries the film"). Yet generate's default was
// one-shot prompt->built-scenes, so the workflow that made the best films
// was opt-in and undocumented. Marc: "if that's the golden workflow, what
// can we do to enforce it?"
//
// Enforcement: (1) the doctrine leads the operator playbook and the generate
// tool description -- the operator is almost always an LLM reading exactly
// those; (2) for VIDEO, generate defaults to stopping at the storyboard, and
// building is a deliberate second call. Explicit mode always wins; non-video
// targets, revisions (id), and the deterministic screencast path stay
// one-shot.

describe("the golden workflow is enforced", () => {
  it("leads the operator playbook", () => {
    expect(OPERATOR_PLAYBOOK).toMatch(/THE GOLDEN WORKFLOW/);
    expect(OPERATOR_PLAYBOOK).toMatch(/returns a STORYBOARD for video, on purpose/);
    expect(OPERATOR_PLAYBOOK).toMatch(/spend revisions HERE/);
    // The playbook ceiling test lives in mcp-download-url.test.ts; adding the
    // doctrine must never be the reason it gets raised.
  });

  it("teaches the ladder in the generate tool description", async () => {
    const src = await read("../src/server.ts");
    const at = src.indexOf('"Generate media from a natural language prompt.');
    expect(at).toBeGreaterThan(0);
    const desc = src.slice(at, at + 1400);
    expect(desc).toMatch(/THE GOLDEN WORKFLOW/);
    expect(desc).toMatch(/mode defaults to 'storyboard'/);
    expect(desc).toMatch(/building is a deliberate second call/i);
  });

  it("defaults video generation to the storyboard stop-point", async () => {
    const src = await read("../src/server.ts");
    const at = src.indexOf("const effectiveMode = params.mode");
    expect(at, "the handler no longer resolves an effective mode").toBeGreaterThan(0);
    const body = src.slice(at, at + 220);
    // video + not-a-revision -> storyboard; everything else -> full.
    expect(body).toMatch(/params\.target === "video" && !params\.id \? "storyboard" : "full"/);
    // The static zod default is GONE -- a schema-level default("full") would
    // silently override the per-target resolution.
    expect(src).not.toMatch(/z\.enum\(\["storyboard", "full"\]\)\.optional\(\)\.default\("full"\)/);
  });

  it("branches the pipeline on the resolved mode, not the raw param", async () => {
    const src = await read("../src/server.ts");
    expect(src).toMatch(/if \(effectiveMode === "storyboard"\)/);
    // The old raw-param check must not survive anywhere in the generate path.
    expect(src).not.toMatch(/if \(params\.mode === "storyboard"\)/);
  });
});
