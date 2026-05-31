/**
 * Preview SPA - single HTML string export.
 *
 * A web-based project viewer for reviewing and editing video/image/deck projects.
 * Vanilla JS, no build step, no framework.
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
    grid-template-columns: 240px 1fr;
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
  .badge {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 4px;
    background: #334155;
    color: #94a3b8;
  }
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
  .project-item, .scene-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    border-left: 3px solid transparent;
    transition: background 0.1s;
  }
  .project-item:hover, .scene-item:hover { background: #0f172a; }
  .project-item.active, .scene-item.active {
    background: #0f172a;
    border-left-color: #A78BFA;
    color: #fff;
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

  /* ── Main Area ── */
  #main {
    display: grid;
    grid-template-rows: 1fr auto auto;
    overflow: hidden;
  }

  /* ── Preview ── */
  #preview-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    overflow: hidden;
    padding: 16px;
  }
  #preview-iframe {
    background: #000;
    border: none;
    max-width: 100%;
    max-height: 100%;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
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
      <span class="badge" id="format-badge">--</span>
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
    </div>
  </div>

  <div id="main">
    <div id="preview-container">
      <div class="no-scene" id="preview-placeholder">Select a scene to preview</div>
      <iframe id="preview-iframe" style="display:none;"></iframe>
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
    animFrameId: null
  };

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
    previewIframe: document.getElementById('preview-iframe'),
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

  // ── Load Projects ──
  function loadProjects() {
    state.tenantId = els.tenantInput.value.trim();
    if (!state.tenantId) return;
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
      html += '<div class="project-item' + (active ? ' active' : '') + '" data-id="' + p.project_id + '">'
        + '<span>' + escHtml(p.name) + '</span>'
        + '<span class="badge">' + p.format + '</span>'
        + '</div>';
    });
    els.projectList.innerHTML = html;

    // Click handlers
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
    if (!project || !project.scenes.length) {
      els.sceneList.innerHTML = '<div class="empty-state">No scenes</div>';
      return;
    }
    var html = '';
    project.scenes.forEach(function(scene, i) {
      var active = i === state.currentSceneIndex;
      var label = scene.label || ('Scene ' + (i + 1));
      html += '<div class="scene-item' + (active ? ' active' : '') + '" data-index="' + i + '">'
        + '<span class="scene-dot"></span>'
        + '<span class="scene-label">' + (i + 1) + '. ' + escHtml(label) + '</span>'
        + '<span class="scene-dur">' + scene.duration_seconds.toFixed(1) + 's</span>'
        + '</div>';
    });
    els.sceneList.innerHTML = html;

    els.sceneList.querySelectorAll('.scene-item').forEach(function(el) {
      el.addEventListener('click', function() {
        selectScene(parseInt(el.dataset.index, 10));
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

  // ── Preview ──
  function loadPreview() {
    var project = state.currentProject;
    var scene = project && project.scenes[state.currentSceneIndex];
    if (!scene) { clearPreview(); return; }

    var url = '/api/preview-scene/' + state.tenantId + '/' + project.project_id + '/' + scene.id;
    els.previewIframe.src = url;
    els.previewIframe.style.display = 'block';
    els.previewPlaceholder.style.display = 'none';

    // Size iframe to scene aspect ratio
    var cw = project.canvas.width || 1920;
    var ch = project.canvas.height || 1080;
    var aspect = cw / ch;
    // Fit within container
    els.previewIframe.style.aspectRatio = aspect;
    els.previewIframe.width = cw;
    els.previewIframe.height = ch;
    // CSS max-width/max-height handles the rest

    state.duration = scene.duration_seconds;
    els.slider.disabled = false;
    els.playBtn.disabled = false;
    els.slider.value = 0;
    updateTimeDisplay(0);

    // Wait for iframe to load before trying to access timeline
    els.previewIframe.onload = function() {
      // Timeline should be ready
    };
  }

  function clearPreview() {
    els.previewIframe.style.display = 'none';
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
      // Check if timeline ended
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
    // Sort by z-index descending for display
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
          // array or object -- JSON textarea
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
        // JSON parse for arrays/objects
        try { newData[key] = JSON.parse(input.value); }
        catch(e) { newData[key] = input.value; }
      }
    });

    // Update via API (PATCH component data)
    api('PATCH', '/projects/' + state.tenantId + '/' + project.project_id + '/scenes/' + scene.id + '/components/' + comp.id, { data: newData })
      .then(function(updated) {
        if (updated && updated.scenes) {
          state.currentProject = updated;
          // Reload preview
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

  // ── Render ──
  function triggerRender() {
    if (!state.currentProject) return;
    els.renderStatus.textContent = 'Rendering...';
    els.renderBtn.disabled = true;
    api('POST', '/render/' + state.tenantId + '/' + state.currentProject.project_id)
      .then(function(res) {
        els.renderStatus.textContent = res.status || 'Render queued';
        els.renderBtn.disabled = false;
      })
      .catch(function() {
        els.renderStatus.textContent = 'Render failed';
        els.renderBtn.disabled = false;
      });
  }

  // ── Util ──
  function escHtml(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function escAttr(s) { return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ── Events ──
  els.loadBtn.addEventListener('click', loadProjects);
  els.tenantInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') loadProjects(); });
  els.playBtn.addEventListener('click', togglePlay);
  els.slider.addEventListener('input', function() { scrub(parseInt(els.slider.value, 10)); });
  els.renderBtn.addEventListener('click', triggerRender);

  // ── Check URL for tenant param ──
  var params = new URLSearchParams(window.location.search);
  if (params.get('tenant')) {
    els.tenantInput.value = params.get('tenant');
    loadProjects();
  }
})();
</script>
</body>
</html>`;
}
