// Quotient Recorder -- offscreen document: MediaRecorder(s) + uploader.
// MV3 service workers can't run MediaRecorder, so this document records the
// tab stream (and optionally the camera+mic as a second, same-clock
// recording) and, on stop, uploads straight from here (video [-> camera]
// -> events sidecar -> trigger generate) to avoid shuttling large blobs
// through extension messaging.
//
// Lifecycle: PREP (getUserMedia + recorders created, nothing rolling) ->
// BEGIN (recorders start together after the in-page countdown) ->
// PAUSE/RESUME (both recorders in lockstep; the film has no paused footage)
// -> STOP (upload) or ABORT (armed-but-never-rolled).

let recorder = null;       // tab video (+ mic when no camera)
let camRecorder = null;    // camera + mic (its own file, same clock)
let chunks = [];
let camChunks = [];
let trackDims = { width: 0, height: 0 };
let micStream = null;
let camStream = null;

// 1s heartbeat while recording: drives the toolbar badge's elapsed clock AND
// keeps the MV3 service worker awake (it computes the badge from session
// state; without events it can idle out mid-take). This document is alive
// exactly while a recording is, so it is the natural metronome.
let tickTimer = null;
function startTick() {
  stopTick();
  tickTimer = setInterval(() => { try { chrome.runtime.sendMessage({ type: "qr-tick" }); } catch (e) {} }, 1000);
}
function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "qr-offscreen-prep") prep(msg.streamId, msg.mic, msg.camera, msg.dims);
  else if (msg.type === "qr-offscreen-begin") { begin(); startTick(); }
  else if (msg.type === "qr-offscreen-pause") { stopTick(); try { recorder?.pause(); camRecorder?.pause(); } catch (e) {} }
  else if (msg.type === "qr-offscreen-resume") { startTick(); try { recorder?.resume(); camRecorder?.resume(); } catch (e) {} }
  else if (msg.type === "qr-offscreen-abort") { stopTick(); abort(); }
  else if (msg.type === "qr-offscreen-stop") { stopTick(); stop(msg.upload); }
});

async function prep(streamId, mic, camera, dims) {
  try {
    // Pinning min==max==tab size makes Chrome deliver tab-exact frames
    // instead of display-sized frames with the tab letterboxed inside.
    const sizing = dims && dims.w > 0
      ? { minWidth: dims.w, minHeight: dims.h, maxWidth: dims.w, maxHeight: dims.h }
      : {};
    const tab = await navigator.mediaDevices.getUserMedia({
      audio: false, // tab audio stays out -- we want the VOICE, not page sounds
      video: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId, ...sizing },
      },
    });
    const tabTracks = [tab.getVideoTracks()[0]];
    let mimeType = "video/webm;codecs=vp9";

    if (mic || camera) {
      // Permission was primed by the setup tab (offscreen can't prompt).
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        ...(camera ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } } : {}),
      });
      if (camera && micStream.getVideoTracks().length) {
        // Camera mode: voice lives WITH the face in its own recording; the
        // tab file stays video-only. Both recorders start in the same tick,
        // so the two files share one clock.
        camStream = micStream;
        camRecorder = new MediaRecorder(camStream, { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 2_500_000 });
        camChunks = [];
        camRecorder.ondataavailable = (e) => { if (e.data && e.data.size) camChunks.push(e.data); };
      } else {
        // Mic only: voice muxes into the tab recording (Mode A classic).
        tabTracks.push(micStream.getAudioTracks()[0]);
        mimeType = "video/webm;codecs=vp9,opus";
      }
    }

    const settings = tab.getVideoTracks()[0]?.getSettings?.() || {};
    trackDims = { width: settings.width || 0, height: settings.height || 0 };
    chunks = [];
    recorder = new MediaRecorder(new MediaStream(tabTracks), { mimeType, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  } catch (e) {
    status("error", "capture failed: " + (e && e.message || e));
  }
}

function begin() {
  try {
    if (!recorder) { status("error", "not prepped"); return; }
    recorder.start(1000);
    camRecorder?.start(1000);
  } catch (e) {
    status("error", "start failed: " + (e && e.message || e));
  }
}

function releaseStreams() {
  try { recorder?.stream?.getTracks().forEach((t) => t.stop()); } catch (e) {}
  try { camStream?.getTracks().forEach((t) => t.stop()); } catch (e) {}
  try { micStream?.getTracks().forEach((t) => t.stop()); } catch (e) {}
  recorder = null; camRecorder = null; micStream = null; camStream = null;
  chunks = []; camChunks = [];
}

function abort() {
  releaseStreams();
}

async function stopRecorder(rec) {
  if (!rec || rec.state === "inactive") return;
  await new Promise((resolve) => { rec.onstop = resolve; try { rec.stop(); } catch (e) { resolve(); } });
}

