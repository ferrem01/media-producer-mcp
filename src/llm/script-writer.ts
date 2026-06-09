/**
 * Script Writer
 *
 * Takes a ProjectBrief and produces a ProjectPlan: narrative arc,
 * scene-by-scene script with voiceover text, recipe selections,
 * and audio direction.
 *
 * This is the "what to say" step. The unified planner (downstream)
 * handles "how it looks" -- generating actual component HTML.
 */

import type { LLMConfig } from "./client.js";
import { callLLM } from "./client.js";
import type {
  ProjectBrief,
  ProjectPlan,
  PlannedScene,
  BrandKit,
} from "../core/types.js";

export interface ScriptWriterOptions {
  brief: ProjectBrief;
  llmConfig: LLMConfig;
  brandKit?: BrandKit | null;
  /** Accumulated feedback for revisions */
  feedback?: string;
  /** Previous revision notes to carry forward */
  previousRevisionNotes?: string[];
}

const RECIPE_CATALOG = `
## Available Scene Recipes

### OPENING
- O1 "The Big Statement" -- One powerful headline. Apple WWDC title card energy.
- O2 "Logo Into Statement" -- Brand intro video plays, then transitions to hook. TWO-SCENE recipe.
- O3 "The Provocation" -- Question, challenge, or bold claim. TED talk opening.
- O4 "Split Reveal" -- Introducing a duality: before/after, problem/solution.

### CONTENT
- C1 "Feature Spotlight" -- Single feature or capability. Text left, visual right.
- C2 "Bento Overview" -- 3-6 capabilities at a glance. Apple bento grid.
- C3 "The Walkthrough" -- Step-by-step process, how-it-works. 3-4 steps.
- C4 "Quote / Testimonial" -- Social proof, customer quote. Elegant and credible.
- C5 "Side-by-Side Comparison" -- Comparing two approaches. The winner is obvious.
- C6 "Icon Feature Grid" -- 4-6 short feature callouts with icons. Quick hits.

### DATA
- D1 "Hero Stat" -- One massive number. The jaw-drop moment.
- D2 "Stats Trio" -- 3 related metrics that tell a story together.
- D3 "Chart Moment" -- Growth story, trend visualization.
- D4 "Metric Dashboard" -- Multiple metrics in a dashboard layout.

### DEMO
- P1 "Product Frame" -- Product UI in a browser/device frame. The hero product shot.
- P2 "Interactive Demo" -- Showing a workflow with cursor movement, typing, clicking.
- P3 "Code Showcase" -- Code, API, CLI output. Developer-focused.
- P4 "Picture-in-Picture" -- Main product view with zoomed detail inset.

### BREATHING
- B1 "Visual Pause" -- Minimal text, atmospheric. Resets the palate.
- B2 "Section Divider" -- Clear topic change. Chapter card energy.
- B3 "Ambient Mood" -- Pure visual, no text. Only for 6+ scene videos.

### CLOSING
- E1 "Call to Action" -- Final sell. Clean, direct, confident.
- E2 "Summary Stats" -- Reinforcing key numbers before closing.
- E3 "Logo Outro" -- Brand signoff. Last frame.
- E4 "The Callback" -- Ending by referencing the opening. Narrative closure.

### INDUSTRY-SPECIFIC
- I-SAAS1 "Integration Ecosystem" -- Product logo with partner logos radiating outward.
- I-SAAS2 "Workflow Automation" -- Multi-step automated process with "magic" step.
- I-SAAS3 "Pricing Tiers" -- Plan comparison cards.
- I-ECOM1 "Product Showcase" -- Hero product shot, premium feel.
- I-ECOM2 "Social Proof Wall" -- Review grid with star ratings.
- I-FIN1 "Security & Compliance" -- Trust badges (SOC2, HIPAA, GDPR).
- I-FIN2 "ROI Calculator" -- Financial impact metrics.
- I-HEALTH1 "Patient Journey" -- Warm-toned care pathway timeline.
- I-RE1 "Property Showcase" -- Property photo with specs overlay.
`;

