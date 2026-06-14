# Media Producer MCP -- Architecture

Living document. Updated as the system evolves.
Last updated: 2026-06-14

## What This Is

A media production platform that generates videos, images, GIFs, and decks from text prompts. Built on HTML + GSAP + Playwright + ffmpeg. Runs as an MCP server.

**Repo:** `ferrem01/media-producer-mcp`
**Server:** 159.203.115.164:3200
**Stack:** TypeScript, Node.js, Playwright, ffmpeg, GSAP

---

## Core Data Model

### Project
The top-level container. Format-agnostic (video, image, slideshow, gif, etc.).

```
project.json
├── project_id, tenant_id, name, format, status
├── canvas: { width, height, fps, preset }
├── brand_kit: { colors, fonts, logos, assets, style, guidelines }
├── scenes: Scene[]
├── audio: { tracks, ducking }
├── assets: Asset[]
└── speaker_track: { clips[] }
```

### Scene
One segment of the timeline. Contains one or more components stacked by z_index.

Key fields:
- `duration_seconds` -- how long the scene lasts
- `transition_in` -- how it enters (crossfade, blur-crossfade, zoom-through, slide-*, wipe-*, iris, glitch-cut, scale-rotate, etc.)
- `components[]` -- the visual elements
- `transparent_background` -- true for speaker scenes (content overlays the speaker video)
- `content_region` -- constrains components to a region (e.g. right 42%) so the speaker is visible

### Sequence
A sequence is a special type of freeform scene with multiple "beats" on one continuous GSAP timeline. Instead of generating separate scenes that get crossfaded together (which produces a slideshow feel), a sequence keeps elements on a persistent stage and transforms them across beats.

Key fields on Scene:
- `beats[]` -- array of SequenceBeat objects, each with label, brief, duration, and optional voiceover
- When `beats` is present, the freeform generator writes ONE HTML document with a single master timeline where each beat is a labeled section

```typescript
interface SequenceBeat {
  label: string;           // GSAP timeline label
  brief: string;           // what happens in this beat
  duration_seconds: number;
  voiceover_text?: string;
}
```

Example: a 4-beat product walkthrough (25s total) generates one HTML file where the UI panel appears in beat 1, morphs in beat 2, fills with content in beat 3, and resolves with a success state in beat 4. No cuts, no transitions -- one continuous take.

Use sequences for: product walkthroughs, multi-step demos, cause-and-effect narratives, any flow where elements should persist and transform.

### Component
A self-contained visual element. Each is a `.component.html` file with three sections:

```html
<template>  <!-- HTML structure -->
<style scoped>  <!-- CSS, uses brand CSS variables -->
<script>  <!-- createTimeline(el, data, ctx) returns GSAP timeline -->
```

Components reference brand kit values via CSS custom properties (`--mp-color-primary`, `--mp-font-family`, etc.). Data is bound via `data-bind` attributes and the `data` object passed to `createTimeline`.

**Component library:** 67 components across categories (titles, layouts, effects, media, data-viz, CTA, mockups). Both hand-crafted library components and LLM-generated custom components.

### Scene Templates
Pre-composed scene blueprints with premium visuals baked in. Unlike components (individual building blocks), templates are full scene compositions -- proven layouts with components, timing, and GSAP animation already wired together. The planner selects a template, fills content slots, and produces Apple-keynote-quality output without the LLM needing to write CSS or GSAP.

**Template catalog:** 33 templates across 5 categories (defined in `template-catalog.ts`). Each template is a `.scene.html` file in the `templates/` directory.

**How they work:**
1. Planner picks a template ID based on the narrative moment (e.g. `O1-big-statement` for an opening)
2. Planner fills the template content slots (e.g. `headline: "The Future of Marketing"`)
3. Scene generator loads the `.scene.html` file and applies slot values via SEARCH/REPLACE
4. Result is a fully styled, animated scene without any LLM-generated CSS or GSAP

#### Categories

