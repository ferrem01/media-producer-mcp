/**
 * Preview SPA - single HTML string export.
 *
 * A web-based project viewer for reviewing and editing video/image/deck projects.
 * Vanilla JS, no build step, no framework.
 *
 * Features:
 * - 16:9 iframe scaling (1920x1080 native, CSS transform to fit)
 * - Auto-tenant from URL param with localStorage persistence
 * - Format badges with colors
 * - Render queue integration with job status polling
 */

export function getPreviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Media Producer - Preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>
  /* ── Reset & Base ── */
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    font-family: 'Inter', -apple-system, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    overflow: hidden;
  }

  /* ── Layout ── */
  #app {
    display: grid;
    grid-template-rows: 56px 1fr;
    grid-template-columns: 260px 1fr;
    height: 100vh;
  }

  /* ── Header ── */
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
  }
  header .left { display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 16px; font-weight: 600; }

  /* ── Badges ── */
  .badge {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 4px;
    background: #334155;
    color: #94a3b8;
  }
  .badge-video { background: rgba(139, 92, 246, 0.2); color: #a78bfa; }
  .badge-image { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
  .badge-deck, .badge-slideshow { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
  .badge-gif { background: rgba(251, 146, 60, 0.2); color: #fb923c; }
  .badge-social { background: rgba(236, 72, 153, 0.2); color: #f472b6; }
  .badge-one-pager { background: rgba(14, 165, 233, 0.2); color: #38bdf8; }
  .badge-email-header { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
  .badge-thumbnail { background: rgba(234, 179, 8, 0.2); color: #facc15; }

  .tenant-select {
    display: flex; align-items: center; gap: 8px;
  }
  .tenant-select label { font-size: 13px; color: #94a3b8; }
  .tenant-select input, .tenant-select select {
    background: #0f172a; border: 1px solid #334155; color: #e2e8f0;
    padding: 4px 8px; border-radius: 4px; font-size: 13px; font-family: inherit;
  }
  .btn {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-primary { background: #A78BFA; color: #0f172a; }
  .btn-primary:hover { background: #c4b5fd; }
  .btn-secondary { background: #334155; color: #e2e8f0; }
  .btn-secondary:hover { background: #475569; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Sidebar ── */
  #sidebar {
    background: #1e293b;
    border-right: 1px solid #334155;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .sidebar-section {
    padding: 12px 0;
    border-bottom: 1px solid #334155;
  }
  .sidebar-section:last-child { border-bottom: none; }
  .sidebar-header {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    padding: 0 12px 8px;
  }

  /* ── Project Items ── */
  .project-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    border-left: 3px solid transparent;
    transition: background 0.1s;
  }
  .project-item:hover { background: #0f172a; }
  .project-item.active {
    background: #0f172a;
    border-left-color: #A78BFA;
    color: #fff;
  }
  .project-info { flex: 1; min-width: 0; }
  .project-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .project-meta {
    display: flex; align-items: center; gap: 6px;
    margin-top: 2px;
    font-size: 11px; color: #64748b;
  }
  .project-meta .badge { font-size: 10px; padding: 1px 5px; }

  /* ── Scene Items ── */
  .scene-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    border-left: 3px solid transparent;
    transition: background 0.1s;
    position: relative;
  }
  .scene-item:hover { background: #0f172a; }
  .scene-item.active {
    background: #0f172a;
    border-left-color: #A78BFA;
    color: #fff;
  }
  .scene-item.drag-over {
    border-top: 2px solid #A78BFA;
  }
  .scene-thumb {
    width: 48px; height: 27px;
    border-radius: 3px;
    background: #0f172a;
    border: 1px solid #334155;
    flex-shrink: 0;
    overflow: hidden;
    position: relative;
  }
  .scene-thumb iframe {
    width: 1920px; height: 1080px;
    transform: scale(0.025);
    transform-origin: top left;
    border: none; pointer-events: none;
    position: absolute; top: 0; left: 0;
  }
  .scene-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #475569;
    flex-shrink: 0;
  }
  .scene-item.active .scene-dot { background: #A78BFA; }
  .scene-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scene-dur { font-size: 11px; color: #64748b; }
  .scene-drag-handle {
    cursor: grab; color: #475569; font-size: 14px;
    flex-shrink: 0; user-select: none;
    padding: 0 2px;
  }
  .scene-drag-handle:active { cursor: grabbing; }
  .scene-delete {
    opacity: 0; cursor: pointer; color: #f87171;
    font-size: 14px; flex-shrink: 0;
    transition: opacity 0.1s;
    background: none; border: none; padding: 0 2px;
    font-family: inherit;
  }
  .scene-item:hover .scene-delete { opacity: 0.7; }
  .scene-delete:hover { opacity: 1 !important; }
  .add-scene-btn {
    display: flex; align-items: center; justify-content: center;
    gap: 6px; padding: 8px 12px;
    font-size: 12px; color: #64748b;
    cursor: pointer; transition: color 0.1s;
    border: none; background: none; width: 100%;
    font-family: inherit;
  }
  .add-scene-btn:hover { color: #A78BFA; }

  /* Add Scene Modal */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    z-index: 100;
  }
  .modal-backdrop.hidden { display: none; }
  .modal {
    background: #1e293b; border: 1px solid #334155;
    border-radius: 12px; padding: 24px;
    width: 360px; max-width: 90vw;
  }
  .modal h3 { font-size: 16px; margin-bottom: 16px; color: #f8fafc; }
  .modal-field { margin-bottom: 12px; }
  .modal-field label {
    display: block; font-size: 12px; color: #94a3b8;
    margin-bottom: 4px;
  }
  .modal-field input, .modal-field select {
    width: 100%; padding: 8px 10px;
    background: #0f172a; border: 1px solid #334155;
    border-radius: 6px; color: #e2e8f0;
    font-size: 13px; font-family: inherit;
    outline: none;
  }
  .modal-field input:focus, .modal-field select:focus { border-color: #A78BFA; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

  /* ── Main Area ── */
  #main {
    display: grid;
    grid-template-rows: 1fr auto auto;
    overflow: hidden;
  }

  /* ── Preview Container ── */
  #preview-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    overflow: hidden;
  }
  .preview-wrapper {
    position: relative;
  }
  #preview-iframe {
    background: #000;
    border: none;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    transform-origin: top left;
  }
  .no-scene {
    color: #475569;
    font-size: 14px;
    text-align: center;
  }

  /* ── Timeline ── */
  #timeline-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: #1e293b;
    border-top: 1px solid #334155;
    border-bottom: 1px solid #334155;
  }
  .play-btn {
    width: 32px; height: 32px;
    background: #A78BFA;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .play-btn:hover { background: #c4b5fd; }
  .play-btn svg { fill: #0f172a; }
  #timeline-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    background: #334155;
    border-radius: 3px;
    outline: none;
    cursor: pointer;
  }
  #timeline-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #A78BFA;
    cursor: pointer;
  }
  #timeline-slider::-moz-range-thumb {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #A78BFA;
    cursor: pointer;
    border: none;
  }
  .time-display {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: #94a3b8;
    min-width: 90px;
    text-align: right;
    flex-shrink: 0;
  }

  /* ── Bottom Panels ── */
  #bottom-panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: 200px;
    background: #1e293b;
  }

  /* ── Component Layers ── */
  #layers-panel {
    border-right: 1px solid #334155;
    overflow-y: auto;
  }
  #layers-panel .sidebar-header { padding-top: 10px; }
  .layer-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.1s;
  }
  .layer-item:hover { background: #0f172a; }
  .layer-item.active { background: #0f172a; color: #A78BFA; }
  .layer-icon {
    width: 14px; height: 14px;
    background: #475569;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .layer-item.active .layer-icon { background: #A78BFA; }
  .layer-z { font-size: 10px; color: #64748b; margin-left: auto; }

  /* ── Prop Editor ── */
  #props-panel {
    overflow-y: auto;
    padding: 10px 12px;
  }
  #props-panel .sidebar-header { padding: 0 0 8px; }
  .prop-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 10px;
  }
  .prop-label {
    font-size: 11px;
    font-weight: 500;
    color: #94a3b8;
  }
  .prop-input {
    width: 100%;
    padding: 5px 8px;
    font-size: 13px;
    font-family: inherit;
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    outline: none;
    transition: border-color 0.15s;
  }
  .prop-input:focus { border-color: #A78BFA; }
  textarea.prop-input { resize: vertical; min-height: 48px; font-family: 'SF Mono', monospace; font-size: 11px; }
  .prop-check {
    width: 16px; height: 16px;
    accent-color: #A78BFA;
  }
  .prop-actions { display: flex; gap: 8px; margin-top: 4px; }

  /* ── Empty / loading states ── */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #475569;
    font-size: 13px;
    text-align: center;
    padding: 16px;
  }

  /* ── Render status ── */
  .render-status {
    font-size: 13px;
    color: #A78BFA;
    margin-right: 8px;
  }

  /* ── Status badges ── */
  .status-draft { color: #94a3b8; }
  .status-rendering { color: #facc15; }
  .status-rendered { color: #4ade80; }
  .status-failed { color: #f87171; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #475569; }
</style>
</head>
<body>
<div id="app">
  <header>
    <div class="left">
      <h1 id="project-name">Media Producer</h1>
      <span class="badge" id="format-badge" style="display:none">--</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <div class="tenant-select">
        <label for="tenant-input">Tenant:</label>
        <input id="tenant-input" type="text" placeholder="tenant-id" value="">
        <button class="btn btn-secondary" id="load-btn">Load</button>
      </div>
      <span class="render-status" id="render-status"></span>
      <button class="btn btn-primary" id="render-btn" disabled>Render</button>
    </div>
  </header>

  <div id="sidebar">
    <div class="sidebar-section" id="projects-section">
      <div class="sidebar-header">Projects</div>
      <div id="project-list"><div class="empty-state">Enter a tenant ID</div></div>
    </div>
    <div class="sidebar-section" id="scenes-section" style="flex:1;">
      <div class="sidebar-header">Scenes</div>
      <div id="scene-list"><div class="empty-state">Select a project</div></div>
      <button class="add-scene-btn" id="add-scene-btn" style="display:none;">+ Add Scene</button>
    </div>
  </div>

  <!-- Add Scene Modal -->
  <div class="modal-backdrop hidden" id="add-scene-modal">
    <div class="modal">
      <h3>Add Scene</h3>
      <div class="modal-field">
        <label>Label</label>
        <input type="text" id="new-scene-label" placeholder="Scene label">
      </div>
      <div class="modal-field">
        <label>Duration (seconds)</label>
        <input type="number" id="new-scene-duration" value="5" min="1" max="60" step="0.5">
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancel-add-scene">Cancel</button>
        <button class="btn btn-primary" id="confirm-add-scene">Add</button>
      </div>
    </div>
  </div>

  <div id="main">
    <div id="preview-container">
      <div class="no-scene" id="preview-placeholder">Select a scene to preview</div>
      <div class="preview-wrapper" id="preview-wrapper" style="display:none;">
        <iframe id="preview-iframe"></iframe>
      </div>
    </div>

    <div id="timeline-bar">
      <button class="play-btn" id="play-btn" disabled>
        <svg id="play-icon" width="14" height="14" viewBox="0 0 14 14">
          <polygon points="3,1 12,7 3,13"/>
        </svg>
      </button>
      <input type="range" id="timeline-slider" min="0" max="1000" value="0" step="1" disabled>
      <span class="time-display" id="time-display">0.0s / 0.0s</span>
    </div>

    <div id="bottom-panels">
      <div id="layers-panel">
        <div class="sidebar-header">Component Layers</div>
        <div id="layer-list"><div class="empty-state">No scene selected</div></div>
      </div>
      <div id="props-panel">
        <div class="sidebar-header">Prop Editor</div>
        <div id="prop-editor"><div class="empty-state">Select a component</div></div>
      </div>
    </div>
  </div>
</div>

<script>
(function() {
  // ── State ──
  var state = {
    tenantId: '',
    projects: [],
    currentProject: null,
    currentSceneIndex: -1,
    currentComponentIndex: -1,
    playing: false,
    duration: 0,
    animFrameId: null,
    ws: null,
    wsReconnectTimer: null,
    renderJobId: null,
    renderPollTimer: null
  };

  // ── WebSocket ──
  function connectWebSocket() {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) return;
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var ws = new WebSocket(proto + '//' + location.host + '/ws');

    ws.onopen = function() {
      console.log('WebSocket connected');
      if (state.wsReconnectTimer) {
        clearTimeout(state.wsReconnectTimer);
        state.wsReconnectTimer = null;
      }
    };

    ws.onmessage = function(e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch(err) { return; }

      if (msg.type === 'scene-html') {
        var currentTime = 0;
        var tl = getTimeline();
        if (tl) currentTime = tl.time();

        var iframe = els.previewIframe;
        try {
          iframe.contentDocument.open();
          iframe.contentDocument.write(msg.html);
          iframe.contentDocument.close();
        } catch(err) {
          iframe.srcdoc = msg.html;
          return;
        }

        var checkReady = setInterval(function() {
          try {
            if (iframe.contentWindow && iframe.contentWindow.__MP_READY) {
              clearInterval(checkReady);
              iframe.contentWindow.__MP_TIMELINE.time(currentTime);
              iframe.contentWindow.__MP_TIMELINE.pause();
              updateTimeDisplay(currentTime);
            }
          } catch(err) {
            clearInterval(checkReady);
          }
        }, 50);
        setTimeout(function() { clearInterval(checkReady); }, 5000);
      }

      if (msg.type === 'error') {
        console.error('WebSocket error:', msg.error);
      }
    };

    ws.onclose = function() {
      console.log('WebSocket disconnected, reconnecting in 2s...');
      state.ws = null;
      state.wsReconnectTimer = setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = function() {
      ws.close();
    };

    state.ws = ws;
  }

  connectWebSocket();

  // ── DOM refs ──
  var els = {
    tenantInput: document.getElementById('tenant-input'),
    loadBtn: document.getElementById('load-btn'),
    projectName: document.getElementById('project-name'),
    formatBadge: document.getElementById('format-badge'),
    renderBtn: document.getElementById('render-btn'),
    renderStatus: document.getElementById('render-status'),
    projectList: document.getElementById('project-list'),
    sceneList: document.getElementById('scene-list'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    previewWrapper: document.getElementById('preview-wrapper'),
    previewIframe: document.getElementById('preview-iframe'),
    previewContainer: document.getElementById('preview-container'),
    playBtn: document.getElementById('play-btn'),
    playIcon: document.getElementById('play-icon'),
    slider: document.getElementById('timeline-slider'),
    timeDisplay: document.getElementById('time-display'),
    layerList: document.getElementById('layer-list'),
    propEditor: document.getElementById('prop-editor')
  };

  // ── API ──
  function api(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch('/api' + path, opts).then(function(r) { return r.json(); });
  }

  // ── Format badge helper ──
  function formatBadgeClass(format) {
    return 'badge badge-' + (format || '').toLowerCase();
  }

  // ── Load Projects ──
  function loadProjects() {
    state.tenantId = els.tenantInput.value.trim();
    if (!state.tenantId) return;

    // Persist tenant to localStorage
    try { localStorage.setItem('mp-tenant', state.tenantId); } catch(e) {}

    api('GET', '/projects/' + state.tenantId).then(function(projects) {
      state.projects = projects;
      renderProjectList();
    }).catch(function(e) {
      els.projectList.innerHTML = '<div class="empty-state">Failed to load projects</div>';
    });
  }

  function renderProjectList() {
    if (!state.projects.length) {
      els.projectList.innerHTML = '<div class="empty-state">No projects found</div>';
      return;
    }
    var html = '';
    state.projects.forEach(function(p) {
      var active = state.currentProject && state.currentProject.project_id === p.project_id;
      var sceneCount = p.scenes ? p.scenes.length : (p.scene_count || '?');
      var statusClass = 'status-' + (p.status || 'draft');
      html += '<div class="project-item' + (active ? ' active' : '') + '" data-id="' + p.project_id + '">'
        + '<div class="project-info">'
        + '<div class="project-name">' + escHtml(p.name) + '</div>'
        + '<div class="project-meta">'
        + '<span class="' + formatBadgeClass(p.format) + '">' + escHtml(p.format) + '</span>'
        + '<span class="' + statusClass + '">' + escHtml(p.status || 'draft') + '</span>'
        + '<span>' + sceneCount + ' scene' + (sceneCount !== 1 ? 's' : '') + '</span>'
        + '</div>'
        + '</div>'
        + '</div>';
    });
    els.projectList.innerHTML = html;

    els.projectList.querySelectorAll('.project-item').forEach(function(el) {
      el.addEventListener('click', function() {
        selectProject(el.dataset.id);
      });
    });
  }

  function selectProject(projectId) {
    api('GET', '/projects/' + state.tenantId + '/' + projectId).then(function(project) {
      state.currentProject = project;
      state.currentSceneIndex = -1;
      state.currentComponentIndex = -1;

      els.projectName.textContent = project.name;
      els.formatBadge.textContent = project.format;
      els.formatBadge.className = formatBadgeClass(project.format);
      els.formatBadge.style.display = '';
      els.renderBtn.disabled = false;
      els.renderStatus.textContent = '';

      renderProjectList();
      renderSceneList();
      clearPreview();
      clearLayers();
      clearProps();
    });
  }

  // ── Scene List ──
  function renderSceneList() {
    var project = state.currentProject;
    var addBtn = document.getElementById('add-scene-btn');
    if (!project || !project.scenes.length) {
      els.sceneList.innerHTML = '<div class="empty-state">No scenes</div>';
      if (addBtn) addBtn.style.display = project ? '' : 'none';
      return;
    }
    if (addBtn) addBtn.style.display = '';
    var html = '';
    project.scenes.forEach(function(scene, i) {
      var active = i === state.currentSceneIndex;
      var label = scene.label || ('Scene ' + (i + 1));
      var thumbUrl = '/api/scene-thumbnail/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
      html += '<div class="scene-item' + (active ? ' active' : '') + '" data-index="' + i + '" data-scene-id="' + escAttr(scene.id) + '" draggable="true">'
        + '<span class="scene-drag-handle" title="Drag to reorder">≡</span>'
        + '<div class="scene-thumb"><iframe src="' + thumbUrl + '" loading="lazy" tabindex="-1"></iframe></div>'
        + '<span class="scene-label">' + (i + 1) + '. ' + escHtml(label) + '</span>'
        + '<span class="scene-dur">' + scene.duration_seconds.toFixed(1) + 's</span>'
        + '<button class="scene-delete" data-scene-id="' + escAttr(scene.id) + '" title="Delete scene">×</button>'
        + '</div>';
    });
    els.sceneList.innerHTML = html;

    // Click to select
    els.sceneList.querySelectorAll('.scene-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.scene-delete') || e.target.closest('.scene-drag-handle')) return;
        selectScene(parseInt(el.dataset.index, 10));
      });
    });

    // Delete scene
    els.sceneList.querySelectorAll('.scene-delete').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var sceneId = btn.dataset.sceneId;
        if (!sceneId || !project) return;
        if (!confirm('Delete this scene?')) return;
        api('DELETE', '/projects/' + state.tenantId + '/' + project.project_id + '/scenes/' + sceneId)
          .then(function(updated) {
            if (updated && updated.scenes) {
              state.currentProject = updated;
              if (state.currentSceneIndex >= updated.scenes.length) {
                state.currentSceneIndex = updated.scenes.length - 1;
              }
              renderSceneList();
              if (state.currentSceneIndex >= 0) {
                loadPreview();
                renderLayers();
              } else {
                clearPreview();
                clearLayers();
              }
            }
          });
      });
    });

    // Drag and drop reorder
    setupDragReorder();
  }

  function setupDragReorder() {
    var items = els.sceneList.querySelectorAll('.scene-item');
    var dragSrcIndex = null;

    items.forEach(function(item) {
      item.addEventListener('dragstart', function(e) {
        dragSrcIndex = parseInt(item.dataset.index, 10);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.dataset.index);
        item.style.opacity = '0.4';
      });

      item.addEventListener('dragend', function() {
        item.style.opacity = '';
        items.forEach(function(it) { it.classList.remove('drag-over'); });
      });

      item.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        items.forEach(function(it) { it.classList.remove('drag-over'); });
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', function() {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', function(e) {
        e.preventDefault();
        item.classList.remove('drag-over');
        var dropIndex = parseInt(item.dataset.index, 10);
        if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

        var project = state.currentProject;
        if (!project) return;

        // Build new order
        var scenes = project.scenes.slice();
        var moved = scenes.splice(dragSrcIndex, 1)[0];
        scenes.splice(dropIndex, 0, moved);
        var newIds = scenes.map(function(s) { return s.id; });

        api('PATCH', '/projects/' + state.tenantId + '/' + project.project_id + '/reorder', { scene_ids: newIds })
          .then(function(updated) {
            if (updated && updated.scenes) {
              state.currentProject = updated;
              // Adjust current scene index
              if (state.currentSceneIndex === dragSrcIndex) {
                state.currentSceneIndex = dropIndex;
              }
              renderSceneList();
            }
          });
      });
    });
  }

  function selectScene(index) {
    state.currentSceneIndex = index;
    state.currentComponentIndex = -1;
    stopPlayback();
    renderSceneList();
    loadPreview();
    renderLayers();
    clearProps();
  }

  // ── Preview with proper scaling ──
  function loadPreview() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    if (!scene) { clearPreview(); return; }

    var url = '/api/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
    var iframe = els.previewIframe;

    // Set native resolution
    iframe.width = project.canvas.width || 1920;
    iframe.height = project.canvas.height || 1080;
    iframe.src = url;

    els.previewWrapper.style.display = 'block';
    els.previewPlaceholder.style.display = 'none';

    state.duration = scene.duration_seconds;
    els.slider.disabled = false;
    els.playBtn.disabled = false;
    els.slider.value = 0;
    updateTimeDisplay(0);

    // Scale to fit after load
    updatePreviewScale();

    iframe.onload = function() {
      updatePreviewScale();
    };
  }

  function updatePreviewScale() {
    var container = els.previewContainer;
    var iframe = els.previewIframe;
    var wrapper = els.previewWrapper;
    if (!container || !iframe || wrapper.style.display === 'none') return;

    var project = state.currentProject;
    var nativeW = (project && project.canvas.width) || 1920;
    var nativeH = (project && project.canvas.height) || 1080;

    var containerRect = container.getBoundingClientRect();
    var pad = 32;
    var availW = containerRect.width - pad * 2;
    var availH = containerRect.height - pad * 2;

    var scaleX = availW / nativeW;
    var scaleY = availH / nativeH;
    var scale = Math.min(scaleX, scaleY, 1);

    iframe.style.width = nativeW + 'px';
    iframe.style.height = nativeH + 'px';
    iframe.style.transform = 'scale(' + scale + ')';
    iframe.style.transformOrigin = 'top left';

    // Center the wrapper
    var scaledW = nativeW * scale;
    var scaledH = nativeH * scale;
    wrapper.style.width = scaledW + 'px';
    wrapper.style.height = scaledH + 'px';
  }

  window.addEventListener('resize', updatePreviewScale);

  function clearPreview() {
    els.previewWrapper.style.display = 'none';
    els.previewIframe.src = 'about:blank';
    els.previewPlaceholder.style.display = '';
    els.slider.disabled = true;
    els.playBtn.disabled = true;
    els.slider.value = 0;
    updateTimeDisplay(0);
    state.duration = 0;
    stopPlayback();
  }

  // ── Timeline ──
  function getTimeline() {
    try {
      return els.previewIframe.contentWindow && els.previewIframe.contentWindow.__MP_TIMELINE;
    } catch(e) { return null; }
  }

  function togglePlay() {
    var tl = getTimeline();
    if (!tl) return;
    if (state.playing) {
      stopPlayback();
      tl.pause();
    } else {
      state.playing = true;
      updatePlayIcon();
      tl.play();
      animLoop();
    }
  }

  function stopPlayback() {
    state.playing = false;
    updatePlayIcon();
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
  }

  function animLoop() {
    if (!state.playing) return;
    var tl = getTimeline();
    if (tl) {
      var t = tl.time();
      var d = state.duration;
      els.slider.value = d > 0 ? Math.round((t / d) * 1000) : 0;
      updateTimeDisplay(t);
      if (t >= d) {
        stopPlayback();
        tl.pause();
        return;
      }
    }
    state.animFrameId = requestAnimationFrame(animLoop);
  }

  function scrub(val) {
    var tl = getTimeline();
    if (!tl) return;
    var t = (val / 1000) * state.duration;
    tl.time(t);
    tl.pause();
    stopPlayback();
    updateTimeDisplay(t);
  }

  function updateTimeDisplay(currentTime) {
    els.timeDisplay.textContent = (currentTime || 0).toFixed(1) + 's / ' + (state.duration || 0).toFixed(1) + 's';
  }

  function updatePlayIcon() {
    if (state.playing) {
      els.playIcon.innerHTML = '<rect x="3" y="2" width="3" height="10" rx="0.5"/><rect x="8" y="2" width="3" height="10" rx="0.5"/>';
    } else {
      els.playIcon.innerHTML = '<polygon points="3,1 12,7 3,13"/>';
    }
  }

  // ── Layers ──
  function renderLayers() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    if (!scene || !scene.components.length) {
      els.layerList.innerHTML = '<div class="empty-state">No components</div>';
      return;
    }
    var comps = scene.components.map(function(c, i) { return { comp: c, originalIndex: i }; });
    comps.sort(function(a, b) { return (b.comp.z_index || 0) - (a.comp.z_index || 0); });

    var html = '';
    comps.forEach(function(item) {
      var c = item.comp;
      var active = item.originalIndex === state.currentComponentIndex;
      html += '<div class="layer-item' + (active ? ' active' : '') + '" data-index="' + item.originalIndex + '">'
        + '<span class="layer-icon"></span>'
        + '<span>' + escHtml(c.type) + '</span>'
        + '<span class="layer-z">z:' + (c.z_index || 0) + '</span>'
        + '</div>';
    });
    els.layerList.innerHTML = html;

    els.layerList.querySelectorAll('.layer-item').forEach(function(el) {
      el.addEventListener('click', function() {
        state.currentComponentIndex = parseInt(el.dataset.index, 10);
        renderLayers();
        renderProps();
      });
    });
  }

  function clearLayers() {
    els.layerList.innerHTML = '<div class="empty-state">No scene selected</div>';
  }

  // ── Prop Editor ──
  function renderProps() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    var comp = scene && scene.components[state.currentComponentIndex];
    if (!comp) { clearProps(); return; }

    var html = '<div class="sidebar-header" style="padding:0 0 8px;">' + escHtml(comp.type) + ' props</div>';
    var data = comp.data || {};
    var keys = Object.keys(data);

    if (!keys.length) {
      html += '<div class="empty-state">No data fields</div>';
    } else {
      keys.forEach(function(key) {
        var val = data[key];
        html += '<div class="prop-row">';
        html += '<label class="prop-label">' + escHtml(key) + '</label>';

        if (typeof val === 'boolean') {
          html += '<input type="checkbox" class="prop-check" data-key="' + escAttr(key) + '"' + (val ? ' checked' : '') + '>';
        } else if (typeof val === 'number') {
          html += '<input type="number" class="prop-input" data-key="' + escAttr(key) + '" value="' + val + '">';
        } else if (typeof val === 'string') {
          html += '<input type="text" class="prop-input" data-key="' + escAttr(key) + '" value="' + escAttr(val) + '">';
        } else {
          html += '<textarea class="prop-input" data-key="' + escAttr(key) + '">' + escHtml(JSON.stringify(val, null, 2)) + '</textarea>';
        }

        html += '</div>';
      });
    }

    html += '<div class="prop-actions">'
      + '<button class="btn btn-primary" id="update-props-btn">Update</button>'
      + '</div>';

    els.propEditor.innerHTML = html;

    document.getElementById('update-props-btn').addEventListener('click', saveProps);
  }

  function saveProps() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    var comp = scene && scene.components[state.currentComponentIndex];
    if (!comp) return;

    var newData = {};
    els.propEditor.querySelectorAll('[data-key]').forEach(function(input) {
      var key = input.dataset.key;
      var origVal = comp.data[key];

      if (input.type === 'checkbox') {
        newData[key] = input.checked;
      } else if (typeof origVal === 'number') {
        newData[key] = parseFloat(input.value) || 0;
      } else if (typeof origVal === 'string') {
        newData[key] = input.value;
      } else {
        try { newData[key] = JSON.parse(input.value); }
        catch(e) { newData[key] = input.value; }
      }
    });

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'update-prop',
        tenantId: state.tenantId,
        projectId: project.project_id,
        sceneId: scene.id,
        componentId: comp.id,
        data: newData
      }));
      comp.data = Object.assign({}, comp.data, newData);
      stopPlayback();
      return;
    }

    api('PATCH', '/projects/' + state.tenantId + '/' + project.project_id + '/scenes/' + scene.id + '/components/' + comp.id, { data: newData })
      .then(function(updated) {
        if (updated && updated.scenes) {
          state.currentProject = updated;
          loadPreview();
          renderSceneList();
          renderLayers();
        }
      })
      .catch(function(e) {
        console.error('Failed to update props', e);
      });
  }

  function clearProps() {
    els.propEditor.innerHTML = '<div class="empty-state">Select a component</div>';
  }

  // ── Render with job queue ──
  function triggerRender() {
    if (!state.currentProject) return;
    els.renderStatus.textContent = 'Queuing...';
    els.renderBtn.disabled = true;

    api('POST', '/render/' + state.tenantId + '/' + state.currentProject.project_id)
      .then(function(res) {
        if (res.job_id) {
          state.renderJobId = res.job_id;
          els.renderStatus.textContent = 'Rendering...';
          pollJobStatus();
        } else {
          els.renderStatus.textContent = res.status || 'Queued';
          els.renderBtn.disabled = false;
        }
      })
      .catch(function() {
        els.renderStatus.textContent = 'Render failed';
        els.renderBtn.disabled = false;
      });
  }

  function pollJobStatus() {
    if (!state.renderJobId) return;

    api('GET', '/jobs/' + state.renderJobId).then(function(job) {
      if (!job || job.error === 'Job not found') {
        els.renderStatus.textContent = 'Job not found';
        els.renderBtn.disabled = false;
        return;
      }

      if (job.status === 'completed') {
        els.renderStatus.textContent = 'Render complete!';
        els.renderBtn.disabled = false;
        state.renderJobId = null;
        return;
      }

      if (job.status === 'failed') {
        els.renderStatus.textContent = 'Failed: ' + (job.error || 'unknown');
        els.renderBtn.disabled = false;
        state.renderJobId = null;
        return;
      }

      // Still rendering - show progress
      if (job.progress) {
        els.renderStatus.textContent = 'Rendering... ' + job.progress.percent + '%';
      } else {
        els.renderStatus.textContent = 'Rendering...';
      }

      state.renderPollTimer = setTimeout(pollJobStatus, 2000);
    }).catch(function() {
      state.renderPollTimer = setTimeout(pollJobStatus, 3000);
    });
  }

  // ── Util ──
  function escHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ── Add Scene Modal ──
  var addSceneBtn = document.getElementById('add-scene-btn');
  var addSceneModal = document.getElementById('add-scene-modal');
  var cancelAddScene = document.getElementById('cancel-add-scene');
  var confirmAddScene = document.getElementById('confirm-add-scene');
  var newSceneLabel = document.getElementById('new-scene-label');
  var newSceneDuration = document.getElementById('new-scene-duration');

  addSceneBtn.addEventListener('click', function() {
    newSceneLabel.value = 'Scene ' + ((state.currentProject ? state.currentProject.scenes.length : 0) + 1);
    newSceneDuration.value = '5';
    addSceneModal.classList.remove('hidden');
  });

  cancelAddScene.addEventListener('click', function() {
    addSceneModal.classList.add('hidden');
  });

  addSceneModal.addEventListener('click', function(e) {
    if (e.target === addSceneModal) addSceneModal.classList.add('hidden');
  });

  confirmAddScene.addEventListener('click', function() {
    var project = state.currentProject;
    if (!project) return;
    var label = newSceneLabel.value.trim() || 'New Scene';
    var dur = parseFloat(newSceneDuration.value) || 5;
    var sceneId = 'scene_' + Date.now().toString(36);

    var scene = {
      id: sceneId,
      label: label,
      duration_seconds: dur,
      components: []
    };

    api('POST', '/projects/' + state.tenantId + '/' + project.project_id + '/scenes', { scene: scene })
      .then(function(updated) {
        if (updated && updated.scenes) {
          state.currentProject = updated;
          state.currentSceneIndex = updated.scenes.length - 1;
          renderSceneList();
          loadPreview();
          renderLayers();
        }
        addSceneModal.classList.add('hidden');
      })
      .catch(function() {
        addSceneModal.classList.add('hidden');
        alert('Failed to add scene');
      });
  });

  // ── Events ──
  els.loadBtn.addEventListener('click', loadProjects);
  els.tenantInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') loadProjects(); });
  els.playBtn.addEventListener('click', togglePlay);
  els.slider.addEventListener('input', function() { scrub(parseInt(els.slider.value, 10)); });
  els.renderBtn.addEventListener('click', triggerRender);

  // ── Auto-tenant: URL param > localStorage ──
  var params = new URLSearchParams(window.location.search);
  var tenantParam = params.get('tenant');
  if (tenantParam) {
    els.tenantInput.value = tenantParam;
    try { localStorage.setItem('mp-tenant', tenantParam); } catch(e) {}
    loadProjects();
  } else {
    // Try localStorage
    try {
      var saved = localStorage.getItem('mp-tenant');
      if (saved) {
        els.tenantInput.value = saved;
        loadProjects();
      }
    } catch(e) {}
  }
})();
</script>
</body>
</html>`;
}
