/**
 * Component Playground SPA - LLM-driven component iteration tool.
 *
 * Workflow: prompt -> generate -> preview -> iterate -> save
 * Shows tenant custom components only, not built-in library.
 * Same dark theme as Preview SPA.
 */

export function getPlaygroundHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Component Playground</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
/* ── Reset & Base ── */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 14px;
  line-height: 1.5;
}
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }

/* ── Layout ── */
.app { display: flex; flex-direction: column; height: 100vh; }
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  background: #1e293b; border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.header h1 { font-size: 16px; font-weight: 600; color: #f8fafc; }
.header h1 span { color: #A78BFA; }
.header-right { display: flex; align-items: center; gap: 12px; }
.tenant-badge {
  font-size: 13px; color: #94a3b8;
  display: flex; align-items: center; gap: 6px;
}
.tenant-badge input {
  background: #0f172a; border: 1px solid #334155; color: #e2e8f0;
  padding: 4px 8px; border-radius: 4px; font-size: 13px; font-family: inherit;
  width: 120px;
}
.main { display: flex; flex: 1; overflow: hidden; }

/* ── Sidebar ── */
.sidebar {
  width: 240px; min-width: 240px;
  background: #1e293b; border-right: 1px solid #334155;
  display: flex; flex-direction: column; overflow: hidden;
}
.sidebar-header {
  padding: 12px 16px;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: #64748b;
  border-bottom: 1px solid #334155;
}
.sidebar-list { flex: 1; overflow-y: auto; padding: 8px 0; }
.sidebar-item {
  padding: 8px 16px; cursor: pointer;
  font-size: 13px; color: #94a3b8;
  transition: all 0.1s;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-left: 3px solid transparent;
}
.sidebar-item:hover { color: #e2e8f0; background: rgba(167, 139, 250, 0.06); }
.sidebar-item.active {
  color: #A78BFA; background: rgba(167, 139, 250, 0.1);
  border-left-color: #A78BFA; font-weight: 500;
}
.sidebar-empty {
  padding: 20px 16px; color: #475569; font-size: 13px;
  text-align: center;
}

/* ── Content Area ── */
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

/* ── Prompt Area ── */
.prompt-area {
  padding: 16px 20px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.prompt-row {
  display: flex; gap: 10px; align-items: flex-start;
}
.prompt-input {
  flex: 1; padding: 10px 14px;
  background: #0f172a; border: 1px solid #334155; border-radius: 8px;
  color: #e2e8f0; font-size: 14px; font-family: inherit;
  resize: none; min-height: 44px; max-height: 120px;
  outline: none; transition: border-color 0.15s;
}
.prompt-input:focus { border-color: #A78BFA; }
.prompt-input::placeholder { color: #475569; }
.btn {
  padding: 10px 20px; border-radius: 8px;
  font-size: 14px; font-weight: 500; cursor: pointer;
  border: 1px solid transparent; transition: all 0.15s;
  font-family: inherit; white-space: nowrap;
}
.btn-primary { background: #A78BFA; color: #0f172a; border-color: #A78BFA; }
.btn-primary:hover { background: #c4b5fd; border-color: #c4b5fd; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: transparent; color: #94a3b8; border-color: #334155; }
.btn-secondary:hover { color: #e2e8f0; border-color: #64748b; }
.btn-sm { padding: 6px 14px; font-size: 13px; }
.btn-success { background: #22c55e; color: #fff; border-color: #22c55e; }
.btn-success:hover { background: #16a34a; }

/* ── Preview Area ── */
.preview-area {
  flex: 1; position: relative;
  background: #0a0f1a; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.preview-wrapper { position: relative; }
.preview-area iframe {
  border: none; background: #000;
  box-shadow: 0 0 40px rgba(0,0,0,0.5);
  transform-origin: top left;
}
.preview-empty {
  display: flex; flex-direction: column; align-items: center;
  gap: 12px; color: #475569;
}
.preview-empty svg { width: 48px; height: 48px; opacity: 0.3; }
.preview-empty p { font-size: 14px; }

/* ── Generating overlay ── */
.generating-overlay {
  position: absolute; inset: 0;
  background: rgba(15, 23, 42, 0.85);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px; z-index: 10;
}
.generating-overlay.hidden { display: none; }
.spinner {
  width: 40px; height: 40px;
  border: 3px solid #334155;
  border-top-color: #A78BFA;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.generating-text { color: #94a3b8; font-size: 14px; }

/* ── Timeline ── */
.timeline-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  background: #1e293b; border-top: 1px solid #334155; border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.timeline-bar button {
  background: none; border: none; color: #94a3b8; cursor: pointer;
  font-size: 16px; padding: 4px; display: flex; align-items: center;
}
.timeline-bar button:hover { color: #e2e8f0; }
.scrubber { flex: 1; }
.scrubber input[type="range"] {
  width: 100%; height: 4px;
  -webkit-appearance: none; appearance: none;
  background: #334155; border-radius: 2px; outline: none;
}
.scrubber input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px;
  background: #A78BFA; border-radius: 50%; cursor: pointer;
}
.time-display {
  font-size: 12px; color: #64748b;
  font-variant-numeric: tabular-nums; min-width: 80px; text-align: right;
}

/* ── Bottom Panels ── */
.bottom-panels {
  display: flex; height: 260px; min-height: 200px;
  border-top: 1px solid #334155; flex-shrink: 0;
}
.panel {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
}
.panel + .panel { border-left: 1px solid #334155; }
.panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px;
  background: #1e293b; border-bottom: 1px solid #334155;
  font-size: 12px; font-weight: 600; color: #94a3b8;
  text-transform: uppercase; letter-spacing: 0.06em;
  flex-shrink: 0;
}
.panel-body {
  flex: 1; overflow-y: auto; padding: 14px;
  background: #0f172a;
}

/* ── Data/Prop Editor ── */
.field-group { margin-bottom: 12px; }
.field-label {
  display: block; font-size: 12px; font-weight: 500; color: #94a3b8;
  margin-bottom: 4px;
}
.field-input {
  width: 100%; padding: 7px 10px;
  background: #1e293b; border: 1px solid #334155; border-radius: 5px;
  color: #e2e8f0; font-size: 13px; font-family: inherit; outline: none;
  transition: border-color 0.15s;
}
.field-input:focus { border-color: #A78BFA; }
textarea.field-input {
  resize: vertical; min-height: 60px;
  font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 12px;
}

/* ── Source / Revise Panel ── */
.source-view {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-all;
  color: #94a3b8; tab-size: 2;
}
.revise-area {
  display: flex; gap: 8px; margin-bottom: 12px;
}
.revise-input {
  flex: 1; padding: 7px 10px;
  background: #1e293b; border: 1px solid #334155; border-radius: 5px;
  color: #e2e8f0; font-size: 13px; font-family: inherit; outline: none;
}
.revise-input:focus { border-color: #A78BFA; }
.revise-input::placeholder { color: #475569; }
.source-actions {
  display: flex; gap: 8px; margin-top: 12px;
  padding-top: 12px; border-top: 1px solid #1e293b;
}
</style>
</head>
<body>
<div class="app">
  <!-- Header -->
  <div class="header">
    <h1><span>&#9654;</span> Component Playground</h1>
    <div class="header-right">
      <div class="tenant-badge">
        <span>Tenant:</span>
        <input type="text" id="tenant-input" placeholder="tenant-id">
        <button class="btn btn-secondary btn-sm" id="tenant-load-btn">Load</button>
      </div>
    </div>
  </div>

  <div class="main">
    <!-- Sidebar: My Components -->
    <div class="sidebar">
      <div class="sidebar-header">My Components</div>
      <div class="sidebar-list" id="component-list">
        <div class="sidebar-empty" id="sidebar-empty">Enter a tenant ID to see your components</div>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <!-- Prompt -->
      <div class="prompt-area">
        <div class="prompt-row">
          <textarea class="prompt-input" id="prompt-input" rows="1" placeholder="Describe the component you want to create..."></textarea>
          <button class="btn btn-primary" id="generate-btn">Generate</button>
        </div>
      </div>

      <!-- Preview -->
      <div class="preview-area" id="preview-area">
        <div class="preview-empty" id="preview-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <p>Describe a component above to generate it</p>
        </div>
        <div class="preview-wrapper" id="preview-wrapper" style="display:none;">
          <iframe id="preview-iframe" sandbox="allow-scripts"></iframe>
        </div>
        <div class="generating-overlay hidden" id="generating-overlay">
          <div class="spinner"></div>
          <div class="generating-text" id="generating-text">Generating component...</div>
        </div>
      </div>

      <!-- Timeline -->
      <div class="timeline-bar">
        <button id="btn-play" title="Play/Pause">&#9654;</button>
        <div class="scrubber">
          <input type="range" id="scrubber" min="0" max="1000" value="0" step="1">
        </div>
        <div class="time-display" id="time-display">0.00s / 0.00s</div>
      </div>

      <!-- Bottom Panels -->
      <div class="bottom-panels">
        <!-- Prop Editor -->
        <div class="panel">
          <div class="panel-header">Prop Editor</div>
          <div class="panel-body" id="prop-editor">
            <div class="sidebar-empty">Generate a component to edit props</div>
          </div>
        </div>

        <!-- Source / Revise -->
        <div class="panel">
          <div class="panel-header">
            <span>Source / Revise</span>
            <button class="btn btn-secondary btn-sm" id="btn-copy" style="padding:3px 10px;font-size:11px">Copy</button>
          </div>
          <div class="panel-body" id="source-panel">
            <div class="revise-area">
              <input class="revise-input" id="revise-input" placeholder="Make the title bigger, add a gradient...">
              <button class="btn btn-secondary btn-sm" id="revise-btn">Revise</button>
            </div>
            <div class="source-view" id="source-view"></div>
            <div class="source-actions">
              <button class="btn btn-success btn-sm" id="save-btn">Save to Library</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
(function() {
  // ── State ──
  var tenantId = '';
  var currentSource = '';
  var currentData = {};
  var tenantComponents = [];
  var activeComponentType = null;
  var playing = false;
  var animFrame = null;
  var ws = null;
  var wsReconnectTimer = null;

  // ── DOM refs ──
  var $tenantInput = document.getElementById('tenant-input');
  var $tenantLoadBtn = document.getElementById('tenant-load-btn');
  var $componentList = document.getElementById('component-list');
  var $sidebarEmpty = document.getElementById('sidebar-empty');
  var $promptInput = document.getElementById('prompt-input');
  var $generateBtn = document.getElementById('generate-btn');
  var $previewArea = document.getElementById('preview-area');
  var $previewEmpty = document.getElementById('preview-empty');
  var $previewWrapper = document.getElementById('preview-wrapper');
  var $preview = document.getElementById('preview-iframe');
  var $generatingOverlay = document.getElementById('generating-overlay');
  var $generatingText = document.getElementById('generating-text');
  var $btnPlay = document.getElementById('btn-play');
  var $scrubber = document.getElementById('scrubber');
  var $timeDisplay = document.getElementById('time-display');
  var $propEditor = document.getElementById('prop-editor');
  var $sourceView = document.getElementById('source-view');
  var $btnCopy = document.getElementById('btn-copy');
  var $reviseInput = document.getElementById('revise-input');
  var $reviseBtn = document.getElementById('revise-btn');
  var $saveBtn = document.getElementById('save-btn');

  // ── WebSocket ──
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsConn = new WebSocket(proto + '//' + location.host + '/ws');

    wsConn.onopen = function() {
      if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
    };

    wsConn.onmessage = function(e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch(err) { return; }

      if (msg.type === 'scene-html') {
        var currentTime = 0;
        try {
          if ($preview.contentWindow && $preview.contentWindow.__MP_TIMELINE) {
            currentTime = $preview.contentWindow.__MP_TIMELINE.time();
          }
        } catch(err) {}

        showPreview();

        try {
          $preview.contentDocument.open();
          $preview.contentDocument.write(msg.html);
          $preview.contentDocument.close();
        } catch(err) {
          $preview.srcdoc = msg.html;
          return;
        }

        var checkReady = setInterval(function() {
          try {
            if ($preview.contentWindow && $preview.contentWindow.__MP_READY) {
              clearInterval(checkReady);
              $preview.contentWindow.__MP_TIMELINE.time(currentTime);
              $preview.contentWindow.__MP_TIMELINE.pause();
              var dur = $preview.contentWindow.__MP_TIMELINE.duration();
              $scrubber.value = dur > 0 ? Math.round((currentTime / dur) * 1000) : 0;
              updateTimeDisplay(currentTime, dur);
            }
          } catch(err) { clearInterval(checkReady); }
        }, 50);
        setTimeout(function() { clearInterval(checkReady); }, 5000);
      }
    };

    wsConn.onclose = function() {
      ws = null;
      wsReconnectTimer = setTimeout(connectWebSocket, 2000);
    };
    wsConn.onerror = function() { wsConn.close(); };
    ws = wsConn;
  }

  connectWebSocket();

  // ── Helpers ──
  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function showPreview() {
    $previewEmpty.style.display = 'none';
    $previewWrapper.style.display = 'block';
    fitPreview();
  }

  function fitPreview() {
    var area = $previewArea.getBoundingClientRect();
    var sceneW = 1920, sceneH = 1080;
    var pad = 32;
    var availW = area.width - pad * 2;
    var availH = area.height - pad * 2;
    var scale = Math.min(availW / sceneW, availH / sceneH, 1);

    $preview.style.width = sceneW + 'px';
    $preview.style.height = sceneH + 'px';
    $preview.style.transform = 'scale(' + scale + ')';
    $preview.style.transformOrigin = 'top left';

    var scaledW = sceneW * scale;
    var scaledH = sceneH * scale;
    $previewWrapper.style.width = scaledW + 'px';
    $previewWrapper.style.height = scaledH + 'px';
  }

  window.addEventListener('resize', fitPreview);

  // ── Tenant ──
  function setTenant(id) {
    tenantId = id.trim();
    if (!tenantId) return;
    try { localStorage.setItem('pg-tenant', tenantId); } catch(e) {}
    loadTenantComponents();
  }

  $tenantLoadBtn.addEventListener('click', function() {
    setTenant($tenantInput.value);
  });
  $tenantInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') setTenant($tenantInput.value);
  });

  // ── Load tenant custom components ──
  function loadTenantComponents() {
    if (!tenantId) return;
    fetch('/playground/api/tenant-components/' + tenantId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        tenantComponents = data;
        renderComponentList();
      })
      .catch(function() {
        tenantComponents = [];
        renderComponentList();
      });
  }

  function renderComponentList() {
    if (!tenantComponents.length) {
      $componentList.innerHTML = '<div class="sidebar-empty">No custom components yet. Generate one!</div>';
      return;
    }
    var html = '';
    tenantComponents.forEach(function(c) {
      var active = activeComponentType === c.type;
      var label = c.label || c.type;
      html += '<div class="sidebar-item' + (active ? ' active' : '') + '" data-type="' + escHtml(c.type) + '">' + escHtml(label) + '</div>';
    });
    $componentList.innerHTML = html;
  }

  $componentList.addEventListener('click', function(e) {
    var item = e.target.closest('.sidebar-item');
    if (!item) return;
    var type = item.dataset.type;
    loadSavedComponent(type);
  });

  function loadSavedComponent(type) {
    activeComponentType = type;
    renderComponentList();

    // Fetch the component source
    fetch('/playground/api/tenant-components/' + tenantId + '/' + type + '/source')
      .then(function(r) { return r.text(); })
      .then(function(source) {
        currentSource = source;
        currentData = {};
        renderSourceView(source);
        renderPropEditor({});
        refreshPreview();
      })
      .catch(function(err) {
        console.error('Failed to load component:', err);
      });
  }

  // ── Generate ──
  $generateBtn.addEventListener('click', function() {
    var prompt = $promptInput.value.trim();
    if (!prompt || !tenantId) return;
    generateComponent(prompt);
  });

  $promptInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var prompt = $promptInput.value.trim();
      if (prompt && tenantId) generateComponent(prompt);
    }
  });

  function generateComponent(prompt) {
    $generateBtn.disabled = true;
    $generatingOverlay.classList.remove('hidden');
    $generatingText.textContent = 'Generating component...';

    fetch('/playground/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, prompt: prompt })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      $generateBtn.disabled = false;
      $generatingOverlay.classList.add('hidden');

      if (result.error) {
        alert('Generation failed: ' + result.error);
        return;
      }

      currentSource = result.source || '';
      currentData = result.data || {};
      activeComponentType = result.type || null;

      renderSourceView(currentSource);
      renderPropEditor(currentData);
      refreshPreview();
    })
    .catch(function(err) {
      $generateBtn.disabled = false;
      $generatingOverlay.classList.add('hidden');
      alert('Generation failed: ' + err.message);
    });
  }

  // ── Revise ──
  $reviseBtn.addEventListener('click', function() {
    var prompt = $reviseInput.value.trim();
    if (!prompt || !currentSource) return;
    reviseComponent(prompt);
  });

  $reviseInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var prompt = $reviseInput.value.trim();
      if (prompt && currentSource) reviseComponent(prompt);
    }
  });

  function reviseComponent(prompt) {
    $reviseBtn.disabled = true;
    $generatingOverlay.classList.remove('hidden');
    $generatingText.textContent = 'Revising component...';

    fetch('/playground/api/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        prompt: prompt,
        source: currentSource,
        data: currentData
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      $reviseBtn.disabled = false;
      $generatingOverlay.classList.add('hidden');

      if (result.error) {
        alert('Revision failed: ' + result.error);
        return;
      }

      currentSource = result.source || currentSource;
      if (result.data) currentData = result.data;

      renderSourceView(currentSource);
      renderPropEditor(currentData);
      refreshPreview();
      $reviseInput.value = '';
    })
    .catch(function(err) {
      $reviseBtn.disabled = false;
      $generatingOverlay.classList.add('hidden');
      alert('Revision failed: ' + err.message);
    });
  }

  // ── Save to Library ──
  $saveBtn.addEventListener('click', function() {
    if (!currentSource || !tenantId) return;
    var typeName = activeComponentType || prompt('Component name (kebab-case):', 'my-component');
    if (!typeName) return;

    fetch('/playground/api/components/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        type: typeName,
        source: currentSource
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      if (result.ok) {
        activeComponentType = typeName;
        loadTenantComponents();
        alert('Saved to library!');
      } else {
        alert('Save failed: ' + (result.error || 'Unknown error'));
      }
    })
    .catch(function(err) { alert('Save failed: ' + err.message); });
  });

  // ── Source View ──
  function renderSourceView(src) {
    if (!src) {
      $sourceView.textContent = '';
      return;
    }
    var escaped = escHtml(src);
    $sourceView.innerHTML = escaped;
  }

  // ── Prop Editor ──
  function renderPropEditor(data) {
    if (!data || Object.keys(data).length === 0) {
      $propEditor.innerHTML = '<div class="sidebar-empty">No props to edit</div>';
      return;
    }

    var html = '';
    Object.keys(data).forEach(function(key) {
      var val = data[key];
      html += '<div class="field-group">';
      html += '<label class="field-label">' + escHtml(key) + '</label>';

      if (typeof val === 'boolean') {
        html += '<input type="checkbox" class="field-input" data-key="' + escHtml(key) + '" data-type="boolean"' + (val ? ' checked' : '') + ' style="width:auto">';
      } else if (typeof val === 'number') {
        html += '<input type="number" class="field-input" data-key="' + escHtml(key) + '" data-type="number" value="' + val + '">';
      } else if (typeof val === 'object') {
        html += '<textarea class="field-input" data-key="' + escHtml(key) + '" data-type="json">' + escHtml(JSON.stringify(val, null, 2)) + '</textarea>';
      } else {
        html += '<input type="text" class="field-input" data-key="' + escHtml(key) + '" data-type="string" value="' + escHtml(String(val)) + '">';
      }

      html += '</div>';
    });

    html += '<div style="margin-top:12px"><button class="btn btn-primary btn-sm" id="update-props">Update Preview</button></div>';
    $propEditor.innerHTML = html;

    document.getElementById('update-props').addEventListener('click', function() {
      currentData = collectData();
      refreshPreview();
    });
  }

  function collectData() {
    var data = {};
    $propEditor.querySelectorAll('[data-key]').forEach(function(inp) {
      var key = inp.dataset.key;
      if (!key) return;
      var dtype = inp.dataset.type;
      if (dtype === 'boolean') {
        data[key] = inp.checked;
      } else if (dtype === 'number') {
        data[key] = parseFloat(inp.value) || 0;
      } else if (dtype === 'json') {
        try { data[key] = JSON.parse(inp.value || '{}'); } catch(e) { data[key] = inp.value; }
      } else {
        data[key] = inp.value;
      }
    });
    return data;
  }

  // ── Preview ──
  function refreshPreview() {
    if (!currentSource) return;
    stopPlayback();

    // Try WebSocket first
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'preview-component',
        source: currentSource,
        data: currentData
      }));
      return;
    }

    // Fallback: HTTP
    fetch('/playground/api/components/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: currentSource, data: currentData })
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
      showPreview();
      $preview.srcdoc = html;
      $scrubber.value = 0;
      updateTimeDisplay(0, 0);
    })
    .catch(function(err) { console.error('Preview error:', err); });
  }

  // ── Copy source ──
  $btnCopy.addEventListener('click', function() {
    if (!currentSource) return;
    navigator.clipboard.writeText(currentSource).then(function() {
      $btnCopy.textContent = 'Copied!';
      setTimeout(function() { $btnCopy.textContent = 'Copy'; }, 1500);
    });
  });

  // ── Timeline ──
  $btnPlay.addEventListener('click', function() {
    if (playing) { stopPlayback(); return; }
    startPlayback();
  });

  $scrubber.addEventListener('input', function() {
    try {
      var tl = $preview.contentWindow && $preview.contentWindow.__MP_TIMELINE;
      if (!tl) return;
      var dur = tl.duration();
      var t = (parseFloat($scrubber.value) / 1000) * dur;
      tl.pause();
      tl.time(t);
      playing = false;
      $btnPlay.innerHTML = '&#9654;';
      updateTimeDisplay(t, dur);
    } catch(e) {}
  });

  function startPlayback() {
    try {
      var tl = $preview.contentWindow && $preview.contentWindow.__MP_TIMELINE;
      if (!tl) return;
      tl.play(0);
      playing = true;
      $btnPlay.innerHTML = '&#9646;&#9646;';
      tick();
    } catch(e) {}
  }

  function stopPlayback() {
    playing = false;
    $btnPlay.innerHTML = '&#9654;';
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  }

  function tick() {
    if (!playing) return;
    try {
      var tl = $preview.contentWindow && $preview.contentWindow.__MP_TIMELINE;
      if (!tl) { stopPlayback(); return; }
      var dur = tl.duration();
      var t = tl.time();
      $scrubber.value = dur > 0 ? Math.round((t / dur) * 1000) : 0;
      updateTimeDisplay(t, dur);
      if (t >= dur) { stopPlayback(); return; }
    } catch(e) { stopPlayback(); return; }
    animFrame = requestAnimationFrame(tick);
  }

  function updateTimeDisplay(current, total) {
    $timeDisplay.textContent = (current || 0).toFixed(2) + 's / ' + (total || 0).toFixed(2) + 's';
  }

  // ── Auto-tenant: URL param > localStorage ──
  var params = new URLSearchParams(window.location.search);
  var tenantParam = params.get('tenant');
  if (tenantParam) {
    $tenantInput.value = tenantParam;
    setTenant(tenantParam);
  } else {
    try {
      var saved = localStorage.getItem('pg-tenant');
      if (saved) {
        $tenantInput.value = saved;
        setTenant(saved);
      }
    } catch(e) {}
  }
})();
</script>
</body>
</html>`;
}
