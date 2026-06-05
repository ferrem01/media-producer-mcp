/**
 * Cinematography Playbook
 *
 * Professional video pacing, rhythm, and composition rules.
 * Injected into the expander and unified planner to ensure every video
 * has cinematic structure -- not just good individual scenes, but a
 * coherent visual narrative.
 *
 * Inspired by: Apple keynotes, Stripe product videos, Linear changelogs,
 * professional motion graphics (School of Motion), and film editing theory.
 */

/**
 * Pacing and narrative arc rules for the expander.
 * The expander uses these to structure the creative brief.
 */
export const PACING_PLAYBOOK = `
## Cinematography: Pacing & Narrative Arcs

Professional videos follow predictable emotional arcs. The viewer should FEEL something
at each point. Don't just list features -- take them on a journey.

### The Heartbeat Pattern
Every great video alternates between HIGH and LOW intensity:

  HIGH → low → HIGH → low → HIGH → low → HIGHEST

- HIGH: Big statement, dramatic stat, product reveal, hero moment
- low: Breathing room, transition text, ambient visual, section divider
- HIGHEST: The CTA or final payoff. Peak emotional moment.

This creates RHYTHM. Without it, everything feels the same and nothing stands out.

### Pacing Arc Templates

#### Product Launch (5-8 scenes)
1. ★ HOOK: Bold claim or question that creates curiosity (4s)
2. ↓ PROBLEM: Quick pain point, relatable frustration (4s)
3. ★ REVEAL: "Introducing [Product]" -- the hero moment (5s)
4. ↓ FEATURES: 2-3 key capabilities, visual demos (5-6s each)
5. ★ PROOF: Impact stat or social proof (4s)
6. ↓ CTA: Clear next step (4s)
7. ★ OUTRO: Brand signoff (3s)

#### Feature Announcement (4-6 scenes)
1. ★ TEASER: "Something new" or mystery build-up (3s)
2. ★ REVEAL: The feature, shown in action (6s)
3. ↓ BENEFITS: What this means for the user, 2-3 points (5s)
4. ★ DEMO: Product frame showing the feature live (6s)
5. ↓ CTA: "Try it now" (4s)
6. ★ OUTRO: Brand signoff (3s)

#### Brand Story (6-8 scenes)
1. ★ HOOK: Provocative question or bold vision statement (4s)
2. ↓ CONTEXT: The world before your product (4s)
3. ★ MISSION: What you believe. Why this matters. (5s)
4. ↓ APPROACH: How you're different (5s)
5. ★ IMPACT: Stats, testimonials, proof of impact (5s)
6. ↓ VISION: Where you're going (4s)
7. ★ CTA: Join the mission (4s)
8. ★ OUTRO: Brand signoff (3s)

#### Explainer / How-It-Works (5-7 scenes)
1. ★ PROBLEM: The pain point, stated clearly (4s)
2. ↓ "WHAT IF": Imagine a better way (3s)
3. ★ SOLUTION: Introduce your approach (5s)
4. ↓ STEPS: How it works, 3-step walkthrough (6-8s)
5. ★ RESULTS: What users achieve (5s)
6. ↓ CTA: Get started (4s)
7. ★ OUTRO: Brand signoff (3s)

#### Case Study / Results (5-7 scenes)
1. ★ HOOK: "Here's what happened when [Company] used [Product]" (4s)
2. ↓ CHALLENGE: The problem they faced (4s)
3. ★ APPROACH: How they used the product (5s)
4. ★ RESULTS: Hero stat(s) -- the jaw-drop numbers (5s)
5. ↓ QUOTE: Customer testimonial (5s)
6. ★ CTA: "Get results like these" (4s)
7. ★ OUTRO: Brand signoff (3s)

#### Social Media / Short-Form (3-4 scenes)
1. ★ HOOK: Scroll-stopping first frame (3s)
2. ★ VALUE: The one thing you need to know (4s)
3. ★ PROOF: One stat or demo that validates (4s)
4. ★ CTA: Action step (3s)
- No breathing scenes. Every second counts. Punchy motion style.

### Duration Guidelines

| Content Type         | Per-Scene Duration | Total Video   |
|----------------------|-------------------|---------------|
| Title/intro          | 3-4s              |               |
| Key statement        | 4-5s              |               |
| Feature highlight    | 5-6s              |               |
| Product demo         | 6-8s              |               |
| Interactive demo     | 8-15s             |               |
| Stats/data           | 4-5s              |               |
| Breathing/divider    | 2-3s              |               |
| CTA                  | 4-5s              |               |
| Outro                | 3-5s              |               |
| **Short-form total** |                   | **12-20s**    |
| **Standard total**   |                   | **30-60s**    |
| **Deep dive total**  |                   | **60-120s**   |
`;

