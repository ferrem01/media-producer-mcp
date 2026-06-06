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

export type BrandAssetType = "background" | "intro" | "outro" | "watermark" | "music";

export interface BrandAsset {
  name: string;           // e.g. "hero-gradient", "logo-bouncy-wink"
  url: string;            // served URL
  type: BrandAssetType;   // asset category
  tags?: string[];        // e.g. ["hero", "dark", "abstract"]
  width?: number;
  height?: number;
  duration?: number;      // seconds, for video/audio assets
}

export interface BrandKit {
  colors: BrandColors;
  fonts: BrandFont[];
  logo?: BrandLogo;       // primary logo (backwards compat)
  logos?: BrandLogo[];     // all logo variants
  assets?: BrandAsset[];  // brand assets (backgrounds, intros, outros, watermarks, music)
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

export interface ContentRegion {
  side: "left" | "right";
  /** Width of the content region, e.g. "40%", "500px" */
  width: string;
  /** Optional padding/offset from the edge, e.g. "20px" */
  offset?: string;
}

export interface Scene {
  id: string;
  label?: string;
  duration_seconds: number;
  background?: string;
  transition_in?: SceneTransition;
  components: SceneComponent[];
  audio_hints?: SceneAudioHints;
  /** When set, all components are constrained to this region of the frame.
   *  Used with full-behind speaker overlay so content appears beside the speaker. */
  content_region?: ContentRegion;
  /** When true, the scene background is rendered transparently (used with full-behind overlays). */
  transparent_background?: boolean;
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
    mode: "full" | "pip" | "audio-only" | "full-behind";
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
  /** New continuous speaker track architecture (replaces per-scene full-behind overlay) */
  speaker_track?: SpeakerTrack;
}

// ── Speaker Track ──

export interface SpeakerTrackClip {
  /** Path to the speaker video file */
  source: string;
  /** Start offset into the source video in seconds (skip dead air) */
  start?: number;
  /** Trim: only use video from this timestamp */
  trim_start?: number;
  /** Trim: stop using video at this timestamp */
  trim_end?: number;
}

export interface SpeakerTrack {
  /** Ordered list of speaker video clips played end-to-end */
  clips: SpeakerTrackClip[];
}
