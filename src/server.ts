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
import { queueRender, getJobStatus, listJobs } from "./core/render-queue.js";
import { queueJob, getJob, listAllJobs } from "./core/job-queue.js";
import { TraceBuilder } from "./trace/index.js";
import { generateComponent, saveGeneratedComponent } from "./core/component-generator.js";
import { deriveTypeName } from "./llm/component-gen.js";
import { runGeneratePipeline, type PipelineTarget } from "./llm/pipeline.js";
import { llmConfigFromEnv } from "./llm/client.js";
import { config } from "./config.js";
import { projectDir, projectOutputDir, projectAssetsDir } from "./persistence/paths.js";
import path from "node:path";
import fs from "node:fs/promises";
import type { Scene, SceneComponent, BrandKit, Overlay } from "./core/types.js";
import { generateTTS } from "./audio/tts.js";
import { searchMusic, downloadTrack } from "./audio/music.js";
import { isAuthEnabled, validateToken } from "./auth/auth.js";
import { captureUrl } from "./core/capture-url.js";
import { generateImage } from "./media/image-gen.js";

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

const overlaySegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  mode: z.enum(["full", "pip", "audio-only"]),
  position: z.string().optional(),
  shape: z.string().optional(),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  lower_third: z.object({ name: z.string(), title: z.string().optional() }).optional(),
});

