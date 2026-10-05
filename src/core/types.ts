/**
 * Core types for the media producer.
 */

import type { TakeStudioCorrection, TakeStudioStats } from "./take-studio.js";

// ── Output Formats ──

export type OutputFormat = "video" | "image" | "slideshow" | "presentation" | "one-pager" | "gif" | "social" | "email-header" | "thumbnail";

// ── Canvas ──

/**
 * FRAME -- the fourth creative axis (SPEC-format-and-spine.md). A frame is
 * the geometry of the output surface and NOTHING else: the canvas, plus the
 * bands a platform draws its own UI over. It carries no duration and no
 * story shape; those belong to the film grammar. Platform names are a lookup
 * that resolves to a frame ("Instagram Reels" -> 9x16), never values here.
 */
export type Frame = "16x9" | "9x16" | "4x5" | "1x1";
export const FRAMES: Frame[] = ["16x9", "9x16", "4x5", "1x1"];

export interface FrameSpec {
  width: number;
  height: number;
  /** Fraction of the canvas height a platform covers with its own UI, from
   *  each edge. 0 means the media is shown whole (a feed post is not
   *  overlaid; a Reel is). Composition must keep content out of these bands. */
  safe: { top: number; bottom: number };
  /** The most common homes for this geometry -- for inference prose only. */
  homes: string;
}

export const FRAME_SPECS: Record<Frame, FrameSpec> = {
  "16x9": { width: 1920, height: 1080, safe: { top: 0, bottom: 0 }, homes: "embeds, landing pages, YouTube" },
  "9x16": { width: 1080, height: 1920, safe: { top: 0.12, bottom: 0.18 }, homes: "Reels, TikTok, Shorts, Stories" },
  "4x5":  { width: 1080, height: 1350, safe: { top: 0, bottom: 0 }, homes: "Instagram and LinkedIn feed" },
  "1x1":  { width: 1080, height: 1080, safe: { top: 0, bottom: 0 }, homes: "feed, ad units" },
};

/** The nearest named frame for arbitrary dimensions (images get odd sizes
 *  like 1200x630; the canvas still needs a frame so composition rules can
 *  reason about it). */
