import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// STOCK LOCATIONS (core/stock-locations.ts): eleven ready-made places -- real
// photos, each credited -- every workspace can pick in Studio's shot step; picking one copies its plate into
// the tenant's library once, so a scene names it like any other location.

const DATA = path.join(os.tmpdir(), `mp-stockloc-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

describe("stock locations", () => {
  it("eleven real photos, each with its committed plate and its credit", async () => {
    const { STOCK_LOCATIONS, stockLocationFile } = await import("../src/core/stock-locations.js");
    expect(STOCK_LOCATIONS).toHaveLength(11);
    expect(new Set(STOCK_LOCATIONS.map((s) => s.id)).size).toBe(11);
    for (const s of STOCK_LOCATIONS) {
      expect((await fs.stat(stockLocationFile(s.id))).size).toBeGreaterThan(10000);
      expect(s.credit.url).toMatch(/^https:\/\/www\.pexels\.com\/photo\//);
    }
  });

  it("picking one copies it into the library once; an unknown one is refused", async () => {
    const { addStockLocation, listLocations, locationImage } = await import("../src/core/locations.js");
    const a = await addStockLocation("t", "living-room");
    expect(a).toMatchObject({ name: "Living room", stock: "living-room", made_from: "upload" });
    expect((await fs.stat(await locationImage("t", a.id))).size).toBeGreaterThan(10000);
    const again = await addStockLocation("t", "living-room");
    expect(again.id).toBe(a.id);
    expect((await listLocations("t")).filter((l) => l.stock === "living-room")).toHaveLength(1);
    await expect(addStockLocation("t", "moon-base")).rejects.toThrow(/No stock location/);
  }, 30000);

  it("a copy of the old drawn set takes the real photo in place, keeping its id and name", async () => {
    const { addStockLocation, refreshStockLocations, listLocations, locationImage } = await import("../src/core/locations.js");
    const { stockLocationFile, STOCK_REV } = await import("../src/core/stock-locations.js");
    const a = await addStockLocation("t2", "kitchen");
    expect(a.stock_rev).toBe(STOCK_REV);
    expect(await refreshStockLocations("t2")).toBe(0);              // nothing stale
    // Make it look like an Oct 7 copy: no stock_rev, a renamed drawn plate.
    const file = path.join(DATA, "t2", "locations", "locations.json");
    const list = JSON.parse(await fs.readFile(file, "utf8"));
    list[0].name = "Our kitchen"; delete list[0].stock_rev;
    await fs.writeFile(file, JSON.stringify(list));
    const plate = await locationImage("t2", a.id);
    await fs.writeFile(plate, Buffer.alloc(100));
    expect(await refreshStockLocations("t2")).toBe(1);
    const [now] = await listLocations("t2");
    expect(now).toMatchObject({ id: a.id, name: "Our kitchen", stock: "kitchen", stock_rev: STOCK_REV });
    expect((await fs.stat(plate)).size).toBeGreaterThan(10000);
    expect((await fs.stat(stockLocationFile("kitchen"))).size).toBeGreaterThan(10000);
  }, 30000);
});
