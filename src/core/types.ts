/**
 * Core types for the media producer.
 */

// ── Output Formats ──

export type OutputFormat = "video" | "image" | "slideshow" | "presentation" | "one-pager" | "gif" | "social" | "email-header" | "thumbnail";

// ── Canvas ──

export type ResolutionPreset = "landscape" | "vertical" | "square";

export const RESOLUTION_DIMENSIONS: Record<ResolutionPreset, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

export interface Canvas {
  width: number;
  height: number;
  preset: ResolutionPreset;
  fps: number;
  background: string;
}

// ── Brand Kit ──

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  text_muted: string;
}

export interface BrandFont {
  family: string;
  source: "google" | "custom" | "system";
  weights?: number[];
  url?: string;
}

export interface BrandLogo {
  name: string;           // e.g. "full-dark", "icon-light"
  url: string;            // served URL or external URL
  variant: "full" | "icon" | "wordmark";  // logo type
  theme: "dark" | "light" | "any";        // which backgrounds it works on
  height?: number;
  /** @deprecated Use name/variant/theme instead */
  placement?: string;
}

export interface BrandAsset {
  name: string;           // e.g. "hero-gradient"
  url: string;            // served URL
  tags: string[];         // e.g. ["hero", "dark", "abstract"]
  width?: number;
  height?: number;
}

export interface BrandAssets {
  backgrounds: BrandAsset[];
}

export interface BrandKit {
  colors: BrandColors;
  fonts: BrandFont[];
  logo?: BrandLogo;       // primary logo (backwards compat)
  logos?: BrandLogo[];     // all logo variants
  assets?: BrandAssets;   // brand backgrounds, etc.
  style?: {
    border_radius?: string;
    motion?: "minimal" | "punchy" | "cinematic";
  };
  guidelines?: string;    // free-form brand rules injected into planner/generator prompts
}

// ── Components ──

export interface ComponentPosition {
  x: number | string;
  y: number | string;
  width?: number | string;
  height?: number | string;
}

export interface ComponentAnimation {
  effect: string;
  duration?: number;
  stagger?: number;
  ease?: string;
}

export interface SceneComponent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position?: ComponentPosition;
  z_index?: number;
  enter?: ComponentAnimation;
  exit?: ComponentAnimation;
}

// ── Scenes ──

export interface SceneTransition {
  type: "crossfade" | "blur-crossfade" | "slide-reveal" | "zoom-through" | "glitch-cut" | "morph-wipe" | "scale-rotate" | "curtain" | "wipe-left" | "wipe-right" | "slide-up" | "slide-down" | "iris" | "none";
  duration_seconds: number;
}

export interface SceneAudioHints {
  voiceover_text?: string;
  sync_points?: Array<{ at: number; label: string }>;
}

export interface Scene {
  id: string;
  label?: string;
  duration_seconds: number;
  background?: string;
  transition_in?: SceneTransition;
  components: SceneComponent[];
  audio_hints?: SceneAudioHints;
}

// ── Overlays ──

export interface Overlay {
  id: string;
  type: "speaker-video" | "watermark" | "logo";
  source: string;
  position?: string;
  size?: { width: number; height: number };
  shape?: "circle" | "rounded-rect" | "rect";
  border?: { color: string; width: number };
  opacity?: number;
  margin?: number;
  start_time?: number;
  end_time?: number | null;
  segments?: Array<{
    start: number;
    end: number;
    mode: "full" | "pip" | "audio-only";
    position?: string;
    shape?: string;
    size?: { width: number; height: number };
    lower_third?: { name: string; title?: string };
  }>;
}

// ── Audio ──

export interface AudioTrack {
  id: string;
  type: "voiceover" | "music" | "sfx";
  source: string;
  volume: number;
  start_time?: number;
  loop?: boolean;
  fade_in?: number;
  fade_out?: number;
}

export interface AudioDucking {
  enabled: boolean;
  duck_track: string;
  trigger_track: string;
  ducked_volume: number;
  attack?: number;
  release?: number;
}

export interface AudioConfig {
  tracks: AudioTrack[];
  ducking?: AudioDucking;
}

// ── Assets ──

export interface Asset {
  id: string;
  type: "recording" | "image" | "audio" | "logo" | "ai_image" | "capture" | "other";
  path: string;
  name?: string;
  source_url?: string;
  duration_seconds?: number;
  /** For AI-generated images: the prompt used */
  prompt?: string;
  /** Image dimensions */
  width?: number;
  height?: number;
  /** Model used for generation */
  model?: string;
  /** Scene this asset was generated for */
  scene_id?: string;
  /** When the asset was created */
  created_at?: string;
}

// ── Project ──

export type ProjectStatus = "draft" | "rendering" | "rendered" | "failed";

export interface Project {
  project_id: string;
  tenant_id: string;
  name: string;
  format: OutputFormat;
  status: ProjectStatus;
  canvas: Canvas;
  brand_kit: BrandKit;
  scenes: Scene[];
  overlays?: Overlay[];
  audio?: AudioConfig;
  assets?: Asset[];
}
