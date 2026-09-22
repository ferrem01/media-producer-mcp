import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

// "Copy it and try something" is how the work goes (Marc, after a copy
// hand-assembled in five steps got two of them wrong -- the render refused
// for want of a storyboard, and the copied board had 14 scenes where the
// built film had 12: "i guess we dont have a copy or duplicate
// function/tool?").
describe("duplicating a project", () => {
  it("copies the whole film and re-points it at itself: scenes, board, audio, assets, every id inside the record -- and does NOT inherit the render", async () => {
    const { duplicateProject, loadProject, saveProject, createProject } = await import("../src/persistence/project.js");
    const { projectDir, projectAssetsDir } = await import("../src/persistence/paths.js");
    const tenant = `t-dup-${Date.now()}`;
    const src = await createProject({ tenant_id: tenant, name: "The Film", format: "video", frame: "16x9" } as any);
    const id = src.project_id;
    // A film with everything that carries a project id inside it.
    src.status = "rendered";
    (src as any).rendered = true;
    (src as any).rendered_at = "2026-09-01T00:00:00.000Z";
    (src as any).download_url = `https://host/output/${tenant}/projects/${id}/output.mp4`;
    src.scenes = [{ id: "scene_001", label: "One", duration_seconds: 4, components: [
      { id: "c1", type: "video", data: { src: `/assets/${tenant}/projects/${id}/assets/clip.mp4`, clip: true } },
    ] }] as any;
    src.storyboard = { narrative: "n", scenes: [{ label: "One", purpose: "", template: "", duration_seconds: 4, assets: [
      { type: "camera_video", use: "clip", description: "cameo", status: "provided", path: `/assets/${tenant}/projects/${id}/assets/clip.mp4` },
    ], visual_notes: "", components: [] }], audio: { music_mood: "none", voice: "nova", pacing: "moderate" } } as any;
    src.audio = { tracks: [{ id: "sfx_1", type: "sfx", source: `/assets/${tenant}/projects/${id}/assets/whoosh.wav`, volume: 0.4 }] } as any;
    await saveProject(src);
    await fs.writeFile(path.join(projectAssetsDir(tenant, id), "clip.mp4"), "MP4");
    await fs.mkdir(path.join(projectDir(tenant, id), "output"), { recursive: true });
    await fs.writeFile(path.join(projectDir(tenant, id), "output", "output.mp4"), "RENDER");

    const copy = await duplicateProject(tenant, id, { name: "The Film shorter" });
    expect(copy).toBeTruthy();
    const newId = copy!.project_id;
    expect(newId).not.toBe(id);
    expect(copy!.name).toBe("The Film shorter");

    // The film itself came along, whole.
    expect(copy!.scenes).toHaveLength(1);
    expect(copy!.storyboard!.scenes).toHaveLength(1);
    expect(copy!.audio!.tracks).toHaveLength(1);

    // ...and every id inside it now points at the copy, not the original.
    const asText = JSON.stringify(copy);
    expect(asText).not.toContain(id);
    expect((copy!.scenes[0] as any).components[0].data.src).toBe(`/assets/${tenant}/projects/${newId}/assets/clip.mp4`);
    expect((copy!.storyboard!.scenes[0] as any).assets[0].path).toBe(`/assets/${tenant}/projects/${newId}/assets/clip.mp4`);
    expect(copy!.audio!.tracks[0].source).toBe(`/assets/${tenant}/projects/${newId}/assets/whoosh.wav`);

    // The files came along too -- a copy must not play the original's media.
    expect(await fs.readFile(path.join(projectAssetsDir(tenant, newId), "clip.mp4"), "utf8")).toBe("MP4");

    // A copy has never been rendered.
    expect(copy!.status).toBe("generated");
    expect((copy as any).rendered).toBeUndefined();
    expect((copy as any).rendered_at).toBeUndefined();
    expect((copy as any).download_url).toBeUndefined();
    await expect(fs.access(path.join(projectDir(tenant, newId), "output", "output.mp4"))).rejects.toThrow();

    // The original is untouched.
    const after = await loadProject(tenant, id);
    expect(after!.name).toBe("The Film");
    expect(after!.status).toBe("rendered");

    // The default name says it is a copy; include_output keeps the mp4.
    const plain = await duplicateProject(tenant, id, {});
    expect(plain!.name).toBe("The Film (copy)");
    const archive = await duplicateProject(tenant, id, { include_output: true });
    expect(await fs.readFile(path.join(projectDir(tenant, archive!.project_id), "output", "output.mp4"), "utf8")).toBe("RENDER");

    expect(await duplicateProject(tenant, "proj_nope", {})).toBeNull();
    const { tenantDir } = await import("../src/persistence/paths.js");
    await fs.rm(tenantDir(tenant), { recursive: true, force: true });
  });

  it("is reachable from the tool and from Studio", async () => {
    const srv = await read("src/server.ts");
    expect(srv).toMatch(/copy_of: z\.string\(\)\.optional\(\)\.describe\("DUPLICATE an existing project/);
    expect(srv).toMatch(/if \(params\.copy_of\) \{\n\s*const copy = await duplicateProject\(params\.tenant_id!, params\.copy_of, \{/);
    const idx = await read("src/index.ts");
    expect(idx).toMatch(/\/api\\\/projects\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\\\/duplicate\$\//);
  });
});
