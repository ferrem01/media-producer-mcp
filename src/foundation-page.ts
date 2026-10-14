/**
 * The FOUNDATION page -- served at /foundation?tenant=&actor=&token=.
 *
 * Where a real person records the three clips their avatar is made from
 * (SPEC-real-person.md, core/actor-foundation.ts): far, close and a head
 * turn. Opened on the phone from the Cast page's QR code (or in a laptop's
 * tab). It says plainly that these clips are the foundation -- everything
 * the avatar will look like comes from them -- coaches the setup (light from
 * the front-side, never from above: the take copies the light, Oct 14), and
 * runs each clip hands-free: a countdown to step back to the chair, a timer
 * big enough to read from three meters, and a stop on its own at the target
 * length. Each clip uploads to POST /api/cast/{tenant}/{actor}/foundation/{kind}
 * and can be recorded again on its own; a clip filmed on another camera can
 * be uploaded instead.
 *
 * Its own page, not a mode of the take page: the take page is a film's
 * booth (a project, its script on a prompter, a take to attach); a
 * foundation belongs to a person, has no film and no script.
 *
 * Auth: the tenant-scoped token rides in the link, as on /take.
 */
import { QUOTIENT_CSS, QUOTIENT_FONT_LINKS } from "./quotient-theme.js";
import { LIGHT_CHECK_JS } from "./core/light-check.js";
import { FOUNDATION_CLIPS } from "./core/actor-foundation.js";

/** What each clip asks of the person -- the page's words, one source. */
export const FOUNDATION_STEPS = [
  {
    kind: "far", title: "Far", shot: "wide",
    what: "How you look and move at the shot's distance.",
    how: [
      "Turn the phone sideways and stand it about three meters (ten feet) from your chair, at the height of your eyes when you sit.",
      "Sit down: the frame holds you from the knees up.",
      "Talk to the lens the whole time -- about anything: what you are working on, your morning, a story you like telling. Move your hands as you normally do.",
    ],
  },
  {
    kind: "close", title: "Close", shot: "close",
    what: "The detail: your eyes, your skin, the true spacing of your features.",
    how: [
      "Same light. Bring the phone to about one meter (an arm and a half) away, at eye height.",
      "Chest up in the frame.",
      "Talk to the lens again, relaxed. Look into it, not at the screen.",
    ],
  },
  {
    kind: "turn", title: "Turn", shot: "close",
    what: "Your profile and three-quarter views.",
    how: [
      "Stay where you were for Close.",
      "When it starts: look slowly to your left, then back to the lens, then slowly to your right, then back to the lens.",
      "Slow and smooth -- about three seconds each way.",
    ],
  },
] as const;

export const FOUNDATION_SETUP = [
  "Light your face from the front-side -- a window or a lamp beside the phone. Never from above: overhead light carves bags and lines, and the avatar copies it.",
  "The room behind you can be dim.",
  "A plain dark top. No cap or hat. Glasses only if you always wear them.",
  "Take the shine off -- a little powder, or a splash of cold water.",
  "A quiet room. The phone's own microphone is fine.",
];

