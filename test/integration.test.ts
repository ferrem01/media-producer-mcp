/**
 * Integration test: exercises MCP tools end-to-end.
 *
 * Creates a project, adds scenes with components, renders to video,
 * and verifies the output. Calls the same functions the MCP server uses.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createProject,
  loadProject,
  listProjects,
  updateProject,
  addScene,
  addComponent,
  updateComponent,
  removeComponent,
  reorderScenes,
  deleteProject,
} from "../src/persistence/project.js";
import { saveBrandKit, loadBrandKit } from "../src/persistence/brand-kit.js";
import { renderProject } from "../src/core/render.js";
import { config } from "../src/config.js";
import { projectDir, projectOutputDir } from "../src/persistence/paths.js";
import type { BrandKit, Scene, SceneComponent } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use a test data directory
config.dataDir = path.resolve(__dirname, "../test-output/integration");
config.componentLibDir = path.resolve(__dirname, "../src/components");
config.gsapDir = path.resolve(__dirname, "../vendor/gsap");

const TENANT = "test-tenant";

async function main() {
  console.log("=== Media Producer MCP - Integration Test ===\n");

  // Clean previous test data
  await fs.rm(config.dataDir, { recursive: true, force: true });

  // ── 1. Brand Kit ──
  console.log("1. Setting brand kit...");
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
  await saveBrandKit(TENANT, brandKit);

  const loaded = await loadBrandKit(TENANT);
  assert(loaded !== null, "Brand kit should load");
  assert(loaded!.colors.primary === "#5B21B6", "Brand kit primary color");
  console.log("   ✓ Brand kit saved and loaded");

  // Verify CSS was compiled
  const cssPath = path.join(config.dataDir, TENANT, "brand-kit", "brand-kit.css");
  const css = await fs.readFile(cssPath, "utf-8");
  assert(css.includes("--mp-color-primary"), "CSS should have custom properties");
  console.log("   ✓ Brand kit CSS compiled");

  // ── 2. Create Project ──
  console.log("\n2. Creating project...");
  const project = await createProject({
    tenant_id: TENANT,
    name: "Integration Test Video",
    format: "video",
    preset: "landscape",
    fps: 30,
  });
  assert(project.project_id.startsWith("proj_"), "Project ID prefix");
  assert(project.name === "Integration Test Video", "Project name");
  assert(project.format === "video", "Project format");
  assert(project.canvas.width === 1920, "Canvas width");
  assert(project.scenes.length === 0, "No scenes yet");
  console.log(`   ✓ Project created: ${project.project_id}`);

  // ── 3. List Projects ──
  console.log("\n3. Listing projects...");
  const projects = await listProjects(TENANT);
  assert(projects.length === 1, "Should have 1 project");
  assert(projects[0].project_id === project.project_id, "Project ID matches");
  console.log(`   ✓ Listed ${projects.length} project(s)`);

  // ── 4. Add Scene 1: Title ──
  console.log("\n4. Adding scene 1 (title)...");
  const scene1: Scene = {
    id: "scene_title",
    label: "Title Slide",
    duration_seconds: 3,
    background: "#0f172a",
    components: [
      {
        id: "comp_bg1",
        type: "gradient-background",
        data: { from: "#0f172a", to: "#1e293b", angle: 165 },
        z_index: 0,
      },
      {
        id: "comp_title1",
        type: "title-slide",
        data: {
          badge: "INTEGRATION TEST",
          title: "Media Producer MCP",
          subtitle: "HTML + GSAP + Playwright + ffmpeg",
        },
        z_index: 10,
      },
      {
        id: "comp_polish1",
        type: "film-polish",
        data: { vignette: 0.12, grain: 0.04 },
        z_index: 100,
      },
    ],
  };
  const afterScene1 = await addScene(TENANT, project.project_id, scene1);
  assert(afterScene1 !== null, "addScene should return project");
  assert(afterScene1!.scenes.length === 1, "Should have 1 scene");
  assert(afterScene1!.scenes[0].components.length === 3, "Scene should have 3 components");
  console.log("   ✓ Scene 1 added with 3 components");

  // ── 5. Add Scene 2: Features ──
  console.log("\n5. Adding scene 2 (features)...");
  const scene2: Scene = {
    id: "scene_features",
    label: "Key Features",
    duration_seconds: 4,
    transition_in: { type: "crossfade", duration_seconds: 0.5 },
    components: [
      {
        id: "comp_bg2",
        type: "gradient-background",
        data: { from: "#1e293b", to: "#0f172a", angle: 200 },
        z_index: 0,
      },
      {
        id: "comp_title2",
        type: "title-slide",
        data: {
          badge: "FEATURES",
          title: "Multi-Format Output",
          subtitle: "Video, Image, Deck, GIF, Social",
        },
        z_index: 10,
      },
    ],
  };
  const afterScene2 = await addScene(TENANT, project.project_id, scene2);
  assert(afterScene2!.scenes.length === 2, "Should have 2 scenes");
  console.log("   ✓ Scene 2 added");

  // ── 6. Update component data ──
  console.log("\n6. Updating component data...");
  const afterUpdate = await updateComponent(
    TENANT, project.project_id, "scene_title", "comp_title1",
    { data: { title: "Media Producer MCP v0.1" } },
  );
  assert(afterUpdate !== null, "updateComponent should return project");
  const updatedComp = afterUpdate!.scenes[0].components.find(c => c.id === "comp_title1");
  assert((updatedComp!.data as any).title === "Media Producer MCP v0.1", "Title should be updated");
  console.log("   ✓ Component data updated");

  // ── 7. Add a component to existing scene ──
  console.log("\n7. Adding component to scene 2...");
  const newComp: SceneComponent = {
    id: "comp_polish2",
    type: "film-polish",
    data: { vignette: 0.1, grain: 0.03 },
    z_index: 100,
  };
  const afterAddComp = await addComponent(TENANT, project.project_id, "scene_features", newComp);
  assert(afterAddComp!.scenes[1].components.length === 3, "Scene 2 should have 3 components");
  console.log("   ✓ Component added to scene 2");

  // ── 8. Reorder scenes ──
  console.log("\n8. Reordering scenes...");
  const afterReorder = await reorderScenes(TENANT, project.project_id, ["scene_features", "scene_title"]);
  assert(afterReorder!.scenes[0].id === "scene_features", "Features should be first");
  assert(afterReorder!.scenes[1].id === "scene_title", "Title should be second");

  // Reorder back
  await reorderScenes(TENANT, project.project_id, ["scene_title", "scene_features"]);
  console.log("   ✓ Scenes reordered and restored");

  // ── 9. Update project metadata ──
  console.log("\n9. Updating project name...");
  const afterProjUpdate = await updateProject(TENANT, project.project_id, {
    name: "Integration Test - Final",
  });
  assert(afterProjUpdate!.name === "Integration Test - Final", "Name should be updated");
  console.log("   ✓ Project name updated");

  // ── 10. Load and verify full project state ──
  console.log("\n10. Loading full project state...");
  const fullProject = await loadProject(TENANT, project.project_id);
  assert(fullProject !== null, "Project should load");
  assert(fullProject!.scenes.length === 2, "Should have 2 scenes");
  assert(fullProject!.scenes[0].components.length === 3, "Scene 1: 3 components");
  assert(fullProject!.scenes[1].components.length === 3, "Scene 2: 3 components");
  console.log("   ✓ Full project state verified");
  console.log(`     Name: ${fullProject!.name}`);
  console.log(`     Scenes: ${fullProject!.scenes.map(s => s.label).join(", ")}`);

  // ── 11. Render the video ──
  console.log("\n11. Rendering video (2 scenes, 7s total)...");
  const outputPath = path.join(
    projectOutputDir(TENANT, project.project_id),
    "output.mp4",
  );

  const renderResult = await renderProject({
    project: fullProject!,
    workDir: path.join(projectDir(TENANT, project.project_id), "_work"),
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputPath,
  });

  console.log(`   ✓ Render complete!`);
  console.log(`     Output: ${renderResult.outputPath}`);
  console.log(`     Frames: ${renderResult.frameCount}`);
  console.log(`     Time: ${(renderResult.durationMs / 1000).toFixed(1)}s`);

  // Verify output file
  const stat = await fs.stat(outputPath);
  assert(stat.size > 10000, "Output file should be > 10KB");
  console.log(`     File size: ${(stat.size / 1024).toFixed(0)} KB`);

  // ── 12. Render an image ──
  console.log("\n12. Testing image format...");
  const imageProject = await createProject({
    tenant_id: TENANT,
    name: "Image Test",
    format: "image",
  });
  await addScene(TENANT, imageProject.project_id, {
    id: "scene_img",
    label: "Hero Image",
    duration_seconds: 3,
    components: [
      { id: "c1", type: "gradient-background", data: { from: "#1a1a2e", to: "#16213e" }, z_index: 0 },
      { id: "c2", type: "title-slide", data: { title: "Static Image", subtitle: "Exported as PNG" }, z_index: 10 },
    ],
  });

  const imgProject = await loadProject(TENANT, imageProject.project_id);
  const imgOutput = path.join(projectOutputDir(TENANT, imageProject.project_id), "output.png");
  const imgResult = await renderProject({
    project: imgProject!,
    workDir: path.join(projectDir(TENANT, imageProject.project_id), "_work"),
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputPath: imgOutput,
  });
  const imgStat = await fs.stat(imgOutput);
  assert(imgStat.size > 5000, "Image should be > 5KB");
  console.log(`   ✓ Image rendered: ${(imgStat.size / 1024).toFixed(0)} KB`);

  // ── 13. Remove a component ──
  console.log("\n13. Removing a component...");
  const afterRemove = await removeComponent(TENANT, project.project_id, "scene_features", "comp_polish2");
  assert(afterRemove!.scenes[1].components.length === 2, "Scene 2 should have 2 components after removal");
  console.log("   ✓ Component removed");

  // ── 14. Delete project ──
  console.log("\n14. Deleting image project...");
  const deleted = await deleteProject(TENANT, imageProject.project_id);
  assert(deleted, "Delete should succeed");
  const afterDelete = await listProjects(TENANT);
  assert(afterDelete.length === 1, "Should have 1 project after deletion");
  console.log("   ✓ Project deleted");

  // ── Done ──
  console.log("\n=== All 14 tests passed! ===");
  console.log(`\nVideo output: ${outputPath}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err);
  process.exit(1);
});
