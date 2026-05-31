/**
 * MCP Server for media-producer-mcp.
 *
 * Exposes project management, scene/component operations,
 * brand kit management, and rendering tools via MCP protocol.
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
import type { Scene, SceneComponent, BrandKit } from "./core/types.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "media-producer-mcp",
    version: "0.1.0",
  });

  // ─────────────────────────────────────────────
  // Project Management
  // ─────────────────────────────────────────────

  server.tool(
    "create_project",
    "Create a new media project (video, image, deck, one-pager, slideshow)",
    {
      tenant_id: z.string().describe("Tenant identifier"),
      name: z.string().describe("Project name"),
      format: z.enum(["video", "image", "slideshow", "deck", "one-pager"]).describe("Output format"),
      preset: z.enum(["landscape", "vertical", "square"]).optional().describe("Resolution preset (default: landscape)"),
      fps: z.number().optional().describe("Frames per second for video/slideshow (default: 30)"),
    },
    async (params) => {
      const project = await createProject({
        tenant_id: params.tenant_id,
        name: params.name,
        format: params.format,
        preset: params.preset,
        fps: params.fps,
      });
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "get_project",
    "Get a project's full state and metadata",
    {
      tenant_id: z.string(),
      project_id: z.string(),
    },
    async (params) => {
      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "list_projects",
    "List all projects for a tenant",
    {
      tenant_id: z.string(),
    },
    async (params) => {
      const projects = await listProjects(params.tenant_id);
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    },
  );

  server.tool(
    "update_project",
    "Update project metadata (name, canvas, brand_kit, status)",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      name: z.string().optional(),
      canvas: z.object({
        width: z.number().optional(),
        height: z.number().optional(),
        preset: z.enum(["landscape", "vertical", "square"]).optional(),
        fps: z.number().optional(),
        background: z.string().optional(),
      }).optional(),
      status: z.enum(["draft", "rendering", "rendered", "failed"]).optional(),
    },
    async (params) => {
      const updates: Record<string, unknown> = {};
      if (params.name !== undefined) updates.name = params.name;
      if (params.canvas !== undefined) updates.canvas = params.canvas;
      if (params.status !== undefined) updates.status = params.status;

      const project = await updateProject(params.tenant_id, params.project_id, updates as any);
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "delete_project",
    "Delete a project and all its data",
    {
      tenant_id: z.string(),
      project_id: z.string(),
    },
    async (params) => {
      const ok = await deleteProject(params.tenant_id, params.project_id);
      return { content: [{ type: "text", text: ok ? "Deleted" : "Project not found" }] };
    },
  );

  // ─────────────────────────────────────────────
  // Scene Operations
  // ─────────────────────────────────────────────

  server.tool(
    "add_scene",
    "Add a scene to a project",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene: z.object({
        id: z.string(),
        label: z.string().optional(),
        duration_seconds: z.number(),
        background: z.string().optional(),
        transition_in: z.object({
          type: z.enum(["crossfade", "wipe-left", "wipe-right", "slide-up", "slide-down", "iris", "none"]),
          duration_seconds: z.number(),
        }).optional(),
        components: z.array(z.object({
          id: z.string(),
          type: z.string(),
          data: z.record(z.unknown()),
          position: z.object({
            x: z.union([z.number(), z.string()]),
            y: z.union([z.number(), z.string()]),
            width: z.union([z.number(), z.string()]).optional(),
            height: z.union([z.number(), z.string()]).optional(),
          }).optional(),
          z_index: z.number().optional(),
          enter: z.object({
            effect: z.string(),
            duration: z.number().optional(),
            stagger: z.number().optional(),
            ease: z.string().optional(),
          }).optional(),
          exit: z.object({
            effect: z.string(),
            duration: z.number().optional(),
            stagger: z.number().optional(),
            ease: z.string().optional(),
          }).optional(),
        })).default([]),
      }),
      position: z.number().optional().describe("Insert position (0-based). Appends if omitted."),
    },
    async (params) => {
      const project = await addScene(
        params.tenant_id,
        params.project_id,
        params.scene as Scene,
        params.position,
      );
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "update_scene",
    "Update a scene's properties (label, duration, background, transition, components)",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string(),
      label: z.string().optional(),
      duration_seconds: z.number().optional(),
      background: z.string().optional(),
      transition_in: z.object({
        type: z.enum(["crossfade", "wipe-left", "wipe-right", "slide-up", "slide-down", "iris", "none"]),
        duration_seconds: z.number(),
      }).optional(),
    },
    async (params) => {
      const updates: Record<string, unknown> = {};
      if (params.label !== undefined) updates.label = params.label;
      if (params.duration_seconds !== undefined) updates.duration_seconds = params.duration_seconds;
      if (params.background !== undefined) updates.background = params.background;
      if (params.transition_in !== undefined) updates.transition_in = params.transition_in;

      const project = await updateScene(
        params.tenant_id,
        params.project_id,
        params.scene_id,
        updates as any,
      );
      if (!project) {
        return { content: [{ type: "text", text: "Project or scene not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "remove_scene",
    "Remove a scene from a project",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string(),
    },
    async (params) => {
      const project = await removeScene(params.tenant_id, params.project_id, params.scene_id);
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "reorder_scenes",
    "Reorder scenes in a project by providing the scene IDs in desired order",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_ids: z.array(z.string()).describe("Scene IDs in desired order"),
    },
    async (params) => {
      const project = await reorderScenes(params.tenant_id, params.project_id, params.scene_ids);
      if (!project) {
        return { content: [{ type: "text", text: "Project not found or invalid scene IDs" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  // ─────────────────────────────────────────────
  // Component Operations (within a scene)
  // ─────────────────────────────────────────────

  server.tool(
    "add_component",
    "Add a component to a scene",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string(),
      component: z.object({
        id: z.string(),
        type: z.string(),
        data: z.record(z.unknown()),
        position: z.object({
          x: z.union([z.number(), z.string()]),
          y: z.union([z.number(), z.string()]),
          width: z.union([z.number(), z.string()]).optional(),
          height: z.union([z.number(), z.string()]).optional(),
        }).optional(),
        z_index: z.number().optional(),
        enter: z.object({
          effect: z.string(),
          duration: z.number().optional(),
          stagger: z.number().optional(),
          ease: z.string().optional(),
        }).optional(),
        exit: z.object({
          effect: z.string(),
          duration: z.number().optional(),
          stagger: z.number().optional(),
          ease: z.string().optional(),
        }).optional(),
      }),
    },
    async (params) => {
      const project = await addComponent(
        params.tenant_id,
        params.project_id,
        params.scene_id,
        params.component as SceneComponent,
      );
      if (!project) {
        return { content: [{ type: "text", text: "Project or scene not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "update_component",
    "Update a component's data, position, z_index, or animations",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string(),
      component_id: z.string(),
      data: z.record(z.unknown()).optional(),
      position: z.object({
        x: z.union([z.number(), z.string()]),
        y: z.union([z.number(), z.string()]),
        width: z.union([z.number(), z.string()]).optional(),
        height: z.union([z.number(), z.string()]).optional(),
      }).optional(),
      z_index: z.number().optional(),
      enter: z.object({
        effect: z.string(),
        duration: z.number().optional(),
        stagger: z.number().optional(),
        ease: z.string().optional(),
      }).optional(),
      exit: z.object({
        effect: z.string(),
        duration: z.number().optional(),
        stagger: z.number().optional(),
        ease: z.string().optional(),
      }).optional(),
    },
    async (params) => {
      const updates: Record<string, unknown> = {};
      if (params.data !== undefined) updates.data = params.data;
      if (params.position !== undefined) updates.position = params.position;
      if (params.z_index !== undefined) updates.z_index = params.z_index;
      if (params.enter !== undefined) updates.enter = params.enter;
      if (params.exit !== undefined) updates.exit = params.exit;

      const project = await updateComponent(
        params.tenant_id,
        params.project_id,
        params.scene_id,
        params.component_id,
        updates as any,
      );
      if (!project) {
        return { content: [{ type: "text", text: "Project, scene, or component not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "remove_component",
    "Remove a component from a scene",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string(),
      component_id: z.string(),
    },
    async (params) => {
      const project = await removeComponent(
        params.tenant_id,
        params.project_id,
        params.scene_id,
        params.component_id,
      );
      if (!project) {
        return { content: [{ type: "text", text: "Project, scene, or component not found" }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
    },
  );

  server.tool(
    "list_components",
    "List available component types (built-in library)",
    {},
    async () => {
      // Return the known built-in component catalog from the spec
      const components = [
        // Titles & Text
        { type: "title-slide", category: "titles", label: "Title Slide" },
        { type: "section-header", category: "titles", label: "Section Header" },
        { type: "kinetic-text", category: "titles", label: "Kinetic Text" },
        { type: "typewriter", category: "titles", label: "Typewriter" },
        { type: "stat-card", category: "titles", label: "Stat Card" },
        { type: "quote-block", category: "titles", label: "Quote Block" },
        { type: "code-block", category: "titles", label: "Code Block" },
        { type: "text-list", category: "titles", label: "Text List" },
        // Layouts
        { type: "split-screen", category: "layouts", label: "Split Screen" },
        { type: "grid-layout", category: "layouts", label: "Grid Layout" },
        { type: "bento-grid", category: "layouts", label: "Bento Grid" },
        { type: "browser-frame", category: "layouts", label: "Browser Frame" },
        { type: "device-mockup", category: "layouts", label: "Device Mockup" },
        { type: "terminal", category: "layouts", label: "Terminal" },
        // Media
        { type: "image-showcase", category: "media", label: "Image Showcase" },
        { type: "video-embed", category: "media", label: "Video Embed" },
        { type: "logo-intro", category: "media", label: "Logo Intro" },
        { type: "logo-outro", category: "media", label: "Logo Outro" },
        { type: "screenshot-zoom", category: "media", label: "Screenshot Zoom" },
        // Data Viz
        { type: "bar-chart", category: "data", label: "Bar Chart" },
        { type: "line-chart", category: "data", label: "Line Chart" },
        { type: "pie-chart", category: "data", label: "Pie Chart" },
        { type: "progress-bar", category: "data", label: "Progress Bar" },
        { type: "metric-dashboard", category: "data", label: "Metric Dashboard" },
        { type: "comparison-table", category: "data", label: "Comparison Table" },
        // Product Mockups
        { type: "chat-interface", category: "mockups", label: "Chat Interface" },
        { type: "dashboard-ui", category: "mockups", label: "Dashboard UI" },
        { type: "form-flow", category: "mockups", label: "Form Flow" },
        { type: "notification-toast", category: "mockups", label: "Notification Toast" },
        { type: "modal-dialog", category: "mockups", label: "Modal Dialog" },
        { type: "cursor-flow", category: "mockups", label: "Cursor Flow" },
        // Effects
        { type: "gradient-background", category: "effects", label: "Gradient Background" },
        { type: "mesh-gradient", category: "effects", label: "Mesh Gradient" },
        { type: "particle-field", category: "effects", label: "Particle Field" },
        { type: "film-polish", category: "effects", label: "Film Polish" },
        { type: "spotlight", category: "effects", label: "Spotlight" },
        // CTA
        { type: "cta-card", category: "cta", label: "CTA Card" },
        { type: "social-proof", category: "cta", label: "Social Proof" },
        { type: "pricing-card", category: "cta", label: "Pricing Card" },
      ];
      return { content: [{ type: "text", text: JSON.stringify(components, null, 2) }] };
    },
  );

  // ─────────────────────────────────────────────
  // Brand Kit
  // ─────────────────────────────────────────────

  server.tool(
    "get_brand_kit",
    "Get a tenant's brand kit",
    {
      tenant_id: z.string(),
    },
    async (params) => {
      const kit = await loadBrandKit(params.tenant_id);
      if (!kit) {
        return { content: [{ type: "text", text: "No brand kit found for tenant" }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(kit, null, 2) }] };
    },
  );

  server.tool(
    "set_brand_kit",
    "Set or update a tenant's brand kit (colors, fonts, style)",
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
      // Load existing or start fresh
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
          { family: "Inter", source: "google", weights: [400, 500, 600, 700, 800] },
        ],
        logo: params.logo || existing?.logo,
        style: {
          border_radius: "12px",
          motion: "cinematic",
          ...existing?.style,
          ...params.style,
        },
      };

      await saveBrandKit(params.tenant_id, kit);
      return { content: [{ type: "text", text: JSON.stringify(kit, null, 2) }] };
    },
  );

  // ─────────────────────────────────────────────
  // Rendering (stubs -- will wire to render pipeline)
  // ─────────────────────────────────────────────

  server.tool(
    "render_project",
    "Render a project to its output format (video/image/deck/etc.)",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      quality: z.enum(["preview", "production"]).optional().describe("Render quality (default: production)"),
    },
    async (params) => {
      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }

      if (project.scenes.length === 0) {
        return { content: [{ type: "text", text: "Project has no scenes" }], isError: true };
      }

      // TODO: Wire to renderProject() from core/render.ts
      // For now, mark as rendering and return status
      project.status = "rendering";
      await saveProject(project);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "rendering",
            project_id: project.project_id,
            format: project.format,
            scenes: project.scenes.length,
            message: "Render queued. Use render_status to check progress.",
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    "render_scene",
    "Render a single scene as an image preview",
    {
      tenant_id: z.string(),
      project_id: z.string(),
      scene_id: z.string(),
    },
    async (params) => {
      const project = await loadProject(params.tenant_id, params.project_id);
      if (!project) {
        return { content: [{ type: "text", text: "Project not found" }], isError: true };
      }

      const scene = project.scenes.find((s) => s.id === params.scene_id);
      if (!scene) {
        return { content: [{ type: "text", text: "Scene not found" }], isError: true };
      }

      // TODO: Wire to scene-level render
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            status: "queued",
            scene_id: scene.id,
            message: "Scene render not yet wired to capture pipeline.",
          }, null, 2),
        }],
      };
    },
  );

  return server;
}
