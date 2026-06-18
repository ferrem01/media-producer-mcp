/**
 * Scene Templates
 *
 * Pre-composed scene blueprints that the planner selects from.
 * Each template is a proven-great composition: components + timing + animation + spacing.
 * The planner picks a template, customizes with user content, and produces
 * Apple-keynote-quality output without the user needing to describe visuals.
 *
 * Categories:
 *   - OPENING: First impressions, hero moments, brand intros
 *   - CONTENT: Features, benefits, explanations
 *   - DATA: Stats, metrics, proof points
 *   - DEMO: Product shots, UI walkthroughs, browser frames
 *   - BREATHING: Visual pauses, transitions, mood setters
 *   - CLOSING: CTAs, outros, final impressions
 */

export const SCENE_TEMPLATES = `
## Scene Templates

These are pre-composed scene templates. Each is a proven composition that produces
professional, Apple-keynote-quality output. Pick the template that fits the narrative
moment, then customize with the user's content.

RULES:
- Never use the same template twice in a row.
- Vary between text-heavy and visual templates.
- Every video needs at least one BREATHING template for pacing.
- Match template to narrative moment (see Pacing Arcs).

---

### OPENING TEMPLATES

#### O1: "The Big Statement"
*When to use*: Opening scene. One powerful headline that sets the tone.
*Feel*: Apple WWDC title card. Dramatic, confident, minimal.

- Layout: Single centered text block, generous negative space
- Background: mesh-gradient or brand gradient at z_index 0, colors from brand palette
- Typography: Headline 88-100px, weight 800, letter-spacing -0.03em. Max 5 words.
- Optional: Small badge/eyebrow above (13px, uppercase, letter-spacing 0.14em, accent color pill)
- Optional: Subtitle 24px, weight 400, muted color, appears 0.4s after headline
- Animation: SplitText per-character reveal on headline (stagger 0.03s, back.out(1.2) ease). Badge scales from 0.9 with fade. Subtitle fades up from y:20.
- Timing: Entrance 0.3-1.2s. Hold 2s. Exit: all elements fade up and out (y:-15, 0.5s, power2.in)
- Duration: 4-5s
- Transition out: crossfade or blur-crossfade

#### O2: "Logo Into Statement"
*When to use*: When brand intro video exists. Logo plays, then transitions to the hook.
*Feel*: Brand signature moment.

- Scene 1 (3-5s): Video component playing brand intro clip at z_index 0. No other components.
- Scene 2 (4s): Follows with O1 "Big Statement" template. Use blur-crossfade transition.
- Note: This is a TWO-SCENE template. The planner should generate both scenes.

#### O3: "The Provocation"
*When to use*: Opening with a question, challenge, or bold claim. Creates tension.
*Feel*: TED talk opening. Draws the viewer in.

- Layout: Text centered vertically, slightly left-aligned (max-width 70%, padding-left 120px)
- Background: Dark gradient, minimal. One subtle ambient glow orb in accent color (low opacity).
- Typography: Question/statement at 72px, weight 700, line-height 1.1. Use typewriter or kinetic-text component for dramatic reveal.
- Optional: Small attribution or context line below (16px, muted)
- Animation: Words appear one at a time (typewriter) or kinetic text scales in. 0.8s build.
- Duration: 4-5s
- Transition out: crossfade

#### O4: "Split Reveal"
*When to use*: Introducing a duality - before/after, problem/solution, old/new.
*Feel*: Dramatic contrast. Visual tension.

- Layout: split-screen component, full canvas
- Background: gradient-background at z_index 0
- Left side: The "before" state (muted colors, smaller text 28px)
- Right side: The "after" state (vibrant, accent color, larger text 36px)
- Center divider: 2px line in accent color, or gradual blend
- Animation: Left side fades in first (0.3s), hold 0.8s, then right side slides/fades in. Creates a reveal moment.
- Duration: 5-6s
- Transition out: wipe-left or slide-up

---

### CONTENT TEMPLATES

#### C1: "Feature Spotlight"
*When to use*: Highlighting a single feature or capability. One idea, one visual.
*Feel*: Apple product page. Clean, focused, premium.

- Layout: Two zones - text on left (40%), visual on right (55%), 5% gap
- Background: gradient-background or mesh-gradient, dark
- Text zone: Section header (eyebrow 13px uppercase accent + headline 56px + description 20px muted). Left-aligned, vertically centered.
- Visual zone: browser-frame, device-mockup, or custom component showing the feature. Slightly elevated with shadow.
- Animation: Text stagger-fades in (eyebrow, then headline SplitText, then description). Visual slides in from right with scale 0.95->1.0, 0.8s power3.out.
- Duration: 5-6s
- Transition out: crossfade

#### C2: "Bento Overview"
*When to use*: Showing 3-6 capabilities, features, or benefits at once. The "everything at a glance" moment.
*Feel*: Apple bento grid. Each card is a mini-story.

- Layout: bento-grid or grid-layout component, 3-6 cards
- Background: gradient-background at z_index 0
- Cards: Each has an icon (inline SVG, NOT emoji), short title (3 words max), optional one-line description
- Card style: glass morphism (rgba(255,255,255,0.03), backdrop-filter blur, subtle border)
- Animation: Cards stagger in (0.08s apart), each from y:30 + autoAlpha:0 with power3.out. Optional: one featured card is 2x size and animates first.
- Duration: 5-7s
- Transition out: crossfade or slide-up

#### C3: "The Walkthrough"
*When to use*: Step-by-step process, how-it-works, or workflow explanation.
*Feel*: Clean, logical, easy to follow. Linear brand.

- Layout: timeline-steps component OR custom numbered steps layout
- Background: gradient-background, dark
- Steps: 3-4 steps max. Each has a number (48px, accent color), title (24px, bold), and one-line description (16px, muted)
- Connection: Subtle line or dots connecting steps
- Animation: Steps reveal sequentially (0.6s apart). Number scales in with back.out, then text fades. Line draws between steps using DrawSVG.
- Duration: 6-8s
- Transition out: crossfade

#### C4: "Quote / Testimonial"
*When to use*: Social proof, customer quote, expert endorsement.
*Feel*: Elegant, credible, human.

- Layout: quote-block component, centered, max-width 75%
- Background: gradient-background, subtle. Optional: large quotation mark watermark at 200px, 3% opacity
- Quote text: 32-40px, weight 500, line-height 1.4, italic optional
- Attribution: 16px, weight 600, accent color. Company/role below in muted.
- Animation: Quote text uses SplitText word-by-word reveal (stagger 0.02s). Attribution fades in 0.3s after quote completes.
- Duration: 5-6s
- Transition out: blur-crossfade

#### C5: "Side-by-Side Comparison"
*When to use*: Comparing two approaches, products, or states.
*Feel*: Clear, decisive. The winner is obvious.

- Layout: comparison-before-after component or custom two-column
- Background: gradient-background
- Column A: Label at top (16px, muted uppercase), content below. Subtle red/muted tint for "old/bad" option.
- Column B: Label at top, content below. Accent/green tint for "new/good" option. Slightly elevated.
- Animation: Column A appears first (0.4s), hold 0.8s, Column B slides in or fades in with a slight scale-up effect. Optional: checkmark SVG draws in on column B.
- Duration: 5-6s

#### C6: "Icon Feature Grid"
*When to use*: 4-6 short feature callouts with icons. Quick hits.
*Feel*: Clean SaaS feature grid. Stripe, Linear style.

- Layout: grid-layout with 4-6 items in 2x2 or 2x3 grid
- Each item: SVG icon (24px) + title (18px bold) + optional one-line description (14px muted)
- Card style: No visible card borders. Just clean spacing. Icons in accent color.
- Animation: Grid items stagger in (0.06s apart), from autoAlpha:0 + y:20. Smooth power2.out.
- Duration: 5-6s

---

### DATA TEMPLATES

#### D1: "Hero Stat"
*When to use*: One massive, impressive number. The jaw-drop moment.
*Feel*: Apple keynote "1 billion devices" moment. Pure impact.

- Layout: Single stat-card component, centered. Nothing else competing for attention.
- Background: mesh-gradient at z_index 0
- Number: 120-160px, weight 800, gradient text fill (white to accent). Tabular nums.
- Suffix/prefix: 80-100px, weight 300, accent color gradient
- Label: 20px, uppercase, letter-spacing 0.14em, muted color. 36px below number.
- Animation: Number counts up from 0 (power2.out, 2s). Wrap scales in from 0.8 with back.out. Label fades in at 60% of counter animation. Optional: subtle glow pulse on number at completion.
- Duration: 4-5s
- Transition out: crossfade

#### D2: "Stats Trio"
*When to use*: 3 related metrics that tell a story together.
*Feel*: Dashboard highlights. Impressive, data-rich.

- Layout: 3 stat-card components in a row, evenly spaced (x: 200, 760, 1320, y: 400)
- Background: gradient-background at z_index 0
- Each stat: Number (72px), suffix/prefix (48px), label (14px uppercase muted)
- Card containers: Optional glass cards behind each stat, or just floating numbers
- Animation: Stats stagger in (0.15s apart), each with counter animation. Center stat optionally starts first (is the "hero" of the three).
- Duration: 5-6s

#### D3: "Chart Moment"
*When to use*: Growth story, trend visualization, progress over time.
*Feel*: Clean data visualization. McKinsey meets Apple.

- Layout: bar-chart or line-chart component, positioned center-right (60% width). Title/context on the left.
- Background: gradient-background
- Left text zone: Headline (40px) + one-line context (18px muted)
- Chart zone: Clean chart with 5-7 data points. Brand primary color for bars/line. Subtle grid lines.
- Animation: Left text fades in first. Chart bars grow up or line draws left-to-right (DrawSVG style). Stagger 0.1s per data point.
- Duration: 6-7s

#### D4: "Metric Dashboard"
*When to use*: Multiple metrics in a dashboard-like layout. The "under the hood" view.
*Feel*: Product dashboard. Data-rich but organized.

- Layout: metric-dashboard component or custom grid with mixed stat sizes
- Background: gradient-background, dark
- Primary metric: Large (80px number) centered-top
- Supporting metrics: 2-4 smaller stats (36px) below in a row
- Optional: Small sparkline charts next to metrics
- Animation: Primary metric enters first with counter. Supporting metrics stagger in 0.3s later.
- Duration: 6-7s

---

### DEMO TEMPLATES

#### P1: "Product Frame"
*When to use*: Showing a product UI, website, or app screenshot. The hero product shot.
*Feel*: Apple product shot. The product IS the star.

- Layout: browser-frame or device-mockup component, centered, 70-80% canvas width
- Background: gradient-background, dark and recessive. Let the product pop.
- Frame: Elevated with dramatic shadow (0 25px 60px rgba(0,0,0,0.5))
- Content: Realistic product UI in the frame. If showing a website, use actual-looking content.
- Optional: Label/caption below frame (16px, muted)
- Animation: Frame enters from slightly below (y:40) with scale 0.96->1.0, 1.0s power3.out. Shadow animates in simultaneously. Content inside can have subtle scroll or cursor movement for life.
- Duration: 5-7s
- Transition out: zoom-through or crossfade

#### P2: "Interactive Demo"
*When to use*: Showing a workflow, clicking through UI, typing into fields. The product in action.
*Feel*: Product demo video. Shows the product doing its thing.

- Layout: browser-frame or device-mockup at 75% width, centered
- Background: gradient-background, dark
- Content: Dynamic HTML content inside the frame with script system
- Script: cursor_targets for click/hover points, typeText for inputs, zoomTo for focus areas
- Animation: Frame enters (0.5s), then script plays. Cursor moves to targets, clicks trigger visual changes, text types in.
- Duration: 8-15s (longer for demos)
- Note: Always include realistic data. Never use "lorem ipsum" or placeholder text.

#### P3: "Code Showcase"
*When to use*: Showing code, API, CLI output. Developer-focused content.
*Feel*: VS Code dark theme. Clean, readable, developer-credible.

- Layout: code-block or terminal component, centered, 70% width
- Background: gradient-background, very dark (#0a0e1a)
- Code: Realistic, readable snippet. Max 8-10 lines. Syntax-highlighted with accent colors.
- Optional: Section header above (eyebrow + title) for context
- Animation: Code block fades in with subtle scale. Lines can highlight sequentially or cursor can type them.
- Duration: 5-7s

#### P4: "Picture-in-Picture"
*When to use*: Product in context. Main product view with a zoomed detail or secondary angle.
*Feel*: Apple's "and here's how it looks up close" moment.

- Layout: picture-in-picture component. Main view (70%) + detail inset (25%, bottom-right)
- Background: gradient-background
- Main: Full product view
- Inset: Zoomed detail, different angle, or before state
- Animation: Main fades in first, then inset slides in from corner with bouncy ease. Inset has subtle border glow.
- Duration: 5-6s

---

### BREATHING TEMPLATES

#### B1: "Visual Pause"
*When to use*: Between content-heavy sections. Gives the viewer a beat to absorb.
*Feel*: The exhale. Clean, atmospheric, minimal.

- Layout: Centered text block, very minimal. Just a section header or transition phrase.
- Background: mesh-gradient, ambient, atmospheric. Floating particles optional.
- Text: 48-56px, weight 600. Max 4 words. "But there's more." / "Here's the thing." / "Let's talk numbers."
- Animation: Text fades in slowly (1.0s, power2.out). Optional: SplitText with wider stagger (0.05s). Ambient particles drift in background.
- Duration: 3-4s
- Purpose: Resets the visual palate before the next section.

#### B2: "Section Divider"
*When to use*: Clear topic change. "Now we're talking about X."
*Feel*: Chapter card. Netflix episode title card energy.

- Layout: section-header component, centered
- Background: gradient-background, distinct from adjacent scenes (shift colors slightly)
- Text: Eyebrow (13px accent) + headline (64px bold)
- Animation: Quick, punchy entrance. Headline slides up from y:40, 0.5s. Eyebrow fades in just before.
- Duration: 3s
- Transition in: iris or wipe-left for emphasis

#### B3: "Ambient Mood"
*When to use*: Atmosphere builder. Pure visual, no text. Pairs well before a big reveal.
*Feel*: Cinematic b-roll. Sets emotional tone.

- Layout: Full-bleed animated background. Custom component with layered gradients, particles, or geometric patterns.
- Background: Rich multi-layer gradient with ambient animation (floating orbs, drifting mesh, gentle parallax)
- Text: None. Zero words. This is a visual palette cleanser.
- Animation: Continuous ambient motion. Gradients shift, particles drift, light plays.
- Duration: 2-3s
- Note: ONLY use if the video is 6+ scenes. Short videos should skip this.

---

### CLOSING TEMPLATES

#### E1: "Call to Action"
*When to use*: Final sell. Get them to act.
*Feel*: Clean, direct, confident. Not desperate.

- Layout: cta-card component, centered. Or custom with headline + button + optional URL.
- Background: gradient-background, slightly warmer/brighter than previous scenes (accent color influence)
- Headline: 56px, bold. "Get Started Today" / "Try It Free" / the CTA message.
- Button/URL: Accent-colored pill, 18px. Subtle glow or border animation.
- Optional: Supporting line below headline (18px, muted). One sentence max.
- Animation: Headline SplitText reveal. Button scales in from 0.95 with a gentle bounce (back.out). Optional: button has a subtle shimmer/glow pulse.
- Duration: 4-5s

#### E2: "Summary Stats"
*When to use*: Reinforcing the key numbers before closing. "Remember these."
*Feel*: Recap. Landing the key points.

- Layout: 2-4 stat-cards in a row (use D2 layout) with a headline above
- Background: gradient-background
- Headline: 40px, centered, "By the Numbers" or relevant summary header
- Stats: Key metrics from earlier in the video, now side by side
- Animation: Headline fades in, stats stagger in below (re-using counter animations)
- Duration: 5-6s

#### E3: "Logo Outro"
*When to use*: Brand signoff. Last frame.
*Feel*: Clean, professional, memorable.

- If brand outro video exists: Video component playing outro clip. Full scene, no other components.
- If no outro video: Logo centered (120-160px), company name below (24px, muted). Clean gradient background. Logo fades in with scale 0.95->1.0, 0.8s. Name fades in 0.3s after.
- Duration: 3-5s (match outro video length if using one)
- Transition in: blur-crossfade

#### E4: "The Callback"
*When to use*: Ending by referencing the opening. Creates narrative closure.
*Feel*: Full circle. Satisfying.

- Layout: Same as the opening scene (O1/O3) but with an evolved message
- Example: Opening was "What if marketing was effortless?" Closing is "Marketing, made effortless."
- Same visual style, same layout, but the message has matured through the video
- Animation: Mirror the opening animation but slightly refined (faster entrance, longer hold)
- Duration: 4-5s

---

### TEMPLATE SELECTION GUIDE

For a typical 6-8 scene video:
1. OPENING: O1 or O3 (O2 if brand intro video exists)
2. CONTENT: C1 or C2 (the main story)
3. DATA: D1 or D2 (proof/impact)
4. BREATHING: B1 or B2 (transition)
5. CONTENT/DEMO: C1, P1, or P2 (deeper dive)
6. DATA: D1 or D3 (more proof)
7. CLOSING: E1 (call to action)
8. CLOSING: E3 (logo outro)

For a 3-4 scene image series:
1. O1 or O3 (hero/hook)
2. C1 or D1 (key value proposition)
3. C2 or C6 (supporting details)
4. E1 (CTA)

NEVER:
- Two data templates in a row (viewer fatigue)
- Two content templates with same layout in a row
- More than 2 scenes without a visual change in composition type
- A video without at least one DATA template (numbers build credibility)
- A video without a clear OPENING and CLOSING template

---

### INDUSTRY-SPECIFIC TEMPLATES

These templates are optimized for common verticals. Use them when the prompt
mentions the industry or when the content clearly fits a vertical.

#### I-SAAS1: "Integration Ecosystem"
*When to use*: SaaS product showing integrations, API connections, or partner ecosystem.
*Feel*: Modern SaaS marketing. Connects the dots.

- Layout: a centered (60% width) GRID of 'logo' components (one per integration domain) with a headline above
- Background: gradient-background, dark
- Center: Product logo/icon (48px) with connecting lines radiating outward
- Surrounding: 6-8 integration partner logos arranged in a circle or grid
- Animation: Center logo scales in first, then connection lines draw outward (DrawSVG), then partner logos fade in at endpoints (stagger 0.1s)
- Duration: 5-6s
- Great for: SaaS, DevTools, Platforms

#### I-SAAS2: "Workflow Automation"
*When to use*: Showing a multi-step automated process. Before/after manual vs automated.
*Feel*: Process automation. The "magic" moment.

- Layout: timeline-steps component with 3-4 steps, horizontal layout
- Background: gradient-background
- Steps: Each step has an icon (inline SVG), action label (18px bold), and a connecting arrow
- Key moment: One step has a lightning bolt / "auto" badge indicating automation
- Animation: Steps reveal left-to-right (0.4s apart). Connecting arrows draw between them. The "auto" step glows or pulses accent color.
- Duration: 5-7s
- Great for: SaaS, Automation, Workflow tools

#### I-SAAS3: "Pricing Tiers"
*When to use*: Showing pricing plans, tier comparison, plan features.
*Feel*: Clean pricing page. The recommended plan stands out.

- Layout: 3 pricing-card components side by side (or 2 for simple comparison)
- Background: gradient-background
- Cards: Plan name, price, feature list. Middle/recommended card is elevated with accent border glow.
- Animation: Cards stagger in (0.12s apart). Recommended card enters last with a slight bounce and glow effect.
- Duration: 5-6s
- Great for: SaaS, Subscription services

#### I-ECOM1: "Product Showcase"
*When to use*: E-commerce product hero shot. Single product, premium feel.
*Feel*: Apple product page. The product sells itself.

- Layout: image-showcase component centered (50-60% width), floating with dramatic shadow
- Background: gradient-background, clean and recessive
- Product: High-res product image, elevated presentation
- Optional: Price badge (top-right, accent pill), or "New" label
- Text: Product name (40px) + one-line value prop (18px muted) below image
- Animation: Product floats in from below with subtle rotation (3d perspective), shadow builds. Text fades in after.
- Duration: 5-6s
- Great for: E-commerce, D2C, Product launches

#### I-ECOM2: "Social Proof Wall"
*When to use*: Showing customer reviews, ratings, or UGC for credibility.
*Feel*: Trust-building. Real people, real results.

- Layout: Grid of 3-4 testimonial-card or social-proof components
- Background: gradient-background, warm
- Cards: Star rating, short quote (max 2 lines), customer name, optional avatar placeholder
- One card can be a stat ("4.9/5 average" or "10,000+ reviews")
- Animation: Cards stagger in from different directions. Star ratings fill in with gold color animation.
- Duration: 5-6s
- Great for: E-commerce, Marketplaces, Consumer apps

#### I-FIN1: "Security & Compliance"
*When to use*: Fintech/healthcare showing trust signals -- certifications, encryption, compliance badges.
*Feel*: Trustworthy, institutional, reliable.

- Layout: Center headline (40px) + row of 3-5 certification badges/shields below
- Background: gradient-background, dark with subtle blue tones
- Badges: Shield icons with labels (SOC2, HIPAA, GDPR, PCI DSS, ISO 27001, etc.)
- Optional: "Bank-level encryption" or similar trust headline
- Animation: Headline fades in. Badges stagger in (0.1s apart) with subtle scale bounce. Optional: shield icons have a brief shimmer/glow.
- Duration: 4-5s
- Great for: Fintech, Healthcare, Enterprise SaaS

#### I-FIN2: "ROI Calculator"
*When to use*: Showing financial impact, cost savings, ROI metrics.
*Feel*: The business case. Numbers that matter to CFOs.

- Layout: stat-card components. One large "hero" savings number + 2-3 supporting metrics
- Background: gradient-background with subtle green/money accent tones
- Hero stat: Large number with dollar sign or percentage (120px), "saved" or "increased" label
- Supporting: Time saved, efficiency gain, payback period in smaller stat-cards below
- Animation: Hero stat counts up dramatically (2s). Supporting stats stagger in below (0.2s apart) with their own counters.
- Duration: 5-6s
- Great for: Fintech, Enterprise, B2B SaaS

#### I-HEALTH1: "Patient Journey"
*When to use*: Healthcare showing patient experience, care pathway, or treatment steps.
*Feel*: Empathetic, human, trustworthy. Not clinical.

- Layout: timeline-steps with 3-4 stages, human-centered icons
- Background: gradient-background, warm and calming (soft blues, whites)
- Steps: Each stage of the patient/user journey with empathetic language
- Icons: Human-centered (person, heart, checkmark, shield) -- never cold/technical
- Animation: Steps reveal gently (0.5s apart), softer ease (power2.out). Warmer, slower feel than tech timelines.
- Duration: 6-7s
- Great for: Healthcare, Wellness, Patient platforms

#### I-RE1: "Property Showcase"
*When to use*: Real estate listing, property feature, or development showcase.
*Feel*: Premium real estate marketing. Aspirational.

- Layout: image-showcase or browser-frame (70% width) with property image + info overlay
- Background: gradient-background, dark and elegant
- Image: Property photo (hero shot)
- Overlay: Bottom bar with price (36px bold), location (18px), key specs (bed/bath/sqft in a row)
- Animation: Image fades in with subtle ken-burns zoom. Overlay slides up from bottom (0.6s, power3.out).
- Duration: 5-6s
- Great for: Real Estate, Property tech, Hospitality

---

### INDUSTRY FLOW PATTERNS

When the prompt mentions an industry, prefer these scene sequences:

#### SaaS / Developer Tools
1. O1 or O3 (bold problem statement)
2. C1 (feature spotlight -- the core value)
3. P1 or P2 (product demo)
4. I-SAAS1 (integrations) or I-SAAS2 (workflow)
5. D1 or D2 (metrics/traction)
6. I-SAAS3 (pricing) or E1 (CTA)
7. E3 (logo outro)

#### E-commerce / D2C
1. O1 or O4 (bold intro or before/after)
2. I-ECOM1 (product showcase)
3. C2 (feature bento -- product benefits)
4. I-ECOM2 (social proof wall)
5. D1 (hero stat -- sales/reviews/customers)
6. E1 (CTA -- "Shop Now")
7. E3 (logo outro)

#### Fintech / Financial Services
1. O3 (provocation -- the pain point)
2. C1 (solution spotlight)
3. I-FIN2 (ROI / savings)
4. I-FIN1 (security & compliance)
5. D2 (stats trio -- key metrics)
6. E1 (CTA)
7. E3 (logo outro)

#### Healthcare / Wellness
1. O1 (empathetic big statement)
2. I-HEALTH1 (patient journey)
3. C1 (feature/benefit spotlight)
4. I-FIN1 (compliance badges -- HIPAA, etc.)
5. D1 (impact stat)
6. E1 (CTA)
7. E3 (logo outro)

#### Real Estate / Property
1. I-RE1 (property hero shot)
2. C2 (bento -- property features/amenities)
3. D2 (stats trio -- price, sqft, ROI)
4. C4 (testimonial -- resident/buyer quote)
5. E1 (CTA -- "Schedule a Tour")
6. E3 (logo outro)

#### General B2B / Enterprise
1. O3 (provocation -- business problem)
2. C1 (solution overview)
3. P1 (product frame)
4. D2 (stats trio -- ROI metrics)
5. C4 (testimonial)
6. E1 (CTA)
7. E3 (logo outro)
`;
