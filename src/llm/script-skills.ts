/**
 * Script System Skills
 *
 * Injected into the component generator prompt so the LLM knows
 * how to create interactive mockup components with cursor movement,
 * typing, camera control, and scripted interactions.
 */

export const SCRIPT_SYSTEM_SKILLS = `
## Interactive Script System

The following shared utilities are available globally in every component. Use them to create interactive product demos, UI mockups, and scripted animations.

### When to Use Scripts
Use the script system when the component needs:
- Cursor moving and clicking on UI elements
- Text being typed into inputs
- Camera zooming into specific areas
- Simulated user interactions (dropdowns, toggles, scrolling)

### How to Use

In your component's \`createTimeline\`, accept a \`script\` array and \`cursor_targets\` in the data, then call \`runScript()\`:

\`\`\`javascript
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();

  // 1. Build your UI (chat interface, dashboard, form, etc.)
  // ... create DOM elements ...

  // 2. Run the script for interactive animations
  if (data.script && data.script.length > 0) {
    runScript(tl, el, data.script, data.cursor_targets || {}, ctx);
  }

  return tl;
}
\`\`\`

### Available Functions (all global, no imports needed)

**Cursor:**
- \`createCursor(container, options)\` -- creates a macOS pointer cursor, returns the element
- \`moveCursor(tl, cursor, target, at, duration, ease)\` -- smooth cursor movement
- \`clickCursor(tl, cursor, at)\` -- click pulse effect
- \`doubleClickCursor(tl, cursor, at)\` -- double click
- \`hideCursor(tl, cursor, at)\` -- fade cursor out
- \`showCursor(tl, cursor, at)\` -- fade cursor in
- \`resolveTarget(targets, name)\` -- resolve a target name to {x, y}

**Typing:**
- \`typeText(tl, element, text, at, speed)\` -- type character by character (speed = chars/sec)
- \`deleteText(tl, element, count, at, speed)\` -- delete characters
- \`selectAllText(tl, element, at)\` -- visual text selection
- \`pasteText(tl, element, text, at)\` -- instant paste

**Camera:**
- \`createCameraWrapper(container)\` -- wraps content for camera control
- \`zoomTo(tl, camera, target, scale, at, duration, ease)\` -- zoom to area
- \`zoomOut(tl, camera, at, duration, ease)\` -- zoom back to full
- \`panCamera(tl, camera, x, y, at, duration, ease)\` -- pan view
- \`rotateCamera(tl, camera, rotateX, rotateY, at, duration, ease)\` -- 3D rotate
- \`resetCamera(tl, camera, at, duration, ease)\` -- reset all transforms

**Script Runner:**
- \`runScript(tl, container, script, targets, ctx, handlers)\` -- parse and execute a full script array

### Script Action Format

Scripts are arrays of timed actions in the component's data:

\`\`\`json
{
  "script": [
    { "action": "move-cursor", "target": "input-field", "at": 1.0, "duration": 0.6 },
    { "action": "click", "target": "input-field", "at": 1.6 },
    { "action": "type", "target": "input-field", "text": "Hello world", "at": 2.0, "speed": 30 },
    { "action": "move-cursor", "target": "submit-btn", "at": 4.0, "duration": 0.5 },
    { "action": "click", "target": "submit-btn", "at": 4.5 },
    { "action": "zoom-to", "target": "result-area", "scale": 1.5, "at": 5.0, "duration": 1.0 },
    { "action": "hide-cursor", "at": 5.0 }
  ],
  "cursor_targets": {
    "input-field": { "x": "50%", "y": "70%" },
    "submit-btn": { "x": "55%", "y": "85%" },
    "result-area": { "x": "50%", "y": "40%" }
  }
}
\`\`\`

### Available Actions
- **Cursor:** move-cursor, click, double-click, hover, drag, hide-cursor, show-cursor
- **Typing:** type, type-delete, type-select-all, type-paste
- **Camera:** zoom-to, zoom-out, pan, rotate-3d, camera-reset
- **UI:** show-element, hide-element, highlight, open-dropdown, close-dropdown, toggle, scroll
- **Flow:** wait, parallel (run multiple actions at same time)

### Cursor Targets
Targets are named positions as percentages: \`{ "x": "50%", "y": "85%" }\`
Elements with \`data-target="name"\` attributes can also be targeted by name.

### Custom Action Handlers
For component-specific actions (like "show-response" in a chat UI), pass handlers:

\`\`\`javascript
runScript(tl, el, data.script, data.cursor_targets, ctx, {
  'show-response': function(tl, container, action, at, duration, ctx) {
    var responseEl = container.querySelector('.response');
    responseEl.textContent = action.text;
    tl.to(responseEl, { autoAlpha: 1, duration: 0.3 }, at);
  }
});
\`\`\`

### Example: Chat Interface with Script

\`\`\`html
<template>
  <div class="chat-ui">
    <div class="messages"></div>
    <input class="chat-input" data-target="chat-input" placeholder="Type a message..." />
    <button class="send-btn" data-target="send-btn">Send</button>
    <div class="response" style="visibility:hidden;opacity:0;"></div>
  </div>
</template>

<script>
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();
  
  // Build UI elements...
  
  // Run interactive script
  if (data.script) {
    runScript(tl, el, data.script, data.cursor_targets || {}, ctx, {
      'show-response': function(tl, container, action, at, duration) {
        var resp = container.querySelector('.response');
        resp.textContent = action.text || 'AI response here...';
        tl.to(resp, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' }, at);
      }
    });
  }
  
  return tl;
}
</script>
\`\`\`
`;
