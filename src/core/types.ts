/**
 * Core types for the media producer.
 */

// ── Output Formats ──

export type OutputFormat = "video" | "image" | "slideshow" | "deck" | "one-pager";

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
  url: string;
  placement?: string;
  height?: number;
}

export interface BrandKit {
  colors: BrandColors;
  fonts: BrandFont[];
  logo?: BrandLogo;
  style?: {
    border_radius?: string;
    motion?: "minimal" | "punchy" | "cinematic";
  };
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
  type: "crossfade" | "wipe-left" | "wipe-right" | "slide-up" | "slide-down" | "iris" | "none";
  duration_seconds: number;
}

export interface Scene {
  id: string;
  label?: string;
  duration_seconds: number;
  background?: string;
  transition_in?: SceneTransition;
  components: SceneComponent[];
}

// ── Overlays ──

export interface Overlay {
  id: string;
  type: "speaker-video" | "watermark" | "logo";
  source: string;
  position: string;
  size?: { width: number; height: number };
  shape?: "circle" | "rounded-rect" | "rect";
  border?: { color: string; width: number };
  opacity?: number;
  margin?: number;
  start_time?: number;
  end_time?: number | null;
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
  type: "recording" | "image" | "audio" | "logo" | "other";
  path: string;
  name?: string;
  source_url?: string;
  duration_seconds?: number;
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
