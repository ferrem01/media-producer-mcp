/**
 * Persistence layer tests.
 *
 * Tests brand kit, project CRUD, scene/component operations.
 * No rendering -- fast, no Playwright dependency.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import {
  createProject,
  loadProject,
  listProjects,
  updateProject,
  deleteProject,
  addScene,
  updateScene,
  removeScene,
  reorderScenes,
  addComponent,
  updateComponent,
  removeComponent,
} from "../src/persistence/project.js";
import { saveBrandKit, loadBrandKit } from "../src/persistence/brand-kit.js";
import type { BrandKit, Scene, SceneComponent } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(__dirname, "../test-output/persistence");
const TENANT = "test-tenant";

beforeAll(async () => {
  config.dataDir = TEST_DATA_DIR;
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ── Brand Kit ──

describe("brand kit", () => {
  const brandKit: BrandKit = {
    colors: {
      primary: "#5B21B6",
      secondary: "#7C3AED",
      accent: "#A78BFA",
      background: "#0f172a",
      surface: "#1e293b",
      text: "#ffffff",
      text_muted: "#94a3b8",
    },
    fonts: [{ family: "Inter", source: "google", weights: [400, 600, 800] }],
    style: { border_radius: "12px", motion: "cinematic" },
  };

  it("saves and loads brand kit", async () => {
    await saveBrandKit(TENANT, brandKit);
    const loaded = await loadBrandKit(TENANT);
    expect(loaded).not.toBeNull();
    expect(loaded!.colors.primary).toBe("#5B21B6");
    expect(loaded!.fonts[0].family).toBe("Inter");
  });

  it("compiles CSS variables", async () => {
    const cssPath = path.join(TEST_DATA_DIR, TENANT, "brand-kit", "brand-kit.css");
    const css = await fs.readFile(cssPath, "utf-8");
    expect(css).toContain("--mp-color-primary: #5B21B6");
    expect(css).toContain("--mp-font-family");
    expect(css).toContain("--mp-border-radius");
  });

  it("creates brand-kit/assets/ directory", async () => {
    const assetsDir = path.join(TEST_DATA_DIR, TENANT, "brand-kit", "assets");
    const stat = await fs.stat(assetsDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it("returns null for nonexistent tenant", async () => {
    const kit = await loadBrandKit("nonexistent-tenant");
    expect(kit).toBeNull();
  });
});

// ── Project CRUD ──

describe("project CRUD", () => {
  let projectId: string;

  it("creates a project", async () => {
    const project = await createProject({
      tenant_id: TENANT,
      name: "Test Project",
      format: "video",
      preset: "landscape",
      fps: 30,
    });
    projectId = project.project_id;
    expect(projectId).toMatch(/^proj_/);
    expect(project.name).toBe("Test Project");
    expect(project.format).toBe("video");
    expect(project.canvas.width).toBe(1920);
    expect(project.canvas.height).toBe(1080);
    expect(project.scenes).toHaveLength(0);
    expect(project.status).toBe("draft");
  });

  it("loads a project", async () => {
    const project = await loadProject(TENANT, projectId);
    expect(project).not.toBeNull();
    expect(project!.name).toBe("Test Project");
  });

  it("lists projects", async () => {
    const projects = await listProjects(TENANT);
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects.some((p) => p.project_id === projectId)).toBe(true);
  });

  it("updates project metadata", async () => {
    const updated = await updateProject(TENANT, projectId, { name: "Updated Name" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated Name");
  });

  it("returns null for nonexistent project", async () => {
    const project = await loadProject(TENANT, "proj_nonexistent");
    expect(project).toBeNull();
  });

  it("inherits tenant brand kit on creation", async () => {
    const project = await loadProject(TENANT, projectId);
    expect(project!.brand_kit.colors.primary).toBe("#5B21B6");
  });
});

// ── Scene Operations ──

describe("scene operations", () => {
  let projectId: string;

  beforeAll(async () => {
    const project = await createProject({
      tenant_id: TENANT,
      name: "Scene Test",
      format: "video",
    });
    projectId = project.project_id;
  });

  it("adds a scene", async () => {
    const scene: Scene = {
      id: "scene_001",
      label: "First Scene",
      duration_seconds: 5,
      components: [],
    };
    const project = await addScene(TENANT, projectId, scene);
    expect(project).not.toBeNull();
    expect(project!.scenes).toHaveLength(1);
    expect(project!.scenes[0].label).toBe("First Scene");
  });

  it("adds a scene at a specific position", async () => {
    const scene: Scene = {
      id: "scene_000",
      label: "Inserted First",
      duration_seconds: 3,
      components: [],
    };
    const project = await addScene(TENANT, projectId, scene, 0);
    expect(project!.scenes).toHaveLength(2);
    expect(project!.scenes[0].id).toBe("scene_000");
    expect(project!.scenes[1].id).toBe("scene_001");
  });

  it("updates a scene", async () => {
    const project = await updateScene(TENANT, projectId, "scene_001", {
      label: "Updated Scene",
      duration_seconds: 8,
    });
    expect(project).not.toBeNull();
    const scene = project!.scenes.find((s) => s.id === "scene_001");
    expect(scene!.label).toBe("Updated Scene");
    expect(scene!.duration_seconds).toBe(8);
  });

  it("reorders scenes", async () => {
    const project = await reorderScenes(TENANT, projectId, ["scene_001", "scene_000"]);
    expect(project!.scenes[0].id).toBe("scene_001");
    expect(project!.scenes[1].id).toBe("scene_000");
  });

  it("rejects invalid reorder", async () => {
    const result = await reorderScenes(TENANT, projectId, ["scene_001", "nonexistent"]);
    expect(result).toBeNull();
  });

  it("removes a scene", async () => {
    const project = await removeScene(TENANT, projectId, "scene_000");
    expect(project!.scenes).toHaveLength(1);
    expect(project!.scenes[0].id).toBe("scene_001");
  });
});

// ── Component Operations ──

describe("component operations", () => {
  let projectId: string;

  beforeAll(async () => {
    const project = await createProject({
      tenant_id: TENANT,
      name: "Component Test",
      format: "video",
    });
    projectId = project.project_id;
    await addScene(TENANT, projectId, {
      id: "scene_comp",
      label: "Component Test Scene",
      duration_seconds: 5,
      components: [],
    });
  });

  it("adds a component to a scene", async () => {
    const comp: SceneComponent = {
      id: "comp_001",
      type: "title-slide",
      data: { title: "Hello", subtitle: "World" },
      z_index: 10,
    };
    const project = await addComponent(TENANT, projectId, "scene_comp", comp);
    expect(project!.scenes[0].components).toHaveLength(1);
    expect(project!.scenes[0].components[0].type).toBe("title-slide");
  });

  it("updates component data", async () => {
    const project = await updateComponent(TENANT, projectId, "scene_comp", "comp_001", {
      data: { title: "Updated Title" },
    });
    const comp = project!.scenes[0].components[0];
    expect((comp.data as any).title).toBe("Updated Title");
    // Original subtitle should be preserved (merge, not replace)
    expect((comp.data as any).subtitle).toBe("World");
  });

  it("updates component position", async () => {
    const project = await updateComponent(TENANT, projectId, "scene_comp", "comp_001", {
      position: { x: 100, y: 200 },
      z_index: 20,
    });
    const comp = project!.scenes[0].components[0];
    expect(comp.position).toEqual({ x: 100, y: 200 });
    expect(comp.z_index).toBe(20);
  });

  it("removes a component", async () => {
    const project = await removeComponent(TENANT, projectId, "scene_comp", "comp_001");
    expect(project!.scenes[0].components).toHaveLength(0);
  });

  it("returns null for nonexistent scene", async () => {
    const result = await addComponent(TENANT, projectId, "nonexistent", {
      id: "x", type: "y", data: {},
    });
    expect(result).toBeNull();
  });
});

// ── Delete ──

describe("project deletion", () => {
  it("deletes a project", async () => {
    const project = await createProject({
      tenant_id: TENANT,
      name: "To Delete",
      format: "image",
    });
    const deleted = await deleteProject(TENANT, project.project_id);
    expect(deleted).toBe(true);
    const loaded = await loadProject(TENANT, project.project_id);
    expect(loaded).toBeNull();
  });

  it("returns false for nonexistent project", async () => {
    const deleted = await deleteProject(TENANT, "proj_nonexistent");
    expect(deleted).toBe(false);
  });
});
