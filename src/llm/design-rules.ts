/**
 * Visual Design Rules
 *
 * Ported from video-producer-mcp's skills/codegen/ directory.
 * Injected into component generator and storyboard builder prompts
 * to prevent overflow, contrast, and spacing issues.
 */

/**
 * Rules for the component generator (how to write CSS/HTML).
 */
export const COMPONENT_DESIGN_RULES = `
## CRITICAL Visual Design Rules

### Canvas Constraints
- The canvas is EXACTLY 1920x1080 pixels. Every component MUST fit within this.
- Use overflow: hidden on the root element.
- Never use absolute pixel positions near the edges without accounting for padding.
- Always test your mental model: will this text fit at 1920px wide with the padding?

### Typography Safety
- Title text: 64-100px for headlines. Single words or key stats can go bigger (120-160px) for cinematic impact.
- Subtitle text: 22-32px. Use lighter weight (400) for contrast with bold headlines.
- Body text: 16-22px.
- Labels/badges: 12-16px.
- Line height: 1.1-1.2 for headlines, 1.4-1.6 for body text.
- ALWAYS set max-width on text containers (80% for titles, 70% for subtitles, 60% for body).
- Long text MUST use text-overflow: ellipsis or be clamped with -webkit-line-clamp.

### Spacing & Padding
- Minimum padding from canvas edge: 60px on all sides.
- Component internal padding: 32-48px.
- Gap between elements: 16-32px.
- Never place content in the outer 60px border of the canvas.
- Use percentage-based widths (max-width: 80%) over fixed pixel widths.

### Color & Contrast (FOLLOW THE BRAND -- never default to dark)
- MATCH THE BRAND THEME. Use var(--mp-color-background) as the page/scene background and var(--mp-color-text) for text. A light brand (light background) renders LIGHT (dark text on the light brand background); a dark brand renders dark. NEVER hardcode #0f172a / #ffffff -- always use the brand variables.
- NEVER INVERT THE BRAND: do not use the brand's dark text/ink color as the background to force a dark look. A white-background brand must render on its light background.
- Ensure contrast either way: never white text on a light background, never dark text on a dark background.
- On LIGHT backgrounds, cards need a solid surface (var(--mp-color-surface)) or a 1px border + soft shadow to be visible (glassmorphism only works on dark).
- A dark theme is only correct when the brand itself is dark, or no brand is provided (the fallback).

### Overflow Prevention
- Root element: overflow: hidden; width: 100%; height: 100%.
- Text containers: overflow: hidden; text-overflow: ellipsis.
- Lists/grids: if items might exceed the canvas, limit visible count.
- Never render more than 6-8 items in a visible list without scrolling (which we can't do in video).
- For multi-line text, use -webkit-line-clamp to limit visible lines.

### Flexbox/Grid Safety
- Always set min-height: 0 on flex children to prevent overflow.
- Use flex-shrink: 1 on text containers so they shrink if needed.
- Grid items: use minmax(0, 1fr) not just 1fr to prevent overflow.
`;

/**
 * Rules for the storyboard builder (what data to pass to components).
 */
