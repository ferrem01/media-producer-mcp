/**
 * Component Playground SPA - LLM-driven component iteration tool.
 *
 * Workflow: prompt -> generate -> preview -> iterate -> save
 * Three-panel layout: Library | Preview | Source/Data/Chat
 */

import { QUOTIENT_CSS } from "../quotient-theme.js";
import { RAIL_CSS, RAIL_JS, railHtml } from "../preview-app/home-shell.js";

export function getPlaygroundHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playground — Media Producer</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
${QUOTIENT_CSS}
/* The Playground wears the app's skin (Studio, Home): quotient-theme tokens,
   the transparent 48px bar on the canvas, white panels carrying the depth,
   the near-black primary. It was the one dark slate page left. */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: var(--font-sans);
  background: var(--core-panel-bg);
  color: var(--content-primary);
  font-size: 13px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--gray-50); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--gray-100); }

/* ── The home rail (Films / Team / Brand / Components) ──
   The same rail every home page wears, Components marked: the Playground is
   one of those rooms, not a separate tool. Its tokens are scoped to the rail
   because the home shell and quotient-theme share some names. */
nav.rail {
  --bg: #faf9f7; --surface: #ffffff; --surface-2: #f4f2ee;
  --border: #e6e3dd; --border-2: #d8d4cc;
  --text: #17171c; --text-2: #5f5c56; --text-3: #8d8980;
  font: 400 15px/1.5 var(--font-sans);
}
nav.rail a { color: inherit; text-decoration: none; }
${RAIL_CSS}

/* ── Layout ── */
.shell { height: 100vh; }
#app { display: flex; flex-direction: column; height: 100vh; flex: 1; min-width: 0; }
header {
  display: flex; align-items: center; gap: 16px;
  padding: 0 16px 0 12px; height: 48px; flex-shrink: 0; background: transparent;
}
header h1 { font-size: 14px; font-weight: 500; color: var(--content-primary); white-space: nowrap; letter-spacing: -0.01em;
  display: flex; align-items: center; gap: 8px; }
header h1::before { content: ''; width: 18px; height: 18px; border-radius: 6px; flex: none;
  background: var(--surface-action); box-shadow: var(--shadow-weak); }
.hdr-sep { color: var(--content-tertiary); font-size: 14px; margin: 0 -8px; }
#comp-name { font: 500 14px/20px var(--font-sans); color: var(--content-primary); letter-spacing: -0.01em;
  padding: 3px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }
#comp-name.empty { color: var(--content-tertiary); }
.header-controls { display: flex; align-items: center; gap: 8px; margin-left: auto; }
#dirty-flag { color: var(--accent-orange); font-size: 12px; font-weight: 500; }

.btn, .topbar-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px; border: 1px solid transparent; border-radius: var(--radius);
  font-size: 13px; font-weight: 500; font-family: inherit; line-height: 1; white-space: nowrap; text-decoration: none;
  cursor: pointer; transition: all 150ms cubic-bezier(.4,0,.2,1);
  background: var(--primary); color: var(--primary-foreground); box-shadow: var(--shadow-weak);
}
.btn:active, .topbar-btn:active { transform: translateY(1px); }
.btn:focus-visible, .topbar-btn:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent); }
.btn:disabled, .topbar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary, .topbar-btn.secondary {
  background: var(--surface-primary); color: var(--content-primary); border-color: var(--border-secondary);
}
.btn-secondary:hover, .topbar-btn.secondary:hover { background: var(--surface-secondary); }

#panels { display: flex; flex: 1; min-height: 0; gap: 8px; padding: 0 8px 8px; }
.panel {
  background: var(--surface-primary); border-radius: var(--radius-xl, 16px);
  box-shadow: var(--shadow-weak); border: 1px solid var(--border-secondary);
  display: flex; flex-direction: column; overflow: hidden;
}

/* ── Left Panel ── */
#left-panel { width: 260px; min-width: 200px; flex-shrink: 0; }
.panel-tabs { display: flex; border-bottom: 1px solid var(--border-secondary); flex-shrink: 0; padding: 0 8px; gap: 4px; }
.panel-tab {
  flex: 1; padding: 10px 0 9px; text-align: center; font-size: 12px;
  font-weight: 500; cursor: pointer; color: var(--content-secondary);
  border: none; border-bottom: 2px solid transparent; background: none; font-family: inherit;
  transition: all 0.15s;
}
.panel-tab.active { color: var(--content-primary); border-bottom-color: var(--surface-action); }
.panel-tab:hover { color: var(--content-primary); }
.tab-content { display: none; flex: 1; overflow-y: auto; }
.tab-content.active { display: flex; flex-direction: column; }
#tab-data.active { display: flex; flex-direction: column; overflow: hidden; }

#create-btn-wrap { padding: 10px; flex-shrink: 0; }
#create-btn { width: 100%; }

.comp-group-label {
  padding: 14px 14px 4px; font-size: 11px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--content-tertiary);
}
.comp-group-label:first-child { padding-top: 10px; }
.comp-item, .tenant-comp-item {
  margin: 0 6px; padding: 6px 10px; cursor: pointer; font-size: 13px; border-radius: 8px;
  color: var(--content-primary); transition: background 0.1s; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; line-height: 1.4;
  min-height: 32px; display: flex; align-items: center;
}
.tenant-comp-item { justify-content: space-between; }
.comp-item:hover, .tenant-comp-item:hover { background: var(--surface-secondary); }
.comp-item.active, .tenant-comp-item.active { background: var(--surface-tertiary); font-weight: 500; }
.tenant-comp-item .delete-btn {
  background: none; border: none; color: var(--content-tertiary); cursor: pointer;
  font-size: 14px; padding: 2px 4px; border-radius: 4px; display: none;
}
.tenant-comp-item:hover .delete-btn { display: block; }
.tenant-comp-item .delete-btn:hover { color: var(--destructive); background: color-mix(in srgb, var(--destructive) 10%, transparent); }

.empty-msg { padding: 20px 12px; color: var(--content-tertiary); font-size: 12px; text-align: center; }

/* ── Center Panel (Preview) ── */
#center-panel { flex: 1; min-width: 300px; }
#preview-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; border-bottom: 1px solid var(--border-secondary); flex-shrink: 0;
}
#preview-toolbar select, .preview-btn {
  height: 28px; background: var(--surface-primary); border: 1px solid var(--border-secondary); border-radius: 8px;
  color: var(--content-primary); padding: 0 10px; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer;
  box-shadow: var(--shadow-weak);
}
.preview-btn:hover { background: var(--surface-secondary); }
#preview-status { font-size: 11px; color: var(--content-secondary); margin-left: auto; }
#preview-container {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 16px; overflow: hidden; position: relative; background: var(--surface-secondary);
}
#preview-iframe {
  border: none; background: #000; border-radius: 10px;
  box-shadow: var(--shadow-tw-lg, 0 8px 32px rgba(0,0,0,0.18));
  transform-origin: top left; position: absolute; top: 0; left: 0;
}
#preview-sizer { position: relative; margin: auto; }
#preview-placeholder { color: var(--content-tertiary); font-size: 14px; text-align: center; }
.preview-loading {
  position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; background: color-mix(in srgb, var(--surface-primary) 70%, transparent); z-index: 10;
  backdrop-filter: blur(4px); border-radius: 10px;
}
.spinner {
  width: 24px; height: 24px; border: 2px solid var(--border-tertiary);
  border-top-color: var(--surface-action); border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Right Panel ── */
#right-panel { width: 400px; min-width: 280px; flex-shrink: 0; }
#right-panel .tab-content { padding: 0; }
#source-editor, #data-editor {
  width: 100%; height: 100%; resize: none; border: none; flex: 1; min-height: 0;
  background: var(--surface-secondary); color: var(--content-primary); padding: 12px;
  font-family: var(--font-mono); font-size: 12px; line-height: 1.6; tab-size: 2;
}
#source-editor:focus, #data-editor:focus { outline: none; }

/* ── Chat ── */
#chat-container { display: flex; flex-direction: column; height: 100%; }
#chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.chat-msg { padding: 8px 10px; border-radius: 10px; font-size: 12px; line-height: 1.5; max-width: 95%; word-wrap: break-word; }
.chat-msg.user { background: var(--surface-action); color: var(--surface-action-reverse); align-self: flex-end; border-bottom-right-radius: 3px; }
.chat-msg.assistant { background: var(--surface-tertiary); color: var(--content-primary); align-self: flex-start; border-bottom-left-radius: 3px; }
.chat-msg.error { background: color-mix(in srgb, var(--destructive) 10%, transparent); color: var(--destructive); }
.chat-msg.system { background: none; color: var(--content-secondary); font-style: italic; text-align: center; align-self: center; }
#chat-input-wrap { display: flex; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--border-secondary); flex-shrink: 0; }
#chat-input, .modal-content textarea, .field-input, .array-item-row input, .array-item-row select,
.script-item-header select, .script-param input, .script-param select {
  background: var(--surface-primary); border: 1px solid var(--input); border-radius: 8px;
  color: var(--content-primary); font-family: inherit; box-shadow: var(--shadow-weak);
  transition: border-color 150ms, box-shadow 150ms;
}
#chat-input { flex: 1; padding: 8px 10px; font-size: 12px; resize: none; }
#chat-input:focus, .modal-content textarea:focus, .field-input:focus, .array-item-row input:focus, .array-item-row select:focus,
.script-item-header select:focus, .script-param input:focus, .script-param select:focus {
  outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent);
}
#chat-send { height: auto; }

