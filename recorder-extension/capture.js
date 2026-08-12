// Quotient Recorder -- component camera (SPEC-web-capture.md).
// Injected on demand: an element picker (DevTools-inspect style) that
// serializes the chosen subtree ENTIRELY IN-PAGE -- computed styles inlined,
// images baked to data URIs -- and shows a LOCAL verdict panel (replica vs
// screenshot). Nothing leaves the browser until "Create component".
(() => {
  if (window.__qcCaptureActive) return;
  window.__qcCaptureActive = true;

  const DPR = window.devicePixelRatio || 1;

  // Visual properties worth carrying; everything else falls back to the
  // replica's own cascade defaults. Diffed per-tag against a clean probe so
  // the serialized style attributes stay sane.
  const STYLE_PROPS = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "flex", "flex-direction",
    "flex-wrap", "flex-grow", "flex-shrink", "flex-basis", "align-items", "align-self", "align-content",
    "justify-content", "gap", "row-gap", "column-gap",
    // NOTE: grid-template-*/grid-column/grid-row are deliberately ABSENT.
    // Computed grid values are not round-trippable: the used template
    // includes implicit tracks, and re-applied line numbers (LinkedIn places
    // with grid-column:-1) change meaning against the frozen template --
    // items get shoved into phantom columns and clipped. Grids are frozen
    // geometrically instead (container -> block, items -> absolute).
    "order", "float", "clear", "overflow", "overflow-x", "overflow-y",
    "width", "height", "min-width", "min-height", "max-width", "max-height", "box-sizing",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
    "background-color", "background-image", "background-size", "background-position", "background-repeat",
    "color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
    "text-align", "text-decoration-line", "text-decoration-color", "text-transform", "white-space",
    "text-overflow", "vertical-align", "word-break", "opacity", "box-shadow", "text-shadow",
    // ALL the ways an element can be scaled/moved: the transform property,
    // the standalone scale/translate/rotate properties, and CSS zoom (how
    // app preview panes often shrink a desktop layout). Missing any of
    // them leaves the replica laid out full-size with the shrink lost.
    "transform", "scale", "translate", "rotate", "zoom",
    // SVG paints its color through CSS too (X's verified badge is an svg
    // whose blue is a class-applied fill) -- classes are stripped at
    // capture, so the paint must ride inline or the icon goes BLACK.
    "fill", "stroke", "stroke-width",
    "filter", "backdrop-filter", "object-fit", "object-position", "cursor",
    "visibility", "outline-width", "outline-style", "outline-color", "list-style-type",
  ];

  // INHERITED properties resolve from the PARENT, not from UA defaults --
  // so "skip when equal to the probe default" is WRONG for them: LinkedIn
  // names computed at exactly 16px (the UA default) were skipped, then
  // inherited the container's baked 9px base and rendered tiny. Inherited
  // props diff against the parent's computed value instead (the parent
  // carries its own baked value in the replica); the capture root always
  // bakes them, sealing the component from ambient styles.
  const INHERITED_PROPS = new Set([
    "color", "font-family", "font-size", "font-weight", "font-style", "line-height",
    "letter-spacing", "text-align", "text-transform", "white-space", "word-break",
    "visibility", "cursor", "list-style-type", "text-shadow",
  ]);

  // ── Per-tag default probe (hidden iframe with a virgin document) ──
  let probeDoc = null;
  const probeCache = new Map();
  function probeDefaults(tag) {
    if (probeCache.has(tag)) return probeCache.get(tag);
    if (!probeDoc) {
      const f = document.createElement("iframe");
      f.style.cssText = "position:fixed;width:10px;height:10px;left:-9999px;top:-9999px;visibility:hidden;";
      document.documentElement.appendChild(f);
      probeDoc = f.contentDocument;
      window.__qcProbeFrame = f;
    }
    let el;
    try { el = probeDoc.createElement(tag); } catch (e) { el = probeDoc.createElement("div"); }
    // An <a> without href gets NO UA underline/blue, which would make the
    // probe defaults lie (a site's text-decoration:none would look like the
    // default and be skipped -- replica links turn blue underlined).
    if (tag === "a") el.setAttribute("href", "#");
    probeDoc.body.appendChild(el);
    const cs = probeDoc.defaultView.getComputedStyle(el);
    const out = {};
    for (const p of STYLE_PROPS) out[p] = cs.getPropertyValue(p);
    el.remove();
    probeCache.set(tag, out);
    return out;
  }

  // ── Asset inlining: fetch with the PAGE's credentials, return data URI ──
  // Two rungs: an in-page fetch first (page cookies, same as the site itself),
  // then the background service worker (host_permissions reach hosts whose
  // CORS policy blocks page scripts -- media CDNs like media.licdn.com serve
  // images fine to <img> but refuse fetch() from the page).
  const assetCache = new Map();
  const substitutions = [];
  async function pageFetchDataUri(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    if (blob.size > 3 * 1024 * 1024) throw new Error("asset too large");
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  async function bgFetchDataUri(url) {
    const res = await chrome.runtime.sendMessage({ type: "qc-fetch", url });
    if (res && res.ok && res.dataUri) return res.dataUri;
    throw new Error((res && res.error) || "blocked");
  }
  async function toDataUri(url) {
    if (!url || url.startsWith("data:")) return url;
    if (assetCache.has(url)) return assetCache.get(url);
    const p = (async () => {
      try {
        return await pageFetchDataUri(url);
      } catch (e1) {
        try {
          return await bgFetchDataUri(url);
        } catch (e2) {
          substitutions.push("asset dropped: " + url.slice(0, 80) + " (" + (e2.message || e1.message || "blocked") + ")");
          return null;
        }
      }
    })();
    assetCache.set(url, p);
    return p;
  }

  // ── Webfont embedding: find the @font-face behind each used family and
  // bake the binary. Same-origin sheets read directly; cross-origin sheets
  // (rules unreadable from the page) are fetched as text via the background
  // and their @font-face blocks parsed out. Font files themselves are served
  // with CORS (webfonts require it), so the fetch ladder above lands them.
  const SYSTEM_FONT_RE = /^(-apple-system|system-ui|BlinkMacSystemFont|Segoe UI|Arial|Helvetica( Neue)?|Georgia|Times( New Roman)?|Courier( New)?|Verdana|Tahoma|ui-monospace|ui-sans-serif|ui-serif|ui-rounded|monospace|sans-serif|serif|cursive|fantasy)$/i;
  function faceFromCss(block, baseHref) {
    const fam = block.match(/font-family\s*:\s*["']?([^;"'}]+)/i);
    if (!fam) return null;
    const weight = (block.match(/font-weight\s*:\s*([^;}]+)/i) || [])[1];
    const style = (block.match(/font-style\s*:\s*([^;}]+)/i) || [])[1];
    const srcs = [...block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/gi)]
      .map((m) => ({ url: m[1], format: (m[2] || "").toLowerCase() }))
      .filter((s) => !s.url.startsWith("data:"));
    if (!srcs.length) return null;
    const pick = srcs.find((s) => s.format.includes("woff2")) || srcs.find((s) => s.format.includes("woff")) || srcs[0];
    let abs;
    try { abs = new URL(pick.url, baseHref).href; } catch (e) { return null; }
    return {
      family: fam[1].trim(),
      weight: (weight || "normal").trim(),
      style: (style || "normal").trim(),
      url: abs,
    };
  }
  async function collectFonts(familyStacks) {
    const wanted = new Set();
    for (const stack of familyStacks) {
      const first = (stack || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (first && !SYSTEM_FONT_RE.test(first)) wanted.add(first.toLowerCase());
    }
    if (!wanted.size) return [];
    const candidates = [];
    const crossOrigin = [];
    for (const sheet of document.styleSheets) {
      let rules = null;
      try { rules = sheet.cssRules; } catch (e) { rules = null; }
      if (rules) {
        for (const rule of rules) {
          if (rule.constructor.name === "CSSFontFaceRule" || (rule.cssText || "").startsWith("@font-face")) {
            const f = faceFromCss(rule.cssText, sheet.href || location.href);
            if (f) candidates.push(f);
          }
        }
      } else if (sheet.href) {
        crossOrigin.push(sheet.href);
      }
    }
    for (const href of crossOrigin.slice(0, 8)) {
      try {
        const dataUri = await bgFetchDataUri(href);
        const css = atob(dataUri.split(",")[1] || "");
        for (const block of css.match(/@font-face\s*\{[^}]*\}/gi) || []) {
          const f = faceFromCss(block, href);
          if (f) candidates.push(f);
        }
      } catch (e) { /* sheet unreadable -- the family just falls back */ }
    }
    const out = [];
    const seen = new Set();
    const missing = new Set(wanted);
    for (const f of candidates) {
      if (!wanted.has(f.family.toLowerCase())) continue;
      const key = f.family.toLowerCase() + "|" + f.weight + "|" + f.style;
      if (seen.has(key) || out.length >= 6) continue;
      seen.add(key);
      const data = await toDataUri(f.url);
      if (data && data.length < 2.5 * 1024 * 1024) {
        out.push({ family: f.family, weight: f.weight, style: f.style, data });
        missing.delete(f.family.toLowerCase());
      }
    }
    if (missing.size) substitutions.push("fonts fall back to system stacks: " + [...missing].slice(0, 3).join(" · "));
    return out;
  }
  function fontFaceCss(fonts) {
    return (fonts || []).map((f) =>
      '@font-face{font-family:"' + f.family.replace(/["\\]/g, "") + '";src:url(' + f.data +
      ");font-weight:" + f.weight + ";font-style:" + f.style + ";font-display:swap}").join("");
  }

  // ── Serialize: clone the subtree, inline computed styles, bake assets ──
  // shotImg (the full-tab reference screenshot, may be null) funds the video
  // fallback: a VIDEO cannot ride along, but its REGION of the screenshot can
  // -- real pixels as a frozen frame instead of a black box. Deterministic:
  // it is literally the page as photographed.
  function cropFromShot(shotImg, r) {
    if (!shotImg || r.width < 2 || r.height < 2) return null;
    const vw = window.innerWidth, vh = window.innerHeight;
    const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (ix * iy < r.width * r.height * 0.5) return null; // mostly offscreen: crop would be garbage
    try {
      const cv = document.createElement("canvas");
      cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR);
      cv.getContext("2d").drawImage(shotImg, r.left * DPR, r.top * DPR, r.width * DPR, r.height * DPR, 0, 0, cv.width, cv.height);
      return cv.toDataURL("image/png");
    } catch (e) { return null; }
  }

  // Style resolution must come from the element's OWN window: elements
  // inside a same-origin iframe (the walk-in below) have their own view,
  // and the top window's getComputedStyle is not defined for them.
  const csOf = (el) => el.ownerDocument.defaultView.getComputedStyle(el);

  async function serialize(root, shotImg, depth) {
    depth = depth || 0;
    if (!depth) substitutions.length = 0;
    const clone = root.cloneNode(true);
    const origWalk = [root, ...root.querySelectorAll("*")];
    const cloneWalk = [clone, ...clone.querySelectorAll("*")];
    const fontFamilies = new Set();
    const rootRect = root.getBoundingClientRect();

    for (let i = 0; i < origWalk.length; i++) {
      const o = origWalk[i], c = cloneWalk[i];
      if (!c || c.nodeType !== 1) continue;
      const tag = o.tagName.toLowerCase();
      if (tag === "script" || tag === "iframe" || tag === "object" || tag === "embed") continue; // server kills them anyway
      const cs = csOf(o);
      if (cs.display === "none" || cs.visibility === "hidden") { c.remove(); continue; }
      const defaults = probeDefaults(tag);
      const parts = [];
      const pos = cs.position;
      // GRID FREEZE (see STYLE_PROPS note): a grid CONTAINER becomes a plain
      // positioned block -- its baked width/height already hold its size --
      // and each grid ITEM is pinned absolutely at its measured offset
      // inside it. display:contents wrappers are transparent to grid, so
      // item detection walks up through them.
      const isGridContainer = cs.display === "grid" || cs.display === "inline-grid";
      let gridParent = null;
      if (o !== root) {
        let p = o.parentElement;
        while (p && csOf(p).display === "contents" && p !== root) p = p.parentElement;
        if (p) {
          const pd = csOf(p).display;
          if (pd === "grid" || pd === "inline-grid") gridParent = p;
        }
      }
      const parentCS = o === root ? null : csOf(o.parentElement || o);
      for (const p of STYLE_PROPS) {
        // Offsets are a TRAP for positioned elements: getComputedStyle
        // resolves auto top/left/right/bottom to USED page coordinates
        // (top:56px means 56px from the ORIGINAL viewport), which flings
        // replica elements to alien positions. Only position:relative keeps
        // its computed offsets (there auto stays auto); absolute/fixed get
        // reconstructed geometry below.
        if ((p === "top" || p === "right" || p === "bottom" || p === "left") && pos !== "relative") continue;
        // A zero-width border is INVISIBLE -- but baking its style ("solid")
        // without its width resurrects it at the CSS initial 'medium' (3px).
        // Tailwind preflight puts border:0 solid <grey> on EVERYTHING, and
        // the replica grew grey 3px boxes around every block. Bake border
        // style/color only for sides that actually have width. Same for
        // outline: invisible when the style is none or the width is zero.
        const bSide = p.startsWith("border-") && (p.endsWith("-style") || p.endsWith("-color"))
          ? p.slice(0, p.lastIndexOf("-")) : null;
        if (bSide && parseFloat(cs.getPropertyValue(bSide + "-width")) === 0) continue;
        if (p.startsWith("outline-") && (cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) === 0)) continue;
        const v = cs.getPropertyValue(p);
        if (!v) continue;
        if (INHERITED_PROPS.has(p)) {
          // "Skip if equal to parent" is only safe when the UA does not
          // specially style this tag for this prop. Where it DOES (<a>
          // color, button/input fonts, heading sizes), the UA value beats
          // inheritance in the replica -- LinkedIn's name link matched its
          // parent color, got skipped, and rendered UA blue; the Follow
          // button's font-size matched its parent, got skipped, and fell to
          // 13px UA Arial (wider text -> "+ Follo" clipped).
          const divDefault = probeDefaults("div")[p];
          if (defaults[p] !== divDefault) {
            if (v === defaults[p]) continue; // UA-styled tag: diff vs its own default
          } else if (parentCS && v === parentCS.getPropertyValue(p)) {
            continue; // plainly inherited: the parent carries it
          }
        } else {
          if (v === defaults[p]) continue;
        }
        parts.push(p + ":" + v);
      }
      if (isGridContainer) {
        parts.push("display:" + (cs.display === "inline-grid" ? "inline-block" : "block"));
        if (pos === "static") parts.push("position:relative");
      }
      if (gridParent && cs.display !== "contents" && pos !== "absolute" && pos !== "fixed") {
        // Pin the item where the grid put it (relative to the container's
        // padding box; absolute offsets are measured from inside the border).
        const gr = gridParent.getBoundingClientRect();
        const er = o.getBoundingClientRect();
        const gcs = csOf(gridParent);
        const bt = parseFloat(gcs.borderTopWidth) || 0;
        const bl = parseFloat(gcs.borderLeftWidth) || 0;
        parts.push(
          "position:absolute",
          "top:" + Math.round(er.top - gr.top - bt) + "px",
          "left:" + Math.round(er.left - gr.left - bl) + "px",
          "right:auto", "bottom:auto", "margin:0",
        );
      } else if (pos === "absolute" || pos === "fixed") {
        // Rebuild geometry against the nearest positioned ancestor INSIDE the
        // capture (its position style is inlined, so the replica has the same
        // containing block) or against the capture root itself (the clone
        // root is forced position:relative below; the shell's .cap-body is
        // relative too). Walked by hand rather than via offsetParent: SVG
        // elements have no offsetParent, which used to drop badges/icons to
        // the coarse root-relative path.
        let anchor = null;
        let ap = o.parentElement;
        while (ap && ap !== root) {
          const apc = csOf(ap);
          if (apc.position !== "static" && apc.display !== "contents") { anchor = ap; break; }
          ap = ap.parentElement;
        }
        const base = anchor || root;
        const bcs = csOf(base);
        const br = base.getBoundingClientRect();
        const er = o.getBoundingClientRect();
        let topV = er.top - br.top - (parseFloat(bcs.borderTopWidth) || 0);
        let leftV = er.left - br.left - (parseFloat(bcs.borderLeftWidth) || 0);
        // The rect already INCLUDES the element's own transform; the baked
        // transform will apply AGAIN in the replica. Subtract a pure
        // translate so it lands once, not twice (badges use matrix(...,-8,-8)).
        const tm = cs.transform && cs.transform.startsWith("matrix(")
          ? cs.transform.slice(7, -1).split(",").map(parseFloat) : null;
        if (tm && tm.length === 6 && tm[0] === 1 && tm[1] === 0 && tm[2] === 0 && tm[3] === 1) {
          leftV -= tm[4]; topV -= tm[5];
        }
        parts.push("position:absolute", "top:" + Math.round(topV) + "px", "left:" + Math.round(leftV) + "px", "right:auto", "bottom:auto");
      } else if (pos === "sticky") {
        // Sticky offsets are meaningless in a frozen replica.
        parts.push("position:relative");
      }
      // A baked transform needs its baked ORIGIN: computed transform-origin
      // resolves to px and DEFAULTS to the element's center, so a replica
      // that drops it scales/rotates about the wrong point -- an app's
      // origin-0 zoom wrapper shifts its whole subtree right and down.
      if ((cs.transform && cs.transform !== "none") ||
          (cs.scale && cs.scale !== "none") ||
          (cs.rotate && cs.rotate !== "none")) parts.push("transform-origin:" + cs.transformOrigin);
      fontFamilies.add(cs.fontFamily);
      c.removeAttribute("class");
      c.removeAttribute("id");
      c.setAttribute("style", parts.join(";"));
      // The clone root must BE a containing block so root-pinned absolute
      // descendants land where they lived.
      if (i === 0 && pos === "static") c.setAttribute("style", parts.join(";") + ";position:relative");
      // Freeze live form state into attributes.
      if (tag === "input") { c.setAttribute("value", o.value || ""); if (o.checked) c.setAttribute("checked", ""); }
      if (tag === "textarea") c.textContent = o.value || "";
      if (tag === "select" && o.selectedIndex >= 0) {
        const opts = c.querySelectorAll("option");
        opts.forEach((op, j) => { if (j === o.selectedIndex) op.setAttribute("selected", ""); else op.removeAttribute("selected"); });
      }
    }

    // Bake images: <img> src (resolve currentSrc for srcset) + CSS backgrounds.
    //
    // THE PAINT GUARANTEE: every element that paints media ends up carrying
    // either its real BYTES (data URI) or its real PIXELS (its own region
    // cropped from the reference screenshot). VIDEO, CANVAS, IFRAME, OBJECT
    // and EMBED cannot ride along as DOM -- players draw through layers that
    // clone as empty black -- so they are frozen from the screenshot (poster,
    // then dark placeholder, as the ladder below). An IMG whose bytes cannot
    // be fetched falls back to its frozen region instead of vanishing. Every
    // freeze is NAMED in the panel notes so a miss is a report, not a mystery.
    const frozen = [];
    function freezeRegion(o, c, label) {
      const r = o.getBoundingClientRect();
      const base = ((c.getAttribute && c.getAttribute("style")) || "") +
        ";width:" + Math.round(r.width) + "px;height:" + Math.round(r.height) + "px;";
      const crop = cropFromShot(shotImg, r);
      if (crop) {
        const img = document.createElement("img");
        img.setAttribute("style", base + "object-fit:cover;");
        img.setAttribute("alt", "");
        img.setAttribute("src", crop);
        try { c.replaceWith(img); frozen.push(label); return true; } catch (e) { return false; }
      }
      return false;
    }
    function darkPlaceholder(o, c, label) {
      const r = o.getBoundingClientRect();
      const ph = document.createElement("div");
      ph.setAttribute("style", ((c.getAttribute && c.getAttribute("style")) || "") +
        ";width:" + Math.round(r.width) + "px;height:" + Math.round(r.height) + "px;background:#111;");
      try { c.replaceWith(ph); } catch (e) { /* already detached */ }
      substitutions.push(label + " region could not be frozen (offscreen at capture?) -- dark placeholder");
    }
    const imgJobs = [];
    for (let i = 0; i < origWalk.length; i++) {
      const o = origWalk[i], c = cloneWalk[i];
      if (!c || c.nodeType !== 1) continue;
      const tag = o.tagName;
      if (tag === "IFRAME" && depth < 2) {
        // WALK IN: an app's preview iframe (email editors, doc previews) is
        // usually same-origin or srcdoc -- its DOM is readable, and real DOM
        // beats frozen pixels every time (a tall email is mostly below the
        // fold, so the freeze gate would refuse it anyway). The iframe
        // becomes a same-sized clipping div carrying the serialized inner
        // document. Cross-origin frames throw here and fall to the ladder.
        let idoc = null;
        try { idoc = o.contentDocument; } catch (e) { /* cross-origin */ }
        if (idoc && idoc.body) {
          try {
            const inner = await serialize(idoc.body, null, depth + 1);
            // The replacement must live in LAYOUT coordinates (clientWidth/
            // Height), NOT the visual rect: apps display previews scaled
            // (a 1366px "Desktop" shown at 61%) and that ancestor transform
            // is baked into the clone -- it will scale this wrap exactly as
            // it scaled the iframe. Sizing by the visual rect double-applies
            // the scale: the box comes out too small while the inner
            // document's baked pixel margins stay layout-sized -- content
            // shoved right and clipped.
            const layoutW = o.clientWidth || Math.round(o.getBoundingClientRect().width);
            const layoutH = o.clientHeight || Math.round(o.getBoundingClientRect().height);
            const wrap = document.createElement("div");
            wrap.setAttribute("style", ((c.getAttribute && c.getAttribute("style")) || "") +
              ";width:" + layoutW + "px;height:" + layoutH + "px;overflow:hidden;");
            wrap.innerHTML = inner.html;
            c.replaceWith(wrap);
            substitutions.push("iframe captured as live DOM (same-origin walk-in)");
            continue;
          } catch (e) { /* fall through to the freeze ladder */ }
        }
      }
      if (tag === "VIDEO" || tag === "CANVAS" || tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED") {
        if (freezeRegion(o, c, tag.toLowerCase())) continue;
        if (tag === "VIDEO" && o.poster) {
          const img = document.createElement("img");
          img.setAttribute("style", (c.getAttribute("style") || "") + ";object-fit:cover;");
          img.setAttribute("alt", "");
          const cRef = c;
          imgJobs.push(toDataUri(o.poster).then((d) => {
            if (d) { img.setAttribute("src", d); try { cRef.replaceWith(img); frozen.push("video poster"); } catch (e) {} }
            else darkPlaceholder(o, cRef, "video");
          }));
          continue;
        }
        darkPlaceholder(o, c, tag.toLowerCase());
        continue;
      }
      if (tag === "IMG") {
        const src = o.currentSrc || o.src;
        c.removeAttribute("srcset"); c.removeAttribute("sizes"); c.removeAttribute("loading");
        imgJobs.push(toDataUri(src).then((d) => {
          if (d) c.setAttribute("src", d);
          else if (!freezeRegion(o, c, "img")) c.removeAttribute("src");
        }));
      }
      const bg = csOf(o).backgroundImage;
      const m = bg && bg !== "none" ? bg.match(/url\(["']?([^"')]+)["']?\)/) : null;
      if (m && !m[1].startsWith("data:")) {
        imgJobs.push(toDataUri(m[1]).then((d) => {
          const st = c.getAttribute("style") || "";
          if (d) { c.setAttribute("style", st + ";background-image:url(" + d + ")"); return; }
          // A leaf that paints ONLY its background can be frozen whole;
          // anything with children keeps its content and drops the bg.
          if (!o.children.length && !(o.textContent || "").trim() && freezeRegion(o, c, "background")) return;
          c.setAttribute("style", st.replace(/background-image:[^;]*(;|$)/, ""));
        }));
      }
    }
    await Promise.all(imgJobs);
    if (frozen.length) {
      const counts = {};
      for (const f of frozen) counts[f] = (counts[f] || 0) + 1;
      substitutions.push("frozen from screenshot (exact pixels, not live DOM): " +
        Object.keys(counts).map((k) => counts[k] + "× " + k).join(", "));
    }

    // A walked-in iframe's root is its <body> -- but <body> dissolves when
    // parsed back via innerHTML and its inlined style dies with it. Rehome
    // the inlined look onto a plain div.
    let outEl = clone;
    if (outEl.tagName === "BODY" || outEl.tagName === "HTML") {
      const div = document.createElement("div");
      for (const a of [...outEl.attributes]) div.setAttribute(a.name, a.value);
      while (outEl.firstChild) div.appendChild(outEl.firstChild);
      outEl = div;
    }

    // Fonts: bake the real webfont binaries for every non-system family in
    // use (the @font-face hunt + fetch ladder above). Only families that
    // cannot be landed fall back, and the panel says which. Inner documents
    // (walked-in iframes) skip the hunt -- email HTML carries its stacks.
    const fonts = depth ? [] : await collectFonts([...fontFamilies]);

    let html = outEl.outerHTML;
    // AMPUTATED ANCESTOR SCALE: if the picked root lives inside a scaled
    // ancestor (an editor canvas at 61%, a zoomed preview), its measured
    // rect is VISUAL while every baked style is LAYOUT -- and the ancestor
    // carrying the scale is outside the pick, so it never rides along. The
    // replica then lays out full-size in a visual-size box: content shoved
    // by its baked centering margins and clipped. Reproduce the missing
    // scale at the root.
    if (!depth) {
      const rr = root.getBoundingClientRect();
      const lw = root.offsetWidth || 0;
      const lh = root.offsetHeight || 0;
      if (lw && Math.abs(rr.width / lw - 1) > 0.02) {
        const k = rr.width / lw;
        html = '<div style="width:' + Math.round(rr.width) + "px;height:" + Math.round(rr.height) + 'px;overflow:hidden;">' +
          '<div style="width:' + lw + "px;height:" + lh + "px;transform:scale(" + k.toFixed(4) + ');transform-origin:0 0;">' +
          html + "</div></div>";
        substitutions.push("picked region is displayed at " + Math.round(k * 100) +
          "% by an ancestor outside the pick -- scale reproduced at the root");
      }
    }

    return { html, fonts };
  }

  // ── Picker overlay (shadow DOM so page CSS can't touch it) ──
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
  const ui = host.attachShadow({ mode: "open" });
  ui.innerHTML = `
    <style>
      .box { position: fixed; pointer-events: none; border: 2px solid #393bf5; background: rgba(57,59,245,0.08); border-radius: 3px; display: none; }
      .chip { position: fixed; pointer-events: none; background: #17171c; color: #fff; font: 11px/1.6 -apple-system, sans-serif; padding: 1px 8px; border-radius: 4px; display: none; white-space: nowrap; }
      .hint { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); background: #17171c; color: #fff; font: 12.5px/1.5 -apple-system, sans-serif; padding: 8px 16px; border-radius: 999px; box-shadow: 0 4px 24px rgba(0,0,0,0.35); }
      .hint b { color: #a5b4fc; }
      .panel { position: fixed; inset: 0; background: rgba(15,23,42,0.55); display: none; align-items: center; justify-content: center; pointer-events: auto; }
      .card { background: #fff; border-radius: 14px; width: min(1060px, 94vw); max-height: 92vh; overflow: auto; padding: 20px 24px; font: 13px/1.5 -apple-system, sans-serif; color: #17171c; box-shadow: 0 24px 80px rgba(0,0,0,0.4); }
      .card h1 { font-size: 16px; margin: 0 0 4px; }
      .sub { color: #6b7280; font-size: 12px; margin-bottom: 12px; }
      .ab { display: flex; gap: 12px; }
      .ab > div { flex: 1; min-width: 0; }
      .ab .lbl { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; color: #6b7280; margin-bottom: 5px; }
      .ab iframe, .ab img { width: 100%; border: 1px solid #d8dbe4; border-radius: 8px; background: #f6f7fa; display: block; }
      .subs { margin: 10px 0 0; color: #92400e; background: #fef3c7; border-radius: 8px; padding: 8px 12px; font-size: 12px; display: none; }
      .flbl { margin-top: 14px; font-size: 10.5px; font-weight: 700; letter-spacing: .05em; color: #6b7280; }
      .row { display: flex; gap: 10px; margin-top: 14px; }
      .row input, .row textarea { flex: 1; border: 1px solid #d8dbe4; border-radius: 8px; padding: 8px 10px; font: inherit; }
      .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
      button { font: inherit; border-radius: 8px; padding: 9px 18px; cursor: pointer; border: 1px solid #d8dbe4; background: #fff; }
      .primary { background: #393bf5; border-color: #393bf5; color: #fff; font-weight: 600; }
      .status { color: #6b7280; align-self: center; margin-right: auto; }
    </style>
    <div class="box"></div><div class="chip"></div>
    <div class="hint">Hover a region · <b>scroll</b> widen/narrow · <b>C</b> capture · <b>Esc</b> exit</div>
    <div class="panel"><div class="card">
      <h1>Capture as component</h1>
      <div class="sub">Left: the replica that becomes the component. Right: the page as it looked. Nothing is created until you confirm.</div>
      <div class="ab">
        <div><div class="lbl">REPLICA (the component)</div><iframe sandbox="allow-same-origin"></iframe></div>
        <div><div class="lbl">REFERENCE (the page)</div><img alt=""></div>
      </div>
      <div class="subs"></div>
      <div class="flbl">COMPONENT NAME — suggested from the page, yours to edit</div>
      <div class="row" style="margin-top:4px;"><input class="name" placeholder="component-name" spellcheck="false"><button class="reselect">↩ Reselect</button></div>
      <div class="row"><textarea class="desc" rows="2" placeholder="One-line description (what the storyboard reads when casting this)"></textarea></div>
      <div class="actions"><span class="status"></span><button class="cancel">Cancel</button><button class="primary create">Create component</button></div>
    </div></div>`;
  document.documentElement.appendChild(host);
  const $box = ui.querySelector(".box"), $chip = ui.querySelector(".chip"), $hint = ui.querySelector(".hint");
  const $panel = ui.querySelector(".panel"), $frame = ui.querySelector("iframe"), $ref = ui.querySelector(".ab img");
  const $subs = ui.querySelector(".subs"), $name = ui.querySelector(".name"), $desc = ui.querySelector(".desc");
  const $status = ui.querySelector(".status");

  let hoverEl = null, pickedEl = null, ancestry = [], depth = 0, bundle = null;

  function outline(el) {
    if (!el) { $box.style.display = "none"; $chip.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    $box.style.display = "block";
    $box.style.left = r.left - 2 + "px"; $box.style.top = r.top - 2 + "px";
    $box.style.width = r.width + "px"; $box.style.height = r.height + "px";
    $chip.style.display = "block";
    $chip.textContent = el.tagName.toLowerCase() + " · " + Math.round(r.width) + "×" + Math.round(r.height);
    $chip.style.left = Math.max(6, r.left) + "px";
    $chip.style.top = Math.max(6, r.top - 24) + "px";
  }
  function current() { return ancestry[depth] || hoverEl; }

  function onMove(e) {
    if ($panel.style.display === "flex") return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverEl || host.contains(el)) return;
    hoverEl = el;
    ancestry = [el];
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) { ancestry.push(p); p = p.parentElement; }
    depth = 0;
    outline(current());
  }
  function onWheel(e) {
    if ($panel.style.display === "flex") return;
    e.preventDefault(); e.stopPropagation();
    depth = Math.max(0, Math.min(ancestry.length - 1, depth + (e.deltaY > 0 ? -1 : 1)));
    outline(current());
  }
  function suppress(e) { if (!host.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } }

  async function capture() {
    pickedEl = current();
    if (!pickedEl) return;
    const r = pickedEl.getBoundingClientRect();
    // The picker chrome must not photobomb the reference screenshot.
    host.style.display = "none";
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    // Reference screenshot: background rasterizes the visible tab. Decoded
    // ONCE -- the same pixels fund the verdict-panel reference crop AND the
    // frozen frames for any video regions inside the pick.
    let refUrl = null, shotImg = null, refClipped = false;
    try {
      const shot = await chrome.runtime.sendMessage({ type: "qc-shot" });
      if (shot && shot.ok) {
        shotImg = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = shot.dataUrl;
        });
        refUrl = cropFromShot(shotImg, r);
        // A region mostly beyond the viewport (tall email, scaled canvas)
        // fails cropFromShot's >=50%-visible gate -- right for media
        // freezes, wrong for the panel's reference, which must NEVER go
        // blank. Fall back to the VISIBLE intersection of the pick.
        if (!refUrl && shotImg) {
          const vis = {
            left: Math.max(r.left, 0), top: Math.max(r.top, 0),
            right: Math.min(r.right, window.innerWidth),
            bottom: Math.min(r.bottom, window.innerHeight),
          };
          vis.width = vis.right - vis.left;
          vis.height = vis.bottom - vis.top;
          if (vis.width > 2 && vis.height > 2) {
            refUrl = cropFromShot(shotImg, vis);
            refClipped = !!refUrl;
          }
        }
      }
    } catch (e) { /* screenshot is best-effort */ }

    const { html, fonts } = await serialize(pickedEl, shotImg);
    if (refClipped) substitutions.push("reference shows only the visible part of the page -- the capture extends beyond the viewport");
    host.style.display = "";
    outline(null);

    bundle = {
      name: suggestName(pickedEl),
      html, fonts, screenshot: refUrl,
      source_url: location.origin + location.pathname,
      width: Math.round(r.width), height: Math.round(r.height), dpr: DPR,
    };
    window.__qcLastBundle = bundle; // debugging + test hook; never read by the flow
    // Local verdict: replica rendered from the serialized bytes themselves,
    // embedded fonts included so the type previews true. The panel opens
    // FIRST so the column width is measurable -- then the replica scales to
    // the SAME displayed width as the reference (which fills its column,
    // upscaling included) and gets its full proportional height, so both
    // sides run the same length and A/B line for line as the panel scrolls.
    $panel.style.display = "flex";
    $hint.style.display = "none";
    const scale = ($frame.clientWidth || 480) / r.width;
    $frame.style.height = Math.max(140, Math.round(r.height * scale)) + "px";
    // The replica renders in an EXTENSION page, not srcdoc: srcdoc iframes
    // inherit the host page's CSP, and on x.com font-src forbids data: --
    // every embedded webfont ERRORED and the replica fell back to wider
    // system glyphs (ellipsized names). The extension page carries the
    // extension's own CSP, so the captured fonts actually load. Inside,
    // the stage scales with transform, NEVER zoom (zoom re-lays-out and
    // exact-fit ellipsis boxes tip over at fractional scale).
    const replicaMsg = { type: "qc-replica", html, fontCss: fontFaceCss(fonts), width: Math.round(r.width), scale };
    if (chrome.runtime && chrome.runtime.getURL) {
      $frame.removeAttribute("sandbox");
      $frame.src = chrome.runtime.getURL("replica.html") + "?t=" + Date.now();
      $frame.onload = () => {
        try { $frame.contentWindow.postMessage(replicaMsg, "*"); } catch (e) {}
      };
    } else {
      // No extension runtime (test harness): same stage, inline.
      $frame.srcdoc = '<!doctype html><style>' + replicaMsg.fontCss + '</style><body style="margin:0;background:#fff;overflow:hidden;"><div style="width:' +
        replicaMsg.width + "px;transform:scale(" + scale + ');transform-origin:0 0;">' + html + "</div></body>";
    }
    if (refUrl) { $ref.src = refUrl; $ref.style.display = "block"; } else $ref.style.display = "none";
    $subs.style.display = substitutions.length ? "block" : "none";
    $subs.textContent = substitutions.slice(0, 4).join("  ·  ");
    $name.value = bundle.name;
  }

  // Text a HUMAN can actually see: skip text nodes living in clipped or
  // hidden containers (a11y duplicates like LinkedIn's invisible "Feed post"
  // heading must not win the name).
  function visibleText(el) {
    if (!el) return "";
    let out = "";
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (!p) continue;
      const r = p.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      const c = getComputedStyle(p);
      if (c.visibility === "hidden" || c.display === "none") continue;
      out += n.textContent + " ";
      if (out.length > 120) break;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function suggestName(el) {
    // site + something a HUMAN would call the thing: its heading, its label,
    // or the first strong words inside it -- never the tag name of a div
    // ("linkedin-div" helps no one) and never invisible a11y copy
    // ("linkedin-feed-post" named every post the same).
    const site = location.hostname.replace(/^www\./, "").split(".")[0];
    const pickText = () => {
      for (const h of el.querySelectorAll("h1,h2,h3,h4,[role=heading]")) {
        const t = visibleText(h);
        if (t) return t;
      }
      const a = el.getAttribute("aria-label");
      if (a && a.trim()) return a;
      for (const s of el.querySelectorAll("strong,b,[class*=title],[class*=name],a[href]")) {
        const t = visibleText(s);
        if (t) return t;
      }
      return visibleText(el) || document.title || el.tagName;
    };
    const words = pickText().trim().split(/\s+/).slice(0, 3).join("-");
    return (site + "-" + words).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }

  function reselect() { $panel.style.display = "none"; $hint.style.display = "block"; $hint.textContent = ""; outline(current()); resetHint(); }
  function resetHint() { $hint.innerHTML = 'Hover a region · <b>scroll</b> widen/narrow · <b>C</b> capture · <b>Esc</b> exit'; }
  function exit() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("wheel", onWheel, { capture: true });
    document.removeEventListener("click", suppress, true);
    document.removeEventListener("keydown", onKey, true);
    if (window.__qcProbeFrame) { window.__qcProbeFrame.remove(); window.__qcProbeFrame = null; }
    host.remove();
    window.__qcCaptureActive = false;
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); ($panel.style.display === "flex") ? reselect() : exit(); return; }
    if ($panel.style.display === "flex") return;
    if (e.key === "c" || e.key === "C") { e.preventDefault(); capture(); }
  }

  ui.querySelector(".cancel").addEventListener("click", exit);
  ui.querySelector(".reselect").addEventListener("click", reselect);
  ui.querySelector(".create").addEventListener("click", async () => {
    if (!bundle) return;
    bundle.name = $name.value.trim() || bundle.name;
    bundle.description = $desc.value.trim();
    $status.textContent = "Minting…";
    const res = await chrome.runtime.sendMessage({ type: "qc-mint", bundle });
    if (res && res.ok) {
      $status.textContent = "";
      $hint.style.display = "block";
      $hint.innerHTML = "✓ <b>" + res.type + "</b> minted — castable in storyboards now";
      $panel.style.display = "none";
      setTimeout(exit, 2400);
    } else {
      $status.textContent = "✗ " + ((res && res.error) || "failed — try again");
    }
  });

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("wheel", onWheel, { capture: true, passive: false });
  document.addEventListener("click", suppress, true);
  document.addEventListener("keydown", onKey, true);
})();