export function frameFromDims(width: number, height: number): Frame {
  const r = width / height;
  let best: Frame = "16x9";
  let bestD = Infinity;
  for (const f of FRAMES) {
    const spec = FRAME_SPECS[f];
    const d = Math.abs(Math.log(r) - Math.log(spec.width / spec.height));
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

/** Taller than wide: the vertical-composition laws apply. */
export function frameIsTall(frame: Frame): boolean {
  const s = FRAME_SPECS[frame];
  return s.height > s.width;
}

export interface Canvas {
  width: number;
  height: number;
  /** The FRAME axis. Derived from width/height when a caller gives explicit
   *  dimensions; set directly when a frame is pinned or inferred. */
  frame: Frame;
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
  /** slide-left | slide-right | slide-up | slide-down | fade | rise | pop |
   *  cut, and on an ENTRANCE, morph (needs `from`). */
  effect: string;
  /** morph only: the component this one is born from, by id (a type names
   *  its first instance) or "id.anchor" for a [data-anchor] part inside it.
   *  Same scene only; a missing source fades in instead (SPEC-metamorph.md). */
  from?: string;
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
  /** THE ARRIVAL (the naano landing page): the pose the object starts in,
   *  eased to the standing pose above over `duration` seconds from `at`
   *  (default: from the component's entrance, 1.2 s, power3.out). With
   *  `floor` (default on) a soft shadow under the object tightens as it
   *  settles, so the tilt reads as an object over a surface. Wrapper
   *  level: any component can arrive tilted. */
  from?: { rotate_x?: number; rotate_y?: number; scale?: number };
  duration?: number;
  at?: number;
  ease?: string;
  floor?: boolean;
}

export interface SceneComponent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  /** Word anchors by data path (core/word-anchors.ts): the numeric field in
   *  `data` holds the resolved time; this says which spoken word it follows. */
  anchors?: Record<string, { word: string; occurrence?: number; edge?: "start" | "end"; offset?: number }>;
  position?: ComponentPosition;
  z_index?: number;
  /** CSS zoom on the component's wrapper: the box stays where the layout
   *  put it (percent geometry resolves against the stage), the content
   *  inside renders that much larger. The phone scale for tall speaker
   *  frames, where desktop-sized type is unreadable. */
  zoom?: number;
  pose?: ComponentPose;
  enter?: ComponentAnimation;
  exit?: ComponentAnimation;
  /** A cutaway on a tall frame is FRAMED on one of its own [data-anchor]
   *  regions: the wrapper is scaled and shifted so that region fills the
   *  width (a desktop mock at full frame on a phone fills the top quarter
   *  and leaves the rest empty). The name of that region. */
  frame_anchor?: string;
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
  type: "zoom" | "pan" | "rotate" | "reset" | "slide";
  /** type=slide only: vertical shift of the whole scene as percent of the
   *  canvas height (positive = down), at `scale` (>= 1), with NO cover
   *  clamp -- the split's screen band covers what the shift exposes at
   *  the top. The rig slides the person under the screen (SPEC-creator-cut.md). */
  dy?: number;
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
  /** Sound cues: point sounds tied to moments in the scene, on the Effects
   *  lane beside the camera moves (core/scene-sfx.ts). */
  sfx?: import("./scene-sfx.js").SceneSoundCue[];
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
  /** The word clock the scene's anchors were last resolved against:
   *  asserted (script estimate) or measured (the take's transcript). */
  spine?: { source: "asserted" | "measured"; words: Array<{ text: string; start: number; end: number }>; duration: number };
  /** When set, all components are constrained to this region of the frame.
   *  Used with speaker track so content appears beside the speaker. */
  content_region?: ContentRegion;
  /** When true, the scene background is rendered transparently (used with full-behind overlays). */
  /** THE LOCKED CAMERA (SPEC-relay.md v2, the continuous take): no ambient
   *  Ken Burns drift and no ambient dot layer, so the scene's last frame is
   *  exactly the frame the next scene opens on -- a join the eye cannot find.
   *  camera_moves still play. Relay scenes get it from the build. */
  locked_camera?: boolean;
  transparent_background?: boolean;
  /** "settled": component timelines are pre-rolled so entrances are already
   *  resolved at frame 0 -- the hard cut lands on standing content with only
   *  ambient motion running (the editorial fast-cut grammar). Default
   *  ("animated") plays entrances normally, with micro-shot compression on
   *  sub-1.4s scenes. */
  entrance?: "settled" | "animated";
  /** The film's PHYSICS CONTRACT (visual_system.motion), stamped per scene the
   *  same way `entrance` is, because the assembler is where it can actually be
   *  enforced. "cutout-physics" quantizes element motion to 12fps and boils
   *  inked edges (shared/motion-physics.js); "calm" and "punchy" are checked
   *  by the motion inspector's banned-moves list. Absent = house behavior. */
  motion_physics?: "punchy" | "calm" | "cutout-physics";
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
  /** Play only this many seconds of the source (after trim_start): two
   *  clips of one song can repeat a bar (the develop. film's breakdown). */
  duration?: number;
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

/** THE MUSIC CHOICE (SPEC-briefs.md, the sources): the film's bed, chosen
 *  in the board. `auto` (or absent) lets the build pick by mood; `none`
 *  ships the film without a bed; the rest name a track the build keeps and
 *  cuts against. The bed itself lives in `audio.tracks` as `music_bed`. */
export interface MusicChoice {
  source: "auto" | "none" | "brand-kit" | "stock" | "jamendo" | "upload";
  /** The track's file (a local path under the data dir, or an /assets URL). */
  path?: string;
  id?: string;
  title?: string;
  artist?: string;
  license?: string;
  duration?: number;
  /** Where the file can be fetched (a Jamendo pick: the search result's own
   *  download link -- the lookup by id is intermittent). */
  download_url?: string;
  chosen_at: string;
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
  /** Who performs the person, how and where, for every scene that does not
   *  say otherwise (core/cast-plan.ts, SPEC-cast-scenes.md). */
  cast_plan?: CastPlan;
}

/** WHO performs a person-carried scene, HOW, with which ENGINE, and WHERE.
 *  The film's default on `storyboard.cast_plan`; a scene's own on
 *  `storyboard.scenes[i].performer` (each field absent: the film's). The plan
 *  only says what is wanted -- a change never makes anything by itself; the
 *  scene shows as stale until it is performed again. */
export interface CastPlan {
  /** A cast actor id; null = me (the recording's person). */
  actor?: string | null;
  how?: "record" | "recast" | "generate";
  /** recast: higgsfield (Genjutsu) | kling | heygen | runway.
   *  generate: seedance | heygen. Absent: the best for the actor. */
  engine?: string;
  /** generate with Seedance: a location id (core/locations.ts); null on a
   *  scene = no location, over the film's. */
  location?: string | null;
}

export interface StoryboardAudioDirection {
  music_mood: string;
  voice: string;
  pacing: "slow" | "moderate" | "fast";
}

/** A component on the BOARD, before any build: the type and its data; a
 *  position when the author placed it (the build honors it, else lays it
 *  out); the animation fields the assembler reads. The update tool's
 *  scene edit sets a scene's cast in this shape. */
export interface StoryboardComponent {
  type: string;
  data?: Record<string, unknown>;
  position?: ComponentPosition;
  z_index?: number;
  enter?: ComponentAnimation;
  exit?: ComponentAnimation;
  anchors?: SceneComponent["anchors"];
  pose?: ComponentPose;
}

/** A scene performed by a cast actor with no recording of it
 *  (core/scene-performance.ts): the actor's start frame drawn for the shot,
 *  the scene's line voiced, Seedance 2.5 performing it; the result is the
 *  scene's take. */
export interface ScenePerformance {
  actor: string;
  /** The shot: where the actor is and what they do ("walks toward the
   *  camera down a bright office hallway, medium-wide"). */
  shot: string;
  /** Where the voice comes from: the scene's line read in the actor's
   *  voice ("script"), or the scene's recorded take converted to it
   *  ("take": the delivery kept). */
  voice_source: "script" | "take";
  /** How the line is SAID when the voice reads the script: the line with
   *  delivery marks for ElevenLabs v4 -- tags in brackets ([excited],
   *  [whispers], [sighs], [laughs]), "..." and dashes for pauses, CAPITALS
   *  for emphasis, /IPA/ for a pronunciation. Kept apart from the script, so
   *  the marks never reach captions or any other voice. Absent: the line. */
  delivery?: string;
  /** The ROOM reference: an image of the set (a project asset -- usually
   *  the first scene's drawn frame) sent to Seedance with every take as the
   *  last reference image, so the room stops drifting from scene to scene
   *  (Marc, Oct 4: "the apartment and the couch is changing slightly"). */
  room_url?: string;
  /** The LOCATION the scene is set in (a tenant location id, core/locations.ts):
   *  the start frame is drawn in it and its clean plate goes to Seedance as
   *  the room reference (room_url, when set, overrides the plate). */
  location?: string;
  /** The prompts, written out in full when the defaults built from the shot
   *  are not what is wanted (Marc: "define any prompt for any scene"):
   *  `frame_prompt` what GPT Image draws, `video_prompt` what Seedance gets.
   *  Absent: the defaults. */
  frame_prompt?: string;
  video_prompt?: string;
  /** Start frames drawn for the shot, newest last; `frame` the one used. */
  frames?: Array<{ url: string; shot: string; prompt?: string; made_at: string;
    /** Not drawn: the last frame of this scene's take (0-based), so the
     *  scene picks up exactly where that one ended. */
    from_scene?: number;
    /** The location it was drawn in. */
    location?: string }>;
  frame?: string;
  /** The sound: "seedance" (default) keeps the model's own read -- the only
   *  track the lips were made to; "converted" lays the exact voice file over
   *  the video, which Marc measured "totally off from the lips" (Oct 4:
   *  Seedance re-performs the line, it does not keep the file's timing). */
  voice_track?: "converted" | "seedance";
  /** The pitch of the voice Seedance was given (median Hz), and of the
   *  recording it was converted from. Measured before Seedance is paid. */
  voice_hz?: number;
  recording_hz?: number;
  /** Set when the pitch check stopped the scene before Seedance: the voice
   *  was more than 10% off the actor's other scenes in this film (Marc,
   *  Oct 4: "check the pitch on the recording before you create the Dana
   *  scene"). Perform again with force to make it anyway. */
  pitch_check?: { hz: number; reference: number; recording_hz?: number };
  /** The voice file the scene was performed to (a project asset), and how
   *  far it was shifted to line up with the video (s). */
  voice_url?: string;
  voice_offset?: number;
  /** The video as Seedance made it, before the voice was laid over it. */
  seedance_url?: string;
  /** The voice last heard for the scene ("Hear the voice"): what Seedance
   *  will be given unless the line, delivery or actor change. */
  voice_preview?: { url: string; seconds: number; hz: number; actor: string; source: "script" | "take"; line?: string; delivery?: string; made_at: string };
  /** What the scene's current take was made with (the plan it answers). */
  made_with?: { actor: string; engine: string; location?: string };
  /** The 480p draft: Atlas's draft id finishes the same shot at 1080p. */
  draft?: { url: string; draft_id?: string; inputs: string; made_at: string };
  final?: { url: string; made_at: string };
  /** The job on this scene: drawing a frame, voicing, performing, attaching. */
  status?: "running" | "done" | "failed";
  stage?: string;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

/** A cast actor's b-roll over a scene (no speech, Seedance): made `seconds`
 *  long (4 s at least), on screen `show` s from `at`. */
export interface ActorClip { actor: string; shot: string; seconds: number; show?: number; location?: string; at: number; status: "running" | "done" | "failed"; url?: string; error?: string; started_at: string; finished_at?: string }

export interface StoryboardScene {
  /** Scene label */
  label: string;
  /** The cut into this scene, as the board wrote it ("none" = a hard cut). */
  transition_in?: SceneTransition;
  /** Who performs this scene's take (core/speaker-layer.ts syncSpeakerClips):
   *  a cast actor id plays that actor's recast of the take; null plays the
   *  recording itself; absent follows the film (project.speaker_cast). */
  cast?: string | null;
  /** This scene's plan, over the film's `storyboard.cast_plan`. */
  performer?: CastPlan;
  /** A cast actor performing the scene without a recording (Seedance). */
  performance?: ScenePerformance;
  /** The last cast-actor b-roll made for this scene (no speech, Seedance),
   *  laid over the scene as a video component. */
  actor_clip?: ActorClip;
  /** Every b-roll clip on the scene, by start time (a montage holds several). */
  actor_clips?: ActorClip[];
  /** The cast or needs were SET BY HAND (the update tool's storyboard edit):
   *  the build's recipe passes, creator-cut defaults, slates-over-mocks and
   *  b-roll fetch leave this scene as it is. */
  hand_set?: boolean;
  /** What this scene communicates */
  purpose: string;
  /** DEAD legacy slot (once an "O1"/"C1"/"D1" id). storyboardToSaved has
   *  always written "" here and nothing reads it. Use scene_template. */
  template: string;
  /** The whole-scene template (st-*) this scene was CAST as, with its slot
   *  data -- assigned by assignSceneTemplates or by the deterministic house
   *  passes in enforceFilmDirection.
   *
   *  This was missing for a long time, and its absence was invisible AND
   *  actively misleading: casting a template also empties `components`, so a
   *  templated scene serialized exactly like a scene that got nothing, and
   *  any attempt to count "how much of this film is templated" from a saved
   *  storyboard read every template as a codegen fallback. */
  scene_template?: { type: string; data: Record<string, unknown> };
  /** Stage-camera moves authored for this scene. Carried so an approved
   *  storyboard rebuilds with the camera the reviewer saw -- without it the
   *  moves existed only on the built scenes and a rebuild dropped them. */
  camera_moves?: CameraMove[];
  /** Sound cues the board plans (a ding on a notification, a thud on a
   *  stamp), carried onto the built scene (core/scene-sfx.ts). */
  sfx?: import("./scene-sfx.js").SceneSoundCue[];
  /** Voiceover script */
  voiceover_text?: string;
  /** Words the writer marked for emphasis in the line (creator-cut): the
   *  captions tint them. Lifted off voiceover_text at normalize time. */
  emphasis?: string[];
  /** Duration */
  duration_seconds: number;
  /** What this scene needs to look great: the take, and on a creator-cut
   *  board the proof each claim wants on screen (with its words). */
  assets: AssetRequirement[];
  /** Visual description for the storyboard */
  visual_notes: string;
  /** ONE line for the plan table: what fills the frame, in plain words
   *  ("the chat typing the ask on top, the speaker below"). Optional -- the
   *  plan falls back to the first sentence of visual_notes (core/film-plan.ts). */
  shot?: string;
  /** Library components the storyboard builder suggested embedding in this
   *  scene. Plain string = type only. Object = storyboard-authored data; for
   *  performable surfaces data.script is the timed on-screen performance. */
  components?: Array<string | StoryboardComponent>;
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
  // ── Proof on a claim (SPEC-creator-cut.md): the four things a proof adds
  // to a plain need. Written by the storyboard writer, read by the build.
  /** cutaway (default): takes the frame for the beat, hard cut in and out.
   *  card: floats over the person on a plate.
   *  split: on a tall frame the screen owns the top of the frame and the
   *  person stays under it (the talking-head-under-the-screen shape). */
  use?: "cutaway" | "card" | "split" | "clip";
  /** When it enters -- a word anchor ("@dashboard") or scene seconds. */
  at?: string | number;
  /** When it leaves -- a word anchor or scene seconds (omit = the claim's end). */
  until?: string | number;
  /** Where the eye should go on it, in words ("circle the Publish button"). */
  focus?: string;
}

// ── Project ──

export type ProjectStatus = "draft" | "storyboard" | "generated" | "rendering" | "rendered" | "failed";

export interface Project {
  project_id: string;
  tenant_id: string;
  name: string;
  format: OutputFormat;
  status: ProjectStatus;
  /** Archived films leave the library without leaving the disk. A tenant with
   *  251 films needs a way to put one down that is not `rm`: set to clear it
   *  off the shelf, cleared to bring it back, and only an explicit delete in
   *  the archive view actually removes anything. */
  archived_at?: string;
  /** Free-form tags for finding a film in the library ("analytics", "creator
   *  ad"): lowercased, trimmed, unique (core/library.ts normalizeTags). Not an
   *  edit to the film -- setting them never marks a render stale. */
  tags?: string[];
  canvas: Canvas;
  brand_kit: BrandKit;
  scenes: Scene[];
  audio?: AudioConfig;
  /** The music the human chose in the board (SPEC-briefs.md, the sources). */
  music?: MusicChoice;
  assets?: Asset[];
  /** New continuous speaker track architecture  */
  speaker_track?: SpeakerTrack;
  /** The film's sound palette: the one sound each JOB plays (attention,
   *  transition, tension, payoff, right, wrong, comedy -- core/scene-sfx.ts).
   *  Unset jobs use the house default. Two or three jobs per film, used the
   *  same way every time. */
  sfx_palette?: Partial<Record<"attention" | "transition" | "tension" | "payoff" | "right" | "wrong" | "comedy", string>>;
  /** Who performs the speaker track (a cast actor id, core/cast.ts): every
   *  clip plays that actor's recast of its take when one exists. Absent: the
   *  person who recorded it. */
  speaker_cast?: string;
  /** Every take delivered for this film (the /take page, or a hand attach).
   *  One take is ACTIVE per scene: the one speaker_track carries. A new take
   *  for the same scene replaces it there; the older record stays here. */
  takes?: Take[];
  /** Film-level color grade applied to the final concatenated video for
   *  cross-scene consistency (subtle S-curve + saturation + grain).
   *  "none" disables. The generate pipeline defaults videos to "cinematic". */
  film_grade?: "cinematic" | "none";
  /** Sentence spine of the narration (speaker and screencast grammars): what was
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
  /** The ORIGINAL brief (SPEC-briefs.md): set on the first storyboard and
   *  never overwritten by a redraft, whose prompt is brief + locks + feedback. */
  brief?: string;
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
  /** The storyboard scene this clip is the base for (0-based). Clips are
   *  played in scene order; a clip without it is the whole film's base. */
  scene_index?: number;
  /** Start offset into the source video in seconds (skip dead air) */
  start?: number;
  /** Trim: only use video from this timestamp */
  trim_start?: number;
  /** Trim: stop using video at this timestamp */
  trim_end?: number;
  /** The person on a transparent frame (<name>-alpha.webm, core/take-matte.ts):
   *  a scene whose speaker component is set to alpha plays this copy inside
   *  the scene instead of the opaque camera base. */
  alpha?: string;
  /** Time-fit: remap this clip (or its trimmed window) to EXACTLY the film's
   *  total duration. For a screen recording whose narration was de-silenced
   *  separately (so the raw recording runs longer than the voiceover), this
   *  plays the whole walkthrough start-to-finish under the narration instead
   *  of truncating the tail. The rate is computed at render time from the
   *  probed source duration -- no manual timecodes. Single-clip bases only. */
  fit?: boolean;
}

/** The person's extent per row (fractions of the frame width), top to bottom. */
export interface SilhouetteProfile { rows: Array<[number, number] | null> }

/** A delivered take: what was recorded, for which scene, and what the ingest
 *  sanitizer did to it (see core/take-sanitize.ts). */
export interface Take {
  id: string;
  /** 0-based storyboard scene index the take fulfils. */
  scene_index: number;
  source: string;
  recorded_at: string;
  duration?: number;
  mime?: string;
  width?: number;
  height?: number;
  /** How the booth captured it: 'canvas' (portrait pixels drawn by the page)
   *  or 'raw' (the camera track as the browser recorded it); 'attach' for a
   *  file attached by hand through the tools. */
  capture?: string;
  /** Window into the source when one recording covers several scenes
   *  ("Record all"): this scene's slice, in source seconds. */
  trim_start?: number;
  trim_end?: number;
  rotation_baked?: number;
  reframed?: { from: string; to: string };
  /** The grade on the file ("soft": warmth, denoise and skin smoothing --
   *  core/take-grade.ts). Applied in the background after the take lands. */
  look?: "natural" | "soft";
  /** The soft look's skin smoothing, 0-1 (0: the mild base alone). */
  soft_strength?: number;
  /** The ungraded original, kept beside the take so a re-grade starts clean. */
  ungraded?: string;
  /** The kept original already carries the soft base (a take graded before
   *  the dial, whose true original was gone): natural returns to that. */
  ungraded_soft?: boolean;
  /** When the current grade landed (Studio reloads the take on a change). */
  graded_at?: string;
  /** false: the studio correction is off for this take (absent = on;
   *  core/take-studio.ts). Every grade honours it. */
  correct?: boolean;
  /** The fill light on the face's shadows, 0-1 (absent = the default 0.5;
   *  0 = off; core/take-studio.ts faceFillGraph). */
  fill?: number;
  /** What the last grade applied (0 when there was no detected face). */
  fill_applied?: number;
  /** How far out of focus the blurred copy puts the room, 0 (light) - 1
   *  (deep); absent = 0.6 (core/take-matte.ts). */
  blur_strength?: number;
  /** The last background job on this take that failed, until the next run
   *  of that kind succeeds (core/take-jobs.ts). */
  job_error?: { kind: "grade" | "matte"; message: string; at: string };
  /** The studio correction, for transparency: what was measured off the
   *  kept original (`measured`, reused by every re-grade) and what was
   *  applied -- white-balance gains, the warm-key pull, stops of exposure,
   *  the shadow curve, one note per decision and the ffmpeg filter.
   *  `off`: measured, not applied (the take's `correct` is false). */
  grade?: Partial<TakeStudioCorrection> & { measured?: TakeStudioStats; off?: boolean };
  /** Older shape (before the copies below): `source` was swapped to the
   *  blurred copy and the raw take kept here. Read through takeCopies. */
  background?: { mode: "blur"; source_raw: string; strength?: number; ms?: number };
  /** The room blurred behind the person (<name>-blur.mp4), written by the
   *  matte (core/take-matte.ts) when a scene asks for it. `source` stays
   *  the raw take. */
  blur?: string;
  /** The person on a transparent frame (<name>-alpha.webm), written by the
   *  matte when a scene's speaker component is set to alpha. */
  alpha?: string;
  /** RECAST (core/recast.ts): the take performed by a cast actor -- the
   *  same timeline redrawn by Wan from the actor's portrait, the voice
   *  converted when the actor has one. Keyed by actor id. `source` stays
   *  the raw take; the project's speaker_cast picks which one plays. */
  actors?: Record<string, { file: string; performer?: string; voice_id?: string; heygen_look_id?: string; motion?: string; framing?: number; sheet?: string; made_at: string }>;
  /** The take IS a cast actor's performance (core/scene-performance.ts):
   *  made by a vendor from the scene's line, no recording behind it. A
   *  recast never redraws it. */
  performed_by?: { actor: string; engine: "seedance" | "heygen"; quality: "draft" | "final" };
  /** Where the face is, measured at ingest (fractions of the frame; the
   *  layout builds its bands around it). Absent when none was found. */
  face?: { cx: number; cy: number; size: number; confidence: number };
  /** Where the PERSON is, row by row, measured from the cut-out while the
   *  matte runs (core/take-matte.ts): 36 rows top to bottom, each the
   *  person's [left, right] edge as fractions of the width (null: nobody on
   *  that row). speaker-3d tucks a side word's first letter behind it. */
  silhouette?: SilhouetteProfile;
  loudness?: { measured_lufs: number; normalized_to_lufs?: number };
  /** The scene's spoken lines as they stood when this take attached, so a
   *  later script edit can be flagged against the recording. */
  lines?: string;
  /** A still from the take (at its trim), served for the speaker lane. */
  poster?: string;
  /** Trimmed or cut by hand (core/take-edits.ts): the scene's clip window
   *  follows the take's (trim_start/trim_end mapped through the cuts). */
  edited?: boolean;
  /** Spans cut out of the take, in ORIGINAL-recording seconds (the speaker
   *  lane's EDL cut shape). The scene plays the window minus these. */
  cuts?: Array<{ src_start: number; src_end: number }>;
  /** Cache: each of the take's files with the cuts taken out, by the
   *  original file: the copy, the cut list it was made for, and the
   *  original's mtime:size when it was made. */
  cut_files?: Record<string, { file: string; cuts: string; stamp: string }>;
}

export interface SpeakerTrack {
  /** Ordered list of speaker video clips played end-to-end */
  clips: SpeakerTrackClip[];
  /** The voice's level in the film, 0-1 (default 1: the take as
   *  normalised, -16 LUFS). Honored by the render's mix and by Studio. */
  volume?: number;
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
