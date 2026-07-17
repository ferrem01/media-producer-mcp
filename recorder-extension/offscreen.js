// Quotient Recorder -- offscreen document: MediaRecorder + uploader.
// MV3 service workers can't run MediaRecorder, so this document records the
// tab stream and, on stop, uploads straight from here (video -> events
// sidecar -> trigger generate) to avoid shuttling a large blob through
// extension messaging.

let recorder = null;
let chunks = [];
let trackDims = { width: 0, height: 0 };

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "qr-offscreen-start") start(msg.streamId);
  else if (msg.type === "qr-offscreen-stop") stop(msg.upload);
});

async function start(streamId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false, // foundation records video-only; Mode A adds mic later
      video: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
      },
    });
    const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
    trackDims = { width: settings.width || 0, height: settings.height || 0 };
    chunks = [];
    recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.start(1000);
  } catch (e) {
    status("error", "capture failed: " + (e && e.message || e));
  }
}

async function stop(upload) {
  try {
    if (!recorder) { status("error", "not recording"); return; }
    const rec = recorder;
    recorder = null;
    await new Promise((resolve) => {
      rec.onstop = resolve;
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    });
    const blob = new Blob(chunks, { type: "video/webm" });
    chunks = [];
    if (!blob.size) { status("error", "empty recording"); return; }

    status("uploading");
    const base = upload.server;
    const q = (extra) => `token=${encodeURIComponent(upload.token)}${extra || ""}`;

    // 1. Video (raw body, existing endpoint).
    const upRes = await fetch(
      `${base}/api/upload-asset/${encodeURIComponent(upload.tenant)}/${encodeURIComponent(upload.project)}?${q(`&name=${encodeURIComponent(upload.name)}`)}`,
      { method: "POST", body: blob },
    );
    const upJson = await upRes.json();
    if (!upRes.ok || !upJson.ok) throw new Error(upJson.error || `upload HTTP ${upRes.status}`);
    const finalName = upJson.url.split("/").pop();

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

    // 3. Fire generate.
    const genRes = await fetch(
      `${base}/api/recorder-generate/${encodeURIComponent(upload.tenant)}?${q()}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: upJson.url,
          prompt: `Recorded walkthrough ${new Date().toLocaleString()}`,
        }),
      },
    );
    const genJson = await genRes.json();
    if (!genRes.ok || !genJson.ok) throw new Error(genJson.error || `generate HTTP ${genRes.status}`);

    status("done");
  } catch (e) {
    status("error", String(e && e.message || e));
  }
}

function status(state, error) {
  chrome.runtime.sendMessage({ type: "qr-offscreen-status", state, error: error || null });
}
