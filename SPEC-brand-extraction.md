# SPEC: Website Brand Extraction & Extended Design System

## Problem

Our brand kit is thin: colors, fonts, logos, `border_radius`, `motion`, and free-text `guidelines`. When the LLM generates components and plans scenes, it has enough to match the basic palette but not enough to match the *feel* of the brand. The result: components that use the right colors but have generic spacing, shadows, typography scale, layout patterns, and motion that don't feel like the brand.

Claude Design (Anthropic) solves this by extracting a full design system during onboarding -- from codebases, design files, or websites. The outputs drive every project, which is why their generated designs feel native to the brand out of the box.

## Approach

Build a website analyzer that uses Playwright to load a brand's website, extract computed styles from key elements, and produce an extended brand kit that captures the full design system. This richer context gets injected into LLM prompts so generated components match the brand's actual visual language.

### Two-Phase Design

**Phase 1: Extraction Engine** (Playwright + computed styles)
- Load URL in Playwright
- Scan all visible elements, collect computed styles
- Cluster and deduplicate values into design tokens
- Produce extended brand kit JSON

**Phase 2: LLM Enhancement** (optional, Phase 1 output as input)
- Pass extracted tokens + page screenshots to LLM
- LLM interprets the design *intent*: "this brand uses generous whitespace", "CTAs are high-contrast pill buttons", "cards have subtle shadows with 8px radius"
- Produces human-readable `guidelines` and component pattern descriptions
- This is what Claude Design likely does with their "reads your codebase" step

## Extended BrandKit Schema

```typescript
export interface BrandKit {
  // ── Existing fields (unchanged) ──
  colors: BrandColors;
  fonts: BrandFont[];
  logo?: BrandLogo;
  logos?: BrandLogo[];
  assets?: BrandAsset[];
  style?: BrandStyle;
  guidelines?: string;

  // ── New: Design System Tokens ──
  design_system?: DesignSystem;
}

export interface DesignSystem {
  // Source URL and extraction metadata
  source_url?: string;
  extracted_at?: string;

  // ── Color System ──
  color_roles?: {
    primary_bg?: string;        // main background
    surface?: string;           // card/panel background
    elevated?: string;          // modal/popover bg
    primary_action?: string;    // CTA buttons
    primary_action_hover?: string;
    secondary_action?: string;
    destructive?: string;
    success?: string;
    warning?: string;
    border?: string;            // default border color
    border_subtle?: string;     // lighter border
    text_primary?: string;
    text_secondary?: string;
    text_muted?: string;
    text_on_primary?: string;   // text on primary action bg
    link?: string;
    link_hover?: string;
  };

  // ── Typography Scale ──
  typography?: {
    font_heading?: string;      // heading font family
    font_body?: string;         // body font family  
    font_mono?: string;         // monospace font
    scale?: {                   // named sizes
      display?: string;         // hero/display text (e.g. "64px")
      h1?: string;
      h2?: string;
      h3?: string;
      h4?: string;
      body_lg?: string;
      body?: string;
      body_sm?: string;
      caption?: string;
      overline?: string;
    };
    line_heights?: {
      tight?: number;           // headings (e.g. 1.1)
      normal?: number;          // body (e.g. 1.5)
      relaxed?: number;         // large body (e.g. 1.75)
    };
    letter_spacing?: {
      tight?: string;           // headings (e.g. "-0.02em")
      normal?: string;
      wide?: string;            // overline/labels (e.g. "0.05em")
    };
    heading_weight?: number;    // typical heading weight (e.g. 700)
    body_weight?: number;       // typical body weight (e.g. 400)
  };

  // ── Spacing Scale ──
  spacing?: {
    base_unit?: number;         // grid base in px (4, 8, etc.)
    scale?: Record<string, string>; // named scale: { xs: "4px", sm: "8px", md: "16px", ... }
    section_gap?: string;       // gap between major sections
    card_padding?: string;      // inner padding on cards
    container_max_width?: string; // max content width
  };

  // ── Border Radius ──
  radius?: {
    none?: string;
    sm?: string;                // subtle rounding (e.g. "4px")
    md?: string;                // cards, inputs (e.g. "8px")  
    lg?: string;                // larger panels (e.g. "16px")
    full?: string;              // pills, avatars (e.g. "9999px")
    button?: string;            // button-specific radius
    card?: string;              // card-specific radius
    input?: string;             // input-specific radius
  };

  // ── Shadows / Elevation ──
  shadows?: {
    sm?: string;                // subtle shadow (e.g. cards)
    md?: string;                // elevated elements
    lg?: string;                // modals/popovers
    button?: string;            // button shadow
    card?: string;              // card-specific shadow
    focus_ring?: string;        // focus outline style
  };

  // ── Motion / Animation ──
  motion?: {
    duration_fast?: string;     // micro-interactions (e.g. "150ms")
    duration_normal?: string;   // standard transitions (e.g. "200ms")
    duration_slow?: string;     // page-level (e.g. "300ms")
    easing_default?: string;    // e.g. "ease-in-out"
    easing_enter?: string;      // elements entering
    easing_exit?: string;       // elements leaving
    hover_transform?: string;   // e.g. "translateY(-1px)"
    hover_shadow?: boolean;     // shadow lift on hover?
    reduced_motion?: boolean;   // prefers-reduced-motion respect?
  };

  // ── Component Patterns ──
  patterns?: {
    button_style?: string;      // "filled" | "outline" | "ghost" | "gradient"
    button_shape?: string;      // "rounded" | "pill" | "square"
    card_style?: string;        // "flat" | "bordered" | "elevated" | "glass"
    card_border?: boolean;      // cards have visible border?
    input_style?: string;       // "bordered" | "filled" | "underline"
    header_style?: string;      // "transparent" | "solid" | "blur"
    divider_style?: string;     // "line" | "gradient" | "none"
    icon_style?: string;        // "outline" | "filled" | "duotone"
    badge_style?: string;       // "filled" | "outline" | "subtle"
    layout_max_width?: string;  // content max-width
    layout_columns?: number;    // common grid columns (3, 4, etc.)
    gradient_direction?: string; // common gradient angle
    gradient_style?: string;    // "subtle" | "bold" | "mesh"
  };

  // ── Visual Density ──
  density?: "compact" | "comfortable" | "spacious";

  // ── Screenshots for LLM context ──
  screenshots?: {
    hero?: string;              // path to hero section screenshot
    nav?: string;               // navigation screenshot
    cards?: string;             // card pattern screenshot
    cta?: string;               // CTA section screenshot
    footer?: string;            // footer screenshot
  };
}
```

