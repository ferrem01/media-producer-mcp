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

export type BrandAssetType =
  | "background" | "intro" | "outro" | "watermark" | "music"
  // Harvested imagery (extract_brand_from_website with include_images):
  | "product"      // product/UI screenshots, device shots, feature imagery
  | "screenshot"   // app/dashboard captures
  | "image";       // generic brand/marketing imagery (photos, illustrations, heroes)

export interface BrandAsset {
  name: string;           // e.g. "hero-gradient", "logo-bouncy-wink"
  url: string;            // served URL
  type: BrandAssetType;   // asset category
  description?: string;   // model-readable caption so the LLM can pick the right asset
  tags?: string[];        // e.g. ["hero", "dark", "abstract"]
  source_url?: string;    // original image URL (or page) the asset was harvested from
  width?: number;
  height?: number;
  duration?: number;      // seconds, for video/audio assets
}

export interface BrandKit {
  colors: BrandColors;
  fonts: BrandFont[];
  logos?: BrandLogo[];     // all logo variants (full/icon/wordmark, dark/light/any)
  assets?: BrandAsset[];  // brand assets (backgrounds, intros, outros, watermarks, music)
  style?: {
    border_radius?: string;
    motion?: "minimal" | "punchy" | "cinematic";
  };
  guidelines?: string;    // free-form brand rules injected into storyboard builder/generator prompts
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";  // preferred TTS voice
  design_system?: DesignSystem;
}

// ── Components ──

export interface ComponentPosition {
  x: number | string;
  y: number | string;
  width?: number | string;
  height?: number | string;
}

export interface ComponentAnimation {
  /** slide-left | slide-right | slide-up | slide-down | fade | rise | pop */
  effect: string;
  /** Scene-local start time in seconds. Enter defaults to 0; exit defaults
   *  to scene end minus duration. */
  at?: number;
  duration?: number;
  stagger?: number;
  ease?: string;
}

/** Persistent 3D pose of a component wrapper on the stage -- the object
 *  tilting, not the camera moving (SPEC-motion-architecture: rotate-3d is
 *  pose, camera is scene-level). Applied as a standing transform on the
 *  .mp-component wrapper with perspective. */
export interface ComponentPose {
  rotate_x?: number;
  rotate_y?: number;
}

export interface SceneComponent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position?: ComponentPosition;
  z_index?: number;
  pose?: ComponentPose;
  enter?: ComponentAnimation;
  exit?: ComponentAnimation;
}

// ── Scenes ──

/**
 * A beat: one thought inside a scene's continuous take.
 *
 * The film layer's editorial rule is "cut = new world, beat = new thought": a
 * scene is ONE persistent world (one HTML document, one master timeline), and
 * beats are the moments the idea advances INSIDE it -- elements morph, move,
 * and re-light rather than being torn down. Beats are authored by the
 * storyboard (on the music bar grid when one exists), rendered by codegen as
 * labeled segments of the master timeline, and verified by the critique loop
 * (contact-sheet frames sample beat midpoints; a beat that produces no visual
 * change is a "dead beat" defect).
 */
export interface SceneBeat {
  /** Short name for the moment, e.g. "the pile-up", "the reveal". */
  label: string;
  /** Beat length in seconds (authored in bars when a beat grid exists). */
  duration_seconds: number;
  /** What HAPPENS during this beat -- motion verbs, what transforms. */
  action: string;
  /** Narration for this beat (concatenated into the scene voiceover). */
  voiceover_text?: string;
}

