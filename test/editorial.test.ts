import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseComponent } from "../src/core/component-parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// The editorial grammar (typography-first manifesto dialect) + st-statement
// (the display-serif statement beat) + the six shader transitions that came
// with the HyperFrames port. Pins the whole contract.

describe("st-statement (the editorial statement beat)", () => {
  it("parses, is seek-safe, and carries the serif + emphasis machinery", async () => {
    const src = await read("../src/components/scene-templates/st-statement.component.html");
    const parsed = parseComponent(src);
    expect(parsed.script).toContain("createTimeline");
    expect(src).not.toMatch(/requestAnimationFrame|setInterval|setTimeout|performance\.now|Date\.now|Math\.random/);
    expect(src).toContain("Instrument Serif");     // the display serif
    expect(src).toContain("stst-em");              // gradient-italic emphasis
    expect(src).toContain("data.lines");           // rolling sequences
  });

  it("schema sells the editorial role: emphasis stars, rolling lines, cream/dark", async () => {
    const schema = JSON.parse(await read("../src/components/scene-templates/st-statement.schema.json"));
    expect(schema.category).toBe("scene-template");
    expect(schema.description).toContain("SERIF");
    expect(schema.data.text.label).toContain("*stars*");
    expect(schema.data.lines).toBeTruthy();
    expect(schema.data.theme.label).toContain("cream");
    expect(schema.match).toBeTruthy();
  });

  it("instantiates deterministically with no webgl backdrop (it paints its own canvas)", async () => {
    const { generateScene } = await import("../src/llm/scene-generator.js");
    const result = await generateScene({
      scene: {
        label: "Thesis", duration_seconds: 3, purpose: "p", visual_notes: "v",
        scene_template: { type: "st-statement", data: { text: "The registry is the *product*.", theme: "dark" } },
        components: [],
      } as any,
      sceneIndex: 1, totalScenes: 6, prompt: "p",
      llmConfig: {} as any, brandKit: {} as any, canvas: { width: 1920, height: 1080 } as any,
    } as any);
    const comps: any[] = (result.scene as any).components;
    expect(comps.find((c) => c.id === "tpl_0").type).toBe("st-statement");
    expect(comps.find((c) => c.id === "tpl_bg")).toBeUndefined();
  });
});

describe("editorial film grammar", () => {
  it("is a registered grammar the director can commit to", async () => {
    const { FILM_GRAMMARS } = await import("../src/llm/creative-director.js");
    expect(FILM_GRAMMARS).toContain("editorial");
    const cd = await read("../src/llm/creative-director.ts");
    expect(cd).toContain('"editorial": the typography-first manifesto dialect');
  });

  it("storyboard contract enforces the alternation + temperature rhythm", async () => {
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toContain("### EDITORIAL FILMS");
    expect(sb).toContain("THE ALTERNATION");
    expect(sb).toContain("TEMPERATURE IS RHYTHM");
    expect(sb).toContain("ONE EMPHASIS PER STATEMENT");
  });

  it("pipeline: editorial is component-first and music-first by default (source guards)", async () => {
    const p = await read("../src/llm/pipeline.ts");
    expect(p).toContain('filmGrammar === "editorial"');
    expect(p).toContain('filmGrammar === "tempo-cut" || filmGrammar === "editorial"');
  });

  it("generate tool accepts the grammar", async () => {
    const s = await read("../src/server.ts");
    expect(s).toContain('"editorial"');
  });
});

describe("shader transition ports (HyperFrames parity)", () => {
  const NEW_SHADERS = [
    "shader-flash-white", "shader-light-leak", "shader-gravitational-lens",
    "shader-thermal", "shader-domain-warp", "shader-ridged-burn",
  ];

  it("all six live in the shader library with transition() bodies", async () => {
    const t = await read("../src/core/transitions.ts");
    for (const s of NEW_SHADERS) expect(t).toContain(`"${s}"`);
    // Each GLSL body defines the gl-transitions entry point.
    const matches = t.match(/vec4 transition\(vec2/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(15); // 9 existing + 6 new
  });

  it("the scene contract + storyboard vocabulary expose them", async () => {
    const types = await read("../src/core/types.ts");
    const sb = await read("../src/llm/storyboard-builder.ts");
    for (const s of NEW_SHADERS) {
      expect(types).toContain(`"${s}"`);
      expect(sb).toContain(s);
    }
  });
});

describe("LLM client resilience (the frozen-generate fix)", () => {
  it("every LLM POST is guarded against dead sockets and retries transients (source guards)", async () => {
    const c = await read("../src/llm/client.ts");
    // Anthropic path streams with an IDLE timeout (a wall clock aborted
    // legitimately slow generations -- the measured concept-step stall).
    expect(c).toContain("LLM_STREAM_IDLE_TIMEOUT_MS");
    expect(c).toContain('stream: true');
    expect(c).toContain("TRANSIENT_BACKOFF_MS");
    // The absolute-cap wall clock survives as a backstop, and the OpenAI
    // path still carries its own timeout signal.
    expect(c).toContain("LLM_REQUEST_TIMEOUT_MS");
    expect(c).toContain("AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS)"); // openai path
  });
});

describe("editorial vocabulary enforcement", () => {
  it("pipeline converts launch-film statement templates to st-statement in code (source guards)", async () => {
    const p = await read("../src/llm/pipeline.ts");
    expect(p).toContain("Editorial vocabulary enforcement");
    expect(p).toContain('"st-statement"');
    const sb = await read("../src/llm/storyboard-builder.ts");
    expect(sb).toContain("THE TEMPLATE VOCABULARY IS CLOSED");
  });
});

describe("hand-edit API transition vocabulary", () => {
  it("the add/update transition enum carries the engine's full set (source guard)", async () => {
    const s = await read("../src/server.ts");
    for (const t of ["shader-gravitational-lens", "shader-flash-white", "whip-pan", "cinematic-zoom"]) {
      expect(s).toContain(`"${t}"`);
    }
  });
});

describe("micro-shot entrance compression", () => {
  it("the assembler speeds component timelines on sub-1.4s shots (source guard)", async () => {
    const a = await read("../src/core/scene-assembler.ts");
    expect(a).toContain("MICRO-SHOT compression");
    expect(a).toContain("timeScale(Math.max(1, 2.2 /");
  });
});
