import { describe, it, expect } from "vitest";
import { getPhoneStudioHtml } from "../src/studio-phone.js";

// The phone Studio's Cast card: the desktop card, compact -- who performs,
// recast or generate, the actor, the vendor, the voice.

describe("phone Studio: the Cast card", () => {
  const html = getPhoneStudioHtml();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];

  it("the page script parses", () => {
    expect(() => new Function(script)).not.toThrow();
  });

  it("a Cast button on built speaker films opens the card; it recasts, generates (on a copy by default) and puts you back", () => {
    expect(html).toContain('<div id="cast"></div>');
    expect(html).toContain("castB.textContent = 'Cast'");
    expect(html).toContain("api('POST', '/recast/' + castTP(), { actor: a.id, performer: p.id,");
    expect(html).toContain("api('POST', '/recast/' + castTP(), { actor: null })");
    expect(html).toContain("'/generated-take/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(pid)");
    expect(html).toContain("copy: true");
    expect(html).toContain("'&cast=1'");
    expect(html).toContain("if (qp.get('cast')) { C.open = true; castLoad(); }");
  });
});