const NARRATIVE_ARCS: Record<string, string> = {
  product_launch: `Product Launch arc: Hook (pain point or bold claim) -> Reveal (the product) -> Features (2-3 key capabilities) -> Proof (stats, testimonials) -> CTA. Tone shifts from tension to excitement.`,
  feature_announcement: `Feature Announcement arc: Context (what exists) -> The New Thing (feature reveal) -> How It Works (demo/walkthrough) -> Impact (stats/quote) -> CTA. Shorter, more focused than a full launch.`,
  customer_story: `Customer Story arc: The Customer (who they are) -> The Challenge (what they faced) -> The Solution (how your product helped) -> The Results (metrics, quote) -> CTA. Lead with empathy, end with proof.`,
  how_to: `How-To arc: The Goal (what the viewer will accomplish) -> Step-by-Step (3-4 clear steps) -> Result (what it looks like when done) -> CTA. Educational, clear, practical. Show the product in action.`,
  promo: `Promo arc: Hook (attention-grabber) -> Value Props (2-3 key benefits) -> Social Proof (stats or testimonial) -> Urgency/Offer (limited time, special deal) -> CTA. Fast-paced, high energy.`,
  explainer: `Explainer arc: The Problem (why this matters) -> The Solution (how it works, simplified) -> Key Benefits (2-3) -> Proof (credibility) -> CTA. Clear, accessible, no jargon.`,
  case_study: `Case Study arc: The Company (context) -> The Challenge (specific problem with data) -> The Approach (how they used the product) -> The Results (hard metrics, before/after) -> Quote (customer in their own words) -> CTA. Data-heavy, credibility-focused.`,
  brand: `Brand arc: Identity (who we are) -> Mission (what we believe) -> Impact (what we've done) -> Vision (where we're going) -> CTA. Emotional, aspirational, purpose-driven.`,
};

function buildSystemPrompt(brief: ProjectBrief, brandKit?: BrandKit | null, feedback?: string): string {
  const videoType = brief.video_type || "explainer";
  const arc = NARRATIVE_ARCS[videoType] || NARRATIVE_ARCS.explainer;
  const targetDuration = brief.target_duration || 45;

  // Estimate scene count from duration
  const avgSceneDuration = 5.5; // seconds
  const estimatedScenes = Math.max(3, Math.min(10, Math.round(targetDuration / avgSceneDuration)));

  let prompt = `You are a video script writer and creative director for marketing videos.

## Your Job
Write a scene-by-scene script for a ${targetDuration}-second marketing video (approximately ${estimatedScenes} scenes).
Pick the right recipe for each scene from the catalog below.
Write voiceover text that fits within each scene's duration (150 words per minute -- a 5s scene fits ~12 words, a 7s scene fits ~17 words).
Describe what each scene should look like visually.

## Narrative Arc
${arc}

## Rules
- Every word of voiceover must come from the caller's messaging/context. Do NOT invent marketing claims, product features, or statistics the caller didn't provide.
- Hook the viewer in the first 3 seconds.
- One idea per scene. Never cram multiple concepts into one scene.
- Vary the energy: alternate between text-heavy and visual scenes.
- Include at least one DATA recipe for credibility (if proof points are provided).
- Always end with a clear CTA and (if brand outro exists) a logo outro.
- Never use the same recipe twice in a row.
- Voiceover text must be concise. Punchy sentences. No filler words.
- Skip voiceover for brand intro/outro video scenes and breathing pauses.
- Total duration should be within 10% of the target (${targetDuration}s).

${RECIPE_CATALOG}
`;

  // Add brand context
  if (brandKit) {
    const intros = brandKit.assets?.filter(a => a.type === "intro") || [];
    const outros = brandKit.assets?.filter(a => a.type === "outro") || [];

    if (intros.length > 0) {
      prompt += `\n## Brand Intro\nA brand intro video exists ("${intros[0].name}", ${intros[0].duration || 5}s). Use it as the first scene when appropriate (recipe O2).\n`;
    }
    if (outros.length > 0) {
      prompt += `\n## Brand Outro\nA brand outro video exists ("${outros[0].name}", ${outros[0].duration || 5}s). Use it as the last scene (recipe E3).\n`;
    }
    if (brandKit.voice) {
      prompt += `\n## Brand Voice\nPreferred TTS voice: ${brandKit.voice}\n`;
    }
  }

  // Add style references
  if (brief.style_references?.length) {
    prompt += `\n## Style References\nThe caller likes the style of these videos:\n`;
    for (const ref of brief.style_references) {
      prompt += `- ${ref.url}${ref.note ? ` (${ref.note})` : ""}\n`;
    }
  }

  // Add exclusions
  if (brief.do_not_include?.length) {
    prompt += `\n## Do NOT Include\n`;
    for (const item of brief.do_not_include) {
      prompt += `- ${item}\n`;
    }
  }

  // Add feedback for revisions
  if (feedback) {
    prompt += `\n## Revision Notes\nThe previous plan received this feedback. Incorporate it into a revised plan:\n${feedback}\n`;
  }

  prompt += `
## Output Format
Return ONLY valid JSON matching this structure:
{
  "narrative": "One-paragraph summary of the narrative arc",
  "estimated_duration": <total seconds>,
  "audio": {
    "music_mood": "<mood: corporate | upbeat | calm | electronic | inspiring | cinematic>",
    "voice": "<tts voice: alloy | echo | fable | onyx | nova | shimmer>",
    "pacing": "<slow | moderate | fast>"
  },
  "scenes": [
    {
      "label": "Scene title",
      "purpose": "What this scene communicates and why",
      "recipe": "recipe-id (e.g. O1, C1, D1, P1, E1)",
      "voiceover_text": "The exact narration text (or null for no voiceover)",
      "duration_seconds": <number>,
      "visual_notes": "What this scene looks like -- layout, mood, key visual elements"
    }
  ]
}
`;

  return prompt;
}

