# CLAUDE.md — working guide for this repo

Read this first at the start of a session. It captures how the system fits
together, how to build/run/test it, the **current visual-quality system**, and
the **environment gotchas** that will otherwise cost you an hour.

- Deeper design docs: `SPEC-motion-architecture.md` (motion layers, one-camera
  rule + anchors, component tiers, template pass-through -- read before touching
  choreography, camera, or component interfaces), `SPEC-timelapse.md` (the
  wait as a deliberate beat: sampled playback, elapsed clock, gap-funded film
  time, suggest/auto policy, and the THREE mapper twins that must agree --
  read before touching media EDL mapping), `SPEC.md` (visual-quality
  enforcement), `ARCHITECTURE.md`
  (data model — note it is partly stale: it still says `plan`/`brief`; current
  vocabulary is `storyboard`/`visual_notes`), `UNIFIED-CODEGEN-SPEC.md`,
  `ROADMAP.md`, `SPEC-studio.md`, `SPEC-brand-extraction.md`.
- Running change log + open items: `AMENDMENTS.md`.

## What this is

An MCP server that generates videos/images/decks from a text prompt. Stack:
TypeScript + Node + Playwright + ffmpeg + GSAP. Scenes are HTML+CSS+GSAP authored
by an LLM ("codegen"), captured frame-by-frame by Playwright, encoded by ffmpeg.
Repo: `ferrem01/media-producer-mcp`.

## Build / run / test

```
npm run build       # tsc + copy assets to dist/  (run before any dist-based test)
npm run typecheck   # tsc --noEmit
npm test            # vitest run  (see MP_WORKER_DIR below for the render suites)
npm run dev         # tsx watch src/index.ts  (NOTE: page.evaluate breaks under tsx —
                    #   esbuild injects __name; run the built dist for browser probes)
node dist/index.js  # start the MCP server (stdio + HTTP on MP_PORT, default 3200)
```

## The generation pipeline (entry: `runGeneratePipeline` in `src/llm/pipeline.ts`)

1. **Creative Director** (`creative-director.ts`) → a `Treatment` (concept,
   `visualStyle.{colorMood,typographyAttitude,motionPersonality,spatialStrategy}`,
   emotionalArc, directorNote). Takes the raw prompt directly (no expander step).
2. **Storyboard Builder** (`storyboard-builder.ts`) → `DraftScene[]`. Each scene has
   `purpose` (its job) + `visual_notes` (visual direction) + `components[]` + `voiceover_text`.
   The LLM is prompted to emit `purpose`/`visual_notes` JSON keys.
3. **Per-scene codegen** (`scene-generator.ts` → `agentic-codegen.ts`): `buildCodegenSpec(draft)`
   assembles the spec (purpose + visual notes + component schemas); `generateSceneAgentic`
   sends it to the codegen LLM which writes the `.scene.html`.
4. **Critique loop** (`pipeline.ts`, `maxRevisions` default 2): renders the scene,
   runs the gates (below), and regenerates on blocking defects.
5. **Editorial critique** (`multi-pass-critiquer.ts`): cross-scene fidelity pass (≤2 regens).
6. **Render** (`render.ts` → `scene-worker.ts` fork → ffmpeg): the **separate** `render`
   tool. Generation stops at status `generated`; rendering to `.mp4` is a second step.

## The visual-quality system (see SPEC.md for detail)

- **Codegen NON-NEGOTIABLES** — top of the codegen system prompt in `agentic-codegen.ts`.
  Five rules: legibility over mood (incl. surfaces), fill the frame, real content (no
  skeletons), render every named element, make the emotion visible.
- **Critique enforcement = two complementary halves:**
  - **LLM rubric** (`consolidated-critique.ts`, the active per-scene critic): blocking
    defect types incl. `invisible_surface`, `empty_skeleton`, `dropped_element`,
    `dead_frame`, `intent_mismatch`. `pass = defects.length === 0`; details feed the regen.
  - **Measurement gates** (deterministic, pixel/geometry): `measureTextContrast`
    (`text-contrast.ts`) for legibility; `measureLayout` (`layout-metrics.ts`) for ghost
    panels (surface-vs-background lightness) + dead frames (content coverage + backdrop
    color-spread). Wired into `pipeline.ts` right after the critique.
  - **Auto-fix loop** (`core/scene-repair.ts`): component-assembled scenes have no
    codegen to regenerate, so gate defects drive deterministic DATA patches instead —
    measure → repair → re-measure, bounded by `maxRetries`, in the authored branch of
    `pipeline.ts`. `quality.repairs` logs what changed; `attempts` counts the passes.
    Judgment defects (`intent_mismatch`, `empty_skeleton`, `stray_ui`) and contrast
    inside a component's own chrome are deliberately left as reports — see
    `AMENDMENTS.md` for why, and for the live run that shaped the table.
