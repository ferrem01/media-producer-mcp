# Playground & Tenant Components

The Playground is an interactive tool for browsing, creating, and iterating on components. Tenant Components are custom components saved per-tenant that can be used alongside the built-in library in video/image production.

**URL:** `http://159.203.115.164:3200/playground`
**URL with tenant:** `http://159.203.115.164:3200/playground?tenant=<tenant-id>`

---

## Playground Layout

Three-panel layout:

```
┌─────────────┬────────────────────────┬──────────────────┐
│  Library /  │                        │  Source / Data /  │
│  My Comps   │     Live Preview       │  Chat             │
│             │                        │                   │
│  + Create   │   ▶ Play  [1920x1080]  │  Form / JSON      │
│             │                        │  Script Builder   │
│  categories │     Scaled iframe      │                   │
│  ─ titles   │     with GSAP          │  Chat iteration   │
│  ─ mockups  │     animation          │                   │
│  ─ effects  │                        │                   │
└─────────────┴────────────────────────┴──────────────────┘
```

### Left Panel -- Component Browser
- **Library tab**: 59 built-in components across 7 categories (cta, data-viz, effects, layouts, media, mockups, titles)
- **My Components tab**: Tenant-specific custom components (requires tenant ID)
- **+ Create Component**: Opens generate modal for LLM-driven component creation

### Center Panel -- Live Preview
- Renders component in a scaled iframe at selected canvas size (1920x1080, 1080x1920, 1080x1080)
- GSAP animations auto-play on load
- Play button restarts animations
- Preview updates live on any data or source change (300ms debounce)
- Duration set to 999s so exit animations never trigger in preview

### Right Panel -- Editor
Three tabs:

**Source tab**: Raw HTML source editor for the component (template + style + script)

**Data tab**: Schema-driven form editor with Form/JSON toggle
- **Form mode**: Typed form controls generated from the component's `.schema.json`
  - Text inputs for strings
  - Number inputs for numbers
  - Color picker + hex text input (auto-detected for color/background fields)
  - Dropdown selects for enum fields (e.g., platform: slack/discord/imessage)
  - Boolean toggle switches
  - Array builders with add/remove rows, per-item sub-fields for object arrays
  - Nested object field support
  - Script builder section (see below)
- **JSON mode**: Raw JSON textarea for direct editing
- Bi-directional sync: form changes update JSON, JSON edits reflect in form

**Chat tab**: LLM-powered iteration
- Describe changes in natural language ("make the headline bigger", "add a gradient background")
- LLM modifies the component source and preview refreshes
- New custom script actions are hot-loaded into the form dropdown immediately

---

## Tenant Components

### What They Are
Custom components saved per-tenant. They live alongside built-in library components and can be used in video/image production via the planner.

