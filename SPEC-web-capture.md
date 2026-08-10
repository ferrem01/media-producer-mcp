# SPEC — Web Capture: the extension as a component camera

**One sentence:** point the browser extension at any part of any website and it
mints a scriptable tenant component — the site's own pixels, performable by the
film's existing script grammar.

**Status:** design settled with Marc (2026-08-10 session); v1 in progress.

## Why

Films constantly need product surfaces we haven't mocked: a customer's app, a
competitor's pricing page, a partner's dashboard. Today those become codegen
inventions (wrong) or static screenshots (dead). The extension already sees
every page the operator can see — including logged-in views no crawler can
reach. Capturing a region as a *component* makes "their actual site" a
performable prop: the cursor clicks their button, the violet underline rips
across their testimonial, their signup number counts up.

## Non-negotiables (from the design discussion)

1. **ONE concept: everything is a component.** There is no "clip", no second
   library, no promotion ceremony. A capture mints a real tenant component
   (`<name>.component.html` in `tenantComponentsDir`) with a schema and a
   catalog entry, castable by the storyboard builder from second one. ("Clip"
   is also banned as a word here: it collides with recordings and
   `generate_clip`.)
2. **No LLM in the visual path.** The default capture is 100% deterministic:
   the site's own DOM, the browser's own computed styles, the site's own image
   bytes. Nothing is generated, so nothing can take liberties. The LLM enters
   only on explicit request (revision / new verbs), and every LLM edit is held
   to the capture's reference screenshot: "appearance is frozen, behavior
   only", enforced by a pixel-diff check that fails the edit on drift. The
   screenshot taken at capture time is the component's permanent visual
   contract, not just a preview.
3. **Nothing is created until the operator confirms.** Selection, serialization
   and preview run entirely inside the browser. The verdict panel (replica vs
   reference screenshot, match score, substitution notes) is local; "Reselect"
   and Esc cost zero — no network call, no component, nothing to delete. The
   server first hears about a capture when "Create component" is pressed.

## Capture UX (extension)

- **Capture mode** enters an element picker: DevTools-inspect-style
  hover outline with a size/tag chip. The picker SNAPS to DOM boxes — that is
  what makes the result scriptable (a clean subtree has real targets; an
  arbitrary crop is mush). Scroll-wheel / arrow keys widen to parent or narrow
  to child; the page's own click handlers are suppressed while active.
- **Capture on hotkey** (not click — clicks navigate). The page is captured
  *as it currently looks*: open menus, hover states, logged-in data, applied
  filters all freeze into the capture.
- **Verdict panel** (local): left = the replica rendered in a sandboxed
  iframe; right = the reference screenshot; a pixel-match score; the
  substitution list (fonts, flattened iframes). Below: the scriptability
  manifest — "7 text targets, 2 buttons, 3 numbers" — and click-to-demo (click
  a text run, watch a violet underline rip across it). If the replica diverges
  badly the panel says so and offers sprite mode (screenshot + callout
  scripting) instead. Then: name (pre-filled `site-role`), editable
  description, destination, **Create component**.

## What gets captured, by layer

- **Markup:** the subtree's HTML with current state frozen in (input values,
  checked, open dropdowns, selected tabs).
- **CSS:** NOT the site's stylesheets — the computed result. Every element's
  `getComputedStyle` diffed against a per-tag default probe and inlined,
  plus `::before`/`::after`. Survives leaving the cascade; immune to
  cross-origin stylesheet restrictions.
- **Images:** `<img>` (srcset resolved to the rendered candidate), CSS
  background images, inline SVG — fetched by the page's own context (so
  authed images work), inlined as data URIs, downscaled to ~2x display size.
- **Fonts:** try to pull `@font-face` binaries via the page context
  (`document.fonts` + credentialed fetch); embed on success. On CORS/license
  block: record family + metrics, substitute closest brand/system font, and
  SAY SO in the verdict panel before saving.
- **Deliberately dropped:** scripts, event handlers (the security line — the
  replica is inert scenery), iframes (flattened to an image), video (poster
  frame), canvas/WebGL (pixel snapshot of that node), analytics, external
  links (defanged).
- **Metadata:** `source_url`, `captured_at`, viewport, DPR, the reference
  screenshot. Provenance stays on the component forever; a later "re-capture"
  action diffs the live site against the (possibly refined) component.

## The minted component

A thin deterministic shell — template-stamped, sub-second, no codegen:

- Frozen markup in the component body (server re-sanitizes; never trust the
  client bundle).
- `createTimeline(el, data, ctx)` delegates to the shared capture-performance
  runtime (`components/shared/capture-performance.js`) with the standard
  handler-map pattern (`script-runner.js`), so improvements to the runtime
  lift every captured component at once.
- **Generic verbs, free on every capture** (targets by VISIBLE TEXT first,
  selector as fallback — text targeting is what an LLM can author reliably):
  - `highlight {text|selector, style: underline|box|spotlight, color, duration}`
  - `click {text|selector}` — the film's cursor travels there and presses
  - `type {selector|text placeholder, text, speed}`
  - `set-text {text|selector, to}` — swap copy (the pricing number, the name)
  - `count-up {text|selector, from, to, duration}`
  - `scroll {to: text|selector|y}` — pan inside the component's frame
- Schema declares the verbs + the capture's discovered targets so the
  storyboard builder can cast and script it with confidence.
- Entrance: settled by default (it is a product surface; the settled-entrance
  law applies), with the standard entrance options available.

## Scripting tiers (who adds behavior, where)

1. **Free tier — no tooling:** the generic verbs cover point/click/type/
   count/highlight, authored where all scripting lives: scene data, written by
   the storyboard or the surgical revise loop. Expected to cover most uses.
2. **New verbs — by instruction:** "add actions: flip-over, collapse-sidebar"
   runs codegen ON the component source (a normal component revision), writing
   handlers into its action map and declaring them in its schema (the catalog
   learns them automatically). Appearance guarded by the reference screenshot
   check.
3. **Playground — the bench, not a gate:** verify and polish verbs, scrub the
   timeline, tweak easing, hand-edit source when taste demands. Nothing
   requires a playground visit before a capture is castable.

## Server

- `POST /api/capture-component/{tenant}`: bundle in → hard sanitize (strip
  scripts/handlers/iframes/external refs in a browser context, allowlist
  styles) → stamp the shell → write `<name>.component.html` + `.schema.json`
  + `capture-ref.png` + `capture-meta.json` into the tenant components dir →
  return the catalog entry + a pipeline-rendered still (what a storyboard
  card will show).
- Name collisions get `-2` suffixes; deleting a tenant component is a normal
  library operation (exists for regret, not for the workflow).

## Fallback ladder

Replica match score below threshold (canvas/WebGL/shadow-DOM-heavy regions) →
the panel offers **sprite mode**: the reference screenshot as the component's
body, scriptable via spotlight/callout only (the st-screencast callout
machinery). Honest, never broken. A marquee/crop selection mode (secondary)
always produces sprite mode — free rectangles don't map to subtrees.

## v1 build order

1. `components/shared/capture-performance.js` — the generic verb runtime.
2. Server mint path: endpoint + sanitizer + shell stamping + catalog/schema +
   tests (fixture bundle → component renders via assembleScene → verbs fire).
3. Extension: picker overlay + serializer + local verdict panel + confirm POST.
4. Studio: captured components appear via the existing catalog; re-capture and
   sprite fallback later.

Out of scope for v1: multi-breakpoint captures, re-capture diffing, public-URL
server-side capture (Playwright path for non-authed pages), marquee mode.
