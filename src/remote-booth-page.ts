/**
 * THE REMOTE BOOTH (SPEC-remote-booth.md) -- record from across the room.
 *
 * The arm's-length booth (src/take-page.ts) assumes the phone's front
 * camera and a prompter beside the lens. A wide 16:9 film shot 6-10 ft back
 * breaks that: nobody reads a phone from 8 ft, the rear camera is the
 * better camera and its screen faces away, and nobody can reach Record from
 * where they stand. So the phone is ONLY the camera and a big screen is the
 * prompter and the remote control. Two pages:
 *
 *  - /remote-booth?tenant&project&scene&token -- the CONTROL SCREEN, opened
 *    from Studio ("Across the room"). A QR until a phone pairs; then the
 *    live preview with the booth's guide oval and light check (shot size
 *    close / medium / wide), a film + scene picker that RETARGETS the
 *    session, the large prompter (the booth's own script and karaoke
 *    pacing, src/core/prompter.ts), Start/Stop with a 3-2-1 on both
 *    devices, upload progress, review, Keep/Retake. With no phone paired it
 *    is still a prompter and a timer, and Upload attaches a file recorded
 *    on any camera (the true-4K fallback: the iPhone Camera app, a real
 *    camera).
 *  - /remote-camera?tenant&session&token -- the CAMERA, opened by the QR.
 *    Rear camera by default, the best size the browser gives at the film's
 *    frame, preview stills to the laptop, a local recording that never
 *    depends on the network, an upload with progress, and on Keep the SAME
 *    attach route the booth uses (capture: 'remote').
 *
 * Pair once: the session is the tenant's and the device pair's, not a
 * film's (Marc: "I have to remove the camera from the stand and then scan
 * the QR for each"). The control screen keeps the session id in
 * localStorage, so a reload, or a second "Across the room" from Studio,
 * rejoins the same session and the phone just follows the new target.
 *
 * Auth: like /take, the pages read ?token= from their own URL and send it
 * on every request and on the /ws socket (src/ws.ts authenticates the
 * socket with it; core/remote-booth.ts refuses another tenant's session).
 *
 * Both scripts are template literals: no backticks, no dollar-brace, and
 * any regex backslash doubled.
 */
import { QUOTIENT_CSS, QUOTIENT_FONT_LINKS } from "./quotient-theme.js";
import { LIGHT_CHECK_JS } from "./core/light-check.js";
import { PROMPTER_TIMING_JS, PROMPTER_VIEW_JS } from "./core/prompter.js";

/** The relay socket, shared by both pages. */
const RB_SOCKET_JS = `
  // ── the relay socket (src/ws.ts, remote-booth:*) ──────────────────────
  // One socket per page, re-opened with backoff when it drops: the phone on
  // the tripod and the laptop find each other again on their own (a Wi-Fi
  // blip mid-shoot is not a reason to walk over to the rig).
  function rbSocket(o) {
    var ws = null, tries = 0, stopped = false, ping = null;
    function url() { return (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws' + (o.token ? '?token=' + encodeURIComponent(o.token) : ''); }
    function raw(m) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); return true; } catch (e) {} } return false; }
    function join() { raw({ type: 'remote-booth:join', role: o.role, session: o.session() || undefined, tenant: o.tenant }); }
    function open() {
      if (stopped) return;
      try { ws = new WebSocket(url()); } catch (e) { later(); return; }
      ws.onopen = function () {
        tries = 0; join();
        if (ping) clearInterval(ping);
        // A proxy closes a quiet socket; the upload minutes are quiet.
        ping = setInterval(function () { raw({ type: 'remote-booth:ping' }); }, 20000);
      };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        var t = String(m.type || '');
        if (t.indexOf('remote-booth:') === 0) o.onMessage(t.slice(13), m);
      };
      ws.onclose = function () { if (ping) clearInterval(ping); ping = null; if (o.onClose) o.onClose(); later(); };
      ws.onerror = function () {};
    }
    function later() { if (stopped) return; setTimeout(open, Math.min(8000, 500 * Math.pow(2, tries++))); }
    open();
    return {
      send: function (name, data) { var m = {}; data = data || {}; for (var k in data) m[k] = data[k]; m.type = 'remote-booth:' + name; return raw(m); },
      isOpen: function () { return !!ws && ws.readyState === 1; },
      buffered: function () { return ws ? ws.bufferedAmount : 0; },
      rejoin: join,
      stop: function () { stopped = true; if (ws) { try { ws.close(); } catch (e) {} } }
    };
  }
  function tenantOf(token) {
    try { var p = JSON.parse(atob((token.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'))); return String(p.tenant_id || p.tenant || ''); } catch (e) { return ''; }
  }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }
`;

