/**
 * Unified Storyboard builder
 *
 * Builds a storyboard with one codegen pipeline. For each scene, the storyboard builder
 * writes visual notes (what the viewer experiences) and lists which library
 * components to embed. The codegen LLM receives the visual notes + component schemas
 * and builds the scene HTML.
 */

import { callLLM, callLLMAgentic, type LLMConfig, type LLMContentPart, type LLMMessage, type LLMTool } from "./client.js";
import { formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
import { worldPromptBlock } from "./world.js";
import type { Treatment } from "./creative-director.js";
import { SCENE_STORYBOARD_DESIGN_RULES } from "./design-rules.js";
import { COMPOSITION_PLAYBOOK, PACING_PLAYBOOK } from "./cinematography.js";
import { getStorytellingGuide } from "./design-skills.js";
import type { BrandKit, Canvas, OutputFormat, ReferenceImage, SceneBeat } from "../core/types.js";
import { normalizeBeats, beatsVoiceover } from "../core/beats.js";
import {
  buildReferenceImageParts,
  buildReferenceImageSummary,
} from "./reference-images.js";

function isLightBrand(brandKit: BrandKit): boolean {
  var bg = brandKit.colors?.background || "#0f172a";
  var hex = bg.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

// ── Tool Definitions ──
//
// Incremental storyboard authoring: NEVER ask for the whole film's JSON in one
// response (the failure class that truncated a beats-heavy storyboard mid-scene
// even at 16384 tokens). Each add_scene call only needs to hold ONE scene, so
// no single turn's size scales with the number of scenes or beats in the film.

const BEAT_TOOL_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "Short name for the beat, e.g. 'the approach'" },
    duration_seconds: { type: "number", description: "Beat length in seconds (omit if using duration_bars)" },
    duration_bars: { type: "number", description: "Beat length in music bars (only when a music grid is in effect)" },
    action: { type: "string", description: "What HAPPENS during this beat -- motion verbs, what transforms" },
    voiceover_text: { type: "string", description: "Narration for this beat (optional)" },
  },
  required: ["action"],
};

const SCENE_TOOL_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    duration_seconds: { type: "number" },
    purpose: { type: "string", description: "What this scene communicates -- its job in the story" },
    visual_notes: { type: "string", description: "The WORLD: setting, layers, what persists (5+ sentences, motion verbs, BG/MG/FG)" },
    components: {
      type: "array",
      items: {
        anyOf: [
          { type: "string" },
          {
            type: "object",
            properties: {
              type: { type: "string", description: "Library component type from the catalog" },
              data: { type: "object", description: "The component's data payload. For a 🎬 Scriptable (performable) component this MUST include script: [{action, at, ...params}] -- the timed interaction sequence that makes the surface PERFORM the scene's beats (type-message at 0.5, tool-call at 2.1, respond at 6.0...). Use the component's documented script actions; land actions near beat boundaries." },
            },
            required: ["type"],
          },
        ],
      },
      description: "Library components from the catalog. A plain string stages the component and lets codegen fill its data. A 🎬 Scriptable (performable) component MUST instead be an object {type, data} whose data.script holds the full timed interaction sequence -- a performable surface staged without a script arrives frozen at its end state and reads as a screenshot, not a story (blocking static_surface defect).",
    },
    scene_template: { type: "object", description: "Whole-scene template instantiation: {type: 'st-...', data: {slots}} -- prefer over components/codegen when a scene-template fits", properties: { type: { type: "string" }, data: { type: "object" } } },
    elements: {
      type: "array",
      description: "TACTICAL element inventory: every concrete on-screen element with its EXACT copy. The codegen renders these verbatim -- an element you don't inventory gets invented (badly) or dropped.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short handle, e.g. 'support-tickets-card' -- beats reference elements by name" },
          kind: { type: "string", description: "headline | subhead | card | badge | diagram-node | caption | cta | metric | ui-window | decoration" },
          content: { type: "string", description: "The EXACT on-screen text/data, fully written out (e.g. 'Support Tickets / Avg response: 2.4h / CSAT: 91% / 312 Open'). Never 'placeholder' or 'some stats'." },
          motion: { type: "string", description: "How/when it enters, transforms, exits (motion verbs + rough timing)" },
        },
        required: ["name", "kind", "content"],
      },
    },
    beats: { type: "array", items: BEAT_TOOL_SCHEMA, description: "The scene's internal beat timeline, ONLY for scenes with 2 or fewer beats. Scenes with 3+ beats MUST omit this and add each beat with its own add_beat call instead -- see add_beat." },
    transition_in: {
      type: "object",
      properties: { type: { type: "string" }, duration_seconds: { type: "number" } },
      description: "How this scene transitions in from the previous one",
    },
    voiceover_text: { type: "string", description: "Scene narration (concatenation of beat narration when the scene has beats)" },
    transparent_background: { type: "boolean", description: "SPEAKER FILMS ONLY. false = this scene is a TAKEOVER: it covers the camera and the product surface owns the whole frame. Omit (or true) = the speaker stays visible and content docks beside her." },
    broll_query: { type: "string", description: "Cinematic stock-footage search phrase (mutually exclusive with hero_image/gen_video)" },
    hero_image: { type: "string", description: "AI-generated still image prompt (mutually exclusive with broll_query/gen_video)" },
    gen_video: { type: "string", description: "AI-generated video clip prompt -- ONLY for moving shots stock footage cannot plausibly contain (mutually exclusive with broll_query/hero_image)" },
    camera_moves: {
      type: "array",
      description: "Stage-camera moves on this scene (the ONE camera). ONLY anchored moves are allowed here: {at, type:'zoom', anchor:'componentId.anchorName', scale?, duration?} or {at, type:'reset', duration?}. Anchors come from performable components' CAMERA ANCHORS (e.g. slack-workspace publishes composer, messages, thread-panel -- 'tpl_artifact.composer'). Zoom in while the surface performs, reset before the next thought. Max 4 per scene.",
      items: {
        type: "object",
        properties: {
          at: { type: "number" },
          type: { type: "string", description: "zoom | reset" },
          anchor: { type: "string", description: "componentId.anchorName (omit for reset)" },
          scale: { type: "number", description: "1.3-2.6; omit to auto-fit the anchor" },
          duration: { type: "number" },
        },
        required: ["at", "type"],
      },
    },
  },
  required: ["label", "duration_seconds", "purpose", "visual_notes"],
};

const TOOLS: LLMTool[] = [
  {
    name: "add_scene",
    description: "Start ONE new scene, in order. Call this once per scene -- never batch multiple scenes into one call. For a scene with 3+ beats, omit \"beats\" here and add each one afterward with add_beat -- that keeps this call small regardless of how beat-heavy the scene is.",
    input_schema: SCENE_TOOL_SCHEMA,
  },
  {
    name: "add_beat",
    description: "Add ONE beat to the scene most recently started with add_scene. Call this once per beat, in order, right after add_scene (or after the previous add_beat) -- never batch several beats into one call and never put more than 2 beats inline in add_scene's \"beats\" array.",
    input_schema: BEAT_TOOL_SCHEMA,
  },
  {
    name: "finish_storyboard",
    description: "Call this once every scene (and all of its beats) has been added. Supplies the overall film title.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "The project/film title" } },
      required: ["name"],
    },
  },
];

// ── Types ──

export interface StoryboardBuilderOpts {
  prompt: string;
  /** The user's ORIGINAL prompt, before treatment/context enrichment.
   *  Used for fallback naming only -- `prompt` may start with injected
   *  scaffolding ("## Creative Direction ..."), and slicing THAT into the
   *  project name ships prompt internals to the user. */
  rawPrompt?: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  componentCatalog: ComponentCatalogEntry[];
  sceneCount?: number;
  creativity?: number; // 0-1, default 0.5
  tenantId: string;
  hasSpeakerTrack?: boolean;
  referenceImages?: ReferenceImage[];
  treatment?: Treatment;
  /** Beat grid of the pre-selected background music (music-first timeline).
   *  When set, scene durations should be authored in whole bars. */
  beatGrid?: { bpm: number; barSec: number };
  /** L4 film grammar the treatment committed to. Activates the matching
   *  contract section below as MANDATORY rather than conditional prose. */
  filmGrammar?: import("./creative-director.js").FilmGrammar;
  /** The film's world (SPEC-world.md): given, continuous, enforced. */
  world?: import("./world.js").WorldSpec;
}

export interface StoryboardComponent {
  // Library component
  type?: string;  // e.g. "stat-card", "gradient-background"
  data?: Record<string, unknown>;
  position?: { x: number | string; y: number | string; width?: number | string; height?: number | string };
  z_index?: number;
  // Custom component
  custom?: boolean;  // true = generate custom HTML
  custom_prompt?: string;  // visual description for custom generation
  // Template scene
  template?: string;  // template ID, e.g. "O1-big-statement"
  template_data?: Record<string, unknown>;  // content for template slots
}

export interface DraftScene {
  /** Film-time start (s), stamped post-quantization -- the continuous world
   *  backdrop renders at film_start + local t so drift survives cuts. */
  film_start?: number;
  label: string;
  duration_seconds: number;
  purpose: string;         // what this scene communicates -- its job in the story
  visual_notes: string;    // visual direction (what the viewer experiences, motion verbs, depth layers)
  /** Library components to embed. Plain string = type only (codegen fills the
   *  data). Object = storyboard-authored data; for performable (🎬 Scriptable)
   *  surfaces data.script carries the timed interaction sequence the surface
   *  plays on screen. */
  components: Array<string | { type: string; data?: Record<string, unknown> }>;
  /** Whole-scene composition template (st-*): when set, the scene is
   *  INSTANTIATED from the template with this slot data -- no codegen. The
   *  professional-composition path; prefer it whenever a template fits. */
  scene_template?: { type: string; data: Record<string, unknown> };
  /** Anchored stage-camera moves authored by the storyboard (sanitized:
   *  anchored zooms + resets only). Carried onto the final Scene. */
  camera_moves?: import("../core/types.js").CameraMove[];
  /** Tactical element inventory: concrete on-screen elements with exact copy.
   *  The codegen renders these verbatim; beats reference them by name. */
  elements?: Array<{ name: string; kind: string; content: string; motion?: string }>;
  transition_in?: { type: string; duration_seconds: number };
  hero_image?: string;
  voiceover_text?: string;  // Narration script for this scene (TTS)
  broll_query?: string;     // when set, fetch cinematic stock footage as this scene's background
  gen_video?: string;       // when set, DIFFUSION-generate this scene's background clip (Veo) -- shots stock can't contain
  /** The scene's internal beat timeline: one persistent world, several thoughts.
   *  Normalized (bars -> seconds, rescaled to fill the scene) after parsing. */
  beats?: SceneBeat[];
}

export interface StoryboardResult {
  name: string;
  scenes: DraftScene[];
}

/**
 * Build a storyboard with per-component library/custom decisions.
 */
