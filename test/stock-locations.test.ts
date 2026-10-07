import { describe, it, expect, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// STOCK LOCATIONS (core/stock-locations.ts): nine ready-made places every
// workspace can pick in Studio's shot step; picking one copies its plate into
// the tenant's library once, so a scene names it like any other location.

const DATA = path.join(os.tmpdir(), `mp-stockloc-${process.pid}`);
process.env.MP_DATA_DIR = DATA;
afterAll(async () => { await fs.rm(DATA, { recursive: true, force: true }); });

describe("stock locations", () => {
  it("nine places, each with its committed plate", async () => {
    const { STOCK_LOCATIONS, stockLocationFile } = await import("../src/core/stock-locations.js");
    expect(STOCK_LOCATIONS).toHaveLength(9);
    expect(new Set(STOCK_LOCATIONS.map((s) => s.id)).size).toBe(9);
    for (const s of STOCK_LOCATIONS) expect((await fs.stat(stockLocationFile(s.id))).size).toBeGreaterThan(10000);
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
});
