/**
 * Studio revise regression suite.
 *
 * Guards the revise-a-highlighted-element flow end to end:
 *  1. Routing (resolveReviseTarget): which editing primitive a revise takes.
 *     The live failure this suite exists for: a speaker film (library
 *     components only -- screencast-frame, narration-track) 400'd with
 *     "no codegen component to revise" on EVERY element revise.
 *  2. LLM-response guardrails (sanitizeDataRevise): schema echoes, garbage
 *     JSON, dropped keys.
 *  3. reviseScene component-data path against a real on-disk project with a
 *     mocked LLM: data merged (video_url survives), persisted, _note
 *     surfaced, garbage refused without touching the project.
 *  4. Client twins: the Studio template literal must keep sending compId and
 *     surfacing server error bodies -- source-level guards, same spirit as
 *     the storyboard-builder loud guard.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("../src/llm/client.js", () => ({
  callLLM: vi.fn(),
  // reviseScene's module graph pulls in helpers that re-export types/config.
  llmConfigFromEnv: vi.fn(() => ({ provider: "anthropic", model: "test", apiKey: "test" })),
}));

import { callLLM } from "../src/llm/client.js";
import {
  resolveReviseTarget,
  sanitizeDataRevise,
  reviseScene,
} from "../src/llm/scene-revise.js";
import { config } from "../src/config.js";
import { saveProject, loadProject } from "../src/persistence/project.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(__dirname, "../test-output/scene-revise");
const TENANT = "revise-test-tenant";
const PROJECT = "proj_revise_test";

const mockLLM = callLLM as unknown as ReturnType<typeof vi.fn>;

/** A speaker-film scene: library components only, no codegen, no template. */
function speakerScene(): any {
  return {
    id: "screencast",
    label: "Walkthrough",
    duration_seconds: 30,
    components: [
      {
        id: "bg", type: "gradient-background",
        data: { from: "#101014", to: "#1d1d2b" },
      },
      {
        id: "screencast_frame", type: "screencast-frame",
        data: {
          video_url: "/assets/rec.webm", frame_style: "none",
          corner_radius: 28, max_width_pct: 88,
          pip_source: "speaker", pip_shape: "circle", pip_size: 15,
        },
      },
      {
        id: "narration_overlay", type: "narration-track",
        data: { sentences: [{ text: "This is my test.", at: 1 }] },
      },
    ],
  };
}

function codegenScene(): any {
  return {
    id: "scene_001",
    duration_seconds: 8,
    components: [
      { id: "c1", type: "custom_hero", data: {} },
      { id: "narration_overlay", type: "narration-track", data: { sentences: [] } },
    ],
  };
}

function templateScene(): any {
  return {
    id: "tpl",
    duration_seconds: 6,
    components: [{ id: "t1", type: "st-hero-stat", data: { headline: "Big" } }],
  };
}

// ── 1. Routing ──────────────────────────────────────────────────────────────

