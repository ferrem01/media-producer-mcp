# PLAN: Playground Rework + Component Scripting System

Created: 2026-06-07
Status: Planning

## Goal

Rework the playground into an LLM-driven component creation and iteration tool. Add a scripting system for interactive/animated components (cursor, typing, clicks, camera). Make tenant components first-class: generate, preview, iterate, save, and use them in projects.

---

## Part 1: Playground Rework

### Current State
- Playground SPA exists at `/playground` (1264 lines)
- Has: component catalog browser, source editor, live preview via iframe
- Server has: catalog API, source/schema API, preview builder, save (tenant-scoped), list tenant components
- Missing: LLM generation, chat-based iteration, tenant component browsing in UI

### New Playground Flow

```
Prompt → Generate → Preview → Iterate → Save → Use in Projects
```

**Left Panel: Component Library + Generation**
- Tabbed: "Library" (global 41+ components) | "My Components" (tenant custom)
- Library tab: browsable catalog grouped by category, click to load source + preview
- My Components tab: tenant components from `/data/media-producer/{tenant}/components/`
- "Create Component" button → opens prompt input

**Center Panel: Live Preview**
- Rendered component in iframe (existing preview-builder.ts)
- Brand kit applied (tenant's brand colors, fonts, logos)
- Play/pause for animated components with GSAP timelines
- Canvas size selector (landscape/vertical/square)

**Right Panel: Source + Data + Iterate**
- Tabbed: "Source" | "Data" | "Chat"
- Source tab: full `.component.html` source editor (Monaco or CodeMirror if we want, or plain textarea to start)
- Data tab: JSON data editor for component props, auto-extracted from template `data-bind` attributes
- Chat tab: conversation with LLM to iterate on the component
  - "Make the headline bigger"
  - "Add a gradient background"
  - "Change the animation to slide in from the left"
  - LLM sees current source + request → produces updated source → preview refreshes

### API Additions Needed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/playground/api/generate` | POST | Generate new component from prompt. Params: `prompt`, `tenant_id`, `brand_kit`, `canvas` |
| `/playground/api/iterate` | POST | Iterate on existing component. Params: `source` (current), `instruction`, `tenant_id` |
| `/playground/api/components/{tenant}/save` | POST | Save to tenant library. Params: `type`, `category`, `source` |
| `/playground/api/components/{tenant}` | GET | List tenant components (exists) |
| `/playground/api/components/{tenant}/{type}/source` | GET | Get tenant component source |
| `/playground/api/brand-kit/{tenant}` | GET | Get tenant brand kit for preview theming |

### Implementation Plan

**Phase 1A: LLM Generation Backend**
- Wire `/playground/api/generate` endpoint to `component-generator.ts`
- Wire `/playground/api/iterate` endpoint -- takes current source + instruction, calls LLM with "revise this component" prompt
- Both return `{ source, type, preview_html }`

**Phase 1B: Playground UI Rewrite**
- Rewrite `playground-app.ts` with the three-panel layout
- Left panel: library browser + tenant components + "Create" button
- Center panel: live preview iframe with play/pause and canvas selector
- Right panel: source editor + data editor + chat iteration
- Wire to new API endpoints

**Phase 1C: Tenant Component Management**
- Browse tenant components in left panel
- Click to load source + preview
- Edit source → save back to tenant library
- Delete tenant components
- Verify component resolution works: tenant components available in project scene planning

---

## Part 2: Component Scripting System (useScript for GSAP)

### Concept (adapted from video-producer-mcp)

In video-producer-mcp (Remotion), `useScript()` was a React hook that walked a list of actions and drove cursor movement, typing, clicks, camera zooms, and custom component behaviors. Frame-by-frame control.

In media-producer-mcp (HTML + GSAP), the equivalent is a **script system that builds GSAP timeline entries** from a list of actions. Instead of a React hook, it's a plain JS function that takes a GSAP timeline and appends actions to it.

### Architecture

The script system lives in `src/components/shared/script-system.js` (alongside `video-sync.js`). It's a plain JS file included in scene HTML when a component uses scripting.

```javascript
// script-system.js

function buildScript(tl, el, config) {
  // config: { script: ScriptAction[], targets: {}, handlers: {} }
  // Walks the script array, appending GSAP tweens to the timeline
  // Returns: { cursor: Element, getState: () => ScriptState }
  
  var cursor = createCursor(el, config.cursorStyle);
  var currentTime = tl.duration(); // append after existing animations
  
  config.script.forEach(function(action) {
    switch(action.action) {
      case 'wait':
        currentTime += action.duration || 1;
        break;
      
      case 'cursor-move':
        var target = config.targets[action.target];
        if (target) {
          tl.to(cursor, {
            x: target.x, y: target.y,
            duration: action.duration || 0.5,
            ease: 'power2.inOut'
          }, currentTime);
          currentTime += action.duration || 0.5;
        }
        break;
      
      case 'cursor-click':
        // Move to target + click ripple
        var target = config.targets[action.target];
        if (target) {
          tl.to(cursor, { x: target.x, y: target.y, duration: 0.4, ease: 'power2.inOut' }, currentTime);
          // Click ripple
          tl.to(cursor.querySelector('.cursor-ring'), {
            scale: 1.5, opacity: 0, duration: 0.3,
            ease: 'power2.out'
          }, currentTime + 0.4);
          tl.set(cursor.querySelector('.cursor-ring'), {
            scale: 1, opacity: 1
          }, currentTime + 0.7);
          currentTime += action.duration || 0.8;
        }
        break;
      
      case 'type':
        // Typing animation -- calls handler to update text
        if (config.handlers && config.handlers['type']) {
          var typeDuration = action.duration || (action.text.length * 0.05);
          config.handlers['type'](tl, action, currentTime, typeDuration);
          currentTime += typeDuration;
        }
        break;
      
      case 'zoom-to':
        tl.to(el, {
          scale: action.scale || 2,
          transformOrigin: action.target ? 
            config.targets[action.target].x + 'px ' + config.targets[action.target].y + 'px' : 
            '50% 50%',
          duration: action.duration || 0.8,
          ease: 'power2.inOut'
        }, currentTime);
        currentTime += action.duration || 0.8;
        break;
      
      case 'zoom-out':
        tl.to(el, {
          scale: 1,
          duration: action.duration || 0.6,
          ease: 'power2.inOut'
        }, currentTime);
        currentTime += action.duration || 0.6;
        break;
      
      default:
        // Custom action -- delegate to handler
        if (config.handlers && config.handlers[action.action]) {
          var dur = action.duration || 0.5;
          config.handlers[action.action](tl, action, currentTime, dur);
          currentTime += dur;
        }
        break;
    }
  });
  
  return { cursor: cursor };
}
```

### How Components Use It

Inside a component's `<script>` block:

```javascript
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  
  // ... entrance animations ...
  
  // If script data is provided, build interactive sequence
  if (data.script && data.script.length) {
    buildScript(tl, el, {
      script: data.script,
      targets: {
        'model-selector': { x: 400, y: 50 },
        'send-button': { x: 700, y: 500 },
        'chat-input': { x: 400, y: 480 }
      },
      handlers: {
        'open-dropdown': function(tl, action, startTime, duration) {
          var dropdown = el.querySelector('.dropdown');
          tl.to(dropdown, { height: 'auto', opacity: 1, duration: duration }, startTime);
        },
        'type': function(tl, action, startTime, duration) {
          var input = el.querySelector('.chat-input');
          // Character-by-character typing
          var text = action.text || '';
          for (var i = 0; i < text.length; i++) {
            tl.call(function(charIndex) {
              input.textContent = text.substring(0, charIndex + 1);
            }, [i], startTime + (i * duration / text.length));
          }
        }
      }
    });
  }
  
  return tl;
}
```

### Standard Actions (built into script-system.js)

| Action | Params | Description |
|--------|--------|-------------|
| `wait` | `duration` (seconds) | Pause before next action |
| `cursor-move` | `target` | Move cursor to named target |
| `cursor-click` | `target` | Move + click with ripple animation |
| `type` | `text`, `target?`, `speed?` | Type text character by character |
| `zoom-to` | `target?`, `scale?` | Zoom camera into a target or position |
| `zoom-out` | -- | Reset camera to full view |
| `highlight` | `target`, `color?` | Pulse/glow highlight on an element |

### Custom Actions

Components register handlers for their unique behaviors. The script system calls the handler with `(tl, action, startTime, duration)` and the handler appends GSAP tweens.

### Planner Integration

When the LLM planner sees a component with `scriptActions` metadata, it generates a `script` array in the component data:

```json
{
  "type": "chat-simulator",
  "data": {
    "headline": "Real-time AI Chat",
    "script": [
      { "action": "wait", "duration": 0.5 },
      { "action": "cursor-click", "target": "chat-input" },
      { "action": "type", "text": "What should we build?", "speed": 1.5 },
      { "action": "wait", "duration": 0.3 },
      { "action": "cursor-click", "target": "send-button" },
      { "action": "show-response", "text": "Let's create a landing page..." }
    ]
  }
}
```

### Playground Script Builder

In the playground data panel, when a component declares `scriptActions`, show a visual script builder:
- Ordered list of actions (drag to reorder)
- Add action dropdown (standard + component-specific)
- Each action shows type, target, duration, params
- Changes update preview in real-time
- Export as JSON for use in project scenes

---

## Part 3: End-to-End Flow

### Create a tenant component:
1. Open playground (`/playground?tenant=marc-getquotient-ai`)
2. Click "Create Component"
3. Type: "A Slack-style chat interface with model selector dropdown"
4. LLM generates `.component.html` with GSAP animations
5. Preview renders in center panel with brand kit applied
6. Iterate: "Add typing animation and cursor clicking the send button"
7. LLM adds `script` support + handlers to the component
8. Test script in preview with play/pause
9. Save to tenant library

### Use in a project:
1. Create project via MCP or preview SPA
2. Planner sees tenant component in catalog, picks it for a scene
3. Planner generates `script` array based on component's `scriptActions` metadata
4. Scene assembler resolves component from tenant dir, injects script-system.js
5. Render pipeline captures frames with full scripted animation

### Edit an existing tenant component:
1. Open playground, switch to "My Components" tab
2. Click component to load
3. Edit source or iterate via chat
4. Save -- overwrites in tenant library
5. All future renders of projects using this component pick up the changes

---

## Implementation Order

### Sprint 1: Playground Core (focus here first)
1. `/playground/api/generate` endpoint (wire to component-generator.ts)
2. `/playground/api/iterate` endpoint (LLM revision with current source + instruction)
3. Rewrite playground UI: three-panel layout, library browser, tenant components, create button, chat iteration, live preview
4. Tenant component CRUD: browse, load, edit, save, delete

### Sprint 2: Script System
1. Build `script-system.js` with standard actions (wait, cursor-move, cursor-click, type, zoom)
2. Include in scene assembly when component data has `script` field
3. Build one example component with scripting (chat-simulator or browser-frame)
4. Playground script builder UI in data panel

### Sprint 3: Planner + Codegen Integration
1. Component metadata: `scriptActions` field listing available custom actions
2. Update codegen prompts to teach script pattern for interactive components
3. Update planner to generate `script` arrays when using scripted components
4. E2E test: prompt → project → scripted component renders correctly

---

## Files Involved

| File | Change |
|------|--------|
| `src/playground-app/playground-app.ts` | **REWRITE** -- three-panel layout, LLM generation, chat iteration |
| `src/playground-app/preview-builder.ts` | Minor updates for brand kit injection |
| `src/index.ts` | Add generate + iterate endpoints |
| `src/components/shared/script-system.js` | **NEW** -- GSAP-based script engine |
| `src/core/scene-assembler.ts` | Include script-system.js when component uses scripting |
| `src/core/component-generator.ts` | Update prompts for script-aware generation |
| `src/llm/prompts.ts` | Add script system docs to codegen prompt |
| `src/llm/unified-planner.ts` | Generate script arrays for scripted components |
| `ARCHITECTURE.md` | Document scripting system |

---

## Open Questions

1. **Script builder UI complexity** -- full drag-and-drop builder vs simpler JSON editor with validation? Start simple, iterate.
2. **Script duration vs scene duration** -- if script total exceeds scene duration, the timeline clips. Auto-extend scene duration or warn?
3. **Multi-component scripts** -- if a scene has 2 scripted components, their scripts run independently on the same timeline. Is that right or do we need cross-component sequencing?