export interface SceneTransition {
  type: "crossfade" | "blur-crossfade" | "slide-reveal" | "zoom-through" | "glitch-cut" | "morph-wipe" | "scale-rotate" | "curtain" | "wipe-left" | "wipe-right" | "slide-up" | "slide-down" | "iris" | "glass-turn" | "match-cut" | "whip-pan" | "cinematic-zoom" | "push"
    // WebGL shader transitions (gl-transitions engine in transitions.ts)
    | "shader-crosswarp" | "shader-ripple" | "shader-radial" | "shader-directional-warp" | "shader-burn" | "shader-chromatic" | "shader-lens-distortion" | "shader-swirl" | "shader-pixelize"
    | "shader-flash-white" | "shader-light-leak" | "shader-gravitational-lens" | "shader-thermal" | "shader-domain-warp" | "shader-ridged-burn"
    | "none";
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

/**
 * The critique loop's final verdict on a scene, persisted so it's visible
 * without excavating server logs. `passed` distinguishes a scene that
 * satisfied the aesthetic score + every gate from one that exhausted its
 * revision budget and shipped its best (still-defective) attempt anyway --
 * the latter is exactly what the studio should badge for a targeted `revise`.
 */
export interface SceneQuality {
  /** Effective score of the attempt that shipped (may be < 0: runtime/defect penalized). */
  score: number;
  /** How many generation attempts this scene went through. */
  attempts: number;
  /** True if the shipped attempt passed the aesthetic threshold AND all gates clean. */
  passed: boolean;
  /** "[type] detail" for every defect still present on the shipped attempt. Empty when passed. */
  unresolved_defects: string[];
}

/**
 * A deterministic scene-camera move, authored by direct manipulation in
 * Studio (click a point at a time) -- never by prompt. Applied by the
 * assembler as GSAP tweens on a wrapper rig, so it works on any existing
 * scene without regeneration and remains editable/deletable data.
 */
export interface CameraMove {
  /** Scene-local start time in seconds. */
  at: number;
  type: "zoom" | "pan" | "rotate" | "reset";
  /** Focal point as percent of canvas (0-100). Defaults to center. */
  x?: number;
  y?: number;
  /** What to move. Omitted = the whole scene (cinematic punch-in).
   *  "screencast" = the largest non-speaker video, rigged INSIDE its clipping
   *  frame -- the screen content magnifies while browser chrome and PiP stay
   *  fixed. Any other value is a CSS selector for the media element to rig. */
  target?: string;
  /** Semantic anchor target: "componentId.anchorName" (or just "anchorName"
   *  to search the whole scene). Resolved at the move's start time by
   *  measuring [data-anchor=anchorName] inside the component's wrapper --
   *  works while the component is mid-entrance, posed, or drifting, where a
   *  drawn rect would go stale (SPEC-motion-architecture). Anchored moves
   *  ride the whole-scene camera rig; target is ignored when anchor is set. */
  anchor?: string;
  /** Zoom factor for type=zoom (e.g. 1.8); rotate keeps the camera's
   *  current zoom unless this is set. Type=pan IGNORES scale entirely:
   *  a pan is pure translation at whatever zoom the camera holds when it
   *  fires (pan and zoom are peer effects that may overlap; a pan
   *  mid-zoom-hold glides at that zoom, its return restores the pre-pan
   *  position, and a pan on a wide camera is a deliberate no-op -- there
   *  is nowhere to pan at 1x). Ignored when w/h are present. */
  scale?: number;
  /** type=rotate only: rotation axis. "z" (default) is the flat 2D spin;
   *  "y" is the 3D book-page turn; "x" tilts toward/away vertically.
   *  Non-z axes get perspective automatically. */
  axis?: "x" | "y" | "z";
  /** type=rotate only (3D axes): signed sideways shift as canvas % --
   *  clears space beside the tilted frame (y-axis shifts horizontally,
   *  x-axis vertically). */
  shift?: number;
  /** Drawn-box dimensions as canvas % (x,y = box center). When present, the
   *  scale is computed at apply time so the box just fills the rig's frame --
   *  "what you outlined is what you get". */
  w?: number;
  h?: number;
  /** Degrees for type=rotate. */
  angle?: number;
  /** Seconds the move eases over (default 1). */
  duration?: number;
  /** Seconds to hold before returning (only with return=true). */
  hold?: number;
  /** Ease back to wide after duration+hold. */
  return?: boolean;
  ease?: string;
}

/** One stretch of a media element's source-map: play source [src_start,
 *  src_end) at `rate`. Cuts-with-continuity are just very fast segments
 *  (timelapse); hard jump-cuts are gaps between consecutive segments'
 *  source ranges. Output duration = (src_end - src_start) / rate. */
export interface MediaSegment {
  /** Seconds into the SOURCE file where this stretch starts. */
  src_start: number;
  /** Seconds into the SOURCE file where this stretch ends (exclusive). */
  src_end: number;
  /** Playback rate (1 = real time, 8 = timelapse). Must be > 0. Ignored (0)
   *  for a freeze/hold segment. */
  rate: number;
  /** FREEZE/HOLD: when set (> 0), this segment holds frame `src_start` frozen
   *  for `hold` seconds of OUTPUT time -- the source clock does not advance.
   *  `src_end` equals `src_start` and `rate` is 0. This is a TRUE freeze (one
   *  frame parked), not slow playback. */
  hold?: number;
  /** TIMELAPSE marker: this segment is a deliberate timelapse beat. Its rate
   *  is EXEMPT from the 16x cap, and above ~8x renderers switch to sampled
   *  playback (hold each sampled frame ~0.45s) plus an elapsed-clock chip
   *  instead of continuous fast motion. */
  tl?: 1;
}

/** A deliberate timelapse: source [src_start, src_end) plays in EXACTLY
 *  `out_seconds` of output time, however fast that requires (cap-exempt).
 *  Renders as sampled frames + an elapsed clock above ~8x. */
export interface MediaTimelapse { src_start: number; src_end: number; out_seconds: number }

/** A media element's edit: ordered segments (monotonic source times). When
 *  the mapped source runs out before the element stops being shown, the
 *  last frame FREEZES. Keyed on the scene by the same target grammar as
 *  camera moves ("screencast" or a video[src*="file"] selector), so several
 *  videos in one scene (side-by-side demos) each carry their own edit. */
/** A removed range of SOURCE footage (restorable: the file is untouched). */
export interface MediaCut { src_start: number; src_end: number }
/** A playback-rate preference over a SOURCE range (compress-waiting emits these). */
export interface MediaRateRegion { src_start: number; src_end: number; rate: number }
/** A sync anchor: "when the narration reaches `out`, source moment `src` is
 *  on screen." Pins are CONSTRAINTS -- every other edit re-solves around them. */
export interface MediaPin { out: number; src: number; word?: string }

export interface MediaEdit {
  /** DERIVED playback map -- always present; playback/render/capture read
   *  ONLY this. When intents (cuts/rate_regions/pins) exist, segments are
   *  recompiled from them by solveMediaEdits on every save. */
  segments: MediaSegment[];
  pins?: MediaPin[];
  /** Edit intents. Absent on legacy edits (segments authored directly);
   *  inferred from segments on the first op-based edit. */
  cuts?: MediaCut[];
  rate_regions?: MediaRateRegion[];
  /** Deliberate timelapse beats (exact-duration, cap-exempt spans). */
  timelapses?: MediaTimelapse[];
  /** Derived per-pin health from the last solve. */
  pin_status?: Array<{ out: number; status: "ok" | "strained" | "broken"; detail?: string }>;
}

export interface Scene {
  id: string;
  label?: string;
  duration_seconds: number;
  background?: string;
  transition_in?: SceneTransition;
  components: SceneComponent[];
  /** Direct-manipulation camera moves (zoom/pan/rotate the whole scene). */
  camera_moves?: CameraMove[];
  /** Source-maps for the scene's media elements: condense a long screencast
   *  (cut waiting, timelapse dead air, speed sections) without touching the
   *  scene's own clock or the speaker track. Key = media target selector. */
  media_edits?: Record<string, MediaEdit>;
  /** The scene's internal beat timeline (continuous-take scenes). Offsets are
   *  implicit: beat N starts where beat N-1 ended, beat 0 starts at 0. */
  beats?: SceneBeat[];
  /** Critique loop's final verdict on this scene (see SceneQuality). Absent
   *  when critique was skipped. */
  quality?: SceneQuality;
  audio_hints?: SceneAudioHints;
  /** When set, all components are constrained to this region of the frame.
   *  Used with speaker track so content appears beside the speaker. */
  content_region?: ContentRegion;
  /** When true, the scene background is rendered transparently (used with full-behind overlays). */
  transparent_background?: boolean;
}

// ── Audio ──

export interface AudioTrack {
  id: string;
  type: "voiceover" | "music" | "sfx";
  source: string;
  volume: number;
  start_time?: number;
  /** Skip this many seconds of the source before it starts playing (e.g.
   *  align a music track's first downbeat with video t=0). */
  trim_start?: number;
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
  /** Beat grid of the background music (music-first timeline). Scene cuts are
   *  quantized to this grid at storyboard time; stored for debugging and for
   *  downstream beat-aware animation. */
  beat_map?: {
    bpm: number;
    beat_sec: number;
    bar_sec: number;
    first_downbeat_sec: number;
    confidence: number;
  };
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
  /** For AI-generated images: the size passed to the model (re-runnable) */
  size?: string;
  /** For AI-generated images: the quality passed to the model (re-runnable) */
  quality?: string;
  /** Reference asset ids/urls fed into generation (re-runnable) */
  references?: string[];
  /** Regeneration count -- bumped each time the asset is re-run in place */
  version?: number;
  /** Scene this asset was generated for */
  scene_id?: string;
  /** When the asset was created */
  created_at?: string;
}


// ── Storyboard ──

export interface Storyboard {
  /** Narrative summary */
  narrative: string;
  /** Scene-by-scene storyboard */
  scenes: StoryboardScene[];
  /** Audio direction */
  audio: StoryboardAudioDirection;
  /** Estimated total duration */
  estimated_duration: number;
  /** Feedback that shaped this storyboard */
  revision_notes?: string[];
}

export interface StoryboardAudioDirection {
  music_mood: string;
  voice: string;
  pacing: "slow" | "moderate" | "fast";
}

export interface StoryboardScene {
  /** Scene label */
  label: string;
  /** What this scene communicates */
  purpose: string;
  /** Scene template ID (e.g. O1, C1, D1) */
  template: string;
  /** Voiceover script */
  voiceover_text?: string;
  /** Duration */
  duration_seconds: number;
  /** What this scene needs to look great */
  assets: AssetRequirement[];
  /** Visual description for the storyboard */
  visual_notes: string;
  /** Library components the storyboard builder suggested embedding in this
   *  scene. Plain string = type only. Object = storyboard-authored data; for
   *  performable surfaces data.script is the timed on-screen performance. */
  components?: Array<string | { type: string; data?: Record<string, unknown> }>;
  /** Cinematic stock-footage search phrase; when set, b-roll plays behind the scene */
  broll_query?: string;
  /** AI-generated still image prompt; when set, a generated image is the scene background (mutually exclusive with broll_query) */
  hero_image?: string;
  /** The scene's internal beat timeline (continuous-take scenes). */
  beats?: SceneBeat[];
}

export type AssetRequirementType =
  | "screen_recording" | "camera_video" | "photo" | "screenshot"
  | "product_shot" | "ai_image" | "illustration" | "stock_footage" | "mockup";

export type AssetRequirementStatus = "needed" | "provided" | "generating" | "generated" | "fallback";

export type AssetRequirementPriority = "critical" | "recommended" | "nice_to_have";

export interface AssetRequirement {
  /** What this asset is for */
  description: string;
  /** Asset type */
  type: AssetRequirementType;
  /** Current status */
  status: AssetRequirementStatus;
  /** How much this affects quality */
  priority: AssetRequirementPriority;
  /** What MCP does if this isn't provided */
  fallback: string;
  /** Path to the asset (when provided or generated) */
  path?: string;
  /** For AI-generated: the generation prompt */
  generation_prompt?: string;
  /** For recordings: instructions for the user */
  recording_instructions?: string;
}

// ── Project ──

export type ProjectStatus = "draft" | "storyboard" | "generated" | "rendering" | "rendered" | "failed";

export interface Project {
  project_id: string;
  tenant_id: string;
  name: string;
  format: OutputFormat;
  status: ProjectStatus;
  canvas: Canvas;
  brand_kit: BrandKit;
  scenes: Scene[];
  audio?: AudioConfig;
  assets?: Asset[];
  /** New continuous speaker track architecture  */
  speaker_track?: SpeakerTrack;
  /** Film-level color grade applied to the final concatenated video for
   *  cross-scene consistency (subtle S-curve + saturation + grain).
   *  "none" disables. The generate pipeline defaults videos to "cinematic". */
  film_grade?: "cinematic" | "none";
  /** Sentence spine of the narration (speaker-screencast grammar): what was
   *  said, when, grouped into chapters. Times are FILM seconds. Feeds
   *  captions/chapter cards at assembly and future clipping/social cuts. */
  spine?: {
    sentences: Array<{ text: string; start: number; end: number }>;
    chapters: Array<{ title: string; start: number; end: number; firstSentence: number; lastSentence: number }>;
  };
  /** Teleprompter script for the Studio narration booth (Mode B): cues timed
   *  to the film clock, drafted by the LLM from the cut's structure and
   *  editable by the user before recording. */
  booth_script?: {
    cues: Array<{ at: number; text: string }>;
    drafted_at: string;
    edited?: boolean;
  };
  /** The SPEAKER lane (symmetric-EDL plan of record, ROADMAP #8): the
   *  declarative truth for the film's voice. Ordered clips placed on the
   *  film clock, each with an optional source-map (same EDL primitive as
   *  media_edits) over the ORIGINAL recording -- audio-only or camera+voice,
   *  one structure. The narration audio track is a DERIVED rendering of
   *  this (re-baked whenever the EDL changes); never edit the bake, edit
   *  the EDL. The speaker is the film's master clock. */
  speaker?: {
    clips: Array<{
      /** Film-clock second this clip begins (inter-clip gaps = later `at`). */
      at: number;
      /** The original recording asset (audio webm/m4a, or camera+voice video). */
      source: string;
      /** Source-map applied to the audio (and any bubble rendering).
       *  Absent = the clip plays straight through. */
      edl?: {
        cuts: Array<{ src_start: number; src_end: number }>;
        segments: Array<{ src_start: number; src_end: number; rate: number }>;
        /** Inserted silences (timelapse beats): at SOURCE moment `src_at`,
         *  the derived narration holds `seconds` of silence -- the film owns
         *  that time with no voice, and the screen's timelapse plays there. */
        gaps?: Array<{ src_at: number; seconds: number }>;
      };
      /** Cache: derived audio rendering of source x edl + its cache key. */
      derived_audio?: string;
      derived_key?: string;
    }>;
  };

