# SPEC: Studio — direct-manipulation revise

Status: **draft** · Owner: TBD · Supersedes the old `preview` SPA's component-property editor.

## 1. Vision

Rename the **`preview`** SPA to **Studio** and rework it for the codegen video model.
The headline interaction:

> Pause the video, **click an element** in the scene (a caption, a card, a button,
> the background), **right-click → "Revise…"**, type what you want changed, and the
> agent revises **just that** — scoped to the element you pointed at, with its context.

This is the natural UI for our bet ("on-brand, correct video from a prompt — no
frame-by-frame review"): you don't review frames, but when you *do* want a tweak,
you point at the thing and say it in words. Direct manipulation, not a property grid.

## 1a. Scope & boundaries — Playground vs Studio

There are **two separate environments**; this spec touches only the second.

- **Playground** (`/playground`, `src/playground-app/`, `/playground/api/components/*`)
  — the **component-creation** tool: author tenant components, schemas, scripts, preview
  a single component. **Out of scope. Unchanged. Not renamed.**
- **Preview** (`/preview`, `src/preview-app/`, `/api/preview-scene|composite`,
  `updateComponent` PATCH at `src/index.ts:579`) — the **video viewer/editor** for a
  generated project. **This is what we migrate and rename to Studio**, and rework for the
  codegen video model.

So "drop the component-property editor / the component PATCH" below means the
**Preview's video-scene** editing — *not* the Playground's component editing.

## 2. Why now — the model changed

The old preview assumed a **data-driven** model: scenes were component instances with
editable **properties** (a layers panel + a prop editor; `PATCH /api/projects/.../
scenes/{sceneId}/components/{componentId}`, `src/server.ts:578`). That's obsolete.

Today scenes are **codegen**: a scene is one generated `scene_scene_NNN` component of
HTML/CSS/GSAP. Sub-elements (captions, cards) are just markup in that source — there
are no "component properties" to edit. So:
- **Drop** the prop editor + the component-PATCH endpoint (or repurpose the panel).
- **Add** revise-by-pointing, which edits the *source* via natural language.

## 3. What already exists (build on, don't rebuild)

- **Live preview in an iframe.** `preview-app.ts` loads project JSON
  (`/api/projects/{tenant}/{project}`) and writes assembled scene HTML into an iframe
  (`writeSceneToIframe`, composite via `/api/preview-composite/...`,
  `src/index.ts:741`). Scenes are live HTML/GSAP with a `__MP_TIMELINE` master and a
  timeline scrubber + play/pause already wired.
- **Element identity.** Every resolved component is wrapped with
  `data-cid` / `data-comp-id` / `data-comp-type` (`src/core/component-tags.ts:195`;
  scene/composite assemblers also tag `data-cid`). A clicked DOM element can walk up to
  the nearest `[data-comp-id]` to find its scene + instance.
- **Scoped revise.** `reviseComponent(opts)` (`src/llm/component-revise.ts:40`) takes an
  existing source string + free-text instructions and applies **SEARCH/REPLACE** blocks
  (exact → trimmed → context-anchor match), falling back to a full rewrite. Returns
  `{ source, blocksApplied, fullRewrite }`. This is exactly the primitive we need.
- **Scene revise pipeline.** `runSceneRevisionPipeline()` (`src/llm/pipeline.ts:309`) —
  heavier planner+generate+critique path, invoked by the `generate` MCP tool with
  `target:"scene"`. Use this only for big "redo this scene" asks, not point edits.

**Gap:** `reviseComponent` is internal-only — no HTTP endpoint or MCP tool. Studio needs one.

## 4. Core interaction & flow (states must be unmistakable)

The UI must make the current state obvious at every step — what's selected, that
you're composing a revision, and **that work is happening in the background** (never a
frozen UI).

1. **Pause.** The current frame is the editing surface.
2. **Select (highlight).** Hover shows a selectable box; click highlights the element
   with a clear outline + a small label ("caption" / "card" / "button"). The selection
   stays visibly highlighted while you compose.
