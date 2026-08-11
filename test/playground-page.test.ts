import { describe, it, expect } from "vitest";
import { getPlaygroundHtml } from "../src/playground-app/playground-app.js";

// The Playground page is ONE template literal, same construction as the
// Studio page (test/studio-page.test.ts) -- and it bricked the same way:
// regex literals written with single backslashes (\s, \(, \{) had them
// eaten by the template literal, and one of them reached the browser as
// /runScripts*([^)]*,s*{([^}]+)}/ -- an unterminated group. That is a
// SyntaxError at script parse, so the ENTIRE playground died: no tenant
// components, no preview, nothing. Parse the script the way the browser
// will, so the next backslash casualty fails here instead of in prod.

describe("the playground page's client script", () => {
  const html = getPlaygroundHtml();

  it("parses as JavaScript (a syntax error bricks the whole playground)", () => {
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length, "no inline <script> found -- extraction is broken").toBeGreaterThan(0);
    for (const src of scripts) {
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

  it("keeps the regexes that survived the literal intact (\\s reached the page, not s)", () => {
    // The emitted page must carry REAL backslashes in its regex literals.
    expect(html).toContain("runScript\\s*\\(");
    expect(html).toContain("data\\.([a-zA-Z_]");
  });

  it("fetches the tenant component schema so captured components get a form", () => {
    expect(html).toContain("/schema");
    expect(html).toMatch(/tenant-components[^\n]*schema/);
  });

  it("tracks unsaved changes: dirty flag, leave guards, instant form learning", () => {
    expect(html).toContain("dirty-flag");
    expect(html).toContain("Unsaved changes");
    expect(html).toContain("beforeunload");
    expect(html).toContain("confirmDiscard");
    // The client-side field derivation must reach the browser with REAL
    // backslashes (the template literal eats single ones).
    expect(html).toContain("\\bdata\\.([a-zA-Z_]");
  });
});
