import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComponentCatalog, formatCatalogForPrompt, itemShape } from "../src/llm/catalog.js";

// The storyboard writer sees the component library as a catalog. A list of
// objects used to print as `array<object>` -- the writer never saw the
// fields and guessed them (a kanban with "name" columns and {title,
// subtitle} cards rendered "undefined" headers and "[object Object]", live on
// proj_de974ad1). Eight schemas also declared their items malformed.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(__dirname, "../src/components");

describe("the catalog shows what goes inside a list", () => {
  it("prints an array of objects with its fields", () => {
    expect(itemShape({ type: "string" })).toBe("string");
    expect(itemShape({ type: "object", properties: { title: { type: "string" }, cards: { type: "array", items: { type: "string" } } } }))
      .toBe("{title: string, cards: array<string>}");
    expect(itemShape({ type: "object", properties: { kind: { type: "string", enum: ["a", "b"] } } })).toBe('{kind: "a"|"b"}');
  });

  it("the real catalog carries kanban's column shape to the writer", async () => {
    const catalog = await buildComponentCatalog(LIB);
    const text = formatCatalogForPrompt(catalog);
    expect(text).toContain("columns: array<{title: string, cards: array<string>}>");
    expect(text).not.toContain("array<undefined>");
  });

  it("every schema declares its array items properly", async () => {
    const bad: string[] = [];
    const walk = (node: any, where: string) => {
      if (!node || typeof node !== "object") return;
      if (node.type === "array" && node.items && typeof node.items === "object" && !node.items.type && !node.items.properties) {
        if (Object.values(node.items).some((v: any) => v && typeof v === "object" && "type" in v)) bad.push(where);
      }
      for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
    };
    for (const cat of await fs.readdir(LIB)) {
      const dir = path.join(LIB, cat);
      if (!(await fs.stat(dir)).isDirectory()) continue;
      for (const f of await fs.readdir(dir)) {
        if (!f.endsWith(".schema.json")) continue;
        walk(JSON.parse(await fs.readFile(path.join(dir, f), "utf-8")).data, `${cat}/${f}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("kanban tolerates the variants a writer reaches for", async () => {
    const src = await fs.readFile(path.join(LIB, "mockups/kanban-board.component.html"), "utf-8");
    expect(src).toContain("columns[i].title || columns[i].name || columns[i].label");
    expect(src).toMatch(/cards\[c\]\.title \|\| cards\[c\]\.name/);
  });
});