**OPENINGS (5 templates)**
| ID | Name | When | Duration |
|----|------|------|----------|
| O1-big-statement | Big Statement | Opening scene, one powerful headline | 4-5s |
| O2-chapter-title | Chapter Title | Section divider between topics | 3-5s |
| O3-provocation | Provocation | Opening with a question or bold claim | 4-5s |
| O4-product-hero | Product Hero | Product reveal with 3D device frame | 5-7s |
| O5-logo-intro | Logo Intro | Brand intro with logo reveal | 3-5s |

**CONTENT (19 templates)**
| ID | Name | When | Duration |
|----|------|------|----------|
| C1-feature-spotlight | Feature Spotlight | Single feature or benefit highlight | 4-6s |
| C3-feature-grid | Feature Grid | 3-4 features as glassmorphic cards | 5-7s |
| C5-testimonial | Testimonial | Customer quote, social proof | 5-6s |
| C6-split-compare | Split Compare | Before/after, old way vs new way | 5-7s |
| C7-picture-in-picture | Picture-in-Picture | Text with floating product preview | 5-7s |
| C8-device-mockup | Device Mockup | Product UI in laptop frame | 5-7s |
| C9-logo-wall | Logo Wall | Customer/partner logo grid | 4-6s |
| C10-feature-stack | Feature Stack | Numbered vertical feature list | 5-7s |
| C11-process-steps | Process Steps | 3-step horizontal process flow | 5-7s |
| C12-icon-list | Icon List | Checklist of benefits with icons | 5-7s |
| C13-phone-mockup | Phone Mockup | 3D phone with app UI | 5-7s |
| C14-team-grid | Team Grid | Avatar circles with names/roles | 4-6s |
| C15-pricing-tiers | Pricing Tiers | Three-column pricing comparison | 5-7s |
| C16-case-study | Case Study | Data-backed customer story | 5-7s |
| C17-problem-solution | Problem/Solution | Pain point then solution reveal | 5-7s |
| C18-integration-grid | Integration Grid | App ecosystem connectivity grid | 5-7s |
| C19-timeline | Timeline/Roadmap | Horizontal milestone timeline | 5-7s |
| C20-faq-objection | FAQ/Objection | Question and answer reveal | 5-7s |
| C21-social-posts | Social Posts Wall | Social proof tweet cards | 5-7s |
| L1-lower-third | Lower Third | Broadcast-style name card | 4-6s |

**DATA (7 templates)**
| ID | Name | When | Duration |
|----|------|------|----------|
| D1-hero-stat | Hero Stat | Single impressive number reveal | 4-5s |
| D2-metric-trio | Metric Trio | Three related stats side by side | 5-6s |
| D3-before-after-stat | Before/After Stat | Impact comparison with arrow | 5-7s |
| D4-progress-bars | Progress Bars | Animated horizontal bar chart | 5-7s |
| D5-social-proof-counter | Social Proof Counter | Three big animated count-ups | 5-7s |
| D6-line-chart | Animated Line Chart | Growth trend line draws itself | 5-7s |
| D7-bar-chart | Animated Bar Chart | Category comparison bars | 5-7s |

**CLOSING (2 templates)**
| ID | Name | When | Duration |
|----|------|------|----------|
| E1-cta-finale | CTA Finale | Final call to action | 4-5s |
| E2-recap-grid | Recap Grid | 2x2 key takeaway summary | 5-7s |

**SPEAKER (3 templates)**
| ID | Name | When | Duration |
|----|------|------|----------|
| S1-speaker-spotlight | Speaker Spotlight | Speaker with content panel beside | 5-8s |
| S2-screencast-pip | Screencast with Speaker | Browser frame + PiP speaker circle | 5-8s |
| S3-speaker-lowerthird | Speaker with Lower Third | Speaker with broadcast name bar | 4-7s |

Speaker templates require `speaker_source` in project assets. When selected, they automatically set `transparent_background` and `content_region` on the scene.

### Speaker Track
The continuous camera/speaker video that plays underneath scene content.

```json
{
  "speaker_track": {
    "clips": [{
      "source": "/data/media-producer/tenant/assets/camera.mp4",
      "trim_start": 2,
      "trim_end": 60
    }]
  }
}
```

