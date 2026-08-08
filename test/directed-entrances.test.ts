import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { assembleScene } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFile(path.resolve(__dirname, p), "utf-8");

// canvas-tour's whole premise is one unbroken shot: subjects pan through the
// frame and the next beat picks the movement up from the same direction, so
// the boundary reads as a continuous move rather than a cut.
//
// The engine has always had the mechanism -- wrapperChoreoScript runs
// slide-left/-right/-up/-down (plus rise/pop/fade) off SceneComponent.enter
// and .exit. The STORYBOARD could not reach it: enter/exit appeared nowhere in
// its schema, its normalizer flattened every component to {type, data}, and
// the authored-composition builder never mapped them. So the storyboard wrote
// "the camera keeps travelling right" in visual_notes and NOTHING moved --
// measured on proj_fcd1a789: seven scenes, transition_in none on every one,
// zero directional entrances anywhere, and prose full of direction words.
//
// Chasing the camera could never have fixed it: .mp-camera is rebuilt per
// scene, so camera state cannot cross a boundary at all. Only content can.

const W = 1280, H = 720, DUR = 5;

async function scene(comp: Record<string, unknown>): Promise<string> {
  const src = await read("../src/components/titles/typewriter.component.html");
  return assembleScene({
    scene: {
      id: "s1", label: "place", duration_seconds: DUR, background: "#f2efe7",
      components: [{
        id: "typewriter", type: "typewriter",
        position: { x: "10%", y: "20%", width: "60%", height: "40%" },
        data: { text: "One brief.", style: "print", at: 0.2, speed: 16 },
        ...comp,
      }],
    } as any,
    components: [{ type: "typewriter", source: src }],
    brandKit: { colors: { background: "#f2efe7", text: "#17171c", primary: "#393bf5" }, fonts: [] } as any,
    canvas: { width: W, height: H } as any,
    gsapDir: path.resolve(__dirname, "../vendor/gsap"),
  } as any);
}

