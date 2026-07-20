// Quotient Recorder -- popup: sign in + record/stop. The ONLY setup is
// "Sign in with Google": server/tenant/token are resolved by the account
// (background.js mirrors them into the settings the pipeline reads).
const $ = (id) => document.getElementById(id);

function renderAuth(st) {
  const signedIn = !!(st && st.signedIn);
  $("auth-out").style.display = signedIn ? "none" : "block";
  $("auth-in").style.display = signedIn ? "flex" : "none";
  $("record").dataset.needsAuth = signedIn ? "" : "1";
  $("record").disabled = !signedIn;
  if (signedIn) {
    $("auth-name").textContent = st.name || "";
    $("auth-email").textContent = st.email || "";
    if (st.picture) { $("auth-pic").src = st.picture; $("auth-pic").style.display = "block"; }
    else $("auth-pic").style.display = "none";
  }
}

async function load() {
  const s = await chrome.storage.sync.get({ mic: false, camera: false });
  $("mic").checked = !!s.mic;
  $("camera").checked = !!s.camera;
  renderAuth(await chrome.runtime.sendMessage({ type: "qr-auth-status" }));
  const { recording } = await chrome.runtime.sendMessage({ type: "qr-status" }) || {};
  setRecording(!!recording);
  const { qrLastStatus } = (await chrome.storage.session?.get("qrLastStatus")) || {};
  showStatus(qrLastStatus);
}

$("signin").addEventListener("click", async () => {
  $("signin").disabled = true;
  $("status").textContent = "Opening Google sign-in…";
  const res = await chrome.runtime.sendMessage({ type: "qr-signin" });
  $("signin").disabled = false;
  if (res && res.ok) {
    $("status").textContent = "";
    renderAuth({ signedIn: true, ...res });
  } else {
    $("status").textContent = "Sign-in failed: " + ((res && res.error) || "unknown error");
  }
});

$("signout").addEventListener("click", async (e) => {
  e.preventDefault();
  await chrome.runtime.sendMessage({ type: "qr-signout" });
  renderAuth({ signedIn: false });
});

function showStatus(st) {
  if (!st) return;
  // No re-record while a take is still uploading -- the offscreen recorder
  // is busy with the blob and a second session would collide with it.
  // (needsAuth: a terminal upload state must not re-enable a signed-out popup.)
  $("record").disabled = st.state === "uploading" || $("record").dataset.needsAuth === "1";
  if (st.state === "uploading") {
    const p = st.progress;
    $("status").textContent = p && p.total
      ? `Uploading… ${p.pct}% · ${(p.done / 1048576).toFixed(0)} / ${(p.total / 1048576).toFixed(0)} MB`
      : "Uploading…";
  }
  else if (st.state === "done") $("status").textContent = "Uploaded ✓ — assembling now; the film appears in Studio in a few minutes.";
  else if (st.state === "error") $("status").textContent = "Upload failed: " + (st.error || "unknown error");
  else if (st.state === "ready" && st.projectUrl) {
    $("status").innerHTML = "";
    const a = document.createElement("a");
    a.href = st.projectUrl;
    a.target = "_blank";
    a.textContent = "✓ Your walkthrough is ready — open in Studio";
    $("status").appendChild(a);
  }
}

// Live updates while the popup stays open: the offscreen uploader broadcasts
// progress, and the terminal state also lands in storage.session (covers a
// popup opened after the fact).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "qr-offscreen-status") showStatus({ state: msg.state, error: msg.error, progress: msg.progress });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.qrLastStatus?.newValue) showStatus(changes.qrLastStatus.newValue);
});

function setRecording(on) {
  const b = $("record");
  b.classList.toggle("recording", on);
  b.textContent = on ? "■ Stop recording" : "● Record this tab";
}

async function save() {
  await chrome.storage.sync.set({ mic: $("mic").checked, camera: $("camera").checked });
}

async function ensurePermission(name, withCam) {
  // A permission prompt can't live in this popup (it steals focus, the
  // popup closes, the prompt cancels itself) -- the setup tab hosts it.
  let granted = false;
  try {
    const p = await navigator.permissions.query({ name });
    granted = p.state === "granted";
  } catch (e) { /* fall through to the setup tab */ }
  if (!granted) chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") + (withCam ? "?cam=1" : "") });
  return granted;
}

// Mode A needs mic permission for the extension origin, and a permission
// prompt can't live in this popup (the prompt steals focus, the popup
// closes, the prompt cancels itself). If not yet granted, open a dedicated
// setup tab that hosts the prompt; it flips the stored toggle on success.
$("mic").addEventListener("change", async (e) => {
  if (e.target.checked && !(await ensurePermission("microphone", false))) {
    e.target.checked = false; // mic.js sets it true once actually granted
    return;
  }
  save();
});

$("camera").addEventListener("change", async (e) => {
  if (e.target.checked && !(await ensurePermission("camera", true))) {
    e.target.checked = false; // mic.js sets it true once actually granted
    return;
  }
  save();
});

$("record").addEventListener("click", async () => {
  await save();
  const { recording } = await chrome.runtime.sendMessage({ type: "qr-status" }) || {};
  const res = await chrome.runtime.sendMessage({ type: recording ? "qr-stop" : "qr-start" });
  if (res && res.ok === false) { $("status").textContent = res.error; return; }
  setRecording(!recording);
  if (recording) {
    // Stopping -> upload begins; lock the button until a terminal status.
    $("record").disabled = true;
    $("status").textContent = "Stopped — uploading…";
  } else {
    $("status").textContent = "Recording… demo away.";
  }
});

load();