describe("resolveReviseTarget", () => {
  it("REGRESSION: speaker-film element click routes to component-data, not a 400", () => {
    // The exact shape Studio sends for the PiP bubble click that failed live.
    const t = resolveReviseTarget(speakerScene(), {
      tagName: "div", classList: [], compType: "screencast-frame", compId: "screencast_frame",
    });
    expect(t.kind).toBe("component-data");
    expect((t as any).comp.id).toBe("screencast_frame");
  });

  it("resolves by compId first, then by compType", () => {
    const byId = resolveReviseTarget(speakerScene(), { compId: "narration_overlay" });
    expect(byId.kind).toBe("component-data");
    expect((byId as any).comp.type).toBe("narration-track");

    const byType = resolveReviseTarget(speakerScene(), { compType: "screencast-frame" });
    expect(byType.kind).toBe("component-data");
    expect((byType as any).comp.id).toBe("screencast_frame");
  });

  it("speaker scene with NO element target explains how to fix it (names the components)", () => {
    const t = resolveReviseTarget(speakerScene(), undefined);
    expect(t.kind).toBe("none");
    expect((t as any).error).toContain("click the element");
    expect((t as any).error).toContain("screencast-frame");
    // The old, misleading message must be gone.
    expect((t as any).error).not.toContain("no codegen component");
  });

  it("codegen scene without an element keeps the source-patch path", () => {
    const t = resolveReviseTarget(codegenScene(), undefined);
    expect(t.kind).toBe("codegen");
    expect((t as any).comp.type).toBe("custom_hero");
  });

  it("clicking INSIDE the codegen component still routes to the source patch", () => {
    // Assembled wrappers carry data-cid for codegen comps too; that click
    // must not be misread as a library-data revise.
    const t = resolveReviseTarget(codegenScene(), { compId: "c1", compType: "custom_hero" });
    expect(t.kind).toBe("codegen");
  });

  it("clicking a library overlay INSIDE a codegen scene revises that component's data", () => {
    const t = resolveReviseTarget(codegenScene(), { compId: "narration_overlay" });
    expect(t.kind).toBe("component-data");
    expect((t as any).comp.type).toBe("narration-track");
  });

  it("template scenes keep the slot-revise path even when clicked directly", () => {
    expect(resolveReviseTarget(templateScene(), undefined).kind).toBe("template-slots");
    expect(resolveReviseTarget(templateScene(), { compId: "t1", compType: "st-hero-stat" }).kind)
      .toBe("template-slots");
  });

  it("unknown compId/compType falls through to the scene-level route", () => {
    const t = resolveReviseTarget(speakerScene(), { compId: "nope", compType: "not-a-comp" });
    expect(t.kind).toBe("none");
    const t2 = resolveReviseTarget(codegenScene(), { compId: "nope" });
    expect(t2.kind).toBe("codegen");
  });

  it("tolerates a degenerate scene", () => {
    expect(resolveReviseTarget({ components: [] }).kind).toBe("none");
    expect(resolveReviseTarget({}).kind).toBe("none");
  });
});

// ── 2. LLM-response guardrails ──────────────────────────────────────────────

describe("sanitizeDataRevise", () => {
  const prev = { video_url: "/assets/rec.webm", pip_size: 15 };

  it("accepts clean JSON (with or without markdown fences)", () => {
    const r = sanitizeDataRevise('{"video_url":"/assets/rec.webm","pip_size":10}', prev);
    expect(r.ok).toBe(true);
    expect((r as any).data.pip_size).toBe(10);

    const fenced = sanitizeDataRevise('```json\n{"pip_size": 8, "video_url": "/assets/rec.webm"}\n```', prev);
    expect(fenced.ok).toBe(true);
    expect((fenced as any).data.pip_size).toBe(8);
  });

  it("refuses unparseable and non-object responses", () => {
    expect(sanitizeDataRevise("sure, here you go!", prev).ok).toBe(false);
    expect(sanitizeDataRevise('["a"]', prev).ok).toBe(false);
    expect(sanitizeDataRevise('"str"', prev).ok).toBe(false);
  });

  it("unwraps a schema-shaped echo ({type, label, data:{...}})", () => {
    const r = sanitizeDataRevise(
      JSON.stringify({ type: "screencast-frame", label: "Frame", data: { video_url: "/assets/rec.webm", pip_size: 9 } }),
      prev,
    );
    expect(r.ok).toBe(true);
    expect((r as any).data.pip_size).toBe(9);
    expect((r as any).data.type).toBeUndefined();
  });

  it("drops slot-DEFINITION echoes, keeping the current value", () => {
    const r = sanitizeDataRevise(
      JSON.stringify({ video_url: { type: "string", label: "Video URL" }, pip_size: 12 }),
      prev,
    );
    expect(r.ok).toBe(true);
    expect((r as any).data.video_url).toBe("/assets/rec.webm");
    expect((r as any).data.pip_size).toBe(12);
  });

  it("refuses a response that drops every existing key (would blank the scene)", () => {
    const r = sanitizeDataRevise('{"totally_new_key": 1}', prev);
    expect(r.ok).toBe(false);
  });

  it("extracts _note without storing it as data", () => {
    const r = sanitizeDataRevise(
      JSON.stringify({ ...prev, _note: "data fields cannot re-layout the scene" }),
      prev,
    );
    expect(r.ok).toBe(true);
    expect((r as any).note).toContain("cannot re-layout");
    expect((r as any).data._note).toBeUndefined();
  });
});

// ── 3. reviseScene component-data path (on-disk project, mocked LLM) ────────

