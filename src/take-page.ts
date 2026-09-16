/**
 * The take page -- served at /take?tenant=&project=&token=.
 *
 * Open it on a phone and it IS the booth for a speaker film: the storyboard's
 * script (voiceover_text, beat by beat) as a teleprompter over the front
 * camera, a level meter so a silent take is visible while you are still
 * talking, record / review / retake, and an upload that attaches the take to
 * the project as its speaker base. The operator never touches a file.
 *
 * This is Phase 2's front door (SPEC-format-and-spine.md): the storyboard's
 * ASSERTED spine -- her lines, her estimated durations -- driving the
 * prompter. Re-timing the board to the delivered take (the MEASURED spine)
 * is the step after this one and belongs behind a button on this page.
 *
 * Why a page and not the extension: the extension films a browser tab with
 * the camera as a bubble -- a 16:9 webcam shot, the wrong shape for a Reel.
 * A phone's front camera is native 9:16 (measured: 1080x1920, no crop).
 *
 * Auth: reads ?tenant= ?project= ?token= from its own URL (the tenant-scoped
 * Studio token) and forwards the token on every request. The shell itself is
 * behind the auth middleware, so a link without a valid token gets a 401.
 */
export function getTakeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0e0e14">
<link rel="icon" href="data:,">
<title>Record a take · Media Studio</title>
<style>
  :root { --bg:#0e0e14; --panel:#17171f; --ink:#f4f4f8; --muted:#9a9aad; --line:#26262f;
    --accent:#393bf5; --ok:#22c55e; --err:#ef4444; --warn:#f59e0b; }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--ink);
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; -webkit-font-smoothing:antialiased;
    overscroll-behavior:none; }
  body { display:flex; flex-direction:column; min-height:100dvh; }
  section { display:none; flex:1; flex-direction:column; }
  section.on { display:flex; }
  /* The ready screen never scrolls: a long script (record-all) scrolls
     INSIDE its card and the Record button stays in reach (Marc: "scroll
     all the way down, hit record, then scroll all the way back"). */
  #ready { height:100dvh; overflow:hidden; }
  #script { flex:0 1 auto; max-height:44dvh; overflow-y:auto; -webkit-overflow-scrolling:touch; }
  .pad { padding: calc(16px + env(safe-area-inset-top)) 18px calc(16px + env(safe-area-inset-bottom)); }
  h1 { font-size:20px; font-weight:600; letter-spacing:-.02em; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:13px; margin:0 0 18px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:18px; }
  .beat { font-size:19px; line-height:1.45; margin:0 0 14px; white-space:pre-line; }
  .beat b { color:var(--muted); font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; display:block; margin-bottom:4px; }
  .note { color:var(--muted); font-size:13px; line-height:1.5; }
  .btn { appearance:none; border:0; border-radius:14px; padding:16px 20px; font:inherit; font-size:17px; font-weight:600;
    color:#fff; background:var(--accent); width:100%; cursor:pointer; }
  .btn.ghost { background:transparent; border:1px solid var(--line); color:var(--ink); }
  a.link { color:var(--muted); font-size:14px; text-decoration:none; }
  .toggle { display:flex; gap:10px; align-items:flex-start; color:var(--ink); font-size:15px; margin:10px 0 14px; }
  .toggle input { width:20px; height:20px; margin-top:1px; }
  .toggle .hint { color:var(--muted); font-size:13px; }
  .btn.stop { background:var(--err); }
  .btn:disabled { opacity:.45; }
  .row { display:flex; gap:10px; margin-top:12px; }
  .row .btn { flex:1; }
  .spacer { flex:1; }

  /* ── stage: camera full-bleed, prompter over it ── */
  /* The stage owns the viewport wherever the page was scrolled. */
  #stage { position:fixed; inset:0; z-index:5; background:#000; }
  #live { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scaleX(-1); }
  #cap { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  #veil { position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.45) 26%, rgba(0,0,0,0) 42%, rgba(0,0,0,0) 70%, rgba(0,0,0,.6) 100%); pointer-events:none; }
  #top { position:absolute; left:0; right:0; top:0; padding: calc(12px + env(safe-area-inset-top)) 16px 0; display:flex; align-items:center; gap:10px; }
  #timer { font-variant-numeric:tabular-nums; font-weight:600; font-size:15px; }
  #timer.rec::before { content:''; display:inline-block; width:10px; height:10px; border-radius:50%; background:var(--err); margin-right:8px; animation:blink 1s infinite; }
  @keyframes blink { 50% { opacity:.25; } }
  #meterWrap { flex:1; height:6px; border-radius:3px; background:rgba(255,255,255,.18); overflow:hidden; }
  #meter { height:100%; width:0%; background:var(--ok); transition:width .08s linear; }
  #meterWrap.silent #meter { background:var(--err); }
  #silent { position:absolute; left:16px; right:16px; top: calc(44px + env(safe-area-inset-top)); font-size:13px; color:#fff; background:rgba(239,68,68,.9);
    padding:8px 12px; border-radius:10px; display:none; }
  #count { position:absolute; inset:0; display:none; align-items:center; justify-content:center; font-size:140px; font-weight:700; color:#fff; text-shadow:0 8px 40px rgba(0,0,0,.6); }
  /* The prompter sits at the TOP, under the timer, next to the lens: read
     from the bottom, the eyes look down in every take (Marc). */
  #prompt { position:absolute; left:0; right:0; top: calc(64px + env(safe-area-inset-top)); padding:0 22px; text-align:center; }
  #cue { font-size:30px; line-height:1.28; font-weight:600; color:#fff; text-shadow:0 2px 14px rgba(0,0,0,.7); text-wrap:balance; }
  #next { margin-top:10px; font-size:17px; line-height:1.3; color:rgba(255,255,255,.55); text-shadow:0 2px 10px rgba(0,0,0,.6); }
  #bar { position:absolute; left:0; right:0; bottom: calc(86px + env(safe-area-inset-bottom)); height:3px; background:rgba(255,255,255,.18); }
  #barFill { height:100%; width:0%; background:var(--accent); }
  #stopWrap { position:absolute; left:18px; right:18px; bottom: calc(18px + env(safe-area-inset-bottom)); }

  /* ── review ── */
  #play { width:100%; max-height:62dvh; border-radius:16px; background:#000; }
  .prog { height:8px; border-radius:4px; background:var(--line); overflow:hidden; margin:14px 0 8px; }
  .prog i { display:block; height:100%; width:0%; background:var(--accent); transition:width .2s; }
  .big { font-size:40px; margin:0 0 8px; }
  a.btn { display:block; text-align:center; text-decoration:none; }
  .meta { font-size:12px; color:var(--muted); margin-top:10px; font-variant-numeric:tabular-nums; }
