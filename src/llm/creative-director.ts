/**
 * Creative Director
 *
 * Runs FIRST. Takes the raw prompt and -- as the expert -- commits to ONE strong
 * creative idea for the entire video. Without this, the storyboard builder generates
 * 8 mediocre scene ideas without a unifying concept.
 *
 * Flow:
 *   1. Generate 3 distinct creative concepts (high temperature)
 *   2. Self-critique and pick the strongest one
 *   3. Output a "treatment" that the storyboard step must follow
 *
 * The treatment includes:
 *   - The one-line "big idea"
 *   - The storytelling pattern (from the visual storytelling guide)
 *   - The visual through-line (what persists/transforms across scenes)
 *   - The emotional arc
 *   - Key visual commitments (color mood, typography attitude, motion personality)
 */

import { callLLM, type LLMConfig, type LLMContentPart } from "./client.js";
import { getStorytellingGuide } from "./design-skills.js";
import type { BrandKit, OutputFormat, ReferenceImage } from "../core/types.js";
import {
  buildReferenceImageParts,
  buildReferenceImageSummary,
} from "./reference-images.js";

// ── Types ──

/** The L4 abstraction: a film grammar is the contract that governs everything
 *  cross-cutting -- who narrates, what earns a cut, the music's role, the
 *  camera policy, and how scenes are assembled. Components (L1), scene
 *  templates (L2) and scenes/beats (L3) all live INSIDE one of these. */
export type FilmGrammar = "launch-film" | "tempo-cut" | "hype-cut" | "speaker-screencast" | "editorial" | "social-reel" | "data-story";

export const FILM_GRAMMARS: FilmGrammar[] = ["launch-film", "tempo-cut", "hype-cut", "speaker-screencast", "editorial", "social-reel", "data-story"];

/** ── The LOOK axis (visual_system) and SOUND axis (audio_system) ──
 * The film-craft triad on the generate surface: film_grammar = the RHYTHM,
 * visual_system = the LOOK, audio_system = the SOUND. Same contract for all
 * three: omitted -> the creative director infers from the prompt; provided ->
 * pinned, the director must commit. Enums are registries: every value is
 * backed by real machinery (a backdrop component, a motion contract, a
 * component family) -- values without machinery are lies. */
export interface VisualSystem {
  /** The film's continuous surface. Backed by WorldSpec derivation. */
  world?: "light" | "dark" | "paper";
  /** The physics contract: how things move (and what moves are banned). */
  motion?: "punchy" | "calm" | "cutout-physics";
  /** The type voice for display text (brand kit fonts stay the base). */
  type?: "grotesk" | "editorial-serif" | "typewriter" | "script";
  /** A recurring performed element family threading the film. */
  motif?: {
    kind: "cutout";
    /** Brand-kit cutout asset URLs (the sticker set). v1: REQUIRED to cast
     *  the motif; the pipeline resolves *-cutout.png brand images when
     *  omitted and fails loudly if none exist. */
    assets?: string[];
    /** accent = recurring garnish; lead = the motif carries the film. */
    density?: "accent" | "lead";
  };
}
export interface AudioSystem {
  /** Music bed mood -- drives the track search. 'none' = no music even if
   *  background_music was set. */
  music_mood?: "driving" | "jazzy" | "ambient" | "playful" | "cinematic" | "warm" | "none";
  /** TTS voice for narration (same values as the legacy voice param). */
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
}

export interface ConceptDirectorOpts {
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  referenceImages?: ReferenceImage[];
  /** Caller-fixed film grammar: the director must commit to it, not choose. */
  filmGrammar?: FilmGrammar;
  /** Caller-pinned look/sound: subfields provided here are commitments; the
   *  director infers only the omitted ones. */
  visualSystem?: VisualSystem;
  audioSystem?: AudioSystem;
  /** A speaker video is attached (forces/implies speaker-screencast). */
  hasSpeaker?: boolean;
}

