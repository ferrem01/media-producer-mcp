import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  sceneCacheKey,
  getCachedSceneMp4,
  putCachedSceneMp4,
} from "../src/core/scene-cache.js";
import type { Project } from "../src/core/types.js";

function makeProject(overrides: Partial<any> = {}): Project {
  return {
    project_id: "proj_cachetest",
    tenant_id: "tenant_cachetest",
    name: "cache test",
    format: "video",
    status: "generated",
    canvas: { width: 1920, height: 1080, preset: "landscape", fps: 30 },
    brand_kit: { colors: { primary: "#393bf5" } },
    scenes: [
      {
        id: "s1",
        label: "scene one",
        duration_seconds: 5,
        components: [
          { id: "a", type: "kinetic-text", data: { text: "hello" } },
        ],
      },
    ],
    ...overrides,
  } as unknown as Project;
}

const SOURCES = [{ type: "kinetic-text", source: "<template>x</template>" }];

describe("scene-cache", () => {
  let libDir: string;

  beforeEach(async () => {
    libDir = await fs.mkdtemp(path.join(os.tmpdir(), "scache-lib-"));
    await fs.mkdir(path.join(libDir, "shared"), { recursive: true });
    await fs.writeFile(path.join(libDir, "shared", "atmosphere.js"), "// v1");
  });

  afterEach(async () => {
    await fs.rm(libDir, { recursive: true, force: true });
  });

  it("key is stable for identical inputs", async () => {
    const p = makeProject();
    const k1 = await sceneCacheKey(p, 0, SOURCES, libDir);
    const k2 = await sceneCacheKey(p, 0, SOURCES, libDir);
    expect(k1).toBe(k2);
  });

  it("key changes when scene data, fps, brand kit, component source, or shared runtime change", async () => {
    const base = await sceneCacheKey(makeProject(), 0, SOURCES, libDir);

    const edited = makeProject();
    (edited.scenes[0].components[0].data as any).text = "goodbye";
    expect(await sceneCacheKey(edited, 0, SOURCES, libDir)).not.toBe(base);

    const fps = makeProject({ canvas: { width: 1920, height: 1080, preset: "landscape", fps: 15 } });
    expect(await sceneCacheKey(fps, 0, SOURCES, libDir)).not.toBe(base);

    const brand = makeProject({ brand_kit: { colors: { primary: "#ff0000" } } });
    expect(await sceneCacheKey(brand, 0, SOURCES, libDir)).not.toBe(base);

    const src = [{ type: "kinetic-text", source: "<template>CHANGED</template>" }];
    expect(await sceneCacheKey(makeProject(), 0, src, libDir)).not.toBe(base);

    await fs.writeFile(path.join(libDir, "shared", "atmosphere.js"), "// v2");
    expect(await sceneCacheKey(makeProject(), 0, SOURCES, libDir)).not.toBe(base);
  });

  it("put/get roundtrip and prune of stale keys", async () => {
    const p = makeProject();
    const dataDir = process.env.MP_DATA_DIR;
    // projectDir derives from config captured at import; write under whatever
    // it resolves to and clean up after.
    const mp4 = path.join(libDir, "fake.mp4");
    await fs.writeFile(mp4, "not-really-mp4");

    expect(await getCachedSceneMp4(p, "s1", "aaa")).toBeNull();

    await putCachedSceneMp4(p, "s1", "aaa", mp4);
    const hitA = await getCachedSceneMp4(p, "s1", "aaa");
    expect(hitA).toBeTruthy();

    // New key for the same scene prunes the old entry.
    await putCachedSceneMp4(p, "s1", "bbb", mp4);
    expect(await getCachedSceneMp4(p, "s1", "bbb")).toBeTruthy();
    expect(await getCachedSceneMp4(p, "s1", "aaa")).toBeNull();

    // Cleanup the tenant dir this test created.
    if (hitA) {
      await fs.rm(path.dirname(path.dirname(path.dirname(hitA))), { recursive: true, force: true }).catch(() => {});
    }
    void dataDir;
  });
});