</style>
</head>
<body>

<section id="ready" class="pad on">
  <p><a class="link" id="studioLinkTop" href="#">← Back to Studio</a></p>
  <h1 id="title">Loading…</h1>
  <p class="sub" id="subtitle"></p>
  <div class="card" id="script"></div>
  <div class="spacer"></div>
  <p class="note" id="readyNote">Hold your phone upright. Tap record, you get a 3-second count-in, then the script shows one line at a time at speaking pace. Tap the screen to jump to the next line.</p>
  <label class="toggle"><input type="checkbox" id="softLook" checked> Soft look <span class="hint">(gentle skin smoothing and warmth, applied when the take is processed)</span></label>
  <button class="btn" id="recordBtn" disabled>Record</button>
</section>

<section id="stage">
  <video id="live" autoplay muted playsinline></video>
    <canvas id="cap" width="1080" height="1920"></canvas>
  <div id="veil"></div>
  <div id="top"><span id="timer">0:00</span><div id="meterWrap"><div id="meter"></div></div></div>
  <div id="silent">No sound is reaching the mic — this take is recording nothing.</div>
  <div id="count"></div>
  <div id="prompt"><div id="cue"></div><div id="next"></div></div>
  <div id="bar"><div id="barFill"></div></div>
  <div id="stopWrap"><button class="btn stop" id="stopBtn">Stop</button></div>
