// Quotient Recorder -- Mode A teleprompter. Lives in its OWN window because
// tab capture films the tab: anything injected into the page would be in the
// recording. Plain auto-scroll at an adjustable pace; the script persists in
// storage.sync so it survives across recordings and machines.
const $ = (id) => document.getElementById(id);
let scrolling = false;
let pxPerSec = 30;
let raf = null;
let last = 0;

async function load() {
  const { script } = await chrome.storage.sync.get({ script: "" });
  $("edit").value = script || "";
}

let saveT = null;
$("edit").addEventListener("input", () => {
  clearTimeout(saveT);
  saveT = setTimeout(() => chrome.storage.sync.set({ script: $("edit").value }), 500);
});

function setScrolling(on) {
  scrolling = on;
  $("toggle").textContent = on ? "❚❚ Pause" : "▶ Scroll";
  const editing = $("view").style.display === "none";
  if (on && editing) {
    $("view").textContent = $("edit").value;
    $("edit").style.display = "none";
    $("view").style.display = "block";
  }
  if (on) { last = performance.now(); tick(); }
  else if (raf) { cancelAnimationFrame(raf); raf = null; }
}

function tick() {
  if (!scrolling) return;
  const now = performance.now();
  $("view").scrollTop += (pxPerSec * (now - last)) / 1000;
  last = now;
  raf = requestAnimationFrame(tick);
}

$("toggle").addEventListener("click", () => setScrolling(!scrolling));
$("view").addEventListener("click", () => setScrolling(false));
$("slower").addEventListener("click", () => { pxPerSec = Math.max(8, pxPerSec - 6); $("speed").textContent = pxPerSec + " px/s"; });
$("faster").addEventListener("click", () => { pxPerSec = Math.min(120, pxPerSec + 6); $("speed").textContent = pxPerSec + " px/s"; });
$("reset").addEventListener("click", () => {
  setScrolling(false);
  $("view").scrollTop = 0;
  $("view").style.display = "none";
  $("edit").style.display = "block";
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("reset").click(); });

load();
