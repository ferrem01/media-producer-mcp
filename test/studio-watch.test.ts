import { describe, it, expect } from "vitest";
import { getPreviewHtml } from "../src/preview-app/preview-app.js";
import { getPhoneStudioHtml } from "../src/studio-phone.js";

// WATCH MODE: the phone Studio's Preview plays a built film live, without a
// render -- the desktop Studio's own player (so it matches the render),
// full screen, nothing to edit.

describe("Preview: watch a built film on the phone", () => {
  it("the phone film card offers Preview beside Render once scenes are built, opening the Studio in watch mode", () => {
    const html = getPhoneStudioHtml();
    expect(html).toContain("prev.textContent = 'Preview'");
    expect(html).toContain("prev.href = link('/studio', '&desktop=1&view=watch')");
    expect(html).toContain("Preview plays them now; render for an MP4 to share.");
  });

  it("?view=watch: the player alone, tap to play, a scrubber with a fill, Back to the phone Studio", () => {
    const html = getPreviewHtml();
    expect(html).toContain("var WATCH = new URLSearchParams(window.location.search).get('view') === 'watch';");
    expect(html).toContain("document.body.classList.add('watch-mode')");
    expect(html).toContain("body.watch-mode #sidebar, body.watch-mode #inspector");
    expect(html).toContain("tap.id = 'watch-tap'");
    expect(html).toContain("sl.style.setProperty('--p'");
    expect(html).toContain("if (WATCH) return; // watch mode's Back goes to the phone Studio");
    expect(html).toContain("Tap to watch");
    // On a phone the editor's zoomed track ran the bar off the screen; watch mode pins it to the width.
    expect(html).toContain("track.style.width = WATCH ? '100%' : (state.tlZoom * 100) + '%';");
    // Nothing is edited here: no hover or selection boxes drawn on the film.
    expect(html).toContain("if (WATCH) return;\n");
    // Loading on a phone: the opening take attached and buffered before play (a % on the overlay,
    // a minute's patience, a failed file not waited on), and a starved take HOLDS the film with a
    // spinner instead of the clock running on past a frozen picture.
    expect(html).toContain("var timeout = WATCH ? 60000 : 8000;");
    expect(html).toContain("var w0 = speakerClipForTime(0); if (w0 && w0.url) sp.src = w0.url;");
    expect(html).toContain("watchBufferText('Loading ' + p + '%')");
    expect(html).toContain("v.addEventListener('error', onReady, { once: true });");
    expect(html).toContain("if (WATCH) SPEAKER_STALL_HOLD_MS = 120000;");
    // "Tap to watch" plays: the players are woken inside the tap, playback starts once loaded.
    expect(html).toContain("if (WATCH) { state.watchAutoplay = true; watchPrimeMedia(); }");
    expect(html).toContain("if (!state.playing && !els.playBtn.disabled) els.playBtn.click();");
    expect(html).toContain("if (WATCH) watchBuffering(!!state._spkStallT0 && now - state._spkStallT0 > 300);");
  });
});