export interface Treatment {
  /** The one-line concept that unifies the entire video */
  concept: string;
  /** The storytelling pattern being used */
  pattern: string;
  /** What visually persists or transforms across scenes */
  throughLine: string;
  /** The emotional journey: start -> middle -> end */
  emotionalArc: string;
  /** Visual style commitments for the whole project */
  visualStyle: {
    colorMood: string;
    typographyAttitude: string;
    motionPersonality: string;
    spatialStrategy: string;
  };
  /** 3-5 concrete, buildable recurring devices (the film's set list) -- named
   *  things with specific looks + behavior, never mood adjectives. */
  visualDevices?: string[];
  /** The media mix: which worlds open on real footage (b-roll), hold on a
   *  generated still, or are pure motion graphics -- decided deliberately. */
  mediaPlan?: string;
  /** 3-5 sentence summary the storyboard builder can use as creative direction */
  directorNote: string;
  /** Recommended number of scenes (the director decides the structure). */
  sceneCount?: number;
  /** The film grammar this treatment commits to (L4). Downstream stages read
   *  this as DATA: it activates the matching storyboard contract, sets the
   *  assembly policy (component-first vs codegen), and the music policy. */
  filmGrammar?: FilmGrammar;
  /** The LOOK this treatment commits to (pins passed through; omitted
   *  subfields inferred by the director). Downstream reads this as DATA:
   *  world derivation, motion guidance, motif casting. */
  visualSystem?: VisualSystem;
  /** The SOUND this treatment commits to: music mood + narration voice. */
  audioSystem?: AudioSystem;
}

/**
 * Generate the creative bible for a project.
 * This is the missing "human creative director" step.
 */
