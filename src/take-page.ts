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
import { QUOTIENT_CSS, QUOTIENT_FONT_LINKS } from "./quotient-theme.js";
import { LIGHT_CHECK_JS } from "./core/light-check.js";
import { PROMPTER_TIMING_JS, PROMPTER_VIEW_JS } from "./core/prompter.js";
import { PERFORMER_SETTINGS } from "./core/performer-settings.js";
import { PROOF_USES } from "./core/proof-placement.js";

/** What the booth tells the person (SPEC-creator-formats.md): the scene's
 *  setting and the beats' directions, by id. */
const BOOTH_SETTINGS = JSON.stringify(Object.fromEntries(PERFORMER_SETTINGS.map((s) => [s.id, { name: s.name, booth: s.booth }])));
const BOOTH_USES = JSON.stringify(Object.fromEntries(PROOF_USES.filter((u) => u.booth).map((u) => [u.id, { name: u.name, booth: u.booth }])));

/** NEXT SCENE from the done screen (Marc, Oct 6: after attaching a scene he
 *  went back to Studio, scrolled the board and picked the next one he had
 *  not recorded). The next scene after the current one that has lines and no take
 *  yet, wrapping round to the start; -1 when every scene is done. Browser
 *  JS, shared with the test. */
export const NEXT_SCENE_JS = `
  function nextOpenScene(scenes, taken, from) {
    var n = scenes.length;
    for (var k = 1; k < n; k++) {
      var i = (from + k) % n;
      if (scenes[i] && scenes[i].lines && taken.indexOf(i) < 0) return i;
    }
    return -1;
  }
`;

