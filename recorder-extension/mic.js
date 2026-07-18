// Mic-permission host page. The popup can't hold a permission prompt (the
// prompt steals focus -> popup closes -> prompt cancelled), so the popup
// opens THIS tab instead. Granting here is remembered for the extension
// origin, which is exactly what the offscreen recorder needs.
const status = document.getElementById("status");

document.getElementById("enable").addEventListener("click", async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    await chrome.storage.sync.set({ mic: true });
    status.className = "ok";
    status.textContent = "✓ Microphone enabled — live narration is on. You can close this tab.";
    setTimeout(() => window.close(), 2500);
  } catch (e) {
    status.className = "err";
    status.textContent = "Not granted: " + (e && e.message || e) + ". Click again and choose Allow, or check the mic icon in the address bar.";
  }
});
