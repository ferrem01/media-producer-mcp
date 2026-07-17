// Quotient Recorder -- popup: settings + record/stop.
const $ = (id) => document.getElementById(id);
const FIELDS = ["server", "tenant", "token", "project"];

async function load() {
  const s = await chrome.storage.sync.get({ server: "", tenant: "", token: "", project: "library" });
  FIELDS.forEach((f) => { $(f).value = s[f] || ""; });
  const { recording } = await chrome.runtime.sendMessage({ type: "qr-status" }) || {};
  setRecording(!!recording);
  const { qrLastStatus } = (await chrome.storage.session?.get("qrLastStatus")) || {};
  showStatus(qrLastStatus);
}

function showStatus(st) {
  if (!st) return;
  if (st.state === "uploading") $("status").textContent = "Uploading…";
  else if (st.state === "done") $("status").textContent = "Uploaded ✓ — assembling now; the film appears in Studio in a few minutes.";
  else if (st.state === "error") $("status").textContent = "Upload failed: " + (st.error || "unknown error");
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
  const s = {};
  FIELDS.forEach((f) => { s[f] = $(f).value.trim(); });
  await chrome.storage.sync.set(s);
}

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