- **One scene vocabulary:** `purpose` + `visual_notes` everywhere (matches
  `StoryboardScene`). The word "brief" is retired at the scene level; the assembled
  codegen bundle is "the spec". A loud guard in `storyboard-builder.ts` ensures visual
  direction is never silently dropped.

## Environment gotchas (this sandbox — will bite you)

- **Playwright browser missing.** Code expects a bundled revision (e.g.
  `chromium_headless_shell-1223`) that isn't installed; what IS installed is
  `/opt/pw-browsers/chromium` (rev 1194). Every `chromium.launch` honors
  **`MP_CHROMIUM_PATH`** — set `MP_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
  Launch sites: `capture.ts`, `capture-worker.ts`, `scene-worker.ts`, `capture-url.ts`,
  `tools/brand-extractor.ts`. (In a normal deploy the browser is present and this is a no-op.)
- **Render/capture tests fork compiled workers.** Under vitest, `import.meta.url`
  resolves into `src/` where no worker `.js` exists -- `npm run build`, then set
  **`MP_WORKER_DIR=<repo>/dist/core`** and the render/showcase suites pass. CI
  (`.github/workflows/ci.yml`) does exactly this; run the full suite locally as:
  `PATH=/tmp/binshim:$PATH MP_CHROMIUM_PATH=/opt/pw-browsers/chromium MP_WORKER_DIR=$PWD/dist/core npx vitest run`
- **ffmpeg not on PATH**, and the Playwright-bundled ffmpeg can't decode PNG. Get a full
  static build: `pip install imageio-ffmpeg`, then symlink it to `/tmp/binshim/ffmpeg`
  and prepend `/tmp/binshim` to PATH.
- **Running the MCP server locally:**
  ```
  tail -f /dev/null | env -u SESSION_SECRET -u AUTH_TOKENS \
    PATH=/tmp/binshim:$PATH MP_DATA_DIR=<scratch> MP_PORT=3212 \
    MP_CHROMIUM_PATH=/opt/pw-browsers/chromium NO_PROXY='*' node dist/index.js
  ```
  - Auth is ON if `SESSION_SECRET` **or** `AUTH_TOKENS` is set (both are in this env) →
    `env -u` them to open `/mcp` for a plain client.
  - `tail -f /dev/null |` keeps **stdin open**; otherwise the stdio transport hits EOF and
    the process exits seconds after startup.
  - Use `run_in_background: true` so it survives across Bash calls (a plain `&` server is
    reaped when the call returns).
- **NEVER `pkill -f "dist/index.js"`** (or any pattern matching the launch string): it
  matches your own shell → self-kill (exit 143/144). Kill by port instead:
  `fuser -k 3212/tcp` or `ss -ltnp | grep :3212 → kill <pid>`.
- **MCP client:** `@modelcontextprotocol/sdk` `Client` + `StreamableHTTPClientTransport`
  → `http://127.0.0.1:<port>/mcp`, with `NO_PROXY='*'` (else localhost is routed through
  the agent proxy). `generate`/`render` are **async jobs** → poll the `job` tool with
  `action:"status"` (the SDK's default request timeout is 60s, so don't rely on a single
  long `job(action:"wait")`). Seed a tenant brand kit first (`saveBrandKit(tenant, kit)`)
  — `generate` loads the tenant kit from disk.

## Branch / PR state

Everything through PR #585 is merged to `master` and auto-deploys to the droplet
(`https://159-203-115-164.nip.io/health` reports the serving commit — check it before
trusting a live verification). Recent arcs: Veo diffusion video + `generate_presenter`
(#570–#582), the speaker-film takeover recipe (#580–#583), the auto-fix loop
(#584–#585). Running change log with the reasoning: `AMENDMENTS.md`.

## Open issues / follow-ups

- **Render final-stitch ffmpeg frames-race** (`scene-worker.ts`): parallel scene workers
  vs. frame-dir cleanup → `"Could find no file ... frames"` while the scene mp4 already
  exists. Pre-existing render code (NOT changed by PR #85); possibly sandbox-timing. Per-scene
  clips render fine; only the concat/transition/audio stitch fails. **Verify in a real env
  before treating it as a product bug.**
- **Light-brand codegen weakness:** on light brands the codegen's first instinct is to
  invert to a dark/purple theme and to ship borderline-contrast text and sparse frames.
  The gates catch it (theme inversion, low contrast, ghost panels) and force regens, but
  the generator burns its revision budget. The gates work; the *generator* needs work.