3. **Choose scope** — a toggle on the Revise box (and the same two as right-click items):
   - **"This element"** (default) — revise the thing you highlighted.
   - **"Whole scene"** — change the whole scene from one instruction, without
     de-selecting. (e.g. "make this scene calmer", "switch to a two-column layout".)
4. **Type the revision + Enter.** A focused input next to the selection: "make this
   bigger / move it off her face / use the brand green." Enter submits.
5. **Working state — clearly articulated (key requirement).** On Enter: the input locks,
   the selected element (or the whole scene) gets an unmistakable **"Revising…" overlay**
   — shimmer + spinner + the instruction echoed back + an elapsed/typical-time hint — and
   a status line reflects progress. It is **non-blocking**: you can scrub or inspect other
   scenes while it runs. It must read at a glance as "working in the background," not
   stuck.
6. **Apply + confirm.** When the patch returns, the scene **hot-swaps** in place (no MP4
   render). The overlay flips to a brief **"Updated ✓"**, and the fast gates (legibility +
   runtime) re-run with the result inline ("contrast 5.2:1 ✓" / "⚠ now 2.1:1"). Full
   render only on export.

## 5. Scope of a revise (key design decision)

Two element classes:
- **(A) Plain codegen element** (most cases): the clicked element lives in the scene's
  generated source. Revise the **scene source** (`scene_scene_NNN.component.html`) with a
  SEARCH/REPLACE patch — the element's outerHTML/text/selector tells the LLM exactly
  what to target.
- **(B) Library/tenant component instance** (`data-comp-type` = `cta-card`, etc.):
  clicked element is inside a shared component. Default to revising the **scene source**
  too (the component is embedded there), so a tweak to *this* CTA doesn't mutate the
  shared library component for everyone. (Editing the shared component remains a
  separate, explicit action — out of scope for v1.)

**Decision for v1: always revise the scene's codegen source** via `reviseComponent`,
scoped by the clicked element's context. Simplest, safe (no cross-scene mutation), and
reuses the surgical patch path. Component-library editing is a later add.

### Element vs whole-scene (the scope toggle)
Both scopes go through the **same fast patch path** (`reviseComponent` on the scene
source) — the difference is only how much context we pin:
- **This element** (default): SEARCH/REPLACE scoped by the clicked element's context.
- **Whole scene**: same call, **no element scoping** — the instruction applies
  scene-wide ("calmer", "two-column layout", "bigger type everywhere").
- **Regenerate scene** (separate, heavier action, offered explicitly — not the default):
  escalates to `runSceneRevisionPipeline` (planner + generate + critique) for a full
  "redo this scene from scratch". Slower; reserved for when a patch can't get there.

## 6. Element context payload

When the user selects + submits, the iframe → parent (postMessage) sends:
```jsonc
{
  "sceneId": "scene_003",
  "compId": "comp_1",            // nearest data-comp-id, if any
  "compType": "cta-card",        // nearest data-comp-type, if any
  "tagName": "div",
  "classList": ["cta-description"],
  "text": "Join thousands of marketers…",   // trimmed textContent
  "outerHTMLSnippet": "<p class=\"cta-description\">…</p>",  // bounded
  "boundingBox": { "x", "y", "w", "h" },
  "screenshotCropBase64": "…",   // optional: the selected region, for vision context
  "instruction": "use the brand green and make it readable"
}
```
The revise prompt becomes: *"In this scene, the user selected this element [context].
Apply: [instruction]. Change only what's needed."* The SEARCH/REPLACE patch then targets
the matched markup.

## 7. API additions

- **`POST /api/revise`** (custom server, alongside `/api/render`):
  `{ tenant, project, sceneId, elementContext, instruction }` →
  loads the scene source → `reviseComponent` → writes source + updates project JSON →
  re-runs the per-scene gate → returns `{ ok, blocksApplied, fullRewrite, sceneHtml, defects }`.
- **MCP tool `revise`** (thin wrapper over the same) so it's also agent/CLI-drivable and
  consistent with `generate`/`render`. (The existing `generate target:"scene"` stays for
  full scene re-dos.)