async function stop(upload) {
  try {
    if (!recorder) { status("error", "not recording"); return; }
    const rec = recorder;
    const cam = camRecorder;
    await stopRecorder(rec);
    await stopRecorder(cam);
    const blob = new Blob(chunks, { type: "video/webm" });
    const camBlob = cam ? new Blob(camChunks, { type: "video/webm" }) : null;
    releaseStreams();
    if (!blob.size) { status("error", "empty recording"); return; }

    const base = upload.server;
    const q = (extra) => `token=${encodeURIComponent(upload.token)}${extra || ""}`;

    // Progress: one combined meter across both files (a 5-minute take is
    // ~100-300MB; a bare "Uploading..." reads as a hang). XHR because the
    // offscreen document is a real page and fetch has no upload progress.
    const totalBytes = blob.size + (camBlob ? camBlob.size : 0);
    let uploadedBase = 0;
    let lastSent = 0;
    const report = (loaded) => {
      const now = Date.now();
      if (now - lastSent < 400 && uploadedBase + loaded < totalBytes) return;
      lastSent = now;
      status("uploading", null, null, {
        done: uploadedBase + loaded,
        total: totalBytes,
        pct: Math.min(100, Math.round(((uploadedBase + loaded) / totalBytes) * 100)),
      });
    };
    report(0);
    const uploadAsset = (name, body) => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${base}/api/upload-asset/${encodeURIComponent(upload.tenant)}/${encodeURIComponent(upload.project)}?${q(`&name=${encodeURIComponent(name)}`)}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) report(e.loaded); };
      xhr.onload = () => {
        let j = null;
        try { j = JSON.parse(xhr.responseText); } catch (e) { /* fall through */ }
        if (xhr.status >= 200 && xhr.status < 300 && j && j.ok) {
          uploadedBase += body.size;
          report(0);
          resolve(j);
        } else reject(new Error((j && j.error) || `upload HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error("upload network error"));
      xhr.ontimeout = () => reject(new Error("upload timed out"));
      xhr.send(body);
    });

    // 1. Tab video, then the camera take when there is one.
    const upJson = await uploadAsset(upload.name, blob);
    const finalName = upJson.url.split("/").pop();
    let camJson = null;
    if (camBlob && camBlob.size) camJson = await uploadAsset(upload.cameraName, camBlob);

    // 2. Events sidecar (recording dims from the actual track).
    const events = upload.events;
    events.recording.width = trackDims.width || events.recording.width;
    events.recording.height = trackDims.height || events.recording.height;
    const evRes = await fetch(
      `${base}/api/recorder-events/${encodeURIComponent(upload.tenant)}/${encodeURIComponent(upload.project)}?${q(`&name=${encodeURIComponent(finalName)}`)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(events) },
    );
    const evJson = await evRes.json();
    if (!evRes.ok || !evJson.ok) throw new Error(evJson.error || `events HTTP ${evRes.status}`);

    // 3. Fire generate. Voice location: camera file if present, else muxed
    // into the tab recording (narration_embedded).
    const prompt = `Recorded walkthrough ${new Date().toLocaleString()}`;
    const genRes = await fetch(
      `${base}/api/recorder-generate/${encodeURIComponent(upload.tenant)}?${q()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: upJson.url,
          prompt,
          narration_embedded: !!upload.mic && !camJson,
          camera_url: camJson ? camJson.url : undefined,
          // Save-to picker: append to this existing project instead of
          // assembling a fresh walkthrough project.
          dest_project_id: upload.destProjectId || undefined,
        }),
      },
    );
    const genJson = await genRes.json();
    if (!genRes.ok || !genJson.ok) throw new Error(genJson.error || `generate HTTP ${genRes.status}`);

    // Append mode resolves synchronously: the scene is already in the
    // destination project -- link straight to it, no assembly to wait for.
    if (genJson.appended_scene && genJson.project_id) {
      status("ready", null, studioUrl(upload, genJson.project_id));
      return;
    }
    // The chosen destination vanished server-side: the take still became a
    // fresh walkthrough (today's behavior) -- say so, then poll as usual.
    if (genJson.fallback === "new_project") {
      status("done", null, null, null, "That project no longer exists — assembling a new walkthrough instead; it appears in Studio in a few minutes.");
    } else {
      status("done");
    }
    // 4. Close the loop: poll until the project exists, then hand the user
    // its Studio link (assembly is minutes; whisper on first Mode A run more).
    pollForProject(upload, prompt);
  } catch (e) {
    status("error", String(e && e.message || e));
  }
}

function studioUrl(upload, id) {
  return `${upload.server}/studio?tenant=${encodeURIComponent(upload.tenant)}&project=${encodeURIComponent(id)}&token=${encodeURIComponent(upload.token)}`;
}

async function pollForProject(upload, prompt) {
  const base = upload.server;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    try {
      const res = await fetch(`${base}/api/projects/${encodeURIComponent(upload.tenant)}?token=${encodeURIComponent(upload.token)}`);
      if (!res.ok) continue;
      const list = await res.json();
      // The pipeline creates the project record FIRST and assembles into it
      // after -- a name match alone links the user to an empty shell. Only
      // fire once scenes exist (assembly finished).
      const hit = Array.isArray(list) && list.find((p) =>
        p.name === prompt.slice(0, 60) && (p.scene_count || 0) > 0 && p.status !== "draft" && p.status !== "failed");
      if (hit) { status("ready", null, studioUrl(upload, hit.project_id)); return; }
    } catch (e) { /* transient; keep polling */ }
  }
}

function status(state, error, projectUrl, progress, note) {
  chrome.runtime.sendMessage({ type: "qr-offscreen-status", state, error: error || null, projectUrl: projectUrl || null, progress: progress || null, note: note || null });
}