### CRUD Operations
- **Create**: Use the playground's "+ Create Component" button or the `generate_component` MCP tool
- **Save**: Click "Save to Library" in the playground top bar (saves to tenant's component directory)
- **Browse**: "My Components" tab in the playground left panel
- **Delete**: X button on each component in My Components list
- **Iterate**: Load a tenant component, use Chat tab to modify, Save again

### Storage
```
/data/media-producer/{tenant-id}/components/
├── my-component.tsx          # Component source
├── my-component.json         # Metadata (parsed_props, script_actions, cursor_targets)
└── .versions/my-component/   # Last 5 versions for rollback
```

### Library vs Tenant Components
| | Library Components | Tenant Components |
|---|---|---|
| Location | `src/components/{category}/` | `/data/media-producer/{tenant}/components/` |
| Editable | Read-only in playground | Full CRUD |
| Schema | `.schema.json` files | `.json` metadata (auto-synced) |
| Chat iteration | Changes are in-memory only | Changes persist when saved |
| Used by planner | Always available | Available for that tenant's projects |

---

## Script System

Interactive scripted animations using GSAP. Adds cursor movement, typing, camera control, and custom interactions to components.

### Architecture
```
script-runner.js          # Main orchestrator -- parses action arrays, builds GSAP timeline
├── cursor.js             # macOS-style cursor: move, click, double-click, drag, hide/show
├── camera.js             # Camera wrapper: zoom, pan, 3D rotate, reset
└── typing.js             # Character-by-character typing, deletion, select-all, paste
```

All shared utilities are loaded into every scene (via scene-assembler.ts) and into the playground preview (via preview-builder.ts).

### How It Works
1. Component data includes `script` (array of timed actions) and `cursor_targets` (named positions)
2. Component's `createTimeline` calls `runScript(tl, el, data.script, data.cursor_targets, ctx, handlers)`
3. Script runner processes each action and appends GSAP tweens to the timeline
4. Cursor and camera wrappers are lazily created only when needed

### Standard Script Actions

**Cursor:**
| Action | Params | Description |
|---|---|---|
| `move-cursor` | target, at, duration | Smooth cursor movement to target |
| `click` | target, at | Move + click pulse effect |
| `double-click` | target, at | Move + double click |
| `hover` | target, at, duration | Move cursor to target (no click) |
| `drag` | target, end_target, at, duration | Click-drag from one target to another |
| `hide-cursor` | at | Fade cursor out |
| `show-cursor` | at | Fade cursor in |

**Typing:**
| Action | Params | Description |
|---|---|---|
| `type` | target, text, at, speed | Type text character by character |
| `press` | key, at | Simulate key press |

**Camera:**
| Action | Params | Description |
|---|---|---|
| `zoom-to` | target, scale, at, duration | Zoom into a target area |
| `zoom-out` | at, duration | Zoom back to full view |
| `pan` | x, y, at, duration | Pan camera by percentage offsets |
| `rotate-3d` | rotateX, rotateY, at, duration | 3D perspective rotation |
| `camera-reset` | at, duration | Reset all camera transforms |

**UI Interaction:**
| Action | Params | Description |
|---|---|---|
| `show-element` | target, at, duration | Fade element in |
| `hide-element` | target, at, duration | Fade element out |
| `highlight` | target, at, color | Glow pulse on element |
| `scroll` | target, scrollY, at, duration | Scroll element |
| `toggle` | target, at | Toggle active/on class |
| `update-text` | target, text, at | Replace element text |

**Flow:**
| Action | Params | Description |
|---|---|---|
| `wait` | at, duration | Pause (advances timeline) |
| `parallel` | at, actions[] | Run multiple actions simultaneously |

### Custom Actions
Components can define custom action handlers for component-specific behavior:

```javascript
runScript(tl, el, data.script, data.cursor_targets, ctx, {
  'show-response': function(tl, container, action, at, duration, ctx) {
    // Custom handler for chat-simulator bot responses
    var responseEl = container.querySelector('.response');
    responseEl.textContent = action.text;
    tl.to(responseEl, { autoAlpha: 1, duration: 0.3 }, at);
  }
});
```

Custom actions are declared in the component schema's `script_actions` array and appear in the playground form's action dropdown.

### Cursor Targets
Named positions for cursor movement. Can be percentage-based or reference `data-target` attributes:

```json
{
  "cursor_targets": {
    "chat-input": { "x": "50%", "y": "90%" },
    "send-button": { "x": "92%", "y": "90%" }
  }
}
```

Elements with `data-target="chat-input"` are also resolved by name.

### Scriptable Components (8)
Components with `script_actions` in their schema and `runScript()` in their `createTimeline`:
- **mockups**: chat-simulator, code-editor, email-compose, form-wizard, dashboard-kpi, kanban-board
- **layouts**: browser-frame, terminal

### Planner Integration
The unified planner sees scriptable components flagged as "Scriptable" in the catalog. When generating interactive demo scenes, the planner produces `script` and `cursor_targets` arrays in the component data. The planner prompt includes a full scripting example and action reference.

---

## Schema System

### Two Schema Formats

**Format A (custom)**: Used by most built-in components
```json
{
  "type": "chat-simulator",
  "label": "Chat Simulator",
  "category": "mockups",
  "data": {
    "platform": { "type": "string", "label": "Platform", "enum": ["slack", "discord", "imessage"] },
    "messages": { "type": "array", "label": "Messages", "items": { ... } }
  },
  "script_actions": [...],
  "default_cursor_targets": {...}
}
```

**Format B (JSON Schema)**: Used by some components
```json
{
  "type": "object",
  "properties": {
    "bars": { "type": "array", "items": { ... } },
    "title": { "type": "string" }
  }
}
```

### Schema Defaults
`src/playground-app/schema-defaults.ts` generates realistic sample data from schemas:
- Context-aware array items (messages get usernames + text, bars get labels + values + colors, etc.)
- Smart key-based defaults (headline, subtitle, author, email, etc.)
- Color fields get hex values
- Endpoint: `GET /playground/api/components/{category}/{type}/defaults`

---

## API Endpoints

### Playground
| Method | Path | Description |
|---|---|---|
| GET | `/playground` | Playground SPA HTML |
| GET | `/playground/api/components/catalog` | Full component catalog with metadata |
| GET | `/playground/api/components/{cat}/{type}/source` | Component HTML source |
| GET | `/playground/api/components/{cat}/{type}/schema` | Component schema JSON |
| GET | `/playground/api/components/{cat}/{type}/defaults` | Generated default data |
| POST | `/playground/api/components/preview` | Render component preview HTML |
| POST | `/playground/api/components/save` | Save component to tenant library |
| POST | `/playground/api/generate` | LLM-generate a new component from prompt |
| POST | `/playground/api/iterate` | LLM-iterate on component source from instruction |

### Tenant Components
| Method | Path | Description |
|---|---|---|
| GET | `/playground/api/tenant-components/{tenant}` | List tenant's components |
| GET | `/playground/api/tenant-components/{tenant}/{type}/source` | Tenant component source |
| DELETE | `/playground/api/tenant-components/{tenant}/{type}` | Delete tenant component |

---

## Key Commits (June 7-8, 2026)

| Commit | Description |
|---|---|
| `c6995e1` | Playground + scripting plan |
| `4876948` | Schema-driven defaults + auto-play preview |
| `abf466c` | Fix exit animation (duration 999) |
| `02d83c3` | Color array defaults + depth blur schema fix |
| `5980ac7` | Sprint 3: planner script integration (8 components) |
| `f18fe73` | Schema-driven data form editor + script builder UI |
| `2d2026e` | Form editor CSS/layout fixes |
| `03c36be` | All script actions in form dropdown (pan, rotate-3d, etc.) |
| `b7079ac` | Hot-reload custom actions after Chat/Generate |
