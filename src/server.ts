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
// generateComponent / saveGeneratedComponent used by pipeline internally
import { runGeneratePipeline, type PipelineTarget } from "./llm/pipeline.js";
import { llmConfigFromEnv } from "./llm/client.js";
import { config } from "./config.js";
import { projectDir, projectOutputDir, projectAssetsDir } from "./persistence/paths.js";
import path from "node:path";
import fs from "node:fs/promises";
import type { Scene, SceneComponent, BrandKit, SpeakerTrack } from "./core/types.js";
import { generateTTS } from "./audio/tts.js";
import { searchMusic, downloadTrack } from "./audio/music.js";
import { isAuthEnabled, validateToken } from "./auth/auth.js";
import { captureUrl } from "./core/capture-url.js";
import { registerBrandExtractTool } from "./tools/brand-extract-tool.js";
// generateImage moved to internal API (not exposed via MCP generate tool)

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

/** Build the preview SPA URL for a tenant + project. */
function previewUrl(tenantId: string, projectId: string): string {
  return `${config.publicUrl}/preview?tenant=${encodeURIComponent(tenantId)}&project=${encodeURIComponent(projectId)}`;
}

/** Enrich a job object with preview_url when tenant and project are known. */
function jobWithPreview(job: Record<string, unknown>): Record<string, unknown> {
  const tenantId = job.tenantId as string | undefined;
  const projectId = job.projectId as string | undefined;
  if (tenantId && projectId) {
    return { ...job, preview_url: previewUrl(tenantId, projectId) };
  }
  return job;
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
    "Create a new media project (video, image, presentation, one-pager, slideshow, gif, social)",
    {
      tenant_id: z.string().describe("Tenant identifier"),
      name: z.string().describe("Project name"),
      format: z.enum(["video", "image", "slideshow", "presentation", "one-pager", "gif", "social", "email-header", "thumbnail"]).describe("Output format"),
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
        return ok(jobWithPreview(job as unknown as Record<string, unknown>));
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


      // Speaker track (when setting a speaker track on the project)
      speaker_track: z.object({
        clips: z.array(z.object({
          source: z.string(),
          start: z.number().optional(),
          trim_start: z.number().optional(),
          trim_end: z.number().optional(),
        })),
      }).optional().describe("Speaker track: continuous speaker video as base layer with content overlaid on top. To show the speaker as PiP inside a component, set the component data prop \"source\" or \"pip_source\" to the string \"speaker\" — the render pipeline resolves it to the actual speaker video path automatically."),
    },
    async (params) => {
      if (params.speaker_track) {
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err("Project not found");
        project.speaker_track = params.speaker_track as SpeakerTrack;
        await saveProject(project);
        return ok({ message: "Speaker track set", speaker_track: project.speaker_track });
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

      return err("Provide either 'scene' (to add a scene), 'scene_id' + 'component' (to add a component)");
    },
  );

  // ─────────────────────────────────────────────
  // update - Update project, scene, or component
  // ─────────────────────────────────────────────

  server.tool(
    "update",
    "Update a project, scene, component, or plan. Infers target from which IDs are provided. Use provide_asset to upload assets for a planned scene. Use plan to directly edit the creative plan.",
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
      status: z.enum(["draft", "planned", "generated", "rendering", "rendered", "failed"]).optional(),

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

      // Speaker track update
      speaker_track: z.object({
        clips: z.array(z.object({
          source: z.string(),
          start: z.number().optional(),
          trim_start: z.number().optional(),
          trim_end: z.number().optional(),
        })).optional(),
      }).optional().describe("Update speaker track configuration. To show the speaker as PiP inside a component, set the component data prop \"source\" or \"pip_source\" to \"speaker\" — resolved automatically at render time."),

      // Plan modifications (direct edits, no LLM)
      plan: z.object({
        narrative: z.string().optional(),
        estimated_duration: z.number().optional(),
        audio: z.object({
          music_mood: z.string().optional(),
          voice: z.string().optional(),
          pacing: z.enum(["slow", "moderate", "fast"]).optional(),
        }).optional(),
        scenes: z.array(z.object({
          index: z.number().optional().describe("Index of existing scene to update. Omit to append a new scene."),
          label: z.string().optional(),
          purpose: z.string().optional(),
          template: z.string().optional(),
          voiceover_text: z.string().optional(),
          duration_seconds: z.number().optional(),
          visual_notes: z.string().optional(),
        })).optional(),
        remove_scenes: z.array(z.number()).optional().describe("Indices of planned scenes to remove"),
        reorder_scenes: z.array(z.number()).optional().describe("Current indices in desired order"),
      }).optional().describe("Direct plan edits. Partial updates -- only fields you pass get changed. Works in planned state."),

      // Asset provision
      provide_asset: z.object({
        scene_index: z.number(),
        asset_index: z.number(),
        path: z.string(),
      }).optional().describe("Provide an asset for a planned scene. Updates status from 'needed' to 'provided'."),
    },
    async (params) => {
      // ── Plan modifications ──
      if (params.plan || params.provide_asset) {
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err("Project not found");

        if (params.plan) {
          if (!project.plan) {
            // Create a new plan from scratch
            project.plan = {
              narrative: params.plan.narrative || "",
              scenes: [],
              audio: {
                music_mood: params.plan.audio?.music_mood || "corporate",
                voice: params.plan.audio?.voice || "nova",
                pacing: (params.plan.audio?.pacing as any) || "moderate",
              },
              estimated_duration: params.plan.estimated_duration || 0,
            };
          }

          // Merge top-level fields
          if (params.plan.narrative !== undefined) project.plan.narrative = params.plan.narrative;
          if (params.plan.estimated_duration !== undefined) project.plan.estimated_duration = params.plan.estimated_duration;
          if (params.plan.audio) {
            if (params.plan.audio.music_mood !== undefined) project.plan.audio.music_mood = params.plan.audio.music_mood;
            if (params.plan.audio.voice !== undefined) project.plan.audio.voice = params.plan.audio.voice;
            if (params.plan.audio.pacing !== undefined) project.plan.audio.pacing = params.plan.audio.pacing;
          }

          // Remove scenes (process before adds/updates, use descending order)
          if (params.plan.remove_scenes?.length) {
            const toRemove = [...params.plan.remove_scenes].sort((a, b) => b - a);
            for (const idx of toRemove) {
              if (idx >= 0 && idx < project.plan.scenes.length) {
                project.plan.scenes.splice(idx, 1);
              }
            }
          }

          // Reorder scenes
          if (params.plan.reorder_scenes?.length) {
            const order = params.plan.reorder_scenes;
            const reordered = order
              .filter(i => i >= 0 && i < project.plan!.scenes.length)
              .map(i => project.plan!.scenes[i]);
            if (reordered.length === project.plan.scenes.length) {
              project.plan.scenes = reordered;
            }
          }

          // Update or append scenes
          if (params.plan.scenes?.length) {
            for (const sceneUpdate of params.plan.scenes) {
              if (sceneUpdate.index !== undefined && sceneUpdate.index < project.plan.scenes.length) {
                // Update existing scene
                const existing = project.plan.scenes[sceneUpdate.index];
                if (sceneUpdate.label !== undefined) existing.label = sceneUpdate.label;
                if (sceneUpdate.purpose !== undefined) existing.purpose = sceneUpdate.purpose;
                if (sceneUpdate.template !== undefined) existing.template = sceneUpdate.template;
                if (sceneUpdate.voiceover_text !== undefined) existing.voiceover_text = sceneUpdate.voiceover_text;
                if (sceneUpdate.duration_seconds !== undefined) existing.duration_seconds = sceneUpdate.duration_seconds;
                if (sceneUpdate.visual_notes !== undefined) existing.visual_notes = sceneUpdate.visual_notes;
              } else {
                // Append new scene
                project.plan.scenes.push({
                  label: sceneUpdate.label || "New Scene",
                  purpose: sceneUpdate.purpose || "",
                  template: sceneUpdate.template || "C1",
                  voiceover_text: sceneUpdate.voiceover_text,
                  duration_seconds: sceneUpdate.duration_seconds || 5,
                  assets: [],
                  visual_notes: sceneUpdate.visual_notes || "",
                });
              }
            }
          }

          // Recalculate estimated duration
          project.plan.estimated_duration = project.plan.scenes.reduce(
            (sum, s) => sum + s.duration_seconds, 0
          );

          project.status = "planned";
        }

        // Asset provision
        if (params.provide_asset) {
          if (!project.plan) return err("Project has no plan");
          const { scene_index, asset_index, path } = params.provide_asset;
          if (scene_index < 0 || scene_index >= project.plan.scenes.length) {
            return err(`Invalid scene_index: ${scene_index}`);
          }
          const scene = project.plan.scenes[scene_index];
          if (asset_index < 0 || asset_index >= scene.assets.length) {
            return err(`Invalid asset_index: ${asset_index}`);
          }
          scene.assets[asset_index].status = "provided";
          scene.assets[asset_index].path = path;
        }

        project.updated_at = new Date().toISOString();
        await saveProject(project);
        return ok({ status: "updated", project_id: project.project_id, plan: project.plan });
      }

      // ── Property updates (status, name, canvas, scene/component props) ──
      {
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err("Project not found");

        let updated = false;

        if (params.status !== undefined) {
          project.status = params.status;
          updated = true;
        }
        if (params.name !== undefined) {
          project.name = params.name;
          updated = true;
        }
        if (params.canvas !== undefined) {
          Object.assign(project.canvas, params.canvas);
          updated = true;
        }

        // Scene-level property updates (non-removal)
        if (params.scene_id && !params.component_id) {
          const scene = project.scenes.find((s: any) => s.id === params.scene_id);
          if (!scene) return err("Scene not found");
          if (params.label !== undefined) { scene.label = params.label; updated = true; }
          if (params.duration_seconds !== undefined) { scene.duration_seconds = params.duration_seconds; updated = true; }
          if (params.background !== undefined) { scene.background = params.background; updated = true; }
          if (params.transition_in !== undefined) { scene.transition_in = params.transition_in; updated = true; }
          if (params.speaker_track !== undefined) { project.speaker_track = params.speaker_track as any; updated = true; }
        }

        // Component-level property updates (non-removal)
        if (params.scene_id && params.component_id) {
          const scene = project.scenes.find((s: any) => s.id === params.scene_id);
          if (!scene) return err("Scene not found");
          const comp = scene.components.find((c: any) => c.id === params.component_id);
          if (!comp) return err("Component not found");
          if (params.data !== undefined) { Object.assign(comp.data, params.data); updated = true; }
          if (params.position !== undefined) { comp.position = params.position; updated = true; }
          if (params.z_index !== undefined) { comp.z_index = params.z_index; updated = true; }
          if (params.enter !== undefined) { comp.enter = params.enter; updated = true; }
          if (params.exit !== undefined) { comp.exit = params.exit; updated = true; }
        }

        if (updated) {
          project.updated_at = new Date().toISOString();
          await saveProject(project);
          return ok({ status: "updated", project_id: project.project_id });
        }
      }

      // ── Existing update logic (removals) ──

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
      logos: z.array(z.object({
        name: z.string(),
        url: z.string(),
        variant: z.enum(["full", "icon", "wordmark"]),
        theme: z.enum(["dark", "light", "any"]),
        height: z.number().optional(),
      })).optional().describe("Logo variants (full, icon, wordmark) for different backgrounds"),
      assets: z.array(z.object({
        name: z.string(),
        url: z.string(),
        type: z.enum(["background", "intro", "outro", "watermark", "music"]).describe("Asset type"),
        tags: z.array(z.string()).optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        duration: z.number().optional().describe("Duration in seconds (video/audio assets)"),
      })).optional().describe("Brand assets (backgrounds, intros, outros, watermarks, music)"),
      style: z.object({
        border_radius: z.string().optional(),
        motion: z.enum(["minimal", "punchy", "cinematic"]).optional(),
      }).optional(),
      guidelines: z.string().optional().describe("Free-form brand rules for the AI (e.g. logo placement, color usage, tone). Injected into generation prompts."),
    },
    async (params) => {
      const hasUpdates = params.colors || params.fonts || params.logo || params.logos || params.assets || params.style || params.guidelines;

      if (!hasUpdates) {
        // Get brand kit
        const kit = await loadBrandKit(params.tenant_id);
        return ok(kit || { message: "No brand kit configured" });
      }

      // Set/update brand kit
      const existing = await loadBrandKit(params.tenant_id);
      // Merge logos: append new, replace by name
      let mergedLogos = existing?.logos || [];
      if (params.logos) {
        for (const newLogo of params.logos) {
          const idx = mergedLogos.findIndex((l: any) => l.name === newLogo.name);
          if (idx >= 0) mergedLogos[idx] = newLogo as any;
          else mergedLogos.push(newLogo as any);
        }
      }

      // Merge assets: append new, replace by name+type
      let mergedAssets: any[] = existing?.assets || [];
      if (params.assets) {
        for (const newAsset of params.assets) {
          const idx = mergedAssets.findIndex((a: any) => a.name === newAsset.name && a.type === newAsset.type);
          if (idx >= 0) mergedAssets[idx] = newAsset as any;
          else mergedAssets.push(newAsset as any);
        }
      }

      // Determine primary logo: explicit logo param > first "full" variant in logos > existing
      let primaryLogo: import("./core/types.js").BrandLogo | undefined = existing?.logo;
      if (params.logo) {
        // Coerce old-style logo param into new BrandLogo shape
        primaryLogo = {
          name: "primary",
          url: params.logo.url,
          variant: "full" as const,
          theme: "any" as const,
          height: params.logo.height,
          placement: params.logo.placement,
        };
      }
      if (mergedLogos.length > 0 && !params.logo) {
        const fullLogo = mergedLogos.find((l: any) => l.variant === "full");
        if (fullLogo) {
          primaryLogo = fullLogo as any;
        }
      }

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
        logo: primaryLogo,
        logos: mergedLogos.length > 0 ? mergedLogos : undefined,
        assets: mergedAssets.length > 0 ? mergedAssets : undefined,
        style: {
          border_radius: "12px",
          motion: "cinematic" as const,
          ...existing?.style,
          ...params.style,
        },
        guidelines: params.guidelines ?? existing?.guidelines,
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
      format: z.enum(["video", "image", "slideshow", "gif", "social", "email-header", "thumbnail"]).optional().describe("Override output format (default: project format)"),
      audio_only: z.boolean().optional().describe("Skip scene rendering; only (re-)apply audio mix + overlays to the existing rendered video. Requires a prior full render."),

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

      // Status gating
      if (project.status === "draft") {
        return err("Project needs a plan first. Run generate with mode='plan' to create a creative plan.");
      }
      if (project.status === "planned") {
        return err("Project has a plan but scenes haven't been generated yet. Run generate with mode='generate' to build scenes from the plan.");
      }

      // Scene preview
      if (params.scene_id) {
        const scene = project.scenes.find((s) => s.id === params.scene_id);
        if (!scene) return err("Scene not found");

        try {
          const sceneAssembler = await import("./core/scene-assembler.js");
          const captureModule = await import("./core/capture.js");

          const types = new Set(scene.components.map((c) => c.type));
          const projectComponentsDir = path.join(projectDir(params.tenant_id, params.project_id), "components");
          const components: Array<{ type: string; source: string }> = [];
          for (const t of types) {
            const source = await findComponentSource(t, [projectComponentsDir]);
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

      // Apply format override if specified (e.g. render video project as social batch)
      if (params.format && params.format !== project.format) {
        project.format = params.format;
        const { saveProject } = await import("./persistence/project.js");
        await saveProject(project);
      }

      const job = queueRender(params.tenant_id, params.project_id, {
        quality: params.quality,
        audioOnly: params.audio_only,
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
      const target = params.target || "project";

      if (target === "brand") {
        if (!params.url) return err("url is required for brand asset upload");
        const assetType = params.asset_type || "other";

        // Download the file from URL
        try {
          const response = await fetch(params.url);
          if (!response.ok) return err(`Failed to download: HTTP ${response.status}`);
          const buffer = Buffer.from(await response.arrayBuffer());

          // Determine filename
          const filename = params.name.includes(".") ? params.name : `${params.name}.${guessExtension(response.headers.get("content-type") || "")}`;

          // Save to brand-kit assets directory
          const assetDir = path.join(config.dataDir, params.tenant_id, "brand-kit", "assets", assetType);
          await fs.mkdir(assetDir, { recursive: true });
          const filePath = path.join(assetDir, filename);
          await fs.writeFile(filePath, buffer);

          // Return the served URL
          const servedUrl = `/assets/${params.tenant_id}/brand-kit/${assetType}/${filename}`;

          // Auto-register in brand kit metadata
          const brandAssetTypes = ["background", "intro", "outro", "watermark", "music"];
          if (brandAssetTypes.includes(assetType)) {
            try {
              const kit = await loadBrandKit(params.tenant_id) || {
                colors: { primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA", background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8" },
                fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 800] }],
                style: { border_radius: "12px", motion: "cinematic" as const },
              };
              if (!kit.assets) kit.assets = [];

              // Probe media metadata via ffprobe
              let assetWidth: number | undefined;
              let assetHeight: number | undefined;
              let assetDuration: number | undefined;
              try {
                const { execFile: execFileCb } = await import("node:child_process");
                const { promisify } = await import("node:util");
                const execFileP = promisify(execFileCb);
                const probe = await execFileP("ffprobe", [
                  "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath,
                ]);
                const probeData = JSON.parse(probe.stdout);
                const videoStream = probeData.streams?.find((s: any) => s.codec_type === "video");
                if (videoStream) {
                  assetWidth = videoStream.width;
                  assetHeight = videoStream.height;
                }
                const imageStream = !videoStream && probeData.streams?.find((s: any) => s.codec_type === "video" || s.codec_name === "png" || s.codec_name === "mjpeg");
                if (imageStream && !assetWidth) {
                  assetWidth = imageStream.width;
                  assetHeight = imageStream.height;
                }
                if (probeData.format?.duration) {
                  assetDuration = parseFloat(probeData.format.duration);
                }
              } catch { /* probe failed, skip metadata */ }

              // ── Normalize video keyframes for seekability ──
              // Chromium headless can only seek to keyframes. Re-encode if too sparse.
              if (assetDuration && assetDuration > 0.5) {
                try {
                  const { execFile: execFileCb2 } = await import("node:child_process");
                  const { promisify: promisify2 } = await import("node:util");
                  const execFileP2 = promisify2(execFileCb2);
                  const kfProbe = await execFileP2("ffprobe", [
                    "-v", "quiet", "-select_streams", "v",
                    "-show_entries", "packet=flags",
                    "-of", "csv", filePath,
                  ]);
                  const keyframeCount = (kfProbe.stdout.match(/K/g) || []).length;
                  const totalFrames = (kfProbe.stdout.trim().split("\n") || []).length;
                  const keyframeInterval = totalFrames > 0 ? totalFrames / Math.max(keyframeCount, 1) : 0;
                  // Re-encode if keyframes are more than 1 second apart
                  if (keyframeInterval > 30 || keyframeCount <= 1) {
                    console.log(`  Video keyframe normalization: ${keyframeCount} keyframes in ${totalFrames} frames (interval: ${keyframeInterval.toFixed(0)}). Re-encoding with -g 15...`);
                    const tmpPath = filePath + ".tmp.mp4";
                    await execFileP2("ffmpeg", [
                      "-y", "-i", filePath,
                      "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.0",
                      "-preset", "medium", "-crf", "18",
                      "-g", "15", "-keyint_min", "15",
                      "-pix_fmt", "yuv420p",
                      "-c:a", "aac", "-b:a", "192k",
                      "-movflags", "+faststart",
                      tmpPath,
                    ], { maxBuffer: 50 * 1024 * 1024 });
                    const fsMod = await import("node:fs/promises");
                    await fsMod.rename(tmpPath, filePath);
                    console.log(`  Re-encoded with proper keyframes: ${filePath}`);
                  }
                } catch (kfErr: any) {
                  console.warn("Keyframe normalization failed (non-fatal):", kfErr.message);
                }
              }

              const brandAsset: any = {
                name: params.name,
                url: servedUrl,
                type: assetType,
                width: assetWidth,
                height: assetHeight,
                duration: assetDuration,
              };

              // Replace existing asset with same name+type, or append
              const existingIdx = kit.assets.findIndex((a: any) => a.name === brandAsset.name && a.type === brandAsset.type);
              if (existingIdx >= 0) kit.assets[existingIdx] = brandAsset;
              else kit.assets.push(brandAsset);

              await saveBrandKit(params.tenant_id, kit);
            } catch (regErr: any) {
              console.warn("Failed to auto-register brand asset:", regErr.message);
            }
          }

          return ok({
            status: "uploaded",
            name: params.name,
            path: filePath,
            url: servedUrl,
            asset_type: assetType,
            size: buffer.length,
          });
        } catch (e: any) {
          return err(`Upload failed: ${e.message}`);
        }
      }

      // Project asset upload
      if (!params.project_id) return err("project_id required for project asset upload");
      if (!params.url) return err("url is required for asset upload");

      try {
        const response = await fetch(params.url);
        if (!response.ok) return err(`Failed to download: HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());

        const filename = params.name.includes(".") ? params.name : `${params.name}.${guessExtension(response.headers.get("content-type") || "")}`;
        const assetDir = path.join(config.dataDir, params.tenant_id, "projects", params.project_id, "assets");
        await fs.mkdir(assetDir, { recursive: true });
        const filePath = path.join(assetDir, filename);
        await fs.writeFile(filePath, buffer);

        const servedUrl = `/assets/${params.tenant_id}/projects/${params.project_id}/assets/${filename}`;

        // ── Normalize video keyframes for seekability ──
        const ext = path.extname(filename).toLowerCase();
        if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) {
          try {
            const { execFile: execFileCb3 } = await import("node:child_process");
            const { promisify: promisify3 } = await import("node:util");
            const execFileP3 = promisify3(execFileCb3);
            const kfProbe = await execFileP3("ffprobe", [
              "-v", "quiet", "-select_streams", "v",
              "-show_entries", "packet=flags",
              "-of", "csv", filePath,
            ]);
            const keyframeCount = (kfProbe.stdout.match(/K/g) || []).length;
            const totalFrames = (kfProbe.stdout.trim().split("\n") || []).length;
            const keyframeInterval = totalFrames > 0 ? totalFrames / Math.max(keyframeCount, 1) : 0;
            if (keyframeInterval > 30 || keyframeCount <= 1) {
              console.log(`  Project asset keyframe normalization: ${keyframeCount} keyframes in ${totalFrames} frames. Re-encoding...`);
              const tmpPath = filePath + ".tmp.mp4";
              await execFileP3("ffmpeg", [
                "-y", "-i", filePath,
                "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.0",
                "-preset", "medium", "-crf", "18",
                "-g", "15", "-keyint_min", "15",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                tmpPath,
              ], { maxBuffer: 50 * 1024 * 1024 });
              const fsMod = await import("node:fs/promises");
              await fsMod.rename(tmpPath, filePath);
            }
          } catch (kfErr: any) {
            console.warn("Keyframe normalization failed (non-fatal):", kfErr.message);
          }
        }

        return ok({
          status: "uploaded",
          name: params.name,
          path: filePath,
          url: servedUrl,
          size: buffer.length,
        });
      } catch (e: any) {
        return err(`Upload failed: ${e.message}`);
      }
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
    "Generate media from a natural language prompt. Use mode='plan' to get a creative plan with script, storyboard, and asset requirements for review. Use mode='generate' to build scenes from an approved plan. Use mode='full' (default) to plan, generate, and render in one shot. Recommended flow: plan -> review/iterate -> provide assets -> generate -> preview/edit -> render.",
    {
      tenant_id: z.string(),
      prompt: z.string().default("").describe("Description of what to generate. Optional for mode='generate' (uses plan narrative)."),
      target: z.enum(["component", "scene", "video", "image", "presentation"]).optional().default("video").describe("What to generate (default: video)"),
      id: z.string().optional().describe("ID of existing content to revise. Component: component name. Scene: scene_id (requires project_id). Video/image/presentation: project_id."),
      project_id: z.string().optional().describe("Project ID (required for scene revision)"),
      canvas_width: z.number().optional().describe("Explicit canvas width. For images, auto-inferred from prompt if omitted."),
      canvas_height: z.number().optional().describe("Explicit canvas height. For images, auto-inferred from prompt if omitted."),
      creativity: z.number().min(0).max(1).optional().describe("Creativity level 0-1. Low (0) prefers library components. High (0.7-1.0) creates one self-contained custom component per scene. Default: 0.5."),
      token: z.string().optional().describe("Auth token"),
      voiceover: z.boolean().optional().describe("Generate TTS voiceover narration for each scene (default: false)"),
      stock_footage: z.boolean().optional().describe("Fetch stock video clips from Pexels for scene backgrounds (requires PEXELS_API_KEY)"),
      background_music: z.boolean().optional().describe("Add royalty-free background music with voiceover ducking (requires JAMENDO_CLIENT_ID)"),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional().describe("TTS voice for voiceover (default: nova)"),
      speaker_source: z.string().optional().describe("Path or URL to speaker video. When provided, uses speaker track mode: speaker video plays full-screen as base layer with content overlaid on top."),
      speaker_start: z.number().optional().describe("Start offset in seconds into the speaker video (skip dead air at start)"),
      speaker_trim_start: z.number().optional().describe("Trim: only use speaker video from this timestamp"),
      speaker_trim_end: z.number().optional().describe("Trim: stop using speaker video at this timestamp"),
      mode: z.enum(["plan", "generate", "full"]).optional().default("full").describe("'plan' = create a creative plan for review. 'generate' = build scenes from an approved plan. 'full' = plan + generate + render in one shot (default, current behavior)."),
      brief: z.object({
        video_type: z.enum(["product_launch", "feature_announcement", "customer_story", "how_to", "promo", "explainer", "case_study", "brand"]).optional(),
        context: z.object({
          messaging: z.string().optional(),
          audience: z.string().optional(),
          key_points: z.array(z.string()).optional(),
          proof_points: z.array(z.string()).optional(),
          tone: z.string().optional(),
          industry: z.string().optional(),
        }).optional(),
        target_duration: z.number().optional(),
        style_references: z.array(z.object({ url: z.string(), note: z.string().optional() })).optional(),
        do_not_include: z.array(z.string()).optional(),
        available_assets: z.array(z.object({
          description: z.string(),
          type: z.enum(["screen_recording", "camera_video", "photo", "screenshot", "logo", "illustration", "other"]),
          path: z.string().optional(),
          url: z.string().optional(),
        })).optional(),
      }).optional().describe("Structured brief with marketing context. Enhances the prompt with audience, messaging, and asset info."),
      feedback: z.string().optional().describe("Natural language feedback to revise an existing plan. Requires project_id with a planned project."),
      reference_images: z.array(z.object({
        url: z.string().describe("HTTPS URL or base64 data URI (data:image/...)"),
        role: z.enum(["ui_reference", "style_reference", "brand_reference", "screenshot"]),
        label: z.string().optional().describe("Human label for this reference, e.g. 'Claude chat UI'"),
      })).max(10).optional().describe(
        "Reference images the LLM can see while planning and generating scenes. " +
        "Use for UI screenshots, style references, or brand materials."
      ),
    },
    async (params) => {
      // Auth check
      if (isAuthEnabled()) {
        if (!params.token) return err("Authentication required: provide a token");
        const tokenTenant = validateToken(params.token);
        if (!tokenTenant) return err("Invalid token");
      }
      try {
        // ── Plan mode: run unified pipeline in plan-only mode ──
        if (params.mode === "plan") {
          let llmConfig;
          try {
            llmConfig = llmConfigFromEnv();
          } catch (e: any) {
            return err(`LLM not configured: ${e.message}`);
          }

          const brandKit = await loadBrandKit(params.tenant_id);

          // Build the prompt, incorporating feedback for revisions
          let planPrompt = params.prompt;
          if (params.project_id && params.feedback) {
            const existingProject = await loadProject(params.tenant_id, params.project_id);
            if (!existingProject) return err("Project not found for plan revision");
            if (existingProject.status !== "planned" && existingProject.status !== "draft") {
              return err(`Cannot revise plan: project is in '${existingProject.status}' state`);
            }
            planPrompt += `\n\n## Revision Feedback\n${params.feedback}`;
            if (existingProject.plan?.narrative) {
              planPrompt += `\n\n## Previous Plan Narrative\n${existingProject.plan.narrative}`;
            }
          }

          console.log(`  Plan mode: running unified pipeline (plan-only) for "${params.prompt.substring(0, 60)}..."`);
          const pipelineResult = await runGeneratePipeline({
            prompt: planPrompt,
            target: (params.target === "component" || params.target === "scene") ? "video" : (params.target || "video") as PipelineTarget,
            tenant_id: params.tenant_id,
            llmConfig,
            brandKit: brandKit || {
              colors: { primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA", background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8" },
              fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 800] }],
              style: { border_radius: "12px", motion: "cinematic" as const },
            },
            canvas: { width: 1920, height: 1080, preset: "landscape" as const, fps: 30, background: "#0f172a" },
            creativity: params.creativity,
            project_id: params.project_id,
            voiceover: params.voiceover,
            voice: params.voice,
            sceneCount: params.brief?.target_duration ? Math.max(3, Math.min(10, Math.round((params.brief.target_duration || 45) / 5.5))) : undefined,
            planOnly: true,
          });

          if (pipelineResult.status === "error") {
            return err(`Plan failed: ${pipelineResult.error}`);
          }

          const project = pipelineResult.project!;

          // If updating an existing project, copy the plan over
          if (params.project_id && params.project_id !== project.project_id) {
            const origProject = await loadProject(params.tenant_id, params.project_id);
            if (origProject) {
              origProject.brief = project.brief;
              origProject.plan = project.plan;
              origProject.status = "planned";
              origProject.updated_at = new Date().toISOString();
              await saveProject(origProject);

              return ok({
                status: "planned",
                project_id: origProject.project_id,
                preview_url: previewUrl(params.tenant_id, origProject.project_id),
                plan: origProject.plan,
              });
            }
          }

          return ok({
            status: "planned",
            project_id: project.project_id,
            preview_url: previewUrl(params.tenant_id, project.project_id),
            plan: project.plan,
          });
        }

        // ── Generate mode: build scenes from an approved plan ──
        if (params.mode === "generate") {
          if (!params.project_id) return err("project_id required for generate mode");
          const project = await loadProject(params.tenant_id, params.project_id);
          if (!project) return err("Project not found");
          if (!project.plan) return err("Project has no plan. Run generate with mode='plan' first.");
          if (project.status !== "planned") {
            return err(`Cannot generate: project is in '${project.status}' state (expected 'planned')`);
          }

          // Use the plan's script as the prompt for the unified pipeline
          // Build a rich prompt from the plan's narrative + scene details
          const planPrompt = buildPromptFromPlan(project.plan, project.brief);

          let llmConfig;
          try {
            llmConfig = llmConfigFromEnv();
          } catch (e: any) {
            return err(`LLM not configured: ${e.message}`);
          }

          const brandKit = await loadBrandKit(params.tenant_id);
          const job = queueJob("generate", params.tenant_id, async (j) => {
            const trace = new TraceBuilder("generate", params.tenant_id, "", planPrompt);
            try {
              j.progress = { step: "generating_from_plan", percent: 10 };
              const pipelineResult = await runGeneratePipeline({
                prompt: planPrompt,
                target: "video",
                tenant_id: params.tenant_id,
                llmConfig,
                brandKit: brandKit || project.brand_kit,
                canvas: project.canvas,
                creativity: params.creativity,
                project_id: project.project_id,
                voiceover: true,
                backgroundMusic: true,
                voice: project.plan!.audio.voice as any,
                sceneCount: project.plan!.scenes.length,
              });

              // Copy generated scenes, audio, and assets from the new project back to the original planned project
              // Use the in-memory project object from pipelineResult instead of re-loading from disk
              // to avoid race conditions where disk write hasn't completed yet
              const generatedProject = (pipelineResult as any)?.project;
              const newProjectId = generatedProject?.project_id || (pipelineResult as any)?.projectId || (pipelineResult as any)?.project_id;
              if (newProjectId && newProjectId !== params.project_id) {
                const origProject = await loadProject(params.tenant_id, params.project_id!);
                if (generatedProject && origProject) {
                  origProject.scenes = generatedProject.scenes;
                  origProject.audio = generatedProject.audio;
                  origProject.assets = generatedProject.assets;
                  origProject.canvas = generatedProject.canvas;
                  origProject.speaker_track = generatedProject.speaker_track;
                  origProject.status = "generated";
                  origProject.updated_at = new Date().toISOString();
                  await saveProject(origProject);

                  // Copy component HTML files and voiceover audio from new project to original
                  const srcDir = projectDir(params.tenant_id, newProjectId);
                  const dstDir = projectDir(params.tenant_id, params.project_id!);
                  for (const subdir of ["components", "voiceover"]) {
                    const srcSub = path.join(srcDir, subdir);
                    const dstSub = path.join(dstDir, subdir);
                    try {
                      const entries = await fs.readdir(srcSub);
                      if (entries.length > 0) {
                        await fs.mkdir(dstSub, { recursive: true });
                        for (const entry of entries) {
                          await fs.copyFile(path.join(srcSub, entry), path.join(dstSub, entry));
                        }
                        console.log(`  Generate mode: copied ${entries.length} ${subdir} files`);
                      }
                    } catch {
                      // Directory may not exist, skip
                    }
                  }

                  console.log(`  Generate mode: copied ${generatedProject.scenes.length} scenes from ${newProjectId} to ${params.project_id}`);
                }
              } else {
                // Pipeline wrote to the same project
                const updated = await loadProject(params.tenant_id, params.project_id!);
                if (updated) {
                  updated.status = "generated";
                  updated.updated_at = new Date().toISOString();
                  await saveProject(updated);
                }
              }

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
            project_id: project.project_id,
            preview_url: previewUrl(params.tenant_id, project.project_id),
            message: "Generating scenes from plan. Use get(target='job', job_id='" + job.id + "') to check status.",
          });
        }

        // ── Full mode (default) and revision mode below ──

        // ── Revision mode: load existing content when id is provided ──
        let existingSource: string | undefined;
        let revisionName: string | undefined;
        let revisionProjectId: string | undefined;
        let revisionSceneId: string | undefined;

        if (params.id) {
          if (params.target === "component") {
            // Try to load existing component source
            const customPath = path.join(config.dataDir, params.tenant_id, "components", "custom", `${params.id}.component.html`);
            try {
              existingSource = await fs.readFile(customPath, "utf-8");
              revisionName = params.id;
            } catch {
              // Try other categories
              const compBase = path.join(config.dataDir, params.tenant_id, "components");
              try {
                const categories = await fs.readdir(compBase, { withFileTypes: true });
                for (const cat of categories) {
                  if (!cat.isDirectory()) continue;
                  const catPath = path.join(compBase, cat.name, `${params.id}.component.html`);
                  try {
                    existingSource = await fs.readFile(catPath, "utf-8");
                    revisionName = params.id;
                    break;
                  } catch { /* skip */ }
                }
              } catch { /* no components dir */ }
              if (!existingSource) {
                return err(`Component "${params.id}" not found in tenant "${params.tenant_id}"`);
              }
            }
          } else if (params.target === "scene") {
            if (!params.project_id) {
              return err("project_id is required for scene revision");
            }
            revisionProjectId = params.project_id;
            revisionSceneId = params.id;
          } else if (params.target === "video" || params.target === "image") {
            revisionProjectId = params.id;
            // Load project to serialize as context
            const proj = await loadProject(params.tenant_id, params.id);
            if (!proj) {
              return err(`Project "${params.id}" not found for revision`);
            }
            existingSource = JSON.stringify(proj, null, 2);
          }
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
              canvasWidth: params.canvas_width,
              canvasHeight: params.canvas_height,
              creativity: params.creativity,
              existingSource,
              name: revisionName,
              project_id: revisionProjectId || params.project_id,
              sceneId: revisionSceneId,
              voiceover: params.voiceover,
              stockFootage: params.stock_footage,
              backgroundMusic: params.background_music,
              voice: params.voice,
              speaker_source: params.speaker_source,
              speaker_start: params.speaker_start,
              speaker_trim_start: params.speaker_trim_start,
              speaker_trim_end: params.speaker_trim_end,
              referenceImages: params.reference_images,
            });

            // If pipeline created a project, track the projectId
            if (pipelineResult && typeof pipelineResult === "object") {
              j.projectId = (pipelineResult as any).projectId || (pipelineResult as any).project_id;
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
        return ok(jobWithPreview(job as unknown as Record<string, unknown>));
      }

      if (params.action === "wait") {
        if (!params.job_id) return err("job_id required for wait");
        const timeoutMs = (params.timeout_seconds || 120) * 1000;
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const job = getJob(params.job_id);
          if (!job) return err("Job not found");
          if (job.status === "completed" || job.status === "failed") {
            return ok(jobWithPreview(job as unknown as Record<string, unknown>));
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        // Timeout -- return current state
        const job = getJob(params.job_id);
        return ok(jobWithPreview({
          ...job,
          _timeout: true,
          message: "Wait timed out. Job is still " + (job?.status || "unknown"),
        } as Record<string, unknown>));
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

  // ── Brand extraction tool ──
  registerBrandExtractTool(server);

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

/**
 * Build a rich prompt from a plan for the unified pipeline.
 * Converts the plan's script into a format the unified planner understands.
 */
function buildPromptFromPlan(plan: import("./core/types.js").ProjectPlan, brief?: import("./core/types.js").ProjectBrief): string {
  let prompt = brief?.prompt || plan.narrative;
  prompt += "\n\n## Script (FOLLOW THIS EXACTLY)\n";
  prompt += `Narrative: ${plan.narrative}\n\n`;

  for (let i = 0; i < plan.scenes.length; i++) {
    const s = plan.scenes[i];
    prompt += `Scene ${i + 1}: "${s.label}"\n`;
    prompt += `  Purpose: ${s.purpose}\n`;
    prompt += `  Template: ${s.template}\n`;
    prompt += `  Duration: ${s.duration_seconds}s\n`;
    if (s.voiceover_text) prompt += `  Voiceover: "${s.voiceover_text}"\n`;
    prompt += `  Visuals: ${s.visual_notes}\n`;

    // Asset directives
    if (s.assets && s.assets.length > 0) {
      for (const asset of s.assets) {
        if (asset.status === "provided" && asset.path) {
          // Real asset -- tell the planner to use it
          if (asset.type === "screen_recording" || asset.type === "camera_video") {
            prompt += `  ASSET: Use video component with src="${asset.path}"\n`;
          } else if (asset.type === "screenshot" || asset.type === "photo" || asset.type === "product_shot") {
            prompt += `  ASSET: Use image component with src="${asset.path}"\n`;
          }
        } else if (asset.status === "needed" || asset.status === "fallback") {
          // Missing asset -- use placeholder component
          const typeLabel = asset.type.replace(/_/g, " ");
          prompt += `  ASSET MISSING: Use an asset-placeholder component with data: { "text": "${asset.description}", "asset_type": "${typeLabel}" }. Do NOT generate a mockup -- use the asset-placeholder component.\n`;
        } else if (asset.status === "generated" && asset.path) {
          // AI-generated asset
          prompt += `  ASSET: Use image component with src="${asset.path}"\n`;
        }
      }
    }

    prompt += "\n";
  }

  prompt += `\n## Asset Placeholder Rule\n`;
  prompt += `When a scene has a MISSING ASSET directive, you MUST use the "asset-placeholder" component type with the specified text and asset_type in the data object. Do NOT attempt to generate HTML mockups, fake dashboards, or UI simulations. Use the asset-placeholder component exactly as directed.\n\n`;

  prompt += `Music mood: ${plan.audio.music_mood}\n`;
  prompt += `Pacing: ${plan.audio.pacing}\n`;

  // Add marketing context if available
  if (brief?.context) {
    const ctx = brief.context;
    if (ctx.messaging) prompt += `\n## Messaging\n${ctx.messaging}\n`;
    if (ctx.tone) prompt += `\nTone: ${ctx.tone}\n`;
  }

  return prompt;
}

function guessExtension(contentType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "font/woff2": "woff2",
    "font/woff": "woff",
    "font/ttf": "ttf",
    "font/otf": "otf",
  };
  return map[contentType] || "bin";
}

async function findComponentSource(type: string, extraDirs?: string[]): Promise<string | null> {
  // Check extra dirs first (project-local components)
  if (extraDirs) {
    for (const dir of extraDirs) {
      try {
        const fp = path.join(dir, `${type}.component.html`);
        return await fs.readFile(fp, "utf-8");
      } catch { /* not here */ }
    }
  }
  // Search library subdirectories
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
