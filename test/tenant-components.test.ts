import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listTenantComponents, readTenantComponent } from "../src/core/tenant-components.js";

let root: string;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tenant-comps-"));
  // A web capture: html flat at the root, schema + reference under captured/.
  await fs.mkdir(path.join(root, "captured"), { recursive: true });
  await fs.writeFile(path.join(root, "lead-score-rules.component.html"), "<template><div>rules</div></template>");
  await fs.writeFile(path.join(root, "captured", "lead-score-rules.schema.json"), JSON.stringify({
    label: "Lead Score Rules", description: "Captured from app", capture: { source_url: "https://app.example/score", captured_at: "2026-10-21T00:00:00Z", width: 1200, height: 800 },
  }));
  await fs.writeFile(path.join(root, "captured", "lead-score-rules.capture-ref.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  // A playground save: html + schema in a category dir.
  await fs.mkdir(path.join(root, "custom"), { recursive: true });
  await fs.writeFile(path.join(root, "custom", "promo-card.component.html"), "<template><div>promo</div></template>");
  await fs.writeFile(path.join(root, "custom", "promo-card.schema.json"), JSON.stringify({ label: "Promo", description: "A card" }));
});

afterAll(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe("tenant components", () => {
  it("lists captures and saves with their schema facts", async () => {
    const list = await listTenantComponents("t", root);
    expect(list.map((c) => c.type)).toEqual(["lead-score-rules", "promo-card"]);
    expect(list[0]).toMatchObject({ category: "captured", label: "Lead Score Rules", source_url: "https://app.example/score", width: 1200, height: 800 });
    expect(list[1]).toMatchObject({ category: "custom", label: "Promo", description: "A card" });
  });

  it("opens a capture with its source, schema and reference screenshot", async () => {
    const c = await readTenantComponent("t", "lead-score-rules", root);
    expect(c?.source).toContain("rules");
    expect(c?.schema?.label).toBe("Lead Score Rules");
    expect(c?.refPath).toBe(path.join(root, "captured", "lead-score-rules.capture-ref.png"));
  });

  it("opens a playground save from its category dir, without a reference", async () => {
    const c = await readTenantComponent("t", "promo-card", root);
    expect(c?.category).toBe("custom");
    expect(c?.refPath).toBeUndefined();
  });

  it("refuses unknown and path-like types", async () => {
    expect(await readTenantComponent("t", "nope", root)).toBeNull();
    expect(await readTenantComponent("t", "../custom/promo-card", root)).toBeNull();
  });
});