/* ── Generate Modal ── */
#generate-modal {
  display: none; position: fixed; inset: 0; z-index: 1000;
  background: var(--surface-overlay, rgba(0,0,0,0.4)); backdrop-filter: blur(4px);
  align-items: center; justify-content: center;
}
#generate-modal.active { display: flex; }
.modal-content {
  background: var(--surface-primary); border: 1px solid var(--border-secondary); border-radius: 16px;
  box-shadow: var(--shadow-overlay, 0 24px 64px rgba(0,0,0,0.2)); padding: 24px; width: 500px; max-width: 90vw;
}
.modal-content h3 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
.modal-content textarea { width: 100%; height: 100px; padding: 10px; font-size: 13px; resize: vertical; margin-bottom: 12px; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* ── Data Form Editor ── */
#data-form { padding: 12px; overflow-y: auto; flex: 1; }
#data-form.hidden { display: none; }
.hidden { display: none !important; }
.form-toggle-bar { display: flex; border-bottom: 1px solid var(--border-secondary); flex-shrink: 0; padding: 0 8px; }
.form-toggle-btn {
  flex: 1; padding: 7px 0; text-align: center; font-size: 11px; font-weight: 500; cursor: pointer;
  color: var(--content-secondary); border: none; background: none; font-family: inherit;
  border-bottom: 2px solid transparent; transition: all 0.15s;
}
.form-toggle-btn.active { color: var(--content-primary); border-bottom-color: var(--surface-action); }
.form-toggle-btn:hover { color: var(--content-primary); }

.field-group { margin-bottom: 14px; }
.field-label {
  display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500;
  color: var(--content-secondary); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em;
}
.field-label .field-type { font-weight: 400; color: var(--content-tertiary); text-transform: none; font-size: 10px; letter-spacing: 0; }
.field-label .field-required { color: var(--destructive); font-size: 9px; }
.field-label .field-optional { color: var(--content-tertiary); font-size: 10px; font-weight: 400; }
.field-input { width: 100%; padding: 6px 8px; font-size: 12px; }
.field-input::placeholder { color: var(--content-tertiary); }
select.field-input { cursor: pointer; }
.field-input[type="number"] { font-family: var(--font-mono); }
.field-input[type="color"] { height: 32px; padding: 2px; cursor: pointer; }
.color-field-wrap { display: flex; align-items: center; gap: 6px; }
.color-field-wrap input[type="color"] { width: 32px; flex-shrink: 0; }
.color-field-wrap input[type="text"] { flex: 1; }

/* Toggle switch for booleans */
.toggle-wrap { display: flex; align-items: center; gap: 8px; }
.toggle-switch { position: relative; width: 36px; height: 20px; cursor: pointer; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.toggle-track { position: absolute; inset: 0; background: var(--gray-100); border-radius: 10px; transition: background 0.2s; }
.toggle-switch input:checked + .toggle-track { background: var(--surface-action); }
.toggle-thumb {
  position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  background: var(--white); border-radius: 50%; transition: transform 0.2s; box-shadow: var(--shadow-weak);
}
.toggle-switch input:checked ~ .toggle-thumb { transform: translateX(16px); }
.toggle-label { font-size: 12px; color: var(--content-secondary); }

/* Array fields */
.array-field { margin-top: 4px; }
.array-item {
  display: flex; gap: 4px; align-items: flex-start; padding: 6px 8px;
  background: var(--surface-secondary); border: 1px solid var(--border-secondary); border-radius: 8px; margin-bottom: 4px;
}
.array-item:hover { border-color: var(--border-tertiary); }
.array-item-fields { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.array-item-row { display: flex; gap: 6px; align-items: center; }
.array-item-row label { font-size: 10px; color: var(--content-secondary); min-width: 50px; flex-shrink: 0; }
.array-item-row input, .array-item-row select { flex: 1; padding: 4px 6px; font-size: 11px; }
.array-remove-btn {
  background: none; border: none; color: var(--content-tertiary); cursor: pointer;
  font-size: 14px; padding: 2px 4px; border-radius: 4px; flex-shrink: 0; margin-top: 2px;
}
.array-remove-btn:hover { color: var(--destructive); background: color-mix(in srgb, var(--destructive) 10%, transparent); }
.array-add-btn {
  background: var(--surface-primary); border: 1px dashed var(--border-tertiary); border-radius: 8px;
  color: var(--content-secondary); padding: 6px; font-size: 11px; font-family: inherit; cursor: pointer;
  width: 100%; text-align: center; transition: all 0.15s;
}
.array-add-btn:hover { border-color: var(--content-secondary); color: var(--content-primary); }

/* Script builder */
.script-section { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border-secondary); }
.script-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.script-help { margin: 4px 0 10px; font-size: 11px; color: var(--content-secondary); }
.script-help summary { cursor: pointer; color: var(--content-link, var(--accent-blue)); font-weight: 500; }
.script-help-row { margin: 6px 0 0 12px; line-height: 1.5; }
.script-help-row b { color: var(--content-primary); }
.script-header h4 { font-size: 11px; font-weight: 500; color: var(--content-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
.script-item { background: var(--surface-secondary); border: 1px solid var(--border-secondary); border-radius: 8px; padding: 8px; margin-bottom: 6px; }
.script-item:hover { border-color: var(--border-tertiary); }
.script-item-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.script-item-header .script-index {
  font-size: 10px; font-weight: 600; color: var(--content-secondary);
  background: var(--surface-tertiary); padding: 1px 5px; border-radius: 4px;
}
.script-item-header select { flex: 1; padding: 3px 6px; font-size: 11px; }
.script-item-params { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
.script-param { display: flex; flex-direction: column; gap: 2px; }
.script-param label { font-size: 10px; color: var(--content-secondary); }
.script-param input, .script-param select { padding: 3px 6px; font-size: 11px; }
.no-schema-msg { padding: 16px; color: var(--content-tertiary); font-size: 12px; text-align: center; font-style: italic; }
</style>
</head>
<body>
<div class="shell">
${railHtml("components")}
<div id="app">

  <header>
    <h1>Playground</h1>
    <span class="hdr-sep">/</span>
    <span id="comp-name" class="empty">No component loaded</span>
    <div class="header-controls">
      <span id="dirty-flag" style="display:none;">&#9679; Unsaved changes</span>
      <button class="btn btn-secondary" id="refresh-btn" title="Refresh preview">Refresh</button>
      <button class="btn" id="save-btn" disabled>Save to Library</button>
    </div>
  </header>

  <div id="panels">

    <!-- Left: Component Library -->
    <div id="left-panel" class="panel">
      <div id="create-btn-wrap">
        <button class="btn" id="create-btn">+ Create Component</button>
      </div>
      <div class="panel-tabs">
        <button class="panel-tab active" data-tab="library">Library</button>
        <button class="panel-tab" data-tab="tenant">My Components</button>
      </div>
      <div class="tab-content active" id="tab-library">
        <div class="empty-msg">Loading catalog...</div>
      </div>
      <div class="tab-content" id="tab-tenant">
        <div class="empty-msg">Loading&#8230;</div>
      </div>
    </div>

    <!-- Center: Preview -->
    <div id="center-panel" class="panel">
      <div id="preview-toolbar">
        <button class="preview-btn" id="play-btn" title="Play/Restart animation">&#9654; Play</button>
        <select id="canvas-select">
          <option value="1920x1080">1920 x 1080</option>
          <option value="1080x1920">1080 x 1920</option>
          <option value="1080x1080">1080 x 1080</option>
        </select>
        <span id="preview-status"></span>
      </div>
      <div id="preview-container">
        <div id="preview-placeholder">Select or create a component to preview</div>
        <div id="preview-sizer" style="display:none;">
          <iframe id="preview-iframe"></iframe>
        </div>
      </div>
    </div>

    <!-- Right: Source / Data / Chat -->
    <div id="right-panel" class="panel">
      <div class="panel-tabs">
        <button class="panel-tab active" data-tab="source">Source</button>
        <button class="panel-tab" data-tab="data">Data</button>
        <button class="panel-tab" data-tab="chat">Chat</button>
      </div>
      <div class="tab-content active" id="tab-source">
        <textarea id="source-editor" spellcheck="false" placeholder="Component source will appear here..."></textarea>
      </div>
      <div class="tab-content" id="tab-data">
        <div class="form-toggle-bar">
          <button class="form-toggle-btn active" data-mode="form">Form</button>
          <button class="form-toggle-btn" data-mode="json">JSON</button>
        </div>
        <div id="data-form"></div>
        <textarea id="data-editor" class="hidden" spellcheck="false" placeholder="{}">{}</textarea>
      </div>
      <div class="tab-content" id="tab-chat">
        <div id="chat-container">
          <div id="chat-messages">
            <div class="chat-msg system">Describe changes to the component and I'll update it.</div>
          </div>
          <div id="chat-input-wrap">
            <input type="text" id="chat-input" placeholder="e.g. Make the headline bigger..." />
            <button class="btn" id="chat-send">Send</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>
</div>

<!-- Generate Modal -->
<div id="generate-modal">
  <div class="modal-content">
    <h3>Create a Component</h3>
    <textarea id="generate-prompt" placeholder="Describe the component you want to create...&#10;&#10;e.g. A pricing card with three tiers, gradient background, and hover effects"></textarea>
    <div class="modal-actions">
      <button class="topbar-btn secondary" id="generate-cancel">Cancel</button>
      <button class="topbar-btn" id="generate-submit">Generate</button>
    </div>
  </div>
</div>

<script>
${RAIL_JS}
</script>
<script>
(function() {
  // ── State ──
  var state = {
    tenantId: '',
    currentSource: '',
    currentType: '',
    currentCategory: 'custom',
    catalog: [],
    tenantComponents: [],
    chatHistory: [],
    previewDebounce: null,
    generating: false,
    currentSchema: null,
    formData: null,
    savedSource: ''
  };

  // ── Unsaved-changes tracking ──
  // An edit (chat or manual) is WORKING STATE until "Save to Library"; the
  // flag makes that visible and the guards make it hard to lose.
  function isDirty() {
    return !!state.currentType && els.sourceEditor.value !== state.savedSource;
  }
  function updateDirtyFlag() {
    document.getElementById('dirty-flag').style.display = isDirty() ? 'inline' : 'none';
  }
  function confirmDiscard() {
    if (!isDirty()) return true;
    return confirm('You have UNSAVED changes to "' + state.currentType + '". Discard them?');
  }
  window.addEventListener('beforeunload', function(e) {
    if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // Mirror of the server's deriveDataFields: the FORM learns new fields the
  // moment an edit introduces them -- not on save. (Save persists; it does
  // not reveal.)
  function deriveFieldsFromSource(source) {
    var fields = {};
    var patterns = [
      /data-bind=["']([a-zA-Z_][a-zA-Z0-9_]*)["']/g,
      /\\bdata\\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /\\{\\{\\{?[#^]?\\s*([a-zA-Z_][a-zA-Z0-9_]*)/g
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m;
      while ((m = patterns[i].exec(source)) !== null) {
        var key = m[1];
        if (key === 'script' || key === 'cursor_targets') continue;
        if (!fields[key]) fields[key] = { type: 'string', label: key.replace(/_/g, ' ').replace(/\\b\\w/g, function(c) { return c.toUpperCase(); }), optional: true };
      }
    }
    // The text a bind currently wraps IS its fallback -- surface it as the
    // form placeholder / JSON prefill. A regex demanding text directly after
    // the bind's ">" missed every bind wrapping nested markup (captured
    // LinkedIn span-soup) -- walk the element instead, collecting text
    // through children until the bind's own closing tag.
    var bindOpen = /data-bind=["']([a-zA-Z_][a-zA-Z0-9_]*)["'][^>]*>/g;
    var bt;
    while ((bt = bindOpen.exec(source)) !== null) {
      if (fields[bt[1]] && !fields[bt[1]].placeholder) {
        var btxt = bindInnerText(source, bindOpen.lastIndex);
        if (btxt) fields[bt[1]].placeholder = btxt;
      }
    }
    // The OTHER abstraction shape -- the one the LLM actually writes for
    // captured components: a script binding with a literal fallback,
    //   el.textContent = (data && data.author_name) || 'Gina Kleiner';
    // The real captured value IS that fallback literal. Lift it. Behavior
    // knobs (entrance/accent) stay empty on purpose -- hints, not values.
    var scriptFallback = /\\bdata\\.([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\)?\\s*\\|\\|\\s*("([^"\\\\]{1,600})"|'([^'\\\\]{1,600})')/g;
    var sf;
    while ((sf = scriptFallback.exec(source)) !== null) {
      var sfKey = sf[1];
      if (sfKey === 'entrance' || sfKey === 'accent') continue;
      if (fields[sfKey] && !fields[sfKey].placeholder) {
        var fb = (sf[3] !== undefined ? sf[3] : sf[4]) || '';
        fb = fb.replace(/\\s+/g, ' ').trim().slice(0, 500);
        if (fb) fields[sfKey].placeholder = fb;
      }
    }
    // The THIRD abstraction shape the LLM writes: tag the target element
    // with a marker class and set it from data, NO fallback literal --
    //   var postTextEl = el.querySelector('.cap-post-text');
    //   if (postTextEl && data && data.post_text) postTextEl.textContent = data.post_text;
    // The real value is the tagged element's current text in the MARKUP:
    // resolve the selector by scanning (one code path, executable in the
    // page test -- no DOMParser divergence between test and browser).
    var selForVar = {};
    var varDecl = /(?:var|let|const)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*[^;\\n]*?querySelector\\(\\s*["']([^"']+)["']/g;
    var vd;
    while ((vd = varDecl.exec(source)) !== null) selForVar[vd[1]] = vd[2];
    var assign = /(?:querySelector\\(\\s*["']([^"']+)["']\\s*\\)|([a-zA-Z_$][a-zA-Z0-9_$]*))\\s*\\.(?:textContent|innerText|innerHTML)\\s*=\\s*[^;]{0,80}?\\bdata\\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    var asg;
    while ((asg = assign.exec(source)) !== null) {
      var aKey = asg[3];
      if (aKey === 'entrance' || aKey === 'accent') continue;
      if (!fields[aKey] || fields[aKey].placeholder) continue;
      var aSel = asg[1] || selForVar[asg[2]];
      if (!aSel) continue;
      var atxt = findSelectorText(source, aSel);
      if (atxt) fields[aKey].placeholder = atxt;
    }
    return fields;
  }
  // Locate the element a simple selector points at (last segment: .class,
  // #id, or [attr="value"]) and return its inner text via bindInnerText.
  function findSelectorText(source, sel) {
    var seg = (sel || '').trim().split(/[\\s>]+/).pop() || '';
    var pos = -1;
    var m;
    var dot = seg.lastIndexOf('.');
    if (seg.charAt(0) === '#') {
      var idName = seg.slice(1);
      var idRe = /id=["']([^"']*)["']/g;
      while ((m = idRe.exec(source)) !== null) { if (m[1] === idName) { pos = m.index; break; } }
    } else if (dot >= 0) {
      var cls = seg.slice(dot + 1).replace(/[^-_a-zA-Z0-9]/g, '');
      var clsRe = /class=["']([^"']*)["']/g;
      while ((m = clsRe.exec(source)) !== null) {
        if ((' ' + m[1] + ' ').indexOf(' ' + cls + ' ') >= 0) { pos = m.index; break; }
      }
    } else {
      var am = /\\[([-a-zA-Z0-9_]+)=["']?([^\\]"']*)/.exec(seg);
      if (am) {
        var probe = am[1] + '="' + am[2] + '"';
        pos = source.indexOf(probe);
        if (pos < 0) { probe = am[1] + "='" + am[2] + "'"; pos = source.indexOf(probe); }
      }
    }
    if (pos < 0) return '';
    var gt = source.indexOf('>', pos);
    if (gt < 0) return '';
    return bindInnerText(source, gt + 1);
  }
  // Inner text of the element whose opening tag ends at index start: scan tags
  // tracking depth so nested children are traversed, not mistaken for the
  // end. Self-contained on purpose -- the page test extracts and EXECUTES it.
  function bindInnerText(src, start) {
    var voids = { area:1, base:1, br:1, col:1, embed:1, hr:1, img:1, input:1, link:1, meta:1, param:1, source:1, track:1, wbr:1 };
    var tag = /<\\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g;
    tag.lastIndex = start;
    var out = '';
    var depth = 0;
    var last = start;
    var m;
    while ((m = tag.exec(src)) !== null) {
      out += src.slice(last, m.index);
      last = tag.lastIndex;
      if (m[0].charAt(1) === '/') {
        if (depth === 0) break;
        depth--;
      } else if (!voids[m[1].toLowerCase()] && m[0].charAt(m[0].length - 2) !== '/') {
        depth++;
      }
      if (out.length > 1500) break;
    }
    out = out.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    return out.replace(/\\s+/g, ' ').trim().slice(0, 500);
  }
  function refreshSchemaFromSource(source) {
    var derived = deriveFieldsFromSource(source);
    if (!state.currentSchema) state.currentSchema = { data: {} };
    if (!state.currentSchema.data) state.currentSchema.data = {};
    for (var k in derived) {
      if (!state.currentSchema.data[k]) state.currentSchema.data[k] = derived[k];
    }
    if (formMode === 'form') {
      try { renderDataForm(JSON.parse(els.dataEditor.value || '{}'), state.currentSchema); } catch (e) {}
    }
  }

  // ── DOM Refs ──
  var els = {
    compName: document.getElementById('comp-name'),
    saveBtn: document.getElementById('save-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    createBtn: document.getElementById('create-btn'),
    tabLibrary: document.getElementById('tab-library'),
    tabTenant: document.getElementById('tab-tenant'),
    previewIframe: document.getElementById('preview-iframe'),
    previewSizer: document.getElementById('preview-sizer'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    previewContainer: document.getElementById('preview-container'),
    previewStatus: document.getElementById('preview-status'),
    canvasSelect: document.getElementById('canvas-select'),
    playBtn: document.getElementById('play-btn'),
    sourceEditor: document.getElementById('source-editor'),
    dataEditor: document.getElementById('data-editor'),
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    chatSend: document.getElementById('chat-send'),
    generateModal: document.getElementById('generate-modal'),
    generatePrompt: document.getElementById('generate-prompt'),
    generateSubmit: document.getElementById('generate-submit'),
    generateCancel: document.getElementById('generate-cancel')
  };

  // ── Who am I? ──
  // The home shell's boot, exactly as Films / Team / Brand (and Studio) do
  // it: a ?tenant= link wins, else the login session (/auth/me), else sign
  // in. It also wires the rail and shows who is signed in. There is no
  // tenant field to type into any more.
  function whoAmI() {
    bootHome(function(tenant) {
      state.tenantId = tenant;
      loadTenantComponents();
    });
  }

  // ── Tab Switching ──
  document.querySelectorAll('.panel-tabs').forEach(function(tabBar) {
    tabBar.querySelectorAll('.panel-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var panel = tabBar.parentElement;
        panel.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
        panel.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
        tab.classList.add('active');
        var target = panel.querySelector('#tab-' + tab.getAttribute('data-tab'));
        if (target) target.classList.add('active');
      });
    });
  });

  // ── API Helpers ──
  function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    // Carry the sign-in. This page relied entirely on the session cookie, so a
    // token link into it (the kind home hands out, and every share link) got a
    // 401 on the catalog and "Failed to load" on My Components.
    var pgTok = new URLSearchParams(window.location.search).get('token');
    if (pgTok) {
      opts.headers['Authorization'] = 'Bearer ' + pgTok;
      path += (path.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(pgTok);
    }
    return fetch(path, opts).then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || r.statusText); });
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') >= 0) return r.json();
      return r.text();
    });
  }

  // ── Load Catalog ──
  function loadCatalog() {
    api('GET', '/playground/api/components/catalog').then(function(catalog) {
      state.catalog = catalog;
      renderCatalog(catalog);
    }).catch(function() {
      els.tabLibrary.innerHTML = '<div class="empty-msg">Failed to load catalog</div>';
    });
  }

  function renderCatalog(catalog) {
    var groups = {};
    catalog.forEach(function(c) {
      var cat = c.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    var html = '';
    Object.keys(groups).sort().forEach(function(cat) {
      html += '<div class="comp-group-label">' + cat + '</div>';
      groups[cat].sort(function(a,b) { return a.type.localeCompare(b.type); }).forEach(function(c) {
        // The FOLDER, not the schema's category label: they differ
        // (scene-template lives in scene-templates/).
        html += '<div class="comp-item" data-category="' + (c.dir || cat) + '" data-type="' + c.type + '">' +
          (c.label || c.type) + '</div>';
      });
    });
    els.tabLibrary.innerHTML = html || '<div class="empty-msg">No components found</div>';
    els.tabLibrary.querySelectorAll('.comp-item').forEach(function(item) {
      item.addEventListener('click', function() {
        loadGlobalComponent(item.getAttribute('data-category'), item.getAttribute('data-type'));
        // Highlight
        els.tabLibrary.querySelectorAll('.comp-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
      });
    });
  }

  // ── Load Tenant Components ──
  function loadTenantComponents() {
    if (!state.tenantId) {
      els.tabTenant.innerHTML = '<div class="empty-msg">Signing in&#8230;</div>';
      return;
    }
    api('GET', '/playground/api/tenant-components/' + encodeURIComponent(state.tenantId)).then(function(comps) {
      state.tenantComponents = comps;
      renderTenantComponents(comps);
    }).catch(function() {
      els.tabTenant.innerHTML = '<div class="empty-msg">Failed to load</div>';
    });
  }

  function renderTenantComponents(comps) {
    if (!comps.length) {
      els.tabTenant.innerHTML = '<div class="empty-msg">No custom components yet</div>';
      return;
    }
    var html = '';
    comps.forEach(function(c) {
      html += '<div class="tenant-comp-item" data-type="' + c.type + '">' +
        '<span>' + (c.label || c.type) + '</span>' +
        '<button class="delete-btn" data-type="' + c.type + '" title="Delete">&times;</button>' +
        '</div>';
    });
    els.tabTenant.innerHTML = html;
    els.tabTenant.querySelectorAll('.tenant-comp-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-btn')) return;
        loadTenantComponent(item.getAttribute('data-type'));
        els.tabTenant.querySelectorAll('.tenant-comp-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
      });
    });
    els.tabTenant.querySelectorAll('.delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var type = btn.getAttribute('data-type');
        if (!confirm('Delete component "' + type + '"?')) return;
        api('DELETE', '/playground/api/tenant-components/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(type)).then(function() {
          loadTenantComponents();
        });
      });
    });
  }

  // ── Load Component Source ──
  function loadGlobalComponent(category, type) {
    if (!confirmDiscard()) return;
    var sourceUrl = '/playground/api/components/' + encodeURIComponent(category) + '/' + encodeURIComponent(type) + '/source';
    var defaultsUrl = '/playground/api/components/' + encodeURIComponent(category) + '/' + encodeURIComponent(type) + '/defaults';
    
    Promise.all([
      api('GET', sourceUrl),
      api('GET', defaultsUrl).catch(function() { return null; })
    ]).then(function(results) {
      setComponent(type, category, results[0], results[1]);
    }).catch(function(err) {
      alert('Failed to load: ' + err.message);
    });
  }

  function loadTenantComponent(type) {
    if (!confirmDiscard()) return;
    api('GET', '/playground/api/tenant-components/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(type) + '/source').then(function(source) {
      setComponent(type, 'custom', source);
      // Captured components mint a schema (entrance/accent/script + the verb
      // list) -- fetch it so the form editor works for them too.
      api('GET', '/playground/api/tenant-components/' + encodeURIComponent(state.tenantId) + '/' + encodeURIComponent(type) + '/schema').then(function(schema) {
        state.currentSchema = schema;
        // Platform convention: components open with sample data already in
        // the JSON. For a capture the honest sample data is the REAL
        // captured text -- prefill each content field with the value its
        // bind currently wraps (never "Sample Value" junk). Behavior knobs
        // (entrance/accent: nothing to extract) stay empty with hints.
        var prefill = {};
        var derived = deriveFieldsFromSource(els.sourceEditor.value);
        for (var dk in derived) {
          if (derived[dk].placeholder) prefill[dk] = derived[dk].placeholder;
        }
        els.dataEditor.value = JSON.stringify(prefill, null, 2);
        state.formData = prefill;
        if (formMode === 'form') {
          try { renderDataForm(prefill, schema); } catch (e) {}
        }
      }).catch(function() { /* plain custom component: no schema, no form */ });
    }).catch(function(err) {
      alert('Failed to load: ' + err.message);
    });
  }

  function setComponent(type, category, source, schemaDefaults) {
    state.currentType = type;
    state.currentCategory = category;
    state.currentSource = source;
    state.currentSchema = null;
    state.savedSource = source;
    els.sourceEditor.value = source;
    updateDirtyFlag();
    els.compName.textContent = type;
    els.compName.classList.remove('empty');
    els.saveBtn.disabled = false;
    // Use schema-derived defaults if available, fall back to regex extraction
    if (schemaDefaults && typeof schemaDefaults === 'object' && Object.keys(schemaDefaults).length > 0) {
      els.dataEditor.value = JSON.stringify(schemaDefaults, null, 2);
    } else {
      els.dataEditor.value = extractDefaultData(source);
    }
    state.chatHistory = [];
    els.chatMessages.innerHTML = '<div class="chat-msg system">Editing: ' + type + '. Describe changes and I\\'ll update the source.</div>';

    // Fetch schema for form editor
    if (category !== 'custom') {
      api('GET', '/playground/api/components/' + encodeURIComponent(category) + '/' + encodeURIComponent(type) + '/schema').then(function(schema) {
        state.currentSchema = schema;
        if (formMode === 'form') {
          try {
            var d = JSON.parse(els.dataEditor.value || '{}');
            renderDataForm(d, schema);
          } catch(e) {}
        }
      }).catch(function() {
        state.currentSchema = null;
        renderDataForm({}, null);
      });
    } else {
      renderDataForm({}, null);
    }

    // Switch to Source tab when loading
    var srcTab = document.querySelector('#right-panel .panel-tab[data-tab="source"]');
    if (srcTab) srcTab.click();
    schedulePreview();
  }

  // ── Extract default data from component source ──
  function extractDefaultData(source) {
    var data = {};

    // 1. Extract data-bind attributes
    var bindMatches = source.match(/data-bind="([^"]+)"/g);
    if (bindMatches) {
      bindMatches.forEach(function(m) {
        var key = m.match(/data-bind="([^"]+)"/)[1];
        if (!data[key]) data[key] = generatePlaceholder(key);
      });
    }

    // 2. Extract data.xxx references from script
    var dataRefs = source.match(/data\\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (dataRefs) {
      dataRefs.forEach(function(m) {
        var key = m.replace('data.', '');
        if (key === 'length' || key === 'forEach' || key === 'map' || key === 'filter') return;
        if (!data[key]) data[key] = generatePlaceholder(key);
      });
    }

    // 3. Extract {{mustache}} references from template
    var mustacheMatches = source.match(/\\{\\{([a-zA-Z_][a-zA-Z0-9_]*)\\}\\}/g);
    if (mustacheMatches) {
      mustacheMatches.forEach(function(m) {
        var key = m.replace(/\\{\\{|\\}\\}/g, '');
        if (!data[key]) data[key] = generatePlaceholder(key);
      });
    }

    return JSON.stringify(data, null, 2);
  }

  function generatePlaceholder(key) {
    var k = key.toLowerCase();
    // Numbers / stats
    if (k === 'stat' || k === 'value' || k === 'number' || k === 'count') return '2,847';
    if (k === 'percentage' || k === 'percent') return '94%';
    if (k === 'price') return '$49';
    if (k === 'rating') return '4.9';
    if (k === 'duration') return 5;
    if (k === 'delay' || k === 'speed') return 1;
    if (k === 'z_index' || k === 'zindex') return 10;
    if (k === 'opacity') return 1;
    if (k === 'scale') return 1;
    if (k === 'columns' || k === 'rows' || k === 'count') return 3;
    // Colors
    if (k.indexOf('color') >= 0 || k.indexOf('colour') >= 0) return '#6366f1';
    if (k.indexOf('background') >= 0 || k === 'bg') return '#0f172a';
    // URLs
    if (k === 'url' || k === 'link' || k === 'href') return 'https://example.com';
    if (k === 'src' || k === 'image' || k === 'img' || k === 'photo' || k === 'avatar') return '';
    if (k === 'logo' || k === 'icon') return '';
    if (k === 'video') return '';
    // Text fields
    if (k === 'headline' || k === 'title' || k === 'heading' || k === 'name') return 'Your Headline Here';
    if (k === 'subtitle' || k === 'subheading' || k === 'sub_title') return 'Supporting text goes here';
    if (k === 'description' || k === 'desc' || k === 'body' || k === 'text' || k === 'content') return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.';
    if (k === 'label' || k === 'tag' || k === 'badge' || k === 'eyebrow' || k === 'category') return 'Featured';
    if (k === 'button' || k === 'cta' || k === 'button_text' || k === 'cta_text') return 'Get Started';
    if (k === 'author' || k === 'speaker' || k === 'person') return 'Jane Smith';
    if (k === 'role' || k === 'job_title' || k === 'position') return 'CEO & Founder';
    if (k === 'company' || k === 'org' || k === 'organization') return 'Acme Inc';
    if (k === 'quote' || k === 'testimonial') return '"This product transformed our workflow completely."';
    if (k === 'page_title') return 'Dashboard';
    if (k.indexOf('feature') >= 0) return 'Smart Analytics';
    if (k.indexOf('item') >= 0 || k.indexOf('list') >= 0) return 'Item One';
    // Boolean
    if (k === 'show' || k === 'visible' || k === 'enabled' || k === 'active') return true;
    if (k === 'dark' || k === 'inverted' || k === 'reversed') return false;
    // Catch-all
    if (k.indexOf('text') >= 0 || k.indexOf('copy') >= 0) return 'Sample text';
    return 'Sample Value';
  }

  // ── Preview ──
  function schedulePreview() {
    if (state.previewDebounce) clearTimeout(state.previewDebounce);
    state.previewDebounce = setTimeout(updatePreview, 300);
  }

  function updatePreview() {
    var source = els.sourceEditor.value;
    if (state.currentType) refreshSchemaFromSource(source);
    if (!source.trim()) {
      els.previewSizer.style.display = 'none';
      els.previewPlaceholder.style.display = '';
      els.previewPlaceholder.textContent = 'Enter or generate component source';
      return;
    }

    var data = {};
    try { data = JSON.parse(els.dataEditor.value || '{}'); } catch(e) {}

    els.previewStatus.textContent = 'Loading...';

    api('POST', '/playground/api/components/preview', { source: source, data: data, tenant_id: state.tenantId || '' }).then(function(html) {
      els.previewPlaceholder.style.display = 'none';
      els.previewSizer.style.display = '';

      // Set canvas size
      var size = els.canvasSelect.value.split('x');
      var cw = parseInt(size[0]); var ch = parseInt(size[1]);
      els.previewIframe.setAttribute('width', cw);
      els.previewIframe.setAttribute('height', ch);

      // Scale to fit container
      scalePreview(cw, ch);

      // Write HTML to iframe
      els.previewIframe.srcdoc = html;
      els.previewStatus.textContent = '';
    }).catch(function(err) {
      els.previewStatus.textContent = 'Error: ' + err.message;
    });
  }

  function scalePreview(cw, ch) {
    var container = els.previewContainer;
    var rect = container.getBoundingClientRect();
    var pad = 32;
    var availW = rect.width - pad;
    var availH = rect.height - pad;
    var scale = Math.min(availW / cw, availH / ch, 1);
    els.previewIframe.style.transform = 'scale(' + scale + ')';
    els.previewIframe.style.width = cw + 'px';
    els.previewIframe.style.height = ch + 'px';
    els.previewSizer.style.width = Math.floor(cw * scale) + 'px';
    els.previewSizer.style.height = Math.floor(ch * scale) + 'px';
  }

  // ── Play Button ──
  els.playBtn.addEventListener('click', function() {
    try {
      var w = els.previewIframe.contentWindow;
      if (w && w.__MP_TIMELINE) {
        w.__MP_TIMELINE.restart();
      }
    } catch(e) {}
  });

  // ── Generate ──
  els.createBtn.addEventListener('click', function() {
    els.generateModal.classList.add('active');
    els.generatePrompt.value = '';
    els.generatePrompt.focus();
  });

  els.generateCancel.addEventListener('click', function() {
    els.generateModal.classList.remove('active');
  });

  els.generateModal.addEventListener('click', function(e) {
    if (e.target === els.generateModal) els.generateModal.classList.remove('active');
  });

  els.generateSubmit.addEventListener('click', doGenerate);
  els.generatePrompt.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doGenerate(); }
  });

  function doGenerate() {
    var prompt = els.generatePrompt.value.trim();
    if (!prompt || state.generating) return;

    state.generating = true;
    els.generateSubmit.disabled = true;
    els.generateSubmit.textContent = 'Generating...';

    api('POST', '/playground/api/generate', {
      prompt: prompt,
      tenant_id: state.tenantId || 'default',
      format: 'video'
    }).then(function(result) {
      els.generateModal.classList.remove('active');
      setComponent(result.type, 'custom', result.source);
      // Extract custom actions from generated source
      var genActions = extractCustomActionsFromSource(result.source);
      if (genActions.length > 0) {
        if (!state.currentSchema) state.currentSchema = {};
        if (!state.currentSchema.script_actions) state.currentSchema.script_actions = [];
        genActions.forEach(function(actionName) {
          state.currentSchema.script_actions.push({ action: actionName, description: 'Custom action' });
        });
        if (formMode === 'form' && state.formData) {
          renderDataForm(state.formData, state.currentSchema);
        }
      }
      // Switch to chat tab
      var chatTab = document.querySelector('#right-panel .panel-tab[data-tab="chat"]');
      if (chatTab) chatTab.click();
      addChatMessage('system', 'Component "' + result.type + '" generated. Make changes below or save to library.');
    }).catch(function(err) {
      alert('Generation failed: ' + err.message);
    }).finally(function() {
      state.generating = false;
      els.generateSubmit.disabled = false;
      els.generateSubmit.textContent = 'Generate';
    });
  }

  // ── Chat / Iterate ──
  els.chatSend.addEventListener('click', doIterate);
  els.chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doIterate(); }
  });

  function doIterate() {
    var instruction = els.chatInput.value.trim();
    if (!instruction || state.generating) return;
    var source = els.sourceEditor.value;
    if (!source.trim()) {
      addChatMessage('error', 'No component source to iterate on. Generate or load one first.');
      return;
    }

    addChatMessage('user', instruction);
    els.chatInput.value = '';
    state.generating = true;
    els.chatSend.disabled = true;

    addChatMessage('system', 'Updating component...');

    api('POST', '/playground/api/iterate', {
      source: source,
      instruction: instruction,
      tenant_id: state.tenantId || 'default'
    }).then(function(result) {
      // Remove the "Updating..." message
      var msgs = els.chatMessages.querySelectorAll('.chat-msg.system');
      var last = msgs[msgs.length - 1];
      if (last && last.textContent === 'Updating component...') last.remove();

      state.currentSource = result.source;
      els.sourceEditor.value = result.source;
      updateDirtyFlag();
      refreshSchemaFromSource(result.source);
      // New content fields arrive VALUED: the JSON gains the real text the
      // bind wraps, right now -- not on the next load. (Platform convention:
      // the sample data lives in the JSON.) Only ABSENT keys gain values, so
      // a field the user emptied on purpose stays empty.
      var derivedNow = deriveFieldsFromSource(result.source);
      var dataNow = {};
      try { dataNow = JSON.parse(els.dataEditor.value || '{}'); } catch (e) { dataNow = {}; }
      for (var ndk in derivedNow) {
        if (derivedNow[ndk].placeholder && !(ndk in dataNow)) dataNow[ndk] = derivedNow[ndk].placeholder;
      }
      els.dataEditor.value = JSON.stringify(dataNow, null, 2);
      state.formData = dataNow;
      addChatMessage('assistant', 'Updated! Preview, form, JSON and source all reflect the change -- UNSAVED until you Save to Library.');

      // Hot-reload: extract custom script actions from updated source and refresh form
      if (state.currentSchema) {
        var extractedActions = extractCustomActionsFromSource(result.source);
        if (extractedActions.length > 0) {
          if (!state.currentSchema.script_actions) state.currentSchema.script_actions = [];
          var existing = state.currentSchema.script_actions.map(function(a) { return a.action; });
          extractedActions.forEach(function(actionName) {
            if (existing.indexOf(actionName) < 0) {
              state.currentSchema.script_actions.push({ action: actionName, description: 'Custom action' });
              existing.push(actionName);
            }
          });
        }
        // Re-render form with current data + updated schema
        if (formMode === 'form' && state.formData) {
          renderDataForm(state.formData, state.currentSchema);
        }
      }

      schedulePreview();
    }).catch(function(err) {
      addChatMessage('error', 'Failed: ' + err.message);
    }).finally(function() {
      state.generating = false;
      els.chatSend.disabled = false;
    });
  }

  function addChatMessage(role, text) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.textContent = text;
    els.chatMessages.appendChild(div);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  // ── Save ──
  els.saveBtn.addEventListener('click', function() {
    if (!state.currentType || !els.sourceEditor.value.trim()) return;
    var tid = state.tenantId;
    if (!tid) { alert('Still signing in -- try again in a moment.'); return; }

    api('POST', '/playground/api/components/save', {
      type: state.currentType,
      source: els.sourceEditor.value,
      tenant_id: tid,
      category: state.currentCategory || 'custom'
    }).then(function() {
      els.previewStatus.textContent = 'Saved!';
      state.savedSource = els.sourceEditor.value;
      updateDirtyFlag();
      setTimeout(function() { els.previewStatus.textContent = ''; }, 2000);
      loadTenantComponents();
      // The server re-derives the schema on save (new data-binds become
      // fields) -- re-fetch it so the FORM learns them immediately.
      api('GET', '/playground/api/tenant-components/' + encodeURIComponent(tid) + '/' + encodeURIComponent(state.currentType) + '/schema').then(function(schema) {
        state.currentSchema = schema;
        try { renderDataForm(JSON.parse(els.dataEditor.value || '{}'), schema); } catch (e) {}
      }).catch(function() { /* no schema for plain custom components */ });
    }).catch(function(err) {
      alert('Save failed: ' + err.message);
    });
  });

  // ── Refresh ──
  els.refreshBtn.addEventListener('click', function() {
    updatePreview();
  });

  // ── Source / Data change ──
  els.sourceEditor.addEventListener('input', function() {
    state.currentSource = els.sourceEditor.value;
    updateDirtyFlag();
    schedulePreview();
  });
  els.dataEditor.addEventListener('input', function() {
    // When editing JSON directly, update formData
    try {
      state.formData = JSON.parse(els.dataEditor.value || '{}');
    } catch(e) {}
    schedulePreview();
  });

  // ── Canvas change ──
  els.canvasSelect.addEventListener('change', function() {
    if (els.previewIframe.style.display !== 'none') updatePreview();
  });


  // ── Resize observer for preview scaling ──
  if (window.ResizeObserver) {
    new ResizeObserver(function() {
      if (els.previewIframe.style.display !== 'none') {
        var size = els.canvasSelect.value.split('x');
        scalePreview(parseInt(size[0]), parseInt(size[1]));
      }
    }).observe(els.previewContainer);
  }


  // ── Form/JSON Toggle ──
  var formMode = 'form';
  document.querySelectorAll('.form-toggle-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = btn.getAttribute('data-mode');
      formMode = mode;
      document.querySelectorAll('.form-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      if (mode === 'form') {
        els.dataEditor.classList.add('hidden');
        document.getElementById('data-form').classList.remove('hidden');
        // Sync JSON -> form
        try {
          var d = JSON.parse(els.dataEditor.value || '{}');
          renderDataForm(d, state.currentSchema);
        } catch(e) {}
      } else {
        document.getElementById('data-form').classList.add('hidden');
        els.dataEditor.classList.remove('hidden');
        // Form data is already synced to dataEditor on every change
      }
    });
  });

  // ── Schema-Driven Data Form ──
  function renderDataForm(data, schema) {
    var formEl = document.getElementById('data-form');
    formEl.innerHTML = '';

    state.formData = data;

    if (!schema) {
      formEl.innerHTML = '<div class="no-schema-msg">No schema available. Use JSON tab to edit data.</div>';
      return;
    }

    try {
      // Extract field definitions from schema
      var fields = extractSchemaFields(schema);
      if (!fields || Object.keys(fields).length === 0) {
        formEl.innerHTML = '<div class="no-schema-msg">No editable fields in schema.</div>';
        return;
      }

      // Separate regular fields from script/cursor_targets
      var regularFields = {};
      var scriptActions = schema.script_actions || [];
      var defaultTargets = schema.default_cursor_targets || {};

      for (var k in fields) {
        if (k !== 'script' && k !== 'cursor_targets') {
          regularFields[k] = fields[k];
        }
      }

      // Render regular fields
      var fieldKeys = Object.keys(regularFields);
      for (var i = 0; i < fieldKeys.length; i++) {
        var key = fieldKeys[i];
        var field = regularFields[key];
        var fieldEl = createFieldEditor(key, field, data[key], function() {
          syncFormToJson();
        });
        formEl.appendChild(fieldEl);
      }

      // Render script builder if component supports scripting
      if (scriptActions.length > 0) {
        if (!data.script) data.script = [];
        if (!data.cursor_targets) data.cursor_targets = JSON.parse(JSON.stringify(defaultTargets));
        var scriptSection = createScriptBuilder(
          data.script,
          data.cursor_targets,
          scriptActions,
          defaultTargets,
          function() { syncFormToJson(); }
        );
        formEl.appendChild(scriptSection);
      }
    } catch(err) {
      formEl.innerHTML = '<div class="no-schema-msg">Form error: ' + err.message + '</div>';
      console.error('renderDataForm error:', err);
    }
  }

  function extractSchemaFields(schema) {
    // Format A: { data: { field: { type, ... } } }
    if (schema.data && typeof schema.data === 'object') {
      var dataObj = schema.data;
      if (dataObj.type === 'object' && dataObj.properties) {
        return dataObj.properties;
      }
      if (!dataObj.type) return schema.data;
    }
    // Format B: { properties: { field: { type, ... } } }
    if (schema.properties) return schema.properties;
    return null;
  }

  function createFieldEditor(key, field, value, onChange) {
    var group = document.createElement('div');
    group.className = 'field-group';
    group.setAttribute('data-field-key', key);

    try {
    var type = field.type || 'string';
    var label = field.label || key.replace(/_/g, ' ').replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });
    var isRequired = field.required === true;
    var isOptional = field.optional === true;

    // Label
    var labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    var labelText = document.createElement('span');
    labelText.textContent = label;
    labelEl.appendChild(labelText);

    var typeSpan = document.createElement('span');
    typeSpan.className = 'field-type';
    typeSpan.textContent = type;
    labelEl.appendChild(typeSpan);

    if (isRequired) {
      var reqSpan = document.createElement('span');
      reqSpan.className = 'field-required';
      reqSpan.textContent = '*';
      labelEl.appendChild(reqSpan);
    }

    group.appendChild(labelEl);

    // Field input based on type
    // Wrap onChange to update state.formData
    var fieldOnChange = function(newVal) {
      if (state.formData) state.formData[key] = newVal;
      onChange();
    };

    if (type === 'boolean') {
      group.appendChild(createBooleanField(key, value, fieldOnChange));
    } else if (type === 'array') {
      // Arrays are passed by reference, mutations go to state.formData[key]
      if (!state.formData[key]) state.formData[key] = value || [];
      group.appendChild(createArrayField(key, field, state.formData[key], onChange));
    } else if (type === 'object' && field.properties) {
      if (!state.formData[key]) state.formData[key] = value || {};
      group.appendChild(createObjectField(key, field.properties, state.formData[key], onChange));
    } else if (field.enum && field.enum.length > 0) {
      group.appendChild(createEnumField(key, field.enum, value, field.placeholder, fieldOnChange));
    } else if (type === 'number') {
      group.appendChild(createNumberField(key, value, field, fieldOnChange));
    } else if (type === 'string') {
      if (key.toLowerCase().indexOf('color') >= 0 || key.toLowerCase() === 'bg' || key.toLowerCase() === 'background') {
        group.appendChild(createColorField(key, value, field, fieldOnChange));
      } else {
        group.appendChild(createStringField(key, value, field, fieldOnChange));
      }
    } else {
      group.appendChild(createStringField(key, value, field, fieldOnChange));
    }

    } catch(err) {
      var errMsg = document.createElement('div');
      errMsg.className = 'no-schema-msg';
      errMsg.textContent = key + ': ' + err.message;
      group.appendChild(errMsg);
      console.error('createFieldEditor error for ' + key + ':', err);
    }

    return group;
  }

  function createStringField(key, value, field, onChange) {
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-input';
    input.setAttribute('data-key', key);
    input.value = value !== undefined && value !== null ? String(value) : '';
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.description) input.title = field.description;
    input.addEventListener('input', function() { onChange(input.value); });
    return input;
  }

  function createNumberField(key, value, field, onChange) {
    var input = document.createElement('input');
    input.type = 'number';
    input.className = 'field-input';
    input.setAttribute('data-key', key);
    input.value = value !== undefined && value !== null ? value : '';
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.description) input.title = field.description;
    input.addEventListener('input', function() {
      var v = parseFloat(input.value);
      onChange(isNaN(v) ? 0 : v);
    });
    return input;
  }

  function createColorField(key, value, field, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'color-field-wrap';

    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'field-input';
    colorInput.value = value && value.match(/^#[0-9a-fA-F]{6}$/) ? value : '#6366f1';

    var textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'field-input';
    textInput.setAttribute('data-key', key);
    textInput.value = value || '';
    textInput.placeholder = field.placeholder || '#000000';

    colorInput.addEventListener('input', function() {
      textInput.value = colorInput.value;
      onChange(colorInput.value);
    });
    textInput.addEventListener('input', function() {
      if (textInput.value.match(/^#[0-9a-fA-F]{6}$/)) {
        colorInput.value = textInput.value;
      }
      onChange(textInput.value);
    });

    wrap.appendChild(colorInput);
    wrap.appendChild(textInput);
    return wrap;
  }

  function createBooleanField(key, value, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'toggle-wrap';

    var toggle = document.createElement('label');
    toggle.className = 'toggle-switch';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('data-key', key);
    input.checked = value === true;
    input.addEventListener('change', function() { onChange(input.checked); });

    var track = document.createElement('span');
    track.className = 'toggle-track';
    var thumb = document.createElement('span');
    thumb.className = 'toggle-thumb';

    toggle.appendChild(input);
    toggle.appendChild(track);
    toggle.appendChild(thumb);

    var label = document.createElement('span');
    label.className = 'toggle-label';
    label.textContent = value ? 'On' : 'Off';
    input.addEventListener('change', function() {
      label.textContent = input.checked ? 'On' : 'Off';
    });

    wrap.appendChild(toggle);
    wrap.appendChild(label);
    return wrap;
  }

  function createEnumField(key, options, value, placeholder, onChange) {
    var select = document.createElement('select');
    select.className = 'field-input';
    select.setAttribute('data-key', key);

    options.forEach(function(opt) {
      var option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === value) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', function() { onChange(select.value); });
    return select;
  }

  function createArrayField(key, field, items, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'array-field';
    wrap.setAttribute('data-array-key', key);

    var itemSchema = field.items || {};
    var isObjectItems = itemSchema.type === 'object' && itemSchema.properties;
    var isColorArray = key.toLowerCase().indexOf('color') >= 0;

    function renderItems() {
      // Clear existing items (keep add button)
      var existing = wrap.querySelectorAll('.array-item');
      existing.forEach(function(el) { el.remove(); });

      var addBtn = wrap.querySelector('.array-add-btn');

      items.forEach(function(item, idx) {
        var itemEl = document.createElement('div');
        itemEl.className = 'array-item';

        var fieldsWrap = document.createElement('div');
        fieldsWrap.className = 'array-item-fields';

        if (isObjectItems) {
          // Object items: render sub-fields
          for (var prop in itemSchema.properties) {
            var propField = itemSchema.properties[prop];
            var row = document.createElement('div');
            row.className = 'array-item-row';

            var lbl = document.createElement('label');
            lbl.textContent = propField.label || prop;
            row.appendChild(lbl);

            var propType = propField.type || 'string';
            var inp;

            if (propField.enum) {
              inp = document.createElement('select');
              propField.enum.forEach(function(opt) {
                var o = document.createElement('option');
                o.value = opt; o.textContent = opt;
                if (item[prop] === opt) o.selected = true;
                inp.appendChild(o);
              });
            } else if (propType === 'number') {
              inp = document.createElement('input');
              inp.type = 'number';
              inp.value = item[prop] !== undefined ? item[prop] : '';
            } else if (prop.toLowerCase().indexOf('color') >= 0) {
              inp = document.createElement('input');
              inp.type = 'color';
              inp.value = item[prop] && item[prop].match && item[prop].match(/^#[0-9a-fA-F]{6}$/) ? item[prop] : '#6366f1';
              inp.style.width = '60px';
            } else {
              inp = document.createElement('input');
              inp.type = 'text';
              inp.value = item[prop] !== undefined ? String(item[prop]) : '';
              if (propField.placeholder) inp.placeholder = propField.placeholder;
            }

            inp.setAttribute('data-array-idx', idx);
            inp.setAttribute('data-prop', prop);
            inp.addEventListener('input', function() {
              var i = parseInt(this.getAttribute('data-array-idx'));
              var p = this.getAttribute('data-prop');
              var pf = itemSchema.properties[p];
              if (pf && pf.type === 'number') {
                items[i][p] = parseFloat(this.value) || 0;
              } else {
                items[i][p] = this.value;
              }
              onChange();
            });
            inp.addEventListener('change', function() {
              var i = parseInt(this.getAttribute('data-array-idx'));
              var p = this.getAttribute('data-prop');
              var pf = itemSchema.properties[p];
              if (pf && pf.type === 'number') {
                items[i][p] = parseFloat(this.value) || 0;
              } else {
                items[i][p] = this.value;
              }
              onChange();
            });

            row.appendChild(inp);
            fieldsWrap.appendChild(row);
          }
        } else {
          // Simple items (string/number)
          var simpleInput;
          if (isColorArray) {
            simpleInput = document.createElement('input');
            simpleInput.type = 'color';
            simpleInput.value = item && item.match && item.match(/^#[0-9a-fA-F]{6}$/) ? item : '#6366f1';
            simpleInput.style.width = '100%';
          } else {
            simpleInput = document.createElement('input');
            simpleInput.type = itemSchema.type === 'number' ? 'number' : 'text';
            simpleInput.value = item !== undefined ? String(item) : '';
          }
          simpleInput.setAttribute('data-array-idx', idx);
          simpleInput.addEventListener('input', function() {
            var i = parseInt(this.getAttribute('data-array-idx'));
            if (itemSchema.type === 'number') {
              items[i] = parseFloat(this.value) || 0;
            } else {
              items[i] = this.value;
            }
            onChange();
          });
          simpleInput.addEventListener('change', function() {
            var i = parseInt(this.getAttribute('data-array-idx'));
            if (itemSchema.type === 'number') {
              items[i] = parseFloat(this.value) || 0;
            } else {
              items[i] = this.value;
            }
            onChange();
          });
          fieldsWrap.appendChild(simpleInput);
        }

        var removeBtn = document.createElement('button');
        removeBtn.className = 'array-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.setAttribute('data-array-idx', idx);
        removeBtn.addEventListener('click', function() {
          var i = parseInt(this.getAttribute('data-array-idx'));
          items.splice(i, 1);
          renderItems();
          onChange();
        });

        itemEl.appendChild(fieldsWrap);
        itemEl.appendChild(removeBtn);
        if (addBtn) {
          wrap.insertBefore(itemEl, addBtn);
        } else {
          wrap.appendChild(itemEl);
        }
      });
    }

    // Add button
    var addBtn = document.createElement('button');
    addBtn.className = 'array-add-btn';
    addBtn.textContent = '+ Add ' + (key.replace(/s$/, '') || 'item');
    addBtn.addEventListener('click', function() {
      if (isObjectItems) {
        var newItem = {};
        for (var p in itemSchema.properties) {
          var pf = itemSchema.properties[p];
          if (pf.type === 'number') newItem[p] = 0;
          else if (pf.type === 'boolean') newItem[p] = false;
          else newItem[p] = pf.placeholder || '';
        }
        items.push(newItem);
      } else if (isColorArray) {
        items.push('#6366f1');
      } else if (itemSchema.type === 'number') {
        items.push(0);
      } else {
        items.push('');
      }
      renderItems();
      onChange();
    });
    wrap.appendChild(addBtn);

    renderItems();
    return wrap;
  }

  function createObjectField(key, properties, value, onChange) {
    var wrap = document.createElement('div');
    wrap.style.paddingLeft = '12px';
    wrap.style.borderLeft = '2px solid var(--border-secondary)';
    wrap.style.marginTop = '4px';

    for (var prop in properties) {
      var field = properties[prop];
      var fieldEl = createFieldEditor(prop, field, value[prop], onChange);
      wrap.appendChild(fieldEl);
    }

    return wrap;
  }

  // ── Script Builder ──
  function createScriptBuilder(scriptItems, cursorTargets, availableActions, defaultTargets, onChange) {
    var section = document.createElement('div');
    section.className = 'script-section';
    section.setAttribute('data-field-key', '__script_section');

    var header = document.createElement('div');
    header.className = 'script-header';

    var title = document.createElement('h4');
    title.textContent = 'Script';
    header.appendChild(title);

    var addBtn = document.createElement('button');
    addBtn.className = 'array-add-btn';
    addBtn.style.width = 'auto';
    addBtn.style.padding = '4px 10px';
    addBtn.textContent = '+ Action';
    header.appendChild(addBtn);

    section.appendChild(header);

    // The verbs are documented in the schema (script_actions[].description)
    // -- surface them, or nobody knows what "count-up" or "highlight" does.
    var described = availableActions.filter(function(a) { return a && a.description; });
    if (described.length) {
      var help = document.createElement('details');
      help.className = 'script-help';
      var sum = document.createElement('summary');
      sum.textContent = 'What can this component do? (' + described.length + ' actions)';
      help.appendChild(sum);
      described.forEach(function(a) {
        var row = document.createElement('div');
        row.className = 'script-help-row';
        var b = document.createElement('b');
        b.textContent = a.action;
        row.appendChild(b);
        row.appendChild(document.createTextNode(' — ' + a.description));
        help.appendChild(row);
      });
      section.appendChild(help);
    }

    // Action name list from available actions
    var actionNames = availableActions.map(function(a) { return a.action; });
    // Add standard actions
    var standardActions = ['move-cursor', 'click', 'double-click', 'type', 'wait', 'hide-cursor', 'show-cursor', 'zoom-to', 'zoom-out', 'pan', 'rotate-3d', 'camera-reset', 'hover', 'drag', 'scroll', 'show-element', 'hide-element', 'highlight', 'toggle', 'update-text', 'press', 'parallel'];
    standardActions.forEach(function(a) {
      if (actionNames.indexOf(a) < 0) actionNames.push(a);
    });

    // Action param definitions
    var actionParams = {
      'move-cursor': ['target', 'at', 'duration'],
      'click': ['target', 'at'],
      'double-click': ['target', 'at'],
      'type': ['target', 'text', 'at', 'speed'],
      'wait': ['at', 'duration'],
      'hide-cursor': ['at'],
      'show-cursor': ['at'],
      'zoom-to': ['target', 'at', 'duration', 'scale'],
      'zoom-out': ['at', 'duration'],
      'pan': ['x', 'y', 'at', 'duration'],
      'rotate-3d': ['rotateX', 'rotateY', 'at', 'duration'],
      'camera-reset': ['at', 'duration'],
      'press': ['key', 'at'],
      'hover': ['target', 'at', 'duration'],
      'drag': ['target', 'end_target', 'at', 'duration'],
      'scroll': ['target', 'scrollY', 'at', 'duration'],
      'show-element': ['target', 'at', 'duration'],
      'hide-element': ['target', 'at', 'duration'],
      'highlight': ['target', 'at', 'color'],
      'toggle': ['target', 'at'],
      'update-text': ['target', 'text', 'at'],
      'show-response': ['text', 'at', 'duration'],
      'show-typing': ['at', 'duration'],
      'parallel': ['at'],
    };

    var paramTypes = {
      'target': 'select-target',
      'end_target': 'select-target',
      'at': 'number',
      'duration': 'number',
      'speed': 'number',
      'text': 'string',
      'key': 'string',
      'scale': 'number',
      'x': 'number',
      'y': 'number',
      'rotateX': 'number',
      'rotateY': 'number',
      'scrollY': 'number',
      'color': 'string',
      'from': 'select-target',
      'to': 'select-target',
      'direction': 'string',
      'amount': 'number'
    };

    // Build target options from cursor_targets
    var targetKeys = Object.keys(cursorTargets || {});
    if (targetKeys.length === 0) targetKeys = Object.keys(defaultTargets || {});

    var itemsContainer = document.createElement('div');
    itemsContainer.className = 'script-items';

    function renderScriptItems() {
      itemsContainer.innerHTML = '';

      scriptItems.forEach(function(item, idx) {
        var itemEl = document.createElement('div');
        itemEl.className = 'script-item';

        var headerRow = document.createElement('div');
        headerRow.className = 'script-item-header';

        var indexBadge = document.createElement('span');
        indexBadge.className = 'script-index';
        indexBadge.textContent = (idx + 1);
        headerRow.appendChild(indexBadge);

        // Action select
        var actionSelect = document.createElement('select');
        actionNames.forEach(function(a) {
          var opt = document.createElement('option');
          opt.value = a; opt.textContent = a;
          if (a === item.action) opt.selected = true;
          actionSelect.appendChild(opt);
        });
        actionSelect.addEventListener('change', function() {
          item.action = actionSelect.value;
          // Reset params but keep 'at'
          var at = item.at;
          var keys = Object.keys(item);
          keys.forEach(function(k) { if (k !== 'action' && k !== 'at') delete item[k]; });
          if (at !== undefined) item.at = at;
          renderScriptItems();
          onChange();
        });
        headerRow.appendChild(actionSelect);

        // Remove button
        var removeBtn = document.createElement('button');
        removeBtn.className = 'array-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', function() {
          scriptItems.splice(idx, 1);
          renderScriptItems();
          onChange();
        });
        headerRow.appendChild(removeBtn);

        itemEl.appendChild(headerRow);

        // Params
        var params = actionParams[item.action] || ['at', 'duration'];
        if (params.length > 0) {
          var paramsGrid = document.createElement('div');
          paramsGrid.className = 'script-item-params';

          params.forEach(function(param) {
            var paramDiv = document.createElement('div');
            paramDiv.className = 'script-param';

            var lbl = document.createElement('label');
            lbl.textContent = param;
            paramDiv.appendChild(lbl);

            var pType = paramTypes[param] || 'string';
            var inp;

            if (pType === 'select-target' && targetKeys.length > 0) {
              inp = document.createElement('select');
              var emptyOpt = document.createElement('option');
              emptyOpt.value = ''; emptyOpt.textContent = '(select)';
              inp.appendChild(emptyOpt);
              targetKeys.forEach(function(t) {
                var opt = document.createElement('option');
                opt.value = t; opt.textContent = t;
                if (item[param] === t) opt.selected = true;
                inp.appendChild(opt);
              });
            } else if (pType === 'number') {
              inp = document.createElement('input');
              inp.type = 'number';
              inp.step = '0.1';
              inp.value = item[param] !== undefined ? item[param] : '';
              inp.placeholder = param === 'at' ? 'sec' : param === 'speed' ? '25' : '';
            } else {
              inp = document.createElement('input');
              inp.type = 'text';
              inp.value = item[param] !== undefined ? String(item[param]) : '';
            }

            inp.setAttribute('data-script-idx', idx);
            inp.setAttribute('data-param', param);

            var updateFn = function() {
              var i = parseInt(this.getAttribute('data-script-idx'));
              var p = this.getAttribute('data-param');
              var pt = paramTypes[p] || 'string';
              if (pt === 'number') {
                var v = parseFloat(this.value);
                if (!isNaN(v)) scriptItems[i][p] = v;
                else delete scriptItems[i][p];
              } else {
                if (this.value) scriptItems[i][p] = this.value;
                else delete scriptItems[i][p];
              }
              onChange();
            };
            inp.addEventListener('input', updateFn);
            inp.addEventListener('change', updateFn);

            paramDiv.appendChild(inp);
            paramsGrid.appendChild(paramDiv);
          });

          itemEl.appendChild(paramsGrid);
        }

        itemsContainer.appendChild(itemEl);
      });

      if (scriptItems.length === 0) {
        var emptyMsg = document.createElement('div');
        emptyMsg.className = 'no-schema-msg';
        emptyMsg.style.padding = '8px';
        emptyMsg.textContent = 'No script actions. Click + Action to add cursor movements, typing, clicks.';
        itemsContainer.appendChild(emptyMsg);
      }
    }

    addBtn.addEventListener('click', function() {
      var lastAt = scriptItems.length > 0 ? (scriptItems[scriptItems.length - 1].at || 0) + 1 : 0.5;
      scriptItems.push({ action: actionNames[0] || 'move-cursor', at: Math.round(lastAt * 10) / 10 });
      renderScriptItems();
      onChange();
    });

    section.appendChild(itemsContainer);
    renderScriptItems();

    // Cursor targets editor
    if (targetKeys.length > 0 || Object.keys(defaultTargets).length > 0) {
      var targetsSection = document.createElement('div');
      targetsSection.style.marginTop = '12px';

      var targetsLabel = document.createElement('div');
      targetsLabel.className = 'field-label';
      targetsLabel.style.marginBottom = '6px';
      var targetsText = document.createElement('span');
      targetsText.textContent = 'Cursor Targets';
      targetsLabel.appendChild(targetsText);
      var targetsTypeSpan = document.createElement('span');
      targetsTypeSpan.className = 'field-type';
      targetsTypeSpan.textContent = 'x%, y%';
      targetsLabel.appendChild(targetsTypeSpan);
      targetsSection.appendChild(targetsLabel);

      var allTargets = Object.assign({}, defaultTargets, cursorTargets);
      for (var tKey in allTargets) {
        var tRow = document.createElement('div');
        tRow.className = 'array-item-row';
        tRow.style.marginBottom = '4px';

        var tLabel = document.createElement('label');
        tLabel.textContent = tKey;
        tLabel.style.minWidth = '80px';
        tRow.appendChild(tLabel);

        var xInput = document.createElement('input');
        xInput.type = 'text';
        xInput.value = allTargets[tKey].x || '50%';
        xInput.placeholder = 'x%';
        xInput.style.width = '60px';
        xInput.setAttribute('data-target-key', tKey);
        xInput.setAttribute('data-coord', 'x');
        xInput.addEventListener('input', function() {
          var k = this.getAttribute('data-target-key');
          if (!cursorTargets[k]) cursorTargets[k] = { x: '50%', y: '50%' };
          cursorTargets[k].x = this.value;
          onChange();
        });
        tRow.appendChild(xInput);

        var yInput = document.createElement('input');
        yInput.type = 'text';
        yInput.value = allTargets[tKey].y || '50%';
        yInput.placeholder = 'y%';
        yInput.style.width = '60px';
        yInput.setAttribute('data-target-key', tKey);
        yInput.setAttribute('data-coord', 'y');
        yInput.addEventListener('input', function() {
          var k = this.getAttribute('data-target-key');
          if (!cursorTargets[k]) cursorTargets[k] = { x: '50%', y: '50%' };
          cursorTargets[k].y = this.value;
          onChange();
        });
        tRow.appendChild(yInput);

        targetsSection.appendChild(tRow);
      }

      section.appendChild(targetsSection);
    }

    return section;
  }

  // ── Sync Form -> JSON ──
  function syncFormToJson() {
    if (!state.formData) return;
    els.dataEditor.value = JSON.stringify(state.formData, null, 2);
    schedulePreview();
  }

  function collectFieldValue(formEl, key, field) {
    var type = field.type || 'string';

    if (type === 'boolean') {
      var checkbox = formEl.querySelector('[data-key="' + key + '"]');
      return checkbox ? checkbox.checked : false;
    }

    if (type === 'array') {
      // Array data is maintained in-place by the array builder
      try {
        var currentData = JSON.parse(els.dataEditor.value || '{}');
        return currentData[key] || [];
      } catch(e) { return []; }
    }

    if (type === 'object' && field.properties) {
      var obj = {};
      for (var prop in field.properties) {
        var group = formEl.querySelector('[data-field-key="' + prop + '"]');
        if (group) {
          obj[prop] = collectFieldValue(group.parentElement, prop, field.properties[prop]);
        }
      }
      return obj;
    }

    // String, number, enum
    var input = formEl.querySelector('[data-key="' + key + '"]');
    if (!input) return field.default || '';

    if (type === 'number') {
      var v = parseFloat(input.value);
      return isNaN(v) ? 0 : v;
    }

    return input.value;
  }



  // ── Extract Custom Script Actions from Source ──
  function extractCustomActionsFromSource(source) {
    var actions = [];
    // Match runScript handler objects: runScript(tl, el, ..., { 'action-name': function... })
    // Pattern: 'action-name' or "action-name" as keys in handler objects
    var handlerPattern = /['"]([a-z][a-z0-9-]+)['"]\\s*:\\s*function/g;
    var match;
    // Look for the handlers object passed to runScript
    var runScriptMatch = source.match(/runScript\\s*\\([^)]*,\\s*\\{([^}]+)\\}/);
    if (runScriptMatch) {
      var handlersBlock = runScriptMatch[1];
      while ((match = handlerPattern.exec(handlersBlock)) !== null) {
        actions.push(match[1]);
      }
    }
    // Also look for handlers defined separately: var handlers = { ... }
    var handlersVarMatch = source.match(/(?:var|const|let)\\s+handlers\\s*=\\s*\\{([^}]+)\\}/);
    if (handlersVarMatch) {
      handlerPattern.lastIndex = 0;
      var block = handlersVarMatch[1];
      while ((match = handlerPattern.exec(block)) !== null) {
        if (actions.indexOf(match[1]) < 0) actions.push(match[1]);
      }
    }
    return actions;
  }

  // ── Init ──
  loadCatalog();
  whoAmI();
})();
</script>
</body>
</html>`;
}