/**
 * Visual composition and rhythm rules for the planner.
 * Ensures variety, balance, and professional visual flow.
 */
export const COMPOSITION_PLAYBOOK = `
## Cinematography: Visual Composition & Rhythm

### The Golden Rules of Visual Rhythm

1. **Never repeat the same composition twice in a row.**
   If Scene 2 has text-left + visual-right, Scene 3 MUST use a different layout.
   Bad: Feature spotlight → Feature spotlight → Feature spotlight
   Good: Feature spotlight → Hero stat → Bento grid → Product frame

2. **Alternate between dense and sparse.**
   Dense scene (bento grid, 6 items) → Sparse scene (single stat, center)
   This creates BREATHING ROOM. The eye needs rest.

3. **Vary the focal point position.**
   Scene 1: Center focal point
   Scene 2: Left-heavy composition
   Scene 3: Center or right-heavy
   Scene 4: Full-bleed (no single focal point)
   Don't anchor the viewer's eye in the same spot for three scenes.

4. **The 3-Scene Rule for transitions.**
   Don't use the same transition type more than 2x in a row.
   Good: crossfade → slide-up → crossfade → wipe-left → blur-crossfade
   Bad: crossfade → crossfade → crossfade → crossfade

5. **Text density arc: start low, peak in the middle, end low.**
   Opening: 3-5 words
   Content scenes: 8-15 words
   Data scenes: 5-10 words
   Breathing: 0-4 words
   CTA: 5-8 words
   Outro: 0-3 words

### Composition Patterns

#### Center Stage
- Content centered both horizontally and vertically
- Maximum 60% of canvas width used
- Generous negative space on all sides
- Best for: Hero stats, statements, brand moments
- Creates: Focus, drama, importance

#### Split Canvas
- Two zones: left (40-45%) and right (45-50%), with gap
- One zone has text, the other has a visual
- Text zone: left-aligned, vertically centered
- Visual zone: product frame, image, chart
- Best for: Feature spotlights, comparisons
- Creates: Balance, relationship between idea and proof

#### Full Bleed
- Content fills the entire canvas
- Grid or card layout that uses all available space
- Minimal padding (40-60px)
- Best for: Bento grids, dashboards, multi-stat displays
- Creates: Richness, comprehensiveness, "there's a lot here"

#### Vertical Stack
- Content stacked vertically, centered horizontally
- Clear hierarchy: headline → visual → caption
- Max-width 70% for text, visual can be wider
- Best for: Step sequences, timeline, process flows
- Creates: Logical flow, orderly progression

#### Asymmetric Drama
- One element is dramatically larger than everything else
- 160px stat with 14px label. Full-width image with tiny caption.
- The size contrast IS the design
- Best for: Hero stats, key messages, product hero shots
- Creates: Impact, hierarchy, the "wow" moment

### Color & Mood Progression

For videos with 5+ scenes, the color mood should subtly evolve:

- **Opening**: Brand primary + dark background. Serious, grounded.
- **Content**: Brand primary/secondary mix. Engaging, informative.
- **Data/proof**: Accent color prominence. Confident, energetic.
- **Breathing**: Return to primary/dark. Reset, calm.
- **CTA**: Accent color strong. Warm, inviting, action-oriented.
- **Outro**: Brand primary only. Clean, professional.

Don't make every scene the same color palette. Subtle shifts in gradient direction, color emphasis, and brightness create a subconscious sense of progression.

### Motion Intensity Curve

Match animation intensity to the content:

| Scene Type     | Motion Level | Easing                     | Entrance Speed |
|----------------|-------------|----------------------------|----------------|
| Opening        | High        | back.out(1.2), spring      | 0.8-1.0s       |
| Content        | Medium      | power3.out                 | 0.5-0.7s       |
| Data/Stats     | High        | power2.out (counters)      | 0.6-0.8s       |
| Demo           | Low-Medium  | power2.out                 | 0.5-0.6s       |
| Breathing      | Low         | power2.out, sine.inOut     | 0.8-1.2s       |
| CTA            | Medium-High | back.out(1.1)              | 0.5-0.7s       |
| Outro          | Low         | power2.out                 | 0.6-0.8s       |

Fast motion = energy, excitement. Slow motion = elegance, weight.
The CTA should feel slightly more energetic than the scene before it.

### Transition Strategy

Transitions are not decorative -- they're SEMANTIC. They signal relationships:

| Transition      | Meaning                        | Use When                           |
|-----------------|--------------------------------|------------------------------------|
| crossfade       | Continuation, flow             | Default. Same topic, smooth flow   |
| blur-crossfade  | Shift in focus/mood            | Moving to a different mood/section |
| slide-up        | Progression, "next"            | Moving forward in a sequence       |
| slide-down      | Regression, "before"           | Flashback or "the old way"         |
| wipe-left       | New chapter, energy            | Section change, topic shift        |
| wipe-right      | Return, callback               | Coming back to a previous idea     |
| iris            | Spotlight, focus               | Zooming into a detail or feature   |
| zoom-through    | Deep dive, "let's look closer" | Into a product demo or detail      |
| glitch-cut      | Disruption, technology         | Tech products, bold statements     |
| morph-wipe      | Transformation                 | Before/after, evolution            |
| none            | Hard cut, impact               | After breathing scene, for punch   |

### Exit Animation Rules

Every scene MUST have exit animations. Elements don't just disappear -- they leave gracefully.

Standard exit pattern (starts at duration - 0.7s):
- Text: fade up (y: -15) + autoAlpha: 0, 0.5s, power2.in
- Cards/frames: scale to 0.98 + autoAlpha: 0, 0.5s, power2.in
- Stats: fade out without movement (hold position), 0.4s
- Stagger: 0.04s between elements

Exception: If the next scene uses a dramatic transition (zoom-through, iris, glitch-cut), the exit can be shorter (0.3s) or skipped.
`;

