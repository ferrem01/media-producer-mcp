# SPEC: Motion Architecture — layers, ownership, and the one-camera rule

Status: agreed direction (Marc + Claude session, 2026-07-12). This spec
consolidates every motion/choreography concept in the system into four layers
with single ownership, resolves the camera redundancy, and defines how
scripted components compose with scenes, templates, and the Studio timeline.

## Why

An audit found the same concepts implemented in multiple places:

- **Camera, five times**: `scene.camera_moves` (Studio crosshair zooms),
  script-runner's per-component camera wrapper (`zoom-to`/`pan`/`rotate-3d`),
  `mpCameraPush` (ambient), screencast callout lifts, match-cut punch-ins.
  The dangerous pair is timeline camera vs in-component camera: two transform
  stacks that know nothing about each other and fight when overlapped.
- **Typing, four times**: `mpTypeIn`, script-runner `type`,
  slack/quotient `type-message`, ui-chat-thread's dots-then-pop.
- **Generic chat mock, twice**: `ui-chat-thread` duplicates `chat-simulator`.
- **Field-name drift**: LLM-authored component data invents plausible keys
  (`author`/`time` for `name`/`timestamp`) because interfaces are re-declared
  at multiple levels instead of passed through.

## The four layers

| Layer | Owns | Never does |
|---|---|---|
| **L1 Timeline + beats** | The one clock. Scene `beats[]` are named narrative windows; `__MP_TIMELINE` is the only playhead (capture, preview, render all drive it). | Visual decisions. |
| **L2 Motion kit** (`atmosphere.js`, `mp*`) | Shared *verbs* for authored code: reveals, throws, count-ups, type-ins, atmosphere. Imperative; the caller owns timing. | Timing policy; camera. |
| **L3 Components** (three tiers, below) | Everything inside the component's own DOM: content, internal choreography, **pose** (3D tilt/drift — the float rig is the model). Performable surfaces accept a `script`. | Moving the stage camera; reaching outside their wrapper. |
| **L4 Stage** (scene shell: template or codegen) | Placement, entrance/exit of component wrappers, scene atmosphere, and the **one camera** (`scene.camera_moves`). | Reaching *inside* a component's DOM (the double-composer bug class). |

### Component tiers (declared in each schema)

1. **Performable surface** — accepts `script` (+ `cursor_targets`); the
   component *acts the story itself* via the shared script-runner.
   Today: slack-workspace, quotient-chat, chat-simulator, claude-chat-composer.
2. **Animated prop** — self-animating from data, no script (charts, counters,
   st-template siblings, screencast-frame).
3. **Static prop** — logos, frames, backgrounds.

A component is exactly one tier. The catalog and every schema must say which.

## The one-camera rule

There is **one camera per scene**: `scene.camera_moves` (existing
`CameraMove` type — scene-local `at`, deterministic focal math, Studio pills).
Components never move the camera.

- Script-runner's `zoom-to`, `pan`, `camera-reset` are **deprecated**: removed
  from schema docs (so LLMs stop reaching for them), kept in code for
  backward compatibility only.
- `rotate-3d` is **not** camera — it is component **pose** (the object tilting
  on stage, like the screencast float rig) and stays with the component.
- `mpCameraPush` stays: it is ambient drift, not a targeted move.
- Callout lifts and match-cut punch-ins stay: distinct effects, different
  substrates (video regions / transitions).

### Anchors: how the camera targets component internals

Performable surfaces publish **semantic anchors** — `data-anchor="composer"`,
`data-anchor="thread-panel"`, `data-anchor="message-3"` — on their key
regions. `CameraMove` gains one field:

```ts
/** "componentId.anchorName" -- resolved at the move's start time by
 *  measuring [data-cid=componentId] [data-anchor=anchorName]; works while
 *  the component is mid-entrance, posed, or drifting. */
anchor?: string;
```

This unifies three things that were secretly the same concept: Studio
crosshair zooms (human picks a rect), match-cut anchors (declared points),
and the old script `zoom-to` (semantic target). The Studio gesture should
snap to visible anchors when hovering a performable surface.

Anchored moves solve the moving-target problem raw rects cannot: a rect drawn
on a sliding, 15°-posed component goes stale; an anchor is measured when the
move fires.

## The pass-through rule (templates and storyboards)

