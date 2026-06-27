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

## 4. Core interaction & flow

1. **Pause** (existing play/pause). The current frame is the editing surface.
2. **Select.** Click an element in the iframe; Studio highlights the nearest meaningful
   element (outline + dims). Hover shows the selectable box.
3. **Right-click → context menu** ("Revise…", "Revise whole scene…", maybe "Copy text").
4. **Prompt.** A small input: "make this bigger / move it off her face / use the brand
   green / fix the contrast". Submit.
5. **Revise (scoped).** Studio sends the **element context** + the instruction to a new
   revise endpoint, which runs `reviseComponent` against the **scene's codegen source**.
6. **Hot-swap.** Re-assemble just that scene and refresh the iframe in place (seconds,
   no full MP4 render). Re-run the per-scene **legibility/correctness gate** and surface
   any new defect inline. Full render happens only on export, unchanged.

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
- **Replace** the empty **prop editor** panel with a **Revise panel**: shows the current
  selection, the instruction box, a "Revise" button, recent revises for the scene, and
  the gate result (e.g. "contrast now 5.2:1 ✓").
- Keep timeline, play/pause, scene list. The **layers panel** can become a flat list of
  selectable elements per scene (nice-to-have).

## 9. Out of scope (v1)

- Editing shared **library** components from Studio (only scene-scoped revises).
- Drag/resize/direct numeric manipulation (this is *natural-language* revise, by design).
- Re-rendering the MP4 live (preview is the live iframe; render on export).
- Multi-element / marquee selection.

## 10. Phased plan

- **Phase 1 — Backend:** `POST /api/revise` + `revise` MCP tool wrapping `reviseComponent`
  on the scene source; re-assemble + return updated HTML; re-run the per-scene gate.
  (No UI yet — drive it with a curl payload to prove the loop.)
- **Phase 2 — Selection + context menu:** in-iframe selection script + postMessage;
  parent context menu + prompt; wire to `/api/revise`; hot-swap the scene in the iframe.
- **Phase 3 — Studio shell:** rename, Revise panel replacing the prop editor, gate
  results inline, remove the obsolete component-PATCH path.
- **Phase 4 — Polish:** revise history/undo, element-list layers panel, "revise whole
  scene" path (routes to `runSceneRevisionPipeline`).

## 11. Open questions

- **Revise latency** — a surgical patch is fast (~seconds, ~80 output tokens) but is it
  fast enough to feel "live"? Show a spinner on the selection; keep it non-blocking.
- **Undo** — keep N prior scene-source versions per scene (we already version assets;
  do the same for scene sources) so a revise is reversible.
- **Selection granularity** — snap to the nearest `[data-comp-id]`, or allow selecting
  any leaf element? Propose: leaf element by default, with the context payload also
  carrying the enclosing component so the LLM has both.
- **Gate-on-revise** — block the swap if the revise *introduces* a defect, or swap and
  warn? Propose: swap + warn (don't block the user's intent).
- **Conflict with playback** — revise mutates source; re-init the GSAP master cleanly on
  hot-swap (reuse the existing `__MP_READY` handshake).