const overlaySchema = z.object({
  id: z.string(),
  type: z.enum(["speaker-video", "watermark", "logo"]),
  source: z.string(),
  position: z.string().optional(),
  size: z.object({ width: z.number(), height: z.number() }).optional(),
  shape: z.enum(["circle", "rounded-rect", "rect"]).optional(),
  border: z.object({ color: z.string(), width: z.number() }).optional(),
  opacity: z.number().optional(),
  margin: z.number().optional(),
  start_time: z.number().optional(),
  end_time: z.number().nullable().optional(),
  segments: z.array(overlaySegmentSchema).optional(),
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
      target: z.enum(["project", "brand_kit", "job", "jobs"]).optional().describe("What to get (default: project). Use 'job' with job_id for single job status, 'jobs' for all tenant jobs."),
      job_id: z.string().optional().describe("Job ID to check status (use with target='job')"),
      job_type: z.enum(["render", "generate"]).optional().describe("Filter jobs by type (use with target='jobs')"),
    },
    async (params) => {
      const target = params.target || "project";

      if (target === "brand_kit") {
        const kit = await loadBrandKit(params.tenant_id);
        return ok(kit || { message: "No brand kit configured" });
      }

      if (target === "job") {
        if (!params.job_id) return err("job_id required for target='job'");
        const job = getJob(params.job_id);
        if (!job) return err("Job not found");
        return ok(job);
      }

      if (target === "jobs") {
        const jobs = listAllJobs(params.tenant_id, params.job_type);
        return ok(jobs);
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

      // Overlay fields (when adding an overlay to the project)
      overlay: overlaySchema.optional(),
    },
    async (params) => {
      if (params.overlay) {
        // Adding an overlay to the project
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err("Project not found");
        if (!project.overlays) project.overlays = [];
        project.overlays.push(params.overlay as Overlay);
        await saveProject(project);
        return ok(project);
      }

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

      return err("Provide either 'scene' (to add a scene), 'scene_id' + 'component' (to add a component), or 'overlay' (to add an overlay)");
    },
  );

  // ─────────────────────────────────────────────
  // update - Update project, scene, or component
  // ─────────────────────────────────────────────

  server.tool(
    "update",
    "Update a project, scene, component, or overlay. Infers target from which IDs are provided: project_id only = update project, + scene_id = update scene, + component_id = update component, + overlay_id = update overlay.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string().optional(),
      component_id: z.string().optional(),
      overlay_id: z.string().optional().describe("If provided, updates this overlay"),

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

      // Overlay-level updates
      overlay_source: z.string().optional(),
      overlay_position: z.string().optional(),
      overlay_size: z.object({ width: z.number(), height: z.number() }).optional(),
      overlay_shape: z.enum(["circle", "rounded-rect", "rect"]).optional(),
      overlay_border: z.object({ color: z.string(), width: z.number() }).optional(),
      overlay_opacity: z.number().optional(),
      overlay_segments: z.array(overlaySegmentSchema).optional(),
      overlay_start_time: z.number().optional(),
      overlay_end_time: z.number().nullable().optional(),
    },
    async (params) => {
      // Overlay update
      if (params.overlay_id) {
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err("Project not found");
        const overlay = project.overlays?.find((o) => o.id === params.overlay_id);
        if (!overlay) return err("Overlay not found");

        if (params.overlay_source !== undefined) overlay.source = params.overlay_source;
        if (params.overlay_position !== undefined) overlay.position = params.overlay_position;
        if (params.overlay_size !== undefined) overlay.size = params.overlay_size;
        if (params.overlay_shape !== undefined) overlay.shape = params.overlay_shape;
        if (params.overlay_border !== undefined) overlay.border = params.overlay_border;
        if (params.overlay_opacity !== undefined) overlay.opacity = params.overlay_opacity;
        if (params.overlay_segments !== undefined) overlay.segments = params.overlay_segments as Overlay["segments"];
        if (params.overlay_start_time !== undefined) overlay.start_time = params.overlay_start_time;
        if (params.overlay_end_time !== undefined) overlay.end_time = params.overlay_end_time;

        await saveProject(project);
        return ok(project);
      }

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
    "Remove a project, scene, component, or overlay. Infers target from which IDs are provided.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string().optional(),
      component_id: z.string().optional(),
      overlay_id: z.string().optional().describe("If provided, removes this overlay"),
    },
    async (params) => {
      // Remove overlay
      if (params.overlay_id) {
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err("Project not found");
        if (!project.overlays) return err("No overlays on project");
        const idx = project.overlays.findIndex((o) => o.id === params.overlay_id);
        if (idx === -1) return err("Overlay not found");
        project.overlays.splice(idx, 1);
        await saveProject(project);
        return ok({ removed: "overlay", overlay_id: params.overlay_id });
      }

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
      critique: z.boolean().optional().default(false).describe("Run critiquer loop on each scene during render"),
      maxRevisions: z.number().optional().default(2).describe("Max critique revision iterations per scene"),
      originalPrompt: z.string().optional().describe("Original prompt for context in critique"),
      token: z.string().optional().describe("Auth token (required when AUTH_TOKENS is configured)"),
    },
    async (params) => {
      // Auth check
      if (isAuthEnabled()) {
        if (!params.token) return err("Authentication required: provide a token");
        const tokenTenant = validateToken(params.token);
        if (!tokenTenant) return err("Invalid token");
      }
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

      // Full project render -- queue it and return immediately
      if (project.scenes.length === 0) return err("Project has no scenes");

      const job = queueRender(params.tenant_id, params.project_id, {
        quality: params.quality,
        critique: params.critique,
        maxRevisions: params.maxRevisions,
        originalPrompt: params.originalPrompt,
      });

      return ok({
        status: "queued",
        job_id: job.id,
        project_id: project.project_id,
        message: "Render queued. Use get(target='job', job_id='" + job.id + "') to check status.",
      });
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
    "Add, update, or remove audio tracks (voiceover, music, SFX) on a project. For voiceover tracks, provide 'text' instead of 'source' to auto-generate TTS. Use sync_points with scene_id to store timing markers in a scene's audio_hints.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      action: z.enum(["add", "update", "remove", "search"]).describe("Action to perform. Use 'search' to search Jamendo music library."),
      query: z.string().optional().describe("Search query for music (use with action='search')"),
      mood: z.string().optional().describe("Mood filter for music search (e.g. 'happy', 'calm')"),
      genre: z.string().optional().describe("Genre filter for music search"),
      scene_id: z.string().optional().describe("Scene ID to attach sync_points to (stored in scene audio_hints)"),
      sync_points: z.array(z.object({
        at: z.number().describe("Time in seconds within the scene"),
        label: z.string().describe("Label for the sync point (e.g. 'feature-reveal', 'stat-counter')"),
      })).optional().describe("Timing sync points to store in the scene's audio_hints for animation synchronization"),
      track: z.object({
        id: z.string(),
        type: z.enum(["voiceover", "music", "sfx"]).optional(),
        source: z.string().optional().describe("Audio file path. Omit for voiceover with text."),
        text: z.string().optional().describe("Text to generate TTS voiceover from (type must be voiceover)"),
        voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional().describe("TTS voice (default: nova)"),
        volume: z.number().min(0).max(1).optional(),
        start_time: z.number().optional(),
        loop: z.boolean().optional(),
        fade_in: z.number().optional(),
        fade_out: z.number().optional(),
      }),
      ducking: z.object({
        enabled: z.boolean(),
        duck_track: z.string().describe("Track ID to duck (usually music)"),
        trigger_track: z.string().describe("Track ID that triggers ducking (usually voiceover)"),
        ducked_volume: z.number().min(0).max(1).optional(),
        attack: z.number().optional(),
        release: z.number().optional(),
      }).optional().describe("Configure audio ducking"),
    },
    async (params) => {
      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) return err("Project not found");

      // Handle search action (no project needed)
      if (params.action === "search") {
        if (!params.query) return err("query required for search action");
        try {
          const results = await searchMusic(params.query, {
            mood: params.mood,
            genre: params.genre,
          });
          return ok(results);
        } catch (e: any) {
          return err(`Music search failed: ${e.message}`);
        }
      }

      if (!project.audio) {
        project.audio = { tracks: [] };
      }

      if (params.action === "add") {
        if (!params.track.type) {
          return err("Track type required for add");
        }

        let source = params.track.source;

        // Auto-generate TTS if type is voiceover and text is provided without a source
        if (params.track.type === "voiceover" && params.track.text && !source) {
          const assetsDir = projectAssetsDir(params.tenant_id, params.project_id);
          const audioDir = path.join(assetsDir, "audio");
          await fs.mkdir(audioDir, { recursive: true });

          const outputPath = path.join(audioDir, `${params.track.id}.mp3`);
          await generateTTS({
            text: params.track.text,
            voice: params.track.voice || "nova",
            outputPath,
          });
          source = outputPath;
        }

        // Download from Jamendo if source starts with "jamendo:"
        if (!source && params.track.source && params.track.source.startsWith("jamendo:")) {
          const trackId = params.track.source.replace("jamendo:", "");
          const assetsDir = projectAssetsDir(params.tenant_id, params.project_id);
          const audioDir = path.join(assetsDir, "audio");
          await fs.mkdir(audioDir, { recursive: true });
          const outputPath = path.join(audioDir, `jamendo_${trackId}.mp3`);
          try {
            await downloadTrack(trackId, outputPath);
            source = outputPath;
          } catch (e: any) {
            return err(`Failed to download Jamendo track: ${e.message}`);
          }
        }

        if (!source) {
          return err("Track source or text (for voiceover) required for add");
        }

        project.audio.tracks.push({
          id: params.track.id,
          type: params.track.type,
          source,
          volume: params.track.volume ?? 1.0,
          start_time: params.track.start_time,
          loop: params.track.loop,
          fade_in: params.track.fade_in,
          fade_out: params.track.fade_out,
        });
      } else if (params.action === "update") {
        const existing = project.audio.tracks.find((t) => t.id === params.track.id);
        if (!existing) return err("Track not found");

        // If updating voiceover with new text, regenerate TTS
        if (existing.type === "voiceover" && params.track.text) {
          const assetsDir = projectAssetsDir(params.tenant_id, params.project_id);
          const audioDir = path.join(assetsDir, "audio");
          await fs.mkdir(audioDir, { recursive: true });

          const outputPath = path.join(audioDir, `${existing.id}.mp3`);
          await generateTTS({
            text: params.track.text,
            voice: params.track.voice || "nova",
            outputPath,
          });
          existing.source = outputPath;
        }

        if (params.track.volume !== undefined) existing.volume = params.track.volume;
        if (params.track.source !== undefined) existing.source = params.track.source;
        if (params.track.loop !== undefined) existing.loop = params.track.loop;
        if (params.track.fade_in !== undefined) existing.fade_in = params.track.fade_in;
        if (params.track.fade_out !== undefined) existing.fade_out = params.track.fade_out;
      } else if (params.action === "remove") {
        project.audio.tracks = project.audio.tracks.filter((t) => t.id !== params.track.id);
      }

      // Update ducking config if provided
      if (params.ducking) {
        project.audio.ducking = {
          enabled: params.ducking.enabled,
          duck_track: params.ducking.duck_track,
          trigger_track: params.ducking.trigger_track,
          ducked_volume: params.ducking.ducked_volume ?? 0.1,
          attack: params.ducking.attack ?? 0.3,
          release: params.ducking.release ?? 0.5,
        };
      }

      // Store sync_points in scene audio_hints if provided
      if (params.scene_id && params.sync_points && params.sync_points.length > 0) {
        const scene = project.scenes.find((s) => s.id === params.scene_id);
        if (scene) {
          if (!scene.audio_hints) {
            scene.audio_hints = {};
          }
          scene.audio_hints.sync_points = params.sync_points;
        }
      }

      // Store voiceover text in scene audio_hints if adding voiceover with text and scene_id
      if (params.scene_id && params.action === "add" && params.track.type === "voiceover" && params.track.text) {
        const scene = project.scenes.find((s) => s.id === params.scene_id);
        if (scene) {
          if (!scene.audio_hints) {
            scene.audio_hints = {};
          }
          scene.audio_hints.voiceover_text = params.track.text;
        }
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
    "Generate content from a natural language description. Can generate a single component, a scene, a full video, an image, or a deck/presentation. Uses LLM pipeline when no source is provided.",
    {
      tenant_id: z.string(),
      prompt: z.string().describe("Description of what to generate"),
      target: z.enum(["component", "scene", "video", "image", "deck", "presentation", "ai_image"]).optional().default("video").describe("What to generate (default: video). Use ai_image for AI-generated images via OpenAI."),
      source: z.string().optional().describe("If provided, saves this .component.html source directly (skip LLM)"),
      type: z.string().optional().describe("Component type name when saving (kebab-case)"),
      category: z.string().optional().describe("Category to save under (default: custom)"),
      critique: z.boolean().optional().default(false).describe("Run the critiquer loop on generated output"),
      mode: z.enum(["freeform", "structured"]).optional().describe("DEPRECATED: use creativity instead. freeform = creativity 0.9, structured = creativity 0.2"),
      creativity: z.number().min(0).max(1).optional().describe("Creativity level 0-1. Low = prefer library components, high = prefer custom generation. Default 0.5"),
      scene_count: z.number().optional().describe("Target number of scenes for video/deck"),
      generate_images: z.boolean().optional().default(true).describe("Generate AI hero images during planning (requires OpenAI key)"),
      duration: z.number().optional().describe("Animation duration in seconds for preview (default: 3)"),
      image_size: z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).optional().describe("Image size for ai_image target"),
      image_quality: z.enum(["low", "medium", "high", "auto"]).optional().describe("Image quality for ai_image target"),
      image_model: z.enum(["gpt-image-1", "dall-e-3"]).optional().describe("Image model for ai_image target"),
      token: z.string().optional().describe("Auth token (required when AUTH_TOKENS is configured)"),
    },
    async (params) => {
      // Auth check
      if (isAuthEnabled()) {
        if (!params.token) return err("Authentication required: provide a token");
        const tokenTenant = validateToken(params.token);
        if (!tokenTenant) return err("Invalid token");
      }
      try {
        // ── AI Image Generation (synchronous) ──
        if (params.target === 'ai_image') {
          const timestamp = Date.now();
          const assetsDir = path.join(config.dataDir, params.tenant_id, 'assets', 'generated');
          const outputPath = path.join(assetsDir, `img_${timestamp}.png`);

          const result = await generateImage({
            prompt: params.prompt,
            model: params.image_model || 'gpt-image-1',
            size: params.image_size || '1536x1024',
            quality: params.image_quality || 'high',
            outputPath,
          });

          // If project_id is provided via prompt metadata, copy to project assets
          // (for now, the generated asset lives in the tenant assets dir)

          return ok({
            status: 'completed',
            type: 'ai_image',
            path: result.path,
            width: result.width,
            height: result.height,
            revised_prompt: result.revised_prompt,
          });
        }

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

        // No source provided -- run the LLM pipeline async via job queue
        let llmConfig;
        try {
          llmConfig = llmConfigFromEnv();
        } catch (e: any) {
          return err(`LLM not configured: ${e.message}`);
        }

        const brandKit = await loadBrandKit(params.tenant_id);
        const job = queueJob("generate", params.tenant_id, async (j) => {
          const trace = new TraceBuilder("generate", params.tenant_id, "", params.prompt);
          try {
            j.progress = { step: "running_pipeline", percent: 10 };
            const pipelineResult = await runGeneratePipeline({
              prompt: params.prompt,
              target: params.target as PipelineTarget,
              tenant_id: params.tenant_id,
              llmConfig,
              brandKit: brandKit || {
                colors: { primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA", background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8" },
                fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 800] }],
                style: { border_radius: "12px", motion: "cinematic" as const },
              },
              canvas: { width: 1920, height: 1080, preset: "landscape" as const, fps: 30, background: "#0f172a" },
              critique: params.critique,
              sceneCount: params.scene_count,
              mode: params.mode,
              creativity: params.creativity,
          generateImages: params.generate_images,
            });

            // If pipeline created a project, track the projectId
            if (pipelineResult && typeof pipelineResult === "object" && "project_id" in (pipelineResult as any)) {
              j.projectId = (pipelineResult as any).project_id;
            }

            j.progress = { step: "complete", percent: 100 };
            trace.setOutcome("success");
            return pipelineResult;
          } catch (pipelineErr: any) {
            trace.setOutcome("failed", pipelineErr.message);
            throw pipelineErr;
          } finally {
            trace.finish();
          }
        });

        return ok({
          status: "queued",
          job_id: job.id,
          message: "Use get(target='job', job_id='" + job.id + "') to check status.",
        });
      } catch (e: any) {
        return err(`Generate failed: ${e.message}`);
      }
    },
  );


  // ─────────────────────────────────────────────
  // job - Dedicated job management tool
  // ─────────────────────────────────────────────

  server.tool(
    "job",
    "Check or wait for any async job (generate, render). action=status to poll, action=wait to block until done or timeout, action=list to list jobs for a tenant.",
    {
      action: z.enum(["status", "wait", "list"]),
      job_id: z.string().optional().describe("Job ID to check (required for status/wait)"),
      tenant_id: z.string().optional().describe("Tenant ID (required for list)"),
      job_type: z.enum(["render", "generate"]).optional().describe("Filter by job type (for list)"),
      timeout_seconds: z.number().optional().default(120).describe("Max seconds to wait (for wait action, default 120)"),
    },
    async (params) => {
      if (params.action === "list") {
        if (!params.tenant_id) return err("tenant_id required for list");
        const jobs = listAllJobs(params.tenant_id, params.job_type);
        return ok(jobs);
      }

      if (params.action === "status") {
        if (!params.job_id) return err("job_id required for status");
        const job = getJob(params.job_id);
        if (!job) return err("Job not found");
        return ok(job);
      }

      if (params.action === "wait") {
        if (!params.job_id) return err("job_id required for wait");
        const timeoutMs = (params.timeout_seconds || 120) * 1000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const job = getJob(params.job_id);
          if (!job) return err("Job not found");
          if (job.status === "completed" || job.status === "failed") {
            return ok(job);
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        // Timeout -- return current state
        const job = getJob(params.job_id);
        return ok({
          ...job,
          _timeout: true,
          message: "Wait timed out. Job is still " + (job?.status || "unknown"),
        });
      }

      return err("Unknown action");
    },
  );

  // ─────────────────────────────────────────────
  // capture - Screenshot URLs for component creation
  // ─────────────────────────────────────────────

  server.tool(
    "capture",
    "Capture a screenshot of a URL. Can save as a project asset or create an image-showcase component from it.",
    {
      tenant_id: z.string(),
      url: z.string().describe("URL to screenshot"),
      project_id: z.string().optional().describe("Project to save asset to (optional)"),
      viewport_width: z.number().optional().default(1920).describe("Viewport width"),
      viewport_height: z.number().optional().default(1080).describe("Viewport height"),
      full_page: z.boolean().optional().default(false).describe("Capture full scrollable page"),
      selector: z.string().optional().describe("CSS selector to capture (captures only that element)"),
      delay_ms: z.number().optional().default(2000).describe("Wait ms after page load before capture"),
      create_component: z.boolean().optional().default(false).describe("Auto-create an image-showcase component using the screenshot"),
      token: z.string().optional(),
    },
    async (params) => {
      // Auth check
      if (isAuthEnabled()) {
        if (!params.token) return err("Authentication required: provide a token");
        const tokenTenant = validateToken(params.token);
        if (!tokenTenant) return err("Invalid token");
      }

      const timestamp = Date.now();
      const captureDir = path.join(config.dataDir, params.tenant_id, "assets", "captures");
      const outputPath = path.join(captureDir, `capture_${timestamp}.png`);

      try {
        const result = await captureUrl({
          url: params.url,
          outputPath,
          width: params.viewport_width,
          height: params.viewport_height,
          fullPage: params.full_page,
          selector: params.selector,
          delayMs: params.delay_ms,
        });

        // If project_id provided, also copy to project assets dir
        if (params.project_id) {
          const projAssetsDir = projectAssetsDir(params.tenant_id, params.project_id);
          const projCapturePath = path.join(projAssetsDir, "captures", `capture_${timestamp}.png`);
          await fs.mkdir(path.dirname(projCapturePath), { recursive: true });
          await fs.copyFile(outputPath, projCapturePath);
        }

        // If create_component requested, create an image-showcase component entry
        if (params.create_component && params.project_id) {
          const project = await loadProject(params.tenant_id, params.project_id);
          if (project && project.scenes.length > 0) {
            const scene = project.scenes[project.scenes.length - 1];
            const compId = `comp_capture_${timestamp}`;
            const component: SceneComponent = {
              id: compId,
              type: "image-showcase",
              data: {
                src: result.path,
                alt: `Screenshot of ${params.url}`,
                width: result.width,
                height: result.height,
              },
              z_index: 10,
            };
            await addComponent(params.tenant_id, params.project_id, scene.id, component);
          }
        }

        return ok({
          status: "captured",
          path: result.path,
          width: result.width,
          height: result.height,
          url: params.url,
        });
      } catch (e: any) {
        return err(`Capture failed: ${e.message}`);
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