async function xAt(html: string, times: number[]): Promise<number[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dir-"));
  const p = path.join(dir, "scene.html");
  await fs.writeFile(p, html);
  const browser = await chromium.launch({
    ...(process.env.MP_CHROMIUM_PATH ? { executablePath: process.env.MP_CHROMIUM_PATH } : {}),
  });
  try {
    const page: Page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.goto(`file://${p}`, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 30_000 });
    const out: number[] = [];
    for (const t of times) {
      out.push(await page.evaluate((tt) => {
        (window as any).__MP_TIMELINE.pause(tt);
        const cam = document.querySelector(".mp-camera") as HTMLElement | null;
        const saved = cam ? cam.style.transform : null;
        if (cam) cam.style.transform = "none";          // measure content, not the rig
        const el = document.querySelector('.mp-component[data-cid="typewriter"]') as HTMLElement;
        const x = el.getBoundingClientRect().left;
        if (cam) cam.style.transform = saved as string;
        return x;
      }, t));
    }
    return out;
  } finally {
    await browser.close();
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("directed entrances actually move the subject", () => {
  // HOME is measured, not computed: the wrapper sits inside .mp-camera, which
  // is inset -20px and 40px wider than the frame, so "left: 10%" is 10% of the
  // RIG box offset by the inset -- not 10% of the viewport.
  let HOME = 0;
  it("measures the resting position with no entrance", async () => {
    [HOME] = await xAt(await scene({}), [3]);
    expect(HOME).toBeGreaterThan(0);
    expect(HOME).toBeLessThan(W);
  }, 300_000);

  it("slides in from the left edge and settles", async () => {
    const [early, settled] = await xAt(await scene({ enter: { effect: "slide-left", duration: 1 } }), [0.05, 3]);
    // Clear of its resting box to the LEFT at the top of the scene, home by
    // mid-scene. The offset is 115% of the ELEMENT's width, not the frame's,
    // so the check is relative to HOME rather than to the viewport edge.
    expect(HOME - early, `started at ${early}, home is ${HOME}`).toBeGreaterThan(600);
    expect(Math.abs(settled - HOME), `settled at ${settled}, home is ${HOME}`).toBeLessThan(2);
  }, 300_000);

  it("slides in from the right, the opposite direction", async () => {
    const [early] = await xAt(await scene({ enter: { effect: "slide-right", duration: 1 } }), [0.05]);
    expect(early - HOME, `started at ${early}, home is ${HOME}`).toBeGreaterThan(600);
  }, 300_000);

  it("leaves the frame on its exit", async () => {
    const [mid, end] = await xAt(await scene({ exit: { effect: "slide-left", duration: 0.8 } }), [1.5, DUR - 0.05]);
    expect(Math.abs(mid - HOME)).toBeLessThan(2);
    expect(HOME - end, `ended at ${end}, home is ${HOME}`).toBeGreaterThan(600);
  }, 300_000);

  it("ignores an effect the choreography cannot run", async () => {
    // Keeping an unknown effect would pose the element to nothing and it would
    // simply APPEAR -- the "a word that just shows up" defect the grammars
    // call out. It has to degrade to no entrance at all, not to a broken one.
    const [early, settled] = await xAt(await scene({ enter: { effect: "barrel-roll" } }), [0.05, 3]);
    expect(Math.abs(early - HOME), `an unknown effect moved the element`).toBeLessThan(2);
    expect(Math.abs(settled - HOME)).toBeLessThan(2);
  }, 300_000);
});

describe("the storyboard can reach the choreography", () => {
  it("offers enter/exit in the component schema", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf("components: {");
    const schema = src.slice(at, at + 2600);
    expect(schema).toMatch(/enter: \{ type: "string"/);
    expect(schema).toMatch(/exit: \{ type: "string"/);
    expect(schema).toMatch(/slide-left \| slide-right \| slide-up \| slide-down/);
  });

  it("does not drop enter/exit when normalizing components", async () => {
    // The same seam that once flattened scripted performances into bare type
    // strings. enter/exit ride ALONGSIDE data, so a normalizer that rebuilds
    // {type, data} silently loses them.
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf("Normalize entries to string");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 900);
    expect(body).toMatch(/c\.enter \? \{ enter: c\.enter \}/);
    expect(body).toMatch(/c\.exit \? \{ exit: c\.exit \}/);
  });

  it("maps them onto the built scene component", async () => {
    const src = await read("../src/llm/scene-generator.ts");
    expect(src).toMatch(/normalizeAnim\(\(c as any\)\.enter\)/);
    expect(src).toMatch(/normalizeAnim\(\(c as any\)\.exit\)/);
    // ...and refuses effects wrapperChoreoScript has no offset for.
    expect(src).toMatch(/CHOREO_EFFECTS/);
  });

  it("makes canvas-tour pair the directions across a boundary", async () => {
    const src = await read("../src/llm/storyboard-builder.ts");
    const at = src.indexOf('__g("canvas-tour")');
    const laws = src.slice(at, src.indexOf('__g("speaker-screencast")', at));
    expect(laws).toMatch(/THE CONTENT TRAVELS/);
    // The crossing belongs to the BEAT. Measured on proj_14767f06: the model
    // read "ONE ELEMENT CARRIES THE FILM" as licence to give the direction to
    // the carrier alone, so a cursor crossed five scenes of type that never
    // moved -- an object travelling over a static page, which is the exact
    // read the grammar exists to avoid.
    expect(laws).toMatch(/EVERY component in a scene except the surface carries the SAME "enter"/);
    expect(laws, "the carrier must not be read as the thing that moves")
      .toMatch(/the carrier does NOT own the direction/);
    expect(laws, "the opposite-edge pairing is the whole trick")
      .toMatch(/exits "slide-left" is arriving from the right/);
    // And it must stop selling the camera as the thing that joins scenes.
    expect(laws).toMatch(/THE CAMERA IS THE DEPTH, NOT THE EDIT/);
    expect(laws).toMatch(/cannot join two scenes/);
  });
});

// The behavioural tests above prove the ENGINE moves a component that carries
// an enter/exit -- which it always did. They pass a SceneComponent straight to
// assembleScene, so they say nothing about whether a STORYBOARD-authored
// direction survives the trip. That trip is the part that was broken, so it
// gets its own test against the real mapping function.
describe("a storyboard-authored direction survives into the built scene", () => {
  const build = async (comp: Record<string, unknown>) => {
    const { buildAuthoredCompositionScene } = await import("../src/llm/scene-generator.js");
    const draft: any = {
      label: "Place", duration_seconds: 6, purpose: "", visual_notes: "",
      components: [], beats: [],
    };
    const authored: any[] = [{ type: "typewriter", data: { text: "hi" }, ...comp }];
    const res = buildAuthoredCompositionScene("s1", draft, authored, {
      sceneIndex: 0, totalScenes: 2, brandKit: { colors: {}, fonts: [] },
      canvas: { width: 1280, height: 720 },
    } as any);
    return (res.scene.components || []).find((c: any) => c.type === "typewriter") as any;
  };

  it("carries a bare string direction through as an animation", async () => {
    const c = await build({ enter: "slide-right", exit: "slide-left" });
    expect(c.enter).toMatchObject({ effect: "slide-right" });
    expect(c.exit).toMatchObject({ effect: "slide-left" });
  });

  it("carries the full object form, clamped", async () => {
    const c = await build({ enter: { effect: "slide-up", duration: 99, at: -4 } });
    expect(c.enter.effect).toBe("slide-up");
    expect(c.enter.duration).toBeLessThanOrEqual(3);
    expect(c.enter.at).toBeGreaterThanOrEqual(0);
  });

  it("drops an effect the choreography has no offset for", async () => {
    // Keeping it would pose the element to nothing and it would simply appear.
    const c = await build({ enter: "barrel-roll" });
    expect(c.enter).toBeUndefined();
  });

  it("leaves a component with no direction untouched", async () => {
    const c = await build({});
    expect(c.enter).toBeUndefined();
    expect(c.exit).toBeUndefined();
  });
});