export async function generateTreatment(opts: ConceptDirectorOpts): Promise<Treatment> {
  var storytellingGuide = getStorytellingGuide();

  var brandContext = buildBrandSummary(opts.brandKit);

  var systemPrompt = `You are a creative director at a top motion design studio. Your job is to come up with ONE brilliant creative concept for a video, NOT to storyboard scenes.

You think in concepts, not slides. A concept is the single unifying idea that makes a video memorable. Examples of strong concepts:
- "The feature assembles itself piece by piece, like a machine being built in real-time"
- "We zoom into the product like entering a world -- each feature is a room you walk through"
- "Two panels tell parallel stories that converge into one"
- "The old way crumbles apart while the new way grows from its pieces"

Bad concepts (these are NOT concepts, they are slide decks):
- "Show the hero, then features, then stats, then CTA"
- "Introduce the product, explain how it works, show benefits"

${storytellingGuide ? `## Storytelling Patterns You Can Use\n\n${storytellingGuide}\n\n` : ""}
## The House Motion Language (direct WITH these -- the pipeline can execute all of them)

Your treatment feeds a system that already speaks a launch-film dialect. Direct concepts that USE it, not generic "clean and modern" adjectives:
- DENSITY ARC: a swarm/chaos beat (dozens of props flying with motion blur) against a single-object beat against a near-empty breath beat. Concepts that oscillate density read as film.
- ONE WORLD FLIP: dark world <-> light world exactly once, at the narrative pivot ("chaos resolves to clarity"). Say WHERE it flips and why.
- OBJECTS, NOT LAYOUTS: screencasts float as tilted 3D planes with reflections; regions of the UI lift out in glow callouts; phones are physical devices; stamps/gesture-labels/pills are props with slam physics. Direct the film in objects.
- MOTION PHYSICS: everything fast smears with velocity blur and settles; everything slow drifts. Name the moments that deserve a THROW, a STAMP, a type-on reveal.
- The camera never fully stops (slow push is always on); dark scenes live in a lit 3D ribbon world; on-brand photo backdrops with Ken Burns drift are available.
## FILM GRAMMAR (the first commitment you make -- output it as "filmGrammar")

Every film commits to exactly ONE grammar. It is not a mood -- it is the contract that decides who narrates, what earns a cut, the music's role, and how scenes are assembled. The grammars:

- "launch-film" (the default): few long WORLDS with 3-6 beats inside each, dark-forward cinematic look, density arcs, throws/stamps, crossfades earned at world changes. For brand films, launches, and emotional arcs that need breath.
- "tempo-cut": the HeyGen-explainer dialect. A driving music bed picked FIRST, 6-9 hard cuts in 30-45s each quantized to the track's bars, ONE thought per cut, on-screen type IS the voiceover (no narrator, no statement slides mid-film), evidence appears as DETAIL CUTS (one cropped element huge -- an isolated composer typing the ask -- not a whole miniaturized app), captions at display scale BESIDE windows, one brand accent, at most one gag (a prop-strike card). Scenes are assembled from the component kit, not custom codegen. For product explainers, connector demos, and launch clips that should feel fast, confident, music-driven. The story must be told through the REAL product surfaces (the library's product mocks), never through invented abstractions.
- "hype-cut": the story-first hype dialect -- tempo-cut's edit driving editorial's alternation: the words HYPE, the product PROVES. A driving bed picked FIRST; ONE-BAR kinetic type interstitials (st-statement at hype pace -- premise lines, reactions, turns) alternate with LONGER product beats (2-6 bars) where the library's named product mocks PERFORM a single use-case story. The film opens PREMISE-FIRST (1-2 type beats set the stakes before any product pixel); the product beats form ONE CONTINUOUS story-world (the same session carries its transcript and state across every cut back to it -- never reset); the story escalates in TWO ACTS (first payoff, then the user asks for more in-product, then the bigger payoff); and the cut into the payoff surface is CAUSED on screen (the cursor clicks the link that becomes the next scene). For product-story hype films, MCP/integration demos, and launch clips where a use-case narrative -- not a feature run -- is the argument. Reference cut: the "Word for Word" Cowork x Quotient film (proj_bf247f37).
- "speaker-screencast": a human on camera owns the film. The speaker video is the base layer and THE CLOCK -- cuts and content entrances follow the speaker's sentences, overlays dock in a content region beside the speaker or take over with the speaker in PiP, the human voice narrates (no text-as-VO), music absent or ducked far under the voice. Only choose it when a speaker recording exists.
- "editorial": the typography-first manifesto dialect. The story is told in huge display-SERIF statements on a warm cream (or near-black) canvas -- one thought per beat, ONE word per statement emphasized in gradient italic -- ALTERNATING with full-bleed evidence beats (a motion demo, a product surface, a chart) that prove the statement just made. Statement / evidence / statement / evidence. Deliberate canvas-temperature flips (cream <-> dark) at chapter turns are part of the rhythm. Music: a restrained bed. For thought-leadership clips, launch manifestos, "why we built this" films, and library/catalog showcases -- anywhere the WORDS are the product.
- "social-reel": the vertical feed dialect (9:16, 15-30s TOTAL). The FORMAT carries the film: a HOOK beat in the first 2 seconds (a bold claim or question in giant type -- the thumb-stopper), 3-5 escalation beats that each pay off the hook a little more, one payoff beat, and a LOOP SEAM (the closing frame composes into the opening frame so the loop replays cleanly). Captions ARE the voiceover at display scale; every beat composes for a vertical phone held in one hand -- content stacked in the middle band, top ~12% and bottom ~18% left clear for platform UI. One brand accent, driving music, hard cuts. For Reels/Shorts/TikTok product moments, feature drops, and social announcements -- anywhere the film ships to a feed. sceneCount for this dialect counts BEATS: hook + each escalation + payoff are separate scenes, so commit to 6-9 -- a sceneCount of 3 contradicts the shape and deadlocks the storyboard.
- "data-story": the numbers-as-protagonist dialect. The film IS a sequence of data beats: each one stages ONE number or chart as the hero of its scene (a counter counting up live, a bar chart racing, a line drawing its climb, a progress bar filling) with a short claim in type that the number then PROVES. Claim -> proof, claim -> proof, numbers escalating toward the biggest figure, which is the payoff -- the money number lands last and largest. Every figure must come from the brief (never invent statistics); every chart DRAWS on screen, never appears pre-drawn. A dashboard recap is earned only as the finale. For metrics announcements, quarterly recaps, benchmark results, growth stories, ROI cases -- anywhere the argument is quantitative. sceneCount: 5-8 (each data beat is its own scene; setup claims may share the data beat's scene as a leading beat).

Echo the grammar in visualStyle.motionPersonality (e.g. "tempo-cut: ..."), and let every other choice serve it.

${brandContext}

## The Prompt You Receive

The prompt may be a single thin line ("a product launch video for our new feature") or a detailed spec. EITHER WAY, you are the expert and you direct it:
- **Thin prompt:** make confident, smart creative choices to fill every gap. Decide the story, the structure, and the best way to tell it. The user is leaning on YOUR expertise -- do not water it down or ask for more; commit.
- **Detailed prompt:** honor its specifics (required points, tone, assets), and elevate them with your direction.
You never just execute a request -- you decide what makes the strongest video for it.

## Your Task

Given the prompt, generate THREE distinct creative concepts. Each concept should:
1. Be expressible in ONE sentence
2. Name the specific storytelling PATTERN it uses
3. Describe what VISUALLY persists or transforms across the video (the through-line)
4. Describe the emotional arc (what the viewer feels at start vs middle vs end)
5. Commit to a visual style (color mood, typography attitude, motion personality, spatial strategy)

Then pick the STRONGEST concept, explain why, and decide the optimal number of scenes.
A scene is a WORLD that persists while ideas advance INSIDE it as beats -- not one idea
per scene. Scene counts: 1-2 for short-form (12-20s), 3-4 for standard (30-60s), 4-6 for
a deep dive (60-120s). Each scene carries 3-6 beats; a 30-45s film is typically an
opening world, one or two long living middles (12-18s each), and a closing world.
EXCEPTION: a TEMPO-CUT film inverts this -- set sceneCount to 6-9, each scene one short
thought (2-5 bars), because in that grammar the cut itself is the rhythm instrument. A
HYPE-CUT film inverts it further: 10-16 scenes, alternating one-bar type interstitials
with 2-6-bar product beats (the reference cut runs 15 scenes in ~50s).

## Output Format (valid JSON, no markdown fences)

{
  "concepts": [
    {
      "idea": "One sentence describing the concept",
      "pattern": "The storytelling pattern name",
      "throughLine": "What visually persists/transforms",
      "emotionalArc": "curiosity -> discovery -> confidence",
      "visualStyle": {
        "colorMood": "e.g. deep indigo transitioning to warm amber",
        "typographyAttitude": "e.g. sharp and technical, becoming warmer",
        "motionPersonality": "e.g. precise mechanical movements that loosen into organic flows",
        "spatialStrategy": "e.g. tight close-ups opening into wide panoramas"
      },
      "mediaPlan": "Which worlds use real media vs pure motion graphics -- e.g. 'World 1 opens on b-roll of a cluttered desk at dawn (real footage, moving); worlds 2-3 are pure motion graphics; the close holds on a generated still of a calm workspace.' A launch/brand film with a human or place moment should open on REAL media (b-roll if it moves, a generated still if it holds); an all-UI film may say 'all motion graphics' -- but say it deliberately.",
      "visualDevices": [
        "3-5 CONCRETE, BUILDABLE recurring devices -- named things with specific behavior, not moods",
        "e.g. 'a 4px violet pipeline rail across the lower third that thickens each time a channel connects'",
        "e.g. 'notification cards with real app chrome (Slack/Gmail/Calendar) that land tilted 4-8 degrees'",
        "e.g. 'one cursor with a soft shadow that is the protagonist -- every action starts from it'"
      ]
    }
  ],
  "selected": 0,
  "selectionReason": "Why this concept is strongest",
  "filmGrammar": "launch-film | tempo-cut | speaker-screencast | editorial | social-reel | data-story",
  "visualSystem": {
    "world": "light | dark | paper -- the film's continuous surface. paper = the print/letterpress world (painted sheet, warm ink): choose it when the prompt asks for a paper/print/zine/letterpress/illustrated-sticker feel. Otherwise omit and the brand decides.",
    "motion": "punchy | calm | cutout-physics -- the physics contract. calm = settle-never-bounce editorial restraint. cutout-physics = rigid flat pieces that drop/settle/swing like physical stickers (pairs with paper + a cutout motif). Default punchy.",
    "type": "grotesk | editorial-serif | typewriter | script -- the display-type voice, only when the concept demands one (paper films often want typewriter)."
  },
  "audioSystem": {
    "music_mood": "driving | jazzy | ambient | playful | cinematic | warm | none -- the music bed's personality, chosen to serve the emotional arc."
  },
  "sceneCount": 3,
  "directorNote": "3-5 sentence creative direction summary that the storyboard should follow"
}

## Rules
- Each concept must be FUNDAMENTALLY different (different pattern, different through-line, different feel)
- Concepts must be VISUAL, not narrative. Describe what the viewer SEES, not what a narrator says.
- The through-line must be concrete and filmable, not abstract ("trust grows" is abstract; "scattered UI fragments assemble into a complete dashboard" is filmable)
- visualDevices are the SET LIST the storyboard builds from: each one names a THING with looks + behavior specific enough that a motion designer could build it without asking questions. Mood words ("luminous calm") are not devices.
- The emotional arc must use specific emotions, not "good -> better -> best"
- Output ONLY valid JSON. No commentary.`;

  var grammarDirective = "";
  if (opts.filmGrammar) {
    grammarDirective = `\n\nTHE CALLER HAS FIXED THE FILM GRAMMAR: "${opts.filmGrammar}". Commit to it -- output it as filmGrammar and shape every choice around its contract.`;
  } else if (opts.hasSpeaker) {
    grammarDirective = `\n\nA speaker recording IS attached to this project -- "speaker-screencast" is almost certainly the right filmGrammar.`;
  } else {
    grammarDirective = `\n\nNo speaker recording exists -- do NOT choose "speaker-screencast".`;
  }
  // Pinned look/sound: the caller's commitments are constraints the concepts
  // must be designed AROUND, not suggestions.
  const vsPins: string[] = [];
  if (opts.visualSystem?.world) vsPins.push(`world="${opts.visualSystem.world}"`);
  if (opts.visualSystem?.motion) vsPins.push(`motion="${opts.visualSystem.motion}"`);
  if (opts.visualSystem?.type) vsPins.push(`type="${opts.visualSystem.type}"`);
  if (opts.visualSystem?.motif) {
    vsPins.push(`motif=cutout (${opts.visualSystem.motif.density || "accent"}): the film threads a recurring family of illustrated sticker cutouts -- design the concept so the stickers are ${opts.visualSystem.motif.density === "lead" ? "the protagonists of every scene" : "a recurring garnish that lands on the film's key beats"}`);
  }
  if (vsPins.length) grammarDirective += `\n\nTHE CALLER HAS FIXED THE VISUAL SYSTEM: ${vsPins.join("; ")}. These are commitments -- echo them in visualSystem and design the concepts around them.`;
  if (opts.audioSystem?.music_mood) grammarDirective += `\n\nTHE CALLER HAS FIXED THE MUSIC MOOD: "${opts.audioSystem.music_mood}". Echo it in audioSystem.music_mood.`;

  var userPrompt = `Create a ${opts.format} for:
- ARTIFACT-DRIVEN BEATS: tell each step of a workflow through a mock of the SURFACE where it happens (a chat thread, an agent terminal, a video player, a records list) -- and always show the artifact BUILDING (typed, cascaded, counted, scrubbed), never pre-made. A story told through product surfaces reads as real; a story told through abstract cards reads as slides.\n\n${opts.prompt}${grammarDirective}`;

  // Build user message with optional reference images
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

  console.log("  [creative-director] Generating creative concepts...");

  var raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
    // 8192 truncated the treatment (esp. with a long recorded-narration prompt),
    // stalling the concept step in truncate-retry; match the storyboard builder's cap.
  ], { temperature: 0.9, maxTokens: 16000 });

  var result = parseJsonResponse(raw);

  if (!result.concepts || result.concepts.length === 0) {
    throw new Error("Concept director returned no concepts");
  }

  var selectedIndex = result.selected ?? 0;
  var selected = result.concepts[selectedIndex];

  console.log(`  [creative-director] Generated ${result.concepts.length} concepts, selected #${selectedIndex + 1}: "${selected.idea}"`);
  console.log(`  [creative-director] Pattern: ${selected.pattern}`);
  console.log(`  [creative-director] Through-line: ${selected.throughLine}`);

  return {
    concept: selected.idea,
    pattern: selected.pattern,
    throughLine: selected.throughLine,
    emotionalArc: selected.emotionalArc,
    visualStyle: selected.visualStyle || {
      colorMood: "brand-driven",
      typographyAttitude: "confident and clean",
      motionPersonality: "fluid and purposeful",
      spatialStrategy: "layered depth with focus pulls",
    },
    mediaPlan: typeof selected.mediaPlan === "string" ? selected.mediaPlan : undefined,
    visualDevices: Array.isArray(selected.visualDevices)
      ? selected.visualDevices.filter((d: unknown) => typeof d === "string" && (d as string).trim().length > 0)
      : undefined,
    directorNote: result.directorNote || `Concept: ${selected.idea}. Pattern: ${selected.pattern}. Through-line: ${selected.throughLine}.`,
    sceneCount: typeof result.sceneCount === "number" ? result.sceneCount : undefined,
    filmGrammar: resolveFilmGrammar(opts, result.filmGrammar),
    visualSystem: resolveVisualSystem(opts, result.visualSystem),
    audioSystem: resolveAudioSystem(opts, result.audioSystem),
  };
}