/**
 * Premium quality checklist for the critiquer.
 * This is what separates "acceptable" from "Apple quality."
 */
export const PREMIUM_QUALITY_CHECKLIST = `
## Premium Quality Checklist (Pass 2: "Does It Feel Expensive?")

This checklist evaluates whether a scene feels like it was produced by a top-tier agency.
Score 1-10. A scene must score 7+ on EVERY item to be considered premium.

### 1. Visual Weight & Hierarchy (does the eye know where to go?)
- [ ] There is ONE clear focal point that demands attention first
- [ ] Secondary elements are noticeably smaller/lighter/more muted
- [ ] Nothing competes with the focal point for attention
- [ ] The layout has intentional asymmetry or dramatic size contrast
- Score 1-3: Everything is the same size/weight (flat, corporate)
- Score 4-6: Hierarchy exists but focal point isn't dramatic enough
- Score 7-10: One element dominates, creates visual drama

### 2. Negative Space (is there room to breathe?)
- [ ] At least 30% of the canvas is empty/background
- [ ] Content doesn't feel crammed or tight
- [ ] The most important element has generous space around it
- [ ] Padding from edges is at least 60px, feels like 80-100px
- Score 1-3: Content fills the canvas wall-to-wall (cheap, cluttered)
- Score 4-6: Some space but still feels a bit tight
- Score 7-10: Generous, intentional white space. Feels expensive.

### 3. Typography Craft (does the text feel designed, not just typed?)
- [ ] Headlines use tight letter-spacing (-0.02 to -0.03em)
- [ ] Font weight contrast: bold headlines (700-800) + light body (400)
- [ ] Size contrast: at least 3x difference between largest and smallest text
- [ ] Line height is tight on headlines (1.0-1.1) and relaxed on body (1.4-1.6)
- [ ] Text color uses the full spectrum: bright white for headlines, muted for secondary
- Score 1-3: Generic, default typography. Looks like a Google Doc.
- Score 4-6: Decent hierarchy but lacks craft (all same weight, generic sizing)
- Score 7-10: Typography feels sculpted, intentional, magazine-quality

### 4. Color Depth (is the background alive?)
- [ ] Background uses gradients, not flat solid colors
- [ ] Multiple color layers create depth (gradient + subtle mesh/orbs)
- [ ] Colors come from the brand kit (not random)
- [ ] There's a subtle shift in color/lighting across the scene
- Score 1-3: Flat solid color background (PowerPoint)
- Score 4-6: Single gradient, basic
- Score 7-10: Rich, layered, atmospheric. Feels like a 3D environment.

### 5. Motion Craft (do animations feel intentional?)
- [ ] Entrance animations use proper easing (power3.out, back.out), never linear
- [ ] Elements stagger in with consistent, natural timing (0.03-0.08s gaps)
- [ ] There's a clear animation sequence: element 1 → 2 → 3
- [ ] Exit animations exist and feel smooth
- [ ] At least one "signature" motion: SplitText, counter, DrawSVG, or spring
- Score 1-3: Everything fades in at once (amateur)
- Score 4-6: Basic stagger, but mechanical/uniform feeling
- Score 7-10: Animation feels choreographed, like a dance. Each element has its moment.

### 6. Detail & Polish (the "last 10%" that separates good from great)
- [ ] Glass morphism or subtle material effects on cards (blur, subtle borders)
- [ ] Subtle shadows that create depth (not harsh drop shadows)
- [ ] Icons are SVGs, not emoji (emoji = instant cheap feeling)
- [ ] Numbers use tabular-nums for alignment
- [ ] Small text uses letter-spacing (0.08-0.14em) and uppercase for labels
- Score 1-3: No details. Raw, unfinished.
- Score 4-6: Some polish but missing refinement
- Score 7-10: Every detail is considered. Feels finished, complete.

### 7. Emotional Impact (does this make you feel something?)
- [ ] The scene has a clear mood (dramatic, confident, warm, urgent)
- [ ] Visual elements reinforce the mood (dark = serious, bright accent = energy)
- [ ] The animation timing matches the mood (slow = weight, fast = energy)
- [ ] You'd pause if you saw this while scrolling social media
- Score 1-3: Emotionally flat. Just information on screen.
- Score 4-6: Some mood but not distinctive
- Score 7-10: Clear emotional tone. This scene has a VIBE.

### Scoring
- 49-70 total: Premium quality. Ship it.
- 35-48: Good but needs polish. One more revision.
- Below 35: Significant quality gap. Needs major revision.
`;

