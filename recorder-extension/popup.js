// Quotient Recorder -- popup: settings + record/stop.
const $ = (id) => document.getElementById(id);
const FIELDS = ["server", "tenant", "token", "project"];

async function load() {
  const s = await chrome.storage.sync.get({ server: "", tenant: "", token: "", project: "library" });
  FIELDS.forEach((f) => { $(f).value = s[f] || ""; });
  const { recording } = await chrome.runtime.sendMessage({ type: "qr-status" }) || {};
  setRecording(!!recording);
  const { qrLastStatus } = (await chrome.storage.session?.get("qrLastStatus")) || {};
  if (qrLastStatus?.state === "error") $("status").textContent = "Last upload failed: " + qrLastStatus.error;
  else if (qrLastStatus?.state === "done") $("status").textContent = "Last recording uploaded — assembling in Studio.";
}

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
