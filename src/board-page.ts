/**
 * The board in your hand -- served at /board?tenant=&project=&token= (and
 * where /studio lands on a phone). One card per storyboard scene: the
 * script, the still, and the scene's take need with Record (the /take
 * booth for that scene) and Upload. "Record all" runs the booth through
 * every scene and the server cuts the recording per scene. Build and
 * Render are one tap each and poll their jobs. The desktop Studio is the
 * editing surface; this is the board, sized for a thumb (SPEC-take-flow.md).
 *
 * Plain HTML in one template literal: the client script must not contain
 * backticks or "${" (the take page's rule).
 */

export function getBoardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="icon" href="data:,">
<title>Board</title>
<style>
  :root { --bg:#0e0e14; --panel:#17171f; --ink:#f4f4f8; --muted:#9a9aad; --line:#26262f;
    --accent:#393bf5; --ok:#22c55e; --warn:#f59e0b; --err:#ef4444; }
  * { box-sizing:border-box; }
  html, body { margin:0; background:var(--bg); color:var(--ink);
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; -webkit-font-smoothing:antialiased; }
  body { padding:16px 16px calc(24px + env(safe-area-inset-bottom)); max-width:560px; margin:0 auto; }
  h1 { font-size:22px; margin:8px 0 2px; letter-spacing:-0.01em; }
  .sub { color:var(--muted); font-size:14px; margin:0 0 14px; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  .btn { appearance:none; border:0; border-radius:12px; padding:13px 16px; font:inherit; font-size:16px; font-weight:600;
    background:var(--accent); color:#fff; cursor:pointer; flex:1 1 auto; text-align:center; text-decoration:none; }
  .btn.ghost { background:transparent; border:1px solid var(--line); color:var(--ink); }
  .btn.small { padding:10px 12px; font-size:14px; flex:0 1 auto; }
  .btn[disabled] { opacity:0.45; cursor:default; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:14px; margin:12px 0; }
  .card .head { display:flex; justify-content:space-between; align-items:baseline; gap:8px; }
  .card .label { font-weight:700; font-size:16px; }
  .card .dur { color:var(--muted); font-size:13px; white-space:nowrap; }
  .still { width:100%; border-radius:10px; margin:10px 0 6px; display:block; background:#0a0a10; }
  .script { font-size:16px; line-height:1.45; margin:8px 0; white-space:pre-line; }
  .script .pause { color:var(--muted); letter-spacing:.2em; }
  .edit { margin:8px 0; }
  .edit textarea { width:100%; box-sizing:border-box; min-height:120px; font:inherit; font-size:16px; line-height:1.45; padding:10px; border-radius:10px; border:1px solid var(--line); background:var(--bg); color:var(--fg); resize:vertical; }
  .edit .hint { color:var(--muted); font-size:12px; margin:6px 0 8px; }
  .stale { color:#e0a34a; font-size:13px; margin:6px 0 0; }
  .notes { color:var(--muted); font-size:13px; line-height:1.4; margin:6px 0 10px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .notes.open { display:block; }
  .pill { display:inline-block; font-size:12px; font-weight:700; padding:4px 9px; border-radius:999px; background:#26262f; color:var(--ink); }
  .pill.need { background:#3a2a12; color:#fbbf24; }
  .pill.ok { background:#12331f; color:#4ade80; }
  .pill.na { background:#20202a; color:var(--muted); }
  .meta { color:var(--muted); font-size:13px; margin-top:6px; }
  .proof { margin-top:10px; border-top:1px solid var(--line); padding-top:8px; }
  .proof .lead { color:var(--muted); font-size:12px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; margin-bottom:6px; }
  .proof .ev { display:flex; gap:10px; align-items:center; padding:6px 0; }
  .proof .ev .what { flex:1 1 auto; font-size:14px; line-height:1.35; }
  .proof .ev .what small { display:block; color:var(--muted); font-size:12px; }
  .proof .ev img, .proof .ev video { width:56px; height:56px; object-fit:cover; border-radius:8px; background:#0a0a10; flex:0 0 auto; }
  .status { color:var(--muted); font-size:14px; margin:10px 0; }
  .status:empty, #topActions:empty { display:none; }
  .status.err { color:var(--err); }
  .bar { height:6px; background:var(--line); border-radius:3px; overflow:hidden; margin-top:8px; display:none; }
  .bar i { display:block; height:100%; width:0; background:var(--accent); }
  .top { position:sticky; top:0; background:var(--bg); padding:6px 0 10px; z-index:2; }
  a.link { color:var(--muted); font-size:13px; text-decoration:underline; }
  video { width:100%; border-radius:12px; background:#000; }
  input[type=file] { display:none; }
</style>
</head>
<body>
<div class="top">
  <h1 id="title">Board</h1>
  <p class="sub" id="subtitle">Loading the board…</p>
  <div class="row" id="topActions"></div>
  <div class="status" id="status"></div>
</div>
<div id="cards"></div>
<div class="card" id="filmCard" style="display:none">
  <div class="head"><div class="label">The film</div><div class="dur" id="filmMeta"></div></div>
  <div id="filmBody"></div>
  <div class="row" id="filmActions" style="margin-top:10px"></div>
  <div class="bar" id="jobBar"><i id="jobFill"></i></div>
</div>
<p style="margin:18px 0 0"><a class="link" id="desktopLink" href="#">Open the desktop Studio</a></p>
<input type="file" id="picker" accept="video/*">
<input type="file" id="evPicker" accept="image/*,video/*">
<script>
(function () {
  var qp = new URLSearchParams(location.search);
  var tenant = qp.get('tenant') || '', project = qp.get('project') || '', token = qp.get('token') || '';
  var $ = function (id) { return document.getElementById(id); };
  function withToken(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token); }
  function api(method, path, body) {
    var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(withToken('/api' + path), opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; });
    });
  }
  function link(path, extra) { return path + '?tenant=' + encodeURIComponent(tenant) + '&project=' + encodeURIComponent(project) + (token ? '&token=' + encodeURIComponent(token) : '') + (extra || ''); }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
  function say(msg, err) { var st = $('status'); st.textContent = msg || ''; st.className = 'status' + (err ? ' err' : ''); }
  if (!tenant || !project) { say('Missing ?tenant= and ?project= in the link.', true); return; }
  $('desktopLink').href = link('/studio', '&desktop=1');

  var P = null, pickingScene = -1, jobTimer = null, editing = -1, pickingEvidence = null;
  // The proof a claim asked for (SPEC-creator-cut.md): one need per entry
  // in scene.evidence, carried on scene.assets with its index.
  var EV_LABELS = { screenshot: 'Screenshot', screen_recording: 'Screen recording', stock_footage: 'B-roll', mockup: 'Product mock' };
  function evidenceNeedOf(scene, j) {
    var a = (scene.assets || []).filter(function (x) { return x && x.evidence === j; });
    return a.length ? a[0] : null;
  }
  function openEvidence(scenes) {
    var n = 0;
    scenes.forEach(function (s) { (s.evidence || []).forEach(function (ev, j) { var need = evidenceNeedOf(s, j); if (!need || need.status === 'needed') n++; }); });
    return n;
  }

  function needOf(scene) {
    var a = (scene.assets || []).filter(function (x) { return x && x.type === 'camera_video'; });
    return a.length ? a[0] : null;
  }
  function takeOf(i) {
    var clip = ((P.speaker_track && P.speaker_track.clips) || []).filter(function (c) { return c.scene_index === i; })[0];
    if (!clip) return null;
    var ts = (P.takes || []).filter(function (t) { return t.scene_index === i && t.source === clip.source; });
    return ts.length ? ts[ts.length - 1] : { source: clip.source };
  }

  // The script as the reader sees it: one sentence per line; a line that
  // says only (pause) is a held beat, shown as the prompter shows it.
  var PAUSE_LINE = /^\\(\\s*pause\\s*\\)[.,!?]*$/i;
  function scriptView(script) {
    var sc = document.createElement('div'); sc.className = 'script';
    var lines = script.split(/\\r?\\n/).reduce(function (a, l) { return a.concat(l.split(/(\\(\\s*pause\\s*\\)[.,!?]*)/i)); }, []);
    lines.forEach(function (ln, k) {
      var t = ln.trim(); if (!t) return;
      if (PAUSE_LINE.test(t)) { var pz = document.createElement('span'); pz.className = 'pause'; pz.textContent = '\u2022\u2022\u2022'; sc.appendChild(pz); }
      else sc.appendChild(document.createTextNode(t));
      if (k < lines.length - 1) sc.appendChild(document.createTextNode('\\n'));
    });
    return sc;
  }
  function scriptEditor(i, script) {
    var wrap = document.createElement('div'); wrap.className = 'edit';
    var ta = document.createElement('textarea'); ta.value = script; ta.placeholder = 'What you say in this scene.'; wrap.appendChild(ta);
    var hint = document.createElement('div'); hint.className = 'hint';
    hint.textContent = 'One sentence per line. A line that says only (pause) holds a beat of silence.';
    wrap.appendChild(hint);
    var row = document.createElement('div'); row.className = 'row';
    var save = document.createElement('button'); save.className = 'btn small'; save.textContent = 'Save';
    var cancel = document.createElement('button'); cancel.className = 'btn small ghost'; cancel.textContent = 'Cancel';
    cancel.onclick = function () { editing = -1; render(); };
    save.onclick = function () {
      save.disabled = true; say('Saving the lines…');
      api('PATCH', '/storyboard/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + '/scenes/' + i, { voiceover_text: ta.value })
        .then(function (r) {
          editing = -1;
          say(r.script_changed_since_take ? 'Saved. The take no longer matches these lines.' : 'Saved.');
          return load();
        })
        .catch(function (e) { save.disabled = false; say(e.message || String(e), true); });
    };
    row.appendChild(save); row.appendChild(cancel); wrap.appendChild(row);
    setTimeout(function () { ta.focus(); }, 0);
    return wrap;
  }

  function render() {
    var scenes = (P.storyboard && P.storyboard.scenes) || [];
    var g = (P.treatment && P.treatment.filmGrammar) || '';
    var frame = (P.canvas && P.canvas.frame) || '';
    var speaker = g === 'speaker' || g === 'creator-cut';
    $('title').textContent = P.name || project;
    $('subtitle').textContent = [scenes.length + (scenes.length === 1 ? ' scene' : ' scenes'), g, frame, P.status].filter(Boolean).join(' · ');

    var open = [];
    scenes.forEach(function (s, i) { var n = needOf(s); if (n && n.status === 'needed') open.push(i); });

    var top = $('topActions'); top.innerHTML = '';
    if (speaker) {
      var lined = scenes.filter(function (s) { return String(s.voiceover_text || '').trim(); }).length;
      if (lined > 1) {
        var all = document.createElement('a'); all.className = 'btn'; all.href = link('/take', '&scene=all');
        all.textContent = open.length ? 'Record all ' + lined + ' scenes' : 'Re-record all scenes';
        top.appendChild(all);
      }
    }

    var cards = $('cards'); cards.innerHTML = '';
    scenes.forEach(function (s, i) {
      var card = document.createElement('div'); card.className = 'card';
      var head = document.createElement('div'); head.className = 'head';
      var label = document.createElement('div'); label.className = 'label'; label.textContent = (i + 1) + '. ' + (s.label || 'Scene ' + (i + 1));
      var dur = document.createElement('div'); dur.className = 'dur'; dur.textContent = s.duration_seconds ? fmt(s.duration_seconds) : '';
      head.appendChild(label); head.appendChild(dur); card.appendChild(head);

      var img = document.createElement('img'); img.className = 'still'; img.alt = '';
      img.src = withToken('/output/' + encodeURIComponent(tenant) + '/projects/' + encodeURIComponent(project) + '/storyboard_card_scene_' + (i + 1) + '.png?v=' + encodeURIComponent(P.updated_at || ''));
      img.onerror = function () { img.style.display = 'none'; };
      card.appendChild(img);

      var script = String(s.voiceover_text || '').trim();
      if (editing === i) {
        card.appendChild(scriptEditor(i, script));
      } else {
        if (script) { card.appendChild(scriptView(script)); }
        if (speaker) {
          var ed = document.createElement('a'); ed.className = 'link'; ed.href = '#'; ed.style.fontSize = '13px';
          ed.textContent = script ? 'Edit the lines' : 'Add lines';
          ed.onclick = function (ev) { ev.preventDefault(); editing = i; render(); };
          card.appendChild(ed);
        }
      }
      var notes = String(s.visual_notes || s.purpose || '').trim();
      if (notes) { var nt = document.createElement('div'); nt.className = 'notes'; nt.textContent = notes; nt.onclick = function () { nt.classList.toggle('open'); }; card.appendChild(nt); }

      var need = needOf(s), take = takeOf(i);
      var line = document.createElement('div'); line.className = 'row'; line.style.marginTop = '8px';
      var pill = document.createElement('span'); pill.className = 'pill';
      if (need && need.status === 'needed') { pill.className += ' need'; pill.textContent = 'Needs a take'; }
      else if (take) { pill.className += ' ok'; pill.textContent = 'Take' + (take.duration ? ' · ' + fmt(take.duration) : '') + (take.capture ? ' · ' + take.capture : ''); }
      else if (speaker && !script) { pill.className += ' na'; pill.textContent = 'No lines'; }
      else { pill.className += ' na'; pill.textContent = 'Motion graphics'; }
      line.appendChild(pill); card.appendChild(line);
      if (take && take.lines && take.lines.trim() !== script) {
        var st = document.createElement('div'); st.className = 'stale';
        st.textContent = 'The lines changed after this take was recorded. Re-record to match.';
        card.appendChild(st);
      }

      if (speaker && script) {
        var acts = document.createElement('div'); acts.className = 'row'; acts.style.marginTop = '10px';
        var rec = document.createElement('a'); rec.className = 'btn small'; rec.href = link('/take', '&scene=' + i);
        rec.textContent = take ? 'Re-record' : 'Record';
        var up = document.createElement('button'); up.className = 'btn small ghost'; up.textContent = 'Upload';
        up.onclick = function () { pickingScene = i; $('picker').value = ''; $('picker').click(); };
        acts.appendChild(rec); acts.appendChild(up); card.appendChild(acts);
        if (take && take.reframed) { var m = document.createElement('div'); m.className = 'meta'; m.textContent = 'Reframed ' + take.reframed.from + ' → ' + take.reframed.to; card.appendChild(m); }
      }
      var evs = s.evidence || [];
      if (evs.length) {
        var proof = document.createElement('div'); proof.className = 'proof';
        var lead = document.createElement('div'); lead.className = 'lead'; lead.textContent = 'The proof this claim wants'; proof.appendChild(lead);
        evs.forEach(function (ev, j) {
          var need = evidenceNeedOf(s, j), have = need && need.status === 'provided' && need.path;
          var row = document.createElement('div'); row.className = 'ev';
          if (have) {
            var th = /\\.(mp4|webm|mov|m4v)(\\?|$)/i.test(need.path) ? document.createElement('video') : document.createElement('img');
            th.src = withToken(need.path); if (th.tagName === 'VIDEO') { th.muted = true; th.playsInline = true; th.preload = 'metadata'; }
            row.appendChild(th);
          }
          var what = document.createElement('div'); what.className = 'what';
          what.textContent = ev.description || '';
          var kind = document.createElement('small');
          kind.textContent = (EV_LABELS[ev.kind] || ev.kind) + (ev.use === 'card' ? ' · card' : ' · cutaway') + (have ? ' · provided' : (ev.kind === 'screenshot' || ev.kind === 'screen_recording') ? ' · needed' : ' · optional');
          what.appendChild(kind); row.appendChild(what);
          var evUp = document.createElement('button'); evUp.className = 'btn small ghost'; evUp.textContent = have ? 'Replace' : 'Upload';
          evUp.onclick = function () { pickingEvidence = { scene: i, index: j }; $('evPicker').value = ''; $('evPicker').click(); };
          row.appendChild(evUp); proof.appendChild(row);
        });
        card.appendChild(proof);
      }
      cards.appendChild(card);
    });

    // The film: build once every need is filled, render, watch.
    var fc = $('filmCard'); fc.style.display = scenes.length ? '' : 'none';
    var built = (P.scenes || []).length > 0;
    $('filmMeta').textContent = P.status || '';
    var body = $('filmBody'); body.innerHTML = '';
    if (P.status === 'rendered') {
      var v = document.createElement('video'); v.controls = true; v.playsInline = true; v.preload = 'metadata';
      v.src = withToken('/output/' + encodeURIComponent(tenant) + '/projects/' + encodeURIComponent(project) + '/output.mp4?v=' + encodeURIComponent(P.updated_at || ''));
      body.appendChild(v);
    } else {
      var hint = document.createElement('div'); hint.className = 'meta';
      var proofOpen = openEvidence(scenes);
      hint.textContent = open.length ? (open.length + ' scene' + (open.length === 1 ? ' still needs' : 's still need') + ' a take before the film can be built.')
        : built ? 'Scenes are built. Render to watch the film.' : 'Every take is in. Build the scenes, then render.';
      if (proofOpen && !open.length) hint.textContent += ' ' + proofOpen + ' piece' + (proofOpen === 1 ? '' : 's') + ' of proof still to upload; the build runs without ' + (proofOpen === 1 ? 'it' : 'them') + '.';
      body.appendChild(hint);
    }
    var fa = $('filmActions'); fa.innerHTML = '';
    var build = document.createElement('button'); build.className = 'btn' + (built ? ' ghost' : ''); build.textContent = built ? 'Rebuild scenes' : 'Build the film';
    build.disabled = open.length > 0 || !!jobTimer; build.onclick = function () { startJob('build'); };
    var rend = document.createElement('button'); rend.className = 'btn' + (built ? '' : ' ghost'); rend.textContent = 'Render';
    rend.disabled = !built || !!jobTimer; rend.onclick = function () { startJob('render'); };
    fa.appendChild(build); fa.appendChild(rend);
  }

  function load() {
    return api('GET', '/projects/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project))
      .then(function (p) { P = p; render(); })
      .catch(function (e) { say(e.message || String(e), true); });
  }

  // ── jobs ──
  function startJob(kind) {
    say(kind === 'build' ? 'Building the scenes…' : 'Rendering…');
    var req = kind === 'build'
      ? api('POST', '/generate-scenes/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), {})
      : api('POST', '/render/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), { quality: 'production' });
    req.then(function (j) { if (!j.job_id) throw new Error('no job id'); pollJob(j.job_id, kind); render(); })
      .catch(function (e) { say(e.message || String(e), true); });
  }
  function pollJob(id, kind) {
    var bar = $('jobBar'); bar.style.display = 'block';
    if (jobTimer) clearInterval(jobTimer);
    jobTimer = setInterval(function () {
      api('GET', '/job/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(id)).then(function (j) {
        var pct = (j.progress && j.progress.percent) || 0; $('jobFill').style.width = pct + '%';
        var step = (j.progress && (j.progress.step || j.progress.detail)) || j.status;
        say((kind === 'build' ? 'Building' : 'Rendering') + ' · ' + step + (pct ? ' · ' + pct + '%' : ''));
        if (j.status === 'completed' || j.status === 'failed') {
          clearInterval(jobTimer); jobTimer = null; bar.style.display = 'none';
          say(j.status === 'failed' ? ((kind === 'build' ? 'Build' : 'Render') + ' failed: ' + (j.error || '')) : (kind === 'build' ? 'Scenes built.' : 'Rendered.'), j.status === 'failed');
          load();
        }
      }).catch(function () { /* keep polling */ });
    }, 3000);
  }

  // ── upload a take for one scene ──
  $('picker').addEventListener('change', function () {
    var f = $('picker').files && $('picker').files[0]; if (!f || pickingScene < 0) return;
    var i = pickingScene; pickingScene = -1;
    var ext = (f.name.split('.').pop() || 'mp4').toLowerCase();
    var name = 'take-' + new Date().toISOString().replace(/[:.]/g, '-') + '-scene' + (i + 1) + '.' + ext;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/upload-asset/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + '?name=' + encodeURIComponent(name)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) say('Uploading scene ' + (i + 1) + ' take… ' + Math.round((e.loaded / e.total) * 100) + '%'); };
    xhr.onerror = function () { say('Upload failed (network).', true); };
    xhr.onload = function () {
      var up; try { up = JSON.parse(xhr.responseText); } catch (e) { up = {}; }
      if (xhr.status < 200 || xhr.status >= 300 || !up.url) { say('Upload failed: ' + (up.error || ('HTTP ' + xhr.status)), true); return; }
      say('Attaching…');
      api('POST', '/take/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), { url: up.url, scene_index: i, capture: 'upload', mime: f.type, look: 'soft' })
        .then(function () { say('Scene ' + (i + 1) + ' take attached.'); return load(); })
        .catch(function (e) { say(e.message || String(e), true); });
    };
    xhr.send(f);
  });

  // ── upload a piece of evidence for one claim ──
  $('evPicker').addEventListener('change', function () {
    var f = $('evPicker').files && $('evPicker').files[0]; if (!f || !pickingEvidence) return;
    var i = pickingEvidence.scene, j = pickingEvidence.index; pickingEvidence = null;
    var ext = (f.name.split('.').pop() || 'png').toLowerCase();
    var name = 'evidence-' + new Date().toISOString().replace(/[:.]/g, '-') + '-scene' + (i + 1) + '-' + (j + 1) + '.' + ext;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/upload-asset/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + '?name=' + encodeURIComponent(name)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) say('Uploading proof for scene ' + (i + 1) + '… ' + Math.round((e.loaded / e.total) * 100) + '%'); };
    xhr.onerror = function () { say('Upload failed (network).', true); };
    xhr.onload = function () {
      var up; try { up = JSON.parse(xhr.responseText); } catch (e) { up = {}; }
      if (xhr.status < 200 || xhr.status >= 300 || !up.url) { say('Upload failed: ' + (up.error || ('HTTP ' + xhr.status)), true); return; }
      api('POST', '/evidence/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), { url: up.url, scene_index: i, evidence_index: j })
        .then(function () { say('Scene ' + (i + 1) + ' proof ' + (j + 1) + ' attached.'); return load(); })
        .catch(function (e) { say(e.message || String(e), true); });
    };
    xhr.send(f);
  });

  // Coming back from the booth: reload so the card shows the new take.
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !jobTimer) load(); });
  load();
})();
</script>
</body>
</html>`;
}
