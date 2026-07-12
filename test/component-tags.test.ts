import { describe, it, expect } from "vitest";
import { resolveComponentTags, buildComponentTimelineScript } from "../src/core/component-tags.js";

// Minimal component source for testing
const CHAT_COMPONENT = `
<template>
  <div class="chat-panel">
    <div class="chat-title">{{conversation_title}}</div>
    <div class="chat-messages"></div>
  </div>
</template>
<style scoped>
.chat-panel { background: #1e293b; border-radius: 12px; }
.chat-title { font-size: 14px; font-weight: 600; }
</style>
<script>
function createTimeline(el, data, ctx) {
  const tl = gsap.timeline();
  tl.from(el, { opacity: 0, y: 20, duration: 0.6 });
  return tl;
}
</script>
`;

const EDITOR_COMPONENT = `
<template>
  <div class="editor">
    <div class="toolbar">{{design_type}}</div>
    <div class="canvas-area"></div>
  </div>
</template>
<style scoped>
.editor { background: #fff; }
.toolbar { height: 48px; }
</style>
<script>
function createTimeline(el, data, ctx) {
  const tl = gsap.timeline();
  tl.from(el, { opacity: 0, duration: 0.5 });
  return tl;
}
</script>
`;

function buildSourceMap(): Map<string, string> {
  const map = new Map<string, string>();
  map.set("quotient-chat", CHAT_COMPONENT);
  map.set("canva-editor", EDITOR_COMPONENT);
  return map;
}

describe("resolveComponentTags", () => {
  it("resolves a single component tag", () => {
    const html = `<div class="scene"><component type="quotient-chat" data='{"conversation_title": "Test Chat"}' /></div>`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components).toHaveLength(1);
    expect(result.components[0].type).toBe("quotient-chat");
    expect(result.components[0].id).toBe("comp_0");
    expect(result.components[0].data).toEqual({ conversation_title: "Test Chat" });

    // HTML should contain the bound template
    expect(result.html).toContain("Test Chat");
    expect(result.html).toContain('data-comp-id="comp_0"');
    expect(result.html).toContain('data-comp-type="quotient-chat"');
    // Original <component> tag should be gone
    expect(result.html).not.toContain("<component");
  });

  it("resolves multiple component tags with auto-incrementing ids", () => {
    const html = `
      <div class="scene">
        <component type="quotient-chat" data='{"conversation_title": "Chat"}' />
        <component type="canva-editor" data='{"design_type": "social"}' />
      </div>
    `;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components).toHaveLength(2);
    expect(result.components[0].id).toBe("comp_0");
    expect(result.components[0].type).toBe("quotient-chat");
    expect(result.components[1].id).toBe("comp_1");
    expect(result.components[1].type).toBe("canva-editor");

    expect(result.html).toContain('data-comp-id="comp_0"');
    expect(result.html).toContain('data-comp-id="comp_1"');
  });

  it("uses explicit id when provided", () => {
    const html = `<component type="quotient-chat" id="my-chat" data='{}' />`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components[0].id).toBe("my-chat");
    expect(result.html).toContain('data-comp-id="my-chat"');
  });

  it("handles component tag without data attribute", () => {
    const html = `<component type="quotient-chat" />`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components).toHaveLength(1);
    expect(result.components[0].data).toEqual({});
  });

  it("preserves custom HTML around component tags", () => {
    const html = `
      <div class="custom-wrapper">
        <h1>My Custom Title</h1>
        <component type="quotient-chat" data='{}' />
        <div class="custom-overlay">Custom overlay content</div>
      </div>
    `;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.html).toContain("My Custom Title");
    expect(result.html).toContain("Custom overlay content");
    expect(result.html).toContain('data-comp-type="quotient-chat"');
  });

  it("handles unknown component type gracefully", () => {
    const html = `<component type="nonexistent-widget" data='{}' />`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components).toHaveLength(0);
    expect(result.html).toContain("not found");
  });

  it("handles component tag missing type attribute", () => {
    const html = `<component data='{}' />`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components).toHaveLength(0);
    expect(result.html).toContain("missing type");
  });

  it("generates scoped CSS for each component", () => {
    const html = `<component type="quotient-chat" data='{}' />`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components[0].scopedCss).toContain('[data-cid="comp_0"]');
    expect(result.components[0].scopedCss).toContain(".chat-panel");
  });

  it("passes extra class and style to wrapper", () => {
    const html = `<component type="quotient-chat" class="left-panel" style="width:50%" data='{}' />`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.html).toContain("left-panel");
    expect(result.html).toContain('style="width:50%"');
  });

  it("handles open/close component tag form", () => {
    const html = `<component type="quotient-chat" data='{"conversation_title": "Test"}'></component>`;
    const result = resolveComponentTags(html, buildSourceMap());

    expect(result.components).toHaveLength(1);
    expect(result.html).toContain("Test");
  });
});