  // ── Lifecycle ──
  /** Creative bible from the concept director (structured, not prose) */
  treatment?: {
    concept: string;
    pattern: string;
    throughLine: string;
    emotionalArc: string;
    visualStyle: {
      colorMood: string;
      typographyAttitude: string;
      motionPersonality: string;
      spatialStrategy: string;
    };
    directorNote: string;
  };
  /** The original prompt that kicked off generation (the ask). */
  prompt?: string;
  /** The film's WORLD (SPEC-world.md): one continuous backdrop/theme
   *  contract authored at the creative-director stage and honored by every
   *  scene. Duck-typed here to avoid a core->llm import. */
  world?: {
    backdrop: { component: string; seed: number; palette: string[] };
    theme: "light" | "dark";
    chapter_slots: number;
  };
  /** The storyboard (script + scene breakdown + asset manifest) */
  storyboard?: Storyboard;
  created_at?: string;
  updated_at?: string;
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
  /** Time-fit: remap this clip (or its trimmed window) to EXACTLY the film's
   *  total duration. For a screen recording whose narration was de-silenced
   *  separately (so the raw recording runs longer than the voiceover), this
   *  plays the whole walkthrough start-to-finish under the narration instead
   *  of truncating the tail. The rate is computed at render time from the
   *  probed source duration -- no manual timecodes. Single-clip bases only. */
  fit?: boolean;
}

export interface SpeakerTrack {
  /** Ordered list of speaker video clips played end-to-end */
  clips: SpeakerTrackClip[];
}

// ── Design System (extracted from websites) ──

export interface DesignSystemColorRoles {
  primary_bg: string;
  surface: string;
  elevated: string;
  primary_action: string;
  primary_action_hover: string;
  secondary_action: string;
  destructive: string;
  success: string;
  warning: string;
  border: string;
  border_subtle: string;
  text_primary: string;
  text_secondary: string;
  text_muted: string;
  text_on_primary: string;
  link: string;
  link_hover: string;
}

export interface DesignSystemTypography {
  font_heading: string;
  font_body: string;
  font_mono: string;
  scale: {
    display: string;
    h1: string;
    h2: string;
    h3: string;
    h4: string;
    body_lg: string;
    body: string;
    body_sm: string;
    caption: string;
    overline: string;
  };
  line_heights: {
    tight: string;
    normal: string;
    relaxed: string;
  };
  letter_spacing: {
    tight: string;
    normal: string;
    wide: string;
  };
  heading_weight: string;
  body_weight: string;
}

export interface DesignSystemSpacing {
  base_unit: number;
  scale: Record<string, string>;
  section_gap: string;
  card_padding: string;
  container_max_width: string;
}

export interface DesignSystemRadius {
  none: string;
  sm: string;
  md: string;
  lg: string;
  full: string;
  button: string;
  card: string;
  input: string;
}

export interface DesignSystemShadows {
  sm: string;
  md: string;
  lg: string;
  button: string;
  card: string;
  focus_ring: string;
}

export interface DesignSystemMotion {
  duration_fast: string;
  duration_normal: string;
  duration_slow: string;
  easing_default: string;
  easing_enter: string;
  easing_exit: string;
  hover_transform: string;
  hover_shadow: boolean;
}

export interface DesignSystemPatterns {
  button_style: "filled" | "outline" | "ghost";
  button_shape: "rounded" | "pill" | "square";
  card_style: "flat" | "bordered" | "elevated" | "glass";
  card_border: boolean;
  input_style: "outline" | "filled" | "underline";
  divider_style: "solid" | "dashed" | "none";
  gradient_direction: string;
  gradient_style: string;
}

export interface DesignSystem {
  source_url: string;
  extracted_at: string;
  color_roles: DesignSystemColorRoles;
  typography: DesignSystemTypography;
  spacing: DesignSystemSpacing;
  radius: DesignSystemRadius;
  shadows: DesignSystemShadows;
  motion: DesignSystemMotion;
  patterns: DesignSystemPatterns;
  density: "compact" | "comfortable" | "spacious";
  screenshots?: {
    hero?: string;
  };
  guidelines?: string;
}

// ── Reference Images ──

export type ReferenceImageRole =
  | "ui_reference"       // Screenshot of a UI to replicate
  | "style_reference"    // Visual style/aesthetic to match
  | "brand_reference"    // Brand materials (not logos — those go in BrandKit)
  | "screenshot";        // Generic screenshot for context

export interface ReferenceImage {
  /** HTTPS URL or base64 data URI (data:image/png;base64,...) */
  url: string;
  /** How to use this image */
  role: ReferenceImageRole;
  /** Optional human label, e.g. "Claude chat interface" */
  label?: string;
  /** Local cached path (set after download, not user-provided) */
  _cachedPath?: string;
  /** Base64 data for Anthropic API (set after processing, not user-provided) */
  _base64Data?: string;
  /** MIME type (set after processing) */
  _mediaType?: string;
}