export const SCENE_STORYBOARD_DESIGN_RULES = `
## Visual Design Rules for Scene Storyboarding

### Content Length
- Title text: max 5-8 words. "Quotient x Canva Integration" not "Quotient and Canva have partnered to create a seamless integration for marketing teams."
- Subtitle: max 10-15 words. One sentence.
- Badge/eyebrow: max 2-3 words. "NEW FEATURE" not "EXCITING NEW FEATURE ANNOUNCEMENT"
- List items: max 5-8 items per scene. 4-6 words per item.
- If content is longer, split across multiple scenes.

### Layout Rules
- Max 3-4 components per scene. Don't overstuff.
- Every scene needs a background component (gradient-background or mesh-gradient) at z_index: 0.
- Main content at z_index: 10. Effects/overlays at z_index: 100.
- Position: most components should use the default full-canvas positioning.
  Only override position when explicitly layering (e.g. a logo in a corner).

### Component-Specific Data Rules
- split-screen: left_content and right_content should be 1-3 words each ("Design" / "Code").
  NOT HTML. NOT paragraphs.
- browser-frame: content_html should be minimal clean HTML. Keep it simple.
  Use dark backgrounds (#0f172a) with light text (#fff) for contrast.
- grid-layout: max 6 items. Keep titles under 3 words, descriptions under 8 words.
- text-list: max 5-6 items, each under 8 words.
- stat-card: one number, one label. "340%" + "ROI Increase". Not a paragraph.
- stat-card values: use human-readable short numbers. "50K" not 50000, "2.5M" not 2500000. Use suffix for units ("K+", "%", "M"). value should be a small number (50, 340, 2.5) with the scale in the suffix.
- When positioning multiple stat cards: center them on the canvas. For 2 cards use x=400 and x=1100 (centered pair). For 3 cards use x=200, x=760, x=1320. Always y=300-500 range.
- code-block: max 8-10 lines of code. Short, readable snippets.
- terminal: max 3 command/output pairs.

### Color/Theme (FOLLOW THE BRAND -- do NOT default to dark)
- The scene theme MUST follow the brand. Use the brand's background color as the main scene background and the brand's text color for text (the Brand context states whether the brand is LIGHT or DARK, and the values are var(--mp-color-background) / var(--mp-color-text)). A LIGHT brand -> light scenes; a DARK brand -> dark scenes.
- NEVER INVERT THE BRAND. Do NOT take a dark brand color (e.g. the brand's text/ink color like #17171c) and use it as the scene background to force a dark theme. A white-background brand renders on its light background, not a dark one. This is the #1 "looks like generic AI" giveaway -- avoid it.
- Light backgrounds are fully allowed and expected for light brands. On light backgrounds: dark text, and cards with a solid surface or a 1px border + soft shadow so they're visible. On dark backgrounds: light text, subtle glass cards.
- A dark theme is correct only when the brand is dark, the prompt explicitly asks for dark, or no brand is provided (fallback).

### Transitions
- Only use valid types: crossfade, wipe-left, wipe-right, slide-up, slide-down, iris, none.
- Default to crossfade (0.5s) between most scenes.
- Use variety: don't use the same transition for every scene.

### Duration
- Title/intro scenes: 3-4s
- Content scenes: 4-6s
- Complex scenes (terminal, code, demo): 5-8s
- Interactive/scripted scenes (chat simulator, product demos): 8-15s
- CTA/outro: 3-4s

### Interactive Mockups (Script System)
- When the prompt asks for a product demo, UI walkthrough, or interactive mockup, the component should use the script system.
- Include a "script" array and "cursor_targets" in the component data.
- The storyboard builder should flag these as needing custom components with script support.
- Give scripted scenes longer durations (8-15s) to allow for cursor movement and typing.
- Examples of scripted scenes: chat interfaces, form fill demos, dashboard interactions, app walkthroughs.

### Video vs Presentation Styles
These are DIFFERENT visual languages. Do NOT mix them.

**Video scenes should feel CINEMATIC, not like PowerPoint slides:**
- One visual concept per scene. Not a slide full of bullets.
- Rich, layered backgrounds (mesh-gradient + film-polish). Never flat solid colors.
- Use kinetic-text, typewriter, stat-card for text -- not static text blocks.
- Text should animate in/out, not just appear.
- Prefer visual components (browser-frame, device-mockup, bar-chart) over text-list.
- Less text, more visual impact. If a scene has more than 15 words visible at once, it's a PowerPoint slide, not a video scene.
- Think Apple keynote, not corporate presentation.

**Presentation scenes should be INFORMATION-DENSE and readable:**
- Clear headers, structured content, readable text.
- Static layouts with clean typography.
- Text-list and grid-layout are appropriate here.
- More text is acceptable -- each slide is meant to be read.
- Minimal animation (elements appear, but no dramatic entrances).
`;