/** The control screen: prompter, remote, preview, light check, picker. */
export function getRemoteBoothHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:,">
${QUOTIENT_FONT_LINKS}
<title>Remote booth · Media Studio</title>
<style>
${QUOTIENT_CSS}
  /* The control screen is read from 8-10 ft: black ground, white type,
     every control big enough to hit on the way back to your mark. */
  html, body { height: 100%; }
  body { margin: 0; background: #0b0b10; color: #fff; display: flex; flex-direction: column; min-height: 100vh; overflow: hidden; }
  button { font: 500 14px/20px var(--font-sans); color: #fff; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 8px 14px; cursor: pointer; }
  button:hover { background: rgba(255,255,255,.14); }
  button:disabled { opacity: .45; pointer-events: none; }
  button.on, button[aria-pressed="true"] { background: #fff; color: #0b0b10; }
  #bar { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid rgba(255,255,255,.08); flex-wrap: wrap; }
  #filmBtn { display: flex; flex-direction: column; align-items: flex-start; gap: 0; max-width: 42vw; text-align: left; }
  #filmBtn b { font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 40vw; }
  #filmBtn small { color: rgba(255,255,255,.62); font-size: 12px; }
  .pill { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.8); }
  .pill.ok { background: rgba(34,197,94,.18); color: #86efac; }
  .seg { display: inline-flex; gap: 0; }
  .seg button { border-radius: 0; margin-left: -1px; }
  .seg button:first-child { border-radius: 10px 0 0 10px; margin-left: 0; }
  .seg button:last-child { border-radius: 0 10px 10px 0; }
  .grow { flex: 1; }
  #main { flex: 1; display: grid; grid-template-columns: minmax(300px, 34vw) 1fr; min-height: 0; }
  #side { border-right: 1px solid rgba(255,255,255,.08); padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  .card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 14px; }
  .card h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: rgba(255,255,255,.6); }
  .note { color: rgba(255,255,255,.62); font-size: 13px; line-height: 19px; margin: 8px 0 0; }
  #qr { display: block; width: 240px; height: 240px; margin: 0 auto; background: #fff; border-radius: 10px; padding: 8px; box-sizing: content-box; }
  #camLink { color: rgba(255,255,255,.5); font-size: 12px; word-break: break-all; }
  #pvWrap { position: relative; width: 100%; background: #000; border-radius: 10px; overflow: hidden; line-height: 0; }
  #pv { width: 100%; height: auto; display: block; }
  #oval { position: absolute; box-sizing: border-box; border: 2px dashed rgba(255,255,255,.5); border-radius: 50%; pointer-events: none; }
  #eyes { position: absolute; height: 0; border-top: 1px solid rgba(255,255,255,.35); pointer-events: none; }
  #camMeta { font-size: 13px; color: rgba(255,255,255,.75); margin-top: 8px; font-variant-numeric: tabular-nums; }
  #camWarn { font-size: 13px; color: #fcd34d; margin-top: 6px; line-height: 18px; }
  #camWarn:empty { display: none; }
  #lightTitle { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; margin-top: 10px; }
  .ldot { width: 9px; height: 9px; border-radius: 50%; background: #f59e0b; }
  #light.good .ldot { background: #22c55e; } #light.wait .ldot { background: rgba(255,255,255,.4); }
  #lightTips { margin: 6px 0 0; padding-left: 18px; font-size: 13px; line-height: 19px; color: rgba(255,255,255,.85); }
  .row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .row button { flex: 1; }
  label.opt { display: flex; align-items: center; gap: 8px; font-size: 14px; margin-top: 6px; }
  select { font: 500 14px var(--font-sans); background: #16161d; color: #fff; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 6px 8px; }
  #prompterWrap { position: relative; display: flex; align-items: center; justify-content: center; padding: 4vh 5vw; min-height: 0; overflow: hidden; cursor: default; }
  /* THE PROMPTER: large type, sized by the reader (A- / A+), read at 8-10
     ft. The karaoke classes are the booth's own (core/prompter.ts paints
     them): spoken words bright, the ones ahead dim, emphasis underlined. */
  #prompt { --pt: 64; width: 100%; max-width: 1400px; text-align: center; }
  #prompt.mirror { transform: scaleX(-1); }
  #cue { font-size: calc(var(--pt) * 1px); line-height: 1.22; font-weight: 600; color: #fff; text-wrap: balance; min-height: 1.2em; }
  #cue .w { color: rgba(255,255,255,.4); transition: color .12s linear; }
  #cue .w.on { color: #fff; }
  #cue .w.em { color: rgba(170,172,255,.62); }
  #cue .w.em.on { color: #fff; text-decoration: underline; text-decoration-color: #8f91ff; text-decoration-thickness: .08em; text-underline-offset: .14em; }
  #cue .w.dash { color: rgba(255,255,255,.4) !important; }
  #cue.idle { color: rgba(255,255,255,.55); }
  #next { margin-top: .5em; font-size: calc(var(--pt) * .62px); line-height: 1.3; font-weight: 500; color: rgba(255,255,255,.72); text-wrap: balance; }
  #next2 { margin-top: .4em; font-size: calc(var(--pt) * .5px); line-height: 1.3; color: rgba(255,255,255,.45); text-wrap: balance; }
  #count { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; font-size: 30vh; font-weight: 700; background: rgba(11,11,16,.72); }
  #foot { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-top: 1px solid rgba(255,255,255,.08); }
  #timer { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 22px; min-width: 110px; }
  #timer.rec::before { content: ''; display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ef4444; margin-right: 10px; animation: blink 1s infinite; }
  @keyframes blink { 50% { opacity: .25; } }
  #status { flex: 1; font-size: 15px; color: rgba(255,255,255,.8); }
  #status.err { color: #fca5a5; }
  .prog { width: 180px; height: 6px; border-radius: 9999px; background: rgba(255,255,255,.12); overflow: hidden; display: none; }
  .prog.on { display: block; }
  .prog i { display: block; height: 100%; width: 0%; background: #fff; transition: width .2s; }
  #startBtn { font-size: 18px; font-weight: 600; padding: 14px 34px; background: #ef4444; border-color: #ef4444; color: #fff; }
  #startBtn.stop { background: #fff; color: #0b0b10; border-color: #fff; }
  .sheet { position: fixed; inset: 0; background: rgba(0,0,0,.72); display: flex; align-items: center; justify-content: center; z-index: 10; }
  .sheet[hidden], .drawer[hidden] { display: none; }
  .reviewCard { background: #14141b; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 20px; width: min(960px, 92vw); }
  .reviewCard h2 { margin: 0 0 4px; font-size: 20px; }
  #play { width: 100%; max-height: 62vh; background: #000; border-radius: 10px; margin-top: 10px; }
  #keepBtn { background: #fff; color: #0b0b10; font-weight: 600; }
  .drawer { position: fixed; top: 0; bottom: 0; left: 0; width: min(520px, 94vw); background: #111117; border-right: 1px solid rgba(255,255,255,.1); z-index: 11; display: flex; flex-direction: column; }
  .drawerHead { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid rgba(255,255,255,.08); }
  .drawerHead h2 { margin: 0; font-size: 18px; }
  #filmList { overflow-y: auto; padding: 8px 12px 24px; }
  .film { margin: 12px 0 4px; }
  .film .fh { display: flex; align-items: baseline; gap: 8px; padding: 0 6px 6px; }
  .film .fh b { font-size: 15px; } .film .fh small { color: rgba(255,255,255,.55); font-size: 12px; }
  button.sc { display: flex; width: 100%; text-align: left; gap: 10px; align-items: flex-start; margin: 4px 0; background: rgba(255,255,255,.04); }
  button.sc.cur { outline: 2px solid #fff; }
  button.sc small { display: block; color: rgba(255,255,255,.55); font-size: 12px; line-height: 16px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 6px; flex: 0 0 auto; background: rgba(255,255,255,.25); }
  .dot.needed { background: #f59e0b; } .dot.provided { background: #22c55e; }
  #nextBtn[hidden] { display: none; }
  @media (max-width: 820px) { #main { grid-template-columns: 1fr; } #side { border-right: 0; } }
</style>
</head>
<body>
<header id="bar">
  <button id="filmBtn" type="button" title="Pick the film and scene"><b id="filmName">Loading…</b><small id="sceneName">Films</small></button>
  <span id="pair" class="pill">Connecting…</span>
  <span class="grow"></span>
  <span class="seg" id="shotSeg" role="group" aria-label="Shot size"><button type="button" data-shot="close">Close</button><button type="button" data-shot="medium">Medium</button><button type="button" data-shot="wide">Wide</button></span>
  <button id="mirrorBtn" type="button" aria-pressed="false" title="Mirror the prompter for teleprompter glass">Mirror</button>
  <span class="seg"><button id="smallerBtn" type="button" title="Smaller type">A−</button><button id="biggerBtn" type="button" title="Bigger type">A+</button></span>
</header>
<main id="main">
  <aside id="side">
    <div class="card" id="pairCard">
      <h3>Pair the camera</h3>
      <img id="qr" alt="Scan with the phone that will film you">
      <p class="note">Scan with the phone that will film you. It opens as the camera (the rear one) and stays paired while you move between films. Put it on the tripod: a wide film records with the phone on its side. The code carries your sign-in, so don’t share it.</p>
      <p class="note"><a id="camLink" href="#" target="_blank" rel="noopener">camera link</a></p>
      <p class="note">No phone? Start still runs the prompter and timer; record on any camera and use <b>Upload a file</b>.</p>
    </div>
    <div class="card" id="camCard" hidden>
      <h3>Camera</h3>
      <div id="pvWrap"><canvas id="pv" width="320" height="180"></canvas><div id="oval"></div><div id="eyes"></div></div>
      <div id="camMeta"></div>
      <div id="camWarn"></div>
      <div id="light" class="wait"><div id="lightTitle"><i class="ldot"></i><span id="lightText">Checking your light…</span></div><ul id="lightTips"></ul></div>
      <div class="row"><button id="flipBtn" type="button">Flip camera</button><button id="lockBtn" type="button">Lock exposure</button></div>
    </div>
    <div class="card" id="takeCard">
      <h3>The take</h3>
      <label class="opt"><input type="checkbox" id="softLook" checked> Soft look <span class="note" style="margin:0">(smoothing, applied on arrival)</span></label>
      <label class="opt" id="bgRow">Background <select id="bg"><option value="room">Room</option><option value="blur">Blur</option><option value="alpha">Alpha</option></select></label>
      <p class="note">At this distance the phone’s mic hears the room: wear a lav mic.</p>
    </div>
  </aside>
  <section id="prompterWrap">
    <div id="prompt"><div id="cue" class="idle"></div><div id="next"></div><div id="next2"></div></div>
    <div id="count"></div>
  </section>
</main>
<footer id="foot">
  <span id="timer">0:00</span>
  <span id="status">Loading the script…</span>
  <div class="prog" id="upProg"><i id="upFill"></i></div>
  <button id="nextBtn" type="button" hidden>Next scene</button>
  <button id="uploadBtn" type="button" title="Attach a file recorded on any camera to this scene">Upload a file</button>
  <input type="file" id="fileIn" accept="video/*" hidden>
  <button id="startBtn" type="button">Start</button>
</footer>
<div id="review" class="sheet" hidden>
  <div class="reviewCard">
    <h2>Review</h2>
    <p class="note" id="reviewMeta"></p>
    <video id="play" controls playsinline></video>
    <div class="row"><button id="retakeBtn" type="button">Retake</button><button id="keepBtn" type="button">Keep</button></div>
  </div>
</div>
<div id="films" class="drawer" hidden>
  <div class="drawerHead"><h2>Films</h2><button id="filmsClose" type="button" aria-label="Close">×</button></div>
  <div id="filmList"><p class="note">Loading…</p></div>
</div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var enc = encodeURIComponent;
  var qp = new URLSearchParams(location.search);
  var token = qp.get('token') || '';
  var tenant = qp.get('tenant') || '';
  ${RB_SOCKET_JS}
  if (!tenant && token) tenant = tenantOf(token);
  var project = qp.get('project') || '';
  var sceneQ = qp.get('scene');
  // Doubled backslash-free: a digit test by hand, not a regex class.
  var scene = sceneQ === 'all' ? 'all' : (sceneQ && String(Number(sceneQ)) === sceneQ && Number(sceneQ) >= 0 ? Number(sceneQ) : 0);
  function withToken(url) { return token ? url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + enc(token) : url; }
  function status(text, kind) { var s = $('status'); s.textContent = text; s.className = kind === 'err' ? 'err' : ''; }
  if (!tenant) { status('Missing ?tenant= in the link (or a token that carries it). Open the remote booth from Studio.', 'err'); return; }

  // ── state ──────────────────────────────────────────────────────────────
  // idle -> counting -> (rolling: waiting for the phone's "recording") ->
  // recording -> stopping -> uploading -> review -> attaching -> idle.
  // Local (no phone): idle -> counting -> recording -> idle.
  var st = { mode: 'idle', session: '', cameraPresent: false, camera: null, target: null, film: null, take: null, remote: false, previews: 0, joined: false };
  window.__rb = st; // read by the browser test; nothing here trusts it
  var cues = [], total = 0;
  ${PROMPTER_TIMING_JS}
  ${PROMPTER_VIEW_JS}
  ${LIGHT_CHECK_JS}

  // ── preferences: remembered on this screen only ──────────────────────
  var PREF_KEY = 'mp.remote.prefs';
  var prefs = { pt: 64, mirror: false, shot: 'medium' };
  try { var sp = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); if (sp) for (var pk in sp) prefs[pk] = sp[pk]; } catch (e) {}
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }
  function applyPrefs() {
    prefs.pt = Math.max(28, Math.min(160, Number(prefs.pt) || 64));
    $('prompt').style.setProperty('--pt', String(prefs.pt));
    $('prompt').classList.toggle('mirror', !!prefs.mirror);
    $('mirrorBtn').setAttribute('aria-pressed', prefs.mirror ? 'true' : 'false');
    if (prefs.shot !== 'close' && prefs.shot !== 'medium' && prefs.shot !== 'wide') prefs.shot = 'medium';
    [].forEach.call(document.querySelectorAll('#shotSeg button'), function (b) { b.classList.toggle('on', b.getAttribute('data-shot') === prefs.shot); });
    placeGuide(); lcSmooth = null; lcShown = null;
  }
  $('smallerBtn').addEventListener('click', function () { prefs.pt -= 8; applyPrefs(); savePrefs(); });
  $('biggerBtn').addEventListener('click', function () { prefs.pt += 8; applyPrefs(); savePrefs(); });
  $('mirrorBtn').addEventListener('click', function () { prefs.mirror = !prefs.mirror; applyPrefs(); savePrefs(); });
  [].forEach.call(document.querySelectorAll('#shotSeg button'), function (b) { b.addEventListener('click', function () { prefs.shot = b.getAttribute('data-shot'); applyPrefs(); savePrefs(); }); });
  // A clicked button keeps focus, and the space bar would press it again
  // instead of reaching the prompter: hand focus back to the page.
  document.addEventListener('click', function (ev) { var b = ev.target && ev.target.closest && ev.target.closest('button'); if (b) setTimeout(function () { try { b.blur(); } catch (e) {} }, 0); });

  // ── the session: pair once, keep it across reloads and tabs ─────────
  var SESSION_KEY = 'mp.remote.session.' + tenant;
  function storedSession() { try { return localStorage.getItem(SESSION_KEY) || ''; } catch (e) { return ''; } }
  function storeSession(id) { try { if (id) localStorage.setItem(SESSION_KEY, id); else localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  st.session = storedSession();
  var sock = rbSocket({ role: 'control', tenant: tenant, token: token, session: function () { return st.session; }, onMessage: onMessage,
    onClose: function () { st.joined = false; pairUi(); } });

  function camUrl() { return location.origin + '/remote-camera?tenant=' + enc(tenant) + '&session=' + enc(st.session) + (token ? '&token=' + enc(token) : ''); }
  function showQr() {
    if (!st.session) return;
    $('qr').src = withToken('/api/take-qr/' + enc(tenant) + '/' + enc(project || 'none') + '?session=' + enc(st.session));
    $('camLink').href = camUrl(); $('camLink').textContent = 'Or open this link on the phone';
  }

  function pairUi() {
    var c = st.camera, p = $('pair');
    $('pairCard').hidden = st.cameraPresent;
    $('camCard').hidden = !st.cameraPresent;
    if (!st.joined) { p.className = 'pill'; p.textContent = 'Reconnecting…'; }
    else if (st.cameraPresent && c) { p.className = 'pill ok'; p.textContent = 'Phone paired · ' + c.width + '×' + c.height + (c.fps ? ' · ' + Math.round(c.fps) + ' fps' : ''); }
    else if (st.cameraPresent) { p.className = 'pill ok'; p.textContent = 'Phone paired · opening its camera'; }
    else { p.className = 'pill'; p.textContent = 'No phone yet · prompter only'; }
    if (c && st.cameraPresent) {
      $('camMeta').textContent = (c.camera === 'user' ? 'Front' : 'Rear') + ' camera · ' + c.width + '×' + c.height + (c.fps ? ' · ' + Math.round(c.fps) + ' fps' : '') + (c.locks && c.locks.length ? ' · can lock ' + c.locks.join(' + ') : '');
      var warn = [];
      var f = frame();
      if (c.width && c.height && ((c.width >= c.height) !== (f.w >= f.h))) warn.push(f.w >= f.h ? 'Turn the phone on its side: this film is wide.' : 'Stand the phone upright: this film is tall.');
      // THE HONEST LIMIT (SPEC-remote-booth.md): iPhone Safari may cap the
      // camera at 1080p; say so, and name the true-4K route.
      if (Math.min(c.width || 0, c.height || 0) < 2160) warn.push('This phone’s browser gives ' + c.width + '×' + c.height + '. Fine for the film; keep punch-ins at 1.2x or less. For true 4K, record in the phone’s Camera app and use Upload a file.');
      if (c.battery && c.battery.level < 0.2 && !c.battery.charging) warn.push('The phone’s battery is at ' + Math.round(c.battery.level * 100) + '%: plug it in.');
      $('camWarn').textContent = warn.join(' ');
      $('lockBtn').disabled = !(c.locks && c.locks.length);
      $('lockBtn').title = c.locks && c.locks.length ? 'Freeze exposure and white balance at what the camera sees now' : 'This phone’s browser offers no lock (iOS Safari): the correction on arrival covers it';
    }
    $('uploadBtn').disabled = st.mode !== 'idle';
    $('filmBtn').disabled = st.mode !== 'idle';
  }

  // ── the target: which film and scene this booth records ─────────────
  function frame() {
    var c = (st.film && st.film.canvas) || (st.target && st.target.canvas) || { width: 1920, height: 1080 };
    return { w: Number(c.width) || 1920, h: Number(c.height) || 1080 };
  }
  function sameTarget(a, b) { return !!a && !!b && a.project === b.project && String(a.scene) === String(b.scene); }
  function applyTarget(t) {
    var reload = !sameTarget(st.target, t) || !st.film;
    st.target = t; project = t.project; scene = t.scene;
    try { history.replaceState(null, '', '/remote-booth?tenant=' + enc(tenant) + '&project=' + enc(project) + '&scene=' + enc(String(scene)) + (token ? '&token=' + enc(token) : '')); } catch (e) {}
    if (reload) loadScript();
    else pairUi();
  }
  function isSpk(c0) { return !!(c0 && c0.type === 'video' && c0.data && (c0.data.src === 'speaker' || c0.data.src === 'speaker-alpha' || c0.data.speaker_layer === true)); }
  function loadScript() {
    var want = { project: project, scene: scene };
    status('Loading the script…');
    return fetch(withToken('/api/projects/' + enc(tenant) + '/' + enc(project)))
      .then(function (r) { if (!r.ok) throw new Error('Could not load the film (' + r.status + ').'); return r.json(); })
      .then(function (p) {
        if (!sameTarget(want, { project: project, scene: scene })) return; // retargeted meanwhile
        var all = (p.storyboard && p.storyboard.scenes) || [];
        var scenes = scene === 'all' ? all : (all[scene] ? [all[scene]] : []);
        var grammar = (p.treatment && p.treatment.filmGrammar) || '';
        st.film = { name: p.name || project, canvas: p.canvas, grammar: grammar, sceneCount: all.length };
        cues = buildCues(scenes);
        total = cues.reduce(function (a, c) { return a + c.dur; }, 0);
        $('filmName').textContent = st.film.name;
        var lbl = scene === 'all' ? 'All scenes, one take' : ('Scene ' + (scene + 1) + (all[scene] && all[scene].label ? ' · ' + String(all[scene].label).replace(/^Scene [0-9]+ *[-–—:·] */i, '') : ''));
        $('sceneName').textContent = lbl + ' · change';
        document.title = st.film.name + ' — remote booth';
        // The booth's defaults: the scene's own background (its speaker
        // component), soft look on. A clip on a film no person carries has
        // no background to choose.
        var built = (p.scenes || [])[scene === 'all' ? 0 : scene];
        var spk = built && (built.components || []).filter(isSpk)[0];
        $('bg').value = spk ? (spk.data.background || (spk.data.src === 'speaker-alpha' ? 'alpha' : 'room')) : 'room';
        $('bgRow').style.display = (grammar === 'speaker' || grammar === 'creator-cut') ? '' : 'none';
        showIdle();
        status(cues.length ? (cues.length + (cues.length === 1 ? ' line' : ' lines') + ' · about ' + fmt(total) + ' at speaking pace. ' + (st.cameraPresent ? 'Press Start or the space bar.' : 'Pair the phone, or press Start for the prompter alone.')) : 'This scene has no spoken lines. You can still record.');
        pairUi();
      })
      .catch(function (e) { status(e.message || String(e), 'err'); });
  }
  // Before the take: the first lines, still, so the reader sees what is coming.
  function showIdle() {
    clearPrompter();
    var c0 = cues[0];
    $('cue').className = 'idle';
    $('cue').textContent = c0 ? c0.text : 'No lines on this scene.';
    $('next').textContent = cues[1] ? cues[1].text : '';
    $('next2').textContent = cues[2] ? cues[2].text : '';
  }

  // ── the socket's messages ──────────────────────────────────────────────
  function onMessage(name, m) {
    if (name === 'joined') {
      st.joined = true; st.session = m.session; storeSession(m.session);
      st.cameraPresent = !!(m.peers && m.peers.camera);
      showQr();
      // The link's film wins when it differs from the session's: a second
      // "Across the room" from Studio moves the paired phone to that scene.
      if (project && !sameTarget(m.target, { project: project, scene: scene })) sock.send('target', { project: project, scene: scene });
      else if (m.target) applyTarget(m.target);
      pairUi();
      return;
    }
    if (name === 'target') { applyTarget(m.target); return; }
    if (name === 'peer') {
      if (m.role !== 'camera') return;
      st.cameraPresent = !!m.present;
      if (!m.present) { st.camera = null; if (st.mode === 'recording' || st.mode === 'stopping' || st.mode === 'uploading') status('The phone dropped off the connection. It keeps recording on its own; it reconnects and carries on.', 'err'); }
      pairUi(); return;
    }
    if (name === 'hello') { st.camera = m; st.cameraPresent = true; pairUi(); reconcile(m); return; }
    if (name === 'preview') { drawPreview(m); return; }
    if (name === 'recording') { onRecording(m); return; }
    if (name === 'stopped') { st.mode = 'uploading'; progress(0); status('The phone saved the take (' + fmt(m.duration || 0) + '). Uploading…'); return; }
    if (name === 'uploading') { if (st.mode === 'stopping') st.mode = 'uploading'; progress(m.pct); status('Uploading ' + Math.round(m.pct || 0) + '%'); return; }
    if (name === 'uploaded') { st.take = { url: m.url, duration: m.duration, width: m.width, height: m.height, mime: m.mime, size: m.size, by: 'camera', project: m.project, scene: m.scene }; openReview(); return; }
    if (name === 'attached') { onAttached(m); return; }
    if (name === 'attach-failed') { st.mode = 'review'; $('keepBtn').disabled = false; $('retakeBtn').disabled = false; status('Could not attach: ' + (m.error || 'unknown error') + '. Try Keep again.', 'err'); $('review').hidden = false; return; }
    if (name === 'status') { status(m.text || '', m.error ? 'err' : ''); return; }
    if (name === 'replaced') { sock.stop(); st.joined = false; status('The remote booth is open in another tab now; this one has stepped aside.', 'err'); return; }
    if (name === 'expired') { storeSession(''); st.session = ''; st.cameraPresent = false; sock.rejoin(); status('The pairing ended after hours idle. Scan the new code with the phone.'); return; }
    if (name === 'error') {
      if (m.code === 'forbidden' || m.code === 'not-found') { storeSession(''); st.session = ''; }
      status(m.error || 'Something went wrong on the connection.', 'err'); return;
    }
  }
  // A phone that rejoins mid-take tells us where it is.
  function reconcile(h) {
    if (h.state === 'recording' && st.mode === 'stopping') sock.send('stop');
    if (h.state === 'review' && h.pending && st.mode !== 'review' && st.mode !== 'attaching') { st.take = h.pending; st.take.by = 'camera'; openReview(); }
    if (h.state === 'idle' && (st.mode === 'stopping' || st.mode === 'uploading')) { st.mode = 'idle'; progress(null); status('The phone lost that take (it restarted). Record it again.', 'err'); resetTake(); }
  }

  // ── preview + light check ─────────────────────────────────────────────
  // The phone sends ~320 px stills of exactly the frame it records; the
  // oval and the measurement use the booth's own numbers
  // (core/light-check.ts) at the chosen shot size.
  var pvBusy = false, lcSmooth = null, lcShown = null, lastLc = 0;
  function drawPreview(m) {
    if (pvBusy || typeof m.jpeg !== 'string' || m.jpeg.indexOf('data:image/jpeg;base64,') !== 0) return;
    pvBusy = true;
    var img = new Image();
    img.onload = function () {
      pvBusy = false;
      var cv = $('pv');
      if (cv.width !== img.naturalWidth || cv.height !== img.naturalHeight) { cv.width = img.naturalWidth; cv.height = img.naturalHeight; }
      cv.getContext('2d').drawImage(img, 0, 0);
      st.previews++;
      placeGuide();
      if ((st.mode === 'idle' || st.mode === 'counting') && performance.now() - lastLc > 450) { lastLc = performance.now(); try { sampleLight(); } catch (e) {} }
    };
    img.onerror = function () { pvBusy = false; };
    img.src = m.jpeg;
  }
  function placeGuide() {
    var cv = $('pv'), r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var o = guideOval(r.width, r.height, prefs.shot);
    var ov = $('oval').style;
    ov.left = (o.cx - o.rx) + 'px'; ov.top = (o.cy - o.ry) + 'px'; ov.width = (2 * o.rx) + 'px'; ov.height = (2 * o.ry) + 'px';
    var ey = $('eyes').style;
    ey.left = (o.cx - o.rx * 1.7) + 'px'; ey.width = (o.rx * 3.4) + 'px'; ey.top = o.eyeY + 'px';
  }
  window.addEventListener('resize', placeGuide);
  function sampleLight() {
    var cv = $('pv'), w = cv.width, h = cv.height;
    if (!w || !h) return;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    var s = lightStats(ctx.getImageData(0, 0, w, h).data, w, h, prefs.shot);
    if (!lcSmooth) lcSmooth = s; else for (var k in s) lcSmooth[k] = lcSmooth[k] * 0.6 + s[k] * 0.4;
    var tips = lightAdvice(lcSmooth), good = !tips.length;
    var key = tips.map(function (t) { return t.text; }).join('|');
    if (key === lcShown) return;
    lcShown = key;
    $('light').className = good ? 'good' : '';
    $('lightText').textContent = good ? 'Light looks good' : 'Light check';
    var ul = $('lightTips'); ul.innerHTML = '';
    tips.forEach(function (t) { var li = document.createElement('li'); li.textContent = t.text; ul.appendChild(li); });
  }
  $('flipBtn').addEventListener('click', function () { var c = st.camera; sock.send('settings', { facing: c && c.camera === 'user' ? 'environment' : 'user' }); status('Flipping the phone’s camera…'); });
  $('lockBtn').addEventListener('click', function () { sock.send('settings', { lock: true }); status('Exposure and white balance locked on the phone.'); });

  // ── start / stop ───────────────────────────────────────────────────────
  var countTimer = null, rollTimer = null, tickTimer = null, t0 = 0;
  function setStartBtn() {
    var b = $('startBtn'), rolling = st.mode === 'counting' || st.mode === 'rolling' || st.mode === 'recording';
    b.textContent = rolling ? 'Stop' : 'Start';
    b.classList.toggle('stop', rolling);
    b.disabled = !(st.mode === 'idle' || rolling);
    pairUi();
  }
  function count(done) {
    var n = 3, el = $('count');
    el.style.display = 'flex'; el.textContent = String(n);
    countTimer = setInterval(function () {
      n -= 1;
      if (n > 0) { el.textContent = String(n); return; }
      clearInterval(countTimer); countTimer = null; el.style.display = 'none';
      done();
    }, 1000);
  }
  function start() {
    if (st.mode !== 'idle' || !st.target) return;
    $('nextBtn').hidden = true;
    st.remote = st.cameraPresent;
    // The phone counts the same 3-2-1 from this message; a 100-300 ms
    // relay lag is invisible once the take re-times the scene to the words
    // actually spoken (the measured spine).
    if (st.remote) sock.send('start', { t: Date.now() });
    st.mode = 'counting'; setStartBtn();
    status(st.remote ? 'Rolling in 3…' : 'Prompter only: record on your camera now.');
    count(function () {
      if (st.mode !== 'counting') return;
      if (!st.remote) { beginTake(); return; }
      st.mode = 'rolling'; status('Waiting for the phone to roll…'); setStartBtn();
      rollTimer = setTimeout(function () {
        if (st.mode !== 'rolling') return;
        st.mode = 'idle'; setStartBtn(); showIdle();
        status('The phone did not start recording. Is its screen on? Press Start to try again.', 'err');
      }, 7000);
    });
  }
  function onRecording(m) {
    if (st.mode !== 'counting' && st.mode !== 'rolling') return;
    if (countTimer) { clearInterval(countTimer); countTimer = null; $('count').style.display = 'none'; }
    clearTimeout(rollTimer);
    st.recInfo = m;
    beginTake();
  }
  function beginTake() {
    st.mode = 'recording'; setStartBtn();
    t0 = performance.now();
    $('timer').classList.add('rec');
    tickTimer = setInterval(function () { var el = (performance.now() - t0) / 1000; $('timer').textContent = fmt(el) + (total ? ' / ' + fmt(total) : ''); }, 200);
    status(st.remote ? 'Recording on the phone' + (st.recInfo && st.recInfo.width ? ' · ' + st.recInfo.width + '×' + st.recInfo.height : '') + '. Space or → for the next line, Esc to stop.' : 'Prompter running. Space or → for the next line, Esc to stop.');
    $('cue').className = '';
    showCue(0);
  }
  function endTakeUi() {
    if (tickTimer) clearInterval(tickTimer); tickTimer = null;
    $('timer').classList.remove('rec');
    clearPrompter(); showIdle();
  }
  function stop() {
    if (st.mode === 'counting' || st.mode === 'rolling') {
      if (countTimer) { clearInterval(countTimer); countTimer = null; $('count').style.display = 'none'; }
      clearTimeout(rollTimer);
      if (st.remote) sock.send('stop');
      st.mode = 'idle'; setStartBtn(); status('Stopped before the take began.'); return;
    }
    if (st.mode !== 'recording') return;
    var dur = (performance.now() - t0) / 1000;
    endTakeUi();
    if (!st.remote) {
      st.mode = 'idle'; setStartBtn();
      status('Stopped at ' + fmt(dur) + '. Upload the file from your camera when it is ready (Upload a file).');
      return;
    }
    sock.send('stop');
    st.mode = 'stopping'; setStartBtn();
    status('Stopping… the phone is saving the take.');
  }
  $('startBtn').addEventListener('click', function () { if (st.mode === 'idle') start(); else stop(); });
  $('prompterWrap').addEventListener('click', function () { if (st.mode === 'recording') advance(); });
  function advance() {
    // Past the last line, the next press stops: a clicker's "next" ends
    // the take without a walk to the laptop.
    if (cueIdx >= cues.length) { stop(); return; }
    showCue(cueIdx + 1);
  }
  function back() { if (cueIdx > 0) showCue(Math.min(cueIdx, cues.length) - 1); }
  // KEYS: the space bar, arrows, and a presentation clicker (they send
  // PageDown / PageUp / arrows, and "b" or "." for the blank key). Before
  // the take a "next" starts it; during it "next" advances the line and
  // "back" repeats one; Esc or the blank key stops.
  document.addEventListener('keydown', function (ev) {
    var tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!$('films').hidden) { if (ev.key === 'Escape') closeFilms(); return; }
    if (!$('review').hidden) return;
    var k = ev.key;
    var next = k === ' ' || k === 'Spacebar' || k === 'PageDown' || k === 'ArrowRight' || k === 'ArrowDown';
    var prev = k === 'PageUp' || k === 'ArrowLeft' || k === 'ArrowUp';
    var halt = k === 'Escape' || k === 'b' || k === 'B' || k === '.';
    if (!next && !prev && !halt) return;
    ev.preventDefault();
    if (st.mode === 'idle') { if (next) start(); return; }
    if (st.mode === 'counting' || st.mode === 'rolling') { if (halt) stop(); return; }
    if (st.mode === 'recording') { if (next) advance(); else if (prev) back(); else stop(); }
  });
  document.addEventListener('keyup', function (ev) { if (ev.key === ' ') ev.preventDefault(); });

  // ── upload progress, review, keep / retake ─────────────────────────────
  function progress(pct) {
    if (pct === null || pct === undefined) { $('upProg').classList.remove('on'); return; }
    $('upProg').classList.add('on'); $('upFill').style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function openReview() {
    var t = st.take;
    st.mode = 'review'; setStartBtn(); progress(null);
    $('play').src = withToken(t.url); try { $('play').load(); } catch (e) {}
    $('reviewMeta').textContent = [t.duration ? fmt(t.duration) : '', t.width && t.height ? t.width + '×' + t.height : '', t.size ? (t.size / 1048576).toFixed(1) + ' MB' : '', t.by === 'upload' ? 'uploaded file' : 'from the phone'].filter(Boolean).join(' · ');
    $('keepBtn').disabled = false; $('retakeBtn').disabled = false;
    $('review').hidden = false;
    status('Review the take: Keep attaches it to the scene, Retake throws it away.');
  }
  function resetTake() { st.take = null; $('play').removeAttribute('src'); try { $('play').load(); } catch (e) {} $('review').hidden = true; }
  $('retakeBtn').addEventListener('click', function () {
    if (st.take && st.take.by === 'camera') sock.send('retake');
    resetTake(); st.mode = 'idle'; setStartBtn(); showIdle(); status('Thrown away. Press Start for the next take.');
  });
  function keepBody() {
    var t = st.take, sc = t.scene !== undefined ? t.scene : scene;
    return { url: t.url, duration: t.duration || undefined, mime: t.mime || undefined, capture: t.by === 'upload' ? 'upload' : 'remote',
      look: $('softLook').checked ? 'soft' : 'natural', soft_strength: 0.5,
      background: $('bgRow').style.display === 'none' ? undefined : $('bg').value,
      scene_index: sc, width: t.width || undefined, height: t.height || undefined };
  }
  $('keepBtn').addEventListener('click', function () {
    if (!st.take || st.mode !== 'review') return;
    st.mode = 'attaching'; $('keepBtn').disabled = true; $('retakeBtn').disabled = true;
    status('Attaching the take to the scene… (the phone sends it through the booth’s own path)');
    var b = keepBody();
    // The phone attaches its own take (the spec's keep); a phone that has
    // gone away, or a file uploaded here, attaches from this screen through
    // the same route.
    if (st.take.by === 'camera' && st.cameraPresent && sock.send('keep', { look: b.look, soft_strength: b.soft_strength, background: b.background })) return;
    fetch(withToken('/api/take/' + enc(tenant) + '/' + enc(st.take.project || project)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('attach failed (' + r.status + ')')); return j; }); })
      .then(function (j) { onAttached({ scene_index: b.scene_index, project: st.take.project || project, open_needs: j.open_needs }); })
      .catch(function (e) { st.mode = 'review'; $('keepBtn').disabled = false; $('retakeBtn').disabled = false; status('Could not attach: ' + (e.message || e), 'err'); });
  });
  function onAttached(m) {
    resetTake(); st.mode = 'idle'; setStartBtn(); showIdle();
    var sc = m.scene_index === 'all' ? 'every scene' : 'Scene ' + (Number(m.scene_index) + 1);
    status('Kept — ' + sc + ' has its take. It gets the correction, the cut and the captions on its own.');
    suggestNext();
  }
  // After a keep: the next scene of this film still owed a take, one press away.
  function suggestNext() {
    fetchFilms().then(function (films) {
      var f = films.filter(function (x) { return x.project_id === project; })[0];
      var nx = f && f.scenes.filter(function (s) { return s.need === 'needed' && s.index !== scene; })[0];
      if (!nx) return;
      var b = $('nextBtn'); b.hidden = false; b.textContent = 'Next: Scene ' + (nx.index + 1);
      b.onclick = function () { b.hidden = true; pick(project, nx.index); };
    }).catch(function () {});
  }

  // THE FALLBACK: any camera, same prompter. The file goes up through the
  // upload route and attaches to this scene after review, as a phone take would.
  $('uploadBtn').addEventListener('click', function () { if (st.mode === 'idle') $('fileIn').click(); });
  $('fileIn').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = '';
    if (!f || st.mode !== 'idle') return;
    var ext = (String(f.name).split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    var name = 'camera-take-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
    var tgt = { project: project, scene: scene };
    st.mode = 'uploading'; setStartBtn(); progress(0); status('Uploading ' + f.name + '…');
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/upload-asset/' + enc(tenant) + '/' + enc(tgt.project) + '?name=' + enc(name)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = function (ev) { if (ev.lengthComputable) { var p = Math.round(ev.loaded / ev.total * 100); progress(p); status('Uploading ' + p + '%'); } };
    xhr.onerror = function () { st.mode = 'idle'; setStartBtn(); progress(null); status('Upload failed (network). Try again.', 'err'); };
    xhr.onload = function () {
      var up = null; try { up = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status < 200 || xhr.status >= 300 || !up || !up.url) { st.mode = 'idle'; setStartBtn(); progress(null); status('Upload failed (' + xhr.status + ').', 'err'); return; }
      st.take = { url: up.url, size: f.size, by: 'upload', project: tgt.project, scene: tgt.scene, mime: f.type || undefined };
      openReview();
    };
    xhr.send(f);
  });

  // ── the film + scene picker: pair once, record many films ──────────────
  function fetchFilms() {
    return fetch(withToken('/api/booth-films/' + enc(tenant))).then(function (r) { if (!r.ok) throw new Error('films ' + r.status); return r.json(); }).then(function (j) { return j.films || []; });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function openFilms() {
    if (st.mode !== 'idle') return;
    $('films').hidden = false;
    $('filmList').innerHTML = '<p class="note">Loading…</p>';
    fetchFilms().then(function (films) {
      if (!films.length) { $('filmList').innerHTML = '<p class="note">No speaker or creator-cut films yet.</p>'; return; }
      var h = '';
      films.forEach(function (f) {
        h += '<div class="film"><div class="fh"><b>' + esc(f.name) + '</b><small>' + esc(f.grammar) + (f.frame ? ' · ' + esc(f.frame) : '') + ' · ' + (f.open ? f.open + ' to record' : 'all recorded') + '</small></div>';
        f.scenes.forEach(function (s) {
          var cur = f.project_id === project && String(s.index) === String(scene);
          h += '<button type="button" class="sc' + (cur ? ' cur' : '') + '" data-p="' + esc(f.project_id) + '" data-s="' + s.index + '"><i class="dot ' + s.need + '"></i><span>Scene ' + (s.index + 1) + ' · ' + esc(String(s.label).replace(/^Scene [0-9]+ *[-–—:·] */i, '')) +
            ' <small>' + (s.need === 'needed' ? 'needs a take' : s.need === 'provided' ? 'has a take' : 'no take asked') + (s.lines ? ' · ' + esc(s.lines.slice(0, 90)) : '') + '</small></span></button>';
        });
        h += '</div>';
      });
      $('filmList').innerHTML = h;
      [].forEach.call($('filmList').querySelectorAll('button.sc'), function (b) {
        b.addEventListener('click', function () { pick(b.getAttribute('data-p'), Number(b.getAttribute('data-s'))); });
      });
    }).catch(function (e) { $('filmList').innerHTML = '<p class="note">Could not load the films (' + esc(e.message || e) + ').</p>'; });
  }
  function closeFilms() { $('films').hidden = true; }
  function pick(p, s) {
    closeFilms();
    if (st.mode !== 'idle') return;
    status('Switching to scene ' + (s + 1) + '…');
    // Through the session when it is up (the phone follows); alone otherwise.
    if (st.joined && sock.send('target', { project: p, scene: s })) return;
    applyTarget({ project: p, scene: s });
  }
  $('filmBtn').addEventListener('click', openFilms);
  $('filmsClose').addEventListener('click', closeFilms);

  applyPrefs();
  // The script loads at once, phone or no phone: the prompter never waits on the relay.
  if (project) applyTarget({ project: project, scene: scene });
  else { status('Pick a film to record.'); openFilms(); }
  setStartBtn();
})();
</script>
</body>
</html>`;
}

/** The camera page: the phone on the tripod. */
export function getRemoteCameraHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#000000">
<link rel="icon" href="data:,">
${QUOTIENT_FONT_LINKS}
<title>Camera · Remote booth</title>
<style>
${QUOTIENT_CSS}
  /* The phone is the camera and nothing else: the picture, one big status
     line, a flip button. Everything else happens on the big screen. */
  html, body { height: 100%; margin: 0; background: #000; color: #fff; overflow: hidden; overscroll-behavior: none; }
  * { -webkit-tap-highlight-color: transparent; }
  #live { position: absolute; left: 50%; top: 50%; width: 100%; max-height: 100%; transform: translate(-50%, -50%); aspect-ratio: var(--fw, 16) / var(--fh, 9); object-fit: cover; background: #000; }
  #live.mirror { transform: translate(-50%, -50%) scaleX(-1); }
  #cap { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  #top { position: absolute; left: 0; right: 0; top: 0; padding: calc(14px + env(safe-area-inset-top)) 18px 24px; background: linear-gradient(180deg, rgba(0,0,0,.78), rgba(0,0,0,0)); }
  #status { font: 600 22px/28px var(--font-sans); letter-spacing: -0.01em; }
  #status.err { color: #fca5a5; }
  #sub { font-size: 14px; color: rgba(255,255,255,.75); margin-top: 4px; font-variant-numeric: tabular-nums; }
  #warn { font-size: 14px; color: #fcd34d; margin-top: 6px; line-height: 19px; }
  #warn:empty { display: none; }
  #count { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; font-size: 34vmin; font-weight: 700; text-shadow: 0 8px 40px rgba(0,0,0,.6); }
  #rec { position: absolute; right: 18px; top: calc(16px + env(safe-area-inset-top)); display: none; align-items: center; gap: 8px; font-weight: 600; font-size: 18px; font-variant-numeric: tabular-nums; background: rgba(0,0,0,.5); padding: 6px 12px; border-radius: 9999px; }
  #rec i { width: 12px; height: 12px; border-radius: 50%; background: #ef4444; animation: blink 1s infinite; }
  body.recording #rec { display: flex; }
  @keyframes blink { 50% { opacity: .25; } }
  #prog { position: absolute; left: 18px; right: 18px; bottom: calc(90px + env(safe-area-inset-bottom)); height: 6px; border-radius: 9999px; background: rgba(255,255,255,.2); overflow: hidden; display: none; }
  #prog i { display: block; height: 100%; width: 0%; background: #fff; transition: width .2s; }
  body.uploading #prog { display: block; }
  #bottom { position: absolute; left: 18px; right: 18px; bottom: calc(18px + env(safe-area-inset-bottom)); display: flex; gap: 10px; justify-content: center; }
  #bottom button { font: 600 16px var(--font-sans); color: #fff; background: rgba(255,255,255,.16); border: 0; border-radius: 12px; padding: 14px 22px; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
  #bottom button:disabled { opacity: .4; }
  body.recording #bottom, body.uploading #bottom { display: none; }
</style>
</head>
<body>
<video id="live" autoplay muted playsinline></video>
<canvas id="cap" width="1920" height="1080"></canvas>
<div id="top"><div id="status">Connecting…</div><div id="sub"></div><div id="warn"></div></div>
<div id="rec"><i></i><span id="timer">0:00</span></div>
<div id="count"></div>
<div id="prog"><i id="progFill"></i></div>
<div id="bottom"><button id="startCamBtn" type="button" hidden>Start the camera</button><button id="flipBtn" type="button">Flip camera</button></div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var enc = encodeURIComponent;
  var qp = new URLSearchParams(location.search);
  var token = qp.get('token') || '';
  var tenant = qp.get('tenant') || '';
  var session = qp.get('session') || '';
  ${RB_SOCKET_JS}
  if (!tenant && token) tenant = tenantOf(token);
  function withToken(url) { return token ? url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + enc(token) : url; }
  function status(text, kind) { var s = $('status'); s.textContent = text; s.className = kind === 'err' ? 'err' : ''; }
  if (!session || !tenant) { status('This link is missing its pairing. Scan the code on the laptop again.', 'err'); return; }

  // idle (camera up, waiting for the laptop) -> counting -> recording ->
  // uploading -> review (waiting for keep / retake) -> attaching -> idle.
  var st = { state: 'idle', facing: 'environment', target: null, controlPresent: false, track: null, previews: 0, opened: 0 };
  window.__cam = st; // read by the browser test; nothing here trusts it
  var stream = null, vt = null, rec = null, chunks = [], blob = null, mime = '', ext = 'webm';
  var recTarget = null, recInfo = null, t0 = 0, duration = 0, uploaded = null, wake = null, battery = null, camLiveAt = 0;

  var sock = rbSocket({ role: 'camera', tenant: tenant, token: token, session: function () { return session; }, onMessage: onMessage,
    onClose: function () { if (st.state === 'idle') status('Reconnecting to the laptop…'); } });

  function frameOf(t) { var c = (t && t.canvas) || { width: 1920, height: 1080 }; return { w: Number(c.width) || 1920, h: Number(c.height) || 1080 }; }
  function dims() { var v = $('live'); return { w: v.videoWidth || (st.track && st.track.width) || 0, h: v.videoHeight || (st.track && st.track.height) || 0 }; }
  function targetLabel(t) { if (!t) return ''; return (t.name || t.project) + ' · ' + (t.scene === 'all' ? 'all scenes' : 'Scene ' + (Number(t.scene) + 1)); }
  function idleStatus() {
    if (!st.target) status(st.controlPresent ? 'Paired — waiting for the laptop to pick a film' : 'Paired — waiting for the laptop');
    else status(st.controlPresent ? 'Paired — waiting for the laptop' : 'The laptop is away — keep the phone here; it reconnects on its own');
  }
  function showFrame() {
    var f = frameOf(st.target), v = $('live');
    v.style.setProperty('--fw', String(f.w)); v.style.setProperty('--fh', String(f.h));
    v.classList.toggle('mirror', st.facing === 'user');
    var d = dims(), warn = [];
    if (d.w && d.h && ((d.w >= d.h) !== (f.w >= f.h))) warn.push(f.w >= f.h ? 'Turn the phone on its side: this film is wide.' : 'Stand the phone upright: this film is tall.');
    if (d.w && d.h && Math.min(d.w, d.h) < 2160) warn.push('This browser gives the camera at ' + d.w + '×' + d.h + '. For true 4K, record in the Camera app and use Upload on the laptop.');
    if (battery && battery.level < 0.2 && !battery.charging) warn.push('Battery ' + Math.round(battery.level * 100) + '% — plug the phone in.');
    $('warn').textContent = warn.join(' ');
    $('sub').textContent = [targetLabel(st.target), d.w ? (st.facing === 'user' ? 'Front' : 'Rear') + ' · ' + d.w + '×' + d.h + (st.track && st.track.fps ? ' · ' + Math.round(st.track.fps) + ' fps' : '') : ''].filter(Boolean).join(' · ');
  }

  // ── the camera: rear by default, the best size the browser gives ─────
  // Ideal 3840x2160, then 1920x1080, then whatever it has, at 30 fps, in
  // the film's orientation (a 16x9 film = the phone on its side). What the
  // track really delivers is reported to the laptop in hello.
  var openSeq = 0;
  function openCamera() {
    if (st.state !== 'idle' && st.state !== 'opening' && stream) return Promise.resolve();
    var f = frameOf(st.target), wide = f.w >= f.h;
    var sizes = [wide ? [3840, 2160] : [2160, 3840], wide ? [1920, 1080] : [1080, 1920], null];
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    st.state = 'opening'; status('Opening the camera…');
    // A newer open (a flip, a retarget) wins; an older one that lands late
    // lets its camera go instead of leaving it lit.
    var my = ++openSeq;
    var i = 0;
    function attempt() {
      var sz = sizes[i];
      var v = { facingMode: { ideal: st.facing }, frameRate: { ideal: 30 } };
      if (sz) { v.width = { ideal: sz[0] }; v.height = { ideal: sz[1] }; }
      return navigator.mediaDevices.getUserMedia({ video: v, audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } })
        .catch(function (e) { if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e; i += 1; if (i < sizes.length) return attempt(); throw e; });
    }
    return attempt().then(function (s) {
      if (my !== openSeq) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s; vt = s.getVideoTracks()[0]; camLiveAt = performance.now(); lockedTrack = null;
      var v = $('live'); v.srcObject = s;
      $('startCamBtn').hidden = true;
      st.state = 'idle'; st.opened += 1;
      readTrack(); keepAwake();
      var sent = false;
      var hi = function () { if (sent) return; sent = true; readTrack(); showFrame(); sendHello(); idleStatus(); };
      if (v.readyState >= 1 && v.videoWidth) hi(); else { v.addEventListener('loadedmetadata', hi, { once: true }); setTimeout(hi, 1500); }
    }).catch(function (e) {
      if (my !== openSeq) return;
      st.state = 'idle';
      $('startCamBtn').hidden = false;
      status('The camera did not open (' + (e && e.name || e) + '). Allow the camera and microphone for this site, then tap Start the camera.', 'err');
    });
  }
  function readTrack() {
    if (!vt) return;
    var s = vt.getSettings ? (vt.getSettings() || {}) : {};
    var caps = {}; try { caps = vt.getCapabilities ? (vt.getCapabilities() || {}) : {}; } catch (e) {}
    var has = function (list, m) { return Array.isArray(list) && list.indexOf(m) >= 0; };
    var locks = [];
    if (has(caps.exposureMode, 'manual') || has(caps.exposureMode, 'none')) locks.push('exposure');
    if (has(caps.whiteBalanceMode, 'manual') || has(caps.whiteBalanceMode, 'none')) locks.push('white balance');
    var d = dims();
    st.track = { width: d.w || s.width || 0, height: d.h || s.height || 0, fps: s.frameRate || 0, facing: s.facingMode || st.facing, label: vt.label || '', locks: locks,
      maxWidth: caps.width && caps.width.max, maxHeight: caps.height && caps.height.max };
  }
  function sendHello() {
    var t = st.track || {};
    sock.send('hello', { camera: st.facing, width: t.width, height: t.height, fps: t.fps, locks: t.locks || [], label: t.label,
      max: t.maxWidth ? { width: t.maxWidth, height: t.maxHeight } : undefined,
      battery: battery ? { level: battery.level, charging: battery.charging } : undefined,
      state: st.state, pending: st.state === 'review' ? uploaded : undefined });
  }
  $('live').addEventListener('resize', function () { readTrack(); showFrame(); if (st.state === 'idle') sendHello(); });
  $('startCamBtn').addEventListener('click', function () { openCamera(); });
  $('flipBtn').addEventListener('click', function () { if (st.state !== 'idle') return; st.facing = st.facing === 'user' ? 'environment' : 'user'; openCamera(); });

  // Wake Lock: the booth's own; re-taken when the page comes back.
  function keepAwake() {
    if (wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener && w.addEventListener('release', function () { wake = null; }); }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') keepAwake(); });
  // Low battery: a warning here and on the laptop (Chrome has the API; iOS does not).
  try { if (navigator.getBattery) navigator.getBattery().then(function (b) { battery = b; var up = function () { showFrame(); if (st.state === 'idle') sendHello(); }; b.addEventListener('levelchange', up); b.addEventListener('chargingchange', up); up(); }).catch(function () {}); } catch (e) {}

  // ── exposure + white balance lock (the booth's rule) ─────────────────
  // Only where the track lists the modes (Android Chrome); iOS Safari has
  // neither and the correction on arrival covers it.
  var lockedTrack = null;
  function lockCamera() {
    try {
      if (!vt || vt === lockedTrack || !vt.getCapabilities || !vt.applyConstraints) return;
      var caps = vt.getCapabilities() || {}, set = vt.getSettings ? (vt.getSettings() || {}) : {};
      var has = function (list, m) { return Array.isArray(list) && list.indexOf(m) >= 0; };
      var adv = [];
      if (has(caps.exposureMode, 'manual')) { var ex = { exposureMode: 'manual' }; if (typeof set.exposureTime === 'number' && caps.exposureTime) ex.exposureTime = set.exposureTime; adv.push(ex); }
      else if (has(caps.exposureMode, 'none')) adv.push({ exposureMode: 'none' });
      if (has(caps.whiteBalanceMode, 'manual')) { var wb = { whiteBalanceMode: 'manual' }; if (typeof set.colorTemperature === 'number' && caps.colorTemperature) wb.colorTemperature = set.colorTemperature; adv.push(wb); }
      else if (has(caps.whiteBalanceMode, 'none')) adv.push({ whiteBalanceMode: 'none' });
      if (!adv.length) return;
      // applyConstraints REPLACES the set: carry the size and rate asked for.
      var base = vt.getConstraints ? (vt.getConstraints() || {}) : {}, c = {};
      for (var bk in base) { if (bk !== 'advanced') c[bk] = base[bk]; }
      c.advanced = adv;
      lockedTrack = vt;
      var p = vt.applyConstraints(c); if (p && p.catch) p.catch(function () {});
    } catch (e) { /* a lock is a nicety, the take is the job */ }
  }

  // ── preview stills to the laptop: ~320 px, 3-4 a second ──────────────
  // Exactly the frame that records (the film's aspect, cropped the same
  // way), so the laptop frames and measures the real picture. Skipped
  // while the socket is backed up: a preview is never worth a queue.
  var pv = document.createElement('canvas');
  function cropBox(vw, vh, f) {
    var a = f.w / f.h, cw, ch;
    if (vw / vh > a) { ch = vh; cw = vh * a; } else { cw = vw; ch = vw / a; }
    return { x: (vw - cw) / 2, y: (vh - ch) / 2, w: cw, h: ch };
  }
  function sendPreview() {
    if (!st.controlPresent || !sock.isOpen() || sock.buffered() > 200000) return;
    if (st.state === 'uploading' || st.state === 'attaching') return;
    var v = $('live');
    if (!v.videoWidth || v.readyState < 2) return;
    var f = frameOf(st.target), c = cropBox(v.videoWidth, v.videoHeight, f);
    var pw, ph;
    if (f.w >= f.h) { pw = 320; ph = Math.round(320 * f.h / f.w); } else { ph = 320; pw = Math.round(320 * f.w / f.h); }
    if (pv.width !== pw) pv.width = pw;
    if (pv.height !== ph) pv.height = ph;
    var ctx = pv.getContext('2d'); if (!ctx) return;
    ctx.drawImage(v, c.x, c.y, c.w, c.h, 0, 0, pw, ph);
    if (sock.send('preview', { jpeg: pv.toDataURL('image/jpeg', 0.62), w: pw, h: ph })) st.previews++;
  }
  setInterval(function () { try { sendPreview(); } catch (e) {} }, 280);

  // ── recording: local, never waiting on the network ───────────────────
  var CANDS = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  function pickMime() {
    if (!window.MediaRecorder) return '';
    for (var i = 0; i < CANDS.length; i++) { try { if (MediaRecorder.isTypeSupported(CANDS[i])) return CANDS[i]; } catch (e) {} }
    return '';
  }
  var countTimer = null, tickTimer = null, drawing = false, drawReq = 0;
  function startCount() {
    if (st.state !== 'idle' || !stream || !st.target) { sock.send('status', { text: !st.target ? 'The phone has no film yet.' : 'The phone camera is not ready yet.', error: true }); return; }
    recTarget = st.target;
    st.state = 'counting';
    var n = 3, el = $('count'); el.style.display = 'flex'; el.textContent = String(n);
    status('Rolling in 3…');
    countTimer = setInterval(function () {
      n -= 1;
      if (n > 0) { el.textContent = String(n); return; }
      clearInterval(countTimer); countTimer = null; el.style.display = 'none';
      startRecording();
    }, 1000);
  }
  // The file is the film's frame at the camera's full size: the raw track
  // when it already has the film's aspect (no canvas, no quality lost),
  // else the centre crop drawn into a canvas at the track's resolution.
  function startRecording() {
    var v = $('live'), f = frameOf(recTarget), vw = v.videoWidth, vh = v.videoHeight;
    var src = stream, mode = 'raw', outW = vw, outH = vh;
    var aspectOk = vw && vh && Math.abs(vw / vh - f.w / f.h) / (f.w / f.h) <= 0.02;
    var cv = $('cap');
    if (!aspectOk && vw && vh && (cv.captureStream || cv.mozCaptureStream)) {
      try {
        var c = cropBox(vw, vh, f), k = Math.min(1, 3840 / Math.max(c.w, c.h));
        outW = Math.round(c.w * k / 2) * 2; outH = Math.round(c.h * k / 2) * 2;
        cv.width = outW; cv.height = outH;
        drawing = true; drawFrame();
        var cs = cv.captureStream ? cv.captureStream(30) : cv.mozCaptureStream(30);
        src = new MediaStream();
        cs.getVideoTracks().forEach(function (t) { src.addTrack(t); });
        stream.getAudioTracks().forEach(function (t) { src.addTrack(t); });
        mode = 'canvas';
      } catch (e) { stopDraw(); src = stream; mode = 'raw'; outW = vw; outH = vh; }
    }
    // 20-25 Mbps at 4K, 12 at 1080p (the booth's number; left to the
    // browser it lands near 2.5 and smears skin).
    var bps = Math.min(outW, outH) >= 2160 ? 24000000 : 12000000;
    mime = pickMime(); ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    var opts = { videoBitsPerSecond: bps, audioBitsPerSecond: 128000 };
    if (mime) opts.mimeType = mime;
    chunks = [];
    try { rec = new MediaRecorder(src, opts); }
    catch (e1) {
      stopDraw(); src = stream; mode = 'raw'; outW = vw; outH = vh;
      try { rec = new MediaRecorder(src, opts); }
      catch (e2) { st.state = 'idle'; sock.send('status', { text: 'This phone cannot record here (' + (e2.message || e2) + ').', error: true }); status('This browser cannot record video here.', 'err'); return; }
    }
    rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = onStopped;
    rec.start(1000);
    t0 = performance.now(); st.state = 'recording';
    recInfo = { width: outW, height: outH, mode: mode, bitrate: bps, mime: mime };
    document.body.classList.add('recording');
    tickTimer = setInterval(function () { $('timer').textContent = fmt((performance.now() - t0) / 1000); }, 250);
    status('Recording');
    sock.send('recording', { t0: Date.now(), width: outW, height: outH, mode: mode, bitrate: bps, mime: mime });
  }
  function drawFrame() {
    if (!drawing) return;
    var v = $('live'), cv = $('cap'), ctx = cv.getContext('2d');
    if (v.videoWidth && v.videoHeight && ctx) {
      var c = cropBox(v.videoWidth, v.videoHeight, frameOf(recTarget));
      ctx.drawImage(v, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
    }
    drawReq = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(drawFrame) : requestAnimationFrame(drawFrame);
  }
  function stopDraw() {
    drawing = false;
    var v = $('live');
    if (drawReq && v.cancelVideoFrameCallback) { try { v.cancelVideoFrameCallback(drawReq); } catch (e) {} }
    else if (drawReq) cancelAnimationFrame(drawReq);
    drawReq = 0;
  }
  function stopRecording() {
    if (st.state === 'counting') { clearInterval(countTimer); countTimer = null; $('count').style.display = 'none'; st.state = 'idle'; idleStatus(); return; }
    if (st.state !== 'recording' || !rec) return;
    duration = (performance.now() - t0) / 1000;
    try { rec.stop(); } catch (e) { onStopped(); }
  }
  function onStopped() {
    stopDraw();
    if (tickTimer) clearInterval(tickTimer); tickTimer = null;
    document.body.classList.remove('recording');
    blob = new Blob(chunks, { type: mime || 'video/webm' }); chunks = [];
    if (!blob.size) { st.state = 'idle'; sock.send('status', { text: 'The recording came back empty. Try again.', error: true }); idleStatus(); return; }
    st.state = 'uploading';
    sock.send('stopped', { duration: duration, size: blob.size });
    upName = 'remote-take-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext; upTries = 0;
    upload();
  }

  // ── upload: through the booth's route, with progress; retried until the
  // network is back (the take is safe on the phone meanwhile) ───────────
  var upName = '', upTries = 0, upRetry = null, lastPct = -1;
  function upload() {
    if (upRetry) { clearTimeout(upRetry); upRetry = null; }
    if (!blob || st.state !== 'uploading') return;
    document.body.classList.add('uploading');
    $('progFill').style.width = '0%'; lastPct = -1;
    status('Uploading 0%');
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/upload-asset/' + enc(tenant) + '/' + enc(recTarget.project) + '?name=' + enc(upName)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = function (ev) {
      if (!ev.lengthComputable) return;
      var pct = Math.round(ev.loaded / ev.total * 100);
      $('progFill').style.width = pct + '%';
      status('Uploading ' + pct + '%');
      if (pct !== lastPct) { lastPct = pct; sock.send('uploading', { pct: pct }); }
    };
    var again = function (why) {
      upTries += 1;
      status('Upload paused — ' + why + '. The take is safe on this phone; retrying…', 'err');
      sock.send('status', { text: 'The phone’s upload paused (' + why + '); it retries on its own.', error: true });
      upRetry = setTimeout(upload, Math.min(15000, 2000 * upTries));
    };
    xhr.onerror = function () { again('no network'); };
    xhr.onload = function () {
      if (xhr.status >= 500 || xhr.status === 0) { again('server ' + xhr.status); return; }
      var up = null; try { up = JSON.parse(xhr.responseText); } catch (e) {}
      if (xhr.status < 200 || xhr.status >= 300 || !up || !up.url) {
        st.state = 'idle'; document.body.classList.remove('uploading');
        sock.send('status', { text: 'The upload was refused (' + xhr.status + '): ' + String(xhr.responseText || '').slice(0, 160), error: true });
        status('Upload refused (' + xhr.status + ').', 'err'); return;
      }
      document.body.classList.remove('uploading');
      uploaded = { url: up.url, duration: Math.round(duration * 100) / 100, width: recInfo.width, height: recInfo.height, mime: mime, size: blob.size, project: recTarget.project, scene: recTarget.scene };
      st.state = 'review';
      sock.send('uploaded', uploaded);
      status('Uploaded — keep it or retake on the laptop');
    };
    xhr.send(blob);
  }
  window.addEventListener('online', function () { if (st.state === 'uploading' && upRetry) upload(); });

  // ── keep: the SAME attach route the booth uses (capture 'remote') ────
  function keep(m) {
    if (st.state !== 'review' || !uploaded) return;
    st.state = 'attaching'; status('Attaching the take…');
    var body = { url: uploaded.url, duration: uploaded.duration, mime: uploaded.mime || undefined, capture: 'remote',
      look: m.look === 'natural' ? 'natural' : 'soft',
      soft_strength: typeof m.soft_strength === 'number' ? m.soft_strength : 0.5,
      background: m.background === 'room' || m.background === 'blur' || m.background === 'alpha' ? m.background : undefined,
      scene_index: uploaded.scene, width: uploaded.width, height: uploaded.height };
    fetch(withToken('/api/take/' + enc(tenant) + '/' + enc(uploaded.project)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('attach failed (' + r.status + ')')); return j; }); })
      .then(function (j) {
        sock.send('attached', { project: uploaded.project, scene_index: uploaded.scene, open_needs: j.open_needs });
        reset(); status('Kept. Ready for the next take');
        setTimeout(function () { if (st.state === 'idle') idleStatus(); }, 4000);
      })
      .catch(function (e) { st.state = 'review'; sock.send('attach-failed', { error: e.message || String(e) }); status('Could not attach: ' + (e.message || e), 'err'); });
  }
  function reset() { blob = null; uploaded = null; recInfo = null; st.state = 'idle'; document.body.classList.remove('uploading'); }

  // ── the laptop's messages ──────────────────────────────────────────────
  function applyTarget(t) {
    var prev = st.target; st.target = t;
    var fo = frameOf(prev), fn = frameOf(t);
    // A new film with another frame re-opens the camera in its
    // orientation; the same frame keeps the camera as it is.
    var reopen = !stream || !prev || Math.abs(fo.w / fo.h - fn.w / fn.h) > 0.01;
    if (reopen && (st.state === 'idle' || st.state === 'opening')) openCamera();
    else { showFrame(); sendHello(); }
    if (st.state === 'idle') idleStatus();
  }
  function onMessage(name, m) {
    if (name === 'joined') {
      st.controlPresent = !!(m.peers && m.peers.control);
      if (m.target) applyTarget(m.target);
      else { if (!stream) openCamera(); idleStatus(); }
      if (stream) sendHello();
      return;
    }
    if (name === 'target') { applyTarget(m.target); return; }
    if (name === 'peer') {
      if (m.role !== 'control') return;
      st.controlPresent = !!m.present;
      if (m.present) sendHello();
      if (st.state === 'idle') idleStatus();
      return;
    }
    if (name === 'start') { startCount(); return; }
    if (name === 'stop') { stopRecording(); return; }
    if (name === 'keep') { keep(m); return; }
    if (name === 'retake') { if (st.state === 'review' || st.state === 'uploading') { if (upRetry) clearTimeout(upRetry); upRetry = null; reset(); idleStatus(); } return; }
    if (name === 'settings') {
      if (m.facing === 'user' || m.facing === 'environment') { if (m.facing !== st.facing && st.state === 'idle') { st.facing = m.facing; openCamera(); } }
      if (m.lock) lockCamera();
      return;
    }
    if (name === 'replaced') { sock.stop(); status('Another phone is the camera now.', 'err'); return; }
    if (name === 'expired') { sock.stop(); status('The pairing ended. Scan the new code on the laptop.', 'err'); return; }
    if (name === 'error') {
      // A server restart forgets sessions; the laptop re-registers its own
      // on reconnect, so a camera told "not found" asks again shortly.
      if (m.code === 'not-found') { status(m.error || 'Waiting for the laptop…', 'err'); setTimeout(function () { sock.rejoin(); }, 4000); return; }
      status(m.error || 'Connection problem.', 'err');
    }
  }
})();
</script>
</body>
</html>`;
}
