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
    var base = document.createElement('div');
    base.style.cssText = 'position:absolute;inset:0;background:' + (dark
      ? 'linear-gradient(180deg,#101019 0%,#16161f 60%,#101019 100%)'
      : 'linear-gradient(180deg,#ffffff 0%,#fafaff 55%,#f4f4fb 100%)') + ';';
    layer.appendChild(base);
    function wash(color, x, y, size, alpha) {
      var w = document.createElement('div');
      w.style.cssText = 'position:absolute;left:' + x + '%;top:' + y + '%;width:' + size + 'vmax;height:' + size +
        'vmax;transform:translate(-50%,-50%);border-radius:50%;filter:blur(2px);pointer-events:none;' +
        'background:radial-gradient(circle, ' + color + Math.round(alpha * 255).toString(16).padStart(2, '0') + ' 0%, transparent 62%);';
      layer.appendChild(w);
      return w;
    }
    var w1 = wash(primary, 86, 8, 78, dark ? 0.22 : 0.10);
    var w2 = wash(secondary, 6, 96, 64, dark ? 0.12 : 0.07);
    // Film grain: SVG turbulence tile, stepped jitter = animated grain.
    var grain = document.createElement('div');
    var svg = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";
    grain.style.cssText = 'position:absolute;inset:-24px;background-image:' + svg + ';background-size:160px 160px;opacity:' + (dark ? 0.05 : 0.028) + ';mix-blend-mode:multiply;';
    layer.appendChild(grain);
    host.insertBefore(layer, host.firstChild);
    if (window.gsap) {
      gsap.to(grain, { x: 12, y: -8, duration: 0.22, repeat: -1, yoyo: true, ease: 'steps(2)' });
      gsap.to(w1, { xPercent: -6, yPercent: 8, duration: opts.driftSeconds || 14, repeat: -1, yoyo: true, ease: 'sine.inOut' });
      gsap.to(w2, { xPercent: 8, yPercent: -6, duration: (opts.driftSeconds || 14) * 1.3, repeat: -1, yoyo: true, ease: 'sine.inOut' });
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
