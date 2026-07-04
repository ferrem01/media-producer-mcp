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
import { reviseScene } from "./llm/scene-revise.js";
import { config } from "./config.js";
import { projectDir, projectOutputDir, projectAssetsDir } from "./persistence/paths.js";
import path from "node:path";
import fs from "node:fs/promises";
import type { Scene, SceneComponent, BrandKit, SpeakerTrack } from "./core/types.js";
import { normalizeBeats } from "./core/beats.js";
import { generateTTS } from "./audio/tts.js";
import { searchMusic, downloadTrack } from "./audio/music.js";
import { isAuthEnabled, validateToken } from "./auth/auth.js";
import { signToken } from "./auth/jwt.js";
import { captureUrl } from "./core/capture-url.js";
import { registerBrandExtractTool, extractAndStoreBrand } from "./tools/brand-extract-tool.js";
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
  type: z.enum(["crossfade", "blur-crossfade", "wipe-left", "wipe-right", "slide-up", "slide-down", "iris", "glass-turn", "none"]),
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

/** A beat: one thought inside a scene's continuous take (see SceneBeat). */
const beatSchema = z.object({
  label: z.string(),
  duration_seconds: z.number(),
  action: z.string(),
  voiceover_text: z.string().optional(),
});


function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

/** Build the Studio SPA URL for a tenant + project.
 *  When auth is enabled, every Studio/API route is token-gated, so embed a
 *  tenant-scoped token in the link — otherwise the URL 401s on open. The token
 *  is a non-expiring JWT (when SESSION_SECRET is set) or a static AUTH_TOKENS
 *  entry the caller passed; without either, the link is plain (dev mode). */
function previewUrl(tenantId: string, projectId: string, token?: string): string {
  let url = `${config.publicUrl}/studio?tenant=${encodeURIComponent(tenantId)}&project=${encodeURIComponent(projectId)}`;
  if (isAuthEnabled()) {
    let t = token;
    if (!t && process.env.SESSION_SECRET) {
      try { t = signToken({ email: "studio@media-producer", tenant_id: tenantId }); } catch { /* leave unauthenticated */ }
    }
    if (t) url += `&token=${encodeURIComponent(t)}`;
  }
  return url;
}

/** Human ETA suffix from seconds-remaining. */
function fmtEta(s?: number): string {
  if (!s || s <= 0) return "";
  return s < 60 ? `~${s}s left` : `~${Math.round(s / 60)}m left`;
}

/**
 * Build an onProgress callback for runGeneratePipeline that maps the pipeline's
 * 0-100 generation progress into a job's [lo,hi] percent band and writes a live
 * step/detail/ETA onto the job (so callers see per-scene progress, not a frozen bar).
 */
