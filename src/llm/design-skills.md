# Design Skills — Media Producer MCP

These rules govern every scene you generate. Scenes are HTML+CSS+GSAP captured frame-by-frame at 1920×1080 by Playwright then encoded to video. They are **not** web pages. Treat every frame like a motion graphics canvas.

---

## 1. Shadow Recipes

Flat elements look like PowerPoint. Depth separates professional output from templates.

### Card Shadows (multi-layer: contact + ambient)
```css
/* Standard card — close sharp shadow + wide ambient */
.card {
  box-shadow:
    0 1px 3px rgba(0,0,0,0.12),    /* contact: tight, grounding */
    0 8px 24px rgba(0,0,0,0.08);    /* ambient: wide, atmospheric */
}

/* Elevated card — hero element */
.card-hero {
  box-shadow:
    0 2px 4px rgba(0,0,0,0.10),
    0 16px 48px rgba(0,0,0,0.12),
    0 32px 64px rgba(0,0,0,0.04);   /* third layer: subtle halo */
}
```

### Floating Elements
```css
/* Floating badge or accent piece */
.floating {
  box-shadow:
    0 4px 12px rgba(0,0,0,0.15),
    0 20px 40px rgba(0,0,0,0.10);
  /* Animate shadow spread on entrance for "landing" feel */
}
```

### Text Shadows (depth, not glow)
```css
/* Subtle lift on headlines over images */
.headline-over-image {
  text-shadow: 0 2px 8px rgba(0,0,0,0.25);
}

/* Dark mode headline warmth */
.headline-dark {
  text-shadow: 0 0 40px rgba(255,140,50,0.08);
}
```

**Rules:** Always two shadow layers minimum on cards. Tint shadow color toward the background hue — `rgba(30,20,60,0.10)` on a purple scene, not generic black. Animate shadow on entrance: start tighter, expand to resting state.

---

## 2. Easing Curve Library

Using `power2.out` on everything is the #1 AI motion tell. Vary eases deliberately.

### Named Curves