- **Continuous base layer.** The speaker video plays from start to finish, uninterrupted. Audio stays perfectly synced because the video is never sliced, seeked, or re-encoded per scene.
- **Content overlays the speaker.** Scenes with `transparent_background: true` render transparent content that composites on top of the speaker base.
- **Component-level speaker embedding.** Any component can show the speaker video by setting `source: "speaker"` or `pip_source: "speaker"` in its data. The system resolves `"speaker"` to the actual video URL. This works for PiP circles, full-screen backgrounds, or any other layout the component defines.
- **Trim values** (`trim_start`, `trim_end`, `start`) control which portion of the source video is used. Global timeline time 0 maps to `trim_start`.

---

## Unified Render Pipeline

One render entry point (`render.ts`) routes by format. Same scene assembly, same component resolution, same project model regardless of output type.

### Format Routing
```
render(project)
  ├── video/slideshow
  │   ├── speaker_track? → renderVideoWithSpeakerTrack()
  │   └── no speaker   → renderVideo()
  ├── image/one-pager/thumbnail → renderImage()
  ├── presentation → renderDeck()
  ├── gif → renderGif()
  ├── social → renderSocial()
  └── email-header → renderEmailHeader()
```

Every format shares:
- `loadComponentSources()` -- resolves components from global lib, tenant dir, and project dir
- `scene-assembler.ts` -- builds HTML from scene definition + component templates
- `scene-worker.ts` -- Playwright frame capture in child process
- Brand kit CSS variable injection
- `source: "speaker"` resolution

### Video Render (no speaker track)
1. Render each scene as frames via Playwright (parallel batches in child processes)
2. Render transitions as frame sequences between adjacent scenes
3. Concat segments (scene + transition + scene + ...) via ffmpeg
4. Mix audio (voiceover, music, SFX with volume envelope ducking)

### Speaker Track Render
1. **Build speaker base** -- concat clips, scale to canvas, apply trim
2. **Render all scenes as transparent PNGs** -- Playwright captures with `omitBackground: true`
3. **Render transitions as transparent PNGs** -- direct Playwright capture (not MP4 extraction)
4. **Stitch** into one continuous frame sequence
5. **Single-pass composite** -- overlay content frames onto speaker base via ffmpeg
6. **Audio mixing** -- project-level music/voiceover mixed with speaker audio

Key insight: transitions only affect the content layer. The speaker video plays through underneath, uninterrupted. The speaker is never sliced or re-encoded per scene.

### Scene Assembly
`scene-assembler.ts` takes a scene definition and produces a self-contained HTML document:
- Resolves component HTML from library (global, tenant, or project level)
- Binds data to templates
- Injects brand CSS variables
- Builds GSAP timeline
- Handles `source: "speaker"` resolution to actual video URLs

### Composite Assembly
`composite-assembler.ts` takes ALL scenes and produces a single HTML document:
- Every scene is a positioned div in one document (not separate iframes)
- Master GSAP timeline orchestrates scene visibility + per-scene animations
- Transitions are live GSAP tweens between scene containers
- Used by the preview SPA for instant scrubbing and live transitions

---

## Preview SPA (v2)

Interactive preview at `/preview?tenant=...&project=...`.

### Architecture (inspired by HyperFrames)

**Single Document Model.** All scenes are loaded into one iframe as a single HTML document (via composite-assembler). No per-scene iframe swapping.

**Transport Clock.** GSAP master timeline is always paused and seeked to the clock's current time on every requestAnimationFrame tick. GSAP never free-runs. This eliminates drift.

```
Transport Clock (rAF loop)
    ├── clock.now() → global time
    ├── Master GSAP Timeline (always paused, seeked each tick)
    │   ├── Scene 0 timeline
    │   ├── Transition 0→1
    │   ├── Scene 1 timeline
    │   └── ...
    ├── Unified Media Sync (syncMedia)
    │   ├── Speaker video (continuous, audio source)
    │   ├── Scene videos (inside iframe)
    │   └── Audio tracks (music, voiceover)
    └── UI Update (scrubber, time display, scene indicator)
```

