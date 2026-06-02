/**
 * Project persistence.
 *
 * CRUD operations for projects stored at:
 *   {tenant}/projects/proj_{id}/project.json
 */

import fs from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import type { Project, OutputFormat, Canvas, BrandKit, Scene } from "../core/types.js";
import { RESOLUTION_DIMENSIONS, type ResolutionPreset } from "../core/types.js";
import {
  projectsDir,
  projectDir,
  projectJsonPath,
  projectAssetsDir,
  projectOutputDir,
  tenantDir,
} from "./paths.js";
import { loadBrandKit } from "./brand-kit.js";

// ── Defaults ──

const DEFAULT_CANVAS: Canvas = {
  width: 1920,
  height: 1080,
  preset: "landscape",
  fps: 30,
  background: "#0f172a",
};

const DEFAULT_BRAND_KIT: BrandKit = {
  colors: {
    primary: "#5B21B6",
    secondary: "#7C3AED",
    accent: "#A78BFA",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#ffffff",
    text_muted: "#94a3b8",
  },
  fonts: [{ family: "Inter", source: "google", weights: [400, 500, 600, 700, 800] }],
  style: { border_radius: "12px", motion: "cinematic" },
};

// ── Create ──

export interface CreateProjectInput {
  tenant_id: string;
  name: string;
  format: OutputFormat;
  preset?: ResolutionPreset;
  fps?: number;
  brand_kit?: Partial<BrandKit>;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const id = `proj_${uuidv4().replace(/-/g, "").slice(0, 8)}`;

  // Resolve canvas from preset
  const preset = input.preset || "landscape";
  const dims = RESOLUTION_DIMENSIONS[preset];
  const canvas: Canvas = {
    ...dims,
    preset,
    fps: input.fps ?? DEFAULT_CANVAS.fps,
    background: DEFAULT_CANVAS.background,
  };

  // Try to load tenant brand kit, fall back to defaults
  const tenantBrand = await loadBrandKit(input.tenant_id);
  const brand_kit: BrandKit = {
    ...DEFAULT_BRAND_KIT,
    ...tenantBrand,
    ...input.brand_kit,
  };

  const project: Project = {
    project_id: id,
    tenant_id: input.tenant_id,
    name: input.name,
    format: input.format,
    status: "draft",
    canvas,
    brand_kit,
    scenes: [],
  };

  // Create directory structure
  const dir = projectDir(input.tenant_id, id);
  await fs.mkdir(projectAssetsDir(input.tenant_id, id), { recursive: true });
  await fs.mkdir(projectOutputDir(input.tenant_id, id), { recursive: true });

  // Write project.json
  await saveProject(project);

  return project;
}

// ── Read ──

export async function loadProject(tenantId: string, projectId: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(projectJsonPath(tenantId, projectId), "utf-8");
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

export async function listProjects(tenantId: string): Promise<Array<{ project_id: string; name: string; format: OutputFormat; status: string; scene_count: number }>> {
  const dir = projectsDir(tenantId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results: Array<{ project_id: string; name: string; format: OutputFormat; status: string; scene_count: number }> = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("proj_")) continue;
      const project = await loadProject(tenantId, entry.name);
      if (project) {
        results.push({
          project_id: project.project_id,
          name: project.name,
          format: project.format,
          status: project.status,
          scene_count: project.scenes?.length ?? 0,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

// ── Update ──

export async function saveProject(project: Project): Promise<void> {
  const dir = projectDir(project.tenant_id, project.project_id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    projectJsonPath(project.tenant_id, project.project_id),
    JSON.stringify(project, null, 2),
  );
}

export async function updateProject(
  tenantId: string,
  projectId: string,
  updates: Partial<Pick<Project, "name" | "canvas" | "brand_kit" | "status" | "audio" | "overlays">>,
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  if (updates.name !== undefined) project.name = updates.name;
  if (updates.canvas) project.canvas = { ...project.canvas, ...updates.canvas };
  if (updates.brand_kit) project.brand_kit = { ...project.brand_kit, ...updates.brand_kit };
  if (updates.status !== undefined) project.status = updates.status;
  if (updates.audio !== undefined) project.audio = updates.audio;
  if (updates.overlays !== undefined) project.overlays = updates.overlays;

  await saveProject(project);
  return project;
}

// ── Delete ──

export async function deleteProject(tenantId: string, projectId: string): Promise<boolean> {
  const dir = projectDir(tenantId, projectId);
  try {
    await fs.access(dir);
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

// ── Scene operations ──

export async function addScene(
  tenantId: string,
  projectId: string,
  scene: Scene,
  position?: number,
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  if (position !== undefined && position >= 0 && position <= project.scenes.length) {
    project.scenes.splice(position, 0, scene);
  } else {
    project.scenes.push(scene);
  }

  await saveProject(project);
  return project;
}

export async function updateScene(
  tenantId: string,
  projectId: string,
  sceneId: string,
  updates: Partial<Pick<Scene, "label" | "duration_seconds" | "background" | "transition_in" | "components">>,
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;

  if (updates.label !== undefined) scene.label = updates.label;
  if (updates.duration_seconds !== undefined) scene.duration_seconds = updates.duration_seconds;
  if (updates.background !== undefined) scene.background = updates.background;
  if (updates.transition_in !== undefined) scene.transition_in = updates.transition_in;
  if (updates.components !== undefined) scene.components = updates.components;

  await saveProject(project);
  return project;
}

export async function removeScene(
  tenantId: string,
  projectId: string,
  sceneId: string,
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  project.scenes = project.scenes.filter((s) => s.id !== sceneId);
  await saveProject(project);
  return project;
}

export async function reorderScenes(
  tenantId: string,
  projectId: string,
  sceneIds: string[],
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  const sceneMap = new Map(project.scenes.map((s) => [s.id, s]));
  const reordered: Scene[] = [];

  for (const id of sceneIds) {
    const scene = sceneMap.get(id);
    if (!scene) return null; // invalid scene id
    reordered.push(scene);
  }

  // Verify all scenes accounted for
  if (reordered.length !== project.scenes.length) return null;

  project.scenes = reordered;
  await saveProject(project);
  return project;
}

// ── Component operations (within a scene) ──

export async function addComponent(
  tenantId: string,
  projectId: string,
  sceneId: string,
  component: import("../core/types.js").SceneComponent,
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;

  scene.components.push(component);
  await saveProject(project);
  return project;
}

export async function updateComponent(
  tenantId: string,
  projectId: string,
  sceneId: string,
  componentId: string,
  updates: Partial<Pick<import("../core/types.js").SceneComponent, "data" | "position" | "z_index" | "enter" | "exit">>,
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;

  const comp = scene.components.find((c) => c.id === componentId);
  if (!comp) return null;

  if (updates.data !== undefined) comp.data = { ...comp.data, ...updates.data };
  if (updates.position !== undefined) comp.position = updates.position;
  if (updates.z_index !== undefined) comp.z_index = updates.z_index;
  if (updates.enter !== undefined) comp.enter = updates.enter;
  if (updates.exit !== undefined) comp.exit = updates.exit;

  await saveProject(project);
  return project;
}

export async function removeComponent(
  tenantId: string,
  projectId: string,
  sceneId: string,
  componentId: string,
): Promise<Project | null> {
  const project = await loadProject(tenantId, projectId);
  if (!project) return null;

  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;

  scene.components = scene.components.filter((c) => c.id !== componentId);
  await saveProject(project);
  return project;
}
