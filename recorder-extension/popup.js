// Quotient Recorder -- popup: settings + record/stop.
const $ = (id) => document.getElementById(id);
const FIELDS = ["server", "tenant", "token", "project"];

// First-run defaults: everything but the token, so a fresh install is one
// field away from recording. (Settings persist across reinstalls anyway --
// the manifest "key" pins the extension ID that chrome.storage.sync keys on.)
const DEFAULTS = {
  server: "http://159.203.115.164:3200",
  tenant: "marc-getquotient-ai",
  token: "",
  project: "library",
};

async function load() {
  const s = await chrome.storage.sync.get({ ...DEFAULTS, mic: false });
  FIELDS.forEach((f) => { $(f).value = s[f] || DEFAULTS[f] || ""; });
  $("mic").checked = !!s.mic;
  const { recording } = await chrome.runtime.sendMessage({ type: "qr-status" }) || {};
  setRecording(!!recording);
  const { qrLastStatus } = (await chrome.storage.session?.get("qrLastStatus")) || {};
  showStatus(qrLastStatus);
}

function showStatus(st) {
  if (!st) return;
  // No re-record while a take is still uploading -- the offscreen recorder
  // is busy with the blob and a second session would collide with it.
  $("record").disabled = st.state === "uploading";
  if (st.state === "uploading") $("status").textContent = "Uploading…";
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
  if (msg?.type === "qr-offscreen-status") showStatus({ state: msg.state, error: msg.error });
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
  const s = { mic: $("mic").checked };
  FIELDS.forEach((f) => { s[f] = $(f).value.trim(); });
  await chrome.storage.sync.set(s);
}

// Mode A needs mic permission for the extension origin, and a permission
// prompt can't live in this popup (the prompt steals focus, the popup
// closes, the prompt cancels itself). If not yet granted, open a dedicated
// setup tab that hosts the prompt; it flips the stored toggle on success.
$("mic").addEventListener("change", async (e) => {
  if (e.target.checked) {
    let granted = false;
    try {
      const p = await navigator.permissions.query({ name: "microphone" });
      granted = p.state === "granted";
    } catch (err) { /* fall through to the setup tab */ }
    if (!granted) {
      e.target.checked = false; // mic.js sets it true once actually granted
      chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") });
      return;
    }
  }
  save();
});

$("record").addEventListener("click", async () => {
  await save();
  const { recording } = await chrome.runtime.sendMessage({ type: "qr-status" }) || {};
  const res = await chrome.runtime.sendMessage({ type: recording ? "qr-stop" : "qr-start" });
  if (res && res.ok === false) { $("status").textContent = res.error; return; }
  setRecording(!recording);
  $("status").textContent = recording ? "Stopped — uploading…" : "Recording… demo away.";
});

FIELDS.forEach((f) => $(f).addEventListener("change", save));
load();
