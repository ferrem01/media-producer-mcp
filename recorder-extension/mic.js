// Media-permission host page. The popup can't hold a permission prompt (the
// prompt steals focus -> popup closes -> prompt cancelled), so the popup
// opens THIS tab instead. Granting here is remembered for the extension
// origin, which is exactly what the offscreen recorder needs.
// ?cam=1 -> request camera + mic (camera-bubble mode); else mic only.
const status = document.getElementById("status");
const wantCam = new URLSearchParams(location.search).get("cam") === "1";
if (wantCam) {
  document.querySelector("h1").innerHTML = "&#128247; Enable camera + microphone";
  document.querySelector("p").textContent =
    "The camera bubble records your face and voice alongside the demo. Chrome needs you to allow both for this extension once — click below and choose Allow.";
}

document.getElementById("enable").addEventListener("click", async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, ...(wantCam ? { video: true } : {}) });
    s.getTracks().forEach((t) => t.stop());
    await chrome.storage.sync.set(wantCam ? { camera: true, mic: true } : { mic: true });
    status.className = "ok";
    status.textContent = wantCam
      ? "✓ Camera + mic enabled — the camera bubble is on. You can close this tab."
      : "✓ Microphone enabled — live narration is on. You can close this tab.";
    setTimeout(() => window.close(), 2500);
  } catch (e) {
    status.className = "err";
    status.textContent = "Not granted: " + (e && e.message || e) + ". Click again and choose Allow, or check the camera/mic icon in the address bar.";
  }
});