/** Pins win subfield-by-subfield; the director fills only what the caller
 *  left open. Invalid director values are dropped (enums are registries --
 *  a value without machinery behind it must not reach downstream). */
function resolveVisualSystem(opts: ConceptDirectorOpts, fromLLM: any): VisualSystem | undefined {
  const pick = <T extends string>(pin: T | undefined, raw: unknown, valid: readonly T[]): T | undefined =>
    pin ?? (typeof raw === "string" && (valid as readonly string[]).includes(raw) ? (raw as T) : undefined);
  const vs: VisualSystem = {
    world: pick(opts.visualSystem?.world, fromLLM?.world, ["light", "dark", "paper"] as const),
    motion: pick(opts.visualSystem?.motion, fromLLM?.motion, ["punchy", "calm", "cutout-physics"] as const),
    type: pick(opts.visualSystem?.type, fromLLM?.type, ["grotesk", "editorial-serif", "typewriter", "script"] as const),
    // Motif is PIN-ONLY for now: the director must not invent a motif the
    // brand kit has no assets for (the pipeline validates assets exist).
    motif: opts.visualSystem?.motif,
  };
  return vs.world || vs.motion || vs.type || vs.motif ? vs : undefined;
}

function resolveAudioSystem(opts: ConceptDirectorOpts, fromLLM: any): AudioSystem | undefined {
  const moods = ["driving", "jazzy", "ambient", "playful", "cinematic", "warm", "none"] as const;
  const mood = opts.audioSystem?.music_mood
    ?? (typeof fromLLM?.music_mood === "string" && (moods as readonly string[]).includes(fromLLM.music_mood)
      ? (fromLLM.music_mood as AudioSystem["music_mood"]) : undefined);
  const voice = opts.audioSystem?.voice;
  return mood || voice ? { music_mood: mood, voice } : undefined;
}