## Extraction Engine

### What to Scan

Load the page, wait for fonts + dynamic content, then:

1. **Colors**: Collect all `color`, `background-color`, `border-color`, `fill`, `stroke` from computed styles. Cluster by perceptual distance (CIEDE2000 or simple Euclidean in LAB). Deduplicate. Infer roles by usage context (most common bg = primary_bg, text color on body = text_primary, button bg = primary_action, etc.).

2. **Typography**: Collect all `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing` from text elements. Group by heading level (h1-h6) and body text. Detect the type scale ratio. Extract heading vs body font families.

3. **Spacing**: Collect all `padding`, `margin`, `gap` values. Test against candidate base units (4px, 5px, 6px, 8px). Pick the base with highest adherence. Build the scale.

4. **Border Radius**: Collect all `border-radius` values. Group by element type (buttons, cards, inputs, avatars). Deduplicate into a scale.

5. **Shadows**: Collect all `box-shadow` values. Group by elevation level. Associate with element types.

6. **Motion**: Collect `transition-duration`, `transition-timing-function`, `animation-duration` from stylesheets and computed styles. Detect hover state changes by programmatically hovering interactive elements.

7. **Component Patterns**: Identify buttons (role=button, `<button>`, `<a>` with button-like styles), cards (elevated containers with padding), inputs, nav. Extract their characteristic styles.

8. **Screenshots**: Capture viewport screenshot, hero section, nav, a card cluster, CTA section. Store as assets.

### Element Selection Strategy

Not every element matters. Focus on:
- `<h1>` through `<h6>` -- typography scale
- `<p>`, `<span>` with body text -- body typography
- `<button>`, `<a>` with button classes -- button patterns
- Elements with `box-shadow` -- elevation system
- Elements with `border-radius > 0` -- radius scale
- `<nav>`, `<header>`, `<footer>` -- structural patterns
- Cards: `<div>` children of flex/grid containers with padding + border/shadow
- `<input>`, `<select>`, `<textarea>` -- input styles

### Implementation

New file: `src/tools/brand-extractor.ts`

```typescript
export async function extractBrandFromUrl(
  url: string, 
  browser: Browser
): Promise<DesignSystem> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000); // fonts + dynamic content
  
  // Run extraction script in page context
  const rawTokens = await page.evaluate(() => {
    // ... collect computed styles from all elements
    // ... return structured raw data
  });
  
  // Cluster and normalize on server
  const designSystem = normalizeTokens(rawTokens);
  
  // Capture screenshots
  designSystem.screenshots = await captureScreenshots(page);
  
  return designSystem;
}
```

### MCP Tool