function buildUserPrompt(brief: ProjectBrief): string {
  let prompt = `## Brief\n${brief.prompt}\n`;

  if (brief.context) {
    const ctx = brief.context;
    if (ctx.messaging) prompt += `\n## Messaging & Positioning\n${ctx.messaging}\n`;
    if (ctx.audience) prompt += `\n## Target Audience\n${ctx.audience}\n`;
    if (ctx.key_points?.length) {
      prompt += `\n## Key Points to Cover\n`;
      for (const p of ctx.key_points) prompt += `- ${p}\n`;
    }
    if (ctx.proof_points?.length) {
      prompt += `\n## Proof Points\n`;
      for (const p of ctx.proof_points) prompt += `- ${p}\n`;
    }
    if (ctx.tone) prompt += `\n## Tone\n${ctx.tone}\n`;
    if (ctx.industry) prompt += `\n## Industry\n${ctx.industry}\n`;
  }

  if (brief.available_assets?.length) {
    prompt += `\n## Available Assets\nThe caller has these assets ready to use:\n`;
    for (const a of brief.available_assets) {
      prompt += `- ${a.type}: ${a.description}\n`;
    }
  }

  return prompt;
}

/**
 * Write a script from a brief. Returns a ProjectPlan (without asset analysis -- that's a separate step).
 */
export async function writeScript(opts: ScriptWriterOptions): Promise<ProjectPlan> {
  const systemPrompt = buildSystemPrompt(opts.brief, opts.brandKit, opts.feedback);
  const userPrompt = buildUserPrompt(opts.brief);

  const raw = await callLLM(opts.llmConfig, [
    { role: "user", content: userPrompt },
  ], {
    systemPrompt,
    maxTokens: 4096,
    temperature: 0.7,
  });

  // Parse JSON from response (handle markdown code fences)
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Script writer returned invalid JSON: ${(e as Error).message}\n\nRaw output:\n${raw.substring(0, 500)}`);
  }

  // Build the plan (without assets -- asset analyzer adds those)
  const scenes: PlannedScene[] = (parsed.scenes || []).map((s: any) => ({
    label: s.label || "Untitled",
    purpose: s.purpose || "",
    recipe: s.recipe || "C1",
    voiceover_text: s.voiceover_text || undefined,
    duration_seconds: s.duration_seconds || 5,
    assets: [], // Asset analyzer fills this in
    visual_notes: s.visual_notes || "",
  }));

  const plan: ProjectPlan = {
    narrative: parsed.narrative || "",
    scenes,
    audio: {
      music_mood: parsed.audio?.music_mood || "corporate",
      voice: parsed.audio?.voice || opts.brandKit?.voice || "nova",
      pacing: parsed.audio?.pacing || "moderate",
    },
    estimated_duration: parsed.estimated_duration || scenes.reduce((sum: number, s: PlannedScene) => sum + s.duration_seconds, 0),
    revision_notes: opts.previousRevisionNotes
      ? [...opts.previousRevisionNotes, ...(opts.feedback ? [opts.feedback] : [])]
      : opts.feedback ? [opts.feedback] : undefined,
  };

  console.log(`  Script writer: ${plan.scenes.length} scenes, ~${plan.estimated_duration}s, mood=${plan.audio.music_mood}`);

  return plan;
}