</section>

<section id="review" class="pad">
  <h1>Review</h1>
  <p class="sub" id="reviewMeta"></p>
  <video id="play" controls playsinline></video>
  <div class="spacer"></div>
  <div class="row">
    <button class="btn ghost" id="retakeBtn">Retake</button>
    <button class="btn" id="useBtn">Use this take</button>
  </div>
</section>

<section id="upload" class="pad">
  <h1>Uploading…</h1>
  <p class="sub" id="uploadMeta"></p>
  <div class="prog"><i id="uploadFill"></i></div>
  <p class="note" id="uploadNote">Sending the take to the project.</p>
</section>

<section id="done" class="pad">
  <p class="big">✓</p>
  <h1>Attached</h1>
  <p class="sub" id="doneMeta"></p>
  <p class="note">The take is now this scene's speaker base. Head back to Studio for the next scene, or record this one again.</p>
  <div class="spacer"></div>
  <a class="btn" id="studioLink" href="#">Back to Studio</a>
  <div class="row"><button class="btn ghost" id="againBtn">Record again</button><a class="btn ghost" id="studioLink" href="#">Desktop Studio</a></div>
</section>

<section id="err" class="pad">
  <h1>Something went wrong</h1>
  <p class="sub" id="errMsg"></p>
  <div class="spacer"></div>
  <button class="btn ghost" id="errBtn">Try again</button>