New tool: `extract_brand_from_website`

```
Input:  { url: string, tenant_id: string }
Output: { design_system: DesignSystem, brand_kit: BrandKit }
```

- Extracts design system from URL
- Merges into existing brand kit (or creates new one)
- Saves to tenant's brand-kit directory
- Returns the full brand kit

### Playground Integration

Add a "Import from Website" button in the playground that:
1. Takes a URL
2. Runs extraction
3. Shows a preview of extracted tokens (color swatches, type samples, etc.)
4. Lets user confirm before saving to brand kit

## LLM Prompt Changes

### Current State
The planner and component generator receive:
- CSS custom properties list (`--mp-color-primary: #xxx`, `--mp-font-family: Inter`, `--mp-border-radius: 8px`)
- Basic style guide ("dark background, light text" etc.)
- Free-text `guidelines`

### Extended Injection

Add a `buildDesignSystemContext()` function that produces a richer prompt section:

```
## Brand Design System

### Typography
- Headings: Inter Bold, scale: 48px / 36px / 24px / 20px, tight line-height (1.1), letter-spacing -0.02em
- Body: Inter Regular 16px, relaxed line-height (1.6)
- Captions: Inter 13px, muted color

### Spacing
- Base unit: 8px
- Section gaps: 64px
- Card padding: 24px
- Content max-width: 1200px

### Component Patterns
- Buttons: filled, pill-shaped (border-radius: 9999px), with shadow lift on hover
- Cards: bordered (1px border), 12px radius, subtle shadow, 24px padding
- Inputs: bordered, 8px radius

### Elevation
- Cards: 0 1px 3px rgba(0,0,0,0.1)
- Modals: 0 20px 60px rgba(0,0,0,0.3)
- Buttons: 0 2px 8px rgba(0,0,0,0.15)

### Motion
- Transitions: 200ms ease-in-out
- Hover: translateY(-1px) + shadow increase
- Entrance: 300ms ease-out

### Visual Density: Spacious
- Generous whitespace between sections
- Large headings with tight line-height
- Breathing room around CTAs

### Design Rules (from extraction)
- Never use sharp corners on interactive elements
- CTAs always use primary action color with white text
- Cards always have a subtle border, not just shadow
- Gradients are subtle, not bold (10-20% shift)
```

This gives the LLM dramatically more context. Instead of "use --mp-color-primary for buttons", it knows the buttons are pill-shaped with shadow lift, cards are bordered with 12px radius, spacing is generous on an 8px grid, etc.

## Implementation Plan

### Sprint 1: Core Extraction
1. `src/tools/brand-extractor.ts` -- Playwright-based extraction engine
2. `src/core/types.ts` -- extend BrandKit with `DesignSystem` interface
3. `src/persistence/brand-kit.ts` -- save/load extended brand kit
4. `src/tools/brand-extract-tool.ts` -- MCP tool: `extract_brand_from_website`
5. Test with 3-5 real websites (Stripe, Linear, Vercel, Notion, Quotient)

### Sprint 2: LLM Integration
1. `src/llm/prompts.ts` -- `buildDesignSystemContext()` function
2. Update `buildBrandVarsList()` to include extended CSS vars (spacing, shadows, radius, etc.)
3. Update `freeformPlannerSystemPrompt` and `sceneComponentSystemPrompt` to inject design system context
4. Update `compileBrandCSS()` to emit the full set of CSS custom properties
5. A/B test: generate same project with basic vs extended brand kit, compare quality

### Sprint 3: Playground + Polish
1. "Import from Website" button in playground
2. Visual preview of extracted tokens (color swatches, type samples, spacing visualization)
3. LLM enhancement pass (optional: analyze screenshots + tokens to produce narrative guidelines)
4. Brand kit editor in playground for manual tweaks

## Dependencies

- Playwright is already installed on the droplet (used for rendering)
- No new npm packages needed for basic extraction
- Color clustering: simple Euclidean distance in RGB is fine for v1 (CIEDE2000 for v2)

## Risk / Open Questions

1. **Dynamic sites**: SPAs that require interaction to show content. Mitigation: wait for networkidle + 3s timeout. Can add scroll-to-reveal later.
2. **Dark mode**: Many sites auto-detect. Mitigation: extract both modes, let user pick.
3. **Authentication**: Some sites require login. Mitigation: Phase 1 is public URLs only. Could add cookie/auth support later.
4. **Extraction accuracy**: Computed styles are noisy. Mitigation: cluster aggressively, focus on high-usage values.
5. **Token size in prompts**: Extended design system adds ~500-800 tokens to prompts. Acceptable given current prompt sizes.
