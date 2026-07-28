import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureLayout } from "../src/core/layout-metrics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The two codegen failure classes Marc caught on proj_7a10fbc1 that no gate
// measured: real content hanging below the canvas edge (the clipped "Start
// free" CTA card) and unrelated text elements landing on each other (the
// ghost breadcrumb / campaign-chip collision). Both are now blocking,
// deterministically measured defects. Requires a browser (MP_CHROMIUM_PATH
// in constrained envs), same as the render suites.

const W = 1920, H = 1080;

function page(body: string): string {
  return `<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:0;width:${W}px;height:${H}px;background:#fafaf8;overflow:hidden;position:relative}
    div,button{position:absolute;font-family:sans-serif}
  </style></head><body>${body}
  <script>window.__MP_TIMELINE={time:function(){}};window.__MP_READY=true;</script>
  </body></html>`;
}

async function gate(body: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "layout-gate-"));
  const htmlPath = path.join(dir, "scene.html");
  await fs.writeFile(htmlPath, page(body));
  try {
    return await measureLayout({ htmlPath, width: W, height: H, atTimes: [1, 2] });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

describe("off-canvas content gate", () => {
  it("flags a CTA card + button hanging past the bottom edge", async () => {
    const defects = await gate(`
      <div style="left:200px;top:80px;width:1400px;height:700px;background:#fff;font-size:40px;padding:20px">HIRE YOUR MARKETING TEAM</div>
      <div style="left:660px;top:950px;width:600px;height:300px;background:#e8e8f4;font-size:32px">Start free</div>
      <button style="left:800px;top:1120px;width:320px;height:64px;font-size:20px">Start free trial</button>
    `);
    const off = defects.filter((d) => d.type === "off_canvas_content");
    expect(off.length).toBeGreaterThanOrEqual(1);
    expect(off.some((d) => d.detail.includes("bottom"))).toBe(true);
  }, 120000);

  it("does not flag fully-on-canvas content or oversized backdrop layers", async () => {
    const defects = await gate(`
      <div style="left:-100px;top:-100px;width:2120px;height:1280px;background:linear-gradient(#eee,#ddd)"></div>
      <div style="left:200px;top:200px;width:1500px;height:600px;background:#fff;font-size:40px">All inside the frame</div>
      <button style="left:800px;top:860px;width:320px;height:64px;font-size:20px">Start free trial</button>
    `);
    expect(defects.filter((d) => d.type === "off_canvas_content")).toHaveLength(0);
  }, 120000);
});

describe("text-collision gate", () => {
  it("flags two unrelated text elements stacked on each other", async () => {
    const defects = await gate(`
      <div style="left:900px;top:150px;width:640px;height:56px;font-size:24px;color:#333">Free Trial Launch &middot; Brief Tasks Activation</div>
      <div style="left:960px;top:158px;width:420px;height:44px;font-size:22px;color:#fff;background:#4b4ef0">Free trial campaign done</div>
      <div style="left:200px;top:400px;width:1200px;height:400px;background:#fff;font-size:40px">Body content panel</div>
    `);
    const col = defects.filter((d) => d.type === "text_collision");
    expect(col.length).toBeGreaterThanOrEqual(1);
    expect(col[0].detail).toContain("collides");
  }, 120000);

  it("never flags nested (ancestor/descendant) text -- normal document flow", async () => {
    const defects = await gate(`
      <div style="left:300px;top:300px;width:1300px;height:500px;background:#fff;font-size:40px">Card title
        <div style="left:40px;top:120px;width:800px;height:60px;font-size:24px">A caption inside the same card</div>
      </div>
    `);
    expect(defects.filter((d) => d.type === "text_collision")).toHaveLength(0);
  }, 120000);
});

describe("tempo-cut deterministic beats (source guards)", () => {
  it("storyboard contract names the deterministic payoff, template close, and objects-not-strings rule", async () => {
    const sb = await fs.readFile(path.resolve(__dirname, "../src/llm/storyboard-builder.ts"), "utf-8");
    expect(sb).toContain("THE PAYOFF BEAT is deterministic");
    expect(sb).toContain("THE CLOSE is a template");
    expect(sb).toContain("OBJECTS, NOT STRINGS");
  });

  it("pipeline maps the new defect types to critique issues", async () => {
    const p = await fs.readFile(path.resolve(__dirname, "../src/llm/pipeline.ts"), "utf-8");
    expect(p).toContain("off_canvas_content");
    expect(p).toContain("text_collision");
  });
});
