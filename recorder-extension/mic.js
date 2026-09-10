// Media-permission host page. The popup can't hold a permission prompt (the
// prompt steals focus -> popup closes -> prompt cancelled), so the popup
// opens THIS tab instead. Granting here is remembered for the extension
// origin, which is exactly what the offscreen recorder needs.
// ?cam=1 -> request camera + mic (camera-bubble mode); else mic only.
//
// It also does the thing that would have saved two whole takes: after the
// grant it shows the DEVICE LIST and a LIVE LEVEL METER, using the same
// constraints the recorder itself uses. A microphone that hands Chrome
// digital silence looks identical to a working one everywhere else in the
// UI -- the only way to know is to watch a meter move before you record.
const status = document.getElementById("status");
const wantCam = new URLSearchParams(location.search).get("cam") === "1";
if (wantCam) {
  document.querySelector("h1").innerHTML = "&#128247; Enable camera + microphone";
  document.querySelector("p").textContent =
    "The camera bubble records your face and voice alongside the demo. Chrome needs you to allow both for this extension once — click below and choose Allow.";
}

// Mirror of the recorder's capture constraints. Echo cancellation is OFF here
// for the same reason it is off there: on a combined input/output device (a
// monitor that is both speakers and mic) the canceller can subtract the input
// against itself and emit exactly zero. Testing with different constraints
// than the recorder uses would make this meter a liar.
function audioConstraints(deviceId) {
  return {
    echoCancellation: false,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  };
}

let monitorStream = null;
let audioCtx = null;
let rafId = 0;

async function listDevices(selectId) {
  const sel = document.getElementById("dev");
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === "audioinput");
  sel.innerHTML = "";
  mics.forEach((d, i) => {
    const o = document.createElement("option");
    o.value = d.deviceId;
    o.textContent = d.label || ("Microphone " + (i + 1));
    sel.appendChild(o);
  });
  if (selectId && mics.some((m) => m.deviceId === selectId)) sel.value = selectId;
  return sel.value;
}

function stopMonitor() {
  if (rafId) cancelAnimationFrame(rafId), (rafId = 0);
  if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
  if (monitorStream) { monitorStream.getTracks().forEach((t) => t.stop()); monitorStream = null; }
}

async function monitor(deviceId) {
  stopMonitor();
  const bar = document.getElementById("bar");
  const verdict = document.getElementById("verdict");
  bar.style.width = "0%";
  verdict.className = "verdict";
  verdict.textContent = "Say something — the bar should move.";
  try {
    monitorStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
  } catch (e) {
    verdict.className = "verdict dead";
    verdict.textContent = "Couldn't open that microphone: " + (e && e.message || e);
    return;
  }
  // Remember the choice: the offscreen recorder pins this exact device, so a
  // docking event that reshuffles Chrome's default input can't silently move
  // the recording to another mic.
  const track = monitorStream.getAudioTracks()[0];
  const settings = (track && track.getSettings && track.getSettings()) || {};
  chrome.storage.sync.set({ micDeviceId: deviceId || settings.deviceId || "", micLabel: (track && track.label) || "" });

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const src = audioCtx.createMediaStreamSource(monitorStream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  src.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let sawSignal = false;
  let quietFrames = 0;
  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    // -60dB floor -> 0%, 0dB -> 100%, so speech sits in the middle of the bar.
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
    bar.style.width = pct.toFixed(1) + "%";
    if (db > -45) {
      sawSignal = true;
      verdict.className = "verdict live";
      verdict.textContent = "✓ Hearing you — this microphone is live.";
    } else if (!sawSignal) {
      quietFrames++;
      // ~5s of nothing at all is the signature of a device that will record
      // digital silence, not of someone who simply hasn't spoken yet.
      if (quietFrames > 300) {
        verdict.className = "verdict dead";
        verdict.textContent = "No signal from this microphone — try another one.";
      }
    }
    rafId = requestAnimationFrame(tick);
  };
  tick();
}

document.getElementById("enable").addEventListener("click", async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints(""), ...(wantCam ? { video: true } : {}),
    });
    // Labels are only populated once a grant exists, so enumerate AFTER.
    s.getTracks().forEach((t) => t.stop());
    await chrome.storage.sync.set(wantCam ? { camera: true, mic: true } : { mic: true });
    status.className = "ok";
    status.textContent = wantCam
      ? "✓ Camera + mic enabled — the camera bubble is on."
      : "✓ Microphone enabled — live narration is on.";
    document.getElementById("check").style.display = "block";
    const saved = (await chrome.storage.sync.get({ micDeviceId: "" })).micDeviceId;
    const chosen = await listDevices(saved);
    await monitor(chosen);
  } catch (e) {
    status.className = "err";
    status.textContent = "Not granted: " + (e && e.message || e) + ". Click again and choose Allow, or check the camera/mic icon in the address bar.";
  }
});

// Already granted? Then this page is not a permission prompt, it is the mic
// CHECK -- open it ready to use instead of behind a button that re-asks for
// something the browser has already said yes to.
(async () => {
  try {
    const p = await navigator.permissions.query({ name: "microphone" });
    if (p.state !== "granted") return;
    status.className = "ok";
    status.textContent = "✓ Microphone already enabled — check the level below before you record.";
    document.getElementById("enable").textContent = "Re-check permission";
    document.getElementById("check").style.display = "block";
    const saved = (await chrome.storage.sync.get({ micDeviceId: "" })).micDeviceId;
    const chosen = await listDevices(saved);
    await monitor(chosen);
  } catch (e) { /* no permissions API -> the button path still works */ }
})();

document.getElementById("dev").addEventListener("change", (e) => monitor(e.target.value));
navigator.mediaDevices.addEventListener("devicechange", async () => {
  if (document.getElementById("check").style.display !== "block") return;
  const cur = document.getElementById("dev").value;
  const next = await listDevices(cur);
  if (next !== cur) monitor(next);
});
window.addEventListener("pagehide", stopMonitor);