describe("buildComponentTimelineScript", () => {
  it("returns empty string for no components", () => {
    const result = buildComponentTimelineScript([], 10, { width: 1920, height: 1080 });
    expect(result).toBe("");
  });

  it("generates timeline registration for components", () => {
    const html = `<component type="quotient-chat" data='{}' />`;
    const resolved = resolveComponentTags(html, buildSourceMap());

    const script = buildComponentTimelineScript(
      resolved.components,
      10,
      { width: 1920, height: 1080 },
    );

    expect(script).toContain("__componentTimelines");
    expect(script).toContain("createTimeline_comp_0");
    expect(script).toContain("__getComponentTimeline");
    expect(script).toContain('data-comp-id="comp_0"');
  });
});

describe("quote-aware tag matching + broken-tag detection", () => {
  it("a '>' inside a quoted data value does not truncate the tag", () => {
    // The observed live failure: JSON containing markup ("</div>") ended the
    // tag at the first '>', binding empty data and leaking the JSON tail.
    const html = `<component type="quotient-chat" data='{"conversation_title": "a <b>bold</b> title"}' />`;
    const result = resolveComponentTags(html, buildSourceMap());
    expect(result.components).toHaveLength(1);
    expect(result.components[0].data.conversation_title).toBe("a <b>bold</b> title");
    expect(result.html).not.toContain("' />");
  });

  it("findBrokenComponentTags flags invalid JSON from an apostrophe-broken attribute", async () => {
    const { findBrokenComponentTags } = await import("../src/llm/agentic-codegen.js");
    const tpl = `<component type="quotient-chat" data='{"title": "Marc's LinkedIn"}' />`;
    const v = findBrokenComponentTags({ template: tpl });
    expect(v.length).toBeGreaterThan(0);
  });

  it("findBrokenComponentTags flags a dangling }' /> leak", async () => {
    const { findBrokenComponentTags } = await import("../src/llm/agentic-codegen.js");
    const tpl = `<div class="plane">"\n}' />\n</div>`;
    const v = findBrokenComponentTags({ template: tpl });
    expect(v.some((x) => x.includes("dangling"))).toBe(true);
  });

  it("findBrokenComponentTags passes clean tags", async () => {
    const { findBrokenComponentTags } = await import("../src/llm/agentic-codegen.js");
    const tpl = `<component type="quotient-chat" data='{"title": "Marc’s LinkedIn"}' />`;
    expect(findBrokenComponentTags({ template: tpl })).toHaveLength(0);
  });
});