/**
 * Rules for the critiquer (how to evaluate rendered output).
 */
export const CRITIQUER_DESIGN_RULES = `
## Visual Quality Checklist

Score each scene against these criteria:

### Layout & Spacing
- Content has at least 60px padding from canvas edges
- Elements are not overlapping unintentionally
- Text is not cut off or overflowing
- Visual hierarchy is clear (what should I look at first?)
- Components are balanced, not crammed to one side

### Typography
- All text is readable at 1920x1080
- Title text is 48-88px
- Body text is at least 16px
- Text has sufficient contrast against its background (white on dark, dark on light)
- No white text on light backgrounds or dark text on dark backgrounds
- Text doesn't extend beyond 80% of canvas width

### Color & Contrast
- Background has depth (gradient or mesh, not flat solid color)
- Text color contrasts with background (WCAG AA minimum)
- Brand colors are used consistently
- No jarring color combinations

### Card & Container Visibility (CRITICAL -- #1 missed issue)
- Cards, panels, and containers MUST be clearly distinguishable from the canvas background
- A card with rgba(255,255,255,0.05) on a light (#f8fafc) background is INVISIBLE. Score <= 5.
- A card with rgba(255,255,255,0.03) on ANY background lighter than #333 is INVISIBLE. Score <= 5.
- Glassmorphism/frosted-glass cards ONLY work on dark backgrounds (background luminance < 30%)
- On light backgrounds, cards need: solid background (var(--mp-color-surface)), visible border (1px solid rgba(0,0,0,0.1)), or box-shadow
- If you cannot clearly see where a card STARTS and the background ENDS, the card is invisible. Flag it.
- Semi-transparent overlays on cards must have enough opacity to create a visible boundary (minimum rgba(0,0,0,0.08) on light bg or rgba(255,255,255,0.08) on dark bg)
- Text INSIDE invisible cards inherits the contrast problem -- if the card is invisible, the text on it is unreadable

### Animation Quality
- Elements animate in smoothly (not instant pop)
- Stagger timing feels natural (not too fast, not too slow)
- Exit animations happen before the scene cuts
- No elements stuck in invisible state when they should be visible
- Motion style matches the intended mood (cinematic = smooth, punchy = snappy)

### Content Appropriateness
- Content matches the prompt intent
- Not too much text for a video scene (max 15 words visible at once)
- Data visualizations have readable labels
- Lists have reasonable item count (max 6)

### Production Polish
- Film-polish or similar effect for cinematic scenes
- Consistent visual style across all scenes
- Professional feel (not a wireframe or placeholder)
`;


/**
 * Premium design philosophy -- what separates "correct" from "Apple-level."
 * Injected into the creative director + storyboard builder + critiquer to raise the ceiling.
 */