describe("reviseScene on a speaker film", () => {
  const llmConfig = { provider: "anthropic", model: "test", apiKey: "test" } as any;

  beforeAll(async () => {
    config.dataDir = TEST_DATA_DIR;
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  async function freshProject(): Promise<void> {
    await saveProject({
      project_id: PROJECT, tenant_id: TENANT, name: "Revise regression",
      format: "video", status: "generated",
      canvas: { width: 1920, height: 1080, fps: 30 },
      scenes: [speakerScene()],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    } as any);
  }

  it("REGRESSION: revising the PiP bubble succeeds and merges data (video_url survives)", async () => {
    await freshProject();
    // LLM answers the instruction but DROPS video_url -- the merge must keep it.
    mockLLM.mockResolvedValueOnce(JSON.stringify({
      frame_style: "none", corner_radius: 28, max_width_pct: 88,
      pip_source: "speaker", pip_shape: "circle", pip_size: 10,
    }));
    const res = await reviseScene({
      tenantId: TENANT, projectId: PROJECT, sceneId: "screencast",
      instruction: "can you make this even smaller?",
      element: { tagName: "div", classList: [], compType: "screencast-frame", compId: "screencast_frame" },
      llmConfig,
    });
    expect(res.ok).toBe(true);
    expect(res.componentType).toBe("screencast-frame");

    const saved = await loadProject(TENANT, PROJECT);
    const comp: any = saved!.scenes[0].components.find((c: any) => c.id === "screencast_frame");
    expect(comp.data.pip_size).toBe(10);           // the change applied
    expect(comp.data.video_url).toBe("/assets/rec.webm"); // the film survived
  });

  it("a _note-only response leaves data unchanged and surfaces the note", async () => {
    await freshProject();
    mockLLM.mockResolvedValueOnce(JSON.stringify({
      video_url: "/assets/rec.webm", frame_style: "none", corner_radius: 28,
      max_width_pct: 88, pip_source: "speaker", pip_shape: "circle", pip_size: 15,
      _note: "the data fields cannot animate the bubble",
    }));
    const res = await reviseScene({
      tenantId: TENANT, projectId: PROJECT, sceneId: "screencast",
      instruction: "make the bubble do a backflip",
      element: { compId: "screencast_frame" },
      llmConfig,
    });
    expect(res.ok).toBe(true);
    expect((res.layout_warnings || []).join(" ")).toContain("cannot animate");
    const saved = await loadProject(TENANT, PROJECT);
    const comp: any = saved!.scenes[0].components.find((c: any) => c.id === "screencast_frame");
    expect(comp.data.pip_size).toBe(15);
  });

  it("garbage LLM output is refused without touching the project", async () => {
    await freshProject();
    mockLLM.mockResolvedValueOnce("I refuse to answer in JSON today.");
    const res = await reviseScene({
      tenantId: TENANT, projectId: PROJECT, sceneId: "screencast",
      instruction: "smaller please",
      element: { compId: "screencast_frame" },
      llmConfig,
    });
    expect(res.ok).toBe(false);
    const saved = await loadProject(TENANT, PROJECT);
    const comp: any = saved!.scenes[0].components.find((c: any) => c.id === "screencast_frame");
    expect(comp.data.pip_size).toBe(15);
  });

  it("scene-scope revise on a speaker film fails with the instructive error, not the codegen one", async () => {
    await freshProject();
    const res = await reviseScene({
      tenantId: TENANT, projectId: PROJECT, sceneId: "screencast",
      instruction: "make it pop", llmConfig,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("click the element");
    expect(res.error).not.toContain("no codegen component");
  });
});

// ── 4. Client twins (Studio template literal source guards) ─────────────────

describe("Studio client keeps its half of the contract", () => {
  let src = "";
  beforeAll(async () => {
    src = await fs.readFile(path.resolve(__dirname, "../src/preview-app/preview-app.ts"), "utf-8");
  });

  it("studioRevise sends the selected compId to the server", () => {
    // Without compId the server cannot route speaker-film revises to the
    // clicked component -- this is the client half of the 400 fix.
    expect(src).toMatch(/compId:\s*studio\.sel\.compId/);
  });

  it("studioContextOf reads data-cid wrappers (assembled components carry no data-comp-id)", () => {
    expect(src).toContain("getAttribute('data-cid')");
  });

  it("api() surfaces the server's error body instead of a bare status code", () => {
    // "API error 400" told Marc nothing; the route body carries the reason.
    expect(src).toMatch(/b\s*&&\s*b\.error/);
  });
});
