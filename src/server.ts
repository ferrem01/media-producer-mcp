/**
 * MCP Server for media-producer-mcp.
 *
 * Consolidated tool set (~12 tools). Each tool infers the target
 * from which IDs are provided (project, scene, component).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createProject,
  loadProject,
  listProjects,
  updateProject,
  deleteProject,
  saveProject,
  addScene,
  updateScene,
  removeScene,
  reorderScenes,
  addComponent,
  updateComponent,
  removeComponent,
} from "./persistence/project.js";
import {
  loadBrandKit,
  saveBrandKit,
} from "./persistence/brand-kit.js";
import { renderProject as renderProjectCore } from "./core/render.js";
import { generateComponent, saveGeneratedComponent } from "./core/component-generator.js";
import { config } from "./config.js";
import { projectDir, projectOutputDir } from "./persistence/paths.js";
import path from "node:path";
import fs from "node:fs/promises";
import type { Scene, SceneComponent, BrandKit } from "./core/types.js";

// ── Shared Zod schemas ──

const positionSchema = z.object({
  x: z.union([z.number(), z.string()]),
  y: z.union([z.number(), z.string()]),
  width: z.union([z.number(), z.string()]).optional(),
  height: z.union([z.number(), z.string()]).optional(),
}).optional();

const animationSchema = z.object({
  effect: z.string(),
  duration: z.number().optional(),
  stagger: z.number().optional(),
  ease: z.string().optional(),
}).optional();

const transitionSchema = z.object({
  type: z.enum(["crossfade", "wipe-left", "wipe-right", "slide-up", "slide-down", "iris", "none"]),
  duration_seconds: z.number(),
}).optional();

const componentSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.unknown()),
  position: positionSchema,
  z_index: z.number().optional(),
  enter: animationSchema,
  exit: animationSchema,
});

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "media-producer-mcp",
    version: "0.1.0",
  });

  // ─────────────────────────────────────────────
  // create - Create a new project
  // ─────────────────────────────────────────────

  server.tool(
    "create",
    "Create a new media project (video, image, deck, one-pager, slideshow, gif, social)",
    {
      tenant_id: z.string().describe("Tenant identifier"),
      name: z.string().describe("Project name"),
      format: z.enum(["video", "image", "slideshow", "deck", "one-pager", "gif", "social", "email-header", "thumbnail"]).describe("Output format"),
      preset: z.enum(["landscape", "vertical", "square"]).optional().describe("Resolution preset (default: landscape)"),
      fps: z.number().optional().describe("Frames per second for video/slideshow/gif (default: 30)"),
    },
    async (params) => {
      const project = await createProject({
        tenant_id: params.tenant_id,
        name: params.name,
        format: params.format as any,
        preset: params.preset,
        fps: params.fps,
      });
      return ok(project);
    },
  );

  // ─────────────────────────────────────────────
  // get - Get project, brand kit, or component catalog
  // ─────────────────────────────────────────────

  server.tool(
    "get",
    "Get a project's state, tenant brand kit, or a single scene. Pass project_id for project, 'brand_kit' target for brand kit, project_id + scene_id for a single scene.",
    {
      tenant_id: z.string(),
      project_id: z.string().optional(),
      scene_id: z.string().optional(),
      target: z.enum(["project", "brand_kit"]).optional().describe("What to get (default: project)"),
    },
    async (params) => {
      const target = params.target || "project";

      if (target === "brand_kit") {
        const kit = await loadBrandKit(params.tenant_id);
        return ok(kit || { message: "No brand kit configured" });
      }

      if (!params.project_id) return err("project_id required");

      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) return err("Project not found");

      if (params.scene_id) {
        const scene = project.scenes.find((s) => s.id === params.scene_id);
        if (!scene) return err("Scene not found");
        return ok(scene);
      }

      return ok(project);
    },
  );

  // ─────────────────────────────────────────────
  // list - List projects or available components
  // ─────────────────────────────────────────────

  server.tool(
    "list",
    "List projects for a tenant, or available component types. Pass target='components' to see the component catalog.",
    {
      tenant_id: z.string(),
      target: z.enum(["projects", "components"]).optional().describe("What to list (default: projects)"),
    },
    async (params) => {
      const target = params.target || "projects";

      if (target === "components") {
        const catalog = await listComponentCatalog();
        return ok(catalog);
      }

      const projects = await listProjects(params.tenant_id);
      return ok(projects);
    },
  );

  // ─────────────────────────────────────────────
  // add - Add a scene or component
  // ─────────────────────────────────────────────

  server.tool(
    "add",
    "Add a scene to a project, or a component to a scene. If scene_id is provided, adds a component to that scene. Otherwise adds a new scene.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string().optional().describe("If provided, adds a component to this scene"),

      // Scene fields (when adding a scene)
      scene: z.object({
        id: z.string(),
        label: z.string().optional(),
        duration_seconds: z.number(),
        background: z.string().optional(),
        transition_in: transitionSchema,
        components: z.array(componentSchema).default([]),
      }).optional(),
      position: z.number().optional().describe("Insert position for scene (0-based, appends if omitted)"),

      // Component fields (when adding a component to a scene)
      component: componentSchema.optional(),
    },
    async (params) => {
      if (params.scene_id && params.component) {
        // Adding a component to a scene
        const project = await addComponent(
          params.tenant_id,
          params.project_id,
          params.scene_id,
          params.component as SceneComponent,
        );
        if (!project) return err("Project or scene not found");
        return ok(project);
      }

      if (params.scene) {
        // Adding a scene
        const project = await addScene(
          params.tenant_id,
          params.project_id,
          params.scene as Scene,
          params.position,
        );
        if (!project) return err("Project not found");
        return ok(project);
      }

      return err("Provide either 'scene' (to add a scene) or 'scene_id' + 'component' (to add a component)");
    },
  );

  // ─────────────────────────────────────────────
  // update - Update project, scene, or component
  // ─────────────────────────────────────────────

  server.tool(
    "update",
    "Update a project, scene, or component. Infers target from which IDs are provided: project_id only = update project, + scene_id = update scene, + component_id = update component.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string().optional(),
      component_id: z.string().optional(),

      // Project-level updates
      name: z.string().optional(),
      canvas: z.object({
        width: z.number().optional(),
        height: z.number().optional(),
        preset: z.enum(["landscape", "vertical", "square"]).optional(),
        fps: z.number().optional(),
        background: z.string().optional(),
      }).optional(),
      status: z.enum(["draft", "rendering", "rendered", "failed"]).optional(),

      // Scene-level updates
      label: z.string().optional(),
      duration_seconds: z.number().optional(),
      background: z.string().optional(),
      transition_in: transitionSchema,

      // Component-level updates
      data: z.record(z.unknown()).optional(),
      position: positionSchema,
      z_index: z.number().optional(),
      enter: animationSchema,
      exit: animationSchema,
    },
    async (params) => {
      // Component update
      if (params.scene_id && params.component_id) {
        const updates: Record<string, unknown> = {};
        if (params.data !== undefined) updates.data = params.data;
        if (params.position !== undefined) updates.position = params.position;
        if (params.z_index !== undefined) updates.z_index = params.z_index;
        if (params.enter !== undefined) updates.enter = params.enter;
        if (params.exit !== undefined) updates.exit = params.exit;

        const project = await updateComponent(
          params.tenant_id, params.project_id, params.scene_id, params.component_id,
          updates as any,
        );
        if (!project) return err("Project, scene, or component not found");
        return ok(project);
      }

      // Scene update
      if (params.scene_id) {
        const updates: Record<string, unknown> = {};
        if (params.label !== undefined) updates.label = params.label;
        if (params.duration_seconds !== undefined) updates.duration_seconds = params.duration_seconds;
        if (params.background !== undefined) updates.background = params.background;
        if (params.transition_in !== undefined) updates.transition_in = params.transition_in;

        const project = await updateScene(
          params.tenant_id, params.project_id, params.scene_id,
          updates as any,
        );
        if (!project) return err("Project or scene not found");
        return ok(project);
      }

      // Project update
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.canvas !== undefined) updates.canvas = params.canvas;
      if (params.status !== undefined) updates.status = params.status;

      const project = await updateProject(params.tenant_id, params.project_id, updates as any);
      if (!project) return err("Project not found");
      return ok(project);
    },
  );

  // ─────────────────────────────────────────────
  // remove - Remove project, scene, or component
  // ─────────────────────────────────────────────

  server.tool(
    "remove",
    "Remove a project, scene, or component. Infers target from which IDs are provided.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string().optional(),
      component_id: z.string().optional(),
    },
    async (params) => {
      // Remove component
      if (params.scene_id && params.component_id) {
        const project = await removeComponent(
          params.tenant_id, params.project_id, params.scene_id, params.component_id,
        );
        if (!project) return err("Project, scene, or component not found");
        return ok({ removed: "component", component_id: params.component_id });
      }

      // Remove scene
      if (params.scene_id) {
        const project = await removeScene(params.tenant_id, params.project_id, params.scene_id);
        if (!project) return err("Project or scene not found");
        return ok({ removed: "scene", scene_id: params.scene_id });
      }

      // Remove project
      const deleted = await deleteProject(params.tenant_id, params.project_id);
      if (!deleted) return err("Project not found");
      return ok({ removed: "project", project_id: params.project_id });
    },
  );

  // ─────────────────────────────────────────────
  // reorder - Reorder scenes
  // ─────────────────────────────────────────────

  server.tool(
    "reorder",
    "Reorder scenes in a project by providing scene IDs in the desired order",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_ids: z.array(z.string()).describe("Scene IDs in desired order"),
    },
    async (params) => {
      const project = await reorderScenes(params.tenant_id, params.project_id, params.scene_ids);
      if (!project) return err("Project not found or invalid scene IDs");
      return ok(project);
    },
  );

  // ─────────────────────────────────────────────
  // brand - Get/set brand kit, manage brand assets
  // ─────────────────────────────────────────────

  server.tool(
    "brand",
    "Get or set a tenant's brand kit (colors, fonts, logo, style, assets). Pass no fields to get the current brand kit. Pass fields to update.",
    {
      tenant_id: z.string(),
      colors: z.object({
        primary: z.string().optional(),
        secondary: z.string().optional(),
        accent: z.string().optional(),
        background: z.string().optional(),
        surface: z.string().optional(),
        text: z.string().optional(),
        text_muted: z.string().optional(),
      }).optional(),
      fonts: z.array(z.object({
        family: z.string(),
        source: z.enum(["google", "custom", "system"]),
        weights: z.array(z.number()).optional(),
        url: z.string().optional(),
      })).optional(),
      logo: z.object({
        url: z.string(),
        placement: z.string().optional(),
        height: z.number().optional(),
      }).optional(),
      style: z.object({
        border_radius: z.string().optional(),
        motion: z.enum(["minimal", "punchy", "cinematic"]).optional(),
      }).optional(),
    },
    async (params) => {
      const hasUpdates = params.colors || params.fonts || params.logo || params.style;

      if (!hasUpdates) {
        // Get brand kit
        const kit = await loadBrandKit(params.tenant_id);
        return ok(kit || { message: "No brand kit configured" });
      }

      // Set/update brand kit
      const existing = await loadBrandKit(params.tenant_id);
      const kit: BrandKit = {
        colors: {
          primary: "#5B21B6",
          secondary: "#7C3AED",
          accent: "#A78BFA",
          background: "#0f172a",
          surface: "#1e293b",
          text: "#ffffff",
          text_muted: "#94a3b8",
          ...existing?.colors,
          ...params.colors,
        },
        fonts: params.fonts || existing?.fonts || [
          { family: "Inter", source: "google" as const, weights: [400, 500, 600, 700, 800] },
        ],
        logo: params.logo || existing?.logo,
        style: {
          border_radius: "12px",
          motion: "cinematic" as const,
          ...existing?.style,
          ...params.style,
        },
      };

      await saveBrandKit(params.tenant_id, kit);
      return ok(kit);
    },
  );

  // ─────────────────────────────────────────────
  // render - Render project or scene preview
  // ─────────────────────────────────────────────

  server.tool(
    "render",
    "Render a project to its output format, or render a single scene as a preview image. Pass scene_id for scene preview.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string().optional().describe("If provided, renders a single scene preview image"),
      quality: z.enum(["preview", "production"]).optional().describe("Render quality (default: production)"),
    },
    async (params) => {
      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) return err("Project not found");

      // Scene preview
      if (params.scene_id) {
        const scene = project.scenes.find((s) => s.id === params.scene_id);
        if (!scene) return err("Scene not found");

        try {
          const sceneAssembler = await import("./core/scene-assembler.js");
          const captureModule = await import("./core/capture.js");

          const types = new Set(scene.components.map((c) => c.type));
          const components: Array<{ type: string; source: string }> = [];
          for (const t of types) {
            const source = await findComponentSource(t);
            if (source) components.push({ type: t, source });
          }

          const html = await sceneAssembler.assembleScene({
            scene, components, brandKit: project.brand_kit, canvas: project.canvas, gsapDir: config.gsapDir,
          });

          const workDir = path.join(projectDir(params.tenant_id, params.project_id), "_work");
          const htmlPath = path.join(workDir, `preview_${scene.id}.html`);
          const outputPath = path.join(
            projectOutputDir(params.tenant_id, params.project_id),
            `preview_${scene.id}.png`,
          );

          await fs.mkdir(workDir, { recursive: true });
          await fs.writeFile(htmlPath, html);

          await captureModule.captureSingleFrame({
            htmlPath, outputPath,
            width: project.canvas.width, height: project.canvas.height,
            atTime: scene.duration_seconds / 3,
          });

          return ok({ status: "rendered", scene_id: scene.id, output_path: outputPath });
        } catch (e: any) {
          return err(`Scene render failed: ${e.message}`);
        }
      }

      // Full project render
      if (project.scenes.length === 0) return err("Project has no scenes");

      project.status = "rendering";
      await saveProject(project);

      try {
        const ext = project.format === "video" || project.format === "slideshow" ? "mp4" : "png";
        const outputPath = path.join(
          projectOutputDir(params.tenant_id, params.project_id),
          `output.${ext}`,
        );

        const result = await renderProjectCore({
          project,
          workDir: path.join(projectDir(params.tenant_id, params.project_id), "_work"),
          componentLibDir: config.componentLibDir,
          gsapDir: config.gsapDir,
          outputPath,
        });

        project.status = "rendered";
        await saveProject(project);

        return ok({
          status: "rendered",
          project_id: project.project_id,
          format: project.format,
          output_path: result.outputPath,
          duration_ms: result.durationMs,
          frame_count: result.frameCount,
        });
      } catch (e: any) {
        project.status = "failed";
        await saveProject(project);
        return err(`Render failed: ${e.message}`);
      }
    },
  );

  // ─────────────────────────────────────────────
  // upload - Upload an asset to a project
  // ─────────────────────────────────────────────

  server.tool(
    "upload",
    "Upload an asset (image, video, audio) to a project or to the tenant brand kit. Set target='brand' to upload a brand asset.",
    {
      tenant_id: z.string(),
      project_id: z.string().optional(),
      target: z.enum(["project", "brand"]).optional().describe("Upload target (default: project)"),
      url: z.string().optional().describe("URL to download the asset from"),
      name: z.string().describe("Asset name/filename"),
      asset_type: z.enum(["image", "video", "audio", "logo", "font", "intro", "outro", "background", "watermark", "music", "other"]).optional(),
    },
    async (params) => {
      // TODO: implement actual file download/storage
      return ok({
        status: "not_yet_implemented",
        message: "Asset upload will be implemented in the next phase",
        name: params.name,
        target: params.target || "project",
      });
    },
  );

  // ─────────────────────────────────────────────
  // audio - Manage audio tracks
  // ─────────────────────────────────────────────

  server.tool(
    "audio",
    "Add, update, or remove audio tracks (voiceover, music, SFX) on a project",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      action: z.enum(["add", "update", "remove"]).describe("Action to perform"),
      track: z.object({
        id: z.string(),
        type: z.enum(["voiceover", "music", "sfx"]).optional(),
        source: z.string().optional(),
        volume: z.number().min(0).max(1).optional(),
        start_time: z.number().optional(),
        loop: z.boolean().optional(),
        fade_in: z.number().optional(),
        fade_out: z.number().optional(),
      }),
    },
    async (params) => {
      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) return err("Project not found");

      if (!project.audio) {
        project.audio = { tracks: [] };
      }

      if (params.action === "add") {
        if (!params.track.type || !params.track.source) {
          return err("Track type and source required for add");
        }
        project.audio.tracks.push({
          id: params.track.id,
          type: params.track.type,
          source: params.track.source,
          volume: params.track.volume ?? 1.0,
          start_time: params.track.start_time,
          loop: params.track.loop,
          fade_in: params.track.fade_in,
          fade_out: params.track.fade_out,
        });
      } else if (params.action === "update") {
        const existing = project.audio.tracks.find((t) => t.id === params.track.id);
        if (!existing) return err("Track not found");
        if (params.track.volume !== undefined) existing.volume = params.track.volume;
        if (params.track.source !== undefined) existing.source = params.track.source;
        if (params.track.loop !== undefined) existing.loop = params.track.loop;
        if (params.track.fade_in !== undefined) existing.fade_in = params.track.fade_in;
        if (params.track.fade_out !== undefined) existing.fade_out = params.track.fade_out;
      } else if (params.action === "remove") {
        project.audio.tracks = project.audio.tracks.filter((t) => t.id !== params.track.id);
      }

      await saveProject(project);
      return ok(project.audio);
    },
  );

  // ─────────────────────────────────────────────
  // generate - LLM generates a custom component
  // ─────────────────────────────────────────────

  server.tool(
    "generate",
    "Generate a custom component from a natural language description. The LLM writes a .component.html file. Optionally save to tenant library for reuse.",
    {
      tenant_id: z.string(),
      prompt: z.string().describe("Description of the component to generate. If 'source' is provided, saves it directly instead of returning a prompt."),
      source: z.string().optional().describe("If provided, saves this .component.html source to the tenant library (skip the prompt flow)"),
      type: z.string().optional().describe("Component type name when saving (kebab-case, e.g. 'slack-simulator')"),
      category: z.string().optional().describe("Category to save under (default: custom)"),
      duration: z.number().optional().describe("Animation duration in seconds for preview (default: 3)"),
    },
    async (params) => {
      try {
        // If source is provided, save it directly to the tenant library
        if (params.source) {
          const typeName = params.type || deriveTypeName(params.prompt);
          const savedPath = await saveGeneratedComponent(
            params.tenant_id,
            typeName,
            params.source,
            params.category || "custom",
          );

          // Generate preview
          let preview_path: string | undefined;
          try {
            const sceneAssembler = await import("./core/scene-assembler.js");
            const captureModule = await import("./core/capture.js");

            const scene = {
              id: "preview",
              label: "Preview",
              duration_seconds: params.duration || 3,
              components: [{ id: "comp_preview", type: typeName, data: {}, z_index: 10 }],
            };

            const html = await sceneAssembler.assembleScene({
              scene,
              components: [{ type: typeName, source: params.source }],
              brandKit: {
                colors: { primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA", background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8" },
                fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 800] }],
                style: { border_radius: "12px", motion: "cinematic" as const },
              },
              canvas: { width: 1920, height: 1080, preset: "landscape" as const, fps: 30, background: "#0f172a" },
              gsapDir: config.gsapDir,
            });

            const workDir = path.join(config.dataDir, params.tenant_id, "_previews");
            const htmlPath = path.join(workDir, `${typeName}.html`);
            preview_path = path.join(workDir, `${typeName}.png`);

            await fs.mkdir(workDir, { recursive: true });
            await fs.writeFile(htmlPath, html);

            await captureModule.captureSingleFrame({
              htmlPath,
              outputPath: preview_path,
              width: 1920,
              height: 1080,
              atTime: (params.duration || 3) / 3,
            });
          } catch (previewErr) {
            console.error("Preview generation failed:", previewErr);
          }

          return ok({
            status: "saved",
            type: typeName,
            category: params.category || "custom",
            path: savedPath,
            preview_path,
          });
        }

        // No source provided -- return the component format spec so the
        // calling agent (which IS the LLM) can generate the source itself,
        // then call generate again with the source to save it.
        return ok({
          status: "prompt_ready",
          message: "Generate a .component.html file based on the description below. Then call 'generate' again with the source to save it.",
          component_format: {
            sections: ["<template>", "<style scoped>", "<script>"],
            function_signature: "function createTimeline(el, data, ctx)",
            ctx_fields: { duration: "number", fps: "number", canvas: "{width, height}", motion: "minimal|punchy|cinematic" },
            css_variables: [
              "--mp-color-primary", "--mp-color-secondary", "--mp-color-accent",
              "--mp-color-background", "--mp-color-surface",
              "--mp-color-text", "--mp-color-text-muted",
              "--mp-font-family", "--mp-border-radius",
            ],
            rules: [
              "Use gsap.timeline() NOT gsap.timeline({ paused: true })",
              "Use var not const/let",
              "Animate entrance, hold, and exit within ctx.duration",
              "Design for 1920x1080 canvas",
              "Use {{key}} for simple text binding",
              "Build dynamic DOM in createTimeline",
              "Logo URLs: https://img.logo.dev/{domain}?token=pk_B_cdrQLyTkSFPzSMm52goQ&format=png&size=128&theme=dark",
            ],
          },
          prompt: params.prompt,
          duration: params.duration || 3,
        });
      } catch (e: any) {
        return err(`Generate failed: ${e.message}`);
      }
    },
  );

  return server;
}

// ── Helpers ──

async function listComponentCatalog(): Promise<Array<{ type: string; category: string; label?: string; description?: string }>> {
  const catalog: Array<{ type: string; category: string; label?: string; description?: string }> = [];

  try {
    const categories = await fs.readdir(config.componentLibDir, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory() || cat.name === "shared") continue;
      const catDir = path.join(config.componentLibDir, cat.name);
      const files = await fs.readdir(catDir);

      for (const file of files) {
        if (!file.endsWith(".component.html")) continue;
        const type = file.replace(".component.html", "");

        // Try to load companion schema
        let label: string | undefined;
        let description: string | undefined;
        try {
          const schemaPath = path.join(catDir, `${type}.schema.json`);
          const schemaRaw = await fs.readFile(schemaPath, "utf-8");
          const schema = JSON.parse(schemaRaw);
          label = schema.label;
          description = schema.description;
        } catch { /* no schema */ }

        catalog.push({ type, category: cat.name, label, description });
      }
    }
  } catch { /* component dir doesn't exist */ }

  return catalog;
}

async function findComponentSource(type: string): Promise<string | null> {
  try {
    const categories = await fs.readdir(config.componentLibDir, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      const fp = path.join(config.componentLibDir, cat.name, `${type}.component.html`);
      try {
        return await fs.readFile(fp, "utf-8");
      } catch { /* not here */ }
    }
  } catch { /* no lib dir */ }
  return null;
}