export const PREMIUM_DESIGN_PHILOSOPHY = `
## What Makes Video Feel Premium

This is not a checklist of things to avoid. This is what makes the difference between
a video that is "technically correct" and one that makes someone lean forward.

### The One-Idea Rule
Every scene communicates exactly ONE idea. Not two. Not "also." One.
If a scene has a headline AND bullet points AND a chart, it is a PowerPoint slide.
Apple puts "M2" on screen. Nothing else. Then the next scene shows the chip.
Then the next scene shows the benchmark. Each idea gets its own moment.

### Negative Space Is The Design
The empty space IS the design. Do not fill it. A headline centered in a 1920x1080 frame
with 60% of the canvas empty is more powerful than one surrounded by supporting elements.
Negative space creates focus. Focus creates impact. Less is always more.

### Visual Rhythm (Tension and Release)
A video is a song. It needs verses and choruses:
- **Build:** Start slow, establish context (3-4s scenes, gentle motion)
- **Peak:** Hit the key message (shorter scene, dramatic entrance, bigger type)
- **Breathe:** Let the viewer absorb (2-3s pause, minimal content, ambient motion)
- **Build again:** Next wave of information
- **Climax:** The big number, the demo, the reveal
- **Resolve:** CTA, clean exit

Never stack three high-energy scenes in a row. Never stack three slow scenes.
Alternate. Breathe.

### Depth Through Layers
A flat scene is a PowerPoint slide. A premium scene has depth:
- **Background layer:** mesh-gradient, subtle noise, slow drift
- **Mid layer:** glassmorphic surfaces, blurred shapes, ambient elements
- **Content layer:** the actual message
- **Polish layer:** film-grain, vignette, light leak

You don't need all four. But you need at least two.

### Motion Tells A Story
Every animation should have a reason:
- Elements entering FROM LEFT suggest "coming from the past" or "from the user"
- Elements entering FROM RIGHT suggest "new" or "future"
- Elements scaling UP suggest importance or growth
- Elements fading through BLUR suggest focus-pull, cinematic attention
- Stagger timing tells the viewer reading order -- what to look at first

Bad motion: everything flies in from random directions at the same time.
Good motion: headline fades up, then (200ms later) subtitle follows, then (300ms later) supporting visual slides in from the right. The viewer's eye follows a path.

### Typography As Art
Headlines are not just text. They are the visual centerpiece:
- Weight 700-800, tight letter-spacing (-0.025em to -0.03em)
- Consider gradient text for hero moments (white to accent color)
- SplitText character reveals for dramatic entrances
- One font family, but dramatic size contrast (76px headline vs 14px label = hierarchy)
- The title should feel like it BELONGS in that space, not like it was placed there

### Color Restraint
Premium uses 2-3 colors, not 7:
- One dark background (slate-900 or deeper)
- One bright accent (used sparingly -- a badge, a glow, a gradient endpoint)
- White/near-white for primary text
- Muted slate for secondary text
- That's it. Every additional color dilutes the palette.

### The Glass Effect
Glassmorphism done right is the single fastest path to "premium":
- background: rgba(255, 255, 255, 0.04-0.06)
- backdrop-filter: blur(12-20px)
- border: 1px solid rgba(255, 255, 255, 0.06-0.10)
- border-radius: 16-24px
- Subtle shadow: 0 8px 32px rgba(0,0,0,0.2)

This creates depth, separates content from background, and instantly signals quality.
Use it for cards, panels, frames. Don't overdo it -- 1-2 glass surfaces per scene.

### Exit Animations Matter
A scene that just cuts away feels amateur. A scene where elements gracefully exit --
fading up and away, scaling down, blurring out -- feels intentional and polished.
Always add exit animations when duration > 2s. Start exits 0.6-0.8s before scene end.
Elements should exit in reverse order of entry (last in, first out).

### The Details Nobody Notices (But Everyone Feels)
- Slight scale on hover states (1.02-1.05) suggests interactivity
- Tabular-nums on counters prevents number jitter
- Letter-spacing on uppercase labels (0.12-0.16em) is the difference between amateur and pro
- Border-radius consistency (use 12, 16, 20, or 24 -- pick a system)
- Easing: power3.out for entrances, power2.in for exits, sine.inOut for ambient loops
- Never use linear easing for UI motion. Ever.
`;

/**
 * Anti-patterns: things that instantly make output look amateur.
 * Quick-reference for the critiquer.
 */
export const AMATEUR_TELLS = `
## Instant Amateur Tells (Reject These)

- Flat solid-color background with no depth (looks like a wireframe)
- More than 15 words visible at one time in a video scene
- Multiple ideas crammed into one scene (headline + bullets + chart)
- No exit animations (content just cuts)
- All elements entering at the same time (no stagger, no reading order)
- White text on a #f3f4f6 or similar light background
- More than 3 different font sizes without clear hierarchy
- Centered content that is also left-aligned internally (pick one)
- Rainbow of colors instead of restrained 2-3 color palette
- Linear easing on any element motion
- Bullet points that look like a Word document
- Too many things animating at once (visual chaos)
- No breathing room between scenes (relentless information)
- Transitions all the same (crossfade, crossfade, crossfade)
- Text that goes edge-to-edge without padding
`;
