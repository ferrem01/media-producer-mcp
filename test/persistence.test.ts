/**
 * Tests for persistence layer (project + brand-kit).
 */

import fs from "node:fs/promises";
import path from "node:path";
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
import {
  loadBrandKit,
  saveBrandKit,
  compileBrandCSS,
  brandKitExists,
} from "../src/persistence/brand-kit.js";
import {
  brandKitDir,
  brandKitJsonPath,
  brandKitCssPath,
  brandKitAssetsDir,
  projectDir,
} from "../src/persistence/paths.js";
import type { BrandKit, Scene, SceneComponent } from "../src/core/types.js";

const TEST_TENANT = `test-tenant-${Date.now()}`;
let testProjectId: string;

// ── Helpers ──

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
}

function assertEq(a: unknown, b: unknown, msg: string) {
  if (a !== b) throw new Error(`FAIL: ${msg} -- expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

async function cleanup() {
  try {
    await fs.rm(path.join(config.dataDir, TEST_TENANT), { recursive: true, force: true });
  } catch {}
}

// ── Tests ──

async function testBrandKit() {
  console.log("  brand-kit: save and load");

  const kit: BrandKit = {
    colors: {
      primary: "#FF0000",
      secondary: "#00FF00",
      accent: "#0000FF",
      background: "#111111",
      surface: "#222222",
      text: "#FFFFFF",
      text_muted: "#AAAAAA",
    },
    fonts: [{ family: "Roboto", source: "google", weights: [400, 700] }],
    style: { border_radius: "8px", motion: "punchy" },
  };

  await saveBrandKit(TEST_TENANT, kit);

  // Verify brand-kit/ directory structure
  const dirExists = await brandKitExists(TEST_TENANT);
  assert(dirExists, "brand-kit/ dir should exist");

  // Verify assets/ subdir created
  try {
    await fs.access(brandKitAssetsDir(TEST_TENANT));
  } catch {
    throw new Error("FAIL: brand-kit/assets/ dir should exist");
  }

  // Verify JSON saved at brand-kit/brand-kit.json
  const jsonPath = brandKitJsonPath(TEST_TENANT);
  const raw = await fs.readFile(jsonPath, "utf-8");
  const parsed = JSON.parse(raw);
  assertEq(parsed.colors.primary, "#FF0000", "brand-kit.json primary color");

  // Verify CSS saved at brand-kit/brand-kit.css
  const cssPath = brandKitCssPath(TEST_TENANT);
  const css = await fs.readFile(cssPath, "utf-8");
  assert(css.includes("--mp-color-primary: #FF0000"), "CSS should contain primary color");
  assert(css.includes("--mp-font-family: 'Roboto'"), "CSS should contain font family");
  assert(css.includes("--mp-motion-style: punchy"), "CSS should contain motion style");

  // Load it back
  const loaded = await loadBrandKit(TEST_TENANT);
  assert(loaded !== null, "loaded brand kit should not be null");
  assertEq(loaded!.colors.primary, "#FF0000", "loaded primary");
  assertEq(loaded!.fonts[0].family, "Roboto", "loaded font family");

  console.log("  brand-kit: compile CSS");
  const compiled = compileBrandCSS(kit);
  assert(compiled.includes(":root {"), "compiled CSS has :root");
  assert(compiled.includes("--mp-border-radius: 8px"), "compiled CSS has border radius");

  console.log("  brand-kit: nonexistent tenant returns null");
  const none = await loadBrandKit("nonexistent-tenant-xyz");
  assertEq(none, null, "nonexistent brand kit");
}

async function testProjectCRUD() {
  console.log("  project: create");
  const project = await createProject({
    tenant_id: TEST_TENANT,
    name: "Test Video",
    format: "video",
    preset: "landscape",
    fps: 30,
  });

  assert(project.project_id.startsWith("proj_"), "project_id prefix");
  assertEq(project.tenant_id, TEST_TENANT, "tenant_id");
  assertEq(project.name, "Test Video", "name");
  assertEq(project.format, "video", "format");
  assertEq(project.status, "draft", "status");
  assertEq(project.canvas.width, 1920, "canvas width");
  assertEq(project.canvas.height, 1080, "canvas height");
  assertEq(project.scenes.length, 0, "scenes empty");
  testProjectId = project.project_id;

  console.log("  project: load");
  const loaded = await loadProject(TEST_TENANT, testProjectId);
  assert(loaded !== null, "loaded project");
  assertEq(loaded!.name, "Test Video", "loaded name");

  console.log("  project: list");
  const list = await listProjects(TEST_TENANT);
  assert(list.length >= 1, "list has projects");
  assert(list.some((p) => p.project_id === testProjectId), "list contains our project");

  console.log("  project: update");
  const updated = await updateProject(TEST_TENANT, testProjectId, { name: "Updated Video" });
  assert(updated !== null, "updated project");
  assertEq(updated!.name, "Updated Video", "updated name");

  console.log("  project: load nonexistent");
  const none = await loadProject(TEST_TENANT, "proj_nonexistent");
  assertEq(none, null, "nonexistent project");
}

async function testSceneOperations() {
  const scene1: Scene = {
    id: "scene_001",
    label: "Title",
    duration_seconds: 5,
    background: "#000",
    components: [],
  };
  const scene2: Scene = {
    id: "scene_002",
    label: "Content",
    duration_seconds: 8,
    components: [],
  };
  const scene3: Scene = {
    id: "scene_003",
    label: "Outro",
    duration_seconds: 3,
    components: [],
  };

  console.log("  scene: add");
  let project = await addScene(TEST_TENANT, testProjectId, scene1);
  assert(project !== null, "add scene1");
  assertEq(project!.scenes.length, 1, "1 scene");

  project = await addScene(TEST_TENANT, testProjectId, scene2);
  assertEq(project!.scenes.length, 2, "2 scenes");

  // Insert at position
  project = await addScene(TEST_TENANT, testProjectId, scene3, 1);
  assertEq(project!.scenes.length, 3, "3 scenes");
  assertEq(project!.scenes[1].id, "scene_003", "scene3 inserted at position 1");

  console.log("  scene: update");
  project = await updateScene(TEST_TENANT, testProjectId, "scene_001", {
    label: "Updated Title",
    duration_seconds: 6,
  });
  assert(project !== null, "update scene");
  assertEq(project!.scenes[0].label, "Updated Title", "updated label");
  assertEq(project!.scenes[0].duration_seconds, 6, "updated duration");

  console.log("  scene: reorder");
  project = await reorderScenes(TEST_TENANT, testProjectId, [
    "scene_002",
    "scene_003",
    "scene_001",
  ]);
  assert(project !== null, "reorder scenes");
  assertEq(project!.scenes[0].id, "scene_002", "reordered first");
  assertEq(project!.scenes[2].id, "scene_001", "reordered last");

  console.log("  scene: remove");
  project = await removeScene(TEST_TENANT, testProjectId, "scene_003");
  assert(project !== null, "remove scene");
  assertEq(project!.scenes.length, 2, "2 scenes after remove");
  assert(!project!.scenes.some((s) => s.id === "scene_003"), "scene_003 removed");
}

async function testComponentOperations() {
  const comp: SceneComponent = {
    id: "comp_001",
    type: "title-slide",
    data: { title: "Hello", subtitle: "World" },
    position: { x: "center", y: "center" },
    z_index: 10,
    enter: { effect: "stagger-up", duration: 0.8 },
    exit: { effect: "fade-out", duration: 0.3 },
  };

  console.log("  component: add");
  let project = await addComponent(TEST_TENANT, testProjectId, "scene_002", comp);
  assert(project !== null, "add component");
  const scene = project!.scenes.find((s) => s.id === "scene_002");
  assertEq(scene!.components.length, 1, "1 component");
  assertEq(scene!.components[0].type, "title-slide", "component type");

  console.log("  component: update");
  project = await updateComponent(TEST_TENANT, testProjectId, "scene_002", "comp_001", {
    data: { title: "Updated Title" },
    z_index: 20,
  });
  assert(project !== null, "update component");
  const updated = project!.scenes.find((s) => s.id === "scene_002")!.components[0];
  assertEq(updated.data.title, "Updated Title", "updated title");
  assertEq(updated.data.subtitle, "World", "subtitle preserved");
  assertEq(updated.z_index, 20, "updated z_index");

  console.log("  component: remove");
  project = await removeComponent(TEST_TENANT, testProjectId, "scene_002", "comp_001");
  assert(project !== null, "remove component");
  const after = project!.scenes.find((s) => s.id === "scene_002");
  assertEq(after!.components.length, 0, "0 components after remove");
}

async function testProjectDelete() {
  console.log("  project: delete");
  const ok = await deleteProject(TEST_TENANT, testProjectId);
  assertEq(ok, true, "delete returned true");

  const loaded = await loadProject(TEST_TENANT, testProjectId);
  assertEq(loaded, null, "deleted project not found");
}

async function testBrandKitLoadedIntoProject() {
  // Save a brand kit, then create a project -- it should pick up the tenant brand
  console.log("  project: inherits tenant brand kit");
  const kit: BrandKit = {
    colors: {
      primary: "#123456",
      secondary: "#654321",
      accent: "#ABCDEF",
      background: "#000000",
      surface: "#111111",
      text: "#FFFFFF",
      text_muted: "#888888",
    },
    fonts: [{ family: "Poppins", source: "google", weights: [400, 600] }],
    style: { border_radius: "16px", motion: "minimal" },
  };
  await saveBrandKit(TEST_TENANT, kit);

  const project = await createProject({
    tenant_id: TEST_TENANT,
    name: "Brand Inherited",
    format: "image",
  });

  assertEq(project.brand_kit.colors.primary, "#123456", "inherited primary color");
  assertEq(project.brand_kit.fonts[0].family, "Poppins", "inherited font");

  // Cleanup
  await deleteProject(TEST_TENANT, project.project_id);
}

// ── Runner ──

async function run() {
  console.log("persistence tests");
  try {
    await testBrandKit();
    await testProjectCRUD();
    await testSceneOperations();
    await testComponentOperations();
    await testProjectDelete();
    await testBrandKitLoadedIntoProject();
    console.log("\n✓ All persistence tests passed");
  } catch (err) {
    console.error("\n✗ Test failed:", (err as Error).message);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

run();