**Unified Media Sync.** All media elements (speaker video, scene videos, audio tracks) go through one `syncMedia` function with three-tier drift correction:
- Tier 1 -- Hard sync (>500ms): unconditional seek
- Tier 2 -- Strict sync (>40ms, 2 consecutive samples): catches accumulated drift, skips playing videos to avoid stutter
- Tier 3 -- Force sync (>20ms): only on play/pause/seek transitions

**Speaker Video Handling:**
- Speaker bg `<video>` element sits behind the iframe, plays continuously
- Unmuted during playback (primary audio source for speaker scenes)
- Visible on transparent scenes, hidden behind opaque ones, but always playing
- Speaker-sourced scene videos (PiP, etc.) detected by URL match, synced to same timeline
- `trim_start`/`trim_end` from speaker track config respected

**Media Buffering.** Play button is disabled until all videos fire `canplaythrough`. Buffering overlay shown on the video area.

---

## LLM Pipeline

Prompt → finished project in multiple stages. One unified pipeline for all formats.

### Stages
1. **Expand Prompt** -- thin prompt → rich creative brief with scene count
2. **Creative Concept Director** (NEW) -- generates 3 distinct creative concepts at high temperature (0.9), self-selects the strongest one, outputs a "creative bible" with: the one-line concept, storytelling pattern, visual through-line, emotional arc, and visual style commitments. This bible is injected into the planner's context so all scenes serve ONE cohesive idea. Skipped for image format.
3. **Plan Storyboard** (unified planner) -- brief + creative bible → multi-scene storyboard. Per-scene decision: freeform, sequence, template, library component, or custom. Picks transitions, sets speaker track flags, assigns content regions.
4. **Media Enrichment** -- generates hero images (OpenAI gpt-image-1), captures screenshots, resolves assets. Runs between planning and scene generation.
5. **Scene Generation** -- per scene, either fills data for the chosen library component, generates a custom `.component.html` via LLM, or (for sequences) generates a multi-beat continuous HTML doc
6. **Critique** -- vision-based review of rendered frames. Can trigger scene revision.

### Creativity Parameter
`creativity` (0-1) controls the library vs custom component mix:
- **0.0-0.3**: strongly prefers library components. Faster, more consistent.
- **0.4-0.6**: balanced. Planner decides per-scene based on what fits.
- **0.7-1.0**: all custom components. Every scene gets a unique LLM-generated `.component.html`.

This replaced the old `mode: "freeform" | "structured"` split. There's no separate code path -- it's one pipeline with a dial.

### Format-Specific Prompts
All LLM prompts are format-aware (video/image/deck/gif/social). Visual design rules and GSAP animation skills are injected into component generator prompts. Speaker track awareness is passed through to the planner when a speaker source is provided.

---

## Audio System

- **Tracks:** voiceover, music, SFX -- each with volume, fade in/out, loop
- **Ducking:** time-based volume envelope. When voiceover is active, music volume drops to `ducked_volume` (e.g. 0.12)
- **Speaker audio:** comes from the speaker track video itself, not a separate audio track
- **Mixing:** always post-production via ffmpeg. Speaker base audio + project tracks mixed in final pass

---

## MCP Tools

14 tools exposed via MCP protocol:
- **CRUD:** create, get, list, add, update, remove, reorder
- **Brand:** brand kit management
- **Render:** trigger renders, job status/wait
- **Generate:** LLM-powered full project generation
- **Capture:** screenshot URLs via Playwright, save as assets
- **Audio:** TTS generation, track management

---

## File Layout

```
/data/media-producer/
├── {tenant-id}/
│   ├── brand-kit/           # logos, fonts, backgrounds
│   ├── assets/              # uploaded/captured media
│   └── projects/
│       └── {project-id}/
│           ├── project.json  # project definition
│           ├── components/   # custom components for this project
│           ├── assets/       # project-specific assets
│           ├── output/       # rendered output (video, images, etc.)
│           └── _work/        # intermediate render artifacts
```