export async function buildStoryboard(opts: StoryboardBuilderOpts): Promise<StoryboardResult> {
  var catalogStr = formatCatalogForPrompt(opts.componentCatalog);

  var sceneCountGuide = opts.sceneCount
    ? `Exactly ${opts.sceneCount} scenes.`
    : (opts.format === "video"
      ? "3-4 scenes for films up to 45s -- this is a HARD budget, not a suggestion (5 only for 60s+). EXCEPTION: a TEMPO-CUT film (see TEMPO-CUT FILMS below) inverts this budget -- 6-9 short scenes -- and a HYPE-CUT film (see HYPE-CUT FILMS) inverts it further -- 10-16 scenes alternating one-bar interstitials with 2-6-bar product beats; those contracts win over this line. Otherwise: a scene is a WORLD and you only cut when the world changes (see CUT vs BEAT). The shape of a 30-45s film: an opening world, one or two long living middles (12-24s each, 4-6 beats), a closing CTA world. Before you output, AUDIT your scene list: if two consecutive scenes share the same setting/canvas/metaphor, they are ONE world -- merge them into one scene and turn each of their moments into a beat. Emitting a new scene for every idea is the #1 storyboard failure."
      : "5-8 scenes (scale to content complexity).");

  var storytellingGuide = getStorytellingGuide();

  var systemPrompt = `You are a creative director storyboarding a ${opts.format} project.

You think in visual STORIES, not slide decks. Every scene should feel like something the viewer wants to watch, not endure.

${storytellingGuide ? `## Visual Storytelling Guide\n\n${storytellingGuide}\n\n` : ""}## SCENE TEMPLATES (whole-scene compositions -- your FIRST choice)
Scene templates (types starting "st-") are designer-built full-scene compositions with professional lighting, choreography and beat-phased motion baked in. When a scene's content fits one, emit "scene_template": {"type": "st-...", "data": {...slots from its schema...}} INSTEAD of hand-specifying components -- the scene is instantiated directly and is guaranteed to look professional. Fill every slot with REAL final copy. Give the film a DARK-FORWARD cinematic rhythm: dark template scenes are the default world (they automatically carry a real-3D WebGL backdrop -- lit translucent ribbons drifting behind the type, the launch-film look) -- use "theme": "dark" on st-hero-stat / st-kinetic-list for most scenes; st-quote and st-logo-close are dark already. Reserve LIGHT scenes as the contrast beat (one per film, or where the content is inherently light, e.g. a light-UI screencast). PROBLEM BEATS -- when a beat's job is to show THE MESS the product answers ("this is what your week actually looks like"), that is st-chaos-collage: a headline standing still while notifications, half-read stats, voice memos and unanswered messages swarm around it. Fill "cards" with real fragments from the audience's actual week, never lorem, and set "resolve" to the answer line whenever the scene sets up the product rather than standing alone -- chaos that is never answered is just anxiety. ONE per film, EARLY, before the product appears; a second one reads as a tic. A film whose story has no problem to show simply does not cast it. ARTIFACT BEATS -- the strongest way to show a product STEP is a mock of the surface where it happens, always seen BUILDING: st-artifact stages a performable component (chat-simulator: a generic scripted chat; ui-terminal-agent: a prompt types and status lines stream; ui-video-player: a player whose scrub bar advances over a generated deliverable) beside serif editorial type and counting stats. When the story happens in a REAL product surface the library already mocks, stage THAT component as the artifact instead of a generic one: slack-workspace (full Slack simulator -- channels, threads, reactions, typing) for anything happening in Slack, quotient-chat (THE Quotient agent panel from real screenshots: tab row with a spinning-✳ running tab, color-coded verb lines ('Reviewed [in] LinkedIn post', 'Created ✉ Weekly Newsletter'), content-card STREAMING boxes where the doc/post/email content types itself under a top fade, task-status lines, References popover, user bubbles + composer -- also THE fidelity right panel for quotient-app-shell: shell show_panel:false + quotient-chat at x 67.6%, y 8%, 30.5%x87%) for conversations with Quotient, quotient-social (the Quotient social post editor -- platform-aware X/LinkedIn post card with the green published / gray draft bar, campaign-tag pill, and the black Schedule button whose Publish Now dropdown drives the publish-post money beat: open-schedule-menu then publish-post flips the bar green) for 'the post ships' beats, quotient-app-shell (the FULL Quotient app chrome: icon rail + breadcrumb header + right AGENT PANEL with Reviewed/Updated tool cards and its own composer; the CENTER IS AN EMPTY WELL -- the shell is a rounded floating window, place it INSET (x 1.2%, y 2%, 97.6%x96%) never full-bleed, and pair it with a second scene component at x 4.7%, y 8%, width 61.5%, height 89% (quotient-social or quotient-campaign today; email/doc screens later) so the agent panel narrates while the center surface performs) for 'working inside Quotient with the agent beside you' beats, quotient-campaign (the campaign screen: Brief rich-text doc, Tasks table with checkboxes/priority/owners, Activation week-calendar whose deliverable cards DRAG between days (move-event), Deliverables status table -- switch-tab tours the views, complete-task ticks the counter, set-deliverable-status flips a row to the green-rocket Published; drops into quotient-app-shell's content region) for campaign-management beats, claude-code-session (Claude Code in the TERMINAL: prompt types + sends, working spinner with live token counter, tool-call blocks with diffs, streaming response -- actions: type-prompt, send-prompt, working, tool-call, respond, todo) for terminal coding beats, claude-desktop (the Claude DESKTOP app's Code tab: light theme, Recents sidebar, claude.ai-style conversation with tool cards -- switch-session / session-status for parallel-session beats) for desktop coding beats, claude-cowork-home (the Claude desktop Home/Cowork screen: serif greeting, big composer with Chat/Cowork toggle, Ideas for you -- type-prompt/send-prompt/switch-mode/open-plus-menu/choose-idea) when the beat is 'ask Claude to do work for you', claude-cowork-session (a RUNNING Cowork task: serif prose streams while the right rail performs -- tool-call pops REAL Quotient MCP calls into the transcript ({connector:'Quotient', tool:'create-campaign', result:'Campaign created'} -- spinner flips to a green check while the rail chip lights), set-progress ticks '1 of 3'->'3 of 3', add-output pops deliverables in) when the beat is 'the agent is doing the work'. These are SCRIPTED simulators: put the full interaction sequence in their data.script ([{action, at, text, ...}] -- type-message, send-message, bot-message, thread-reply, add-reaction, agent-message, tool-use...) so the surface PERFORMS the story itself, with enough messages/steps to fill its window -- a two-line thread in a big empty panel is an empty_skeleton defect. This applies EVERYWHERE a performable surface is staged, not just inside st-artifact: when you list one in a scene's "components" array, emit it as an OBJECT {"type": "...", "data": {..., "script": [{action, at, ...}]}} -- author the data and the timed script yourself, right there in the storyboard. A performable mock staged as a bare type string (or with static end-state data: progress already complete, tool calls already green) arrives FROZEN -- a screenshot where the viewer was promised a performance (blocking static_surface defect). Write the script the way the old hand-built films did: the ask types and sends, the working spinner appears, tool-calls fire and flip green one by one, progress ticks up, outputs pop in, the response streams -- each action timed near a beat boundary. While a surface performs, you may drive the ONE stage camera with the scene's camera_moves: anchored zooms only ({at, type:'zoom', anchor:'tpl_artifact.composer'}) with a reset before the next thought -- zoom in while the typing happens, out when it sends. Prefer an artifact beat over an abstract card whenever the narration describes someone DOING something in a product. Screen-recording scenes get st-screencast (footage URL in "source", caption chips from the beats). In a dark-forward film set its "presentation": "float" -- the footage becomes a tilted 3D plane with orbit drift and reflection over the WebGL world -- and add "callouts" ({at, dur, x, y, w, h} in % of the frame) where the narration points at a specific part of the UI: the region lifts out zoomed in a brand-gradient glow shell. Keep the browser presentation for light films or when the recording's own UI is the whole story. Fall back to components/codegen only when no template fits.
When the user prompt SUGGESTS components ("use title-slide, timeline-steps or similar", "kinetic-text", "a stat card"), a scene template that delivers the same content COUNTS as "similar" and is still your first choice -- the user is describing the content they want on screen, not forbidding better compositions. Only skip templates when the prompt EXPLICITLY forbids them or demands a specific component by exact behavior a template cannot deliver.

You build the storyboard by calling the add_scene tool ONCE PER SCENE (in order), then finish_storyboard when every scene is added. BATCH YOUR TURNS: every round-trip costs the viewer real wall-clock time, so bank SEVERAL scenes per response -- 2-4 add_scene calls per turn is the target (a light scene with few beats can share a turn with more; a heavy scene with a long performable script may deserve its own). Budget discipline: keep each response comfortably under the output limit -- if a turn is discarded for overrunning it, re-send that work in smaller pieces (one scene per turn) exactly as the recovery message instructs. A scene with more than 3 beats: send add_scene with the first beats, then add_beat calls in the same or later responses. Never describe the storyboard in prose -- use the tools. Each scene has visual notes (the visual direction) and a list of component types from the catalog. Below is the SHAPE of one add_scene call's parameters:

{
  "label": "Scene 1 - Connector Discovery",
  "duration_seconds": 16,
  "purpose": "User discovers and activates the connector feature",
  "visual_notes": "A clean workspace fills the frame — warm off-white background with subtle grid lines pulsing faintly. One persistent world: the workspace never resets; the card, cursor, and grid carry through every beat below, morphing and re-arranging as the idea advances. BG: subtle grid with breathing glow. MG: UI card with menu items. FG: cursor with drop shadow, particle hints.",
  "beats": [
    { "label": "the approach", "duration_seconds": 4, "action": "A cursor GLIDES from below toward a plus icon at center; the grid brightens along its path.", "voiceover_text": "It starts with one click." },
    { "label": "the bloom", "duration_seconds": 5, "action": "On click, a circular button BLOOMS outward with a soft shadow, then MORPHS into a rounded card panel. Menu items STAGGER in from the right — thin icon, label, chevron.", "voiceover_text": "A menu of every connector you need." },
    { "label": "the choice", "duration_seconds": 7, "action": "The cursor DRIFTS to Connectors, which highlights with a warm rounded fill; the card TILTS forward slightly and the other rows dim, pulling all focus to the selection.", "voiceover_text": "Pick one. The rest is automatic." }
  ],
  "components": [],
  "voiceover_text": "It starts with one click. A menu of every connector you need. Pick one. The rest is automatic.",
  "transition_in": { "type": "none", "duration_seconds": 0 }
}

And the SHAPE of a scene carried by a scene template (STEP 0 hit -- note "components" stays empty and the slots hold real final copy):

{
  "label": "Scene 2 - Four Deliverables From One Brief",
  "duration_seconds": 12,
  "purpose": "Land the scale of what one conversation produces",
  "visual_notes": "st-hero-stat carries the scene: the numeral counts up while the four deliverable tags walk the lower third.",
  "scene_template": {
    "type": "st-hero-stat",
    "data": {
      "kicker": "ONE CONVERSATION",
      "headline": "Four deliverables,|zero re-briefing",
      "supporting": "Invitations, reminders, agenda and follow-up flow from the same brief.",
      "stat_value": 4,
      "stat_label": "DELIVERABLES FROM ONE BRIEF",
      "items": ["Invitation", "Reminder sequence", "Agenda one-sheet", "Follow-up"]
    }
  },
  "components": [],
  "voiceover_text": "Personalized invitations, a reminder sequence, an agenda one sheet, and a post event follow-up.",
  "transition_in": { "type": "match-cut", "duration_seconds": 0.6 }
}

### CUT vs BEAT (the editorial rule that makes this a FILM, not a slide deck)
A CUT (new scene) is earned ONLY when the WORLD changes: a different location/metaphor, the arc's emotional pivot, or the intro/outro bookends. Everything else is a BEAT: the idea advances INSIDE a persistent world -- elements morph, move, re-light, and re-arrange, but the world survives. A video that cuts on every new thought reads as a slideshow; a film holds its world and lets the thoughts move through it.

Beat authoring rules:
- Any scene longer than ~8s MUST have "beats": aim for 4-6 (minimum 3), each 2-6s${opts.beatGrid ? ` (author "duration_bars" instead of "duration_seconds": 1-2 bars each; one bar = ${opts.beatGrid.barSec.toFixed(2)}s)` : ""}. Short bookend scenes (intro/outro/breathing, <=8s) need no beats. If a scene only has 2 beats, ask whether it is really a separate world or two beats belonging to a neighboring scene.
- Beat durations must sum to the scene's duration_seconds.
- Each beat's "action" describes a VISIBLE change with motion verbs -- something enters, transforms, or re-arranges. A beat where nothing visibly changes is a storyboard failure.
- Each beat may carry its own short "voiceover_text" (~2.5 words/second of beat); the scene's voiceover_text is their concatenation.
- The scene's visual_notes describe the WORLD (setting, layers, what persists); the beats describe what HAPPENS in it, in order.

### KINETIC CONTINUITY (every grammar -- what separates a film from a stack of slides)
A cut is not a gap. Author every scene boundary so the film reads as one continuous motion:
- CAUSED, NOT SCHEDULED: the outgoing scene CAUSES the cut. Something on screen does it -- a cursor clicks the thing that becomes the next scene, a word falls off the bottom of frame, a stamp lands, a line travels off the edge, a card is flicked away. Say the cause in the visual_notes ("...'quality' drops off the BOTTOM of frame, and scene 5's line enters from the bottom").
- MATCHED MOMENTUM: the outgoing scene exits while still MOVING and the incoming scene enters ALREADY IN FLIGHT, at the same speed and in the same direction. Never let a scene come to a full stop, hold empty, and then have the next thing fade up -- that dead beat is the slideshow tell.
- CONTINUITY OF DIRECTION: if something left frame-right, the next beat arrives from frame-left (it kept travelling). If something rose out of the top, the next thing comes up from the bottom. State the direction on both sides of the boundary.
- ONE THING CARRIES OVER: prefer a shared element across the boundary -- the same line, prop, cursor, surface or word persists and re-frames rather than being replaced. (A scene that shares NOTHING with its neighbour needs a reason.)

${opts.filmGrammar ? `### THIS FILM'S GRAMMAR: ${opts.filmGrammar.toUpperCase()} (committed by the treatment -- its contract section below is MANDATORY, not advisory)

` : ""}### TEMPO-CUT FILMS (${opts.filmGrammar === "tempo-cut" ? "ACTIVE for this film" : opts.filmGrammar === "hype-cut" ? "INHERITED by this hype-cut film -- every law here applies unless HYPE-CUT FILMS overrides it" : 'when the director\'s treatment names "tempo-cut"'})
When the treatment commits to TEMPO-CUT, the editorial contract above FLIPS from few-long-worlds to many-short-worlds. Obey this contract exactly:
- THE EDIT: 6-9 scenes in 30-45s, each 1-5 bars long (2-4 bars for performing surfaces; spend 1-bar or half-bar MICRO-BEATS -- a single word, a stamp, one click -- deliberately for punch, 1-3 per film)${opts.beatGrid ? ` (one bar = ${opts.beatGrid.barSec.toFixed(2)}s -- quantize every scene duration to whole bars)` : " (quantize to the music's bar length)"}; every transition_in is {"type":"none"} -- hard cuts land on downbeats. No crossfades, no wipes.
- ONE THOUGHT PER CUT: each scene carries exactly one idea. If a scene needs a second annotation line swap, that is fine; if it needs a second WORLD, cut.
- TEXT IS THE VOICEOVER: no narrator. Every narration line lives in an annotation or kinetic-text DOCKED BESIDE the evidence -- never a statement slide mid-film (title open and CTA close are the only pure-type scenes). Long lines use kinetic-text entrance:"type-on" with word_interval on the beat subdivision.
- DETAIL CUTS over full windows: when the beat is "the ask", stage the composer component (an isolated input box huge on canvas, typing + send) instead of a whole app window; keep it at the SAME frame position across ask beats so repeats read as match cuts. Crop to the one element that matters; a full app shell is earned only when the story is the whole surface.
- SCALE INVERSION: captions at display scale (the annotation component's default), windows <=60% of frame width, real negative space around both.
- MUSIC FIRST: the film assumes a driving bed; scripted-surface actions (tool-calls, tab switches, sends) should land near beat boundaries, not between them.
- THE HAND: on a run of 2-4 consecutive UI scenes you may thread cursor-performer (a cursor that travels and CLICKS the thing causing the next cut -- exhibits become a story someone is doing). HANDOFF CONTRACT: each scene's first path point must equal the previous scene's last point, so the hand reads continuous through the hard cuts. One hand per film; it always travels toward something meaningful. THE CAST is the single exception: on ONE takeover or social-proof beat you may pass "cast" ([{name, color?, path}], 2-4 members) instead of "path", and the surface fills with NAMED cursors -- a different claim, "a team is already in here" rather than "someone is doing this". A cast is never threaded across scenes the way the hand is, and every member needs somewhere real to be going (drifting name tags with nothing to do read as decoration).
- CONTINUITY OF STATE: consecutive scenes staging the SAME product surface are one continuous session, never fresh screenshots -- each later scene RESUMES the earlier state (carry the transcript into data.history, use start_scrolled, keep composer contents/progress chips/connector state where the surface supports them). A surface that resets between cuts is why a tempo-cut reads as "a bunch of separate scenes instead of one continuous video" -- the grammar's founding complaint.
- SURFACES PERFORM: every product mock in this grammar is a performable simulator and MUST be staged mid-performance -- emit it as a components-array OBJECT with data.script ([{action, at, ...}]) covering the scene's beats (the ask TYPES, tool-calls FIRE and flip green, the post PUBLISHES). A mock with no script, or with finished end-state data, is a frozen screenshot and a blocking static_surface defect; in tempo-cut the cut earns its place by something HAPPENING on it.
- ONE GAG maximum: a single prop-strike card ("we killed ___") beside a setup line, if the story earns a joke.
- THE PAYOFF BEAT is deterministic: when the story lands on a number (leads, revenue, time saved), stage it as a stat-card or number-counter-row OBJECT with the real figures -- the layout engine gives a hero number center stage. Never hand-roll a results dashboard for the payoff; a freeform payoff is where misaligned frames sneak in.
- THE CLOSE is a template: the final CTA scene is the st-logo-close scene template (it inherits the film's theme and frames the wordmark + CTA correctly) -- never a freeform CTA composition. A hand-built close is how the one thing the film asks the viewer to do ends up cut off by the canvas edge.
- OBJECTS, NOT STRINGS: every entry in a tempo-cut scene's components[] must be an OBJECT with type + data (+ script where performable). A single plain-string hint drops the ENTIRE scene to freeform codegen -- the exact path this grammar forbids.
- BUILD FROM THE KIT: every tempo-cut scene is composed from library components or an st-template -- composer (the ask), kinetic-text entrance:"type-on" (build-up lines), annotation (narration beside a window), the product mocks (quotient-*, claude-*), prop-strike (the gag). Do NOT invent custom scenes in this grammar: hand-rolled surfaces are how corner labels, theme whiplash and clipped type sneak back in. NO montage/scene-name labels anywhere; the film keeps ONE canvas color end to end (a single deliberate dark beat is the only exception). Generic simulators (chat-simulator, ui-terminal-agent) are a LAST resort: if the beat happens in Quotient, Claude, Slack, LinkedIn or X, staging the SPECIFIC product mock is mandatory -- a no-name chat standing in for a named product is a blocking defect (generic_surface).

### HYPE-CUT FILMS (${opts.filmGrammar === "hype-cut" ? "ACTIVE for this film" : 'when the director\'s treatment names "hype-cut"'})
Tempo-cut's edit driving editorial's alternation: the words HYPE, the product PROVES. INHERITS EVERY TEMPO-CUT LAW ABOVE not restated here (music-first bar quantization, hard cuts on downbeats, text-is-voiceover, SURFACES PERFORM, CONTINUITY OF STATE, OBJECTS NOT STRINGS, BUILD FROM THE KIT, st-logo-close close). Then:
- THE ALTERNATION AT PACE: kinetic type interstitials alternate with product beats. An interstitial is an st-statement scene (ONE thought, one *starred* emphasis, ~1 bar / 1-1.5s -- read once, cut); a product beat is a named product mock performing (2-6 bars). Statement slides are not merely allowed mid-film here -- they ARE the connective tissue (this overrides tempo-cut's no-statement-slides law). Never two interstitials in a row except the opening premise pair.
- PREMISE FIRST: the cold open is 1-2 type beats that set the story's stakes before any product pixel ("A customer just emailed you." / "And it's *glowing*."). The film earns the product by promising the story.
- ONE CONTINUOUS STORY-WORLD: tempo-cut's CONTINUITY OF STATE law is the SPINE here, not a nicety -- all product beats on the same surface are one persistent session the viewer watches move forward, cut for rhythm. Later beats resume mid-task with carried history; the session scrolls like a real one.
- TWO-ACT ESCALATION: after the first payoff beat, the user asks for MORE in-product (a typed follow-up: "Great -- now create the post, add an image, and schedule it."), and act two lands the bigger payoff. ONE escalation, not a feature list.
- THE CLICK CUT: the cut into the payoff surface is diegetic -- the cursor travels to the link/button inside the current surface and CLICKS it, and the next scene IS the destination (script a click action targeting the link, then hard-cut). Never an unmotivated cut into a new app.
- TEMPERATURE: interstitials own the film's home canvas (st-statement cream by default); at most ONE dark flip, at the act turn.
- CASTING: interstitials are st-statement ONLY (editorial's component, played at hype pace). Product beats stage the SPECIFIC named mock mid-performance with real product chrome (real connector logos on tool chips); a generic simulator standing in for a named product is a blocking generic_surface defect, same as tempo-cut.

### EDITORIAL FILMS (${opts.filmGrammar === "editorial" ? "ACTIVE for this film" : 'when the director\'s treatment names "editorial"'})
The typography-first manifesto dialect: the story is told IN TYPE, punctuated by evidence. Obey this contract exactly:
- THE ALTERNATION: statement beat -> evidence beat -> statement beat -> evidence beat. A statement beat is an st-statement scene (huge display-serif thought, ONE word starred for the gradient-italic emphasis: "The registry is the *product*."). An evidence beat is ONE full-bleed exhibit that proves the statement just made: a product mock performing, a chart drawing, a map routing, a device showcase, a code animation. Never two statements in a row unless the second is the film's closing line.
- THE TEMPLATE VOCABULARY IS CLOSED: statement beats are st-statement ONLY. st-manifesto (kinetic sans slam), st-swarm, st-quote, st-photo-close and the other cinematic templates belong to launch-film -- casting ANY of them in an editorial film is a grammar violation, even for the open or the close. The film opens on an st-statement, closes on an st-statement (or st-logo-close when a CTA is required), and every scene between is either st-statement or a performing evidence exhibit. When in doubt: if a scene's job is words, it is st-statement.
- THE EDIT: 6-10 scenes in 20-40s. Statement beats are SHORT (2-3.5s -- read once, cut); evidence beats breathe (3-6s). Hard cuts between statement and evidence; spend 1-2 shader transitions (shader-flash-white, shader-gravitational-lens, shader-light-leak) at chapter turns only.
- TEMPERATURE IS RHYTHM: the film's home canvas is the st-statement cream (light films) or near-black (dark films). Flip temperature (cream <-> dark) at MOST twice, at chapter turns, via st-statement theme:"dark" -- a deliberate chapter flip, never a random drift. Evidence beats inherit the world.
- ROLLING SEQUENCES: a statement beat may carry 2-3 rolling thoughts (st-statement data.lines) when the thoughts are one build ("100+ blocks." / "One command." / "Yours."). Each rolls up and out as the next rolls in.
- ONE EMPHASIS PER STATEMENT: exactly one *starred* word or phrase per statement -- the word the film would italicize out loud. Zero stars reads flat; two reads shouty.
- EVIDENCE PERFORMS: an evidence beat's surface must be mid-performance (data.script on mocks, animated draw on charts/maps) -- a static screenshot between two beautiful statements is a broken promise.
- KICKERS AS CHAPTERS: number the chapters with st-statement kicker ("01 - THE PROBLEM"). 2-3 chapters max.
- NO VOICEOVER: the type is the voice. voiceover_text stays empty on statement beats.

### SOCIAL-REEL FILMS (${opts.filmGrammar === "social-reel" ? "ACTIVE for this film" : 'when the director\'s treatment names "social-reel"'})
The vertical feed dialect: 9:16, built to stop a thumb. Obey this contract exactly:
- THE SHAPE: 15-28s of SCENE TIME (transitions ride on top; the shipped file must stay under 30s), 5-8 scenes. Scene 1 is the HOOK (<=2s): one bold claim or question in giant type that earns the next second -- no logos, no setup, no "welcome". Then 3-5 ESCALATION beats that each pay the hook off a little more, ONE payoff beat (the money shot: the product doing the thing, a number landing), and a CLOSE that composes into the hook frame so the loop replays cleanly (same canvas color, type landing where the hook's type began).
- VERTICAL COMPOSITION: every scene composes for a phone held in one hand. Content lives in the MIDDLE BAND: keep the top ~12% and bottom ~18% of the canvas clear (platform UI covers them). A landscape-composed scene letterboxed into 9:16 is a blocking defect.
- THE LAYOUT VOCABULARY IS CLOSED -- every scene is ONE of these three patterns:
  * TYPE CARD: text only. Giant type centered in the middle band (the hook, declarations, the close). No surface.
  * STACK: caption on top, ONE surface below. Caption at y 16-30%, the surface at y 34-74% filling the full canvas width. Text above, evidence below -- never beside.
  * HERO: ONE surface owns the middle band (y 14-74%, full width), with a short caption OVER its lower third on a scrim chip (y 64-72%). For the money beats where the product is the star.
  SIDE-BY-SIDE IS BANNED: two components must never share a horizontal band -- there is no width for it. If a beat wants two things, it is two scenes.
- LANDSCAPE SURFACES GET CROPPED, NOT SHRUNK: a desktop UI scaled to fit 1080px wide is an illegible sliver (measured on the maiden flight: blog editor and campaign calendar unreadable). Stage the CROP: give the component width 160-240% with a negative x so the region the beat is about fills the frame, or drive an anchored camera zoom into it. Prefer portrait-native surfaces (chat panels, phone screens, social cards) over desktop UIs wherever the story allows.
- CAPTIONS ARE THE VOICEOVER: no narrator. Type at display scale (7-12vw) carries the story -- kinetic-text with entrance:"type-on" for build-ups, st-statement for declarations. Max ~8 words on screen at once; the viewer is reading at feed speed with the sound possibly off. Music still drives the cut rhythm for the sound-on viewer.
- THE EDIT: hard cuts on downbeats, 1.5-4s per scene. One shader transition maximum, spent on the payoff beat. One brand accent color; the film keeps ONE canvas world end to end.
- OBJECTS, NOT STRINGS: every scene's components[] entries are OBJECTS with type + data (+ script where performable) -- same rule as tempo-cut, same reason.
- EVIDENCE AT PHONE SCALE: product mocks (quotient-*, claude-*, device-showcase, cards) are staged LARGE -- one surface filling the middle band, never two side by side. A device-showcase phone in a 9:16 film is a phone-in-phone: prefer the app surface itself, full-bleed. WHOLE DESKTOP WORKSPACES ARE BANNED as surfaces (quotient-app-shell, liquid-glass-desktop, full browser windows): a desktop shell at 1080px wide is sidebar/breadcrumb soup nobody can read (measured live: proj_56358b25 scene 4 -- full-width but illegible). Stage the specific PANEL the beat is about (quotient-chat, composer, the campaign board) and if even that reads desktop-dense, crop it (width 160-240%, negative x) so ONE region is phone-legible.
- NO VOICEOVER: voiceover_text stays empty; the captions are the script.

### DATA-STORY FILMS (${opts.filmGrammar === "data-story" ? "ACTIVE for this film" : 'when the director\'s treatment names "data-story"'})
The numbers-as-protagonist dialect: every beat stages a figure, and the figures argue the case. Obey this contract exactly:
- THE SHAPE: 5-8 scenes in 25-45s. Each scene is CLAIM -> PROOF: a short line of type states the claim (2-8 words), then ONE data component proves it at hero scale. The claim may live in the same scene as a leading beat (type lands, then the chart draws) or as its own 2-3s setup scene before a bigger proof.
- ONE NUMBER PER BEAT: each data beat has exactly ONE protagonist figure -- staged HUGE (the hero number fills >=20% of the frame height; a footnote-sized counter in a corner is a defect, measured live: proj_a7b3ffbd scene 1's "47" was a badge). Two competing numbers in one scene is two scenes; a supporting table of line items beside the hero number IS competing numbers. A wall of metrics mid-film is a blocking defect; metric-dashboard is earned ONLY as the finale recap. The protagonist figure always lands IN a data component (stat-card, counter, chart) -- app shells and calendars may set context behind it, but they never carry the number.
- NUMBERS BUILD, NEVER APPEAR: every counter counts up live (number-counter-row, stat-card), every bar chart RACES its bars in, every line chart DRAWS its climb, every progress bar FILLS. A pre-drawn chart or a number that is simply present is a static_surface defect -- the motion of the figure arriving IS the story.
- ESCALATION ORDER: sequence the beats so the figures build toward the biggest -- the money number lands LAST and LARGEST as the payoff beat. Do not spend the best figure early.
- REAL FIGURES ONLY: every number comes from the brief. NEVER invent a statistic -- and DECOMPOSING a real total into invented parts is inventing (measured live: proj_a7b3ffbd split the brief's $1.2M into six fictional customers with fabricated deal sizes, and drew a quarterly lead total as five made-up weekly bars). If the brief gives a total, stage the TOTAL. If the brief has no figure for a beat, that beat stages the MECHANISM instead (a progress-bar filling, a flowchart routing, a before/after) -- an invented "+347%" is worse than no number.
- HONEST AXES: bar/line scales start at zero unless the delta IS the story (say so in visual_notes); axis labels and units legible at canvas scale; the same metric keeps the same color across scenes. CHARTS WEAR THE BRAND: series colors come from the brand palette (primary + accent + neutrals) -- a rainbow of per-bar colors is a defect (measured live: proj_a7b3ffbd's navy/teal/pink/orange bars).
- THE DATA KIT: number-counter-row (counting rows), stat-card (one hero figure + label), bar-chart, line-chart, progress-bar, metric-dashboard (finale only), flowchart (mechanism beats). Charts carry data.values with the REAL figures; visual_notes name the draw choreography (which bar lands first, where the line pauses before the spike).
- HERO TYPE IS DATA, NOT HOPE: number-counter-row sizes its figures from its data -- set "hero": true on any protagonist-number beat (one stat fills ~26vh; a 2-3 stat row shares the height), or set an explicit "font_size" ("24vh"). The 72px default is a supporting row, NOT a money number -- a hero beat that omits the flag ships a badge-sized protagonist.
- THE EDIT: claims are SHORT (2-3s); proofs breathe (3-6s -- long enough for the count/draw to land and hold). Hard cuts; music is a restrained driving bed and counters/draws should land near downbeats.
- TEXT IS THE VOICEOVER: no narrator. The claim lines are kinetic-text/annotation at display scale; voiceover_text stays empty.
- OBJECTS, NOT STRINGS: every entry in components[] is an OBJECT with type + data -- same rule as tempo-cut, same reason. The CLOSE is st-logo-close.

### CANVAS-TOUR FILMS (${opts.filmGrammar === "canvas-tour" ? "ACTIVE for this film" : 'when the director\'s treatment names "canvas-tour"'})
The continuous-surface dialect: ONE unbroken shot across a single surface, no cut the viewer can name. Obey this contract exactly:
- THE SHAPE: 5-9 scenes in 20-40s. Every scene is a PLACE on the same surface -- the same sheet of paper, desk, wall or board runs under all of them and NEVER resets (same world backdrop, same tone, same texture, scene to scene). The film's total motion is one journey across it: begin at one end, arrive at the other.
- THE CAMERA IS THE EDIT: there are no hard cuts. Each boundary is a camera TRAVEL -- glide, push in, pull back, a slight tilt in transit -- from the beat that just finished to the next place. Write the move in the visual_notes ("the camera keeps panning right past the arrow sticker and arrives on the ledger sheet"). The KINETIC CONTINUITY rules above are not optional here; they are the grammar.
- OPEN MACRO, THEN REVEAL: the first beat is usually a MACRO detail -- a pen mid-stroke, a single inked word, the paper's fibers -- that pulls back over 2-4s to reveal the surface it lives on. The last beat is the only true stop: the camera settles and holds.
- TYPE IS PERFORMED, NEVER SLAMMED: display text arrives by being MADE. pen-script (short handwritten lines, 1-6 words, written by an unseen pen), typewriter style:"print" (typewriter slab typing itself on the surface), typewriter style:"cli" (a command line typing an instruction), para-edit (a full paragraph that edits ITSELF -- fluff receding into the page while the keepers stay). st-manifesto/st-statement slams belong to other grammars; a word that simply appears is a defect here.
- ONE ELEMENT CARRIES THE FILM: pick a single physical device (a drawn line, a prop, a sheet, a cursor) that persists across every place and stitches them together. Name it in scene 1 and keep it in frame.
- QUIET, NOT EMPTY: 55-75% of each frame is bare surface. One idea per place, at generous size. Music is a low bed; the type carries the story.
- NO VOICEOVER: voiceover_text stays empty -- the performed type IS the voice.
- OBJECTS, NOT STRINGS: every components[] entry is an OBJECT with type + data. The surface component (paper-ground or the world backdrop) is the first entry of every scene.

### SPEAKER-SCREENCAST FILMS (${opts.filmGrammar === "speaker-screencast" ? "ACTIVE for this film" : "when a speaker recording drives the film"})
The human on camera owns the film; everything else supports them. The contract:
- THE VOICE IS THE CLOCK: the speaker's sentences decide when scenes cut and when content enters. Author scene/beat durations against what is being SAID, never against an abstract rhythm -- a cut mid-sentence is a failure.
- THE HUMAN NARRATES: no text-as-voiceover, no statement slides, no annotation lines that duplicate what the speaker is saying out loud. On-screen text is limited to labels/callouts that ADD to the speech (a metric, a name, a step number).
- LAYOUT: use the two speaker scene modes (speaker-visible content region vs takeover-with-PiP -- mechanics below). Content overlays enter with the house line-rise ON the sentence that introduces them, and leave when the speaker moves on.
- EVIDENCE: screencasts/product mocks appear when the speaker refers to them, framed in the content region; camera zooms follow what the speaker is pointing AT (anchored zoom, reset before the next thought).
- THE TAKEOVER RECIPE (a cutaway that REPLACES her, not a panel beside her). When the film cuts away to a product surface, the scene MUST be built this way -- measured live on proj_4b4c366c, where every one of these was wrong and needed hand repair:
  * OPAQUE AND FULL-FRAME: set transparent_background:false and position the surface at x:0%, y:0%, width:100%, height:100% (a 35%-wide panel over a transparent scene is NOT a takeover -- the camera shows straight through it and the cutaway does nothing).
  * HOLD LONG ENOUGH TO READ: >=2.5s. A product screen flashed for a beat reads as a glitch, not as proof. The speaker's SENTENCE sets the span -- a takeover covers a whole thought, never a fragment.
  * FRAME THE PERFORMING REGION: a full app shell at full frame is small text surrounded by acres of empty white. Give the scene a camera_moves zoom anchored on the region that is actually changing (e.g. 'quotient-campaign.board'), or stage the specific panel instead of the whole shell. The viewer must be able to READ the thing the speaker just claimed.
  * HARD CUT IN: transition_in {"type":"none"}. A shader/flash transition blends the presenter back in for a few frames mid-cut and reads as a stutter.
  * NEVER cover her with a codegen backdrop: the speaker scenes on either side stay transparent_background:true with NO full-bleed background component -- the camera IS their background.
- HIDING A MULTI-TAKE SEAM: when the speaker recording was assembled from several generated takes, the brief carries the seam timestamps. A takeover must START ~0.2s BEFORE the seam it hides and run past it -- a cutaway that begins ON the seam exposes the jump it exists to cover.
- MUSIC: absent, or a bed ducked far under the voice. The voice is always the loudest thing.

### Writing Great Visual Notes
Visual notes MUST be 5+ sentences with specific motion verbs, depth layers (BG/MG/FG), and choreography.
NOT "show the feature" — describe what HAPPENS frame by frame.
Think like a storyboard director. Describe what the viewer EXPERIENCES, not the layout.
Use motion verbs (SLAMS, DRIFTS, MORPHS, SNAPS, ASSEMBLES). Include BG/MG/FG layers.
Describe choreography and timing relationships between elements.

### TACTICAL over abstract: the element inventory ("elements")
The notes set the mood; the "elements" array is the SET LIST the builder actually works from.
For every scene, inventory each concrete on-screen element with its EXACT copy -- real
product-plausible text and numbers, fully written out. "A cluster of notification cards"
is abstract and gets half-invented; this is tactical:
  { "name": "slack-toast", "kind": "ui-window", "content": "Slack — #campaigns / Priya: can we move the launch email to Thursday?? / 12 new messages", "motion": "pops in top-right at 0.8s, jitters" }
Rules: every card/window/badge the notes mention MUST appear in elements with its full
content. Beat actions should reference elements by name. A scene whose elements all have
real copy cannot ship an empty skeleton; a scene without an inventory usually does.

### Picking Components -- TEMPLATE FIRST, THEN THE CATALOG
**STEP 0 for EVERY scene, before you think about components:** check the
"scene-template" section of the catalog. If an st-* template can carry the scene's
content, emit "scene_template" (with every slot filled with real final copy) and
"components": [] -- and STOP; do not also list components. A template scene is
instantiated directly: professional by construction, zero codegen, zero critique
time. Scenes that hold real screen-recording/video footage are the main case a
template cannot carry.
Only when no template fits: list library component types from the catalog that the
scene should embed. The codegen LLM will receive the component schemas and use
<component> tags. **Default to a library component whenever one matches the scene's
intent.** A vetted block is more consistent and higher-quality than hand-rolled
custom code, so reach for it FIRST. Only leave "components": [] (with no
scene_template) when the catalog genuinely cannot express the moment -- not because
custom feels more flexible.

Match scene INTENT to a component category (the catalog has blocks for all of these):
- Metrics / numbers / results -> stat-card, number-counter-row, metric-dashboard, bar-chart, line-chart, progress-bar. A HERO stat gains physicality from floating-pills (data chips drifting around it in faux-3D).
- A hero / title / brand reveal -> hero-reveal, kinetic-text, particle-text, animated-gradient-text, title-slide. Typographic scale plays: ghost-type (oversized watermark word BEHIND the content, low z) and headline-carousel ('Meet your [Engineer/Designer/...]' -- one slot cycling as an outlined pill).
- A spoken/caption line you want to emphasize -> a captions/* style (caption-karaoke, caption-kinetic-slam, caption-neon-glow, ...). MOTIF DISCIPLINE: pick exactly ONE caption style for the ENTIRE video and reuse it for every caption beat. Mixing caption styles across scenes reads as template soup; one treatment repeated with discipline reads as design (this is how professional launch films work -- one motif, repeated).
- Code, terminal, or a dev demo -> code/* (code-typing, code-diff, terminal-run, ...) or code-editor / terminal. 'The AI is thinking/planning/working' -> reasoning-stream (monospace rails landing line by line -- dramatizes intelligence without a UI).
- Social proof, posts, follows, engagement, GOING VIRAL, follower/subscriber growth -> social/* are platform UI cards and are the RIGHT tool for these moments (x-post-card, instagram-follow, tiktok-follow, youtube-lower-third, reddit-post-card, spotify-now-playing, linkedin-post-card), plus testimonial-card, social-proof. NOTE: a "followers climbing" / "going viral" beat wants the actual social-platform card (e.g. instagram-follow or youtube-lower-third) -- do NOT reduce it to a plain stat-card; the platform UI IS the point.
- Location, coverage, routes, "where" -> maps/* (route-map, pin-drop, world-map, bubble-map, ...)
- Product UI / app flows -> the mockups/* (slack-workspace, dashboard-kpi, chat-simulator, ...) and layouts/* (browser-frame, device-mockup, ...)
- CTA / closing -> cta-card, pricing-card
- Celebration / success / delight punctuation -> lottie-accent (curated professional micro-animations: confetti, party-popper, check-mark, rocket, trophy, sparkles, chart-up, ...). ALWAYS author it as an object with data -- {"type": "lottie-accent", "data": {"asset": "confetti", "at": 2.5, "hold": 3}} -- never a plain string. It is seasoning ON another beat's content (a corner overlay), never the subject; at most one per scene, on 1-2 KEY beats in the film.
- Film-look finishing -> the renderer already applies a film-level color grade (S-curve + saturation + fine grain) to the WHOLE video, so scenes do not need their own grain/grade. On 1-2 KEY scenes only, you may still add ONE subtle effects/* overlay (vignette, light-leak, shimmer-sweep) for emphasis. Do NOT add a film-FX overlay to every scene -- it gets heavy. Most scenes need none.

For scenes with existing UI elements (chat panels, dashboards, code editors), ALWAYS list the matching library component types.

${opts.world ? worldPromptBlock(opts.world) + "\n\n" : ""}### Background Strategy -- decide this FIRST, per scene, by INTENT
Before writing any background, decide which of FIVE strategies the moment wants. Do this BEFORE reaching for b-roll -- b-roll is ONE option, not the default for every atmospheric beat:
1. **B-roll video (broll_query)** -- real-world energy, atmosphere, a place, a human moment that should feel ALIVE and MOVING. Opener "set the world", emotional/aspirational/lifestyle beats WITH motion. Must visibly move (see B-Roll below).
2. **Generated image (hero_image)** -- a calm, composed, contemplative, or singular striking visual; a beat that should feel STILL and intentional. A photograph never reads as "broken" the way a frozen video does, so this -- NOT a slowed/static video -- is the correct tool for quiet/still/atmospheric moments. Use hero_image when you want the cinematic b-roll *feeling* (real, emotional, beautiful) but the scene should HOLD STILL.
3. **Generated video (gen_video)** -- a MOVING shot that stock search cannot plausibly contain: a specific staged scenario, a branded/surreal moment, an impossible camera path ("a wall of glowing sticky notes collapsing into a single clean card, slow push-in"). Write it as a cinematography direction: subject, action, camera move, light. It is the EXPENSIVE tool -- 0-1 per film, only when neither stock nor a still can deliver the shot. If a generic search phrase would find the shot on a stock site, use broll_query instead. MANDATORY WHEN BRIEFED: if the brief itself describes an impossible/branded shot and asks for it ("generate this shot", "no stock library has this"), that beat MUST carry gen_video -- substituting motion graphics for an explicitly requested generated shot is a dropped_element defect (measured live: proj_cd8a6fb6 ignored a generate-this-shot brief and shipped its centerpiece beat as an empty gradient).
4. **Motion graphics / mesh (animated background, the default)** -- product, UI, data, abstract, branded scenes. HTML/CSS/GSAP gradients, glow orbs, particles.
5. **Plain gradient** -- when nothing else is earned.
**DECISION GATE:** Is this beat moving or still? MOVING/kinetic/alive -> b-roll (or gen_video ONLY if stock can't contain the shot). STILL/calm/contemplative/composed -> hero_image. If you catch yourself wanting a "slow", "still", "perfectly calm", "stationary camera", "resting", or "barely moving" video, STOP -- that is a hero_image, not a broll_query. A meditative/dawn/quiet/serene opener is almost always a hero_image, NOT slow b-roll.

### B-Roll (atmospheric stock footage) -- when the beat MOVES
Once the gate above says this beat is MOVING, add a "broll_query": a SPECIFIC, cinematic stock-footage search phrase that matches the scene's mood and the brand. The clip plays as a darkened background BEHIND your content (it does not replace the foreground).
- A brand film, a product launch's emotional opener/closer, or any prompt about a feeling, place, or aspiration that should feel ALIVE wants b-roll on at least one scene. Do NOT default to a plain gradient on those moving moments -- reach for real footage.
- MOTION IS MANDATORY: b-roll is a VIDEO clip, so the clip must have clear, continuous on-screen movement -- drifting clouds, flowing or crashing water, a moving/drone/tracking camera, traffic or people in motion, rippling light, blowing grass. NEVER request a static, stationary-camera, locked-off, freeze-frame, or photo-like shot as a broll_query -- a frozen-looking video reads as a broken render. (If the beat should be still, you skipped the gate -- use hero_image.)
- Good queries are concrete, shot-like, AND describe the movement: "drone flying forward over a rugged coastline, waves crashing below, overcast", "fast timelapse of clouds rolling over mountains at dawn", "first-person driving an open mountain road at sunrise, trees rushing past", "close-up of hands typing on a laptop, fingers moving, shallow depth of field", "macro of flowing deep-blue ink swirling". Prefer normal-speed or sweeping motion; use "slow motion" only when the subject still clearly moves.
- Budget: 1-3 scenes across the video (it should still feel special, not every scene).
- Do NOT use broll_query on data/metrics, UI/feature, logo, or CTA scenes -- those need a clean generated background. Omit the field entirely on those.

### Continuous / Multi-Step Scenes (walkthroughs, demos)
There is no separate "sequence" type. A continuous multi-step moment — a
walkthrough, demo flow, step-by-step, or "single take" where elements persist and
transform — is just a normal scene with a LONGER duration (e.g. 12-30s) and a
visual notes that describe the progression as one continuous motion. Write the notes as
an ordered flow (e.g. "chat panel SLIDES left as the editor DRIFTS in from the
right, then both resolve into the published post"), list the library components
involved, and the codegen LLM will choreograph it on one master timeline with
labeled steps (elements morph/move rather than disappear). Set transition_in to
"none" for these so the take stays unbroken.

## Available Components

${catalogStr}

## How You Submit The Storyboard

Call add_scene ONCE for each scene, in order, with parameters matching the Scene Format
shown earlier. After the LAST scene has been added, call finish_storyboard with the film's
overall title as "name". Never batch the whole storyboard into one call and never describe
scenes in prose -- each scene is its own add_scene call, so no single response ever has to
hold the entire storyboard.

**Beat-heavy scenes: use add_beat, not an inline "beats" array.** add_scene's own "beats"
field is only for 1-2 beats. Any scene with 3 or more beats should call add_scene WITHOUT
"beats" (or with just the first one or two), then call add_beat once per remaining beat, in
order. Each add_beat call targets whichever scene was most recently started by add_scene, so
no single tool call ever has to hold a whole beat timeline -- this keeps every call small
regardless of how many beats a scene has. Batching a few add_beat calls into one response is
fine (each beat is small); just never fold a full beat list back into add_scene's inline
"beats" array, and don't put an add_scene AND all of its beats AND the next scene into a
single response -- a response's combined output across all its calls is what risks running
long.

Four example scenes (each add_scene / add_beat is its own call):

\`\`\`
add_scene({
  "label": "Scene 1 - Hero", "duration_seconds": 5,
  "purpose": "Dramatic hero reveal with product visualization",
  "visual_notes": "A dramatic hero reveal — the hero-reveal component renders the 'QUOTIENT' headline + subtitle with its SplitText per-character SLAM (chars stagger, back.out ease). Around it, custom code adds ambient glow orbs in the accent color drifting slowly and floating particles for depth. BG: gradient with glow orbs (custom). MG/FG: hero-reveal handles the headline + subtitle.",
  "components": ["hero-reveal"],
  "voiceover_text": "Introducing Quotient. The future of demand generation.",
  "broll_query": "abstract flowing deep-blue and violet ink in slow motion, macro, dark background",
  "transition_in": { "type": "none", "duration_seconds": 0 }
})

add_scene({
  "label": "Scene 2 - The Living Dashboard", "duration_seconds": 14,
  "purpose": "One persistent product world where the results accumulate",
  "visual_notes": "A single dashboard world that never cuts: the empty canvas ASSEMBLES, stat cards LAND one per beat, and the whole layout re-balances as each arrives. BG: soft gradient with slow-breathing glow. MG: the dashboard grid. FG: stat cards + counters.",
  "components": ["stat-card"],
  "elements": [
    { "name": "roi-card", "kind": "metric", "content": "340% ROI Increase", "motion": "lands with a bounce at beat 2" },
    { "name": "users-card", "kind": "metric", "content": "2.5M Users Reached", "motion": "slides in 0.3s later, counter rolls up" }
  ],
  "transition_in": { "type": "slide-up", "duration_seconds": 0.5 }
})
add_beat({ "label": "the canvas wakes", "duration_seconds": 3, "action": "the empty dashboard grid DRAWS itself in, glow breathing" })
add_beat({ "label": "first proof", "duration_seconds": 4, "action": "roi-card LANDS with a bounce; its counter ROLLS to 340%", "voiceover_text": "The results speak first." })
add_beat({ "label": "second proof", "duration_seconds": 4, "action": "users-card slides in; layout RE-BALANCES around both cards" })
add_beat({ "label": "the settle", "duration_seconds": 3, "action": "both cards ease back into the grid; glow calms" })

add_scene({
  "label": "Scene 3 - Quiet Moment", "duration_seconds": 5,
  "purpose": "A still, contemplative beat that should HOLD STILL (uses a generated image, not a video)",
  "visual_notes": "A serene, composed beat. The hero_image fills the frame as a deliberate still; a single line of 32px text FADES in slowly over it. BG: hero image. FG: one calm line of copy.",
  "components": [],
  "voiceover_text": "Find your calm.",
  "hero_image": "a perfectly still misty mountain lake at dawn, soft violet and amber light, mirror-like reflection, serene and contemplative, cinematic photograph",
  "transition_in": { "type": "blur-crossfade", "duration_seconds": 0.6 }
})

add_scene({
  "label": "Scene 4 - The Workflow", "duration_seconds": 16,
  "purpose": "User discovers and activates the connector feature",
  "visual_notes": "A clean workspace fills the frame — warm off-white background with subtle grid lines pulsing faintly. One persistent world: the workspace never resets; the card, cursor, and grid carry through every beat below, morphing and re-arranging as the idea advances. BG: subtle grid with breathing glow. MG: UI card with menu items. FG: cursor with drop shadow, particle hints.",
  "components": [],
  "transition_in": { "type": "none", "duration_seconds": 0 }
})
add_beat({ "label": "the approach", "duration_seconds": 4, "action": "A cursor GLIDES from below toward a plus icon at center; the grid brightens along its path.", "voiceover_text": "It starts with one click." })
add_beat({ "label": "the bloom", "duration_seconds": 5, "action": "On click, a circular button BLOOMS outward with a soft shadow, then MORPHS into a rounded card panel. Menu items STAGGER in from the right.", "voiceover_text": "A menu of every connector you need." })
add_beat({ "label": "the choice", "duration_seconds": 7, "action": "The cursor DRIFTS to Connectors, which highlights with a warm rounded fill; the card TILTS forward slightly and the other rows dim.", "voiceover_text": "Pick one. The rest is automatic." })

finish_storyboard({ "name": "Project Title" })
\`\`\`

## Rules

- ${sceneCountGuide}
- **CONTINUOUS-TAKE OVERRIDE (takes priority over the scene count above):** If the prompt asks for a "walkthrough", "demo", "demo flow", "step by step", "continuous take", "single take", "one take", or any unbroken multi-step flow where elements should persist and transform, output **EXACTLY ONE scene** spanning the full requested duration (12-30s) -- do NOT split it into multiple scenes. Author each step as a BEAT in the scene's "beats" array (label + action + optional voiceover), set transition_in to "none", and list every library component the flow touches. The codegen LLM lays it all out on one master timeline with persistent, transforming elements. A walkthrough split across scenes reads as a slideshow and is a storyboard failure.
- B-ROLL: if the prompt is a brand film, or has an emotional/aspirational/lifestyle opener or closer, or any "feeling / place / human moment" scene, you MUST add a "broll_query" (a specific cinematic stock-footage phrase) to at least one such scene -- see the B-Roll section. Don't default those moments to a flat gradient. (Skip b-roll entirely for pure data/UI/feature/logo/CTA videos.)
- First scene: transition "none" or omit transition_in.
- Valid transitions: crossfade, blur-crossfade, wipe-left, wipe-right, slide-up, slide-down, iris, morph-wipe, zoom-through, glitch-cut, scale-rotate, curtain, whip-pan, cinematic-zoom, match-cut, glass-turn, shader-crosswarp, shader-ripple, shader-radial, shader-directional-warp, shader-burn, shader-chromatic, shader-lens-distortion, shader-swirl, shader-pixelize, shader-flash-white, shader-light-leak, shader-gravitational-lens, shader-thermal, shader-domain-warp, shader-ridged-burn, none.
- match-cut is an ANCHORED PUNCH-THROUGH: the camera drives into the outgoing scene's dominant element and lands on the incoming scene's dominant element -- one continuous move. It is the DEFAULT transition between two consecutive scene-template (st-*) scenes (their anchors are declared; use 0.5-0.7s). Between non-template scenes it punches through center -- still strong when both scenes hold a clear centered subject.
- glass-turn is a SHARED-ELEMENT MATCH CUT and only works when BOTH adjacent scenes contain a glass-slab component: the pane physically turns away to edge-on and the next scene turns back in with new content -- one continuous object across the cut. ALWAYS use it between consecutive glass-slab scenes (0.8-1.2s duration).
- SHADER transitions (shader-*) use WebGL for premium visual effects. Use them for hero transitions between key scenes. shader-crosswarp: warped crossfade, shader-ripple: ripple wave, shader-radial: radial wipe, shader-directional-warp: directional warp morph, shader-burn: warm burn blend, shader-chromatic: RGB split aberration, shader-lens-distortion: gravitational lens, shader-flash-white: exposure pop through white (energetic reveals), shader-light-leak: warm film-burn streak wash, shader-gravitational-lens: content warps into a gravity well with event-horizon darkening (dramatic chapter turns), shader-thermal: heat-haze distortion, shader-domain-warp: organic noise-front dissolve, shader-ridged-burn: ember-edged burn front. Use 1-3 shader transitions per video for maximum impact. Do not overuse.
- VARY scene types: don't repeat the same layout. Mix hero text, product demos, stats, visual metaphors, grids, CTAs.
- Never have two identical layout types in a row.
- DENSITY ARC (what separates a film from a deck): vary visual density violently across the film -- a SWARM beat (st-swarm: dozens of props flying) against a SINGLE-OBJECT beat (one phone/frame/number in space) against an almost-EMPTY breath beat (1-2s of near-nothing before the payoff). A film that holds constant density reads as slides regardless of how well each frame is dressed. st-swarm is the "everything" beat -- follow it with your calmest scene.
- WORLD FLIP: flip the film's value ONCE at the narrative pivot (dark world -> light world or the reverse) -- e.g. dark chaos/problem scenes resolving into a light clarity/product scene. One flip is a story beat; multiple flips are noise.
- For library components: use the EXACT type name from the Available Components catalog. Do not abbreviate or shorten names. Fill ALL required data fields. Use realistic content, not placeholder text.


- For custom components: custom_prompt must be 3-5 sentences with SPECIFIC visual direction (exact sizes, colors, animation names, layout positions). EXPLICITLY STATE what content the custom component should render and what other library components in the scene already handle.
- hero_image is the tool for an INTENTIONAL STILL: a calm/composed/atmospheric beat that wants a real, cinematic visual but should hold still rather than move. It is the correct alternative to a "slow" or "still" b-roll video (a photo looks deliberate; a frozen video looks broken). Reach for it whenever a scene wants the b-roll feeling but stillness -- typically 0-2 per video, not every scene. Most UI/data/branded scenes should still rely on HTML/CSS/GSAP visuals. Skip for: stats, code demos, CTAs, dashboards, lists, logo scenes.
- hero_image and broll_query are MUTUALLY EXCLUSIVE on a single scene -- pick one (moving footage OR a still image), never both.
- hero_image prompts describe the IMAGE itself, not the scene layout.
- Every scene MUST have a components array with at least one component.
- Think FILM, not keynote: one powerful WORLD per scene, one idea per BEAT, cinematic motion, premium aesthetic. Cut = new world, beat = new thought.
- MANDATORY: For EACH scene (except intro/outro/breathing), you MUST include a "voiceover_text" field with narration that FITS the scene duration. Missing voiceover is a storyboard failure. CRITICAL: at ~150 words per minute, a 5-second scene fits ~12 words (1 short sentence), a 6-second scene fits ~15 words, a 7-second scene fits ~17 words. NEVER write more words than the scene duration allows. Keep narration punchy -- one idea per beat. On scenes WITH beats, narrate per beat ("voiceover_text" on each beat, ~2.5 words/second of beat) and make the scene's voiceover_text their concatenation. Skip voiceover_text for intro/outro brand asset scenes and breathing pauses.
- For IMAGE format: write comprehensive visual notes covering the entire visual composition. List components only if library UI elements fit.
- For PRESENTATION/DECK format: treat each slide as a self-contained visual composition. Write detailed visual notes per slide.
- For VIDEO: write rich visual notes per scene and list matching library components for UI elements.
- **Interactive Scripts:** Some library components are 🎬 Scriptable. Mention scripting needs in the visual notes and the codegen LLM will handle the details.
- Use add_scene / finish_storyboard -- never describe the storyboard in prose or markdown.
- When a prompt asks for a "walkthrough", "demo flow", "step by step", or "continuous take" involving multiple existing components, make ONE longer scene (12-30s) with progression-style visual notes that list those components (see "Continuous / Multi-Step Scenes" above) rather than several short scenes.

${SCENE_STORYBOARD_DESIGN_RULES}

${COMPOSITION_PLAYBOOK}

## Pacing & Narrative Arc (apply to the WHOLE sequence, every time)
This applies to EVERY video regardless of how detailed the prompt is -- do not let every scene sit at the same energy. Order the scenes with a deliberate HIGH->low->HIGH rhythm and a clear emotional arc, and name the arc you're using.
${PACING_PLAYBOOK}${opts.beatGrid ? `

## MUSIC GRID (the film is cut to the beat -- author durations in BARS)
The background music is already chosen: ${opts.beatGrid.bpm} BPM, so ONE BAR = ${opts.beatGrid.barSec.toFixed(2)}s.
Professional edits cut on downbeats. Set every scene's duration_seconds to a WHOLE number of bars:
${[2, 3, 4].map((b) => `- ${b} bars = ${(b * opts.beatGrid!.barSec).toFixed(2)}s`).join("\n")}
Short punch scenes = 2 bars, standard scenes = 3-4 bars, hero/breathing scenes = 4-6 bars.
Durations will be snapped to the bar grid after you submit -- authoring on-grid keeps your pacing intent intact.` : ""}`;

  // Inject brand asset info into the system prompt if available
  var brandAssetsSection = "";
  var guidelinesLower = (opts.brandKit.guidelines || "").toLowerCase();
  var brandAssets = opts.brandKit.assets || [];
  var backgrounds = brandAssets.filter(a => a.type === "background");
  var intros = brandAssets.filter(a => a.type === "intro");
  var outros = brandAssets.filter(a => a.type === "outro");
  var brandMusic = brandAssets.filter(a => a.type === "music");

  if (backgrounds.length) {
    brandAssetsSection += `\n\n## Brand Background Images (MANDATORY)\nThese are pre-approved brand backgrounds. PREFER these over mesh-gradient or gradient-background when a matching background exists.\n`;
    for (var bg of backgrounds) {
      brandAssetsSection += `- "${bg.name}": ${bg.url}${bg.tags?.length ? ` [tags: ${bg.tags.join(", ")}]` : ""}\n`;
    }
    brandAssetsSection += `\nTo use a brand background as a full-bleed scene background at z_index 0, use the image component:\n{ "type": "image", "data": { "src": "${backgrounds[0].url}" }, "z_index": 0 }\nOptional data props: overlay_opacity (0-1 for text readability), overlay_color, drift (true/false for ken-burns).\n`;
  }

  if (intros.length) {
    brandAssetsSection += `\n\n## Brand Intro Videos\nAvailable intro clips that can be used as the first scene of a video. Use the "video" component to play them.\n`;
    for (var intro of intros) {
      brandAssetsSection += `- "${intro.name}": ${intro.url} (${intro.duration ? intro.duration.toFixed(1) + "s" : "unknown duration"}${intro.width ? `, ${intro.width}x${intro.height}` : ""})\n`;
    }
    // Check if guidelines mandate intro usage
    var introRequired = guidelinesLower.includes("intro") && (guidelinesLower.includes("always") || guidelinesLower.includes("must") || guidelinesLower.includes("required"));
    if (introRequired) {
      brandAssetsSection += `\n⚠️ REQUIRED: Brand guidelines mandate this intro as the FIRST scene. You MUST include it.\nAdd this as scene 1:\n{ "label": "Intro", "duration_seconds": ${intros[0].duration || 5}, "components": [{ "type": "video", "data": { "src": "${intros[0].url}" }, "z_index": 0 }] }\nDo NOT skip this. Do NOT replace it with a custom component.\n`;
    } else {
      brandAssetsSection += `\nTo use a brand intro, add it as the first scene with a video component:\n{ "label": "Intro", "duration_seconds": ${intros[0].duration || 5}, "components": [{ "type": "video", "data": { "src": "${intros[0].url}" }, "z_index": 0 }] }\nAdd intros when brand guidelines specify to use them.\n`;
    }
  }

  if (outros.length) {
    brandAssetsSection += `\n\n## Brand Outro Videos\nAvailable outro clips that can be used as the last scene of a video. Use the "video" component to play them.\n`;
    for (var outro of outros) {
      brandAssetsSection += `- "${outro.name}": ${outro.url} (${outro.duration ? outro.duration.toFixed(1) + "s" : "unknown duration"})\n`;
    }
    // Check if guidelines mandate outro usage
    var outroRequired = guidelinesLower.includes("outro") && (guidelinesLower.includes("always") || guidelinesLower.includes("must") || guidelinesLower.includes("required"));
    if (outroRequired) {
      brandAssetsSection += `\n⚠️ REQUIRED: Brand guidelines mandate this outro as the LAST scene. You MUST include it.\nAdd this as the final scene:\n{ "label": "Outro", "duration_seconds": ${outros[0].duration || 5}, "components": [{ "type": "video", "data": { "src": "${outros[0].url}" }, "z_index": 0 }] }\nDo NOT skip this. Do NOT replace it with a custom component.\n`;
    } else {
      brandAssetsSection += `\nTo use a brand outro, add it as the last scene with a video component.\nAdd outros when brand guidelines specify to use them.\n`;
    }
  }

  if (brandMusic.length) {
    brandAssetsSection += `\n\n## Brand Music\nAvailable music tracks for audio.\n`;
    for (var m of brandMusic) {
      brandAssetsSection += `- "${m.name}": ${m.url} (${m.duration ? m.duration.toFixed(1) + "s" : "unknown duration"}${m.tags?.length ? `, tags: ${m.tags.join(", ")}` : ""})\n`;
    }
  }
  if (opts.brandKit.logos?.length) {
    var isLight = isLightBrand(opts.brandKit);
    var bestLogo = opts.brandKit.logos.find(l => l.theme === (isLight ? "light" : "dark")) || opts.brandKit.logos[0];
    brandAssetsSection += `\n\n## Brand Logos\nAvailable logo variants:\n`;
    for (var logo of opts.brandKit.logos) {
      brandAssetsSection += `- "${logo.name}" (${logo.variant}, ${logo.theme} theme): ${logo.url}\n`;
    }
    brandAssetsSection += `\nRecommended logo for current background: ${bestLogo.url}\nTo include a logo, use the image component at z_index 30 with blend mode to remove white backgrounds:\n{ "type": "image", "data": { "src": "${bestLogo.url}", "fit": "contain", "blend": "multiply", "drift": false }, "z_index": 30, "position": { "x": 40, "y": 30, "width": 120, "height": 40 } }\n\nFollow the brand guidelines below for when and where to place logos.\n`;
  }
  if (brandAssetsSection) {
    systemPrompt += brandAssetsSection;
  }

  // Inject brand guidelines (tenant-defined rules)
  if (opts.brandKit.guidelines) {
    systemPrompt += `\n\n## Brand Guidelines (FOLLOW THESE RULES)\n${opts.brandKit.guidelines}\n`;
  }

  // Inject the brand's resolved THEME so scenes MATCH the brand instead of
  // defaulting to dark. A light brand must render light -- inverting it (using
  // the brand's dark ink as a background) is the #1 "looks like AI" giveaway.
  {
    const light = isLightBrand(opts.brandKit);
    const c = opts.brandKit.colors;
    systemPrompt += `\n\n## Brand Theme (MATCH THIS -- do NOT default to dark)\n`;
    systemPrompt += `This brand is ${light ? "LIGHT" : "DARK"}. background=${c?.background}, text=${c?.text}, primary=${c?.primary}, accent=${c?.accent}.\n`;
    if (light) {
      systemPrompt += `This is a LIGHT, airy, premium aesthetic -- think Linear / Stripe / Notion / Apple light mode -- NOT a dark cinematic look.\n`;
      systemPrompt += `- Scene and mesh-gradient backgrounds MUST be built from the brand's LIGHT colors: base ${c?.background}, with subtle ${c?.surface} and FAINT ${c?.primary}/${c?.accent} tints. Soft gradient washes on light -- never a dark base.\n`;
      systemPrompt += `- ${c?.text} is the brand's TEXT color (dark ink). Use it for TEXT ONLY. It must NEVER be a background or mesh-gradient base color -- using a dark color as the background inverts the brand and is the #1 "looks like AI slop" giveaway.\n`;
      systemPrompt += `- Glow orbs, radial blooms, and "light sources in the dark" are DARK-theme devices -- do NOT use them. For light scenes use soft color washes, a subtle grid, generous whitespace, crisp shadows, and ${c?.primary} accents.\n`;
      systemPrompt += `- Cards/panels on light backgrounds need a solid ${c?.surface} fill or a 1px border + soft shadow to be visible (glassmorphism only works on dark).\n`;
    } else {
      systemPrompt += `Build scenes on the brand's dark background (${c?.background}) with light text (${c?.text}); glow orbs and blooms are appropriate here.\n`;
    }
  }

  // Inject reference image summary into system prompt
  if (opts.referenceImages?.length) {
    systemPrompt += buildReferenceImageSummary(opts.referenceImages);
    systemPrompt += "\nReference images are provided. Study them carefully and write visual notes that match the visual design, layout, spacing, and style shown in these references.\n";
  }

  // Inject speaker track mode instructions if applicable
  if (opts.hasSpeakerTrack) {
    systemPrompt += `\n\n## Speaker Track Mode
This video uses a speaker track -- a continuous camera recording of the speaker plays as
the base layer for the WHOLE film. Every scene is composited ON TOP of it. Two scene
modes; choose per scene and SAY WHICH in the visual notes:

1. SPEAKER-VISIBLE scene: the speaker stays on camera; the scene is TRANSPARENT so the
   camera shows through. Prefer a scene_template (deterministic, no codegen):
   - "st-speaker-lowerthird" -- speaker full-frame with a name/title (or key-line) card in
     a bottom corner. Slots: { name, title?, kicker?, position: "bottom-left"|"bottom-right",
     theme }. Use for the intro ('who's talking') or a persistent identifier.
   - "st-speaker-split" -- speaker on ONE side, an opaque content panel on the other with
     the key points (or a graphic). Slots: { side: "right"(default)|"left", headline, body?,
     bullets?[], kicker?, content?: {type,data} for a paired chart/stat/mock, theme }. Use
     when the speaker explains something WHILE it appears beside them.
   Only fall back to hand-specified components (transparent background + content_region) when
   neither template fits.
2. SCREENCAST / demo scene (REAL screen recording + speaker in the corner): this is THE
   most common speaker pattern -- emit the scene_template "st-speaker-screencast" (do NOT
   hand-roll a browser mock or PiP bubble, and do NOT go through codegen). It stamps out
   the known-good composite deterministically: opaque scene over a brand-gradient
   background, the recording in a frameless rounded card inset ~20px, and the camera bubble
   wired to the speaker track. Slots: { source: <the screen-recording asset URL>,
   pip_source: "speaker" (default -- the time-synced camera; NEVER a drawn avatar),
   theme: "dark"|"light", plus optional kicker / captions }. The recipe defaults
   (corner_radius 30, max_width_pct 88, circular PiP size 15, bottom-right) are baked in --
   only override a slot when the beat needs it. (If the recording is a SIMULATED/mock UI
   rather than real footage, use the matching mock component instead, still with a PiP.)

Never leave the speaker both invisible and un-PiPed -- every scene either shows the
speaker beside the content or carries the PiP bubble. And NEVER direct a drawn person,
avatar, or silhouette anywhere: the real camera is the only human in this film.`;
  }

  var userPrompt = `Create a ${opts.format} project.\n\n${opts.prompt}`;

  // Build user message: multi-part with vision content if reference images exist
  var userContent: string | LLMContentPart[];
  if (opts.referenceImages?.length) {
    var refParts = buildReferenceImageParts(opts.referenceImages);
    userContent = [
      { type: "text" as const, text: userPrompt },
      ...refParts,
    ];
  } else {
    userContent = userPrompt;
  }

  // Build a set of valid library component types for validation
  var validTypes = new Set(opts.componentCatalog.map((c: ComponentCatalogEntry) => c.type));
  validTypes.add("image");

  /**
   * Normalize one add_scene call's metadata in place (everything except
   * beats -- beats may still be arriving via add_beat calls when this runs)
   * and return the correction notes so the model sees what changed.
   */
  function normalizeSceneMeta(scene: any): string[] {
    var notes: string[] = [];

    // Camera moves from the LLM: ANCHORED zooms and resets only -- blind
    // rects are a human-eyes affordance (Studio), an LLM ringing a guessed
    // rectangle is the invented-callout failure class. Clamp everything.
    if (Array.isArray(scene.camera_moves)) {
      var dur0 = Number(scene.duration_seconds) || 10;
      var cleaned = scene.camera_moves
        .filter((m: any) => m && typeof m === "object")
        .filter((m: any) => m.type === "reset" || (m.type === "zoom" && typeof m.anchor === "string" && m.anchor.length > 0))
        .map((m: any) => ({
          at: Math.max(0, Math.min(dur0 - 0.5, Number(m.at) || 0)),
          type: m.type,
          ...(m.type === "zoom" ? { anchor: String(m.anchor).trim() } : {}),
          // 1.05 floor, not 1.3: a whole-window anchor with a forced 1.3+
          // zoom crops the window's chrome for the length of the move; the
          // subtle push (1.05-1.2) is a legitimate authored choice.
          ...(m.scale ? { scale: Math.max(1.05, Math.min(2.6, Number(m.scale) || 1.8)) } : {}),
          duration: Math.max(0.4, Math.min(1.6, Number(m.duration) || 0.9)),
        }))
        .slice(0, 4);
      if (cleaned.length < scene.camera_moves.length) {
        notes.push(`dropped ${scene.camera_moves.length - cleaned.length} camera move(s) (anchored zooms and resets only)`);
      }
      scene.camera_moves = cleaned;
    }

    if (!scene.components || !Array.isArray(scene.components)) {
      scene.components = [];
    }
    // Normalize entries to string | {type, data}. Authored data (especially
    // data.script on performable surfaces) is load-bearing -- flattening
    // objects to type strings here is how scripted performances silently
    // died between storyboard and codegen.
    scene.components = scene.components
      .map((c: any) => {
        if (typeof c === "string") return c;
        if (c && typeof c.type === "string" && c.type.length > 0) {
          return (c.data && typeof c.data === "object" && Object.keys(c.data).length > 0)
            ? { type: c.type, data: c.data }
            : c.type;
        }
        return "";
      })
      .filter((c: any) => (typeof c === "string" ? c.length > 0 : true));
    var compTypeOf = (c: any): string => typeof c === "string" ? c : c.type;
    var validated = scene.components.filter((c: any) => validTypes.has(compTypeOf(c)));
    if (validated.length < scene.components.length) {
      var removed = scene.components.filter((c: any) => !validTypes.has(compTypeOf(c))).map(compTypeOf);
      notes.push(`removed unknown component type(s): ${removed.join(", ")}`);
    }
    scene.components = validated;

    if (!scene.visual_notes) {
      scene.visual_notes = scene.purpose || scene.label || "";
      notes.push("no visual_notes given -- fell back to purpose/label (write real visual_notes next time)");
    }
    if (!scene.purpose) scene.purpose = scene.label || "";

    return notes;
  }

  /**
   * Finalize a scene's beats once it closes (the next add_scene fires, or
   * finish_storyboard is called) -- combines whatever was passed inline on
   * add_scene with everything appended via add_beat, normalizes durations,
   * and derives voiceover_text. Idempotent: a scene that has already been
   * finalized (no _rawBeats left) is left untouched.
   */
  function finalizeBeats(scene: any): string[] {
    var notes: string[] = [];
    if (!scene._rawBeats) return notes;
    var rawBeats = scene._rawBeats;
    delete scene._rawBeats;

    var beats: SceneBeat[] | undefined = normalizeBeats(rawBeats, scene.duration_seconds || 5, opts.beatGrid?.barSec);
    scene.beats = beats;
    if (beats) {
      if (!scene.voiceover_text) scene.voiceover_text = beatsVoiceover(beats);
    } else if ((scene.duration_seconds || 5) > 10) {
      notes.push(`${scene.duration_seconds}s with no usable beats -- long scenes should carry a beat timeline (>=2 beats)`);
    }
    return notes;
  }

  var messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  var scenes: any[] = [];
  var currentSceneIdx = -1;
  var name: string | undefined;
  var finished = false;
  var countRejections = 0;

  // Generous headroom: scenes now arrive as add_scene + one add_beat call
  // per beat, so the turn budget must scale with total beats, not just
  // scenes -- assume up to ~6 beats/scene plus buffer.
  var maxIterations = Math.max(24, (opts.sceneCount || 8) * 8 + 10);

  // A truncated turn is RECOVERABLE, not fatal: every scene/beat already
  // banked survives, so discard the turn (its tool calls may be cut mid-JSON
  // and cannot be trusted), tell the model what's banked, and let it re-send
  // the same work in smaller pieces. Only repeated truncation aborts.
  // 16k: a kinetic-cut film (10+ scenes, denser items) legitimately writes
  // bigger turns; 8192 produced triple-truncation aborts with zero banked.
  var SB_MAX_TOKENS = 16000;
  var truncations = 0;

  for (var iteration = 0; iteration < maxIterations && !finished; iteration++) {
    if (iteration >= Math.floor(maxIterations * 0.8) && scenes.length > 0) {
      messages.push({
        role: "user",
        content: `IMPORTANT: You have ${maxIterations - iteration} turns left. Call finish_storyboard NOW with the ${scenes.length} scene(s) you've added.`,
      });
    }

    var response = await callLLMAgentic(opts.llmConfig, messages, TOOLS, { temperature: 0.5, maxTokens: SB_MAX_TOKENS });

    if (response.stopReason === "max_tokens") {
      truncations++;
      // Only CONSECUTIVE truncations abort -- a truncation followed by turns
      // that bank real work means the recovery is working, and a later
      // one-off truncation must not inherit the earlier strikes (observed: a
      // long board aborted on its 3rd truncation spread across an otherwise
      // productive session, throwing away every banked scene).
      if (truncations > 2) {
        throw new Error(
          `Storyboard builder truncated ${truncations} times despite retry nudges (${scenes.length} scene(s) banked): the model kept exceeding max_tokens (${SB_MAX_TOKENS}) per turn instead of chunking its output.`
        );
      }
      console.warn(
        `  Storyboard builder: turn truncated at max_tokens (${SB_MAX_TOKENS}) -- discarding the turn and asking for smaller chunks (attempt ${truncations}/2).`
      );
      messages.push({
        role: "assistant",
        content: (response.text || "(response truncated)").slice(0, 2000),
      });
      messages.push({
        role: "user",
        content: `Your last response hit the output-token limit and was DISCARDED -- NONE of its tool calls were applied. Still banked: ${scenes.length} scene(s)${currentSceneIdx >= 0 && scenes[currentSceneIdx]._rawBeats ? ` (current scene has ${scenes[currentSceneIdx]._rawBeats.length} beat(s) so far)` : ""}. ${truncations >= 2 ? "FINAL WARNING -- your next response MUST contain exactly ONE add_scene call for ONE scene, visual_notes under 400 characters, NO inline beats (add them with add_beat in later turns). Anything bigger aborts the storyboard." : "Re-send the missing work in SMALLER pieces: ONE tool call per response, shorter visual_notes, and add_beat calls for beats instead of inline arrays."} Do not re-add scenes or beats that are already banked.`,
      });
      continue;
    }
    truncations = 0; // a turn under budget breaks the consecutive-truncation strike count

    if (response.toolCalls.length === 0) {
      // No tools called -- nudge back toward the tools rather than accepting prose.
      if (response.text) {
        messages.push({ role: "assistant", content: response.text });
      }
      messages.push({
        role: "user",
        content: scenes.length > 0
          ? `Please continue: call add_scene/add_beat for any remaining scenes/beats, then finish_storyboard. (${scenes.length} scene(s) added so far.)`
          : "Please call add_scene to add the first scene -- do not describe it in prose.",
      });
      continue;
    }

    var assistantContent: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> = [];
    if (response.text) assistantContent.push({ type: "text", text: response.text });
    for (var tc of response.toolCalls) {
      assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
    }
    messages.push({ role: "assistant", content: assistantContent as any });

    var toolResults: LLMContentPart[] = [];
    for (var toolCall of response.toolCalls) {
      var toolResult: string;

      if (toolCall.name === "add_scene") {
        // Scene-count discipline is carried by the pacing playbook + examples
        // (arc templates in beat grammar, slideshow self-check) rather than a
        // hard tool-boundary rejection -- the prompt no longer argues with
        // itself, so the model is trusted to hold the 3-4 world structure.
        // The advisory note below still flags when the budget is nearly full.
        var totalSoFar = scenes.reduce((acc: number, sc: any) => acc + (Number(sc.duration_seconds) || 5), 0);
        {
        // Close out the previous scene's beats before starting a new one.
        var prevNotes: string[] = currentSceneIdx >= 0 ? finalizeBeats(scenes[currentSceneIdx]) : [];

        var scene: any = { ...toolCall.input };
        var rawBeats = Array.isArray(scene.beats) ? scene.beats : [];
        delete scene.beats;
        scene._rawBeats = rawBeats;
        var notes = normalizeSceneMeta(scene);
        scenes.push(scene);
        currentSceneIdx = scenes.length - 1;
        console.log(`  Scene ${scenes.length}: "${scene.label}" (${scene.duration_seconds}s${rawBeats.length ? `, ${rawBeats.length} inline beat(s)` : ""})`);
        var allNotes = notes.concat(prevNotes.map((n) => `previous scene: ${n}`));
        var budgetNote = (!opts.sceneCount && opts.format === "video" && scenes.length === 3 && totalSoFar + (Number(scene.duration_seconds) || 5) <= 40)
          ? " NOTE: the scene budget is nearly full (3-4 scenes max for a short film) -- remaining ideas should become BEATS of these scenes, not new scenes."
          : "";
        toolResult = `scene ${scenes.length} added: "${scene.label}"` + (allNotes.length ? ` -- ${allNotes.join("; ")}` : "")
          + " -- call add_beat for each of this scene's beats (3+ beats), or move on if it needs 2 or fewer." + budgetNote;
        }
      } else if (toolCall.name === "add_beat") {
        if (currentSceneIdx < 0) {
          toolResult = "Cannot add a beat yet -- call add_scene first to start a scene.";
        } else {
          var targetScene = scenes[currentSceneIdx];
          // A REJECTED finish_storyboard (scene-count mismatch) has already
          // finalized this scene -- _rawBeats is gone. A beat arriving after
          // that must REOPEN the scene seeded with its finalized beats (the
          // next finalize re-normalizes the lot), not crash the storyboard
          // on undefined.push.
          if (!targetScene._rawBeats) {
            targetScene._rawBeats = Array.isArray(targetScene.beats) ? targetScene.beats.slice() : [];
            delete targetScene.beats;
          }
          targetScene._rawBeats.push({ ...toolCall.input });
          toolResult = `beat ${targetScene._rawBeats.length} added to scene ${currentSceneIdx + 1} ("${targetScene.label}")`;
        }
      } else if (toolCall.name === "finish_storyboard") {
        var finishNotes: string[] = currentSceneIdx >= 0 ? finalizeBeats(scenes[currentSceneIdx]) : [];
        // Bank the model's title even from a rejected finish: if the board
        // later ends unfinished, the fallback name must be the model's title,
        // never a slice of the (scaffolding-prefixed) prompt.
        if (!name && toolCall.input.name) name = String(toolCall.input.name);
        if (scenes.length === 0) {
          toolResult = "Cannot finish yet -- no scenes added. Call add_scene at least once first.";
        } else if (opts.sceneCount && scenes.length !== opts.sceneCount && countRejections < 1) {
          // ONE chance to reconcile with the director's count. If the model
          // comes back still insisting on its own structure, its structure
          // wins -- a grammar contract (hook + escalations + payoff) can
          // legitimately contradict the director's number, and rejecting
          // forever deadlocks the board into the max-iterations bailout
          // (observed live: sceneCount 3 vs 8 built scenes, prompt-slice name).
          countRejections++;
          toolResult = `Cannot finish yet -- exactly ${opts.sceneCount} scenes required, but ${scenes.length} added so far. Add or remove scenes to match, or call finish_storyboard again if your structure is deliberate.`;
        } else {
          if (opts.sceneCount && scenes.length !== opts.sceneCount) {
            console.warn(`  Storyboard builder: accepting ${scenes.length} scenes over the director's ${opts.sceneCount} -- the model held its structure after one rejection.`);
          }
          name = String(toolCall.input.name || (opts.rawPrompt || opts.prompt).slice(0, 60));
          finished = true;
          toolResult = "accepted" + (finishNotes.length ? ` -- ${finishNotes.join("; ")}` : "");
        }
      } else {
        toolResult = `Unknown tool: ${toolCall.name}`;
      }

      toolResults.push({ type: "tool_result", tool_use_id: toolCall.id, content: toolResult });
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (scenes.length === 0) {
    throw new Error("Storyboard builder returned no scenes");
  }
  if (currentSceneIdx >= 0) finalizeBeats(scenes[currentSceneIdx]);
  if (!finished) {
    console.warn(`  Storyboard builder: max iterations (${maxIterations}) reached with ${scenes.length} scene(s) and no finish_storyboard call -- using what was added.`);
    name = name || (opts.rawPrompt || opts.prompt).slice(0, 60);
  }

  var componentHints = 0;
  for (var s of scenes) componentHints += s.components.length;
  console.log(`  Storyboard builder: ${scenes.length} scenes, ${componentHints} component hints`);

  // ── Template enforcement (deterministic, post-storyboard) ──
  // Policy: wherever a scene template can carry a scene, use it. The main
  // storyboard call reliably follows the user prompt's component suggestions
  // over the template preference (verified across three prompt iterations),
  // so -- like the critique funnel's focused detectors -- assignment runs as
  // one-job calls AFTER the storyboard, one per eligible scene.
  await assignSceneTemplates(scenes, opts.componentCatalog, opts.llmConfig);

  // ── House-style enforcement + report (deterministic) ──
  // Prompt guidance regresses; enforcement doesn't. Fix what code can fix,
  // and print a FILM DIRECTION report so any regression is visible in one
  // glance instead of discovered scene-by-scene in Studio.
  enforceFilmDirection(scenes);

  return { name: name!, scenes } as StoryboardResult;
}

/**
 * Deterministic house-style pass over the final draft scenes:
 *  - screencast template scenes in a dark-forward film default to FLOAT
 *  - exactly one world flip: an all-dark template film gets one light pivot
 *    scene (and an all-light one gets a dark pivot) on themable templates
 *  - report card: templates used, theme sequence, swarm/float/match-cut
 *    counts -- the film's style contract, logged every generation.
 */
export function enforceFilmDirection(scenes: DraftScene[]): void {
  const themable = new Set(["st-hero-stat", "st-kinetic-list", "st-screencast", "st-swarm", "st-manifesto", "st-compare", "st-flow", "st-convergence", "st-artifact", "st-chaos-collage"]);
  const tpl = (s: DraftScene) => s.scene_template?.type || null;
  const themeOf = (s: DraftScene): "dark" | "light" | null => {
    const t = tpl(s);
    if (!t) return null;
    const data = (s.scene_template!.data || {}) as Record<string, unknown>;
    if (t === "st-logo-close") return "dark";
    if (t === "st-quote") return data.theme === "light" ? "light" : "dark";
    if (t === "st-swarm") return data.theme === "light" ? "light" : "dark";
    if (t === "st-screencast") return (data.presentation === "float" && data.theme !== "light") || data.theme === "dark" ? "dark" : "light";
    return data.theme === "dark" ? "dark" : "light";
  };

  const tplScenes = scenes.filter((s) => tpl(s));
  const darkish = tplScenes.filter((s) => themeOf(s) === "dark").length;
  const darkForward = tplScenes.length > 0 && darkish >= tplScenes.length / 2;

  // Float default for screencast scenes in a dark-forward film.
  for (const s of scenes) {
    if (tpl(s) === "st-screencast" && darkForward) {
      const data = (s.scene_template!.data || {}) as Record<string, unknown>;
      if (!data.presentation && data.theme !== "light") {
        data.presentation = "float";
        s.scene_template!.data = data;
      }
    }
  }

  // One world flip: all-same-theme template films get a pivot scene flipped
  // (nearest themable template scene to ~55% through the film).
  const themes = tplScenes.map((s) => themeOf(s));
  const flips = themes.filter((t, i) => i > 0 && t !== themes[i - 1]).length;
  if (tplScenes.length >= 3 && flips === 0) {
    const target = [...scenes]
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => themable.has(tpl(s) || "") && tpl(s) !== "st-screencast")
      .sort((a, b) => Math.abs(a.i / scenes.length - 0.55) - Math.abs(b.i / scenes.length - 0.55))[0];
    if (target) {
      const data = (target.s.scene_template!.data || {}) as Record<string, unknown>;
      data.theme = themes[0] === "dark" ? "light" : "dark";
      target.s.scene_template!.data = data;
      console.log(`  Film direction: no world flip -- pivoting "${target.s.label}" to ${data.theme} (one flip is a story beat)`);
    }
  }

  // Event rate: a composition that sits still reads as a slide no matter how
  // well the frame is dressed. Count each scene's visual events (setup +
  // items/beats/captions) and flag motion-graphics scenes whose average hold
  // exceeds ~8s. Footage-led scenes are exempt -- the recording itself moves.
  const mediaRe = /\/[^\s"'`)\]]+\.(?:mp4|webm|mov|m4v|ogv)/i;
  const eventsOf = (s: DraftScene): number => {
    const t = tpl(s);
    const data = (s.scene_template?.data || {}) as Record<string, any>;
    if (t) {
      const items = Array.isArray(data.items) ? data.items.length
        : Array.isArray(data.cards) ? data.cards.length : 0;
      if (t === "st-kinetic-list") return 1 + Math.min(items, 8) + ((s.duration_seconds || 0) >= 13 ? 1 : 0);
      if (t === "st-hero-stat") return 2 + items;
      if (t === "st-swarm") return Math.max(items, 10);
      if (t === "st-screencast") return 1 + (Array.isArray(data.captions) ? data.captions.length : 0);
      if (t === "st-photo-close") return 3 + (Array.isArray(data.items) ? data.items.length : 0);
      if (t === "st-artifact") return 2 + (Array.isArray(data.stats) ? data.stats.length : 0) + (data.artifact ? 3 : 0);
      if (t === "st-manifesto") return Math.max(3, Math.ceil(String(data.text || "").split(/\s+/).length / 3));
      if (t === "st-compare") return 3 + (Array.isArray(data.left_lines) ? data.left_lines.length : 0) + (Array.isArray(data.right_lines) ? data.right_lines.length : 0);
      if (t === "st-flow") return 1 + (Array.isArray(data.steps) ? data.steps.length * 2 : 0);
      if (t === "st-convergence") return 2 + (Array.isArray(data.inputs) ? data.inputs.length : 0) / 2 + (Array.isArray(data.outputs) ? data.outputs.length : 0);
      return 2; // st-quote / st-logo-close: reveal + resolve
    }
    return Math.max(Array.isArray(s.beats) ? s.beats.length : 0, 1);
  };
  const isFootageLed = (s: DraftScene) =>
    tpl(s) === "st-screencast" || !!(s as any).broll_query || !!(s as any).hero_image || mediaRe.test(JSON.stringify(s));
  let slowest = 0;
  let slowestLabel = "";
  for (const s of scenes) {
    const dur = s.duration_seconds || 0;
    if (!dur || isFootageLed(s)) continue;
    const perEvent = dur / eventsOf(s);
    if (perEvent > slowest) { slowest = perEvent; slowestLabel = s.label || ""; }
    if (perEvent > 8) {
      console.warn(`  EVENT RATE WARNING: "${s.label}" holds ${dur}s over ${eventsOf(s)} events (${perEvent.toFixed(1)}s/event) -- this reads as a slide; add items/beats or split the scene.`);
    }
  }

  // Report card -- the style contract, visible on every generation.
  const floats = scenes.filter((s) => tpl(s) === "st-screencast" && ((s.scene_template!.data || {}) as any).presentation === "float").length;
  const swarms = scenes.filter((s) => tpl(s) === "st-swarm").length;
  const matchCuts = scenes.filter((s) => s.transition_in?.type === "match-cut").length;
  const themeSeq = scenes.map((s) => tpl(s) ? (themeOf(s) === "dark" ? "D" : "L") : "c").join("");
  console.log(`  FILM DIRECTION: ${tplScenes.length}/${scenes.length} scenes templated | themes ${themeSeq} (c=codegen) | swarm ${swarms} | float ${floats} | match-cuts ${matchCuts} | slowest ${slowest ? slowest.toFixed(1) + "s/event" : "n/a"}${slowest > 8 ? ` (${slowestLabel})` : ""}`);
  if (tplScenes.length === 0) console.warn(`  FILM DIRECTION WARNING: zero template scenes -- this film will be all codegen; check the template mapper log above.`);
  if (swarms === 0 && scenes.length >= 4) console.log(`  Film direction note: no swarm/density beat in this film (fine for demo-led films; a launch film usually wants one).`);
}

/**
 * Map each eligible draft scene onto a scene template (st-*) via a focused
 * per-scene LLM call: the ONLY decision is "can one template carry ALL of
 * this scene's essential content -- and with what slot data?". Scenes built
 * around real footage (screencast-frame, video URLs, b-roll, hero images)
 * are skipped; scenes the call maps get scene_template + components:[], and
 * default transitions between two consecutive template scenes upgrade to a
 * match-cut (mirrors the glass-turn auto-upgrade).
 */
export async function assignSceneTemplates(
  scenes: DraftScene[],
  catalog: ComponentCatalogEntry[],
  llmConfig: LLMConfig,
): Promise<void> {
  var templates = catalog.filter((c) => c.category === "scene-template");
  if (templates.length === 0) return;

  var tplText = templates.map((t) => {
    var slots = Object.entries((t.data || {}) as Record<string, any>)
      .map(([k, v]) => `    - ${k}: ${v?.label || v?.type || ""}${v?.optional ? " (optional)" : ""}`)
      .join("\n");
    return `- ${t.type}: ${t.description}\n  slots:\n${slots}`;
  }).join("\n");

  // B-roll scenes keep their cinematic video backgrounds (no template shows
  // a video background); screen-recording scenes map to st-screencast, and
  // hero-image scenes ARE eligible -- they map to st-photo-close, which
  // makes the photo the scene's world (type on scrim, never cards on photo).
  var footageUrlRe = /\/[^\s"'`)\]]+\.(?:mp4|webm|mov|m4v|ogv)/i;
  // Scenes whose components carry storyboard-authored data (scripted
  // performances on performable surfaces) are already fully specified --
  // template assignment would wipe the script (it clears s.components).
  var eligible = scenes.filter((s) => !s.scene_template && !s.broll_query
    && !(s.components || []).some((c) => typeof c === "object" && c.data));

  await Promise.all(eligible.map(async (s) => {
    var beatLines = (Array.isArray(s.beats) ? s.beats : [])
      .map((b: any) => `  - [${b.duration_seconds}s] ${b.label}: ${b.action}`).join("\n");
    var footageUrl = (JSON.stringify(s).match(footageUrlRe) || [])[0];
    var user = `TEMPLATES:\n${tplText}\n\nSCENE:\nlabel: ${s.label}\npurpose: ${s.purpose}\nduration: ${s.duration_seconds}s\nvisual_notes: ${s.visual_notes}\n${beatLines ? `beats:\n${beatLines}\n` : ""}voiceover: ${s.voiceover_text || ""}\nsuggested components: ${JSON.stringify(s.components)}\n${footageUrl ? `footage in this scene: ${footageUrl}\n` : ""}\nCan ONE template above carry ALL of this scene's essential on-screen content? If yes return {"type": "st-...", "data": {...every slot filled with REAL final copy pulled from this scene's content...}}. If none fits, return null. Pure JSON only.

DENSITY RULE: templates spread their items evenly across the scene's duration, so item count sets the cut rate. Mine the voiceover: derive roughly one item per narration sentence in this scene's span -- target one visual event every 4-8 seconds (a ${s.duration_seconds || 10}s scene wants ~${Math.max(2, Math.round((s.duration_seconds || 10) / 6))} items). NEVER compress several narration sentences into one item; a list-y sentence ("city, date, venue, topic") can even split into an item per element.`;
    try {
      var raw = await callLLM(llmConfig, [
        { role: "system", content: "You match ONE storyboard scene to a library of locked, designer-built whole-scene templates. Be decisive: these templates are professionally composed and preferred over custom scenes whenever they can express the scene's content. A scene whose star is a screen recording maps to st-screencast (put the footage URL in the 'source' slot and derive timed caption chips from the beats). A scene built around a generated/photographic hero image (a place, a room, a person, an emotional close) maps to st-photo-close -- leave backdrop_image empty (the pipeline fills it with the scene's generated image) and put the scene's key line in 'headline'. Only return null when the scene genuinely needs something no template offers (custom diagrams, bespoke interaction, multiple videos at once). Respond with pure JSON -- an object {type, data} or null. No markdown, no commentary." },
        { role: "user", content: user },
      ], { maxTokens: 2500 });
      var text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      if (!text || text === "null") {
        console.log(`  Template assign: no template fits "${s.label}" -- staying codegen`);
        return;
      }
      var pick = JSON.parse(text);
      if (!pick || typeof pick !== "object" || typeof pick.type !== "string") return;
      var tpl = templates.find((t) => t.type === pick.type);
      if (!tpl || !pick.data || typeof pick.data !== "object") return;
      // Every required slot must be filled -- a template with holes ships a
      // visibly broken scene, worse than letting codegen have it.
      var missing = Object.entries((tpl.data || {}) as Record<string, any>)
        .filter(([k, v]) => !v?.optional && (pick.data[k] === undefined || pick.data[k] === ""))
        .map(([k]) => k);
      if (missing.length > 0) {
        console.warn(`  Template assign: ${s.label} -> ${pick.type} rejected (missing required slot(s): ${missing.join(", ")})`);
        return;
      }
      // Callout rectangles require SEEING the footage; no LLM in this path
      // ever does, so mapper-invented geometry rings arbitrary regions of
      // the recording (blank canvas, half a sidebar). Strip them -- callouts
      // are added deliberately in Studio or from asset analysis.
      if (Array.isArray(pick.data.callouts) && pick.data.callouts.length > 0) {
        console.log(`  Template assign: ${s.label} -- dropped ${pick.data.callouts.length} invented callout region(s) (geometry needs real footage frames; add callouts in Studio)`);
        delete pick.data.callouts;
      }
      // LLMs shorten asset paths when copying them into slots; snap any
      // video-path slot value back to the scene's actual footage URL.
      if (footageUrl) {
        for (var slotKey of Object.keys(pick.data)) {
          var slotVal = pick.data[slotKey];
          if (typeof slotVal === "string" && footageUrlRe.test(slotVal) && slotVal !== footageUrl) {
            console.warn(`  Template assign: ${s.label} slot "${slotKey}" video path corrected to scene footage URL`);
            pick.data[slotKey] = footageUrl;
          }
        }
      }
      s.scene_template = { type: pick.type, data: pick.data };
      s.components = [];
      console.log(`  Template assign: ${s.label} -> ${pick.type}`);
    } catch (e: any) {
      console.warn(`  Template assign skipped for "${s.label}": ${e?.message || e}`);
    }
  }));

  // Default transitions between consecutive template scenes become match cuts.
  for (var i = 1; i < scenes.length; i++) {
    if (!scenes[i].scene_template || !scenes[i - 1].scene_template) continue;
    var tr = scenes[i].transition_in;
    if (!tr || tr.type === "crossfade" || tr.type === "blur-crossfade") {
      scenes[i].transition_in = { type: "match-cut", duration_seconds: 0.6 };
    }
  }
}
