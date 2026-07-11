// ── shared/atmosphere.js ──
// The lighting language every scene template composes from: layered color
// washes, film grain, ambient parallax, a slow camera push, shimmer sweeps.
// One kit so the whole template library feels lit by the same studio.
(function () {
  function cssVar(el, name, fb) {
    try { var v = getComputedStyle(el).getPropertyValue(name).trim(); return v || fb; } catch (e) { return fb; }
  }

  // Backdrop: two enormous ultra-soft radial washes (primary + secondary)
  // over an optional near-white vertical gradient, plus animated film grain.
  // Returns the atmosphere layer (z-index 0; content should sit above).
  window.mpAtmosphere = function (host, opts) {
    opts = opts || {};
    var primary = opts.primary || cssVar(host, '--mp-color-primary', '#4f46e5');
    var secondary = opts.secondary || cssVar(host, '--mp-color-secondary', '#d48c34');
    var dark = !!opts.dark;
    var layer = document.createElement('div');
    layer.className = 'mp-atmosphere';
    layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;';
    // noBase: a webgl-backdrop (or other world layer) sits BEHIND this scene
    // component -- skip the opaque base gradient so it shows through, keep
    // the washes/grain/vignette as the lighting pass over it.
    if (!opts.noBase) {
      var base = document.createElement('div');
      base.style.cssText = 'position:absolute;inset:0;background:' + (dark
        ? 'linear-gradient(180deg,#101019 0%,#16161f 60%,#101019 100%)'
        : 'linear-gradient(180deg,#ffffff 0%,#fafaff 55%,#f4f4fb 100%)') + ';';
      layer.appendChild(base);
    }
    function wash(color, x, y, size, alpha) {
      var w = document.createElement('div');
      w.style.cssText = 'position:absolute;left:' + x + '%;top:' + y + '%;width:' + size + 'vmax;height:' + size +
        'vmax;transform:translate(-50%,-50%);border-radius:50%;filter:blur(2px);pointer-events:none;' +
        'background:radial-gradient(circle, ' + color + Math.round(alpha * 255).toString(16).padStart(2, '0') + ' 0%, transparent 62%);';
      layer.appendChild(w);
      return w;
    }
    var w1 = wash(primary, 86, 8, 78, dark ? 0.22 : 0.16);
    var w2 = wash(secondary, 6, 96, 64, dark ? 0.12 : 0.10);
    // Light scenes get a third low wash so the canvas reads LIT, not blank --
    // the dark ground gets contrast for free; the light one has to earn it.
    var w3 = dark ? null : wash(primary, 30, 55, 90, 0.06);
    // Breathing grid: fine structural lines that slowly drift and "breathe"
    // (opacity oscillation) -- motion the eye feels without reading. On by
    // default for light scenes (structure replaces the missing contrast);
    // opt in/out with opts.grid.
    var wantGrid = opts.grid !== undefined ? !!opts.grid : !dark;
    var grid = null;
    if (wantGrid) {
      var lineColor = dark ? 'rgba(244,244,248,0.05)' : 'rgba(57,59,245,0.055)';
      grid = document.createElement('div');
      grid.style.cssText = 'position:absolute;inset:-8%;pointer-events:none;' +
        'background-image:linear-gradient(' + lineColor + ' 1px, transparent 1px),' +
        'linear-gradient(90deg, ' + lineColor + ' 1px, transparent 1px);' +
        'background-size:72px 72px;' +
        'mask-image:radial-gradient(ellipse 90% 80% at 50% 45%, black 30%, transparent 78%);' +
        '-webkit-mask-image:radial-gradient(ellipse 90% 80% at 50% 45%, black 30%, transparent 78%);';
      layer.appendChild(grid);
    }
    // Film grain: SVG turbulence tile, stepped jitter = animated grain.
    var grain = document.createElement('div');
    var svg = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";
    grain.style.cssText = 'position:absolute;inset:-24px;background-image:' + svg + ';background-size:160px 160px;opacity:' + (dark ? 0.05 : 0.028) + ';mix-blend-mode:multiply;';
    layer.appendChild(grain);
    if (window.mpVignette) mpVignette(layer, dark);
    host.insertBefore(layer, host.firstChild);
    if (window.gsap) {
      gsap.to(grain, { x: 12, y: -8, duration: 0.22, repeat: -1, yoyo: true, ease: 'steps(2)' });
      gsap.to(w1, { xPercent: -6, yPercent: 8, duration: opts.driftSeconds || 14, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(w2, { xPercent: 8, yPercent: -6, duration: (opts.driftSeconds || 14) * 1.3, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      if (w3) gsap.to(w3, { xPercent: 5, yPercent: -7, duration: (opts.driftSeconds || 14) * 1.7, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      if (grid) {
        gsap.to(grid, { x: 26, y: 18, duration: (opts.driftSeconds || 14) * 1.5, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        gsap.fromTo(grid, { opacity: 0.55 }, { opacity: 1, duration: 3.6, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      }
    }
    return layer;
  };

  // Slow camera push over the whole scene: content root scales 1 -> ~1.035.
  // Add it to the SCENE timeline so it seeks correctly during render.
  window.mpCameraPush = function (tl, rootEl, duration, amount) {
    if (!tl || !rootEl) return;
    tl.fromTo(rootEl, { scale: 1 }, {
      scale: amount || 1.035, duration: Math.max(2, duration || 8),
      ease: 'none', transformOrigin: '50% 42%',
    }, 0);
  };

  // One shimmer sweep across an element (headline, numeral, logo).
  window.mpShimmer = function (tl, el, at) {
    if (!tl || !el) return;
    var sweep = document.createElement('div');
    sweep.style.cssText = 'position:absolute;top:-10%;bottom:-10%;width:34%;left:-40%;pointer-events:none;' +
      'background:linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%);' +
      'mix-blend-mode:overlay;filter:blur(2px);';
    var cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden';
    el.appendChild(sweep);
    tl.to(sweep, { left: '120%', duration: 0.9, ease: 'power2.inOut' }, at || 2);
  };

  // Colored soft shadow (light direction consistent with the washes).
  window.mpLiftShadow = function (el, color) {
    if (!el) return;
    el.style.boxShadow = '0 2px 6px ' + (color || 'rgba(57,59,245,0.10)') + ', 0 14px 34px ' + (color || 'rgba(57,59,245,0.13)') +
      ', inset 0 1px 0 rgba(255,255,255,0.85)';
  };

  // Cinematic vignette: darkened corners; stronger on dark scenes.
  window.mpVignette = function (layer, dark) {
    var v = document.createElement('div');
    v.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
      'background:radial-gradient(ellipse 120% 90% at 50% 42%, transparent 58%, rgba(10,10,22,' + (dark ? 0.42 : 0.07) + ') 100%);';
    layer.appendChild(v);
    return v;
  };

  // Bloom: the element emits light in the brand hue (Linear-style glow).
  window.mpGlow = function (el, color, intensity) {
    if (!el) return;
    var c = color || 'rgba(79,70,229,';
    if (c.indexOf('rgba') !== 0) { // hex -> rgba prefix
      var h = c.replace('#', '');
      var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
      c = 'rgba(' + r + ',' + g + ',' + b + ',';
    }
    var i = intensity || 1;
    el.style.filter = (el.style.filter ? el.style.filter + ' ' : '') +
      'drop-shadow(0 0 ' + Math.round(18 * i) + 'px ' + c + (0.35 * i) + ')) drop-shadow(0 0 ' + Math.round(60 * i) + 'px ' + c + (0.18 * i) + '))';
  };

  // Dark-ground logo adaptation. Most brand kits only ship a light-theme
  // wordmark (dark text) -- on a dark scene it disappears. Measure the
  // logo's opaque-pixel luminance once it loads; when it reads dark, flip
  // lightness while keeping hue (invert + hue-rotate) on a WRAPPER span so
  // GSAP filter tweens on the img itself stay untouched. Optional glowColor
  // adds mpGlow to whichever element ends up outermost (wrapper drop-shadow
  // runs after the invert, so the glow keeps its brand color).
  window.mpLogoOnDark = function (img, glowColor) {
    if (!img) return;
    function apply() {
      var target = img;
      try {
        var w = Math.max(1, Math.min(220, img.naturalWidth || 0));
        if (w > 1 || img.naturalWidth === 1) {
          var h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          var g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
          var d = g.getImageData(0, 0, w, h).data, sum = 0, n = 0;
          for (var i = 0; i < d.length; i += 4) {
            if (d[i + 3] > 40) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
          }
          if (n && sum / n < 110 && img.parentElement) {
            var wrap = document.createElement('span');
            wrap.style.cssText = 'display:inline-block;line-height:0;filter:invert(1) hue-rotate(180deg);';
            img.parentElement.insertBefore(wrap, img);
            wrap.appendChild(img);
            target = wrap;
          }
        }
      } catch (e) { /* tainted canvas etc. -- leave the logo alone */ }
      if (window.mpGlow && glowColor) mpGlow(target, glowColor, 0.8);
    }
    if (img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, { once: true });
  };

  // Gradient hairline border (the Framer/Linear card signature): wraps the
  // element in a 1px gradient shell; the element keeps its own background.
  window.mpGradientBorder = function (el, from, to) {
    if (!el || !el.parentElement) return;
    var shell = document.createElement('div');
    var cs = getComputedStyle(el);
    shell.style.cssText = 'padding:1px;border-radius:' + (parseFloat(cs.borderRadius) + 1 || 4) + 'px;' +
      'background:linear-gradient(135deg, ' + (from || 'rgba(255,255,255,0.5)') + ', ' + (to || 'rgba(79,70,229,0.35)') + ');' +
      'display:' + (cs.display === 'inline' ? 'inline-block' : cs.display) + ';';
    el.parentElement.insertBefore(shell, el);
    shell.appendChild(el);
    el.style.border = 'none';
    return shell;
  };

  // Speed-contrast physics. The expensive feel = fast snaps against slow
  // drifts. mpSnapIn: fast arrival (blur smear) with a tiny overshoot settle.
  // mpSnapOut: fast lift-away. Compose against the atmosphere's slow drifts.
  window.mpSnapIn = function (tl, el, at, opts) {
    if (!tl || !el) return;
    opts = opts || {};
    var dur = opts.duration || 0.32;
    gsap.set(el, { autoAlpha: 0, y: opts.y !== undefined ? opts.y : 42, scale: 0.985, filter: 'blur(10px)' });
    tl.to(el, { autoAlpha: 1, y: -5, scale: 1.004, filter: 'blur(0px)', duration: dur, ease: 'power3.out' }, at || 0)
      .to(el, { y: 0, scale: 1, duration: 0.22, ease: 'power2.inOut' }, (at || 0) + dur);
  };
  window.mpSnapOut = function (tl, el, at, opts) {
    if (!tl || !el) return;
    opts = opts || {};
    tl.to(el, { autoAlpha: 0, y: opts.y !== undefined ? opts.y : -56, filter: 'blur(9px)', duration: opts.duration || 0.38, ease: 'power2.in' }, at || 0);
  };

  // Masked word reveal: split an element's text into per-word spans and
  // slide them up out of an overflow mask -- the kinetic type-on feel.
  // Compose into the scene timeline: mpWordReveal(tl, el, at).
  window.mpWordReveal = function (tl, el, at, opts) {
    if (!tl || !el) return [];
    opts = opts || {};
    var words = String(el.textContent || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    el.textContent = '';
    var spans = words.map(function (w, i) {
      var mask = document.createElement('span');
      mask.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:bottom;';
      var inner = document.createElement('span');
      inner.style.cssText = 'display:inline-block;will-change:transform;';
      inner.textContent = w + (i < words.length - 1 ? ' ' : '');
      mask.appendChild(inner);
      el.appendChild(mask);
      return inner;
    });
    // 118, not 110: ascenders/descenders overshoot the em box and peek
    // through the overflow mask before the reveal.
    gsap.set(spans, { yPercent: 118 });
    tl.to(spans, {
      yPercent: 0, duration: opts.duration || 0.55,
      ease: opts.ease || 'power3.out', stagger: opts.stagger || 0.05,
    }, at || 0);
    return spans;
  };

  // Blur-to-sharp entrance values (compose into template tweens):
  //   gsap.set(el, mpBlurFrom());  tl.to(el, mpBlurTo(dur), at)
  window.mpBlurFrom = function (px) { return { autoAlpha: 0, filter: 'blur(' + (px || 10) + 'px)' }; };
  window.mpBlurTo = function (duration) { return { autoAlpha: 1, filter: 'blur(0px)', duration: duration || 0.9, ease: 'power3.out' }; };

  // Beat phases: map ctx.beats to [{start,end}] windows; when a scene has no
  // beats, split the duration into `fallbackCount` equal phases. Templates
  // choreograph AGAINST these so a long scene evolves instead of freezing.
  window.mpBeatPhases = function (ctx, fallbackCount) {
    var beats = (ctx && ctx.beats) || [];
    if (beats.length >= 2) return beats.map(function (b) { return { start: b.start, end: b.end, label: b.label }; });
    var n = Math.max(2, fallbackCount || 3);
    var d = (ctx && ctx.duration) || 10;
    var out = [];
    for (var i = 0; i < n; i++) out.push({ start: (d * i) / n, end: (d * (i + 1)) / n });
    return out;
  };
})();