/** The caller's grammar always wins; otherwise validate the director's pick
 *  (with a text fallback for models that echo it in motionPersonality). */
function resolveFilmGrammar(opts: ConceptDirectorOpts, raw: unknown): FilmGrammar {
  if (opts.filmGrammar) return opts.filmGrammar;
  if (typeof raw === "string" && (FILM_GRAMMARS as string[]).includes(raw.trim())) {
    return raw.trim() as FilmGrammar;
  }
  return opts.hasSpeaker ? "speaker-screencast" : "launch-film";
}

/**
 * Format the creative bible as context for the storyboard builder.
 */
export function formatTreatmentForStoryboard(bible: Treatment): string {
  return `## Creative Direction (FOLLOW THIS -- every scene must serve this concept)

${bible.filmGrammar ? `**FILM GRAMMAR: ${bible.filmGrammar}** -- this contract governs cutting, narration, music, and assembly for the whole film; its named contract section in your instructions is ACTIVE.

` : ""}**THE CONCEPT:** ${bible.concept}

**Storytelling Pattern:** ${bible.pattern}
**Visual Through-Line:** ${bible.throughLine} -- this element must persist or evolve across scenes.
**Emotional Arc:** ${bible.emotionalArc}

**Visual Style Commitments:**
- Color mood: ${bible.visualStyle.colorMood}
- Typography attitude: ${bible.visualStyle.typographyAttitude}
- Motion personality: ${bible.visualStyle.motionPersonality}
- Spatial strategy: ${bible.visualStyle.spatialStrategy}${bible.visualSystem ? `
- VISUAL SYSTEM (committed): ${[
    bible.visualSystem.world ? `world=${bible.visualSystem.world}` : null,
    bible.visualSystem.motion ? `motion=${bible.visualSystem.motion}${bible.visualSystem.motion === "cutout-physics" ? " (elements move as rigid flat pieces: drop, settle, swing -- no glows, no morphs, no elastic scaling)" : bible.visualSystem.motion === "calm" ? " (settle, never bounce; entrances ease out and land; nothing overshoots or tilts)" : ""}` : null,
    bible.visualSystem.type ? `type=${bible.visualSystem.type}` : null,
  ].filter(Boolean).join("; ")}` : ""}${bible.visualSystem?.motif ? `
- MOTIF (committed, ${bible.visualSystem.motif.density || "accent"}): a recurring family of illustrated sticker cutouts threads the film. Cast them as sticker-prop components with kind="image" using EXACTLY these asset URLs (never invent others): ${(bible.visualSystem.motif.assets || []).join(", ")}. ${bible.visualSystem.motif.density === "lead" ? "The stickers ARE the film's visual protagonists -- every scene features at least one performing (drop-in, settle, swing)." : "Land a sticker on the film's key beats (roughly every 2-3 scenes) -- a recurring thread, not wallpaper."}` : ""}

${bible.mediaPlan ? `**Media Plan (follow it -- set broll_query / hero_image on the scenes it names):** ${bible.mediaPlan}

` : ""}${bible.visualDevices?.length ? `**Visual Devices (the film's SET LIST -- build scenes FROM these, reference them by name in visual notes, beats, and element inventories):**
${bible.visualDevices.map((d) => `- ${d}`).join("\n")}

` : ""}**Director's Note:** ${bible.directorNote}

IMPORTANT: Every scene in the storyboard must serve this ONE concept. Do not generate disconnected scene ideas. The visual through-line (${bible.throughLine}) should be present or referenced in most scenes. The emotional arc should progress across the scene sequence.`;
}

// ── Helpers ──

function buildBrandSummary(brandKit: BrandKit): string {
  var lines: string[] = ["## Brand Context"];
  if (brandKit.colors) {
    var colorNames = Object.entries(brandKit.colors)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    lines.push(`Colors: ${colorNames}`);
  }
  if (brandKit.fonts?.length) {
    lines.push(`Fonts: ${brandKit.fonts.map(f => f.family).join(", ")}`);
  }
  if (brandKit.style?.motion) {
    lines.push(`Website motion etiquette: ${brandKit.style.motion} (their SITE's hover/transition feel -- taste input only)`);
  }
  if (brandKit.guidelines) {
    lines.push(`\nBrand guidelines: ${brandKit.guidelines}`);
  }
  lines.push(
    `\nIMPORTANT -- these guidelines describe the brand's STATIC identity and its website's` +
    ` micro-interaction etiquette. You are directing a FILM. "Minimal"/"understated" website` +
    ` motion never means a slideshow of static cards: your motionPersonality must direct real` +
    ` cinematic motion (build, reveal, transform, choreography) executed with the brand's taste level.`,
  );
  return lines.join("\n");
}

function parseJsonResponse(raw: string): any {
  var trimmed = raw.trim();

  if (trimmed.startsWith("```")) {
    var firstNewline = trimmed.indexOf("\n");
    if (firstNewline > -1) trimmed = trimmed.substring(firstNewline + 1);
    var lastFence = trimmed.lastIndexOf("```");
    if (lastFence > -1) trimmed = trimmed.substring(0, lastFence);
    trimmed = trimmed.trim();
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    var first = trimmed.indexOf("{");
    var last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(trimmed.substring(first, last + 1));
    }
    throw new Error(`Invalid JSON from concept director: ${trimmed.substring(0, 300)}`);
  }
}