function genProgress(j: { progress?: { step: string; percent: number; detail?: string; etaSeconds?: number } }, lo: number, hi: number) {
  return (p: { step: string; percent: number; detail?: string; etaSeconds?: number }) => {
    const clamped = Math.max(0, Math.min(100, p.percent));
    const percent = Math.round(lo + (clamped / 100) * (hi - lo));
    const eta = fmtEta(p.etaSeconds);
    j.progress = { step: p.step, percent, detail: [p.detail, eta].filter(Boolean).join(" · ") || undefined, etaSeconds: p.etaSeconds };
  };
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
        beats: z.array(beatSchema).optional().describe("Beat timeline: the scene's internal thoughts (continuous-take scenes)"),
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
    "Update a project, scene, component, or storyboard. Infers target from which IDs are provided. Use provide_asset to upload assets for a storyboard scene. Use storyboard to directly edit the storyboard.",
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
      status: z.enum(["draft", "storyboard", "generated", "rendering", "rendered", "failed"]).optional(),

      // Scene-level updates
      label: z.string().optional(),
      duration_seconds: z.number().optional(),
      background: z.string().optional(),
      transition_in: transitionSchema,
      beats: z.array(beatSchema).optional().describe("Replace the scene's beat timeline"),
      content_region: z.object({
        side: z.enum(["left", "right"]),
        width: z.string(),
        offset: z.string().optional(),
      }).nullable().optional().describe("Confine the scene's components to one side of the frame (speaker films). Pass null to clear it so the scene lays out full-frame."),

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

      // Storyboard modifications (direct edits, no LLM)
      storyboard: z.object({
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
        remove_scenes: z.array(z.number()).optional().describe("Indices of storyboard scenes to remove"),
        reorder_scenes: z.array(z.number()).optional().describe("Current indices in desired order"),
      }).optional().describe("Direct storyboard edits. Partial updates -- only fields you pass get changed. Works in the storyboard state."),

      // Asset provision
      provide_asset: z.object({
        scene_index: z.number(),
        asset_index: z.number(),
        path: z.string(),
      }).optional().describe("Provide an asset for a storyboard scene. Updates status from 'needed' to 'provided'."),
    },
    async (params) => {
      // ── Storyboard modifications ──
      if (params.storyboard || params.provide_asset) {
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err("Project not found");

        if (params.storyboard) {
          if (!project.storyboard) {
            // Create a new storyboard from scratch
            project.storyboard = {
              narrative: params.storyboard.narrative || "",
              scenes: [],
              audio: {
                music_mood: params.storyboard.audio?.music_mood || "corporate",
                voice: params.storyboard.audio?.voice || "nova",
                pacing: (params.storyboard.audio?.pacing as any) || "moderate",
              },
              estimated_duration: params.storyboard.estimated_duration || 0,
            };
          }

          // Merge top-level fields
          if (params.storyboard.narrative !== undefined) project.storyboard.narrative = params.storyboard.narrative;
          if (params.storyboard.estimated_duration !== undefined) project.storyboard.estimated_duration = params.storyboard.estimated_duration;
          if (params.storyboard.audio) {
            if (params.storyboard.audio.music_mood !== undefined) project.storyboard.audio.music_mood = params.storyboard.audio.music_mood;
            if (params.storyboard.audio.voice !== undefined) project.storyboard.audio.voice = params.storyboard.audio.voice;
            if (params.storyboard.audio.pacing !== undefined) project.storyboard.audio.pacing = params.storyboard.audio.pacing;
          }

          // Remove scenes (process before adds/updates, use descending order)
          if (params.storyboard.remove_scenes?.length) {
            const toRemove = [...params.storyboard.remove_scenes].sort((a, b) => b - a);
            for (const idx of toRemove) {
              if (idx >= 0 && idx < project.storyboard.scenes.length) {
                project.storyboard.scenes.splice(idx, 1);
              }
            }
          }

          // Reorder scenes
          if (params.storyboard.reorder_scenes?.length) {
            const order = params.storyboard.reorder_scenes;
            const reordered = order
              .filter(i => i >= 0 && i < project.storyboard!.scenes.length)
              .map(i => project.storyboard!.scenes[i]);
            if (reordered.length === project.storyboard.scenes.length) {
              project.storyboard.scenes = reordered;
            }
          }

          // Update or append scenes
          if (params.storyboard.scenes?.length) {
            for (const sceneUpdate of params.storyboard.scenes) {
              if (sceneUpdate.index !== undefined && sceneUpdate.index < project.storyboard.scenes.length) {
                // Update existing scene
                const existing = project.storyboard.scenes[sceneUpdate.index];
                if (sceneUpdate.label !== undefined) existing.label = sceneUpdate.label;
                if (sceneUpdate.purpose !== undefined) existing.purpose = sceneUpdate.purpose;
                if (sceneUpdate.template !== undefined) existing.template = sceneUpdate.template;
                if (sceneUpdate.voiceover_text !== undefined) existing.voiceover_text = sceneUpdate.voiceover_text;
                if (sceneUpdate.duration_seconds !== undefined) existing.duration_seconds = sceneUpdate.duration_seconds;
                if (sceneUpdate.visual_notes !== undefined) existing.visual_notes = sceneUpdate.visual_notes;
              } else {
                // Append new scene
                project.storyboard.scenes.push({
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
          project.storyboard.estimated_duration = project.storyboard.scenes.reduce(
            (sum, s) => sum + s.duration_seconds, 0
          );

          project.status = "storyboard";
        }

        // Asset provision
        if (params.provide_asset) {
          if (!project.storyboard) return err("Project has no storyboard");
          const { scene_index, asset_index, path } = params.provide_asset;
          if (scene_index < 0 || scene_index >= project.storyboard.scenes.length) {
            return err(`Invalid scene_index: ${scene_index}`);
          }
          const scene = project.storyboard.scenes[scene_index];
          if (asset_index < 0 || asset_index >= scene.assets.length) {
            return err(`Invalid asset_index: ${asset_index}`);
          }
          scene.assets[asset_index].status = "provided";
          scene.assets[asset_index].path = path;
        }

        project.updated_at = new Date().toISOString();
        await saveProject(project);
        return ok({ status: "updated", project_id: project.project_id, storyboard: project.storyboard });
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
          if (params.beats !== undefined) {
            // Normalize against the scene's (possibly just-updated) duration;
            // an empty array clears the beat timeline.
            scene.beats = normalizeBeats(params.beats, scene.duration_seconds || 5);
            updated = true;
          }
          if (params.content_region !== undefined) {
            if (params.content_region === null) delete scene.content_region;
            else scene.content_region = params.content_region as any;
            updated = true;
          }
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

      // No update fields matched. Deletion is intentionally NOT performed here:
      // this tool used to fall through to removing the project/scene/component,
      // which silently destroyed data on a no-op update. Use the `delete` tool.
      return err(
        "No update fields were provided, so nothing was changed. To remove a project, scene, or component, use the `delete` tool.",
      );
    },
  );

  // ─────────────────────────────────────────────
  // delete - Remove a project, scene, component, or brand asset
  // ─────────────────────────────────────────────

  server.tool(
    "delete",
    "Delete a project, scene, component, or brand asset. Infers the target from the IDs you provide: project_id + scene_id + component_id removes a component; project_id + scene_id removes a scene; project_id alone deletes the whole project. Set target='brand' with asset_names to remove brand assets from the tenant kit. This is the safe, explicit counterpart to add/update.",
    {
      tenant_id: z.string(),
      target: z.enum(["project", "brand"]).optional().describe("Defaults to project-scoped deletion. Set 'brand' to remove brand assets by name."),
      project_id: z.string().optional(),
      scene_id: z.string().optional().describe("With project_id, removes this scene. With component_id too, removes that component."),
      component_id: z.string().optional().describe("With project_id + scene_id, removes this component."),
      asset_names: z.union([z.array(z.string()), z.string()]).optional().describe("For target='brand': the brand asset name(s) to remove. Accepts an array, a comma-separated string, or a JSON array string."),
    },
    async (params) => {
      // Normalize asset_names: tolerate array, comma-separated string, or a
      // JSON-array string (some MCP clients serialize array params as strings).
      const toNames = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === "string") {
          const s = v.trim();
          if (s.startsWith("[")) {
            try { const p = JSON.parse(s); if (Array.isArray(p)) return p.map(String); } catch { /* fall through */ }
          }
          return s.split(",").map((x) => x.trim()).filter(Boolean);
        }
        return [];
      };

      // ── Brand asset removal ──
      if (params.target === "brand") {
        const names = toNames(params.asset_names);
        if (names.length === 0) return err("Provide asset_names to remove from the brand kit.");
        const kit = await loadBrandKit(params.tenant_id);
        if (!kit) return err("No brand kit configured");
        const before = (kit.assets || []).length;
        const toRemove = new Set(names);
        kit.assets = (kit.assets || []).filter((a) => !toRemove.has(a.name));
        const removed = before - (kit.assets?.length || 0);
        if (removed === 0) return err(`No matching brand assets found for: ${names.join(", ")}`);
        await saveBrandKit(params.tenant_id, kit);
        return ok({ removed: "brand_assets", count: removed, names });
      }

      // ── Project-scoped deletion (target inferred from IDs) ──
      if (!params.project_id) return err("project_id is required (or set target='brand' with asset_names).");

      if (params.scene_id && params.component_id) {
        const project = await removeComponent(params.tenant_id, params.project_id, params.scene_id, params.component_id);
        if (!project) return err("Project, scene, or component not found");
        return ok({ removed: "component", component_id: params.component_id });
      }
      if (params.scene_id) {
        const project = await removeScene(params.tenant_id, params.project_id, params.scene_id);
        if (!project) return err("Project or scene not found");
        return ok({ removed: "scene", scene_id: params.scene_id });
      }
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
    "Get, set, or extract a tenant's brand kit (colors, fonts, logo, style, assets). Pass a url to extract + store the brand kit from a website. Pass no fields to get the current brand kit. Pass fields to update.",
    {
      tenant_id: z.string(),
      url: z.string().optional().describe("Extract + store the brand kit from this website URL (colors, fonts, logos, theme) -- no video is generated."),
      enhance: z.boolean().optional().describe("Run LLM brand analysis during URL extraction (slower, richer guidelines)."),
      include_images: z.boolean().optional().describe("During URL extraction, also crawl the site (entry + interior product/feature pages), download product/background imagery, caption each with a vision LLM, and store them as described brand assets."),
      crawl_depth: z.number().int().min(0).max(2).optional().describe("Link-hops beyond the entry page to crawl for imagery (0=entry only, max 2). Only used with include_images."),
      max_images: z.number().int().min(1).max(40).optional().describe("Max images to keep, ranked largest-first. Only used with include_images."),
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
        type: z.enum(["background", "intro", "outro", "watermark", "music", "product", "screenshot", "image"]).describe("Asset type"),
        description: z.string().optional().describe("Model-readable caption so the AI can pick the right asset"),
        tags: z.array(z.string()).optional(),
        source_url: z.string().optional().describe("Original image/page URL the asset came from"),
        width: z.number().optional(),
        height: z.number().optional(),
        duration: z.number().optional().describe("Duration in seconds (video/audio assets)"),
      })).optional().describe("Brand assets (backgrounds, intros, outros, watermarks, music, and harvested product/screenshot/image assets)"),
      style: z.object({
        border_radius: z.string().optional(),
        motion: z.enum(["minimal", "punchy", "cinematic"]).optional(),
      }).optional(),
      guidelines: z.string().optional().describe("Free-form brand rules for the AI (e.g. logo placement, color usage, tone). Injected into generation prompts."),
      remove_assets: z.array(z.string()).optional().describe("Names of existing brand assets to remove from the kit (e.g. to prune duplicates)."),
    },
    async (params) => {
      // Extract + store the brand kit from a URL (no video generated).
      if (params.url) {
        try {
          const { kit, summary } = await extractAndStoreBrand(params.tenant_id, params.url, params.enhance ?? false, {
            includeImages: params.include_images ?? false,
            depth: params.crawl_depth,
            maxImages: params.max_images,
          });
          return ok({ status: "brand_extracted", tenant_id: params.tenant_id, source_url: params.url, brand_kit: kit, summary });
        } catch (e: any) {
          return err(`Brand extraction failed for ${params.url}: ${e?.message || e}`);
        }
      }

      const hasUpdates = params.colors || params.fonts || params.logo || params.logos || params.assets || params.style || params.guidelines || (params.remove_assets && params.remove_assets.length > 0);

      if (!hasUpdates) {
        // Get brand kit
        const kit = await loadBrandKit(params.tenant_id);
        return ok(kit || { message: "No brand kit configured" });
      }

      // Set/update brand kit
      const existing = await loadBrandKit(params.tenant_id);
      // Merge logos: append new, replace by name
      let mergedLogos: any[] = existing?.logos || [];
      const upsertLogo = (newLogo: any) => {
        const idx = mergedLogos.findIndex((l: any) => l.name === newLogo.name);
        if (idx >= 0) mergedLogos[idx] = newLogo;
        else mergedLogos.push(newLogo);
      };
      if (params.logos) {
        for (const newLogo of params.logos) upsertLogo(newLogo);
      }
      // Back-compat: the single `logo` param is coerced into the logos array
      // (the brand kit only carries `logos[]` now -- the storyboard builder reads that).
      if (params.logo) {
        upsertLogo({
          name: "primary",
          url: params.logo.url,
          variant: "full" as const,
          theme: "any" as const,
          height: params.logo.height,
          placement: params.logo.placement,
        });
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
      // Remove assets by name (e.g. pruning duplicates).
      if (params.remove_assets && params.remove_assets.length > 0) {
        const toRemove = new Set(params.remove_assets);
        mergedAssets = mergedAssets.filter((a: any) => !toRemove.has(a.name));
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
    "revise",
    "Surgically revise ONE scene from a natural-language instruction. Patches the scene's codegen source (fast SEARCH/REPLACE), versions the prior source, and re-runs the fast legibility/runtime gates. Pass `element` to scope the change to a selected element; omit it to revise the whole scene. For a full from-scratch redo of a scene use generate with target='scene'.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string().describe("The scene to revise"),
      instruction: z.string().describe("What to change, in plain language"),
      element: z.object({
        tagName: z.string().optional(),
        classList: z.array(z.string()).optional(),
        text: z.string().optional(),
        outerHTMLSnippet: z.string().optional(),
        compType: z.string().optional(),
      }).optional().describe("The selected element's context (omit for a whole-scene revise)"),
      skip_gates: z.boolean().optional().describe("Skip the fast legibility/runtime gates (faster)"),
      token: z.string().optional().describe("Auth token (required when AUTH_TOKENS is configured)"),
    },
    async (params) => {
      // Transport already enforces auth; per-tool `token` is optional (validate if present).
      if (isAuthEnabled() && params.token && !validateToken(params.token)) {
        return err("Invalid token");
      }
      let llmConfig;
      try { llmConfig = llmConfigFromEnv(); } catch (e: any) { return err(`LLM not configured: ${e.message}`); }
      const result = await reviseScene({
        tenantId: params.tenant_id,
        projectId: params.project_id,
        sceneId: params.scene_id,
        instruction: params.instruction,
        element: params.element,
        llmConfig,
        skipGates: params.skip_gates,
      });
      if (!result.ok) return err(result.error || "Revise failed");
      // Don't echo the full scene HTML back to the model (it's large); summarize.
      return ok({
        ok: true,
        component_type: result.componentType,
        revision_id: result.revisionId,
        blocks_applied: result.blocksApplied,
        full_rewrite: result.fullRewrite,
        defects: result.defects,
        scene_html_bytes: result.sceneHtml?.length ?? 0,
      });
    },
  );

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
      // The /mcp transport already enforces auth (Bearer) before any tool runs,
      // so the per-tool `token` arg is optional — connectors authenticate at the
      // transport, not by passing a token argument. Validate it only if supplied
      // (back-compat for static-token / curl callers).
      if (isAuthEnabled() && params.token && !validateToken(params.token)) {
        return err("Invalid token");
      }
      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) return err("Project not found");

      // Status gating
      if (project.status === "draft") {
        return err("Project needs a storyboard first. Run generate with mode='storyboard' to create a storyboard.");
      }
      if (project.status === "storyboard") {
        return err("Project has a storyboard but scenes haven't been generated yet. Run generate with mode='full' to build scenes from the storyboard.");
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

          // Auto-register a logo upload into the brand kit's logos[] (the storyboard builder
          // reads logos[], so an uploaded logo must land there to be usable).
          if (assetType === "logo") {
            try {
              const kit = await loadBrandKit(params.tenant_id) || {
                colors: { primary: "#5B21B6", secondary: "#7C3AED", accent: "#A78BFA", background: "#0f172a", surface: "#1e293b", text: "#ffffff", text_muted: "#94a3b8" },
                fonts: [{ family: "Inter", source: "google" as const, weights: [400, 600, 800] }],
                style: { border_radius: "12px", motion: "cinematic" as const },
              };
              if (!kit.logos) kit.logos = [];
              const newLogo = { name: params.name, url: servedUrl, variant: "full" as const, theme: "any" as const };
              const existingIdx = kit.logos.findIndex((l) => l.name === newLogo.name);
              if (existingIdx >= 0) kit.logos[existingIdx] = newLogo;
              else kit.logos.push(newLogo);
              await saveBrandKit(params.tenant_id, kit);
            } catch (regErr: any) {
              console.warn("Failed to auto-register brand logo:", regErr.message);
            }
          }

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
    "Generate media from a natural language prompt. Use mode='storyboard' to produce just the storyboard (script + per-scene breakdown + asset requirements) for review. Use mode='full' (default) to produce the scenes: if the project already has a storyboard it builds from that (honoring your edits), otherwise it creates the storyboard first, then builds. Rendering to a final video is a separate step (the render tool). Recommended flow: storyboard -> review/edit -> full -> preview/edit -> render.",
    {
      tenant_id: z.string(),
      prompt: z.string().default("").describe("Description of what to generate. Optional when the project already has a storyboard (uses its narrative)."),
      target: z.enum(["component", "scene", "video", "image", "presentation"]).optional().default("video").describe("What to generate (default: video)"),
      id: z.string().optional().describe("ID of existing content to revise. Component: component name. Scene: scene_id (requires project_id). Video/image/presentation: project_id."),
      project_id: z.string().optional().describe("Project ID (required for scene revision)"),
      canvas_width: z.number().optional().describe("Explicit canvas width. For images, auto-inferred from prompt if omitted."),
      canvas_height: z.number().optional().describe("Explicit canvas height. For images, auto-inferred from prompt if omitted."),
      creativity: z.number().min(0).max(1).optional().describe("Creativity level 0-1. Low (0) prefers library components. High (0.7-1.0) creates one self-contained custom component per scene. Default: 0.5."),
      token: z.string().optional().describe("Auth token"),
      voiceover: z.boolean().optional().describe("Generate TTS voiceover narration for each scene (default: false)"),
      background_music: z.boolean().optional().describe("Add royalty-free background music with voiceover ducking (requires JAMENDO_CLIENT_ID)"),
      voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional().describe("TTS voice for voiceover (default: nova)"),
      speaker_source: z.string().optional().describe("Path or URL to speaker video. When provided, uses speaker track mode: speaker video plays full-screen as base layer with content overlaid on top."),
      speaker_start: z.number().optional().describe("Start offset in seconds into the speaker video (skip dead air at start)"),
      speaker_trim_start: z.number().optional().describe("Trim: only use speaker video from this timestamp"),
      speaker_trim_end: z.number().optional().describe("Trim: stop using speaker video at this timestamp"),
      mode: z.enum(["storyboard", "full"]).optional().default("full").describe("'storyboard' = produce just the storyboard for review (stops there). 'full' (default) = produce the scenes: build from an existing storyboard if the project has one, else create the storyboard first. Rendering the final video is the separate render tool."),
      feedback: z.string().optional().describe("Natural language feedback to revise an existing storyboard. Requires project_id with a project in the storyboard state."),
      reference_images: z.array(z.object({
        url: z.string().describe("HTTPS URL or base64 data URI (data:image/...)"),
        role: z.enum(["ui_reference", "style_reference", "brand_reference", "screenshot"]),
        label: z.string().optional().describe("Human label for this reference, e.g. 'Claude chat UI'"),
      })).max(10).optional().describe(
        "Reference images the LLM can see while building the storyboard and generating scenes. " +
        "Use for UI screenshots, style references, or brand materials."
      ),
    },
    async (params) => {
      // Auth check
      // The /mcp transport already enforces auth (Bearer) before any tool runs,
      // so the per-tool `token` arg is optional — connectors authenticate at the
      // transport, not by passing a token argument. Validate it only if supplied
      // (back-compat for static-token / curl callers).
      if (isAuthEnabled() && params.token && !validateToken(params.token)) {
        return err("Invalid token");
      }
      try {
        // ── Storyboard mode: run unified pipeline in storyboard-only mode ──
        if (params.mode === "storyboard") {
          let llmConfig;
          try {
            llmConfig = llmConfigFromEnv();
          } catch (e: any) {
            return err(`LLM not configured: ${e.message}`);
          }

          const brandKit = await loadBrandKit(params.tenant_id);

          // Build the prompt, incorporating feedback for revisions
          let storyboardPrompt = params.prompt;
          if (params.project_id && params.feedback) {
            const existingProject = await loadProject(params.tenant_id, params.project_id);
            if (!existingProject) return err("Project not found for storyboard revision");
            if (existingProject.status !== "storyboard" && existingProject.status !== "draft") {
              return err(`Cannot revise storyboard: project is in '${existingProject.status}' state`);
            }
            storyboardPrompt += `\n\n## Revision Feedback\n${params.feedback}`;
            if (existingProject.storyboard?.narrative) {
              storyboardPrompt += `\n\n## Previous Storyboard Narrative\n${existingProject.storyboard.narrative}`;
            }
          }

          // Storyboarding runs the creative director + storyboard builder (two LLM
          // passes) -- well over a connector's tool timeout -- so run it as an async
          // job and return a job_id to poll, same as full generation.
          const sbTarget = (params.target === "component" || params.target === "scene") ? "video" : (params.target || "video") as PipelineTarget;
          const sbJob = queueJob("generate", params.tenant_id, async (j) => {
            j.progress = { step: "storyboarding", percent: 10 };
            const pipelineResult = await runGeneratePipeline({
              prompt: storyboardPrompt,
              target: sbTarget,
              tenant_id: params.tenant_id,
              llmConfig,
              onProgress: genProgress(j, 10, 95),
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
              storyboardOnly: true,
            });
            if (pipelineResult.status === "error") throw new Error(pipelineResult.error || "Storyboard failed");
            let project = pipelineResult.project!;

            // If updating an existing project, copy the storyboard over.
            if (params.project_id && params.project_id !== project.project_id) {
              const origProject = await loadProject(params.tenant_id, params.project_id);
              if (origProject) {
                origProject.prompt = project.prompt;
                origProject.storyboard = project.storyboard;
                origProject.status = "storyboard";
                origProject.updated_at = new Date().toISOString();
                await saveProject(origProject);
                project = origProject;
              }
            }
            j.projectId = project.project_id;
            j.progress = { step: "complete", percent: 100 };
            return {
              status: "storyboard",
              project_id: project.project_id,
              preview_url: previewUrl(params.tenant_id, project.project_id),
              storyboard: project.storyboard,
            };
          });

          return ok({
            status: "queued",
            job_id: sbJob.id,
            message: `Building the storyboard. Poll with get(target='job', job_id='${sbJob.id}') or job(action='wait', job_id='${sbJob.id}').`,
          });
        }

        // ── Build from an existing approved storyboard ──
        // In full mode, if the project has already been storyboarded (and possibly
        // edited), build the scenes from THAT storyboard instead of storyboarding a new
        // one. Anything else (no project, a draft project, or a revision via `id`)
        // falls through to the fresh storyboard+scenes run below.
        if (params.project_id && !params.id) {
          const project = await loadProject(params.tenant_id, params.project_id);
          if (project && project.storyboard && project.status === "storyboard") {

          // Use the storyboard's script as the prompt for the unified pipeline
          // Build a rich prompt from the storyboard's narrative + scene details
          const storyboardPrompt = buildPromptFromStoryboard(project.storyboard);

          let llmConfig;
          try {
            llmConfig = llmConfigFromEnv();
          } catch (e: any) {
            return err(`LLM not configured: ${e.message}`);
          }

          const brandKit = await loadBrandKit(params.tenant_id);
          const job = queueJob("generate", params.tenant_id, async (j) => {
            const trace = new TraceBuilder("generate", params.tenant_id, "", storyboardPrompt);
            try {
              j.progress = { step: "generating_from_storyboard", percent: 10 };
              const pipelineResult = await runGeneratePipeline({
                prompt: storyboardPrompt,
                target: "video",
                tenant_id: params.tenant_id,
                llmConfig,
                onProgress: genProgress(j, 10, 95),
                brandKit: brandKit || project.brand_kit,
                canvas: project.canvas,
                creativity: params.creativity,
                project_id: project.project_id,
                voiceover: true,
                backgroundMusic: true,
                voice: project.storyboard!.audio.voice as any,
                sceneCount: project.storyboard!.scenes.length,
              });

              // Copy generated scenes, audio, and assets from the new project back to the original storyboarded project
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
                        console.log(`  Build-from-storyboard: copied ${entries.length} ${subdir} files`);
                      }
                    } catch {
                      // Directory may not exist, skip
                    }
                  }

                  console.log(`  Build-from-storyboard: copied ${generatedProject.scenes.length} scenes from ${newProjectId} to ${params.project_id}`);
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
            message: "Generating scenes from storyboard. Use get(target='job', job_id='" + job.id + "') to check status.",
          });
          }
          // No approved storyboard on this project -> fall through to a fresh run.
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
              onProgress: genProgress(j, 10, 95),
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
      // The /mcp transport already enforces auth (Bearer) before any tool runs,
      // so the per-tool `token` arg is optional — connectors authenticate at the
      // transport, not by passing a token argument. Validate it only if supplied
      // (back-compat for static-token / curl callers).
      if (isAuthEnabled() && params.token && !validateToken(params.token)) {
        return err("Invalid token");
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

  // ─────────────────────────────────────────────
  // website_to_video - one-shot: URL -> on-brand launch video
  // ─────────────────────────────────────────────
  server.tool(
    "website_to_video",
    "One-shot: turn a website URL into an on-brand, rendered launch video. Extracts the brand kit from the URL (colors, fonts, logos, theme), generates scenes, and renders -- in a single async job. Returns a job_id; poll with get(target='job').",
    {
      tenant_id: z.string(),
      url: z.string().describe("Website URL to brand the video from (e.g. https://getquotient.ai)"),
      prompt: z.string().optional().describe("Optional creative direction. If omitted, launch-video direction is derived from the brand."),
      target_duration: z.number().optional().default(24).describe("Target video length in seconds (default 24)"),
      voiceover: z.boolean().optional().default(false),
      background_music: z.boolean().optional().default(false),
      quality: z.enum(["preview", "production"]).optional().default("preview"),
      enhance_brand: z.boolean().optional().default(false).describe("Run LLM brand analysis during extraction (slower, richer guidelines)"),
    },
    async (params) => {
      let llmConfig;
      try { llmConfig = llmConfigFromEnv(); } catch (e: any) { return err(`LLM not configured: ${e.message}`); }

      const job = queueJob("generate", params.tenant_id, async (j) => {
        // 1. Extract + store the brand kit from the URL.
        j.progress = { step: "extracting_brand", percent: 5 };
        const { kit, summary } = await extractAndStoreBrand(params.tenant_id, params.url, params.enhance_brand ?? false);

        // 2. Generate scenes on that brand.
        j.progress = { step: "generating", percent: 25 };
        const duration = params.target_duration ?? 24;
        const domain = params.url.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        const prompt = params.prompt
          || `A polished ~${duration}-second product LAUNCH video for ${domain}. Open on a brand hero/title, then 2-4 beats covering the core value props and any proof points, and close on a clear call to action. Use the brand kit (colors, fonts, logo) and match the brand's theme. Premium, confident pacing.`;
        const pipelineResult = await runGeneratePipeline({
          prompt,
          target: "video" as PipelineTarget,
          tenant_id: params.tenant_id,
          llmConfig,
          onProgress: genProgress(j, 25, 68),  // render takes it from 70 -> 100
          brandKit: kit,
          canvas: { width: 1920, height: 1080, preset: "landscape" as const, fps: 30, background: kit.colors?.background || "#0f172a" },
          voiceover: params.voiceover ?? false,
          backgroundMusic: params.background_music ?? false,
          sceneCount: Math.max(3, Math.min(10, Math.round(duration / 5.5))),
        });
        if (pipelineResult.status !== "completed" || !pipelineResult.project) {
          throw new Error("generation failed: " + (pipelineResult.error || "no project produced"));
        }
        const projectId = pipelineResult.project.project_id;
        j.projectId = projectId;

        // 3. Render (reuses the render queue: preview fps, editorial vision, etc.).
        j.progress = { step: "rendering", percent: 70 };
        const renderJob = queueRender(params.tenant_id, projectId, { quality: params.quality ?? "preview" });
        // Wait for the render job to finish.
        for (;;) {
          await new Promise((r) => setTimeout(r, 3000));
          const rs = getJobStatus(renderJob.id);
          if (!rs) continue;
          if (rs.status === "completed") {
            j.progress = { step: "complete", percent: 100 };
            return {
              status: "completed",
              project_id: projectId,
              output_path: rs.outputPath,
              preview_url: previewUrl(params.tenant_id, projectId),
              brand: { theme: summary.colors, fonts: summary.typography, logos: summary.logos?.length || 0 },
            };
          }
          if (rs.status === "failed") throw new Error("render failed: " + (rs.error || "unknown"));
        }
      });
      job.projectId = "";

      return ok({
        status: "queued",
        job_id: job.id,
        message: `Building an on-brand launch video from ${params.url}. Poll with get(target='job', job_id='${job.id}').`,
      });
    },
  );

  // ─────────────────────────────────────────────
  // regenerate_asset - re-run a generated asset in place (roadmap #3)
  // ─────────────────────────────────────────────
  server.tool(
    "regenerate_asset",
    "Re-run a generated image asset in place using its stored generation params (prompt, model, size, quality) -- optionally with a tweak -- without rebuilding the whole video. Writes a new version, re-wires the scene that uses it, and saves. Re-render the project to see the new asset in the video.",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      asset_id: z.string().describe("Id of the generated asset to re-run (see project.assets[])"),
      prompt: z.string().optional().describe("Override prompt. If omitted, reuses the asset's stored prompt verbatim."),
      prompt_append: z.string().optional().describe("A tweak appended to the stored prompt (e.g. 'make it warmer, more saturated'). Ignored if 'prompt' is given."),
      size: z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).optional().describe("Override image size (defaults to the asset's stored size)."),
      quality: z.enum(["low", "medium", "high", "auto"]).optional().describe("Override image quality (defaults to the asset's stored quality)."),
    },
    async (params) => {
      try {
        const project = await loadProject(params.tenant_id, params.project_id);
        if (!project) return err(`Project not found: ${params.project_id}`);
        const asset = (project.assets || []).find((a) => a.id === params.asset_id);
        if (!asset) return err(`Asset not found: ${params.asset_id}`);
        if (asset.type !== "ai_image") return err(`Asset ${params.asset_id} is type '${asset.type}' -- only ai_image assets are re-runnable.`);
        if (!asset.prompt && !params.prompt) return err(`Asset ${params.asset_id} has no stored prompt; provide 'prompt' to regenerate it.`);

        const basePrompt = params.prompt ?? asset.prompt ?? "";
        const prompt = params.prompt
          ? basePrompt
          : (params.prompt_append ? `${basePrompt}\n\n${params.prompt_append}` : basePrompt);
        const size = (params.size ?? asset.size ?? "1536x1024") as any;
        const quality = (params.quality ?? asset.quality ?? "high") as any;
        const version = (asset.version ?? 1) + 1;

        // New versioned filename next to the old asset so render caches don't collide.
        const assetsDir = projectAssetsDir(params.tenant_id, params.project_id);
        await fs.mkdir(assetsDir, { recursive: true });
        const oldBase = path.basename(asset.path).replace(/(_v\d+)?(\.[a-z0-9]+)$/i, "");
        const ext = (path.extname(asset.path) || ".png").toLowerCase();
        const filename = `${oldBase}_v${version}${ext}`;
        const outputPath = path.join(assetsDir, filename);

        const result = await generateImage({ prompt, size, quality, outputPath });

        const newUrl = `/assets/${params.tenant_id}/projects/${params.project_id}/assets/${filename}`;
        const oldUrl = `/assets/${params.tenant_id}/projects/${params.project_id}/assets/${path.basename(asset.path)}`;

        // Update the asset record in place.
        asset.path = result.path;
        asset.prompt = prompt;
        asset.size = size;
        asset.quality = quality;
        asset.width = result.width;
        asset.height = result.height;
        asset.version = version;
        asset.created_at = new Date().toISOString();

        // Re-wire any scene component that pointed at the old asset to the new file.
        let rewired = 0;
        for (const scene of project.scenes) {
          for (const comp of scene.components || []) {
            const src = (comp.data as any)?.src;
            if (src && (src === oldUrl || src === asset.path || path.basename(String(src)) === path.basename(oldUrl))) {
              (comp.data as any).src = newUrl;
              rewired++;
            }
          }
        }

        await saveProject(project);

        return ok({
          status: "regenerated",
          asset_id: asset.id,
          version,
          prompt,
          size,
          quality,
          path: result.path,
          url: newUrl,
          scene_components_rewired: rewired,
          preview_url: previewUrl(params.tenant_id, params.project_id),
          note: "Re-render the project to bake the new asset into the video.",
        });
      } catch (e: any) {
        return err(`Asset regeneration failed: ${e.message}`);
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

/**
 * Build a rich prompt from a storyboard for the unified pipeline.
 * Converts the storyboard's script into a format the storyboard builder understands.
 */
function buildPromptFromStoryboard(storyboard: import("./core/types.js").Storyboard): string {
  let prompt = storyboard.narrative;
  prompt += "\n\n## Script (FOLLOW THIS EXACTLY)\n";
  prompt += `Narrative: ${storyboard.narrative}\n\n`;

  for (let i = 0; i < storyboard.scenes.length; i++) {
    const s = storyboard.scenes[i];
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
          // Real asset -- tell the storyboard builder to use it
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

  prompt += `Music mood: ${storyboard.audio.music_mood}\n`;
  prompt += `Pacing: ${storyboard.audio.pacing}\n`;

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