- Studio refreshes the iframe scene from the returned `sceneHtml` (or re-fetches
  `/api/preview-scene/...`).

## 8. Studio UI changes (on top of preview-app.ts)

- **Rename** `preview` → Studio (route `/studio` with `/preview` kept as alias;
  title/branding).
- **Selection layer**: inject a small script into the composite/scene HTML that, on
  hover/click, finds the nearest `[data-comp-id]`-or-meaningful element, draws a
  highlight, and on `contextmenu` postMessages the selection up. Parent renders the
  context menu + prompt (reuse the existing `liquid-glass-context-menu` aesthetic).
- **Replace** the empty **prop editor** panel with a **Revise panel**: the current
  selection (with its label), a **This element / Whole scene** scope toggle, the
  instruction box, a "Revise" button, a **live in-progress state** while a revise runs
  (status line + the element/scene overlay described in §4.5), recent revises for the
  scene, and the gate result (e.g. "contrast now 5.2:1 ✓").
- **In-progress articulation is a first-class UI concern, not an afterthought.** Every
  revise has an obvious working state on the affected element/scene, an echoed
  instruction, and a clear done/✓ (or ⚠ defect) transition. The user should never wonder
  whether their Enter registered.
- Keep timeline, play/pause, scene list. The **layers panel** can become a flat list of
  selectable elements per scene (nice-to-have).

## 9. Out of scope (v1)

- Editing shared **library** components from Studio (only scene-scoped revises).
- Drag/resize/direct numeric manipulation (this is *natural-language* revise, by design).
- Re-rendering the MP4 live (preview is the live iframe; render on export).
- Multi-element / marquee selection.

## 10. Phased plan

- **Phase 1 — Backend:** `POST /api/revise` + `revise` MCP tool wrapping `reviseComponent`
  on the scene source; supports both **element-scoped** and **whole-scene** instructions
  (same call, more/less context); re-assemble + return updated HTML; re-run the fast
  gates; version the prior scene source. (No UI yet — drive it with a curl payload to
  prove the loop.)
- **Phase 2 — Selection + context menu + working state:** in-iframe selection script +
  postMessage; highlight; **This element / Whole scene** scope toggle; right-click menu;
  instruction box; wire to `/api/revise`; the **"Revising…" overlay / done-✓** states
  (§4.5); hot-swap the scene in the iframe.
- **Phase 3 — Studio shell:** rename `preview` → Studio, Revise panel replacing the prop
  editor, gate results inline, remove the obsolete component-PATCH path.
- **Phase 4 — Polish:** revise history/undo UI, element-list layers panel, and a distinct
  **"Regenerate scene"** action (the heavier `runSceneRevisionPipeline` path).

## 11. Resolved decisions

- **Selection granularity** → **leaf element + component context.** Select the exact
  element clicked; also send its enclosing component in the context payload so the LLM
  has both precision and structure.
- **Gate-on-revise** → **swap + warn.** Apply the change immediately; re-run the fast
  gates and surface any new defect inline. Never block the user's intent.
- **Undo** → **version the scene source per revise** (reuse the asset-versioning
  pattern) so every revise is reversible; show a small history in the Revise panel.
- **v1 revise scope (library components)** → **scene source only.** Patch this scene's
  copy; tweaking one CTA never mutates the shared library component. Editing the library
  component is a separate, later action.
- **Latency / live feel** → **async, non-blocking** with the §4.5 working overlay.
  Surgical patches are ~seconds; full vision critique is NOT run on a point revise.
- **Checks run on a revise** → only the **fast deterministic gates** (legibility +
  runtime), not the full vision critique (kept for generation/export).
- **Playback conflict on hot-swap** → re-init the GSAP master via the existing
  `__MP_READY` handshake when the scene source is swapped.

## 12. Still open

- **Revise history depth / storage** — how many prior scene-source versions to keep, and
  where (project dir vs a `_revisions/` sidecar).
- **"Whole scene" vs "Regenerate scene" affordance** — how prominently to surface the
  heavier `runSceneRevisionPipeline` path so users don't reach for it by default.