```
src/
├── core/
│   ├── types.ts              # all interfaces
│   ├── scene-assembler.ts    # single scene → HTML
│   ├── composite-assembler.ts # all scenes → single HTML doc
│   ├── render.ts             # standard render pipeline
│   ├── sequence-assembler.ts # multi-beat sequence scene assembly
│   ├── speaker-track.ts      # speaker track render pipeline
│   ├── capture.ts            # Playwright screenshot capture
│   └── scene-worker.ts       # child process frame capture
├── llm/
│   ├── pipeline.ts           # orchestrates all LLM stages
│   ├── concept-director.ts   # creative concept stage (NEW: generates ONE unifying idea)
│   ├── prompts.ts            # system prompts per stage
│   ├── unified-planner.ts    # scene planning (supports sequences)
│   ├── freeform-agentic.ts   # agentic freeform HTML generation (supports beats)
│   ├── scene-generator.ts    # routes scenes to appropriate generator
│   ├── template-catalog.ts   # scene template catalog (33 templates)
│   ├── sequence-converter.ts # merges consecutive scenes into sequences
│   └── catalog.ts            # component library metadata
├── preview-app/
│   └── preview-app.ts        # preview SPA (single file, embedded HTML/CSS/JS)
├── playground-app/
│   └── playground-app.ts     # component playground
├── persistence/
│   └── project.ts            # project CRUD
├── templates/                # scene template .scene.html files (33)
├── server.ts                 # MCP tool definitions
└── index.ts                  # HTTP server + routes
```


## Asset URL Normalization

**Rule: All internal asset URLs must be relative paths. Never store or serve `http://localhost:*` URLs.**

### Problem

The server runs on `localhost:3200` internally. Multiple code paths (brand kit extraction, LLM-generated components, media enrichment) were producing absolute `http://localhost:3200/assets/...` URLs. These work on the server but break when accessed from any external client (phone, browser, different machine).

### Solution: Defense in Depth

URL normalization is enforced at **four layers** so localhost URLs can never leak to clients, even if one layer is bypassed:

```
Layer 1: Source Generation (LLM/enrichment output)
    ↓ normalizeHtmlUrls() on component HTML
Layer 2: Data Persistence (saveProject, saveBrandKit)
    ↓ normalizeAllUrls() on full objects before JSON.stringify
Layer 3: HTML Assembly (scene-assembler, composite-assembler)
    ↓ normalizeHtmlUrls() on final HTML output
Layer 4: Component Save (component-generator)
    ↓ normalizeHtmlUrls() on .component.html before writeFile
```

### Implementation

**`src/core/normalize-urls.ts`** -- three exported functions:

| Function | Input | Use Case |
|----------|-------|----------|
| `normalizeAssetUrl(url)` | Single URL string | Point normalization |
| `normalizeAllUrls(value)` | Any JSON value (deep walk) | Project/brand kit save |
| `normalizeHtmlUrls(html)` | HTML string | Component/scene/composite output |