export function getFoundationHtml(): string {
  const clips = JSON.stringify(FOUNDATION_CLIPS);
  const steps = JSON.stringify(FOUNDATION_STEPS);
  const setup = JSON.stringify(FOUNDATION_SETUP);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#0e0e14">
<link rel="icon" href="data:,">
${QUOTIENT_FONT_LINKS}
<title>Your foundation · Media Studio</title>
<style>
${QUOTIENT_CSS}
  * { -webkit-tap-highlight-color: transparent; }
  body { min-height: 100dvh; }
  main { max-width: 640px; margin: 0 auto; padding: 18px 18px 40px; }
  h1 { font-size: 24px; margin: 6px 0 6px; }
  .lede { color: #444; line-height: 1.45; margin: 0 0 16px; }
  .lede b { color: #111; }
  .card { background: #fff; border: 1px solid #e6e6ea; border-radius: 14px; padding: 14px 16px; margin: 0 0 12px; }
  .card h2 { font-size: 16px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
  .card p { margin: 4px 0; color: #555; line-height: 1.4; }
  .setup li { margin: 6px 0; line-height: 1.4; }
  .clip .state { margin-left: auto; font-size: 13px; font-weight: 500; color: #888; }
  .clip.done .state { color: #13795b; }
  .clip .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; align-items: center; }
  .clip video, .clip img { max-width: 100%; border-radius: 8px; background: #111; }
  .stills { display: flex; gap: 6px; margin-top: 8px; }
  .stills img { width: 32%; aspect-ratio: 3 / 4; object-fit: cover; }
  .btn.small { padding: 8px 14px; }
  .upl { font-size: 13px; color: #555; }
  .upl input { display: none; }
  .upl span { text-decoration: underline; cursor: pointer; }
  #msg { min-height: 20px; font-size: 14px; margin: 8px 0; }
  #msg.err { color: #b42318; } #msg.ok { color: #13795b; }
  /* The stage: the camera full screen, the guide over it, the words big
     enough to read from the chair. */
  #stage { position: fixed; inset: 0; background: #000; color: #fff; display: none; z-index: 10; }
  #stage.on { display: block; }
  #live, #review { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #live.mirror { transform: scaleX(-1); }
  #guide { position: absolute; inset: 0; pointer-events: none; }
  #top { position: absolute; left: 0; right: 0; top: 0; padding: calc(10px + env(safe-area-inset-top)) 16px 30px; background: linear-gradient(#000c, #0000); }
  #top h3 { margin: 0 0 4px; font-size: 18px; }
  #top ol { margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.35; opacity: .92; }
  #light { font-size: 13px; margin-top: 6px; opacity: .9; }
  #light.good { color: #7ee2b8; }
  #big { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-size: 22vmin; font-weight: 700; text-shadow: 0 2px 12px #000; pointer-events: none; }
  #bottom { position: absolute; left: 0; right: 0; bottom: 0; padding: 30px 16px calc(16px + env(safe-area-inset-bottom)); background: linear-gradient(#0000, #000c); display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  #bottom button { min-width: 120px; }
  #recDot { position: absolute; right: 16px; top: calc(14px + env(safe-area-inset-top)); width: 14px; height: 14px; border-radius: 50%; background: #e5484d; display: none; }
  #stage.rec #recDot { display: block; }
  #stage.rec #top ol { display: none; }
</style>
</head>
<body>
<main>
  <h1 id="title">Your foundation</h1>
  <p class="lede"><b>These three short clips are the foundation of your avatar.</b> Everything it will ever look like -- your face, your hair, the way you move -- comes from them, and the light on your face here is the light on it in every scene. Ten minutes, once. You can redo any clip on its own.</p>
  <div class="card setup"><h2>Before you start</h2><ul id="setupList"></ul></div>
  <div id="clips"></div>
  <div id="msg"></div>
  <div class="card" id="doneCard" style="display:none"><h2>Your foundation is in</h2><p>Your avatar is made from these clips. Go back to the Cast page to use it in a film.</p></div>
</main>
<div id="stage">
  <video id="live" autoplay playsinline muted></video>
  <video id="review" playsinline controls style="display:none"></video>
  <canvas id="guide"></canvas>
  <div id="recDot"></div>
  <div id="top"><h3 id="sTitle"></h3><ol id="sHow"></ol><div id="light"></div></div>
  <div id="big"></div>
  <div id="bottom"></div>
</div>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var qp = new URLSearchParams(location.search);
  var tenant = qp.get('tenant') || '', actorId = qp.get('actor') || '', token = qp.get('token') || '';
  var CLIPS = ${clips}, STEPS = ${steps}, SETUP = ${setup};
  ${LIGHT_CHECK_JS}
  var actor = null, stream = null, rec = null, chunks = [], mime = '', step = null, timer = null, back = false, lightTimer = null, lightCanvas = null;
  function withToken(u) { return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token); }
  function api(u, opts) { return fetch(withToken(u), opts || {}).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('Request failed (' + r.status + ')')); return j; }); }); }
  function say(t, kind) { var m = $('msg'); m.textContent = t || ''; m.className = kind || ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function base() { return '/api/cast/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(actorId); }
  SETUP.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; $('setupList').appendChild(li); });

  function load() {
    return api('/api/cast/' + encodeURIComponent(tenant)).then(function (r) {
      actor = (r.cast || []).filter(function (a) { return a.id === actorId; })[0];
      if (!actor) throw new Error('This link is for an actor who is no longer in the cast.');
      $('title').textContent = actor.name + ': your foundation';
      render();
    }).catch(function (e) { say(e.message || String(e), 'err'); });
  }
  function clipOf(kind) { return ((actor.foundation && actor.foundation.clips) || []).filter(function (c) { return c.kind === kind; })[0]; }
  function workOf(kind) { return ((actor.foundation && actor.foundation.work) || []).filter(function (w) { return w.kind === kind; })[0]; }
  function hasStill(kind) { return ((actor.foundation && actor.foundation.stills) || []).some(function (s) { return s.kind === kind; }); }
  function render() {
    var box = $('clips'); box.innerHTML = '';
    var v = Date.now();
    STEPS.forEach(function (s, i) {
      var c = clipOf(s.kind), w = workOf(s.kind), card = document.createElement('div');
      var state = w && w.status === 'processing' ? 'Making it…' : w && w.status === 'failed' ? 'Could not use it' : c ? 'Recorded, ' + c.seconds + ' s' : 'To record';
      card.className = 'card clip' + (c ? ' done' : '');
      var stills = s.kind === 'close' ? ['front'] : s.kind === 'turn' ? ['left', 'right'] : [];
      card.innerHTML = '<h2>' + (i + 1) + '. ' + esc(s.title) + ' <span style="font-weight:400;color:#888;font-size:13px">' + CLIPS[s.kind].target + ' s</span><span class="state">' + state + '</span></h2>'
        + '<p>' + esc(s.what) + '</p>'
        + (w && w.status === 'failed' ? '<p style="color:#b42318">' + esc(w.error || 'unknown error') + '</p>' : '')
        + (c && stills.some(hasStill) ? '<div class="stills">' + stills.filter(hasStill).map(function (k) { return '<img alt="" src="' + esc(withToken(base() + '/still/' + k) + '&v=' + v) + '">'; }).join('') + '</div>' : '')
        + '<div class="row"><button class="btn primary small" data-rec="' + s.kind + '">' + (c ? 'Record again' : 'Record') + '</button>'
        + (c ? '<button class="quiet" data-play="' + s.kind + '">Watch</button>' : '')
        + '<label class="upl">or <span>upload a clip</span><input type="file" accept="video/*" data-up="' + s.kind + '"></label></div>';
      box.appendChild(card);
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-rec]'), function (b) { b.onclick = function () { openStage(b.getAttribute('data-rec')); }; });
    Array.prototype.forEach.call(box.querySelectorAll('[data-play]'), function (b) {
      b.onclick = function () { var vid = document.createElement('video'); vid.controls = true; vid.playsInline = true; vid.src = withToken(base() + '/foundation/' + b.getAttribute('data-play')) + '&v=' + v; b.parentNode.parentNode.appendChild(vid); vid.play(); b.remove(); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-up]'), function (inp) {
      inp.onchange = function () { var f = inp.files && inp.files[0]; if (f) send(inp.getAttribute('data-up'), f); };
    });
    var all = STEPS.every(function (s) { return clipOf(s.kind); });
    $('doneCard').style.display = all ? '' : 'none';
  }

  // UPLOAD: the clip's bytes as the body. The server answers at once and
  // makes the clip in the background (transcode, stills, reference); the
  // page follows it until it lands or says why it could not.
  var follow = null;
  function send(kind, blob) {
    say('Sending the ' + kind + ' clip… (keep this page open)');
    return fetch(withToken(base() + '/foundation/' + kind), { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ('Upload failed (' + r.status + ')')); return j; }); })
      .then(function (a) { actor = a; render(); say('Making the ' + kind + ' clip… (about a minute)'); watch(kind); })
      .catch(function (e) { say(e.message || String(e), 'err'); });
  }
  function watch(kind) {
    if (follow) clearInterval(follow);
    follow = setInterval(function () {
      api('/api/cast/' + encodeURIComponent(tenant)).then(function (r) {
        var a = (r.cast || []).filter(function (x) { return x.id === actorId; })[0]; if (!a) return;
        actor = a; var w = workOf(kind);
        if (w && w.status === 'processing') return;
        clearInterval(follow); follow = null; render();
        if (w && w.status === 'failed') say('The ' + kind + ' clip could not be used: ' + (w.error || 'unknown error'), 'err');
        else say('The ' + kind + ' clip is in.', 'ok');
      }).catch(function () {});
    }, 3000);
  }

  // THE STAGE: camera up, guide and light check, a countdown to get to the
  // chair, then recording that stops itself at the clip's length.
  var CANDS = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  function pickMime() { if (!window.MediaRecorder) return ''; for (var i = 0; i < CANDS.length; i++) { try { if (MediaRecorder.isTypeSupported(CANDS[i])) return CANDS[i]; } catch (e) {} } return ''; }
  function beep(f, ms) { try { var ac = beep.ac || (beep.ac = new (window.AudioContext || window.webkitAudioContext)()); var o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = 0.15; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + ms / 1000); } catch (e) {} }
  function buttons(list) {
    var b = $('bottom'); b.innerHTML = '';
    list.forEach(function (x) { var el = document.createElement('button'); el.className = 'btn ' + (x.primary ? 'primary' : ''); el.textContent = x.label; el.onclick = x.go; b.appendChild(el); });
  }
  function openCamera() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    return navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: back ? 'environment' : 'user', width: { ideal: 1920 }, height: { ideal: 1080 } } }).then(function (s) {
      stream = s; var v = $('live'); v.srcObject = s; v.classList.toggle('mirror', !back); return v.play().catch(function () {});
    });
  }
  function openStage(kind) {
    step = STEPS.filter(function (s) { return s.kind === kind; })[0];
    $('sTitle').textContent = step.title + ' -- ' + CLIPS[kind].target + ' seconds';
    var ol = $('sHow'); ol.innerHTML = ''; step.how.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ol.appendChild(li); });
    $('big').textContent = ''; $('review').style.display = 'none'; $('live').style.display = '';
    $('stage').className = 'on';
    openCamera().then(function () { drawGuide(); startLight(); ready(); }).catch(function (e) { closeStage(); say('The camera did not open: ' + (e.message || e), 'err'); });
  }
  function ready() {
    buttons([
      { label: 'Start', primary: true, go: countdown },
      { label: back ? 'Front camera' : 'Back camera', go: function () { back = !back; openCamera().then(function () { drawGuide(); ready(); }); } },
      { label: 'Cancel', go: closeStage },
    ]);
  }
  function closeStage() {
    clearInterval(timer); stopLight();
    if (rec && rec.state === 'recording') { rec.onstop = null; rec.stop(); }
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
    $('stage').className = '';
  }
  function countdown() {
    var n = 5; buttons([{ label: 'Cancel', go: function () { clearInterval(timer); $('big').textContent = ''; ready(); } }]);
    $('big').textContent = n; beep(660, 120);
    timer = setInterval(function () {
      n--; if (n > 0) { $('big').textContent = n; beep(660, 120); return; }
      clearInterval(timer); beep(990, 300); record();
    }, 1000);
  }
  function record() {
    chunks = []; mime = pickMime();
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12000000 }) : new MediaRecorder(stream); }
    catch (e) { rec = new MediaRecorder(stream); }
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = review;
    rec.start(1000);
    $('stage').className = 'on rec';
    var left = CLIPS[step.kind].target, min = CLIPS[step.kind].min, t0 = Date.now();
    $('big').textContent = left;
    buttons([{ label: 'Stop', go: function () { if ((Date.now() - t0) / 1000 < min) { $('big').textContent = 'At least ' + min + ' s'; return; } stopRec(); } }]);
    timer = setInterval(function () {
      var remain = Math.max(0, Math.ceil(left - (Date.now() - t0) / 1000));
      $('big').textContent = remain;
      if (remain <= 0) stopRec();
    }, 250);
  }
  function stopRec() { clearInterval(timer); beep(990, 150); setTimeout(function () { beep(990, 150); }, 220); if (rec && rec.state === 'recording') rec.stop(); }
  function review() {
    stopLight();
    $('stage').className = 'on'; $('big').textContent = '';
    var blob = new Blob(chunks, { type: (mime || 'video/webm').split(';')[0] });
    var rv = $('review'); rv.src = URL.createObjectURL(blob); rv.style.display = ''; $('live').style.display = 'none';
    clearGuide();
    $('sTitle').textContent = 'Watch it back'; $('sHow').innerHTML = '<li>Is your face lit from the front, with no cap, and are you in the frame the whole time?</li>';
    buttons([
      { label: 'Use this clip', primary: true, go: function () { var k = step.kind; closeStage(); send(k, blob); } },
      { label: 'Record again', go: function () { rv.style.display = 'none'; $('live').style.display = ''; openStage(step.kind); } },
    ]);
  }

  // The guide: where the face goes for this clip, the light check's own oval.
  function drawGuide() {
    var c = $('guide'), w = c.width = window.innerWidth, h = c.height = window.innerHeight, x = c.getContext('2d');
    x.clearRect(0, 0, w, h);
    var o = guideOval(w, h, step.shot);
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 2; x.setLineDash([8, 6]);
    x.beginPath(); x.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0, Math.PI * 2); x.stroke();
  }
  function clearGuide() { var c = $('guide'); c.getContext('2d').clearRect(0, 0, c.width, c.height); }
  window.addEventListener('resize', function () { if ($('stage').classList.contains('on') && $('live').style.display !== 'none') drawGuide(); });
  function startLight() {
    stopLight();
    lightTimer = setInterval(function () {
      try {
        var v = $('live'); if (!v.videoWidth || v.readyState < 2) return;
        var sw = 160, sh = Math.max(60, Math.round(160 * window.innerHeight / window.innerWidth));
        if (!lightCanvas) lightCanvas = document.createElement('canvas');
        lightCanvas.width = sw; lightCanvas.height = sh;
        var ctx = lightCanvas.getContext('2d', { willReadFrequently: true });
        var k = Math.max(sw / v.videoWidth, sh / v.videoHeight), dw = v.videoWidth * k, dh = v.videoHeight * k;
        ctx.drawImage(v, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
        var tips = lightAdvice(lightStats(ctx.getImageData(0, 0, sw, sh).data, sw, sh, step.shot));
        var el = $('light'); el.className = tips.length ? '' : 'good';
        el.textContent = tips.length ? 'Light: ' + tips.map(function (t) { return t.text; }).join(' ') : 'Light looks good';
      } catch (e) { /* a courtesy, never the clip */ }
    }, 700);
  }
  function stopLight() { if (lightTimer) clearInterval(lightTimer); lightTimer = null; $('light').textContent = ''; }

  if (!tenant || !actorId) say('This link is missing who it is for. Open it from the Cast page.', 'err');
  else load();
})();
</script>
</body>
</html>`;
}