Templates and storyboard beats **never re-declare or alias a nested
component's interface**. A template that stages a component takes a
`{type, data}` spec and instantiates it verbatim (st-artifact's `artifact`
slot and st-screencast's frame are the model). The `script` rides inside
`data` untouched. Same interface at every level: raw component, template
slot, storyboard artifact beat, Studio editor.

The moment a template invents `slack_messages` and translates it into the
component's `messages`, there are two vocabularies to drift apart — the
`author`-vs-`name` bug class.

Timing composition: the stage decides *when* a component's timeline starts
(the wiring point); script `at` values are component-local seconds from that
start. `ctx.beats` flows down for beat-aware components. (Possible later
nicety, only if drift shows up in practice: `at: "beat:<label>+0.5"`.)

## Worked example — "the Slack scene"

Slack simulator slides in from the left at a 15° pose; a message types into
the composer while the camera zooms into it; zoom out; more scripted actions;
a thread reply opens the thread panel; camera zooms into the panel and back
out; the simulator slides off right. One scene definition, three lanes, one
clock:

```jsonc
{
  "id": "scene_002",
  "duration_seconds": 18,
  "components": [
    {
      "id": "slack",
      "type": "slack-workspace",              // performable surface (L3)
      "position": { "x": "6%", "y": "8%", "width": "62%", "height": "84%" },
      "pose": { "rotate_y": -15 },             // POSE, not camera
      "entrance": { "type": "slide", "from": "left", "at": 0.0, "duration": 0.8 },
      "exit":     { "type": "slide", "to": "right", "at": 16.6, "duration": 0.9 },
      "data": {
        "channel_name": "marketing-campaigns",
        "messages": [ /* backdrop thread, real names, real copy */ ],
        "script": [                            // PERFORMANCE lane (component-local time)
          { "action": "type-message",          "at": 1.2, "text": "@Quotient make it happen!", "duration": 2.6 },
          { "action": "send-message",          "at": 4.1 },
          { "action": "bot-message",           "at": 5.6, "name": "Quotient", "text": "On it — building the campaign now." },
          { "action": "add-reaction",          "at": 6.8, "emoji": "🔥", "count": 3 },
          { "action": "open-thread",           "at": 8.2 },
          { "action": "thread-reply",          "at": 9.0, "name": "Marc Chen", "text": "make the blog title punchier" },
          { "action": "type-thread",           "at": 10.4, "text": "@Quotient revise the title" },
          { "action": "send-thread",           "at": 12.2 }
        ]
      }
    }
  ],
  "camera_moves": [                            // CAMERA lane (scene-local time; ONE camera)
    { "at": 1.4,  "type": "zoom",  "anchor": "slack.composer",     "scale": 1.8 },  // in while typing
    { "at": 4.6,  "type": "reset" },                                                // out when sent
    { "at": 8.6,  "type": "zoom",  "anchor": "slack.thread-panel", "scale": 1.6 },  // into the thread
    { "at": 13.0, "type": "reset" }
  ]
}
```

Lane ownership in this scene:

- **Placement lane (L4)** — `position`, `pose`, `entrance`, `exit`: the stage
  slides the wrapper in at 15°, slides it off at the end. The camera math is
  unaffected because anchors are measured live.
- **Performance lane (L3)** — the component acts the whole Slack story via
  its script. Nothing outside its wrapper is touched; no second composer, no
  overlay chrome, ever.
- **Camera lane (L4)** — four anchored moves on the one stage camera,
  coordinated against script times by the author (script `at` + wiring
  offset = scene time; here the component wires at 0, so they read 1:1).

What this example requires that does not exist yet:
`pose`/`entrance`/`exit` as first-class wrapper properties (today the scene
shell hand-animates wrappers), the `anchor` field on CameraMove + anchor
resolution, and `data-anchor` publication in the performable surfaces.

## Cleanup list (agreed)

1. **Camera**: add `anchor` to CameraMove + runtime resolution; publish
   `data-anchor` in the four performable surfaces; deprecate script-runner
   `zoom-to`/`pan`/`camera-reset` (docs first, code stays); Studio gesture
   snaps to anchors.
2. **Pose**: reclassify `rotate-3d` as pose in docs. First-class
   `pose`/`entrance`/`exit` wrapper properties (generalizing the float rig)
   — separate PR.
3. **Components**: deprecate `ui-chat-thread`; fold its Slack-ish styling
   into `chat-simulator` as a variant. Tier taxonomy stamped in every schema
   and the catalog.
4. **Typing**: consolidate the four implementations onto one shared util
   under the hood; all entry points stay.
5. **Docs**: this spec is the ownership reference; CLAUDE.md points here;
   codegen/storyboard prompts cite the layer rules (stage never reaches into
   components; components never move the camera; templates pass specs
   through verbatim).

## Non-goals

- No mega-DSL unifying templates and scripts: each concept lives in exactly
  one place instead.
- Beats stay storyboard-owned; they do not move into components.
- EDL/media intents (time-remapping of footage) are orthogonal and untouched.
