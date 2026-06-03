/**
 * Visual Design Rules
 *
 * Ported from video-producer-mcp's skills/codegen/ directory.
 * Injected into component generator and scene planner prompts
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
- Title text: max 48-72px. Never exceed 88px unless it's a single word.
- Subtitle text: 24-36px.
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

### Color & Contrast
- NEVER place white text (#ffffff) on light backgrounds (#f3f4f6, #e5e7eb, white).
- NEVER place dark text on dark backgrounds.
- Default dark theme: text #ffffff on background #0f172a / surface #1e293b.
- When using browser-frame or device-mockup with light content inside, keep the chrome dark.
- Use var(--mp-color-text) and var(--mp-color-background) consistently.

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
 * Rules for the scene planner (what data to pass to components).
 */
export const SCENE_PLANNER_DESIGN_RULES = `
## Visual Design Rules for Scene Planning

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

### Color/Theme Consistency
- Default dark theme for all scenes unless the prompt explicitly requests light.
- background: #0f172a, surface: #1e293b, text: #ffffff.
- Never use light backgrounds (#f3f4f6, #ffffff, #f9fafb) as the main scene background.
  These are only acceptable INSIDE browser-frame or device-mockup viewports.
- When using browser-frame content_html with a light viewport, keep text dark (#1f2937).

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
- The scene planner should flag these as needing custom components with script support.
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
