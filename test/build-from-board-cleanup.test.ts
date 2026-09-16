import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFile(path.resolve(__dirname, rel), "utf-8");

// Building an approved board runs the pipeline in a WORKING COPY (a fresh
// project dir) and copies the result back onto the board's project. The copy
// used to linger as a duplicate "generated" project in the tenant's list --
// one stray twin per build (measured live on proj_9e650f1a: proj_0c242038,
// proj_2c64fefc). Now every reference into the copy is retargeted to the
// original, the copy is removed once its files are over, and the job's
// result carries the project the caller asked to build.
describe("build-from-board leaves no working copy behind", () => {
  it("retargets scenes, assets and the speaker track, removes the copy, and returns the original", async () => {
    const server = await read("../src/server.ts");
    const block = server.slice(server.indexOf("const generatedProject = (pipelineResult as any)?.project;"), server.indexOf("// Pipeline wrote to the same project"));
    expect(block).toMatch(/const retarget = <T,>\(v: T\): T => v === undefined \? v\s*: JSON\.parse\(JSON\.stringify\(v\)\.split\(`\/projects\/\$\{newProjectId\}\/`\)\.join\(`\/projects\/\$\{projectId\}\/`\)\);/);
    expect(block).toMatch(/origProject\.scenes = retarget\(generatedProject\.scenes\);/);
    expect(block).toMatch(/origProject\.assets = retarget\(generatedProject\.assets\);/);
    expect(block).toMatch(/origProject\.speaker_track = retarget\(generatedProject\.speaker_track\);/);
    // Removed only when every subdir copied; a failed copy keeps it (loud).
    expect(block).toMatch(/if \(copyFailed\) \{[\s\S]*?keeping the working copy[\s\S]*?\} else \{\s*await deleteProject\(tenantId, newProjectId\);/);
    expect(block).toMatch(/\(pipelineResult as any\)\.project = origProject;/);
  });

  it("the retarget rewrites every reference into the copy's project dir and nothing else", () => {
    const newProjectId = "proj_copy0001", projectId = "proj_orig0001";
    const retarget = <T,>(v: T): T => v === undefined ? v
      : JSON.parse(JSON.stringify(v).split(`/projects/${newProjectId}/`).join(`/projects/${projectId}/`));
    const scenes = [{ components: [{ data: { src: "/assets/t/projects/proj_copy0001/assets/broll.png", other: "/assets/t/projects/proj_other/x.png" } }] }];
    expect(retarget(scenes)[0].components[0].data).toEqual({ src: "/assets/t/projects/proj_orig0001/assets/broll.png", other: "/assets/t/projects/proj_other/x.png" });
    expect(retarget(undefined)).toBeUndefined();
  });
});
