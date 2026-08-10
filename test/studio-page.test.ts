import { describe, it, expect } from "vitest";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";

// The Studio page is ONE template literal: HTML, CSS and the whole client
// <script> evaluated server-side. Two consequences this suite pins down:
//
// 1. A single syntax error in the client script bricks the ENTIRE studio --
//    the "Loading..." shell never hydrates and every project link appears
//    stuck. That shipped once: an inline onerror handler written as
//    display=\'none\' had its backslashes eaten by the template literal,
//    reaching the browser as display='none' inside a single-quoted string.
//    No unit test noticed because nothing ever PARSED the page's script.
// 2. The fix class matters more than the fix: parse the script the way the
//    browser will, so any future quote collision fails here, not in prod.

describe("the studio page's client script", () => {
  const html = getPreviewHtml();

  it("parses as JavaScript (a syntax error bricks the whole studio)", () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length, "no inline <script> found -- extraction is broken").toBeGreaterThan(0);
    for (const src of scripts) {
      // new Function parses without executing -- exactly the browser's first step.
      expect(() => new Function(src)).not.toThrow();
    }
  });

  it("keeps inline event handlers quote-free (the template literal eats backslash escapes)", () => {
    const handlers = [...html.matchAll(/\son[a-z]+="([^"]*)"/g)].map((m) => m[1]);
    for (const h of handlers) {
      expect(h, `inline handler needs a quote the attribute cannot safely carry: ${h}`)
        .not.toMatch(/['\\]/);
    }
  });

  it("leads the storyboard draft cards with the scene still", () => {
    expect(html).toMatch(/dv-still/);
    expect(html).toMatch(/storyboard_card_scene_/);
  });
});