</section>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qp = new URLSearchParams(location.search);
  var tenant = qp.get('tenant') || '';
  var project = qp.get('project') || '';
  var token = qp.get('token') || '';
  // ?scene=N (0-based): record ONE scene's lines; without it the whole board
  // is prompted and the take attaches to the first open need.
  // (Doubled backslash: this file is a template literal, and a lone \d
  // reached the browser as "d" -- measured live, every scene link showed
  // the whole board.)
  var sceneIndex = /^\\d+$/.test(qp.get('scene') || '') ? Number(qp.get('scene')) : -1, sceneLabel = '';
  // ?scene=all: one recording through every scene; the server cuts it per
  // scene where each scene's script begins.
  var recordAll = qp.get('scene') === 'all';
  var WORDS_PER_SEC = 2.4;

  function show(id) {
    ['ready','stage','review','upload','done','err'].forEach(function (s) { $(s).classList.toggle('on', s === id); });
    try { window.scrollTo(0, 0); } catch (eS) {}
  }
  function fail(msg) { $('errMsg').textContent = msg; show('err'); }
  function withToken(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token); }
  // Studio serves its phone view to a phone; on a laptop this lands in the desktop app.
  var studioHref = '/studio?tenant=' + encodeURIComponent(tenant) + '&project=' + encodeURIComponent(project) + (token ? '&token=' + encodeURIComponent(token) : '');
  $('studioLinkTop').href = studioHref;
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }

  // The token IS the tenant (a tenant-scoped JWT): a link with project +
  // token opens the take page too, the same as Studio on any screen.
  if (!tenant && token) {
    try {
      var segT = token.split('.')[1] || '';
      var payT = JSON.parse(atob(segT.replace(/-/g, '+').replace(/_/g, '/')));
      tenant = String(payT.tenant_id || payT.tenant || '');
    } catch (eTok) {}
  }
  if (!tenant || !project) { fail((!project ? 'Missing ?project= in the link.' : 'Missing ?tenant= in the link (or a token that carries it).') + ' Ask your agent for the take link for this film.'); return; }

  // ── the script: the storyboard's asserted spine ───────────────────────
  // One cue per beat; a long beat is split into sentences, each given a share
  // of the beat's seconds by word count, so a single 15s line still paces.
  var cues = [];
  var total = 0;
  var projectName = '';

  // Cues follow the script's own notation: one sentence per line (a line
  // break is a breath, ~0.3s) and a line that says only (pause) is a held
  // beat (~1s) the prompter shows as "•••". Silences come out of the
  // scene's duration first; the words share what is left.
  var BREATH_S = 0.3, PAUSE_S = 1.0, PAUSE_GLYPH = '\u2022\u2022\u2022';
  var PAUSE_LINE = /^\\(\\s*pause\\s*\\)[.,!?]*$/i;
  function buildCues(scenes) {
    var out = [];
    (scenes || []).forEach(function (s, i) {
      var text = String(s.voiceover_text || '').trim();
      if (!text) return;
      var items = [];
      var lines = text.split(/\\r?\\n/).reduce(function (a, l) { return a.concat(l.split(/(\\(\\s*pause\\s*\\)[.,!?]*)/i)); }, []).map(function (l) { return l.trim(); }).filter(Boolean);
      lines.forEach(function (ln) {
        if (PAUSE_LINE.test(ln)) { items.push({ text: PAUSE_GLYPH, words: 0, gap: PAUSE_S }); return; }
        var parts = ln.match(/[^.!?…]+[.!?…]+["')\\]]*|[^.!?…]+$/g) || [ln];
        parts.forEach(function (p, k) {
          var t = p.trim(); if (!t) return;
          items.push({ text: t, words: t.split(/\\s+/).filter(Boolean).length, gap: k === parts.length - 1 ? BREATH_S : 0 });
        });
      });
      for (var z = items.length - 1; z >= 0; z--) { if (items[z].words) { items[z].gap = 0; break; } }
      var words = items.reduce(function (a, it) { return a + it.words; }, 0) || 1;
      var gaps = items.reduce(function (a, it) { return a + it.gap; }, 0);
      // The board's number is the CUT, never the mouth: a scene written
      // with more words than its seconds (measured live, proj_f10e79cf:
      // 24 words in 4s -- "ripping through the words faster than any human
      // could speak") prompts at speaking pace and the take re-times the
      // scene. The pipeline floors the board the same way at build.
      var dur = Math.max(Number(s.duration_seconds) || 0, Math.max(1.5, words / WORDS_PER_SEC + gaps));
      var speech = Math.max(0.5, dur - gaps);
      items.forEach(function (it) { out.push({ text: it.text, dur: speech * (it.words / words) + it.gap, beat: i }); });
    });
    return out;
  }

  fetch(withToken('/api/projects/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project)))
    .then(function (r) { if (!r.ok) throw new Error('Could not load the project (' + r.status + '). Is the link still valid?'); return r.json(); })
    .then(function (p) {
      projectName = p.name || project;
      var allScenes = (p.storyboard && p.storyboard.scenes) || [];
      var scenes = sceneIndex >= 0 && allScenes[sceneIndex] ? [allScenes[sceneIndex]] : allScenes;
      sceneLabel = sceneIndex >= 0 && allScenes[sceneIndex] ? ('Scene ' + (sceneIndex + 1) + (allScenes[sceneIndex].label ? ' · ' + allScenes[sceneIndex].label : '')) : '';
      cues = buildCues(scenes);
      total = cues.reduce(function (a, c) { return a + c.dur; }, 0);
      $('title').textContent = projectName + (sceneLabel ? ' — ' + sceneLabel : '');
      var g = (p.treatment && p.treatment.filmGrammar) || '';
      var beats = scenes.filter(function (s) { return String(s.voiceover_text || '').trim(); }).length;
      $('subtitle').textContent = beats
        ? beats + (beats === 1 ? ' beat' : ' beats') + ' · about ' + fmt(total) + ' at speaking pace' + (g ? ' · ' + g : '')
        : 'This film has no spoken lines' + (g ? ' (grammar: ' + g + ')' : '') + '. You can still record; there will be no prompter.';
      var sc = $('script'); sc.innerHTML = '';
      if (!beats) { sc.innerHTML = '<p class="note">No script on this film.</p>'; }
      scenes.forEach(function (s, i) {
        var t = String(s.voiceover_text || '').trim(); if (!t) return;
        var d = document.createElement('p'); d.className = 'beat';
        var b = document.createElement('b'); b.textContent = (sceneLabel ? 'Lines' : 'Beat ' + (i + 1)) + (s.duration_seconds ? ' · ' + Number(s.duration_seconds).toFixed(0) + 's' : '');
        d.appendChild(b);
        d.appendChild(document.createTextNode(t.split(/\\r?\\n/).reduce(function (a, l) { return a.concat(l.split(/(\\(\\s*pause\\s*\\)[.,!?]*)/i)); }, []).map(function (l) { l = l.trim(); return PAUSE_LINE.test(l) ? PAUSE_GLYPH : l; }).filter(Boolean).join('\\n')));
        sc.appendChild(d);
      });
      $('recordBtn').disabled = false;
    })
    .catch(function (e) { fail(e.message || String(e)); });

  // ── recording ──────────────────────────────────────────────────────────
  var stream = null, rec = null, chunks = [], mime = '', ext = 'webm';
  var t0 = 0, tickTimer = null, audioCtx = null, meterRaf = null, lastLoud = 0, wake = null;
  var blob = null, blobDuration = 0, trackW = 0, trackH = 0;

  var CANDS = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  function pickMime() {
    if (!window.MediaRecorder) return '';
    for (var i = 0; i < CANDS.length; i++) { try { if (MediaRecorder.isTypeSupported(CANDS[i])) return CANDS[i]; } catch (e) {} }
    return '';
  }

  function startMeter(s) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      audioCtx = new AC();
      var src = audioCtx.createMediaStreamSource(s);
      var an = audioCtx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      var buf = new Float32Array(an.fftSize);
      lastLoud = performance.now();
      var loop = function () {
        an.getFloatTimeDomainData(buf);
        var sum = 0; for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        var rms = Math.sqrt(sum / buf.length);
        var db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        var pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
        $('meter').style.width = pct + '%';
        var now = performance.now();
        if (db > -45) lastLoud = now;
        var silent = rec && rec.state === 'recording' && (now - lastLoud) > 3000;
        $('meterWrap').classList.toggle('silent', silent);
        $('silent').style.display = silent ? 'block' : 'none';
        meterRaf = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) { /* a meter is a courtesy; recording does not depend on it */ }
  }
  function stopMeter() {
    if (meterRaf) cancelAnimationFrame(meterRaf); meterRaf = null;
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
    $('meter').style.width = '0%'; $('meterWrap').classList.remove('silent'); $('silent').style.display = 'none';
  }

  // One cue at a time, each on its own clock; a TAP on the stage jumps to
  // the next line and the clock restarts from there, so the prompter can
  // never run ahead of the person reading it.
  var cueIdx = -1, cueTimer = null;
  function showCue(i) {
    if (cueTimer) clearTimeout(cueTimer); cueTimer = null;
    cueIdx = i;
    if (i >= cues.length) { $('cue').textContent = ''; $('next').textContent = 'That’s the script. Stop when you’re done.'; return; }
    $('cue').textContent = cues[i].text;
    $('next').textContent = cues[i + 1] ? cues[i + 1].text : '';
    cueTimer = setTimeout(function () { showCue(i + 1); }, cues[i].dur * 1000);
  }
  function runPrompter() { $('barFill').style.width = '0%'; showCue(0); }
  function advanceCue() { if (rec && rec.state === 'recording' && cueIdx >= 0 && cueIdx < cues.length) showCue(cueIdx + 1); }
  function clearPrompter() { if (cueTimer) clearTimeout(cueTimer); cueTimer = null; cueIdx = -1; $('cue').textContent = ''; $('next').textContent = ''; }
  $('stage').addEventListener('click', function (ev) { if (ev.target && (ev.target.id === 'stopBtn' || ev.target.closest && ev.target.closest('#stopWrap'))) return; advanceCue(); });

  // ── portrait canvas capture ────────────────────────────────────────────
  var capture = 'raw', drawing = false, drawReq = 0;
  function drawFrame() {
    if (!drawing) return;
    var v = $('live'), cv = $('cap'), ctx = cv.getContext('2d');
    var vw = v.videoWidth, vh = v.videoHeight;
    if (vw && vh) {
      // Cover-crop into the portrait canvas: the same framing the screen shows.
      var k = Math.max(cv.width / vw, cv.height / vh);
      var dw = vw * k, dh = vh * k;
      ctx.drawImage(v, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
    }
    if (v.requestVideoFrameCallback) drawReq = v.requestVideoFrameCallback(drawFrame);
    else drawReq = requestAnimationFrame(drawFrame);
  }
  function startDraw() { drawing = true; drawFrame(); }
  function stopDraw() {
    drawing = false;
    var v = $('live');
    if (drawReq && v.cancelVideoFrameCallback) { try { v.cancelVideoFrameCallback(drawReq); } catch (e) {} }
    else if (drawReq) cancelAnimationFrame(drawReq);
    drawReq = 0;
  }

  function tick() {
    var el = (performance.now() - t0) / 1000;
    $('timer').textContent = fmt(el) + (total ? ' / ' + fmt(total) : '');
    if (total) $('barFill').style.width = Math.min(100, (el / total) * 100) + '%';
  }

  $('recordBtn').addEventListener('click', function () {
    $('recordBtn').disabled = true;
    var constraints = {
      video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
      // Mirrors the recorder extension so a take behaves the same on every device.
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    };
    // Ask for the camera ONCE per visit: the stream stays open across
    // review, retake and record-again (the browser asked again on every
    // take -- Marc: "I've already said yes"). Released when the page hides.
    var live = stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; });
    (live ? Promise.resolve(stream) : navigator.mediaDevices.getUserMedia(constraints)).then(function (s) {
      stream = s;
      var vt = s.getVideoTracks()[0]; var st = vt && vt.getSettings ? vt.getSettings() : {};
      trackW = st.width || 0; trackH = st.height || 0;
      $('live').srcObject = s;
      show('stage');
      $('timer').textContent = '0:00'; $('timer').classList.remove('rec');
      startMeter(s);
      if (navigator.wakeLock && navigator.wakeLock.request) { navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {}); }
      // 3-2-1 count-in, then roll.
      var n = 3; $('count').style.display = 'flex'; $('count').textContent = String(n);
      var cd = setInterval(function () {
        n -= 1;
        if (n > 0) { $('count').textContent = String(n); return; }
        clearInterval(cd); $('count').style.display = 'none';
        mime = pickMime(); ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
        chunks = [];
        // Record the PICTURE ON SCREEN, not the camera track. iOS hands the
        // recorder the sensor's landscape frame with a rotation tag (the
        // screen shows a portrait cover-crop of it); recording the raw track
        // ships a wide, sideways-stored file. Drawing the displayed video into
        // a portrait canvas and recording the canvas gives true portrait
        // pixels at full size and no tag. Falls back to the raw track where
        // captureStream is missing; the server sanitizer handles that file.
        var src = s;
        capture = 'raw';
        var cv = $('cap');
        if (cv.captureStream || cv.mozCaptureStream) {
          try {
            var cs = (cv.captureStream ? cv.captureStream(30) : cv.mozCaptureStream(30));
            src = new MediaStream();
            cs.getVideoTracks().forEach(function (t) { src.addTrack(t); });
            s.getAudioTracks().forEach(function (t) { src.addTrack(t); });
            capture = 'canvas';
            startDraw();
          } catch (e) { src = s; capture = 'raw'; }
        }
        try { rec = mime ? new MediaRecorder(src, { mimeType: mime }) : new MediaRecorder(src); }
        catch (e1) {
          // A browser that cannot record a canvas stream still records the camera.
          stopDraw(); src = s; capture = 'raw';
          try { rec = mime ? new MediaRecorder(src, { mimeType: mime }) : new MediaRecorder(src); }
          catch (e) { stopAll(); fail('This browser cannot record video here (' + (e.message || e) + ').'); return; }
        }
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onstop = onStopped;
        rec.start(1000);
        t0 = performance.now();
        $('timer').classList.add('rec');
        tickTimer = setInterval(tick, 200);
        runPrompter();
      }, 1000);
    }).catch(function (e) {
      $('recordBtn').disabled = false;
      fail('Camera or microphone was not allowed (' + (e.name || e) + '). Allow both for this site and try again.');
    });
  });

  function stopAll() {
    stopDraw();
    if (tickTimer) clearInterval(tickTimer); tickTimer = null;
    clearPrompter(); stopMeter();
    if (wake) { try { wake.release(); } catch (e) {} wake = null; }
    $('live').srcObject = null;
  }
  function releaseCamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }
  window.addEventListener('pagehide', releaseCamera);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && !(rec && rec.state === 'recording')) releaseCamera(); });

  $('stopBtn').addEventListener('click', function () {
    if (rec && rec.state === 'recording') { blobDuration = (performance.now() - t0) / 1000; rec.stop(); }
    else { stopAll(); show('ready'); $('recordBtn').disabled = false; }
  });

  function onStopped() {
    blob = new Blob(chunks, { type: mime || 'video/webm' });
    stopAll();
    if (!blob.size) { fail('The recording came back empty. Try again.'); return; }
    var url = URL.createObjectURL(blob);
    var v = $('play'); v.src = url; v.load();
    $('reviewMeta').textContent = fmt(blobDuration) + (total ? ' recorded · script is ' + fmt(total) : '') + ' · ' + (blob.size / 1048576).toFixed(1) + ' MB'
      + (capture === 'canvas' ? ' · 1080×1920' : (trackW && trackH ? ' · ' + trackW + '×' + trackH : '')) + ' · ' + ext;
    show('review');
  }

  $('retakeBtn').addEventListener('click', function () { blob = null; chunks = []; $('play').src = ''; show('ready'); $('recordBtn').disabled = false; });

  // ── upload + attach ────────────────────────────────────────────────────
  $('useBtn').addEventListener('click', function () {
    if (!blob) return;
    var name = 'take-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
    show('upload');
    $('uploadMeta').textContent = name + ' · ' + (blob.size / 1048576).toFixed(1) + ' MB';
    $('uploadFill').style.width = '0%';
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/upload-asset/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + '?name=' + encodeURIComponent(name)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = function (ev) { if (ev.lengthComputable) $('uploadFill').style.width = Math.round((ev.loaded / ev.total) * 100) + '%'; };
    xhr.onerror = function () { fail('Upload failed (network). Check the connection and try again.'); };
    xhr.onload = function () {
      if (xhr.status < 200 || xhr.status >= 300) { fail('Upload failed (' + xhr.status + '): ' + (xhr.responseText || '').slice(0, 200)); return; }
      var up; try { up = JSON.parse(xhr.responseText); } catch (e) { fail('Upload returned something unexpected.'); return; }
      $('uploadFill').style.width = '100%';
      $('uploadNote').textContent = 'Attaching to the project…';
      fetch(withToken('/api/take/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project)), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: up.url, duration: blobDuration, mime: mime, capture: capture,
          look: ($('softLook') && $('softLook').checked) ? 'soft' : 'natural',
          scene_index: recordAll ? 'all' : (sceneIndex >= 0 ? sceneIndex : undefined),
          width: capture === 'canvas' ? 1080 : trackW, height: capture === 'canvas' ? 1920 : trackH }),
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('attach failed (' + r.status + ')')); return j; }); })
        .then(function (j) {
          $('doneMeta').textContent = projectName + ' · ' + fmt(blobDuration) + ' take';
          $('studioLink').href = '/studio?tenant=' + encodeURIComponent(tenant) + '&project=' + encodeURIComponent(project) + '&token=' + encodeURIComponent(token) + '&desktop=1';
          $('studioLink').href = studioHref;
          show('done');
        })
        .catch(function (e) { fail(e.message || String(e)); });
    };
    xhr.send(blob);
  });

  $('againBtn').addEventListener('click', function () { blob = null; chunks = []; show('ready'); $('recordBtn').disabled = false; });
  $('errBtn').addEventListener('click', function () { stopAll(); show('ready'); $('recordBtn').disabled = !cues && false; $('recordBtn').disabled = false; });
})();
</script>
</body>
</html>`;
}
