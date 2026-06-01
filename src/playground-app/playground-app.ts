/**
 * Component Playground SPA - LLM-driven component iteration tool.
 *
 * Workflow: prompt -> generate -> preview -> iterate -> save
 * Chat-style iteration log, tabbed right panel, component browser.
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
  padding: 10px 20px;
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
.main-area { display: flex; flex: 1; overflow: hidden; }

/* ── Left Panel (Chat Log) ── */
.left-panel {
  width: 320px; min-width: 280px;
  background: #1e293b; border-right: 1px solid #334155;
  display: flex; flex-direction: column; overflow: hidden;
}
.left-panel-header {
  padding: 10px 14px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid #334155;
  gap: 8px;
  flex-shrink: 0;
}
.left-panel-header .new-btn {
  padding: 5px 12px; font-size: 12px; font-weight: 500;
  background: #A78BFA; color: #0f172a; border: none; border-radius: 5px;
  cursor: pointer; white-space: nowrap;
}
.left-panel-header .new-btn:hover { background: #c4b5fd; }
.component-browser-select {
  flex: 1; min-width: 0;
  background: #0f172a; border: 1px solid #334155; color: #e2e8f0;
  padding: 5px 8px; border-radius: 5px; font-size: 12px; font-family: inherit;
  cursor: pointer;
}
.component-browser-select option { background: #1e293b; color: #e2e8f0; }

.chat-log {
  flex: 1; overflow-y: auto; padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
}
.chat-entry {
  padding: 10px 12px; border-radius: 8px;
  cursor: pointer; transition: all 0.12s;
  border: 1px solid transparent;
}
.chat-entry:hover { border-color: #334155; }
.chat-entry.active { border-color: #A78BFA; background: rgba(167, 139, 250, 0.08); }
.chat-prompt {
  font-size: 13px; color: #e2e8f0; margin-bottom: 4px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.chat-meta {
  font-size: 11px; color: #64748b;
  display: flex; align-items: center; gap: 8px;
}
.chat-meta .badge {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  background: rgba(167, 139, 250, 0.15); color: #A78BFA;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
}
.chat-empty {
  padding: 30px 16px; color: #475569; font-size: 13px;
  text-align: center; line-height: 1.7;
}

/* ── Center Column ── */
.center-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

/* ── Prompt Area ── */
.prompt-area {
  padding: 12px 16px;
  background: #1e293b; border-bottom: 1px solid #334155;
  flex-shrink: 0;
}
.prompt-row { display: flex; gap: 10px; align-items: flex-end; }
.prompt-input {
  flex: 1; padding: 10px 14px;
  background: #0f172a; border: 1px solid #334155; border-radius: 8px;
  color: #e2e8f0; font-size: 14px; font-family: inherit;
  resize: none; min-height: 60px; max-height: 160px;
  outline: none; transition: border-color 0.15s;
}
.prompt-input:focus { border-color: #A78BFA; }
.prompt-input::placeholder { color: #475569; }
.prompt-hint {
  font-size: 11px; color: #475569; margin-top: 6px;
}
.prompt-hint kbd {
  background: #334155; padding: 1px 5px; border-radius: 3px;
  font-family: inherit; font-size: 10px; color: #94a3b8;
}
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

/* ── Status indicator (replaces blocking overlay) ── */
.status-indicator {
  display: none;
  align-items: center; gap: 8px;
  padding: 6px 14px;
  background: rgba(167, 139, 250, 0.1);
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
  font-size: 13px; color: #A78BFA;
}
.status-indicator.visible { display: flex; }
.pulse-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #A78BFA;
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.status-elapsed { color: #64748b; font-size: 12px; margin-left: auto; font-variant-numeric: tabular-nums; }

/* ── Preview Area ── */
.preview-area {
  flex: 1; position: relative;
  background: #0a0f1a; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.preview-info {
  position: absolute; top: 8px; left: 12px;
  font-size: 11px; color: #64748b;
  display: flex; align-items: center; gap: 10px;
  z-index: 5;
}
.fullscreen-btn {
  position: absolute; top: 8px; right: 12px;
  background: rgba(30, 41, 59, 0.8); border: 1px solid #334155;
  color: #94a3b8; padding: 4px 8px; border-radius: 4px;
  font-size: 11px; cursor: pointer; z-index: 5;
}
.fullscreen-btn:hover { color: #e2e8f0; border-color: #64748b; }
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

/* ── Timeline ── */
.timeline-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px;
  background: #1e293b; border-top: 1px solid #334155;
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

/* ── Right Panel (Tabbed) ── */
.right-panel {
  width: 340px; min-width: 280px;
  background: #1e293b; border-left: 1px solid #334155;
  display: flex; flex-direction: column; overflow: hidden;
}
.tab-bar {
  display: flex; border-bottom: 1px solid #334155; flex-shrink: 0;
}
.tab-btn {
  flex: 1; padding: 9px 10px;
  font-size: 12px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: #64748b;
  background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; transition: all 0.12s;
  font-family: inherit;
}
.tab-btn:hover { color: #94a3b8; }
.tab-btn.active { color: #A78BFA; border-bottom-color: #A78BFA; }
.tab-content {
  flex: 1; overflow-y: auto; padding: 14px;
  background: #0f172a;
  display: none;
}
.tab-content.active { display: block; }

/* ── Props tab ── */
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

/* ── Source tab (syntax highlighting) ── */
.source-view {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-all;
  color: #94a3b8; tab-size: 2;
}
.source-view .tag { color: #7dd3fc; }
.source-view .attr { color: #fbbf24; }
.source-view .str { color: #86efac; }
.source-view .cmt { color: #475569; font-style: italic; }
.source-actions {
  display: flex; gap: 8px; margin-top: 14px;
  padding-top: 12px; border-top: 1px solid #1e293b;
}

/* ── History tab ── */
.history-list { display: flex; flex-direction: column; gap: 6px; }
.history-item {
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid transparent; transition: all 0.12s;
}
.history-item:hover { border-color: #334155; background: rgba(167, 139, 250, 0.04); }
.history-item.active { border-color: #A78BFA; background: rgba(167, 139, 250, 0.08); }
.history-prompt {
  font-size: 12px; color: #e2e8f0; margin-bottom: 3px;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
  overflow: hidden;
}
.history-meta { font-size: 11px; color: #64748b; }
.history-empty {
  padding: 20px 10px; color: #475569; font-size: 13px; text-align: center;
}

/* ── Status Bar ── */
.status-bar {
  display: flex; align-items: center; gap: 16px;
  padding: 6px 16px;
  background: #1e293b; border-top: 1px solid #334155;
  font-size: 11px; color: #64748b;
  flex-shrink: 0;
}
.status-bar .ws-dot {
  width: 7px; height: 7px; border-radius: 50%;
  display: inline-block;
}
.ws-dot.connected { background: #22c55e; }
.ws-dot.disconnected { background: #ef4444; }

/* ── Utility ── */
.hidden { display: none !important; }
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

  <div class="main-area">
    <!-- Left Panel: Chat Log -->
    <div class="left-panel">
      <div class="left-panel-header">
        <select id="component-browser" class="component-browser-select">
          <option value="">Load component...</option>
        </select>
        <button class="new-btn" id="new-component-btn">+ New</button>
      </div>
      <div class="chat-log" id="chat-log">
        <div class="chat-empty" id="chat-empty">
          Describe a component above to get started.<br>Each prompt and result shows here as a conversation.
        </div>
      </div>
    </div>

    <!-- Center Column -->
    <div class="center-col">
      <!-- Prompt -->
      <div class="prompt-area">
        <div class="prompt-row">
          <textarea class="prompt-input" id="prompt-input" rows="2"
            placeholder="Describe a component... or paste a revision instruction"></textarea>
          <button class="btn btn-primary" id="generate-btn">Generate</button>
        </div>
        <div class="prompt-hint"><kbd>Cmd+Enter</kbd> to send</div>
      </div>

      <!-- Status Indicator (non-blocking) -->
      <div class="status-indicator" id="status-indicator">
        <div class="pulse-dot"></div>
        <span id="status-text">Generating...</span>
        <span class="status-elapsed" id="status-elapsed"></span>
      </div>

      <!-- Preview -->
      <div class="preview-area" id="preview-area">
        <div class="preview-info" id="preview-info" style="display:none">
          <span id="info-type"></span>
          <span id="info-size"></span>
        </div>
        <button class="fullscreen-btn" id="fullscreen-btn" style="display:none">Fullscreen</button>
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
      </div>

      <!-- Timeline -->
      <div class="timeline-bar">
        <button id="btn-play" title="Play/Pause">&#9654;</button>
        <div class="scrubber">
          <input type="range" id="scrubber" min="0" max="1000" value="0" step="1">
        </div>
        <div class="time-display" id="time-display">0.00s / 0.00s</div>
      </div>
    </div>

    <!-- Right Panel (Tabbed) -->
    <div class="right-panel">
      <div class="tab-bar">
        <button class="tab-btn active" data-tab="props">Props</button>
        <button class="tab-btn" data-tab="source">Source</button>
        <button class="tab-btn" data-tab="history">History</button>
      </div>
      <div class="tab-content active" id="tab-props">
        <div class="chat-empty">Generate a component to edit props</div>
      </div>
      <div class="tab-content" id="tab-source">
        <div class="source-actions" style="border-top:none;padding-top:0;margin-top:0;margin-bottom:12px">
          <button class="btn btn-secondary btn-sm" id="btn-copy" style="padding:3px 10px;font-size:11px">Copy</button>
          <button class="btn btn-success btn-sm" id="save-btn" style="padding:3px 10px;font-size:11px">Save to Library</button>
        </div>
        <div class="source-view" id="source-view"></div>
      </div>
      <div class="tab-content" id="tab-history">
        <div class="history-empty" id="history-empty">No versions yet. Generate or revise a component to start tracking history.</div>
        <div class="history-list" id="history-list"></div>
      </div>
    </div>
  </div>

  <!-- Status Bar -->
  <div class="status-bar" id="status-bar">
    <span id="sb-tenant">Tenant: --</span>
    <span id="sb-type">Component: --</span>
    <span id="sb-size">Size: --</span>
    <span style="margin-left:auto;display:flex;align-items:center;gap:4px">
      <span class="ws-dot disconnected" id="ws-dot"></span>
      <span id="ws-label">Disconnected</span>
    </span>
  </div>
</div>

<script>
(function() {
  // ── State ──
  var tenantId = '';
  var currentSource = '';
  var currentData = {};
  var activeComponentType = null;
  var playing = false;
  var animFrame = null;
  var ws = null;
  var wsReconnectTimer = null;
  // Chat log entries: { id, prompt, type, action, source, data, timestamp }
  var chatEntries = [];
  var activeChatId = null;
  // Version history for current session
  var versionHistory = []; // { id, prompt, source, data, type, timestamp }
  var activeVersionId = null;
  // Generating state
  var generating = false;
  var genStartTime = null;
  var genTimer = null;
  // Component browser data
  var tenantComponents = [];
  var catalogComponents = [];

  // ── DOM refs ──
  var $tenantInput = document.getElementById('tenant-input');
  var $tenantLoadBtn = document.getElementById('tenant-load-btn');
  var $componentBrowser = document.getElementById('component-browser');
  var $newBtn = document.getElementById('new-component-btn');
  var $chatLog = document.getElementById('chat-log');
  var $chatEmpty = document.getElementById('chat-empty');
  var $promptInput = document.getElementById('prompt-input');
  var $generateBtn = document.getElementById('generate-btn');
  var $statusIndicator = document.getElementById('status-indicator');
  var $statusText = document.getElementById('status-text');
  var $statusElapsed = document.getElementById('status-elapsed');
  var $previewArea = document.getElementById('preview-area');
  var $previewInfo = document.getElementById('preview-info');
  var $infoType = document.getElementById('info-type');
  var $infoSize = document.getElementById('info-size');
  var $fullscreenBtn = document.getElementById('fullscreen-btn');
  var $previewEmpty = document.getElementById('preview-empty');
  var $previewWrapper = document.getElementById('preview-wrapper');
  var $preview = document.getElementById('preview-iframe');
  var $btnPlay = document.getElementById('btn-play');
  var $scrubber = document.getElementById('scrubber');
  var $timeDisplay = document.getElementById('time-display');
  var $tabProps = document.getElementById('tab-props');
  var $tabSource = document.getElementById('tab-source');
  var $tabHistory = document.getElementById('tab-history');
  var $sourceView = document.getElementById('source-view');
  var $btnCopy = document.getElementById('btn-copy');
  var $saveBtn = document.getElementById('save-btn');
  var $historyList = document.getElementById('history-list');
  var $historyEmpty = document.getElementById('history-empty');
  var $sbTenant = document.getElementById('sb-tenant');
  var $sbType = document.getElementById('sb-type');
  var $sbSize = document.getElementById('sb-size');
  var $wsDot = document.getElementById('ws-dot');
  var $wsLabel = document.getElementById('ws-label');

  // ── WebSocket ──
  function connectWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var wsConn = new WebSocket(proto + '//' + location.host + '/ws');

    wsConn.onopen = function() {
      if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
      $wsDot.className = 'ws-dot connected';
      $wsLabel.textContent = 'Connected';
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
      $wsDot.className = 'ws-dot disconnected';
      $wsLabel.textContent = 'Disconnected';
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

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  // ── Syntax highlighting (basic HTML) ──
  function highlightHtml(src) {
    var esc = escHtml(src);
    // Comments
    esc = esc.replace(/&lt;!--[\\s\\S]*?--&gt;/g, function(m) {
      return '<span class="cmt">' + m + '</span>';
    });
    // Tags
    esc = esc.replace(/(&lt;\\/?)([a-zA-Z][a-zA-Z0-9-]*)/g, function(m, open, tag) {
      return open + '<span class="tag">' + tag + '</span>';
    });
    // Attributes
    esc = esc.replace(/\\s([a-zA-Z][a-zA-Z0-9-]*)=/g, function(m, attr) {
      return ' <span class="attr">' + attr + '</span>=';
    });
    // Strings (quoted)
    esc = esc.replace(/(&quot;)(.*?)(&quot;)/g, function(m, q1, content, q2) {
      return '<span class="str">' + q1 + content + q2 + '</span>';
    });
    return esc;
  }

  // ── Show/Hide generating status (non-blocking) ──
  function showGenerating(label) {
    generating = true;
    genStartTime = Date.now();
    $statusText.textContent = label || 'Generating...';
    $statusElapsed.textContent = '0.0s';
    $statusIndicator.classList.add('visible');
    $generateBtn.disabled = true;
    genTimer = setInterval(function() {
      var elapsed = ((Date.now() - genStartTime) / 1000).toFixed(1);
      $statusElapsed.textContent = elapsed + 's';
    }, 100);
  }

  function hideGenerating() {
    generating = false;
    $statusIndicator.classList.remove('visible');
    $generateBtn.disabled = false;
    if (genTimer) { clearInterval(genTimer); genTimer = null; }
  }

  // ── Preview ──
  function showPreview() {
    $previewEmpty.style.display = 'none';
    $previewWrapper.style.display = 'block';
    $fullscreenBtn.style.display = 'block';
    fitPreview();
    updatePreviewInfo();
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

  function updatePreviewInfo() {
    if (activeComponentType || currentSource) {
      $previewInfo.style.display = 'flex';
      $infoType.textContent = activeComponentType || 'untitled';
      $infoSize.textContent = currentSource ? fmtSize(new Blob([currentSource]).size) : '';
    } else {
      $previewInfo.style.display = 'none';
    }
  }

  function updateStatusBar() {
    $sbTenant.textContent = 'Tenant: ' + (tenantId || '--');
    $sbType.textContent = 'Component: ' + (activeComponentType || '--');
    $sbSize.textContent = 'Size: ' + (currentSource ? fmtSize(new Blob([currentSource]).size) : '--');
  }

  // ── Fullscreen ──
  $fullscreenBtn.addEventListener('click', function() {
    if ($previewArea.requestFullscreen) $previewArea.requestFullscreen();
    else if ($previewArea.webkitRequestFullscreen) $previewArea.webkitRequestFullscreen();
  });

  // ── Tabs ──
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Tenant ──
  function setTenant(id) {
    tenantId = id.trim();
    if (!tenantId) return;
    try { localStorage.setItem('pg-tenant', tenantId); } catch(e) {}
    loadTenantComponents();
    loadCatalog();
    updateStatusBar();
  }

  $tenantLoadBtn.addEventListener('click', function() { setTenant($tenantInput.value); });
  $tenantInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') setTenant($tenantInput.value);
  });

  // ── Load tenant components ──
  function loadTenantComponents() {
    if (!tenantId) return;
    fetch('/playground/api/tenant-components/' + tenantId)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        tenantComponents = data;
        rebuildComponentBrowser();
      })
      .catch(function() {
        tenantComponents = [];
        rebuildComponentBrowser();
      });
  }

  // ── Load catalog ──
  function loadCatalog() {
    fetch('/playground/api/components/catalog')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        catalogComponents = data;
        rebuildComponentBrowser();
      })
      .catch(function() { catalogComponents = []; });
  }

  // ── Component Browser dropdown ──
  function rebuildComponentBrowser() {
    var html = '<option value="">Load component...</option>';

    if (tenantComponents.length) {
      html += '<optgroup label="My Components">';
      tenantComponents.forEach(function(c) {
        var label = c.label || c.type;
        html += '<option value="tenant:' + escHtml(c.type) + '">' + escHtml(label) + '</option>';
      });
      html += '</optgroup>';
    }

    if (Array.isArray(catalogComponents)) {
      // Flat list
      if (catalogComponents.length && !catalogComponents[0].components) {
        html += '<optgroup label="Library">';
        catalogComponents.forEach(function(c) {
          html += '<option value="library:' + escHtml(c.category || 'default') + ':' + escHtml(c.type) + '">' + escHtml(c.label || c.type) + '</option>';
        });
        html += '</optgroup>';
      } else {
        // Categorized
        catalogComponents.forEach(function(cat) {
          if (cat.components && cat.components.length) {
            html += '<optgroup label="' + escHtml(cat.category || cat.label || 'Library') + '">';
            cat.components.forEach(function(c) {
              html += '<option value="library:' + escHtml(cat.category || 'default') + ':' + escHtml(c.type) + '">' + escHtml(c.label || c.type) + '</option>';
            });
            html += '</optgroup>';
          }
        });
      }
    }

    $componentBrowser.innerHTML = html;
  }

  $componentBrowser.addEventListener('change', function() {
    var val = $componentBrowser.value;
    if (!val) return;
    $componentBrowser.value = '';

    if (val.startsWith('tenant:')) {
      var type = val.slice(7);
      loadSavedComponent(type);
    } else if (val.startsWith('library:')) {
      var parts = val.split(':');
      var cat = parts[1];
      var type = parts[2];
      loadLibraryComponent(cat, type);
    }
  });

  function loadSavedComponent(type) {
    activeComponentType = type;
    fetch('/playground/api/tenant-components/' + tenantId + '/' + type + '/source')
      .then(function(r) { return r.text(); })
      .then(function(source) {
        currentSource = source;
        currentData = {};
        renderSourceView(source);
        renderPropEditor({});
        refreshPreview();
        updateStatusBar();
        // Add to history
        addVersion('Loaded: ' + type, source, {}, type);
      })
      .catch(function(err) { console.error('Failed to load component:', err); });
  }

  function loadLibraryComponent(category, type) {
    activeComponentType = type;
    fetch('/playground/api/components/' + category + '/' + type + '/source')
      .then(function(r) { return r.text(); })
      .then(function(source) {
        currentSource = source;
        currentData = {};
        renderSourceView(source);
        renderPropEditor({});
        refreshPreview();
        updateStatusBar();
        addVersion('Loaded library: ' + type, source, {}, type);
      })
      .catch(function(err) { console.error('Failed to load library component:', err); });
  }

  // ── New Component ──
  $newBtn.addEventListener('click', function() {
    currentSource = '';
    currentData = {};
    activeComponentType = null;
    activeChatId = null;
    $previewEmpty.style.display = 'flex';
    $previewWrapper.style.display = 'none';
    $fullscreenBtn.style.display = 'none';
    $previewInfo.style.display = 'none';
    $promptInput.value = '';
    $promptInput.placeholder = 'Describe a component... or paste a revision instruction';
    renderSourceView('');
    renderPropEditor({});
    updateStatusBar();
    // Don't clear history, it persists across the session
  });

  // ── Chat Log ──
  function addChatEntry(prompt, type, action, source, data) {
    var entry = {
      id: uid(),
      prompt: prompt,
      type: type || 'unknown',
      action: action || 'generate',
      source: source,
      data: data || {},
      timestamp: Date.now()
    };
    chatEntries.push(entry);
    activeChatId = entry.id;
    renderChatLog();
    return entry;
  }

  function renderChatLog() {
    if (!chatEntries.length) {
      $chatEmpty.style.display = 'block';
      $chatLog.querySelectorAll('.chat-entry').forEach(function(el) { el.remove(); });
      return;
    }
    $chatEmpty.style.display = 'none';

    var html = '';
    chatEntries.forEach(function(entry) {
      var isActive = entry.id === activeChatId;
      html += '<div class="chat-entry' + (isActive ? ' active' : '') + '" data-id="' + entry.id + '">';
      html += '<div class="chat-prompt">' + escHtml(entry.prompt) + '</div>';
      html += '<div class="chat-meta">';
      html += '<span class="badge">' + escHtml(entry.action) + '</span>';
      html += '<span>' + escHtml(entry.type) + '</span>';
      html += '<span>' + fmtTime(entry.timestamp) + '</span>';
      html += '</div></div>';
    });
    $chatLog.innerHTML = html;
    // Scroll to bottom
    $chatLog.scrollTop = $chatLog.scrollHeight;
  }

  $chatLog.addEventListener('click', function(e) {
    var el = e.target.closest('.chat-entry');
    if (!el) return;
    var id = el.dataset.id;
    var entry = chatEntries.find(function(e) { return e.id === id; });
    if (!entry) return;

    activeChatId = entry.id;
    currentSource = entry.source;
    currentData = entry.data || {};
    activeComponentType = entry.type;

    renderChatLog();
    renderSourceView(currentSource);
    renderPropEditor(currentData);
    refreshPreview();
    updateStatusBar();
  });

  // ── Version History ──
  function addVersion(prompt, source, data, type) {
    var v = {
      id: uid(),
      prompt: prompt,
      source: source,
      data: data || {},
      type: type || activeComponentType || 'unknown',
      timestamp: Date.now()
    };
    versionHistory.push(v);
    activeVersionId = v.id;
    renderHistory();
    return v;
  }

  function renderHistory() {
    if (!versionHistory.length) {
      $historyEmpty.style.display = 'block';
      $historyList.innerHTML = '';
      return;
    }
    $historyEmpty.style.display = 'none';

    var html = '';
    // Show newest first
    for (var i = versionHistory.length - 1; i >= 0; i--) {
      var v = versionHistory[i];
      var isActive = v.id === activeVersionId;
      html += '<div class="history-item' + (isActive ? ' active' : '') + '" data-id="' + v.id + '">';
      html += '<div class="history-prompt">' + escHtml(v.prompt) + '</div>';
      html += '<div class="history-meta">';
      html += escHtml(v.type) + ' &middot; ' + fmtTime(v.timestamp) + ' &middot; ' + fmtSize(new Blob([v.source]).size);
      html += '</div></div>';
    }
    $historyList.innerHTML = html;
  }

  $historyList.addEventListener('click', function(e) {
    var el = e.target.closest('.history-item');
    if (!el) return;
    var id = el.dataset.id;
    var v = versionHistory.find(function(h) { return h.id === id; });
    if (!v) return;

    activeVersionId = v.id;
    currentSource = v.source;
    currentData = v.data || {};
    activeComponentType = v.type;

    renderHistory();
    renderSourceView(currentSource);
    renderPropEditor(currentData);
    refreshPreview();
    updateStatusBar();
  });

  // ── Generate / Revise ──
  $generateBtn.addEventListener('click', function() {
    var prompt = $promptInput.value.trim();
    if (!prompt || !tenantId) return;
    doGenerate(prompt);
  });

  $promptInput.addEventListener('keydown', function(e) {
    // Cmd+Enter or Ctrl+Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      var prompt = $promptInput.value.trim();
      if (prompt && tenantId) doGenerate(prompt);
    }
  });

  function doGenerate(prompt) {
    // Auto-detect: revise if we have current source, generate if not
    if (currentSource) {
      reviseComponent(prompt);
    } else {
      generateComponent(prompt);
    }
  }

  function generateComponent(prompt) {
    showGenerating('Generating...');

    fetch('/playground/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, prompt: prompt })
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      hideGenerating();

      if (result.error) {
        alert('Generation failed: ' + result.error);
        return;
      }

      currentSource = result.source || '';
      currentData = result.data || {};
      activeComponentType = result.type || null;

      // Add to chat log and version history
      addChatEntry(prompt, activeComponentType, 'generate', currentSource, currentData);
      addVersion(prompt, currentSource, currentData, activeComponentType);

      renderSourceView(currentSource);
      renderPropEditor(currentData);
      refreshPreview();
      updateStatusBar();
      $promptInput.value = '';
    })
    .catch(function(err) {
      hideGenerating();
      alert('Generation failed: ' + err.message);
    });
  }

  function reviseComponent(prompt) {
    showGenerating('Revising...');

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
      hideGenerating();

      if (result.error) {
        alert('Revision failed: ' + result.error);
        return;
      }

      currentSource = result.source || currentSource;
      if (result.data) currentData = result.data;

      addChatEntry(prompt, activeComponentType, 'revise', currentSource, currentData);
      addVersion(prompt, currentSource, currentData, activeComponentType);

      renderSourceView(currentSource);
      renderPropEditor(currentData);
      refreshPreview();
      updateStatusBar();
      $promptInput.value = '';
    })
    .catch(function(err) {
      hideGenerating();
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
        $saveBtn.textContent = 'Saved!';
        setTimeout(function() { $saveBtn.textContent = 'Save to Library'; }, 1500);
      } else {
        alert('Save failed: ' + (result.error || 'Unknown error'));
      }
    })
    .catch(function(err) { alert('Save failed: ' + err.message); });
  });

  // ── Source View ──
  function renderSourceView(src) {
    if (!src) {
      $sourceView.innerHTML = '<span style="color:#475569">No source yet</span>';
      return;
    }
    $sourceView.innerHTML = highlightHtml(src);
  }

  // ── Prop Editor ──
  function renderPropEditor(data) {
    if (!data || Object.keys(data).length === 0) {
      $tabProps.innerHTML = '<div class="chat-empty">No props to edit</div>';
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
    $tabProps.innerHTML = html;

    document.getElementById('update-props').addEventListener('click', function() {
      currentData = collectData();
      refreshPreview();
    });
  }

  function collectData() {
    var data = {};
    $tabProps.querySelectorAll('[data-key]').forEach(function(inp) {
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

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'preview-component',
        source: currentSource,
        data: currentData
      }));
      return;
    }

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

  // ── Init: Auto-tenant from URL param > localStorage ──
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

  updateStatusBar();
})();
</script>
</body>
</html>`;
}
