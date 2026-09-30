/**
 * Studio on a phone -- what /studio?tenant=&project=&token= serves when the
 * user agent is a phone (?desktop=1 forces the desktop app). ONE Studio,
 * two views: this one shows only what you do on a phone. At the top, what
 * the film still needs from you (takes, proof); then one card per
 * storyboard scene: the script, the still, the take need with Record (the
 * /take booth for that scene) and Upload, and the proof the claim asked
 * for with Upload. "Record all" runs the booth through every scene and the
 * server cuts the recording per scene. Build and Render are one tap each
 * and poll their jobs. The desktop Studio is the editing surface
 * (SPEC-take-flow.md).
 *
 * Plain HTML in one template literal: the client script must not contain
 * backticks or "${" (the take page's rule).
 */

import { QUOTIENT_CSS, QUOTIENT_FONT_LINKS } from "./quotient-theme.js";

export function getPhoneStudioHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="icon" href="data:,">
${QUOTIENT_FONT_LINKS}
<title>Studio</title>
<style>
${QUOTIENT_CSS}
  /* The phone Studio: Quotient's page frame on a phone -- the app ground,
     white cards with shadow-sub, near-black primary buttons, pills for
     status. Dark mode follows the system like the app. */
  body { padding: 16px 16px calc(24px + env(safe-area-inset-bottom)); max-width: 560px; margin: 0 auto; }
  h1 { font: 500 20px/28px var(--font-sans); letter-spacing: -0.01em; margin: 8px 0 2px; color: var(--foreground); }
  .sub { color: var(--muted-foreground); font-size: 14px; margin: 0 0 14px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 16px; border: 1px solid transparent;
    border-radius: var(--radius); font: 500 14px/20px var(--font-sans); background: var(--primary); color: var(--primary-foreground);
    box-shadow: var(--shadow-weak); cursor: pointer; flex: 1 1 auto; text-align: center; text-decoration: none; white-space: nowrap;
    transition: all 150ms cubic-bezier(.4,0,.2,1); -webkit-appearance: none; appearance: none; }
  .btn:hover { background: color-mix(in srgb, var(--primary) 90%, transparent); }
  .btn:active { transform: translateY(1px); }
  .btn:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent); }
  .btn.ghost { background: var(--surface-primary); border-color: var(--border-secondary); color: var(--content-primary); }
  .btn.ghost:hover { background: var(--accent); }
  .btn.small { height: 36px; padding: 0 12px; flex: 0 1 auto; }
  .btn[disabled] { opacity: .5; pointer-events: none; }
  .card { background: var(--card); border: 1px solid var(--border-secondary); border-radius: var(--radius); box-shadow: var(--shadow-sub); padding: 16px; margin: 12px 0; }
  .card .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .card .label { font: 500 16px/24px var(--font-sans); color: var(--foreground); }
  .card .dur { color: var(--muted-foreground); font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .still { width: 100%; border-radius: var(--radius-md); margin: 10px 0 6px; display: block; background: var(--surface-tertiary); border: 1px solid var(--border-secondary); }
  .script { font-size: 15px; line-height: 23px; margin: 8px 0; white-space:pre-line; color: var(--content-primary); letter-spacing: -0.01em; }
  .script .pause { color: var(--muted-foreground); letter-spacing: .2em; }
  .edit { margin: 8px 0; }
  .edit textarea { width: 100%; box-sizing: border-box; min-height: 120px; font: 400 15px/23px var(--font-sans); padding: 10px 12px; border-radius: var(--radius);
    border: 1px solid var(--input); background: var(--surface-primary); color: var(--foreground); resize: vertical; outline: none; }
  .edit textarea:focus { border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent); }
  .edit .hint { color: var(--muted-foreground); font-size: 12px; margin: 6px 0 8px; }
  .stale { color: #7b3306; font-size: 13px; margin: 6px 0 0; }
  .notes { color: var(--muted-foreground); font-size: 13px; line-height: 1.4; margin: 6px 0 10px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .notes.open { display: block; }
  .pill { display: inline-flex; align-items: center; gap: 4px; font: 500 12px/16px var(--font-sans); padding: 2.5px 8px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-secondary); background: var(--surface-secondary); color: var(--content-secondary); box-shadow: var(--shadow-tw-xs); }
  .pill.need { background: #fffbeb; border-color: rgb(225 113 0 / .2); color: #7b3306; }
  .pill.ok { background: #f0fdf4; border-color: rgb(0 166 62 / .2); color: #0d542b; }
  .pill.na { color: var(--content-tertiary); }
  .meta { color: var(--muted-foreground); font-size: 13px; margin-top: 6px; }
  .needs { background: var(--card); border: 1px solid var(--border-secondary); border-radius: var(--radius); box-shadow: var(--shadow-sub); padding: 14px 16px; margin: 0 0 4px; }
  .needs .lead, .proof .lead { color: var(--muted-foreground); font: 500 12px/16px var(--font-sans); letter-spacing: .04em; text-transform: uppercase; margin-bottom: 6px; }
  .needs .line { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; padding: 6px 0; border-top: 1px solid var(--border-secondary); }
  .needs .line:first-of-type { border-top: 0; }
  .needs .line .n { color: var(--muted-foreground); font-size: 13px; white-space: nowrap; }
  .needs .line.done { color: var(--muted-foreground); }
  .needs .line.done .n { color: #0d542b; }
  .needs .note { color: var(--muted-foreground); font-size: 12px; margin-top: 8px; }
  .proof { margin-top: 10px; border-top: 1px solid var(--border-secondary); padding-top: 8px; }
  .proof .ev { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 6px 0; }
  .proof .ev .acts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  /* THE SOURCES: find / draw / recorder open a panel under the row. */
  .src-panel { flex-basis: 100%; padding: 10px; border: 1px solid var(--border-secondary); border-radius: var(--radius-sm); background: var(--core-panel-bg, var(--surface-secondary)); }
  .music { background: var(--card); border: 1px solid var(--border-secondary); border-radius: var(--radius); box-shadow: var(--shadow-sub); padding: 14px 16px; margin: 0 0 4px; }
  .music .now { font-size: 14px; }
  .music .now small { display: block; color: var(--muted-foreground); font-size: 12px; }
  .music .row { margin-top: 10px; }
  .music .group { color: var(--muted-foreground); font: 600 11px/16px var(--font-sans); letter-spacing: .04em; text-transform: uppercase; margin: 12px 0 2px; }
  .music .tr { display: flex; gap: 8px; align-items: center; padding: 6px 0; border-top: 1px solid var(--border-secondary); font-size: 13px; }
  .music .tr .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .music .tr .t small { color: var(--muted-foreground); margin-left: 6px; }
  .music .search { display: flex; gap: 6px; margin-top: 10px; }
  .music .search input { flex: 1; min-width: 0; box-sizing: border-box; padding: 8px 10px; font: 14px/20px var(--font-sans); border-radius: var(--radius-sm); border: 1px solid var(--input); background: var(--card); color: var(--foreground); }
  .src-panel.hint { font-size: 13px; color: var(--muted-foreground); line-height: 1.45; }
  .src-panel input, .src-panel textarea { flex: 1; min-width: 0; width: 100%; box-sizing: border-box; padding: 8px 10px; font: 14px/20px var(--font-sans); border-radius: var(--radius-sm); border: 1px solid var(--input); background: var(--card); color: var(--foreground); }
  .src-panel textarea { min-height: 64px; resize: vertical; margin-bottom: 8px; }
  .src-panel .row { display: flex; gap: 6px; margin-bottom: 8px; }
  .src-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 13px; color: var(--muted-foreground); }
  .proof .ev .cand { position: relative; aspect-ratio: 16 / 10; border-radius: var(--radius-sm); overflow: hidden; background: #111; border: 1px solid var(--border-secondary); }
  .proof .ev .cand.tall { aspect-ratio: 4 / 5; }
  .proof .ev .cand img { width: 100%; height: 100%; object-fit: cover; border-radius: 0; display: block; }
  .proof .ev .cand small { position: absolute; right: 4px; bottom: 4px; font-size: 10px; padding: 1px 5px; border-radius: 4px; background: rgba(0,0,0,.6); color: #fff; }
  .proof .ev .what { flex: 1 1 auto; font-size: 14px; line-height: 1.35; }
  .proof .ev .what small { display: block; color: var(--muted-foreground); font-size: 12px; }
  .proof .ev img, .proof .ev video { width: 56px; height: 56px; object-fit: cover; border-radius: var(--radius-sm); background: var(--surface-tertiary); flex: 0 0 auto; }
  /* THE CAST card: actors as portrait chips in a scrolling row. */
  .cast select { width: 100%; box-sizing: border-box; padding: 8px 10px; font: 14px/20px var(--font-sans); border-radius: var(--radius-sm); border: 1px solid var(--input); background: var(--card); color: var(--foreground); }
  .castrow { display: flex; gap: 8px; overflow-x: auto; padding: 4px 0 6px; -webkit-overflow-scrolling: touch; }
  .castpic { flex: 0 0 76px; border: 1px solid var(--border-secondary); border-radius: var(--radius-sm); background: #111; padding: 0; overflow: hidden; cursor: pointer; position: relative; aspect-ratio: 4 / 5; }
  .castpic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .castpic span { position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; line-height: 13px; padding: 2px 4px; background: rgba(0,0,0,.6); color: #fff; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .castpic.sel { outline: 2px solid var(--primary); outline-offset: -2px; }
  .castpic.add { display: flex; align-items: center; justify-content: center; }
  .castpic.add span { position: static; background: none; color: #bbb; font-size: 12px; text-align: center; }
  .status { color: var(--muted-foreground); font-size: 14px; margin: 10px 0; }
  .status:empty, #topActions:empty { display: none; }
  .status.err { color: var(--destructive); }
  .bar { height: 4px; background: var(--muted); border-radius: 9999px; overflow: hidden; margin-top: 8px; display: none; }
  .bar i { display: block; height: 100%; width: 0; background: var(--primary); border-radius: 9999px; transition: width .2s; }
  .top { position: sticky; top: 0; background: var(--background); padding: 6px 0 10px; z-index: 2; }
  a.link { color: var(--muted-foreground); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; }
  /* Films: every film as a card (the library, /library), a tap opens it
     here -- moving between films on the phone without a QR per film. */
  a.link.films { display: inline-block; font: 500 14px/20px var(--font-sans); color: var(--content-primary); text-decoration: none; padding: 4px 0; }
  video { width: 100%; border-radius: var(--radius); background: #000; }
  input[type=file] { display: none; }
</style>
</head>
<body>
<div class="top">
  <a class="link films" id="filmsLink" href="/library">← Films</a>
  <h1 id="title">Studio</h1>
  <p class="sub" id="subtitle">Loading…</p>
  <div class="row" id="topActions"></div>
  <div class="status" id="status"></div>
</div>
<div id="needs"></div>
<div id="cast"></div>
<div id="cards"></div>
<div class="card" id="filmCard" style="display:none">
  <div class="head"><div class="label">The film</div><div class="dur" id="filmMeta"></div></div>
  <div id="filmBody"></div>
  <div class="row" id="filmActions" style="margin-top:10px"></div>
  <div class="bar" id="jobBar"><i id="jobFill"></i></div>
</div>
<p style="margin:18px 0 0"><a class="link" id="desktopLink" href="#">Open the desktop Studio (screenshots, editing)</a></p>
<input type="file" id="picker" accept="video/*">
<input type="file" id="evPicker" accept="image/*,video/*">
<input type="file" id="musicPicker" accept="audio/*">
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
  // The desktop Studio's links carry project + token and no tenant: the
  // token IS the tenant (a tenant-scoped JWT). Read it the same way here,
  // so one link opens Studio on any screen (measured live: "Missing
  // ?tenant= and ?project= in the link" on the phone).
  if (!tenant && token) {
    try {
      var seg = token.split('.')[1] || '';
      var pay = JSON.parse(atob(seg.replace(/-/g, '+').replace(/_/g, '/')));
      tenant = String(pay.tenant_id || pay.tenant || '');
    } catch (eTok) {}
  }
  $('filmsLink').href = '/library?tenant=' + encodeURIComponent(tenant) + (token ? '&token=' + encodeURIComponent(token) : '');
  if (!tenant || !project) { say(!project ? 'Missing ?project= in the link.' : 'Missing ?tenant= in the link (or a token that carries it).', true); return; }
  $('desktopLink').href = link('/studio', '&desktop=1');

  var P = null, RS = null, shareUrl = '', pickingScene = -1, jobTimer = null, editing = -1, pickingProof = null;
  // The proof a claim asked for (SPEC-creator-cut.md): every need on the
  // scene that is not the camera take, listed with its index for Upload.
  var EV_LABELS = { screenshot: 'Screenshot', screen_recording: 'Screen recording', stock_footage: 'B-roll', mockup: 'Product mock', illustration: 'Illustration' };
  // THE SOURCES (SPEC-briefs.md): each kind of need is collected its own
  // way, here on the card. Find (Pexels) and Draw (image generation) end
  // in the same write an upload makes (need-source -> provideAsset).
  var EV_SOURCES = { screen_recording: ['recorder'], screenshot: ['recorder'], stock_footage: ['find'], illustration: ['draw'], mockup: ['draw'] };
  var EV_SOURCE_LABELS = { find: 'Find b-roll', draw: 'Draw it', recorder: 'Recorder' };
  function tallFrame() { var f = String((P && P.treatment && P.treatment.frame) || '16x9'); return f === '9x16' || f === '4x5'; }
  function provideFrom(i, j, body, doneMsg) {
    say(body.source === 'draw' ? 'Drawing… (about half a minute)' : 'Fetching the clip…');
    return api('POST', '/need-source/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), Object.assign({ scene_index: i, asset_index: j }, body))
      .then(function (r) { say(doneMsg.replace(/ Rebuild to cut it in\\.$/, '') + (r && r.recast && r.recast.changed ? ' In the scene now.' : (r && r.recast ? ' Rebuild the scene to cast it.' : ' The build casts it.'))); return load(); })
      .catch(function (e) { say(e.message || String(e), true); });
  }
  function sourcePanel(row, src, i, j, need) {
    var old = row.querySelector('.src-panel');
    if (old) { var was = old.dataset.src; old.remove(); if (was === src) return; }
    var panel = document.createElement('div'); panel.className = 'src-panel'; panel.dataset.src = src;
    if (src === 'recorder') {
      panel.className += ' hint';
      panel.textContent = 'Pointing the Recorder at this slot\u2026';
      api('POST', '/arm-need/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), { scene_index: i, asset_index: j })
        .then(function () { panel.textContent = 'The Recorder is set to this slot. On your computer, open the Quotient Recorder on the page to record \u2014 it opens on this project, scene ' + (i + 1) + '. Record, stop, and it lands here.'; })
        .catch(function (e) { panel.textContent = 'On your computer, open the Quotient Recorder, pick this project under Save to and scene ' + (i + 1) + ' under For, then Record. (' + (e.message || e) + ')'; });
    } else if (src === 'draw') {
      var ta = document.createElement('textarea'); ta.value = need.description || ''; ta.placeholder = 'What to draw'; panel.appendChild(ta);
      var go = document.createElement('button'); go.className = 'btn small'; go.textContent = need.status === 'provided' ? 'Redraw' : 'Draw';
      go.onclick = function () { go.disabled = true; provideFrom(i, j, { source: 'draw', prompt: ta.value.trim() || undefined }, 'Drawn for scene ' + (i + 1) + '. Rebuild to cut it in.'); };
      panel.appendChild(go);
    } else {
      var srch = document.createElement('div'); srch.className = 'row';
      var q = document.createElement('input'); q.type = 'text'; q.value = need.description || ''; q.placeholder = 'Search b-roll';
      var sb = document.createElement('button'); sb.className = 'btn small'; sb.textContent = 'Search';
      srch.appendChild(q); srch.appendChild(sb); panel.appendChild(srch);
      var grid = document.createElement('div'); grid.className = 'src-grid'; panel.appendChild(grid);
      var tall = tallFrame();
      function search() {
        if (!q.value.trim()) return;
        grid.textContent = 'Searching\u2026';
        api('GET', '/stock-search/' + encodeURIComponent(tenant) + '?q=' + encodeURIComponent(q.value.trim()) + '&orientation=' + (tall ? 'portrait' : 'landscape'))
          .then(function (r) {
            var hits = (r && r.results) || [];
            grid.textContent = hits.length ? '' : 'Nothing found. Try other words.';
            hits.forEach(function (c) {
              var d = document.createElement('div'); d.className = 'cand' + (tall ? ' tall' : '');
              var im = document.createElement('img'); im.src = c.image || ''; im.alt = ''; d.appendChild(im);
              var dur = document.createElement('small'); dur.textContent = Math.round(c.duration || 0) + 's'; d.appendChild(dur);
              d.onclick = function () { d.style.opacity = '.5'; provideFrom(i, j, { source: 'find', pick_id: c.id }, 'B-roll picked for scene ' + (i + 1) + '. Rebuild to cut it in.'); };
              grid.appendChild(d);
            });
          })
          .catch(function (e) { grid.textContent = e.message || String(e); });
      }
      sb.onclick = search; q.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); search(); } };
      search();
    }
    row.appendChild(panel);
  }
  function proofOf(scene) {
    var out = [];
    (scene.assets || []).forEach(function (x, j) { if (x && x.type !== 'camera_video') out.push({ need: x, index: j }); });
    return out;
  }
  function openProof(scenes) {
    var n = 0;
    scenes.forEach(function (s) { proofOf(s).forEach(function (p) { if (p.need.status === 'needed') n++; }); });
    return n;
  }

  var muAudio = null, muOpen = false, muQ = '';
  function muStop() { if (muAudio) { try { muAudio.pause(); } catch (e) {} muAudio = null; } }
  function muFmt(sec) { sec = Math.round(Number(sec) || 0); return sec ? Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') : ''; }
  function muSet(body, doneMsg) {
    muStop(); say('Setting the music\u2026');
    return api('POST', '/music/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), body)
      .then(function () { say(doneMsg); muOpen = false; return load(); })
      .catch(function (e) { say(e.message || String(e), true); });
  }
  function musicBox() {
    var box = document.createElement('div'); box.className = 'music';
    var lead = document.createElement('div'); lead.className = 'lead'; lead.textContent = 'Music'; box.appendChild(lead);
    var now = document.createElement('div'); now.className = 'now';
    var c = P.music || { source: 'auto' };
    var bed = ((P.audio && P.audio.tracks) || []).filter(function (t) { return t.type === 'music'; })[0];
    var what, how;
    if (c.source === 'none') { what = 'No music'; how = 'the film ships without a bed'; }
    else if (!c.source || c.source === 'auto') { what = bed ? 'Picked by the build' : 'The build picks a track'; how = 'by the storyboard\u2019s mood' + (bed ? ' \u00b7 ' + (bed.source || '').split('/').pop() : ''); }
    else { what = c.title || (c.path || '').split('/').pop() || 'Chosen track'; how = 'chosen \u00b7 ' + ({ 'brand-kit': 'your brand kit', stock: 'the library', jamendo: 'Jamendo', upload: 'uploaded' }[c.source] || c.source) + (c.artist ? ' \u00b7 ' + c.artist : '') + ' \u00b7 the build keeps it'; }
    now.textContent = what; var sm = document.createElement('small'); sm.textContent = how; now.appendChild(sm); box.appendChild(now);
    var row = document.createElement('div'); row.className = 'row';
    var pick = document.createElement('button'); pick.className = 'btn small'; pick.textContent = muOpen ? 'Close' : 'Pick'; pick.onclick = function () { muOpen = !muOpen; muStop(); render(); };
    var up = document.createElement('button'); up.className = 'btn small ghost'; up.textContent = 'Upload'; up.onclick = function () { $('musicPicker').value = ''; $('musicPicker').click(); };
    row.appendChild(pick); row.appendChild(up);
    if (c.source !== 'none') { var none = document.createElement('button'); none.className = 'btn small ghost'; none.textContent = 'None'; none.onclick = function () { muSet({ source: 'none' }, 'No music bed.'); }; row.appendChild(none); }
    if (c.source && c.source !== 'auto') { var auto = document.createElement('button'); auto.className = 'btn small ghost'; auto.textContent = 'Let the build pick'; auto.onclick = function () { muSet({ source: 'auto' }, 'The build picks by mood again.'); }; row.appendChild(auto); }
    box.appendChild(row);
    if (muOpen) {
      var srch = document.createElement('div'); srch.className = 'search';
      var q = document.createElement('input'); q.type = 'text'; q.placeholder = 'Search Jamendo by mood or words'; q.value = muQ;
      var sb = document.createElement('button'); sb.className = 'btn small'; sb.textContent = 'Search';
      srch.appendChild(q); srch.appendChild(sb); box.appendChild(srch);
      var list = document.createElement('div'); list.textContent = 'Loading\u2026'; box.appendChild(list);
      function loadList() {
        muQ = q.value.trim();
        api('GET', '/music-options/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + (muQ ? '?q=' + encodeURIComponent(muQ) : ''))
          .then(function (r) {
            list.innerHTML = '';
            [['Your tracks', r.brand || []], ['Library', r.stock || []], ['Jamendo' + (r.jamendo_configured ? '' : ' (not configured)'), r.jamendo || []]].forEach(function (g) {
              if (!g[1].length && g[0].indexOf('Jamendo') !== 0) return;
              var gh = document.createElement('div'); gh.className = 'group'; gh.textContent = g[0]; list.appendChild(gh);
              if (!g[1].length) { var e = document.createElement('div'); e.className = 'note'; e.textContent = 'Nothing here yet.'; list.appendChild(e); }
              g[1].forEach(function (t) {
                var tr = document.createElement('div'); tr.className = 'tr';
                var pl = document.createElement('button'); pl.className = 'btn small ghost'; pl.textContent = '\u25b6';
                pl.onclick = function () { if (muAudio && muAudio.dataset.src === t.preview_url) { muStop(); pl.textContent = '\u25b6'; return; } muStop(); if (!t.preview_url) return; muAudio = new Audio(withToken(t.preview_url)); muAudio.dataset.src = t.preview_url; muAudio.volume = 0.6; muAudio.play().catch(function () {}); pl.textContent = '\u25a0'; };
                var tt = document.createElement('div'); tt.className = 't'; tt.textContent = t.title; var ts = document.createElement('small'); ts.textContent = (t.artist || '') + (t.duration ? ' \u00b7 ' + muFmt(t.duration) : ''); tt.appendChild(ts);
                var use = document.createElement('button'); use.className = 'btn small'; use.textContent = 'Use';
                use.onclick = function () { use.disabled = true; muSet({ source: t.source, id: t.id, title: t.title, artist: t.artist, license: t.license, duration: t.duration, download_url: t.download_url }, '\u201c' + t.title + '\u201d is the bed now.'); };
                tr.appendChild(pl); tr.appendChild(tt); tr.appendChild(use); list.appendChild(tr);
              });
            });
          })
          .catch(function (e) { list.textContent = e.message || String(e); });
      }
      sb.onclick = loadList; q.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); loadList(); } };
      loadList();
    }
    return box;
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

    // Needed from you: the takes and the proof, counted across the film,
    // before a single card -- the list of what to make, not a note per card.
    var nd = $('needs'); nd.innerHTML = '';
    var takesTotal = 0, takesOpen = 0, proofTotal = 0, proofOpen = 0, proofKinds = {};
    scenes.forEach(function (s) {
      var n = needOf(s); if (n) { takesTotal++; if (n.status === 'needed') takesOpen++; }
      proofOf(s).forEach(function (p) { proofTotal++; if (p.need.status === 'needed') proofOpen++; var k = EV_LABELS[p.need.type] || p.need.type; proofKinds[k] = (proofKinds[k] || 0) + 1; });
    });
    // THE MUSIC CHOICE (SPEC-briefs.md, the sources): the film's bed is a
    // need like any other -- pick, upload, or none -- here at the top.
    if ((P.format || 'video') === 'video') nd.appendChild(musicBox());
    if (takesTotal || proofTotal) {
      var box = document.createElement('div'); box.className = 'needs';
      var lead = document.createElement('div'); lead.className = 'lead'; lead.textContent = 'Needed from you'; box.appendChild(lead);
      if (takesTotal) {
        var lt = document.createElement('div'); lt.className = 'line' + (takesOpen ? '' : ' done');
        lt.innerHTML = '<span>' + takesTotal + (takesTotal === 1 ? ' camera take' : ' camera takes') + ' \u00b7 record here</span><span class="n">' + (takesOpen ? takesOpen + ' to go' : 'all in') + '</span>';
        box.appendChild(lt);
      }
      Object.keys(proofKinds).forEach(function (k) {
        var openK = 0; scenes.forEach(function (s) { proofOf(s).forEach(function (p) { if ((EV_LABELS[p.need.type] || p.need.type) === k && p.need.status === 'needed') openK++; }); });
        var lp = document.createElement('div'); lp.className = 'line' + (openK ? '' : ' done');
        lp.innerHTML = '<span>' + proofKinds[k] + ' ' + k.toLowerCase() + (proofKinds[k] === 1 ? '' : 's') + '</span><span class="n">' + (openK ? openK + ' to go' : 'all in') + '</span>';
        box.appendChild(lp);
      });
      if (proofTotal) { var pn = document.createElement('div'); pn.className = 'note'; pn.textContent = 'Proof is listed under each scene. Upload here, or from the desktop Studio where the screenshots are. The film builds without it.'; box.appendChild(pn); }
      nd.appendChild(box);
    }

    var top = $('topActions'); top.innerHTML = '';
    // WATCH and SHARE sit at the top: the film card is at the bottom of a
    // long page, and on a phone watching is the first thing you want.
    if (RS && RS.rendered) {
      var watch = document.createElement('button'); watch.className = 'btn'; watch.textContent = 'Watch';
      watch.onclick = function () {
        var fv = $('filmVideo'); if (!fv) return;
        $('filmCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
        var pr = fv.play(); if (pr && pr.catch) pr.catch(function () {});
      };
      top.appendChild(watch);
      var shareB = document.createElement('button'); shareB.className = 'btn ghost'; shareB.textContent = 'Share';
      shareB.onclick = function () { shareFilm(shareB); };
      top.appendChild(shareB);
    }
    if (speaker && (P.scenes || []).length) {
      var castB = document.createElement('button'); castB.className = 'btn small' + (C.open ? '' : ' ghost'); castB.textContent = 'Cast';
      castB.onclick = castToggle;
      top.appendChild(castB);
    }
    var teamA = document.createElement('a'); teamA.className = 'btn small'; teamA.textContent = 'Team';
    teamA.href = '/team?tenant=' + encodeURIComponent(tenant) + (token ? '&token=' + encodeURIComponent(token) : '');
    top.appendChild(teamA);
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
      var evs = proofOf(s);
      if (evs.length) {
        var proof = document.createElement('div'); proof.className = 'proof';
        var lead = document.createElement('div'); lead.className = 'lead'; lead.textContent = 'The proof this claim wants'; proof.appendChild(lead);
        evs.forEach(function (pf) {
          var need = pf.need, j = pf.index, have = need.status === 'provided' && need.path;
          var row = document.createElement('div'); row.className = 'ev';
          if (have) {
            var th = /\\.(mp4|webm|mov|m4v)(\\?|$)/i.test(need.path) ? document.createElement('video') : document.createElement('img');
            th.src = withToken(need.path); if (th.tagName === 'VIDEO') { th.muted = true; th.playsInline = true; th.preload = 'metadata'; }
            row.appendChild(th);
          }
          var what = document.createElement('div'); what.className = 'what';
          what.textContent = need.description || '';
          var kind = document.createElement('small');
          kind.textContent = (EV_LABELS[need.type] || need.type) + (need.use === 'card' ? ' · card' : ' · cutaway') + (have ? ' · provided' : need.priority === 'nice_to_have' ? ' · optional' : ' · needed');
          what.appendChild(kind); row.appendChild(what);
          var acts = document.createElement('div'); acts.className = 'acts';
          (EV_SOURCES[need.type] || []).forEach(function (src) {
            var b = document.createElement('button'); b.className = 'btn small';
            b.textContent = have && src === 'find' ? 'Find another' : (have && src === 'draw' ? 'Redraw' : EV_SOURCE_LABELS[src]);
            b.onclick = function () { sourcePanel(row, src, i, j, need); };
            acts.appendChild(b);
          });
          var evUp = document.createElement('button'); evUp.className = 'btn small ghost'; evUp.textContent = have ? 'Replace' : 'Upload';
          evUp.onclick = function () { pickingProof = { scene: i, index: j }; $('evPicker').value = ''; $('evPicker').click(); };
          acts.appendChild(evUp); row.appendChild(acts); proof.appendChild(row);
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
    // The player follows the FILE, not P.status: any edit after a render
    // moves the status on, and the film was still there to watch.
    if (RS && RS.rendered) {
      var v = document.createElement('video'); v.id = 'filmVideo'; v.controls = true; v.playsInline = true; v.preload = 'metadata';
      v.src = withToken(RS.output_url + '?v=' + encodeURIComponent(RS.completed_at || ''));
      body.appendChild(v);
      var when = document.createElement('div'); when.className = RS.stale ? 'stale' : 'meta';
      when.textContent = 'Rendered ' + ago(RS.completed_at) + (RS.stale ? ' \u00b7 edited since; render again to include the edits.' : '');
      body.appendChild(when);
    } else {
      var hint = document.createElement('div'); hint.className = 'meta';
      var proofOpen = openProof(scenes);
      hint.textContent = open.length ? (open.length + ' scene' + (open.length === 1 ? ' still needs' : 's still need') + ' a take before the film can be built.')
        : built ? 'Scenes are built. Preview plays them now; render for an MP4 to share.' : 'Every take is in. Build the scenes, then render.';
      if (proofOpen && !open.length) hint.textContent += ' ' + proofOpen + ' piece' + (proofOpen === 1 ? '' : 's') + ' of proof still to upload; the build runs without ' + (proofOpen === 1 ? 'it' : 'them') + '.';
      body.appendChild(hint);
    }
    var fa = $('filmActions'); fa.innerHTML = '';
    var build = document.createElement('button'); build.className = 'btn' + (built ? ' ghost' : ''); build.textContent = built ? 'Rebuild scenes' : 'Build the film';
    build.disabled = open.length > 0 || !!jobTimer; build.onclick = function () { startJob('build'); };
    var rend = document.createElement('button'); rend.className = 'btn' + (built ? '' : ' ghost'); rend.textContent = 'Render';
    rend.disabled = !built || !!jobTimer; rend.onclick = function () { startJob('render'); };
    if (built) {
      // PREVIEW: the built film played live, no render -- the Studio's own
      // player in watch mode (full screen, nothing to edit).
      var prev = document.createElement('a'); prev.className = 'btn ghost'; prev.textContent = 'Preview';
      prev.href = link('/studio', '&desktop=1&view=watch');
      fa.appendChild(prev); fa.appendChild(rend);
      build.className = 'btn small ghost'; build.style.flexBasis = '100%';
      fa.appendChild(build);
    } else {
      fa.appendChild(build); fa.appendChild(rend);
    }
  }

  function load() {
    var tp = encodeURIComponent(tenant) + '/' + encodeURIComponent(project);
    var rs = api('GET', '/render-status/' + tp).catch(function () { return null; });
    var sh = api('GET', '/share/' + tp).catch(function () { return null; });
    return api('GET', '/projects/' + tp)
      .then(function (p) { return Promise.all([rs, sh]).then(function (r) {
        P = p; RS = r[0]; shareUrl = currentShare(r[1] && r[1].shares);
        // A render already running (a reload, the desktop, the agent): follow it.
        if (RS && RS.active_job && !jobTimer) pollJob(RS.active_job.id, 'render');
        render();
      }); })
      .catch(function (e) { say(e.message || String(e), true); });
  }
  function ago(iso) {
    var t = Date.parse(iso || ''); if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString();
  }
  // A link already made from THIS render is reused; a link to an older
  // render is not (a share is a snapshot of the render it was made from).
  function currentShare(list) {
    var at = Date.parse((RS && RS.completed_at) || '');
    var hit = (list || []).filter(function (x) { return at && Math.abs(Date.parse(x.rendered_at) - at) < 2000; })[0];
    return hit ? hit.url : '';
  }
  // Share: the phone's own share sheet (Messages, Slack, Mail) with the
  // /watch link -- it plays in any browser, no login, full quality.
  // A known link shares at once (the share sheet needs the tap's
  // activation); a new one is made first, and if the browser refuses the
  // late sheet, the link is copied and the next tap shares it.
  function shareFilm(btn) {
    var title = P.name || 'A film';
    function hand(url) {
      if (navigator.share) {
        return navigator.share({ title: title, url: url }).then(function () { say(''); }).catch(function (e) {
          if (e && e.name === 'AbortError') return;
          copy(url, 'Link ready: ' + url + ' \u2014 tap Share again to send it.');
        });
      }
      copy(url, 'Link copied: ' + url);
    }
    function copy(url, msg) {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { say(msg); }, function () { say(msg.replace('Link copied', 'Your link')); });
      else say(msg.replace('Link copied', 'Your link'));
    }
    if (shareUrl) return hand(shareUrl);
    btn.disabled = true; say('Making a link\u2026');
    api('POST', '/share/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), { title: title })
      .then(function (r) { btn.disabled = false; shareUrl = r.url; hand(r.url); })
      .catch(function (e) { btn.disabled = false; say(e.message || String(e), true); });
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

  // ── upload a music bed ──
  $('musicPicker').addEventListener('change', function () {
    var f = $('musicPicker').files && $('musicPicker').files[0]; if (!f) return;
    var ext = (f.name.split('.').pop() || 'mp3').toLowerCase();
    var name = 'music-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/upload-asset/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + '?name=' + encodeURIComponent(name)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) say('Uploading the track\u2026 ' + Math.round((e.loaded / e.total) * 100) + '%'); };
    xhr.onerror = function () { say('Upload failed (network).', true); };
    xhr.onload = function () {
      var up; try { up = JSON.parse(xhr.responseText); } catch (e) { up = {}; }
      if (xhr.status < 200 || xhr.status >= 300 || !up.url) { say('Upload failed: ' + (up.error || ('HTTP ' + xhr.status)), true); return; }
      muSet({ source: 'upload', url: up.url, title: f.name.replace(/\.[^.]+$/, '') }, '\u201c' + f.name + '\u201d is the bed now.');
    };
    xhr.send(f);
  });

  // ── upload a piece of evidence for one claim ──
  $('evPicker').addEventListener('change', function () {
    var f = $('evPicker').files && $('evPicker').files[0]; if (!f || !pickingProof) return;
    var i = pickingProof.scene, j = pickingProof.index; pickingProof = null;
    var ext = (f.name.split('.').pop() || 'png').toLowerCase();
    var name = 'proof-' + new Date().toISOString().replace(/[:.]/g, '-') + '-scene' + (i + 1) + '-' + (j + 1) + '.' + ext;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/upload-asset/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + '?name=' + encodeURIComponent(name)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = function (e) { if (e.lengthComputable) say('Uploading proof for scene ' + (i + 1) + '… ' + Math.round((e.loaded / e.total) * 100) + '%'); };
    xhr.onerror = function () { say('Upload failed (network).', true); };
    xhr.onload = function () {
      var up; try { up = JSON.parse(xhr.responseText); } catch (e) { up = {}; }
      if (xhr.status < 200 || xhr.status >= 300 || !up.url) { say('Upload failed: ' + (up.error || ('HTTP ' + xhr.status)), true); return; }
      api('POST', '/provide-asset/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project), { url: up.url, scene_index: i, asset_index: j })
        .then(function (r) { say('Scene ' + (i + 1) + ' proof ' + (j + 1) + ' attached.' + (r && r.recast && r.recast.changed ? ' In the scene now.' : '')); return load(); })
        .catch(function (e) { say(e.message || String(e), true); });
    };
    xhr.send(f);
  });

  // ── CAST (the desktop Studio's Cast card, compact) ──
  // Who performs the person: you, your recording recast as an actor
  // through a vendor, or a take generated from the script. Opened from the
  // top row; progress polled while it runs.
  var C = { open: false, data: null, voices: null, mode: 'recast', actor: null, performer: null, voice: '', copy: true, timer: null, looks: null, adding: false };
  function castTP() { return encodeURIComponent(tenant) + '/' + encodeURIComponent(project); }
  function castHasTake() { return !!(P && P.takes && P.takes.length); }
  function castRunning() { var d = C.data; return !!(d && ((d.recast && d.recast.status === 'running') || (d.gen && d.gen.status === 'running'))); }
  function castActor(id) { return C.data ? C.data.cast.filter(function (a) { return a.id === id; })[0] : null; }
  function castPerf(id) { return C.data ? C.data.performers.filter(function (p) { return p.id === id; })[0] : null; }
  function castPick() {
    var ok = function (p) { return p && p.available && (C.mode !== 'generate' || p.generate); };
    if (ok(castPerf(C.performer))) return;
    var a = castActor(C.actor);
    var order = (a && a.heygen_look_id) || C.mode === 'generate' ? ['heygen', 'kling', 'runway', 'higgsfield'] : ['kling', 'higgsfield', 'heygen', 'runway'];
    C.performer = null;
    for (var i = 0; i < order.length; i++) if (ok(castPerf(order[i]))) { C.performer = order[i]; break; }
  }
  function castLoad() {
    return Promise.all([
      api('GET', '/cast/' + encodeURIComponent(tenant)),
      api('GET', '/recast/' + castTP()),
      api('GET', '/generated-take/' + castTP()).catch(function () { return {}; }),
      C.voices ? Promise.resolve(C.voices) : api('GET', '/cast/' + encodeURIComponent(tenant) + '/voices').catch(function () { return { elevenlabs: [], heygen: [] }; }),
    ]).then(function (r) {
      C.data = { cast: r[0].cast || [], performers: r[0].performers || [], speaker_cast: r[1].speaker_cast || null, recast: r[1].recast || null, gen: r[2].generated_take || null };
      C.voices = r[3];
      if (C.actor && !castActor(C.actor)) C.actor = null;
      if (!C.actor && C.data.cast.length) C.actor = castActor(C.data.speaker_cast) ? C.data.speaker_cast : C.data.cast[0].id;
      if (!castHasTake()) C.mode = 'generate';
      castPick(); castRender();
      if (castRunning()) castPoll();
    }).catch(function (e) { say(e.message || String(e), true); });
  }
  function castRender() {
    var box = $('cast'); if (!box) return;
    if (!C.open) { box.innerHTML = ''; return; }
    var d = C.data;
    if (!d) { box.innerHTML = '<div class="music"><div class="now">Loading the cast…</div></div>'; return; }
    var h = '<div class="music cast">';
    var now = castActor(d.speaker_cast);
    h += '<div class="now">' + (now ? 'Performed by <b>' + esc(now.name) + '</b>' : (castHasTake() ? 'Performed by <b>you</b> (your recording)' : 'No take yet')) + '<small>Your recording is never changed; Back to me puts it back.</small></div>';
    if (d.speaker_cast) h += '<div class="row"><button class="btn small ghost" data-c="me">Back to me</button></div>';
    if (castRunning()) {
      var job = d.recast && d.recast.status === 'running' ? d.recast : d.gen, f = job.files && job.files[0];
      h += '<div class="meta">' + (job === d.gen ? 'Generating the take' : 'Recasting') + ' as ' + esc((castActor(job.actor) || {}).name || job.actor) + ' — ' + esc((f && f.stage) || job.stage || 'starting') + (f && f.chunks_total ? ' · ' + f.chunks_done + ' of ' + f.chunks_total : '') + '</div>';
    } else if (d.recast && d.recast.status === 'failed') h += '<div class="meta">Last recast failed: ' + esc(d.recast.error || '') + '</div>';
    else if (d.gen && d.gen.status === 'failed') h += '<div class="meta">Last generated take failed: ' + esc(d.gen.error || '') + '</div>';
    h += '<div class="row"><button class="btn small' + (C.mode === 'recast' ? '' : ' ghost') + '" data-c="mode:recast"' + (castHasTake() ? '' : ' disabled') + '>Recast my recording</button>'
      + '<button class="btn small' + (C.mode === 'generate' ? '' : ' ghost') + '" data-c="mode:generate">From the script</button></div>';
    h += '<div class="group">Actor</div><div class="castrow">';
    d.cast.forEach(function (a) {
      h += '<button class="castpic' + (a.id === C.actor ? ' sel' : '') + '" data-c="actor:' + esc(a.id) + '"><img src="' + esc(withToken('/api/cast/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(a.id) + '/portrait')) + '" alt=""><span>' + esc(a.name) + '</span></button>';
    });
    h += '<button class="castpic add" data-c="add"><span>+ Look</span></button></div>';
    if (C.adding) {
      if (!C.looks) { h += '<div class="meta">Loading your HeyGen looks…</div>'; castLooks(); }
      else if (!C.looks.length) h += '<div class="meta">No looks on your HeyGen account. Add actors in the desktop Studio.</div>';
      else {
        h += '<div class="castrow">';
        C.looks.forEach(function (l) { h += '<button class="castpic" data-c="look:' + esc(l.id) + '">' + (l.preview ? '<img src="' + esc(l.preview) + '" alt="">' : '') + '<span>' + esc(l.name || l.id) + '</span></button>'; });
        h += '</div>';
      }
    }
    h += '<div class="group">Performed by</div><select id="castPerf">';
    d.performers.forEach(function (p) {
      var usable = p.available && (C.mode !== 'generate' || p.generate);
      h += '<option value="' + esc(p.id) + '"' + (p.id === C.performer ? ' selected' : '') + (usable ? '' : ' disabled') + '>' + esc(p.label) + (usable ? '' : (p.available ? ' (recordings only)' : ' (not set up)')) + '</option>';
    });
    h += '</select>';
    var perf = castPerf(C.performer);
    if (perf) h += '<div class="meta">' + esc(perf.keeps) + '. ' + esc(perf.limits) + ' · ~' + perf.minutesPer30s + ' min per 30 s</div>';
    h += '<div class="group">Voice</div><select id="castVoice">' + castVoiceOpts() + '</select>';
    if (C.mode === 'generate') h += '<label class="meta"><input type="checkbox" id="castCopy"' + (C.copy ? ' checked' : '') + ' style="display:inline"> Make a copy of this film first (a generated take replaces this film’s take)</label>';
    var a = castActor(C.actor);
    var can = a && perf && !castRunning() && (C.mode !== 'recast' || castHasTake()) && (C.mode !== 'generate' || C.voice);
    h += '<div class="row"><button class="btn" data-c="go"' + (can ? '' : ' disabled') + '>' + (C.mode === 'recast' ? 'Recast as ' + esc(a ? a.name : '…') : 'Generate the take') + '</button></div>';
    box.innerHTML = h + '</div>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function castVoiceOpts() {
    var v = C.voices || { elevenlabs: [], heygen: [] }, a = castActor(C.actor), o = '';
    var opt = function (val, label) { return '<option value="' + esc(val) + '"' + (val === C.voice ? ' selected' : '') + '>' + esc(label) + '</option>'; };
    if (C.mode === 'recast') { if (C.voice && C.voice.indexOf('eleven:') !== 0) C.voice = ''; o += opt('', 'My recorded voice'); }
    else {
      if (!C.voice) C.voice = a && a.heygen_look_id ? 'look' : ((v.heygen && v.heygen[0]) ? 'heygen:' + v.heygen[0].id : '');
      if (a && a.heygen_look_id) o += opt('look', 'The look’s own HeyGen voice');
      (v.heygen || []).forEach(function (x) { o += opt('heygen:' + x.id, 'HeyGen · ' + x.name); });
    }
    (v.elevenlabs || []).forEach(function (x) { o += opt('eleven:' + x.id, 'ElevenLabs · ' + x.name); });
    return o;
  }
  function castLooks() {
    api('GET', '/heygen-avatars/' + encodeURIComponent(tenant) + '?looks=1').then(function (r) {
      C.looks = (r.looks || []).filter(function (l) { return !l.status || l.status === 'completed'; }); castRender();
    }).catch(function (e) { C.looks = []; castRender(); say(e.message || String(e), true); });
  }
  function castTap(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-c]') : null; if (!b) return;
    var c = b.getAttribute('data-c'), arg = c.slice(c.indexOf(':') + 1);
    if (c === 'me') {
      api('POST', '/recast/' + castTP(), { actor: null }).then(function () { say('Back to you: your recording performs again.'); castLoad(); load(); }).catch(function (e) { say(e.message || String(e), true); });
    } else if (c.indexOf('mode:') === 0) { C.mode = arg; C.voice = ''; castPick(); castRender(); }
    else if (c.indexOf('actor:') === 0) { C.actor = arg; C.voice = ''; C.performer = null; C.adding = false; castPick(); castRender(); }
    else if (c === 'add') { C.adding = !C.adding; castRender(); }
    else if (c.indexOf('look:') === 0) {
      say('Adding the look…');
      api('POST', '/cast/' + encodeURIComponent(tenant), { heygen_look_id: arg }).then(function (a) { C.actor = a.id; C.adding = false; C.performer = null; say(a.name + ' is in the cast.'); castLoad(); })
        .catch(function (e) { say(e.message || String(e), true); });
    } else if (c === 'go') castGo();
  }
  function castChange(ev) {
    var t = ev.target;
    if (t.id === 'castPerf') { C.performer = t.value; castRender(); }
    else if (t.id === 'castVoice') { C.voice = t.value; castRender(); }
    else if (t.id === 'castCopy') { C.copy = !!t.checked; }
  }
  function castGo() {
    var a = castActor(C.actor), p = castPerf(C.performer); if (!a || !p) return;
    if (C.mode === 'recast') {
      say('Starting the recast…');
      api('POST', '/recast/' + castTP(), { actor: a.id, performer: p.id, voice_id: C.voice.indexOf('eleven:') === 0 ? C.voice.slice(7) : 'mine' })
        .then(function (st) { C.data.recast = st; say('Recasting as ' + a.name + ' with ' + p.label + '.'); castRender(); castPoll(); })
        .catch(function (e) { say(e.message || String(e), true); });
      return;
    }
    var body = { actor: a.id, performer: p.id, voice: C.voice.indexOf('eleven:') === 0 ? 'elevenlabs' : 'heygen' };
    if (C.voice !== 'look') body.voice_id = C.voice.slice(C.voice.indexOf(':') + 1);
    var start = function (pid) { return api('POST', '/generated-take/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(pid), body); };
    if (C.copy) {
      say('Copying the film…');
      api('POST', '/projects/' + castTP() + '/duplicate', { name: (P.name || 'Film') + ' (generated take)' }).then(function (cp) {
        return start(cp.project_id).then(function () {
          // Follow the copy: its Studio shows the take as it lands.
          location.href = '/studio?tenant=' + encodeURIComponent(tenant) + '&project=' + encodeURIComponent(cp.project_id) + (token ? '&token=' + encodeURIComponent(token) : '') + '&cast=1';
        });
      }).catch(function (e) { say(e.message || String(e), true); });
      return;
    }
    say('Generating the take…');
    start(project).then(function (st) { C.data.gen = st; castRender(); castPoll(); }).catch(function (e) { say(e.message || String(e), true); });
  }
  function castPoll() {
    if (C.timer) clearTimeout(C.timer);
    C.timer = setTimeout(function () {
      C.timer = null;
      var was = castRunning();
      Promise.all([api('GET', '/recast/' + castTP()), api('GET', '/generated-take/' + castTP()).catch(function () { return {}; })]).then(function (r) {
        C.data.speaker_cast = r[0].speaker_cast || null; C.data.recast = r[0].recast || null; C.data.gen = r[1].generated_take || null;
        castRender();
        if (castRunning()) { castPoll(); return; }
        if (was) { say((C.data.recast && C.data.recast.status === 'failed') || (C.data.gen && C.data.gen.status === 'failed') ? 'The cast failed — see the Cast card.' : 'Cast: done. Render when you are ready.', false); load(); }
      }).catch(function () { castPoll(); });
    }, 4000);
  }
  function castToggle() { C.open = !C.open; castRender(); if (C.open) { castLoad(); $('cast').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  $('cast').addEventListener('click', castTap);
  $('cast').addEventListener('change', castChange);
  // Opened with &cast=1 (following a copy a generated take runs on): the card open.
  if (qp.get('cast')) { C.open = true; castLoad(); }

  // Coming back from the booth: reload so the card shows the new take.
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !jobTimer) load(); });
  load();
})();
</script>
</body>
</html>`;
}