| Name | GSAP | CSS cubic-bezier | Use For |
|------|------|-----------------|---------|
| **Confident** | `power3.out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Hero entrances, primary content |
| **Gentle** | `power1.inOut` | `cubic-bezier(0.45, 0, 0.55, 1)` | Ambient drift, breathing, BG motion |
| **Dramatic** | `power4.out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Slams, snaps, impact moments |
| **Playful** | `back.out(1.4)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy entrances, badges, icons |
| **Mechanical** | `steps(8)` | `steps(8, end)` | Counters, typewriter, data ticks |
| **Exit** | `power2.in` | `cubic-bezier(0.55, 0, 1, 0.45)` | All exits — accelerate OUT |
| **Elastic** | `elastic.out(1, 0.5)` | — | Attention moments, single accents only |
| **Snap** | `power4.inOut` | `cubic-bezier(0.77, 0, 0.18, 1)` | Layout shifts, panel slides, morphs |

### Rules
- **Entrances:** Always `.out` eases (decelerate in). Duration 0.6–1.0s.
- **Exits:** Always `.in` eases (accelerate out). Duration 0.3–0.5s. Exits are faster than entrances.
- **Ambient:** Always `.inOut` eases. Duration 2–6s, repeat forever.
- **Never** use the same ease on more than two consecutive tweens in a timeline.
- **Slowest tween should be ≥3× the duration of the fastest.** If your fastest is 0.3s, something must be ≥0.9s.

---

## 3. Typography System

Video text is NOT web text. A 16px paragraph is invisible at 1080p.

### Size Scale (1920×1080 canvas)

| Role | Size | Weight | Use |
|------|------|--------|-----|
| **Hero headline** | 80–120px | 800–900 | One per scene max |
| **Section headline** | 56–72px | 700 | Titles, labels |
| **Subhead** | 36–48px | 500–600 | Supporting context |
| **Body** | 28–42px | 300–400 | Descriptions, lists |
| **Caption/label** | 20–28px | 400–500, uppercase, tracked | Tags, metadata |
| **Accent number** | 96–160px | 800–900 | Stats, counters, KPIs |

### Weight Hierarchy
Communicate hierarchy through **weight + color**, not just size alone:
```css
.headline { font-weight: 800; color: #1a1a2e; }          /* Heavy + dark */
.subhead  { font-weight: 500; color: #4a4a6a; }          /* Medium + muted */
.body     { font-weight: 350; color: #6b6b8a; }          /* Light + lighter */
.label    { font-weight: 600; color: #8b8ba0; letter-spacing: 0.08em; text-transform: uppercase; }
```

### Font Pairing
Pair a **serif** with a **sans-serif**. Two sans-serifs look generic.

```html
<!-- Recommended pairings (Google Fonts) -->
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800;900&family=Space+Grotesk:wght@300;400;500;700&display=swap" rel="stylesheet">

<!-- Mono accent for data/tech scenes -->
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
```

**Rule:** Headlines in serif, body/labels in sans. Or: headlines in heavy sans, labels in serif italic. Never two geometrics (Inter + Poppins = mush).

### Fill the Frame
Hero text should span **60–80% of frame width**. A headline floating in a sea of empty space is a wasted frame.

---

## 4. Color Patterns

### Warm Neutrals, Not Pure Values
```css
/* ✗ WRONG — AI defaults */
background: #ffffff;
color: #000000;

/* ✓ RIGHT — warm off-whites, tinted darks */
background: #f5f3ee;            /* warm cream */
color: #1a1a2e;                 /* navy-tinted black */

/* Tint neutrals toward your accent hue */
/* If accent is coral (#ff6b6b): */
background: #fdf5f3;            /* blush white */
color: #2d1f1f;                 /* warm charcoal */
```

### Accent Strategy
- **One primary accent** per scene. Two max.
- Apply accent to: one headline word, one shape, one data point. Not everything.
- Accent backgrounds: use at 8–12% opacity for tinted panels, full strength only on small elements (pills, dots, underlines).

### Low-Contrast Dividers
```css
.divider { border-top: 1px solid rgba(0,0,0,0.06); }       /* light mode */
.divider-dark { border-top: 1px solid rgba(255,255,255,0.08); }  /* dark mode */
```
Hard borders (#ccc, #333) look dated. Barely-visible dividers feel premium.

### Dark Mode Done Right
```css
/* ✗ AI default dark — lifeless */
background: #000000;
color: #ffffff;

/* ✓ Rich dark — warm, layered */
background: #0f0f1a;            /* deep navy, not pure black */
color: #e8e4df;                 /* warm off-white */

/* Layer with surface colors */
.surface-1 { background: rgba(255,255,255,0.03); }  /* subtle card */
.surface-2 { background: rgba(255,255,255,0.06); }  /* elevated card */
.surface-3 { background: rgba(255,255,255,0.10); }  /* active/hover */
```
Dark backgrounds need a faint radial glow near content to feel alive:
```css
.scene-dark::before {
  content: '';
  position: absolute;
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
}
```

---

## 5. Layout Principles

### Layout BEFORE Animation
Position every element at its **hero frame** state first. Only then define where it animates from. If your layout only works mid-tween, it's broken.

### Fill the Frame
This is video, not a web page. Content floating in dead center with massive margins is the biggest AI tell.

```css
/* ✗ Web thinking — centered island */
.container { max-width: 800px; margin: 0 auto; padding: 20px; }

/* ✓ Video thinking — fill the canvas */
.scene { width: 1920px; height: 1080px; padding: 80px 120px; display: flex; }
```

**Rules:**
- Hero text: 60–80% of frame width
- Cards and panels: 40–60% of frame width minimum
- Padding: 60–140px from frame edges. Web-scale padding (16–32px) is invisible.
- Borders: 2–4px minimum. 1px is invisible on video.

### Split-Frame Layouts
Two focal points minimum per scene. Don't center one block.

```css
/* 60/40 split — data left, visual right */
.scene { display: flex; gap: 80px; padding: 100px; }
.left  { flex: 3; }  /* 60% — headlines, text, data */
.right { flex: 2; }  /* 40% — illustration, chart, image */
```

### Anchor to Edges
Pin elements to frame edges for structural tension. Center-floating everything looks weightless.

```css
/* Top-left brand anchor + bottom-right CTA = diagonal tension */
.brand { position: absolute; top: 60px; left: 80px; }
.cta   { position: absolute; bottom: 60px; right: 80px; }

/* Full-bleed accent bar — gives scene structure */
.accent-bar {
  position: absolute; left: 0; top: 0;
  width: 8px; height: 100%;
  background: var(--accent);
}
```

### Structural Elements
Use rules, dividers, and border panels to break up flat scenes:
```css
.panel {
  border: 1.5px solid rgba(0,0,0,0.08);
  border-radius: 20px;
  padding: 48px;
}
.rule-vertical {
  width: 1.5px;
  height: 200px;
  background: rgba(0,0,0,0.08);
  margin: 0 60px;
}
```

---

## 6. Animation Principles

### Scene Structure: Build → Breathe → Resolve
Every scene has three acts within its duration:

| Phase | Timeline % | What Happens |
|-------|-----------|--------------|
| **Build** | 0–30% | Elements enter. Stagger in hierarchy order. |
| **Breathe** | 30–70% | Hold. Ambient motion only. Content is readable. |
| **Resolve** | 70–100% | Exit or transform to next state. |

### Entrances vs. Exits

```javascript
// ✓ Entrances: gsap.from() — element arrives at its CSS position
gsap.from('.headline', {
  y: 60, opacity: 0, duration: 0.8,
  ease: 'power3.out'
});

// ✓ Exits: gsap.to() — element leaves from its CSS position
gsap.to('.headline', {
  y: -40, opacity: 0, duration: 0.4,
  ease: 'power2.in'
});
```
**Exits are always faster than entrances.** Entrance 0.6–1.0s → Exit 0.3–0.5s.

### Stagger Timing
Total stagger spread must stay under 500ms regardless of element count:

```javascript
// 4 items: stagger 0.12 (total 0.36s) ✓
gsap.from('.card', { y: 40, opacity: 0, stagger: 0.12, ease: 'power3.out' });

// 12 items: stagger 0.04 (total 0.44s) ✓
gsap.from('.item', { y: 30, opacity: 0, stagger: 0.04, ease: 'power3.out' });

// ✗ 12 items at stagger: 0.15 = 1.65s total — audience is asleep
```

### Choreography IS Hierarchy
First to move = most important. Build entrance order deliberately:
1. **Hero headline** enters first (or a background wipe)
2. **Supporting text** follows 0.2–0.4s later
3. **Data/visuals** stagger in
4. **Decorative elements** last

### Ambient Motion — Nothing Is Static
Every decorative element must breathe:

```javascript
// Background glow drifts
gsap.to('.bg-glow', {
  x: 30, y: -20, scale: 1.05,
  duration: 4, ease: 'power1.inOut',
  yoyo: true, repeat: -1
});

// Accent shape rotates slowly
gsap.to('.accent-ring', {
  rotation: 360, duration: 20,
  ease: 'none', repeat: -1
});

// Floating badge bobs
gsap.to('.badge', {
  y: -8, duration: 2, ease: 'power1.inOut',
  yoyo: true, repeat: -1
});
```

### Motion Verb Vocabulary
Use varied entrance directions and styles. Match motion to meaning:

| Verb | Implementation | When |
|------|---------------|------|
| **SLAM** | `y: -200, duration: 0.3, ease: 'power4.out'` | Impact moments, big numbers |
| **DRIFT** | `x: 80, opacity: 0, duration: 1.2, ease: 'power1.out'` | Gentle context, subtitles |
| **SNAP** | `scale: 0, duration: 0.4, ease: 'back.out(1.7)'` | Badges, icons, buttons |
| **WIPE** | `clipPath` animate from edge | Scene transitions, reveals |
| **MORPH** | Tween width/height/borderRadius/color | State changes, before→after |
| **PULSE** | `scale: 1.05, yoyo, repeat: -1` | Attention, live indicators |
| **TYPEWRITE** | Reveal characters via `textContent` in a stagger | Data, quotes, commands |

### Surface Continuity
Morph between states — don't jump-cut:
```javascript
// ✗ Jump-cut: hide element A, show element B
// ✓ Morph: animate A's properties to become B
gsap.to('.card', {
  width: 600, height: 400, borderRadius: 24,
  backgroundColor: '#1a1a2e', color: '#ffffff',
  duration: 0.8, ease: 'power4.inOut'
});
```

---

## 7. Border Radius System

Consistent radius creates visual cohesion. Random radii look broken.

| Element | Radius | Example |
|---------|--------|---------|
| **Full-scene panels** | 0px | Bleed to edges |
| **Large cards** | 20–24px | Content cards, image containers |
| **Inner cards/sections** | 12–16px | Nested panels, code blocks |
| **Buttons/inputs** | 8–12px | CTAs, form fields |
| **Pills/badges/tags** | 100px (full pill) | Status badges, category tags |
| **Avatars/icons** | 50% | Circular elements |

**Inner radius rule:** If a card has 24px radius and 16px padding, inner elements get `24 - 16 = 8px` radius for concentric harmony.

---

## 8. Background Treatment

A flat solid-color background is a blank canvas crime. Every scene needs depth.

### Radial Glow
```css
.scene::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(
    ellipse 80% 60% at 30% 40%,
    rgba(99,102,241,0.06) 0%,
    transparent 70%
  );
}
```

### Ghost Text / Watermark
Large, barely-visible text adds texture:
```css
.ghost-text {
  position: absolute;
  font-size: 280px; font-weight: 900;
  color: rgba(0,0,0,0.02);       /* light mode */
  /* color: rgba(255,255,255,0.03); dark mode */
  white-space: nowrap;
  user-select: none;
}
```

### Grain Overlay
```css
.scene::after {
  content: ''; position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.03;
  pointer-events: none;
  mix-blend-mode: overlay;
}
```

### Grid Pattern (tech/data scenes)
```css
.grid-bg {
  background-image:
    linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px);
  background-size: 60px 60px;
}
```

### Accent Lines
Diagonal or horizontal ruled lines at low opacity:
```css
.accent-line {
  position: absolute;
  width: 300px; height: 2px;
  background: linear-gradient(90deg, var(--accent), transparent);
  opacity: 0.3;
}
```

**Rule:** Animate ALL decorative background elements. Glows drift. Grids scroll slowly. Ghost text pans. Nothing is static.

---

## 9. Anti-Patterns — What LLMs Always Get Wrong

### ✗ Same Ease on Every Tween
```javascript
// ✗ Monoculture — everything moves identically
gsap.from('.a', { y: 30, opacity: 0, ease: 'power2.out' });
gsap.from('.b', { y: 30, opacity: 0, ease: 'power2.out' });
gsap.from('.c', { y: 30, opacity: 0, ease: 'power2.out' });

// ✓ Varied — each element has character
gsap.from('.a', { y: 60, opacity: 0, ease: 'power3.out', duration: 0.8 });
gsap.from('.b', { x: -40, opacity: 0, ease: 'power2.out', duration: 0.6 });
gsap.from('.c', { scale: 0.8, opacity: 0, ease: 'back.out(1.4)', duration: 0.5 });
```

### ✗ Same Entrance Direction
Not everything slides up from `y: 30`. Mix directions: headlines from left, data from right, badges scale in, backgrounds wipe.

### ✗ Everything Centered
Center-centered layouts with equal padding on all sides look like placeholder wireframes. Use split frames, asymmetric padding, edge-anchored elements.

### ✗ Pure Black or White
`#000000` and `#ffffff` exist nowhere in nature. Tint every neutral toward your scene's accent hue.

### ✗ Web-Sized Text
If your largest text is under 56px, it will be unreadable. Headlines: 80–120px. Body: 28–42px. Labels: 20–28px.

### ✗ Static Decoratives
Every decorative shape, glow, line, and accent must move. Even 2px of drift over 4 seconds makes a scene feel alive versus dead.

### ✗ Linear Timing
`ease: 'none'` is for infinite rotations only. Every entrance, exit, and emphasis needs a curve.

### ✗ Gradient Text as Default
`background-clip: text` is the #1 "AI made this" tell. Use it sparingly -- once per project max, and only on hero moments.

### ✗ Ghost Watermark Text in Every Scene
Large semi-transparent background words ("DATA", "CONNECT", "INSIGHTS") are the #2 AI tell. Use ghost text in ONE scene per video max, not every scene. Instead, vary your background texture: use radial glows, grid patterns, accent lines, or grain. If you find yourself reaching for ghost text, you haven't designed the background yet.

### ✗ Missing Scene Structure
Don't animate everything at time 0. Build (staggered entrances) → Breathe (hold for readability) → Resolve (exits or transition). Every scene needs all three phases.

---

## Quick Reference: Element Checklist

Before submitting any scene, verify:

- [ ] **Typography:** Serif + sans paired. Sizes ≥28px body, ≥64px headlines. Weight hierarchy used.
- [ ] **Colors:** No pure #000 or #fff. Neutrals tinted toward accent. One accent color, used sparingly.
- [ ] **Shadows:** Cards have 2+ shadow layers. Shadows tinted toward BG hue.
- [ ] **Layout:** Content fills 60%+ of frame. Two focal points minimum. Padding ≥60px from edges.
- [ ] **Easing:** Three or more different eases in the scene. No `power2.out` monoculture.
- [ ] **Timing:** Slowest tween ≥3× fastest. Entrances longer than exits. Stagger total <500ms.
- [ ] **Structure:** Build (0–30%) → Breathe (30–70%) → Resolve (70–100%).
- [ ] **Background:** Not a flat solid. Has glow, grain, grid, ghost text, or accent lines.
- [ ] **Ambient:** All decorative elements animate (drift, breathe, rotate).
- [ ] **Radius:** Consistent system. Inner radius = outer radius − padding.
- [ ] **Borders:** ≥2px for visibility. Dividers at rgba opacity, not hex colors.
