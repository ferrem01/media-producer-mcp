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
export type FilmGrammar = "launch-film" | "tempo-cut" | "speaker-screencast";

export const FILM_GRAMMARS: FilmGrammar[] = ["launch-film", "tempo-cut", "speaker-screencast"];

export interface ConceptDirectorOpts {
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  referenceImages?: ReferenceImage[];
  /** Caller-fixed film grammar: the director must commit to it, not choose. */
  filmGrammar?: FilmGrammar;
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

Every film commits to exactly ONE grammar. It is not a mood -- it is the contract that decides who narrates, what earns a cut, the music's role, and how scenes are assembled. The three:

- "launch-film" (the default): few long WORLDS with 3-6 beats inside each, dark-forward cinematic look, density arcs, throws/stamps, crossfades earned at world changes. For brand films, launches, and emotional arcs that need breath.
- "tempo-cut": the HeyGen-explainer dialect. A driving music bed picked FIRST, 6-9 hard cuts in 30-45s each quantized to the track's bars, ONE thought per cut, on-screen type IS the voiceover (no narrator, no statement slides mid-film), evidence appears as DETAIL CUTS (one cropped element huge -- an isolated composer typing the ask -- not a whole miniaturized app), captions at display scale BESIDE windows, one brand accent, at most one gag (a prop-strike card). Scenes are assembled from the component kit, not custom codegen. For product explainers, connector demos, and launch clips that should feel fast, confident, music-driven. The story must be told through the REAL product surfaces (the library's product mocks), never through invented abstractions.
- "speaker-screencast": a human on camera owns the film. The speaker video is the base layer and THE CLOCK -- cuts and content entrances follow the speaker's sentences, overlays dock in a content region beside the speaker or take over with the speaker in PiP, the human voice narrates (no text-as-VO), music absent or ducked far under the voice. Only choose it when a speaker recording exists.

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
thought (2-5 bars), because in that grammar the cut itself is the rhythm instrument.

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
  "filmGrammar": "launch-film | tempo-cut | speaker-screencast",
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
  };
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
- Spatial strategy: ${bible.visualStyle.spatialStrategy}

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
