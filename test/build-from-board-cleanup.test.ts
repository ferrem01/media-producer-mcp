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

describe("the board stays editable after the build", () => {
  it("storyboard redrafts and per-scene edits are allowed on generated and rendered projects, locked only in flight or failed", async () => {
    const fs = await import("node:fs/promises");
    const server = await fs.readFile(new URL("../src/server.ts", import.meta.url), "utf-8");
    expect(server).toMatch(/const EDITABLE_BOARD_STATES = new Set<string>\(\["storyboard", "draft", "generated", "rendered"\]\);/);
    expect(server).toMatch(/if \(!EDITABLE_BOARD_STATES\.has\(existingProject\.status\)\) \{/);
    expect(server).toMatch(/if \(!EDITABLE_BOARD_STATES\.has\(project\.status\)\) \{/);
    expect(server).not.toMatch(/project's DRAFT storyboard \(project status 'storyboard'\/'draft'\)/);
  });
});

// A REDRAFT (generate mode=storyboard + project_id) also runs in a scratch
// project and copies its board onto the film. The scratch lingered as a
// second film with the same subject (measured live: a redraft of
// proj_4dfaa63e left proj_2f214503).
describe("a storyboard redraft leaves no scratch project behind", () => {
  it("deletes the scratch once the board is copied, unless the board still points into it", async () => {
    const server = await read("../src/server.ts");
    const from = server.indexOf("// If updating an existing project, copy the storyboard over.");
    const block = server.slice(from, server.indexOf("THE TRUE STORYBOARD", from));
    expect(from).toBeGreaterThan(0);
    expect(block).toMatch(/const scratchId = project\.project_id;/);
    expect(block).toMatch(/origProject\.storyboard = project\.storyboard;[\s\S]*await saveProject\(origProject\);[\s\S]*if \(!JSON\.stringify\(origProject\.storyboard \|\| \{\}\)\.includes\(scratchId\)\) \{\s*await deleteProject\(params\.tenant_id, scratchId\)/);
    expect(block).toMatch(/forgetProject\(params\.tenant_id, scratchId\);/);
    expect(block).toMatch(/scratch \$\{scratchId\} kept/);
  });
});
