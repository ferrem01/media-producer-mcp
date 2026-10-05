import { describe, it, expect } from "vitest";
import { getCastHtml, getLocationsHtml } from "../src/cast-page.js";
import { railHtml } from "../src/preview-app/home-shell.js";

// CAST and LOCATIONS are the tenant's libraries, in the rail beside Team and
// Brand (Marc, Oct 5): a film picks from them, it never manages them.
describe("the Cast and Locations pages", () => {
  it("are in the rail, and each page marks its own item", () => {
    const rail = railHtml("films");
    expect(rail).toContain('id="nav-cast"');
    expect(rail).toContain('id="nav-locations"');
    expect(getCastHtml()).toContain('class="rail-item on" id="nav-cast"');
    expect(getLocationsHtml()).toContain('class="rail-item on" id="nav-locations"');
  });
  it("Cast adds a generated person (portrait + sheet), a real person (consent) or a HeyGen look, and sets each actor's voice", () => {
    const h = getCastHtml();
    expect(h).toContain("body.fictional = true; else body.consent = true;");
    expect(h).toContain("if (sheetRel) body.sheet = sheetRel;");
    expect(h).toContain("'/api/upload-asset/' + enc(tenant) + '/library?name='");
    expect(h).toContain("'/api/heygen-avatars/' + enc(tenant) + (t === 'looks' ? '?looks=1' : '?public=1')");
    expect(h).toContain("patch(a, { voice_id: id, voice_name: v ? v.name : '' }");
  });
  it("Locations draws a plate from a description or cleans a photo, and shows drawing ones until they land", () => {
    const h = getLocationsHtml();
    expect(h).toContain("make({ name: name, prompt: p, shape: $('lShape').value }");
    expect(h).toContain("make({ name: name, image: rel, clean: clean }");
    expect(h).toContain("if (locs.some(function (l) { return l.status === 'drawing'; })) timer = setTimeout(load, 3000);");
  });
});