describe("findOrphanTimelineCode", () => {
  it("flags beats appended after createTimeline closed (the tl-is-not-defined class)", async () => {
    const { findOrphanTimelineCode } = await import("../src/llm/agentic-codegen.js");
    const script = `
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  tl.to('.a', { x: 10 }, 0);
  return tl;
}

  // BEAT 3 landed outside the function
  tl.addLabel('beat3', 2.1);
  tl.to('.b', { opacity: 1 }, 'beat3');
`;
    const v = findOrphanTimelineCode({ script });
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("closes too early");
  });

  it("does not flag helpers that take tl as a parameter after the function", async () => {
    const { findOrphanTimelineCode } = await import("../src/llm/agentic-codegen.js");
    const script = `
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  moveCursor(tl, el, 1);
  return tl;
}
function moveCursor(tl, el, at) {
  tl.to(el, { x: 5 }, at);
  tl.to(el, { scale: 1 }, at + 0.1);
}
`;
    expect(findOrphanTimelineCode({ script })).toHaveLength(0);
  });

  it("ignores tl mentions inside strings and comments after the close", async () => {
    const { findOrphanTimelineCode } = await import("../src/llm/agentic-codegen.js");
    const script = `
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  return tl;
}
// tl.addLabel in a comment is fine
var note = "tl.to is just text";
`;
    expect(findOrphanTimelineCode({ script })).toHaveLength(0);
  });
});

describe("wrapperChoreoScript (SPEC-motion-architecture L4 lane)", () => {
  it("emits pose set + enter/exit tweens for declared components only", async () => {
    const { wrapperChoreoScript } = await import("../src/core/scene-assembler.js");
    const js = wrapperChoreoScript(
      [
        { id: "slack", type: "slack-workspace", data: {},
          pose: { rotate_y: -15 },
          enter: { effect: "slide-left", duration: 0.8 },
          exit: { effect: "slide-right", at: 16.6 } } as any,
        { id: "bg", type: "webgl-backdrop", data: {} } as any,
      ],
      18,
    );
    expect(js).toContain('"cid":"slack"');
    expect(js).not.toContain('"cid":"bg"');
    expect(js).toContain('"rotate_y":-15');
    expect(js).toContain("slide-left");
    expect(js).toContain("master.fromTo");
    expect(js).toContain("master.to");
  });

  it("returns empty string when nothing declares choreography", async () => {
    const { wrapperChoreoScript } = await import("../src/core/scene-assembler.js");
    expect(wrapperChoreoScript([{ id: "a", type: "x", data: {} } as any], 10)).toBe("");
  });

  it("namespaces cids for the composite", async () => {
    const { wrapperChoreoScript } = await import("../src/core/scene-assembler.js");
    const js = wrapperChoreoScript(
      [{ id: "slack", type: "slack-workspace", data: {}, enter: { effect: "fade" } } as any],
      10, "scene_002__",
    );
    expect(js).toContain('"cid":"scene_002__slack"');
  });
});

describe("cameraMovesScript anchors", () => {
  it("embeds anchor resolution and function-based tween values", async () => {
    const { cameraMovesScript } = await import("../src/core/scene-assembler.js");
    const js = cameraMovesScript(
      [{ at: 1.4, type: "zoom", anchor: "slack.composer", scale: 1.8 } as any,
       { at: 4.6, type: "reset" } as any],
      { width: 1920, height: 1080 }, "document.body", "window.__MP_TIMELINE",
    );
    expect(js).toContain("anchorBox");
    expect(js).toContain("data-anchor");
    expect(js).toContain("m.anchor ? ''");
  });
});

describe("backdrop exclusion from the camera rig", () => {
  it("cameraMovesScript skips data-mp-backdrop children when building the scene rig", async () => {
    const { cameraMovesScript, BACKDROP_TYPES } = await import("../src/core/scene-assembler.js");
    expect(BACKDROP_TYPES.has("webgl-backdrop")).toBe(true);
    const js = cameraMovesScript(
      [{ at: 1, type: "zoom", anchor: "slack.composer" } as any],
      { width: 1920, height: 1080 }, "document.body", "window.__MP_TIMELINE",
    );
    expect(js).toContain("data-mp-backdrop");
  });
});