export function getTakeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#0e0e14">
<link rel="icon" href="data:,">
${QUOTIENT_FONT_LINKS}
<title>Record a take · Media Studio</title>
<style>
${QUOTIENT_CSS}
  /* The take page: Quotient's page frame on a phone for the ready, review
     and done screens; the stage itself is the camera and stays black. */
  * { -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; overscroll-behavior: none; }
  body { display: flex; flex-direction: column; min-height: 100dvh; }
  section { display: none; flex: 1; flex-direction: column; }
  section.on { display: flex; }
  /* The ready screen never scrolls: a long script (record-all) scrolls
     INSIDE its card and the Record button stays in reach (Marc: "scroll
     all the way down, hit record, then scroll all the way back"). */
  /* ...and Record is PINNED to the bottom edge: measured on a phone, the
     background row's long hint (a narrow column beside Room/Blur/Alpha)
     pushed Record below the screen of a page that could not scroll. The
     screen may now scroll as a last resort, but Record never leaves it. */
  #ready { height:100dvh; overflow-y:auto; -webkit-overflow-scrolling:touch; }
  #ready > * { flex-shrink: 0; }
  #ready > #script { flex-shrink: 1; min-height: 96px; }
  #ready .rec-dock { position: sticky; bottom: calc(-16px - env(safe-area-inset-bottom)); z-index: 2; margin: 0 -18px calc(-16px - env(safe-area-inset-bottom));
    padding: 10px 18px calc(12px + env(safe-area-inset-bottom)); background: var(--background, #f8f8fa); box-shadow: 0 -8px 16px -6px rgba(20, 20, 40, 0.10); }
  #ready .rec-dock #recordBtn { width: 100%; }
  body.embed #ready .rec-dock { position: static; margin: 0; padding: 0; background: none; box-shadow: none; }
  /* Studio's dialog: the ready screen is as tall as its content, no more. */
  body.embed { min-height: 0; height: auto; }
  body.embed section.on { flex: 0 0 auto; }
  body.embed #ready { height: auto; overflow: visible; }
  body.embed .spacer { display: none; }
  body.embed .pad { padding: 8px 16px 14px; }
  body.embed #script { max-height: 32vh; }
  body.embed h1 { font-size: 17px; line-height: 24px; }
  body.embed .sub { margin-bottom: 10px; }
  body.embed #readyNote { margin: 10px 0 8px; }
  #script { flex:0 1 auto; max-height:44dvh; overflow-y:auto; -webkit-overflow-scrolling:touch; }
  .pad { padding: calc(16px + env(safe-area-inset-top)) 18px calc(16px + env(safe-area-inset-bottom)); }
  h1 { font: 500 20px/28px var(--font-sans); letter-spacing: -0.01em; margin: 0 0 4px; color: var(--foreground); }
  .sub { color: var(--muted-foreground); font-size: 14px; margin: 0 0 16px; }
  .card { background: var(--card); border: 1px solid var(--border-secondary); border-radius: var(--radius); box-shadow: var(--shadow-sub); padding: 18px; }
  .beat { font-size: 18px; line-height: 1.45; margin: 0 0 14px; white-space:pre-line; color: var(--content-primary); letter-spacing: -0.01em; }
  .beat b { color: var(--muted-foreground); font: 500 12px/16px var(--font-sans); letter-spacing: .04em; text-transform: uppercase; display: block; margin-bottom: 4px; }
  .note { color: var(--muted-foreground); font-size: 13px; line-height: 20px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 20px; border: 1px solid transparent;
    border-radius: var(--radius); font: 500 15px/20px var(--font-sans); color: var(--primary-foreground); background: var(--primary);
    box-shadow: var(--shadow-weak); width: 100%; cursor: pointer; text-decoration: none; transition: all 150ms cubic-bezier(.4,0,.2,1);
    -webkit-appearance: none; appearance: none; }
  .btn:hover { background: color-mix(in srgb, var(--primary) 90%, transparent); }
  .btn:active { transform: translateY(1px); }
  .btn:focus-visible { outline: none; border-color: var(--ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent); }
  .btn.ghost { background: var(--surface-primary); border-color: var(--border-secondary); color: var(--content-primary); }
  .btn.ghost:hover { background: var(--accent); }
  .btn.stop { background: var(--destructive); color: #fff; }
  .btn:disabled { opacity: .5; pointer-events: none; }
  a.link { color: var(--muted-foreground); font-size: 14px; text-decoration: none; }
  .toggle { display: flex; gap: 10px; align-items: flex-start; color: var(--content-primary); font-size: 14px; margin: 10px 0 14px; white-space: nowrap; }
  .toggle .hint { white-space: normal; }
  .vhide { display: none !important; }
  /* A choice row wraps: its hint takes a full line of its own instead of a
     one-word-wide column beside the options. */
  #bgChoice { flex-wrap: wrap; align-items: center; }
  #bgChoice .hint { flex: 1 0 100%; }
  #bgChoice label { margin: 0 6px 0 2px; }
  .toggle input { width: 18px; height: 18px; margin-top: 1px; accent-color: var(--primary); }
  .toggle .hint { color: var(--muted-foreground); font-size: 13px; }
  /* Prompter speed: the reader sets the pace before the take (Marc: "it
     was too slow ... I was reading at the pace of the teleprompter"). */
  #speedRow { align-items: center; }
  #speedRow .spd { width: 36px; height: 32px; border-radius: 8px; border: 1px solid var(--border-secondary); background: var(--surface-primary); color: var(--content-primary); font: 600 17px/1 var(--font-sans); cursor: pointer; }
  #speedRow b { min-width: 72px; text-align: center; font-variant-numeric: tabular-nums; }
  /* The smoothing dial sits under Soft look; off with it. */
  #softDial { align-items: center; margin-top: -4px; }
  #softDial input[type=range] { width: auto; height: auto; flex: 1; min-width: 0; margin: 0; }
  #softDial.off { opacity: .4; pointer-events: none; }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  .row .btn { flex: 1; }
  .spacer { flex: 1; }

  #stage { --ok: #22c55e; --err: #ef4444; color: #fff; }
  /* ── stage: camera full-bleed, prompter over it ── */
  /* The stage owns the viewport wherever the page was scrolled -- and the
     page under it is LOCKED while it is up: a fixed body is the one lock
     iOS Safari honours (Marc: "I can still scroll the take screen up"). */
  #stage { position:fixed; inset:0; z-index:5; background:#000; touch-action:manipulation; }
  html.lock, html.lock body { overflow:hidden; height:100%; overscroll-behavior:none; }
  html.lock body { position:fixed; width:100%; top:0; left:0; }
  #live { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transform:scaleX(-1); }
  /* A WIDE film (16x9, 1x1) on any screen: the stage is the frame itself,
     centred, so what you see is what the canvas records. A tall film keeps
     the phone's full-bleed stage. */
  #stage.wide #live { inset:auto; left:50%; top:50%; width:100%; height:auto; max-height:100%; aspect-ratio: var(--frame-w, 16) / var(--frame-h, 9); transform: translate(-50%, -50%) scaleX(-1); }
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
  /* KARAOKE: the line's words light up at the target pace -- spoken words
     bright, the ones ahead dim -- so the reader sees whether they are ahead
     or behind (Marc: "something that shows me the pace, like a karaoke
     machine"). The next two lines sit under it, readable, not ghosted. */
  #cue .w { color: rgba(255,255,255,.42); transition: color .12s linear; }
  #cue .w.on { color: #fff; }
  /* Emphasis: lean on this word -- brand colour, and the highlight holds on
     it longer (EMPH_K). */
  #cue .w.em { color: rgba(170, 172, 255, .62); }
  #cue .w.em.on { color: #fff; text-decoration: underline; text-decoration-color: #8f91ff; text-decoration-thickness: 4px; text-underline-offset: 6px; }
  #cue .w.dash { color: rgba(255,255,255,.42) !important; }
  #next { margin-top:12px; font-size:21px; line-height:1.3; font-weight:500; color:rgba(255,255,255,.78); text-shadow:0 2px 10px rgba(0,0,0,.6); text-wrap:balance; }
  #next2 { margin-top:8px; font-size:18px; line-height:1.3; color:rgba(255,255,255,.5); text-shadow:0 2px 10px rgba(0,0,0,.6); text-wrap:balance; }
  #bar { position:absolute; left:0; right:0; bottom: calc(86px + env(safe-area-inset-bottom)); height:3px; background:rgba(255,255,255,.18); }
  #barFill { height:100%; width:0%; background:#fff; }
  #stopWrap { position:absolute; left:18px; right:18px; bottom: calc(18px + env(safe-area-inset-bottom)); display:flex; gap:10px; }
  #stopWrap .btn { flex:1; }
  /* Start over: a fumbled line restarts the take right here -- the count-in
     again, same camera, no trip back out of the recorder (Marc). */
  .btn.again { background: rgba(255,255,255,.16); color:#fff; flex:0 0 38% !important; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }

  /* ── framing + light check: the camera is up, the take has not started ──
     A manual review of a booth take found three lighting faults nobody can
     see from behind the phone (a warm key in a daylight room, a wall as
     bright as the face, no rim). PREROLL is the moment between opening the
     camera and the count-in: the light check speaks there, never during
     the take. FRAMING (preroll + count-in) shows where the face goes. */
  #guide { position:absolute; inset:0; pointer-events:none; display:none; }
  /* VOICE ONLY: no camera -- the prompter, the timer and the meter on black. */
  #stage.voice #live, #stage.voice #cap, #stage.voice #guide, #stage.voice #lightBadge, #stage.voice #lightCard { display:none !important; }
  #stage.framing #guide { display:block; }
  #oval { position:absolute; box-sizing:border-box; border:2px dashed rgba(255,255,255,.38); border-radius:50%; }
  #eyes { position:absolute; height:0; border-top:1px solid rgba(255,255,255,.3); }
  #eyes span { position:absolute; right:0; top:-17px; font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:rgba(255,255,255,.62); text-shadow:0 1px 4px rgba(0,0,0,.7); }
  #lightCard { position:absolute; left:16px; right:16px; bottom: calc(98px + env(safe-area-inset-bottom)); display:none; background:rgba(14,14,20,.8);
    -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); border-radius:14px; padding:10px 12px 12px 14px; font-size:14px; line-height:1.4; }
  #stage.preroll #lightCard { display:block; }
  #stage.preroll.lightoff #lightCard { display:none; }
  #lightHead { display:flex; align-items:center; gap:8px; font-weight:600; font-size:13px; }
  .ldot { width:8px; height:8px; border-radius:50%; background:#f59e0b; flex:0 0 auto; }
  #lightCard.good .ldot, #lightBadge.good .ldot { background:var(--ok); }
  #lightCard.wait .ldot { background:rgba(255,255,255,.5); }
  #lightHide { margin-left:auto; background:none; border:0; color:rgba(255,255,255,.72); font-size:22px; line-height:1; padding:0 4px; cursor:pointer; }
  #lightTips { margin:6px 0 0; padding-left:18px; }
  #lightTips li { margin-top:4px; }
  #lightBadge { display:none; align-items:center; gap:6px; font-size:12px; font-weight:600; color:#fff; background:rgba(255,255,255,.16); border:0; border-radius:9999px; padding:4px 10px; cursor:pointer; }
  #stage.preroll.lightoff #lightBadge { display:inline-flex; }
  #frameWrap { position:absolute; left:18px; right:18px; bottom: calc(18px + env(safe-area-inset-bottom)); display:none; gap:10px; }
  #frameWrap .btn { flex:1; }
  #stage.preroll #frameWrap { display:flex; }
  #stage.preroll #stopWrap { display:none; }

  /* ── review ── */
  #play { width: 100%; max-height: 62dvh; border-radius: var(--radius); background: #000; }
  .prog { height: 4px; border-radius: 9999px; background: var(--muted); overflow: hidden; margin: 14px 0 8px; }
  .prog i { display: block; height: 100%; width: 0%; background: var(--primary); border-radius: 9999px; transition: width .2s; }
  .big { font-size: 40px; margin: 0 0 8px; color: #0d542b; }
  a.btn { display: inline-flex; text-align: center; text-decoration: none; }
  .meta { font-size: 12px; color: var(--muted-foreground); margin-top: 10px; font-variant-numeric: tabular-nums; }

</style>
</head>
<body>

<section id="ready" class="pad on">
  <p><a class="link" id="studioLinkTop" href="#">← Back to Studio</a></p>
  <h1 id="title">Loading…</h1>
  <p class="sub" id="subtitle"></p>
  <div class="card" id="script"></div>
  <div class="toggle" id="speedRow" style="display:none">Prompter speed <button type="button" class="spd" id="slowerBtn" aria-label="Slower">−</button><b id="speedWpm"></b><button type="button" class="spd" id="fasterBtn" aria-label="Faster">+</button></div>
  <div class="spacer"></div>
  <p class="note" id="readyNote">Hold your phone upright. Tap Record: the camera opens with a quick light check. Tap Start recording for a 3-second count-in, then the script shows one line at a time at speaking pace. Tap the screen to jump to the next line.</p>
  <label class="toggle"><input type="checkbox" id="softLook"> Soft look <span class="hint">(skin smoothing and warmth, applied when the take is processed; change it later in Studio)</span></label>
  <div class="toggle off" id="softDial">Smoothing <span class="hint">light</span><input type="range" id="softStrength" min="0" max="1" step="0.05" value="0.5" aria-label="Skin smoothing"><span class="hint">strong</span></div>
  <div class="toggle" id="bgChoice" role="radiogroup" aria-label="Background">Background:
    <label><input type="radio" name="bg" value="room" checked> Room</label>
    <label><input type="radio" name="bg" value="blur"> Blur</label>
    <label><input type="radio" name="bg" value="alpha"> Alpha</label>
    <span class="hint">(Room keeps what the camera sees. Blur softens it, you stay sharp. Alpha cuts you out so whatever the scene puts behind you is the room. Blur and alpha are made a few minutes after the take lands; the raw take is kept.)</span></div>
  <div class="toggle" id="cloneChoice" role="radiogroup" aria-label="Which take" style="display:none">Recording:
    <label><input type="radio" name="takeAs" value="speaker" checked> Take A (you)</label>
    <label><input type="radio" name="takeAs" value="clone"> Take B (your clone)</label></div>
  <div id="formatNotes"></div>
  <label class="toggle" id="voiceRow" style="display:none"><input type="checkbox" id="voiceOnly"> Voice only <span class="hint">(no camera: your voice for this scene, read off the prompter. In Studio it can voice a generated performance of you, or play under graphics.)</span></label>
  <div class="toggle" id="voiceUploadRow" style="display:none"><button type="button" class="btn ghost" id="voiceUploadBtn">Upload an audio file</button><input type="file" id="voiceFile" accept="audio/*,video/*" hidden></div>
  <div class="rec-dock"><button class="btn" id="recordBtn" disabled>Record</button></div>
</section>

<section id="stage">
  <video id="live" autoplay muted playsinline></video>
    <canvas id="cap" width="1080" height="1920"></canvas>
  <div id="veil"></div>
  <div id="guide" aria-hidden="true"><div id="oval"></div><div id="eyes"><span>eyes here</span></div></div>
  <div id="top"><span id="timer">0:00</span><div id="meterWrap"><div id="meter"></div></div><button id="lightBadge" type="button" title="Show the light check"><i class="ldot"></i><span id="lightBadgeText">Light</span></button></div>
  <div id="silent">No sound is reaching the mic — this take is recording nothing.</div>
  <div id="count"></div>
  <div id="prompt"><div id="cue"></div><div id="next"></div><div id="next2"></div></div>
  <div id="bar"><div id="barFill"></div></div>
  <div id="lightCard" class="wait" role="status" aria-live="polite"><div id="lightHead"><i class="ldot"></i><span id="lightTitle">Checking your light…</span><button id="lightHide" type="button" aria-label="Hide the light check" title="Hide the light check for this visit">×</button></div><ul id="lightTips"></ul></div>
  <div id="frameWrap"><button class="btn again" id="frameBack">Back</button><button class="btn stop" id="goBtn">Start recording</button></div>
  <div id="stopWrap"><button class="btn again" id="againRecBtn">Start over</button><button class="btn stop" id="stopBtn">Stop</button></div>
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
  <p class="note" id="doneNote">The take is now this scene's speaker base. Go on to the next scene, or record this one again.</p>
  <div class="spacer"></div>
  <button class="btn" id="nextBtn" style="display:none">Next scene</button>
  <div class="row"><button class="btn ghost" id="againBtn">Record again</button><a class="btn ghost" id="studioLink" href="#">Back to Studio</a></div>
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
  // One recording through every scene; the server cuts it per scene where
  // each scene's script begins. That is what the page IS whenever it shows
  // the whole board (no scene in the link, or ?scene=all) -- measured live:
  // a link without a scene prompted all seven scenes and then pinned the
  // whole 49s take to scene 1.
  var recordAll = qp.get('scene') === 'all' || sceneIndex < 0;
  // Embedded in Studio's picker (embed=1): no "back to Studio" (we are in
  // it), and the attached take is announced to the parent so the picker
  // closes and the film reloads with the take in its slot.
  var embedded = qp.get('embed') === '1';
  // VOICE ONLY (?voice=1, or the ready screen's toggle): one scene's voice,
  // no camera -- recorded here or uploaded, it lands as the scene's voice
  // recording (POST /api/voice-line). Marc, Oct 8: "I'll just record the
  // voice ... from my device, from my phone, upload it".
  var voiceMode = qp.get('voice') === '1', voiceAllowed = false;
  // In Studio's dialog the page sizes to its content and says how tall it
  // is, so the whole ready screen (lines, choices, Record) fits without a
  // scroll inside a scroll (Marc: "make this entire screen fit").
  function postSize() {
    if (!embedded) return;
    // The VISIBLE section's own height, not the document's: the document
    // fills whatever frame it is given, which read as "never shrink". The
    // live camera view is fixed-position and gets a 16:9 preview's worth.
    var active = document.querySelector('section.on');
    var h = (!active || active.id === 'stage') ? Math.round(Math.min(window.innerWidth * 9 / 16, 560)) : active.scrollHeight + 4;
    try { window.parent.postMessage({ type: 'mp-take-size', height: h }, window.location.origin); } catch (e) {}
  }
  if (embedded) {
    document.body.classList.add('embed');
    try { new ResizeObserver(function () { postSize(); }).observe(document.body); } catch (e) { setInterval(postSize, 600); }
    window.addEventListener('load', postSize);
  }
  if (embedded) { ['studioLinkTop'].forEach(function (id) { var el = document.getElementById(id); if (el && el.parentNode) el.parentNode.style.display = 'none'; }); document.querySelectorAll('#studioLink').forEach(function (el) { el.style.display = 'none'; }); }
  ${PROMPTER_TIMING_JS}
  ${NEXT_SCENE_JS}
  // The film's scenes (has lines?) and which already have a take: the done
  // screen's Next scene.
  var filmScenes = [], takenScenes = [];
  // The booth's words for the scene's setting and its beats' directions
  // (core/performer-settings.ts, core/proof-placement.ts).
  var SETTINGS = ${BOOTH_SETTINGS}, USES = ${BOOTH_USES};
  function takingClone() { var r = document.querySelector('input[name="takeAs"]:checked'); return !!r && r.value === 'clone' && $('cloneChoice').style.display !== 'none'; }

  function show(id) {
    ['ready','stage','review','upload','done','err'].forEach(function (s) { $(s).classList.toggle('on', s === id); });
    setTimeout(postSize, 50);
    document.documentElement.classList.toggle('lock', id === 'stage');
    try { window.scrollTo(0, 0); } catch (eS) {}
  }
  // While the stage is up no touch scrolls the page (the lock above stops
  // the document; this stops the rubber band).
  document.addEventListener('touchmove', function (ev) { if (document.documentElement.classList.contains('lock')) ev.preventDefault(); }, { passive: false });
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
  // The reader's speed (core/prompter.ts): rebuilds the cues from the same
  // scenes, remembered per film on this phone.
  var speed = loadSpeed(project), cueScenes = [], paceNote = function () {};
  function applySpeed() {
    cues = buildCues(cueScenes, speed);
    total = cues.reduce(function (a, c) { return a + c.dur; }, 0);
    $('speedWpm').textContent = speedWpm(speed) + ' wpm';
    paceNote();
  }
  $('slowerBtn').addEventListener('click', function () { speed = clampSpeed(speed - 0.1); saveSpeed(project, speed); applySpeed(); });
  $('fasterBtn').addEventListener('click', function () { speed = clampSpeed(speed + 0.1); saveSpeed(project, speed); applySpeed(); });
  var projectName = '';
  // THE TAKE FOLLOWS THE FILM'S FRAME (Marc, on a laptop: "why did it record
  // it as if it was an iPhone?"): a 9x16 film records 1080x1920, a 16x9 film
  // 1920x1080, 1x1 1080x1080, 4x5 1080x1350. Set from the project's canvas
  // once it loads; portrait until then.
  var capW = 1080, capH = 1920;
  function setFrame(canvas) {
    var w = Number(canvas && canvas.width) || 1080, h = Number(canvas && canvas.height) || 1920;
    if (w >= h) { capH = 1080; capW = Math.round(1080 * w / h / 2) * 2; }
    else { capW = 1080; capH = Math.round(1080 * h / w / 2) * 2; }
    var cv = $('cap'); cv.width = capW; cv.height = capH;
    var st = $('stage');
    st.style.setProperty('--frame-w', String(w)); st.style.setProperty('--frame-h', String(h));
    if (w >= h) st.classList.add('wide'); else st.classList.remove('wide');
  }

  // One film's script and frame onto the ready screen.
  function loadFilm() {
  var want = project + '/' + sceneIndex;
  $('recordBtn').disabled = true;
  return fetch(withToken('/api/projects/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project)))
    .then(function (r) { if (!r.ok) throw new Error('Could not load the project (' + r.status + '). Is the link still valid?'); return r.json(); })
    .then(function (p) {
      if (want !== project + '/' + sceneIndex) return; // switched again meanwhile
      projectName = p.name || project;
      setFrame(p.canvas);
      // The scene's own setting is the default (the speaker component,
      // core/speaker-layer.ts); a film built without one reads as room.
      try {
        var builtScenes = p.scenes || [];
        var isSpkC = function (c0) { return (c0 && c0.type === 'video' && c0.data && (c0.data.src === 'speaker' || c0.data.src === 'speaker-alpha' || c0.data.speaker_layer === true)); };
        var bScene = sceneIndex >= 0 ? builtScenes[sceneIndex] : builtScenes.filter(function (s0) { return (s0.components || []).some(isSpkC); })[0];
        var spk = bScene && (bScene.components || []).filter(isSpkC)[0];
        var mode = spk ? (spk.data.background || (spk.data.src === 'speaker-alpha' ? 'alpha' : 'room')) : 'room';
        var r0 = document.querySelector('input[name="bg"][value="' + mode + '"]'); if (r0) r0.checked = true;
      } catch (eBg) {}
      var allScenes = (p.storyboard && p.storyboard.scenes) || [];
      filmScenes = allScenes.map(function (s0) { return { label: s0.label || '', lines: !!String(s0.voiceover_text || '').trim() }; });
      takenScenes = (p.takes || []).map(function (t0) { return t0.scene_index; }).filter(function (x) { return typeof x === 'number'; });
      // A CLIP, NOT THE SPEAKER: a scene whose camera need is a clip (or a
      // film no person carries) records a live-action moment that lands as
      // a video on the scene -- room/blur/alpha do not apply.
      try {
        // A switch starts clean: the last film's clip note goes, the choice returns.
        var oldNote = $('clipNote'); if (oldNote && oldNote.parentNode) oldNote.parentNode.removeChild(oldNote);
        if ($('bgChoice')) $('bgChoice').style.display = '';
        var sbSc = sceneIndex >= 0 ? allScenes[sceneIndex] : null;
        var grammarP = (p.treatment && p.treatment.filmGrammar) || '';
        var clipNeed = !!(sbSc && (sbSc.assets || []).some(function (a0) { return a0 && a0.type === 'camera_video' && a0.use === 'clip'; }))
          || (sceneIndex >= 0 && grammarP && grammarP !== 'speaker' && grammarP !== 'creator-cut');
        clipNeedNow = clipNeed;
        if (clipNeed) {
          var bgc = $('bgChoice'); if (bgc) bgc.style.display = 'none';
          var clipNote = document.createElement('div'); clipNote.className = 'hint'; clipNote.id = 'clipNote';
          clipNote.textContent = 'This is a clip on the scene, not the speaker: it lands as a video where the scene shows it.';
          if (bgc && bgc.parentNode) bgc.parentNode.insertBefore(clipNote, bgc);
        }
      } catch (eClip) {}
      // HOW TO FILM THIS SCENE: the setting's guidance, each beat's
      // direction (point, prop, react...), and on a clone scene the choice
      // of which take this is.
      try {
        var fNotes = $('formatNotes'); fNotes.innerHTML = '';
        var sbF = sceneIndex >= 0 ? allScenes[sceneIndex] : null;
        var lines = [];
        var stg = sbF && sbF.performer ? SETTINGS[sbF.performer.setting] : null;
        if (/^yap-/.test(String((p.treatment && p.treatment.recipe) || ''))) lines.push('Yap: the lines are talking points, not a script. Say it your way, in one go; the captions come from what you say.');
        if (stg) lines.push(stg.name + ': ' + stg.booth);
        var cloneNeed = null;
        ((sbF && sbF.assets) || []).forEach(function (a0) {
          if (!a0) return;
          if (a0.type === 'camera_video' && a0.use === 'clone') { cloneNeed = a0; return; }
          var u = USES[a0.use];
          if (u) lines.push(u.name + ' (' + a0.description + '): ' + u.booth);
        });
        if (cloneNeed) lines.push('Clone: ' + USES.clone.booth + ' Take B listens and reacts in silence for the whole scene; its sound is not used.');
        $('cloneChoice').style.display = cloneNeed ? '' : 'none';
        if (!cloneNeed) { var rA = document.querySelector('input[name="takeAs"][value="speaker"]'); if (rA) rA.checked = true; }
        lines.forEach(function (t) { var d = document.createElement('div'); d.className = 'hint'; d.textContent = t; fNotes.appendChild(d); });
      } catch (eFmt) {}
      var scenes = sceneIndex >= 0 && allScenes[sceneIndex] ? [allScenes[sceneIndex]] : allScenes;
      sceneLabel = sceneIndex >= 0 && allScenes[sceneIndex] ? ('Scene ' + (sceneIndex + 1) + (allScenes[sceneIndex].label ? ' · ' + allScenes[sceneIndex].label : '')) : '';
      cueScenes = scenes;
      applySpeed();
      // In Studio's dialog the header already names the project and the
      // scene; here only the scene's own label. Alone in a tab, both.
      $('title').textContent = embedded ? ((sceneLabel ? sceneLabel.replace(/^Scene \\d+ · /, '').replace(/^Scene \\d+\\s*[-–—:·]\\s*/i, '') : projectName)) : (projectName + (sceneLabel ? ' — ' + sceneLabel : ''));
      if (embedded) postSize();
      // The copy speaks to the device: a laptop is not held upright.
      var touch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
      if (!touch && $('readyNote')) $('readyNote').textContent = 'Sit centered and look at the lens. Click Record: the camera opens with a quick light check; Start recording gives a 3-second count-in, then your lines one at a time at speaking pace. Click anywhere to jump to the next line.';
      var g = (p.treatment && p.treatment.filmGrammar) || '';
      var beats = scenes.filter(function (s) { return String(s.voiceover_text || '').trim(); }).length;
      paceNote = function () {
        $('subtitle').textContent = beats
          ? beats + (beats === 1 ? ' beat' : ' beats') + ' · about ' + fmt(total) + ' at ' + speedWpm(speed) + ' wpm' + (g ? ' · ' + g : '')
          : 'This film has no spoken lines' + (g ? ' (grammar: ' + g + ')' : '') + '. You can still record; there will be no prompter.';
      };
      paceNote();
      $('speedRow').style.display = beats ? '' : 'none';
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
      voiceAllowed = sceneIndex >= 0 && !clipNeedNow;
      applyVoiceMode();
      $('recordBtn').disabled = false;
    })
    .catch(function (e) { fail(e.message || String(e)); });
  }
  // A voice is one scene's, and never a clip's (a clip is a picture).
  var clipNeedNow = false;
  function applyVoiceMode() {
    if (!voiceAllowed) voiceMode = false;
    $('voiceRow').style.display = voiceAllowed ? '' : 'none';
    $('voiceOnly').checked = voiceMode;
    $('voiceUploadRow').style.display = voiceMode ? '' : 'none';
    ['bgChoice', 'softDial'].forEach(function (id) { var el = $(id); if (el) el.classList.toggle('vhide', voiceMode); });
    var soft = $('softLook') && $('softLook').parentNode; if (soft) soft.classList.toggle('vhide', voiceMode);
    var cl = $('cloneChoice'); if (cl) cl.classList.toggle('vhide', voiceMode);
    $('recordBtn').textContent = voiceMode ? 'Record my voice' : 'Record';
    if (voiceMode) $('readyNote').textContent = 'Voice only: no camera. Tap Record my voice for a 3-second count-in, then read your lines as they show, at your own pace. Or upload an audio file of this scene.';
    postSize();
  }
  $('voiceOnly').addEventListener('change', function () { voiceMode = this.checked; releaseCamera(); applyVoiceMode(); });
  $('voiceUploadBtn').addEventListener('click', function () { $('voiceFile').click(); });
  $('voiceFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; this.value = '';
    if (!f) return;
    blob = f; blobDuration = 0;
    uploadVoice(f, (f.name.split('.').pop() || 'webm').toLowerCase());
  });
  loadFilm();

  // ── recording ──────────────────────────────────────────────────────────
  var stream = null, rec = null, chunks = [], mime = '', ext = 'webm';
  var t0 = 0, tickTimer = null, audioCtx = null, meterRaf = null, lastLoud = 0, wake = null;
  var blob = null, blobDuration = 0, trackW = 0, trackH = 0;

  var CANDS = ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  var VOICE_CANDS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  function pickMime() {
    if (!window.MediaRecorder) return '';
    var cands = voiceMode ? VOICE_CANDS : CANDS;
    for (var i = 0; i < cands.length; i++) { try { if (MediaRecorder.isTypeSupported(cands[i])) return cands[i]; } catch (e) {} }
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

  ${PROMPTER_VIEW_JS}
  function runPrompter() { $('barFill').style.width = '0%'; showCue(0); }
  function advanceCue() { if (rec && rec.state === 'recording' && cueIdx >= 0 && cueIdx < cues.length) showCue(cueIdx + 1); }
  $('stage').addEventListener('click', function (ev) { if (ev.target && (ev.target.id === 'stopBtn' || ev.target.id === 'againRecBtn' || ev.target.closest && ev.target.closest('#stopWrap'))) return; advanceCue(); });

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

  // ── light check: measure the live frame before the take ──────────────
  // lightStats / lightAdvice / guideOval come from src/core/light-check.ts,
  // inlined verbatim so the tests run the code the phone runs.
  ${LIGHT_CHECK_JS}
  // Hidden with the x: this visit's takes go straight to the count-in.
  // sessionStorage can throw (private mode, blocked storage): treat that as
  // "not hidden" -- the check shows, recording never depends on it.
  var LIGHT_OFF_KEY = 'mp.booth.lightcheck.off';
  function lightOff() { try { return sessionStorage.getItem(LIGHT_OFF_KEY) === '1'; } catch (e) { return false; } }
  function setLightOff(v) { try { if (v) sessionStorage.setItem(LIGHT_OFF_KEY, '1'); else sessionStorage.removeItem(LIGHT_OFF_KEY); } catch (e) {} }
  var lcTimer = null, lcCanvas = null, lcSmooth = null, lcShown = null;

  // The oval and the eyes line, drawn over the camera picture's own box
  // (the full-bleed stage, or the centred frame of a wide film) with the
  // same numbers the measurement uses, so the face you frame is the face
  // measured.
  function placeGuide() {
    var r = $('live').getBoundingClientRect(), s0 = $('stage').getBoundingClientRect();
    if (!r.width || !r.height) return;
    var o = guideOval(r.width, r.height), x0 = r.left - s0.left, y0 = r.top - s0.top;
    var ov = $('oval').style;
    ov.left = (x0 + o.cx - o.rx) + 'px'; ov.top = (y0 + o.cy - o.ry) + 'px'; ov.width = (2 * o.rx) + 'px'; ov.height = (2 * o.ry) + 'px';
    var ey = $('eyes').style;
    ey.left = (x0 + o.cx - o.rx * 1.7) + 'px'; ey.width = (o.rx * 3.4) + 'px'; ey.top = (y0 + o.eyeY) + 'px';
  }
  window.addEventListener('resize', function () { if ($('stage').classList.contains('framing')) placeGuide(); });

  // One sample: the picture the screen shows (object-fit: cover of the
  // camera into the element's box), downscaled to 160px wide -- ~45k pixels
  // at 2 a second is nothing next to the camera itself.
  function sampleLight() {
    var v = $('live'), vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh || v.readyState < 2) return;
    var r = v.getBoundingClientRect(); if (!r.width || !r.height) return;
    var sw = 160, sh = Math.max(60, Math.min(400, Math.round(160 * r.height / r.width)));
    if (!lcCanvas) lcCanvas = document.createElement('canvas');
    if (lcCanvas.width !== sw) lcCanvas.width = sw;
    if (lcCanvas.height !== sh) lcCanvas.height = sh;
    var ctx = lcCanvas.getContext('2d', { willReadFrequently: true }); if (!ctx) return;
    var k = Math.max(sw / vw, sh / vh), dw = vw * k, dh = vh * k;
    ctx.drawImage(v, (sw - dw) / 2, (sh - dh) / 2, dw, dh);
    var st = lightStats(ctx.getImageData(0, 0, sw, sh).data, sw, sh);
    // Smoothed over ~1.5s: a hand through the frame or a head turn must not
    // flicker the tips.
    if (!lcSmooth) lcSmooth = st;
    else for (var key in st) lcSmooth[key] = lcSmooth[key] * 0.6 + st[key] * 0.4;
    renderLight(lightAdvice(lcSmooth));
  }
  function renderLight(tips) {
    var good = !tips.length;
    if (good) maybeLock();
    var key = tips.map(function (t) { return t.text; }).join('|');
    if (key === lcShown) return;
    lcShown = key;
    var card = $('lightCard'); card.classList.remove('wait'); card.classList.toggle('good', good);
    $('lightTitle').textContent = good ? 'Light looks good' : 'Light check';
    var ul = $('lightTips'); ul.innerHTML = '';
    tips.forEach(function (t) { var li = document.createElement('li'); li.textContent = t.text; ul.appendChild(li); });
    $('lightBadge').classList.toggle('good', good);
    $('lightBadgeText').textContent = good ? 'Light good' : (tips.length + (tips.length === 1 ? ' light tip' : ' light tips'));
  }
  function startLightCheck() {
    if (lcTimer) return;
    lcSmooth = null; lcShown = null;
    $('lightCard').className = 'wait';
    $('lightTitle').textContent = 'Checking your light…'; $('lightTips').innerHTML = ''; $('lightBadgeText').textContent = 'Light';
    lcTimer = setInterval(function () { try { sampleLight(); } catch (e) { /* a courtesy; never the take */ } }, 500);
  }
  function stopLightCheck() { if (lcTimer) clearInterval(lcTimer); lcTimer = null; }

  // PREROLL: camera up, guide and light check showing, Start recording
  // rolls. Non-blocking by construction -- Start is live from the first
  // frame whatever the check says.
  function enterFraming() {
    var st = $('stage');
    st.classList.add('preroll', 'framing'); st.classList.toggle('lightoff', lightOff());
    placeGuide(); startLightCheck();
  }
  function leaveFraming() { $('stage').classList.remove('preroll'); stopLightCheck(); }
  $('goBtn').addEventListener('click', function (ev) {
    ev.stopPropagation(); leaveFraming();
    if (stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; })) roll(stream);
    else { stopAll(); show('ready'); $('recordBtn').disabled = false; }
  });
  $('frameBack').addEventListener('click', function (ev) { ev.stopPropagation(); stopAll(); show('ready'); $('recordBtn').disabled = false; });
  $('lightHide').addEventListener('click', function (ev) { ev.stopPropagation(); setLightOff(true); $('stage').classList.add('lightoff'); maybeLock(); });
  $('lightBadge').addEventListener('click', function (ev) { ev.stopPropagation(); setLightOff(false); $('stage').classList.remove('lightoff'); });

  // ── exposure + white balance lock ──────────────────────────────────────
  // Auto exposure and auto white balance hunt while you talk: a hand, a
  // white shirt, a head turn and the whole picture pumps brighter/darker
  // and warmer/cooler mid-sentence. Once the light is set (the check is
  // green, hidden, or the count-in starts) and the camera has had ~1.5s to
  // settle, freeze both at what the camera metered. ONLY where the track
  // lists the modes in getCapabilities() -- Chrome on Android does
  // (exposureMode / whiteBalanceMode 'manual' with exposureTime /
  // colorTemperature), as do some USB webcams in desktop Chrome. iOS Safari
  // (and desktop Safari, Firefox) expose neither: nothing happens there and
  // the phone's own auto stays on. A throw or a rejection is swallowed --
  // a lock is a nicety, the take is the job.
  var camLiveAt = 0, lockedTrack = null, lockPending = false;
  function maybeLock() {
    var vt = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;
    if (!vt || vt === lockedTrack || vt.readyState !== 'live' || lockPending) return;
    var wait = 1500 - (performance.now() - camLiveAt);
    if (wait > 0) { lockPending = true; setTimeout(function () { lockPending = false; maybeLock(); }, wait + 20); return; }
    lockedTrack = vt;
    lockCamera(vt);
  }
  function lockCamera(vt) {
    try {
      if (!vt.getCapabilities || !vt.applyConstraints) return;
      var caps = vt.getCapabilities() || {};
      var set = vt.getSettings ? (vt.getSettings() || {}) : {};
      var has = function (list, m) { return Array.isArray(list) && list.indexOf(m) >= 0; };
      var adv = [];
      if (has(caps.exposureMode, 'manual')) {
        var ex = { exposureMode: 'manual' };
        if (typeof set.exposureTime === 'number' && caps.exposureTime) ex.exposureTime = set.exposureTime;
        adv.push(ex);
      } else if (has(caps.exposureMode, 'none')) adv.push({ exposureMode: 'none' });
      if (has(caps.whiteBalanceMode, 'manual')) {
        var wb = { whiteBalanceMode: 'manual' };
        if (typeof set.colorTemperature === 'number' && caps.colorTemperature) wb.colorTemperature = set.colorTemperature;
        adv.push(wb);
      } else if (has(caps.whiteBalanceMode, 'none')) adv.push({ whiteBalanceMode: 'none' });
      if (!adv.length) return;
      // applyConstraints REPLACES the track's constraint set: carry the
      // size and frame rate we asked for, or the camera may fall back to its
      // default resolution. Separate advanced sets, so a camera that takes
      // one lock and refuses the other still gets the one.
      var base = vt.getConstraints ? (vt.getConstraints() || {}) : {};
      var c = {};
      for (var bk in base) { if (bk !== 'advanced') c[bk] = base[bk]; }
      c.advanced = adv;
      var p = vt.applyConstraints(c);
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* never break the take over a lock */ }
  }

  function tick() {
    var el = (performance.now() - t0) / 1000;
    $('timer').textContent = fmt(el) + (total ? ' / ' + fmt(total) : '');
    if (total) $('barFill').style.width = Math.min(100, (el / total) * 100) + '%';
  }

  $('softLook').addEventListener('change', function () { $('softDial').classList.toggle('off', !this.checked); });
  $('recordBtn').addEventListener('click', function () {
    $('recordBtn').disabled = true;
    $('stage').classList.toggle('voice', voiceMode);
    if (voiceMode) {
      // The mic alone; a camera left open from a video take goes first.
      if (stream && stream.getVideoTracks().length) releaseCamera();
      var liveV = stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; });
      (liveV ? Promise.resolve(stream) : navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } })).then(function (s) {
        stream = s; trackW = 0; trackH = 0;
        show('stage');
        $('timer').textContent = '0:00'; $('timer').classList.remove('rec');
        startMeter(s);
        if (navigator.wakeLock && navigator.wakeLock.request) { navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {}); }
        roll(s);
      }).catch(function (e) {
        $('recordBtn').disabled = false;
        fail('The microphone was not allowed (' + (e.name || e) + '). Allow it for this site and try again.');
      });
      return;
    }
    var constraints = {
      video: { facingMode: 'user', width: { ideal: capW }, height: { ideal: capH }, frameRate: { ideal: 30 } },
      // Mirrors the recorder extension so a take behaves the same on every device.
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    };
    // Ask for the camera ONCE per visit: the stream stays open across
    // review, retake and record-again (the browser asked again on every
    // take -- Marc: "I've already said yes"). Released when the page hides.
    var live = stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; });
    (live ? Promise.resolve(stream) : navigator.mediaDevices.getUserMedia(constraints)).then(function (s) {
      if (s !== stream) camLiveAt = performance.now();
      stream = s;
      var vt = s.getVideoTracks()[0]; var st = vt && vt.getSettings ? vt.getSettings() : {};
      trackW = st.width || 0; trackH = st.height || 0;
      $('live').srcObject = s;
      show('stage');
      $('timer').textContent = '0:00'; $('timer').classList.remove('rec');
      startMeter(s);
      if (navigator.wakeLock && navigator.wakeLock.request) { navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {}); }
      // The light check first (Start recording rolls), unless it was hidden
      // this visit: then straight to the count-in, as before.
      if (lightOff()) roll(s); else enterFraming();
    }).catch(function (e) {
      $('recordBtn').disabled = false;
      fail('Camera or microphone was not allowed (' + (e.name || e) + '). Allow both for this site and try again.');
    });
  });

  // 3-2-1 count-in, then roll. Its own function so Start over can run it
  // again on the SAME stream, from the stage.
  var countTimer = null;
  function roll(s) {
      // The guide stays up through the count-in (last chance to frame), and
      // the count-in is when the camera's auto exposure/white balance lock.
      if (!voiceMode) { $('stage').classList.add('framing'); placeGuide(); maybeLock(); }
      var n = 3; $('count').style.display = 'flex'; $('count').textContent = String(n);
      var cd = countTimer = setInterval(function () {
        n -= 1;
        if (n > 0) { $('count').textContent = String(n); return; }
        clearInterval(cd); countTimer = null; $('count').style.display = 'none';
        mime = pickMime(); ext = mime.indexOf('mp4') >= 0 ? (voiceMode ? 'm4a' : 'mp4') : 'webm';
        chunks = [];
        // Record the PICTURE ON SCREEN, not the camera track. iOS hands the
        // recorder the sensor's landscape frame with a rotation tag (the
        // screen shows a portrait cover-crop of it); recording the raw track
        // ships a wide, sideways-stored file. Drawing the displayed video into
        // a portrait canvas and recording the canvas gives true portrait
        // pixels at full size and no tag. Falls back to the raw track where
        // captureStream is missing; the server sanitizer handles that file.
        var src = s;
        capture = voiceMode ? 'voice' : 'raw';
        var cv = $('cap');
        if (!voiceMode && (cv.captureStream || cv.mozCaptureStream)) {
          try {
            var cs = (cv.captureStream ? cv.captureStream(30) : cv.mozCaptureStream(30));
            src = new MediaStream();
            cs.getVideoTracks().forEach(function (t) { src.addTrack(t); });
            s.getAudioTracks().forEach(function (t) { src.addTrack(t); });
            capture = 'canvas';
            startDraw();
          } catch (e) { src = s; capture = 'raw'; }
        }
        // The bitrate is asked for: left to the browser it lands near 2.5 Mbps,
        // which smears hair and skin at 1080p (Marc: "the camera quality on
        // the laptop seems low"). 12 Mbps video, 128 kbps audio: at 8 Mbps a
        // 1080x1920 30fps take from iOS BANDS the soft gradients of skin and a
        // plain wall, and the steps show once the take is graded and
        // re-encoded. 12 keeps them smooth, for ~90 MB a minute.
        var recOpts = { videoBitsPerSecond: 12000000, audioBitsPerSecond: 128000 };
        if (voiceMode) delete recOpts.videoBitsPerSecond;
        if (mime) recOpts.mimeType = mime;
        try { rec = new MediaRecorder(src, recOpts); }
        catch (e1) {
          // A browser that cannot record a canvas stream still records the camera.
          stopDraw(); src = s; capture = 'raw';
          try { rec = new MediaRecorder(src, recOpts); }
          catch (e) { stopAll(); fail('This browser cannot record video here (' + (e.message || e) + ').'); return; }
        }
        rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onstop = onStopped;
        rec.start(1000);
        $('stage').classList.remove('framing');
        t0 = performance.now();
        $('timer').classList.add('rec');
        tickTimer = setInterval(tick, 200);
        runPrompter();
      }, 1000);
  }

  // START OVER: throw the take away and roll again from the count-in --
  // camera, meter and stage stay up; nothing is uploaded or reviewed.
  $('againRecBtn').addEventListener('click', function () {
    if (countTimer) { clearInterval(countTimer); countTimer = null; }
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.ondataavailable = null; try { rec.stop(); } catch (eR) {} }
    rec = null; chunks = [];
    stopDraw();
    if (tickTimer) clearInterval(tickTimer); tickTimer = null;
    clearPrompter();
    $('timer').textContent = '0:00'; $('timer').classList.remove('rec'); $('barFill').style.width = '0%';
    if (stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; })) roll(stream);
    else { stopAll(); show('ready'); $('recordBtn').disabled = false; }
  });

  function stopAll() {
    leaveFraming(); $('stage').classList.remove('framing');
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
    blob = new Blob(chunks, { type: mime || (voiceMode ? 'audio/webm' : 'video/webm') });
    stopAll();
    if (!blob.size) { fail('The recording came back empty. Try again.'); return; }
    var url = URL.createObjectURL(blob);
    var v = $('play'); v.src = url; v.load();
    $('reviewMeta').textContent = fmt(blobDuration) + (total ? ' recorded · script is ' + fmt(total) : '') + ' · ' + (blob.size / 1048576).toFixed(1) + ' MB'
      + (voiceMode ? ' · voice only' : capture === 'canvas' ? ' · ' + capW + '×' + capH : (trackW && trackH ? ' · ' + trackW + '×' + trackH : '')) + ' · ' + ext;
    show('review');
  }

  $('retakeBtn').addEventListener('click', function () { blob = null; chunks = []; $('play').src = ''; show('ready'); $('recordBtn').disabled = false; });

  // ── upload + attach ────────────────────────────────────────────────────
  // A voice: straight to the scene's voice recording (no take, no camera).
  function uploadVoice(b, e) {
    show('upload');
    $('uploadMeta').textContent = 'Your voice · ' + (b.size / 1048576).toFixed(1) + ' MB';
    $('uploadFill').style.width = '0%';
    $('uploadNote').textContent = 'Sending your voice to the project.';
    var xhr = new XMLHttpRequest();
    xhr.open('POST', withToken('/api/voice-line/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(project) + '?scene=' + sceneIndex + '&name=' + encodeURIComponent('voice.' + e)));
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = function (ev) { if (ev.lengthComputable) $('uploadFill').style.width = Math.round((ev.loaded / ev.total) * 100) + '%'; };
    xhr.onerror = function () { fail('Upload failed (network). Check the connection and try again.'); };
    xhr.onload = function () {
      var j = {}; try { j = JSON.parse(xhr.responseText); } catch (eJ) {}
      if (xhr.status < 200 || xhr.status >= 300) { fail('Could not attach your voice (' + xhr.status + '): ' + (j.error || xhr.responseText || '').slice(0, 200)); return; }
      $('doneMeta').textContent = projectName + (blobDuration ? ' · ' + fmt(blobDuration) : '') + ' · voice';
      $('studioLink').href = studioHref;
      showNext();
      $('doneNote').textContent = 'Your voice is in for this scene. In Studio, pick what the scene shows: a performance made from your voice, or graphics over it.';
      show('done');
      releaseCamera();
      if (embedded) { try { window.parent.postMessage({ type: 'mp-take-attached', scene_index: sceneIndex, project: project, voice: true }, window.location.origin); } catch (eP) {} }
    };
    xhr.send(b);
  }

  $('useBtn').addEventListener('click', function () {
    if (!blob) return;
    if (voiceMode) { uploadVoice(blob, ext); return; }
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
          soft_strength: $('softStrength') ? parseFloat($('softStrength').value) : undefined,
          background: (document.querySelector('input[name="bg"]:checked') || {}).value || 'room',
          scene_index: recordAll ? 'all' : (sceneIndex >= 0 ? sceneIndex : undefined),
          as: takingClone() && !recordAll ? 'clone' : undefined,
          width: capture === 'canvas' ? capW : trackW, height: capture === 'canvas' ? capH : trackH }),
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('attach failed (' + r.status + ')')); return j; }); })
        .then(function (j) {
          $('doneMeta').textContent = projectName + ' · ' + fmt(blobDuration) + ' take';
          $('studioLink').href = studioHref;
          showNext();
          show('done');
          // The take is in: the camera goes off (it stayed lit in the dialog
          // after "Use this take" -- measured live on a laptop).
          releaseCamera();
          if (embedded) { try { window.parent.postMessage({ type: 'mp-take-attached', scene_index: recordAll ? 'all' : sceneIndex, project: project }, window.location.origin); } catch (e) {} }
        })
        .catch(function (e) { fail(e.message || String(e)); });
    };
    xhr.send(blob);
  });

  $('againBtn').addEventListener('click', function () { blob = null; chunks = []; show('ready'); $('recordBtn').disabled = false; });
  // Next scene: the next one with lines and no take, straight onto its ready
  // screen -- no trip back through Studio. Not in Studio's dialog (it closes
  // on attach) and not for a whole-film take.
  function showNext() {
    var nb = $('nextBtn');
    if (sceneIndex >= 0 && takenScenes.indexOf(sceneIndex) < 0) takenScenes.push(sceneIndex);
    var n = (embedded || recordAll) ? -1 : nextOpenScene(filmScenes, takenScenes, sceneIndex);
    nb.dataset.scene = String(n);
    nb.style.display = n >= 0 ? '' : 'none';
    if (n >= 0) nb.textContent = 'Next: Scene ' + (n + 1) + (filmScenes[n] && filmScenes[n].label ? ' \u00b7 ' + filmScenes[n].label : '');
    // With no next scene, Back to Studio is the way on.
    $('studioLink').className = n >= 0 ? 'btn ghost' : 'btn';
    $('doneNote').textContent = n >= 0 ? 'The take is in. Go on to the next scene you have not recorded, or record this one again.'
      : (recordAll || embedded ? 'The take is in.' : 'The take is in, and every scene now has one.');
  }
  $('nextBtn').addEventListener('click', function () {
    var n = Number($('nextBtn').dataset.scene);
    if (!(n >= 0)) return;
    sceneIndex = n; recordAll = false; blob = null; chunks = [];
    try { var u = new URL(location.href); u.searchParams.set('scene', String(n)); history.replaceState(null, '', u.toString()); } catch (eU) {}
    show('ready');
    loadFilm();
  });
  $('errBtn').addEventListener('click', function () { stopAll(); show('ready'); $('recordBtn').disabled = !cues && false; $('recordBtn').disabled = false; });
})();
</script>
</body>
</html>`;
}