All strip `http(s)://localhost:<any-port>/` → `/` via regex. External URLs (cdn, https://...) are untouched.

### Where It's Wired

| File | Function | Layer |
|------|----------|-------|
| `persistence/project.ts` | `saveProject()` | `normalizeAllUrls(project)` before write |
| `persistence/brand-kit.ts` | `saveBrandKit()` | `normalizeAllUrls(kit)` before write |
| `core/scene-assembler.ts` | `assembleScene()` | `normalizeHtmlUrls(html)` on return |
| `core/composite-assembler.ts` | `assembleComposite()` | `normalizeHtmlUrls(html)` on return |
| `core/component-generator.ts` | `saveTenantComponent()` | `normalizeHtmlUrls(source)` before write |
| `llm/media-enrichment.ts` | image URL generation | Uses relative `/assets/...` paths (source fix) |
| `llm/image-enrichment.ts` | image URL generation | Uses relative `/assets/...` paths (source fix) |

### URL Format Rules

- **Internal assets:** Always `/assets/{tenant}/...` (relative path, no host)
- **Brand kit assets:** `/assets/{tenant}/brand-kit/{category}/{file}`
- **Project assets:** `/assets/{tenant}/projects/{project}/assets/{file}`
- **External URLs:** Full `https://...` (CDN, stock photos, etc.) -- left untouched
- **Data paths:** `/data/media-producer/...` (server-side only, resolved by `resolveAudioUrl` in preview)

### Tests

`test/normalize-urls.test.ts` -- 13 tests covering single URL, deep object, HTML attribute, CSS url(), multiple occurrences, empty/external edge cases.

---

## Key Design Decisions

1. **HTML + GSAP, not Remotion.** Components are plain HTML/CSS/JS with GSAP timelines. No React, no bundler. Simpler, faster, and GSAP provides better animation control.

2. **Single-file components.** `<template>` + `<style scoped>` + `<script>` in one `.component.html` file. Self-contained, easy to generate with LLMs, easy to preview.

3. **Speaker as continuous base layer.** The speaker video is never cut or re-encoded per scene. It plays start to finish. Content overlays it. Any component can embed it via `source: "speaker"`.

4. **Transport clock, not GSAP free-run.** GSAP timelines are always paused and seeked. The clock is the sole time authority. Eliminates drift between video, audio, and animations.

5. **Three-tier drift correction.** Hard sync for seeks, strict sync for gradual drift (skipping playing videos to avoid stutter), force sync on transitions. From HyperFrames.

6. **Composite preview.** All scenes in one document, one master timeline. Instant scrubbing across scene boundaries. Live GSAP transitions. No per-scene iframe reloading.

7. **Format-agnostic project model.** `project.json` works for video, image, slideshow, GIF, email header, etc. The render pipeline adapts based on `format`.

8. **Brand kit as CSS variables.** Components don't hardcode colors or fonts. They use `--mp-color-primary`, `--mp-font-family`, etc. Brand consistency is automatic. Freeform generator is instructed to use `var(--mp-color-*)` exclusively -- hex values are never shown in the prompt.

9. **Creative concept before scenes.** The concept director runs before the planner and commits to ONE creative idea. Without it, the planner generates disconnected scene ideas that feel like a slide deck. The creative bible (concept + pattern + through-line + emotional arc) is injected into the planner so all scenes serve one cohesive vision.

10. **Sequences for continuity.** When multiple steps should flow as one continuous motion (walkthroughs, demos, cause-and-effect), the planner outputs a "sequence" -- a freeform scene with multiple beats on one persistent stage. The freeform generator writes one HTML doc with one master GSAP timeline, and elements persist and transform across beats. This produces the premium "single take" feel that separate scenes + crossfades cannot achieve.
n9. **Relative asset URLs only.** All internal asset URLs are stored and served as relative paths (`/assets/...`), never absolute localhost URLs. Enforced at four layers: source generation, data persistence, HTML assembly, and component save. See § "Asset URL Normalization" above.

---

## Playground & Tenant Components

Full documentation: [PLAYGROUND.md](./PLAYGROUND.md)

### Playground (`/playground`)
Interactive three-panel tool for browsing, creating, and iterating on components:
- **Library browser**: 59 built-in components across 7 categories
- **Live preview**: Scaled iframe with GSAP animation, canvas size selector, play/restart
- **Schema-driven data editor**: Typed form controls (text, number, color picker, enum dropdown, boolean toggle, array builder) generated from component schemas. Form/JSON toggle.
- **Script builder**: Visual editor for interactive script actions (cursor, typing, camera, UI). Dropdown of standard + custom actions with type-matched param inputs.
- **LLM generate**: Create new components from text prompts
- **LLM iterate**: Chat-based modification of component source
- **Save to Library**: Persist as tenant component

### Tenant Components
Custom components per tenant, stored in `/data/media-producer/{tenant}/components/`. Full CRUD via playground UI and MCP tools. Version history (last 5 snapshots). Available to the planner for that tenant's projects.

### Script System
GSAP-based interactive animations. Shared utilities (script-runner.js, cursor.js, camera.js, typing.js) loaded into every scene and playground preview. 8 scriptable library components. Standard actions: cursor movement, typing, camera zoom/pan/rotate, UI interactions. Custom action handlers per component. Planner integration for automated script generation.

## Roadmap

Prioritized list of what's next. Updated as things ship.

### High Priority -- Architecture Refactors

These three refactors address fundamental architecture issues identified 2026-06-14. They should be done before new feature work.

- [ ] **Refactor 1: Fix Pipeline Data Loss** -- CreativeBible from concept-director gets flattened to prose and prepended to the planner prompt. Structured data (colorMood, motionPersonality, spatialStrategy) becomes text the LLM may ignore. Fix: pass CreativeBible as structured data through the entire pipeline. Add validation that planner output respects the bible's constraints. No data should be dropped between expander -> concept director -> planner -> scene generator.

- [ ] **Refactor 2: Unify Scenes and Sequences** -- Sequences are a bolt-on parallel concept with a separate assembler, converter, and types. The real issue was scene-assembler starting all component timelines at t=0. Fix: make choreography[] a first-class optional field on Scene. Extend scene-assembler to handle timed component visibility. Kill sequence-assembler.ts, sequence-converter.ts, and the "sequence" concept. A scene can be any length with optional choreographed timing.

- [ ] **Refactor 3: Hybrid Codegen Path (Components as Building Blocks)** -- Three paths exist but none lets codegen USE library components as embedded building blocks. Library = data binding only. Freeform = all-new HTML, reads components for reference only. Fix: build a hybrid path where the LLM receives actual component source code and embeds it into custom scenes with custom layout, transitions, and elements around it. Components become composable building blocks for codegen.

### High Priority -- Features
- [x] **Tenant Component Playground** -- three-panel layout with LLM-driven generation, chat iteration, schema-driven form editor, script builder, tenant CRUD. See [PLAYGROUND.md](./PLAYGROUND.md).
- [x] **Creative concept director** -- generates ONE unifying creative concept before scene planning. 3 concepts at temp 0.9, self-selects best, outputs creative bible.
- [x] **Sequence scenes** -- multi-beat continuous scenes for product walkthroughs and demos. Planner outputs beats, freeform generator builds one continuous HTML doc.
- [x] **Deterministic brand CSS injection** -- freeform generator uses var(--mp-color-*) exclusively, no hex values shown in prompt.
- [ ] **Motion-aware critique** -- sample 5-9 frames across timeline instead of one still at midpoint. Add project-level consistency check across all scenes.
- [ ] **Code-enforced mandatory behaviors** -- voiceover guaranteed per non-bookend scene, intro/outro exempt from critique, brand theme enforced deterministically.
- [ ] **Render speed** -- showcase test took 529s for 40s video. Look at parallelizing frame captures further, draft resolution mode, frame skip for previews.

### Medium Priority
- [ ] **Preview SPA polish** -- scene click auto-plays from that point, playback rate (0.5x/1x/2x), keyboard shortcuts (space, arrow keys)
- [ ] **Preview multi-clip speaker** -- preview SPA only reads `clips[0]`, render pipeline already handles multiple clips
- [ ] **frameADataUri URL leak** -- old transition HTML was leaking literal JS into img src. Probably dead after Phase 3 cleanup but verify render pipeline doesn't have same issue.

### Lower Priority
- [ ] **Auth for preview SPA** -- anyone with the URL can access any tenant's projects. Token param exists but isn't validated. Low priority unless sharing preview links externally.

### Done / Already Working
- [x] GIF export (`renderGif` -- captures all scene frames, encodes via ffmpeg)
- [x] Social batch export (`renderSocial` -- first scene at multiple social sizes)
- [x] Deck/PDF export (`renderDeck` -- each scene as PNG slide)
- [x] Email header export (`renderEmailHeader` -- static image)
- [x] Multiple speaker clips (`speaker-track.ts` handles concat of multiple clips)
- [x] Preview SPA v2 (transport clock, composite, unified media sync)
- [x] Old overlay system removed (replaced by component-level `source: "speaker"`)
- [x] Tenant Component Playground (three-panel, LLM generate/iterate, schema form editor, script builder)
- [x] Script system (GSAP-based: cursor, typing, camera, custom handlers, planner integration)
- [x] Schema defaults system (contextual sample data generation from component schemas)
