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

let capturedAudioDevice = null; // which mic this take actually used
// Live input level, sampled off the REAL capture stream and relayed to the
// recording HUD. The HUD runs in the recorded tab's content script, which has
// no access to this stream (and must never open its own -- that would prompt
// for microphone access on every site you record). So the level is measured
// where the audio actually is and pushed out.
let levelCtx = null, levelAnalyser = null, levelBuf = null, levelTimer = null;
function startLevelMeter(stream) {
  stopLevelMeter();
  try {
    levelCtx = new (self.AudioContext || self.webkitAudioContext)();
    levelAnalyser = levelCtx.createAnalyser();
    levelAnalyser.fftSize = 1024;
    levelCtx.createMediaStreamSource(stream).connect(levelAnalyser);
    levelBuf = new Float32Array(levelAnalyser.fftSize);
    // ~8/sec: fast enough to read as live, slow enough not to hammer the
    // service worker that relays it.
    levelTimer = setInterval(() => {
      try {
        levelAnalyser.getFloatTimeDomainData(levelBuf);
        let sum = 0;
        for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
        const rms = Math.sqrt(sum / levelBuf.length);
        const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
        // -60dB floor -> 0, 0dB -> 1, so speech sits mid-scale.
        const level = Math.max(0, Math.min(1, (db + 60) / 60));
        chrome.runtime.sendMessage({ type: "qr-level", level });
      } catch (e) {}
    }, 120);
  } catch (e) { /* metering is a nicety, never a blocker */ }
}
function stopLevelMeter() {
  if (levelTimer) { clearInterval(levelTimer); levelTimer = null; }
  if (levelCtx) { try { levelCtx.close(); } catch (e) {} levelCtx = null; }
  levelAnalyser = null; levelBuf = null;
}
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
  if (msg.type === "qr-offscreen-prep") prep(msg.streamId, msg.mic, msg.camera, msg.dims, msg.micDeviceId);
  else if (msg.type === "qr-offscreen-begin") { begin(); startTick(); }
  else if (msg.type === "qr-offscreen-pause") { stopTick(); try { recorder?.pause(); camRecorder?.pause(); } catch (e) {} }
  else if (msg.type === "qr-offscreen-resume") { startTick(); try { recorder?.resume(); camRecorder?.resume(); } catch (e) {} }
  else if (msg.type === "qr-offscreen-abort") { stopTick(); stopLevelMeter(); abort(); }
  else if (msg.type === "qr-offscreen-stop") { stopTick(); stopLevelMeter(); stop(msg.upload); }
});

async function prep(streamId, mic, camera, dims, micDeviceId) {
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
      // ECHO CANCELLATION IS OFF, DELIBERATELY. AEC subtracts what is
      // PLAYING OUT from what is coming IN -- it exists for calls, where the
      // far end would otherwise hear itself. A screen recording has no far
      // end, so there is nothing legitimate for it to remove.
      //
      // It is not merely useless here, it is destructive: when the capture
      // device and the render device are the same hardware -- any combined
      // USB audio endpoint, e.g. a monitor that is both speakers and mic --
      // the canceller can subtract the input against itself and emit exactly
      // zero. Measured live on an LG UltraFine Display Audio: two full takes
      // recorded a valid 48kHz mono Opus track, correct duration, with EVERY
      // SAMPLE 0.0 (mean -91dB, zero-crossing rate 0.000000) while the camera
      // video from the SAME getUserMedia call was perfect and the very same
      // mic transcribed fine elsewhere in Chrome. Silence like that is what a
      // canceller outputs; a dead mic still gives you a noise floor.
      //
      // Noise suppression and auto-gain stay on: they only shape the signal.
      // The chosen device arrives in the PREP MESSAGE. It is deliberately not
      // read from chrome.storage here: an offscreen document has a restricted
      // API surface, and an unproven API call inside this try{} takes the
      // whole media prep down with it -- no camera, no mic, just an error
      // badge. Which is exactly what shipping that read did. The background
      // worker already owns settings; it passes this in like mic and camera.
      // Camera-without-voice used to be impossible: the camera branch took the
      // whole stream, audio included, so a user who unticked the mic still got
      // recorded. Now the switch governs the microphone in BOTH directions.
      const videoWanted = camera
        ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } }
        : {};
      if (!mic) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: false, ...videoWanted });
        camStream = micStream;
        camRecorder = new MediaRecorder(camStream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 2_500_000 });
        camChunks = [];
        camRecorder.ondataavailable = (e) => { if (e.data && e.data.size) camChunks.push(e.data); };
        const st0 = tab.getVideoTracks()[0]?.getSettings?.() || {};
        trackDims = { width: st0.width || 0, height: st0.height || 0 };
        chunks = [];
        recorder = new MediaRecorder(new MediaStream(tabTracks), { mimeType, videoBitsPerSecond: 8_000_000 });
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        return;
      }
      const audioBase = { echoCancellation: false, noiseSuppression: true, autoGainControl: true };
      try {
        // Pin the chosen device so a docking event that reshuffles Chrome's
        // default input cannot silently move the recording to another mic.
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { ...audioBase, deviceId: { exact: micDeviceId } } : audioBase,
          ...videoWanted,
        });
      } catch (pinErr) {
        // A pinned device that is currently absent (undocked, unplugged)
        // raises OverconstrainedError. Losing the preferred microphone must
        // degrade to the default one, never cost the user the take.
        if (!micDeviceId) throw pinErr;
        try { console.warn("[qr] pinned mic unavailable, falling back to default:", pinErr && pinErr.name); } catch (e) {}
        micStream = await navigator.mediaDevices.getUserMedia({ audio: audioBase, ...videoWanted });
      }
      const micTrack = micStream.getAudioTracks()[0];
      if (micTrack) {
        // Record WHICH microphone this take came from. Without it, a silent
        // file is undiagnosable after the fact -- webm carries no device
        // metadata, so the only evidence is the samples themselves.
        const st = (micTrack.getSettings && micTrack.getSettings()) || {};
        capturedAudioDevice = { label: micTrack.label || "", deviceId: st.deviceId || "",
          sampleRate: st.sampleRate || 0, channels: st.channelCount || 0,
          echoCancellation: st.echoCancellation, noiseSuppression: st.noiseSuppression,
          autoGainControl: st.autoGainControl };
        try { console.log("[qr] capturing audio from:", capturedAudioDevice.label || "(unlabelled)", capturedAudioDevice); } catch (e) {}
        startLevelMeter(micStream);
      }
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