/**
 * Full-video editorial critique for multi-scene flow.
 * Used in pass 3 after all scenes are generated.
 */
export const EDITORIAL_CRITIQUE = `
## Editorial Critique: Full Video Flow (Pass 3)

Evaluate the video as a WHOLE, not individual scenes. This is about pacing, variety, narrative arc, and coherence.

### 1. Pacing Arc
- Does the video follow a clear emotional arc? (Hook → Build → Peak → Resolve)
- Is there a discernible "heartbeat" pattern? (High-low-high-low)
- Or does it feel flat -- same energy throughout?
- Is any section too long without a change in intensity?
- FAIL if: 3+ scenes in a row at the same energy level

### 2. Visual Variety
- Are at least 3 different composition patterns used? (center, split, full-bleed, etc.)
- Is there a mix of text-heavy and visual-heavy scenes?
- Do transitions vary? (not all crossfade)
- FAIL if: same layout used more than 2x in a row
- FAIL if: same transition used more than 3x in a row

### 3. Content Density Arc
- Do early scenes have LESS text (3-5 words) and later content scenes have more?
- Is there a breathing scene where text density drops after a dense section?
- FAIL if: every scene has 10+ words (exhausting)
- FAIL if: text density is identical across all scenes

### 4. Narrative Coherence
- Does each scene logically follow the previous one?
- Is there a clear beginning, middle, and end?
- Does the video build toward something? (not just a random list of features)
- Would a viewer know what to do after watching? (clear CTA)

### 5. Brand Consistency
- Same color palette used throughout (with subtle evolution, not random changes)
- Same typography style (same font weights, similar sizing approach)
- Logo present where brand guidelines require it
- Motion style is consistent (all cinematic, or all punchy -- not mixed randomly)

### 6. Duration Balance
- Is any one scene disproportionately long? (>30% of total duration = problem)
- Are breathing/transition scenes appropriately short (2-3s)?
- Is the total duration appropriate for the content? (not padding, not rushing)

### Output
For each issue found, suggest a specific fix:
- "swap_scenes": reorder scenes for better flow
- "add_breathing": insert a breathing scene between two dense scenes
- "shorten_scene": reduce a scene that's too long
- "vary_layout": change a scene's composition to avoid repetition
- "vary_transition": change a transition type
- "adjust_energy": make a scene more/less dramatic to fix the pacing arc
`;
