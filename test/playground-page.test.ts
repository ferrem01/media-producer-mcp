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

  it("extracts real captured values from binds that wrap NESTED markup", () => {
    // Marc's JSON tab opened as {} because the old placeholder regex demanded
    // text directly after the bind's ">" -- captured LinkedIn markup nests
    // its text inside span-soup. Extract the derivation functions from the
    // emitted page and EXECUTE them, so the walker (and its template-literal
    // escaping) is proven against exactly what the browser runs.
    const extractFunction = (name: string): string => {
      const start = html.indexOf(`function ${name}(`);
      expect(start, `function ${name} not found in page`).toBeGreaterThan(-1);
      let depth = 0;
      for (let i = html.indexOf("{", start); i < html.length; i++) {
        const c = html[i];
        if (html[i - 1] === "\\") continue; // \{ in a regex literal is not a block
        if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) return html.slice(start, i + 1);
        }
      }
      throw new Error(`unbalanced braces extracting ${name}`);
    };
    const derive = new Function(
      `${extractFunction("bindInnerText")}; ${extractFunction("deriveFieldsFromSource")}; return deriveFieldsFromSource;`,
    )() as (source: string) => Record<string, { placeholder?: string }>;

    const source = [
      '<div class="post">',
      '  <span data-bind="author_name" style="font-weight:600"><span dir="ltr"><span aria-hidden="true">Gina Kleiner</span></span></span>',
      '  <span data-bind="author_headline"><span aria-hidden="true"></span><span>Chief of Staff at Quotient</span></span>',
      '  <p data-bind="post_text">We just shipped <strong>something big</strong> today.</p>',
      '  <span data-bind="avatar_shot"><img src="data:image/png;base64,AAAA"></span>',
      '  <span data-bind="name_direct">Direct text</span><span>NOT part of the bind</span>',
      "</div>",
    ].join("\n");
    const fields = derive(source);

    expect(fields.author_name.placeholder).toBe("Gina Kleiner"); // two levels deep
    // The old regex's exact failure: first child is an EMPTY element.
    expect(fields.author_headline.placeholder).toBe("Chief of Staff at Quotient");
    expect(fields.post_text.placeholder).toBe("We just shipped something big today.");
    expect(fields.avatar_shot.placeholder).toBeUndefined(); // media-only bind: nothing to prefill
    expect(fields.name_direct.placeholder).toBe("Direct text"); // stops at the close, no sibling leak
  });

  it("chat edits land VALUED: the JSON gains the real text at edit time, not next load", () => {
    expect(html).toContain("New content fields arrive VALUED");
    expect(html).toContain("Preview, form, JSON and source all reflect the change");
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
