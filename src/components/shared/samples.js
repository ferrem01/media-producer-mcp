// ── shared/samples.js ──
// DESIGNED SAMPLE WORK: made-up brands and the marketing assets a team would
// make for them -- deck slides, social posts, emails, landing pages, event
// cards, stat cards. The Moda launch film (Mar 2026) sold its product with a
// wall of beautiful, colourful work drifting past; Marc (Oct 9): "the color
// and design makes any video pop", and we have no real examples that good.
// These are drawn, not photographed: bold type, brand colour, shapes, little
// product mockups -- crisp at any size, no network images.
//
// Sizing: every asset is laid out in em, 1em = 1% of the card's WIDTH. The
// caller sizes the card and sets font-size = width / 100 px.
//   mpSamples.brands                    the brand list
//   mpSamples.asset(kind, brandId)      inner HTML for one card
//   mpSamples.ratio(kind)               height / width of a kind
//   mpSamples.pick(n, opts)             n varied {kind, brand} picks (seeded)
//   mpSamples.emailBlocks(brandId)      a quotient-email-editor email for the brand
//   mpSamples.setPhotos({id: url})      photos for the brands' picture slots
//   Fonts: a component that shows them @imports Anton, Instrument Serif and
//   Inter (see media/asset-wall).
(function () {
  var SANS = "'Inter', system-ui, -apple-system, sans-serif";
  var SERIF = "'Instrument Serif', 'Fraunces', Georgia, 'Times New Roman', serif";
  var COND = "'Anton', 'Bebas Neue', Impact, 'Arial Narrow', sans-serif";

  var BRANDS = [
    { id: 'flowpath', name: 'Flowpath', mark: 'F', bg: '#0f2f3a', bg2: '#1b5262', ink: '#ffffff', accent: '#e2187b', soft: '#f7e8f0', display: SANS, weight: 600,
      copy: { slide: 'Better planning', sub: 'The project app that turns scattered ideas into a clear plan in seconds.', social: ['Plan', 'less.', 'Ship', 'more.'],
        email: 'Your Q3 plan, built in seconds', landing: 'Plans that move themselves', stat: ['3.2x', 'faster launches'], eyebrow: 'Sales proposal',
        event: { name: 'Priya Raman', role: 'VP Product, Flowpath', title: 'Planning at the speed of AI' } } },
    { id: 'oliva', name: 'Oliva Terra', mark: 'O', bg: '#f3eee2', bg2: '#e7dcc4', ink: '#2f3a1e', accent: '#6f8a2e', accent2: '#c9a24a', display: SERIF, weight: 400,
      copy: { slide: 'Harvest, pressed by hand', sub: 'Single-estate olive oil from the hills above Kalamata.', social: ['The', 'first', 'press'],
        email: 'The new harvest is here', landing: 'Olive oil worth slowing down for', stat: ['48h', 'grove to bottle'], eyebrow: 'Autumn 2026',
        event: { name: 'Elena Marsh', role: 'Head Grower', title: 'A tasting in the grove' } } },
    { id: 'lumen', name: 'Lumen AI', mark: 'L', bg: '#e3191f', bg2: '#ff4d3d', ink: '#ffffff', accent: '#111111', display: COND, weight: 400, upper: true,
      copy: { slide: 'See every signal', sub: 'Real-time intelligence for revenue teams.', social: ['Lumen', 'Lumen', 'Lumen'], hero: 'Lumen AI',
        email: 'Your signals, in one place', landing: 'Light up your pipeline', stat: ['91%', 'forecast accuracy'], eyebrow: 'Launch week',
        event: { name: 'Marcus Webb', role: 'CEO, Lumen AI', title: 'The signal summit' } } },
    { id: 'bloom', name: 'Studio Bloom', mark: 'B', bg: '#140a07', bg2: '#ff5a1f', ink: '#ffffff', accent: '#ff7a2f', display: COND, weight: 400, upper: true,
      copy: { slide: 'We are hiring', sub: 'Designers, makers and storytellers, Brooklyn NY.', social: ['Join', 'the', 'team'],
        email: 'Open studio night, Thursday', landing: 'Brand worlds, built by hand', stat: ['120', 'brands launched'], eyebrow: 'Careers',
        event: { name: 'Ava Lindqvist', role: 'Creative Director', title: 'Open studio night' } } },
    { id: 'volt', name: 'Volt Run', mark: 'V', bg: '#d6ff3b', bg2: '#b6f000', ink: '#0d0d0d', accent: '#0d0d0d', display: COND, weight: 400, upper: true,
      copy: { slide: 'Best gym shoes', sub: 'Engineered for the last rep.', social: ['Run', 'it', 'back'],
        email: 'Your new pair just dropped', landing: 'Built for the last mile', stat: ['-38%', 'impact force'], eyebrow: 'New drop',
        event: { name: 'Jordan Okafor', role: 'Head Coach', title: 'Volt Run Club, 6am' } } },
    { id: 'nimbus', name: 'Nimbus', mark: 'N', bg: '#4f6bff', bg2: '#a259ff', ink: '#ffffff', accent: '#ffffff', display: SANS, weight: 700,
      copy: { slide: 'Your cloud, simplified', sub: 'Deploy in one click, scale without thinking.', social: ['Ship', 'faster', 'with Nimbus'],
        email: 'Welcome to Nimbus', landing: 'The cloud that gets out of your way', stat: ['99.99%', 'uptime this year'], eyebrow: 'Product update',
        event: { name: 'Sam Patel', role: 'CTO, Nimbus', title: 'Nimbus Live 2026' } } },
    { id: 'mare', name: 'Maré', mark: 'M', bg: '#ffd8cc', bg2: '#ffb3a1', ink: '#3b1d1a', accent: '#ff4f3d', display: SERIF, weight: 400, italic: true,
      copy: { slide: 'Skin, like the sea', sub: 'Clean skincare made with marine botanicals.', social: ['Glow', 'season'],
        email: 'Meet the summer edit', landing: 'Your skin, rested', stat: ['4.9', 'from 12k reviews'], eyebrow: 'Summer edit',
        event: { name: 'Camila Duarte', role: 'Founder, Maré', title: 'The summer edit launch' } } },
    { id: 'bonsai', name: 'Bonsai', mark: 'B', bg: '#2a241d', bg2: '#4a3d2e', ink: '#f2e7d4', accent: '#a7bb7f', display: SERIF, weight: 400,
      copy: { slide: 'Grow slowly', sub: 'Hand-shaped trees and the tools to keep them.', social: ['Bonsai'],
        email: 'Your tree needs you this week', landing: 'The art of patience', stat: ['30y', 'oldest tree in stock'], eyebrow: 'Workshop',
        event: { name: 'Kenji Mori', role: 'Master Grower', title: 'Pruning workshop' } } },
  ];
  var BY_ID = {};
  BRANDS.forEach(function (b) { BY_ID[b.id] = b; });

  var RATIO = { slide: 9 / 16, social: 1, email: 1.55, landing: 10 / 16, event: 1.25, stat: 1 };
  var KINDS = ['slide', 'social', 'email', 'landing', 'event', 'stat'];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function dark(b) { var h = b.bg.replace('#', ''); var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), bl = parseInt(h.substr(4, 2), 16); return (r * 299 + g * 587 + bl * 114) / 1000 < 140; }
  function disp(b, size, extra) {
    return 'font-family:' + b.display + ';font-weight:' + b.weight + ';' + (b.upper ? 'text-transform:uppercase;letter-spacing:0.005em;' : 'letter-spacing:-0.025em;') +
      (b.italic ? 'font-style:italic;' : '') + 'font-size:' + size + 'em;line-height:' + (b.display === COND ? 0.92 : 1.02) + ';' + (extra || '');
  }
  function grad(b, ang) { return 'linear-gradient(' + (ang || 135) + 'deg,' + b.bg + ',' + b.bg2 + ')'; }
  function logo(b, size, color) {
    var c = color || b.ink;
    return '<div style="display:flex;align-items:center;gap:' + (size * 0.35) + 'em;font-family:' + SANS + ';font-weight:700;font-size:' + size + 'em;color:' + c + ';letter-spacing:-0.02em">' +
      '<span style="display:inline-flex;align-items:center;justify-content:center;width:1.5em;height:1.5em;border-radius:0.4em;background:' + b.accent + ';color:' + (dark({ bg: b.accent }) ? '#fff' : '#111') + ';font-size:0.8em">' + esc(b.mark) + '</span>' + esc(b.name) + '</div>';
  }
  function pill(text, bg, fg, size) {
    return '<span style="display:inline-block;padding:0.35em 0.9em;border-radius:99em;background:' + bg + ';color:' + fg + ';font-family:' + SANS + ';font-weight:600;font-size:' + (size || 1.6) + 'em;white-space:nowrap">' + esc(text) + '</span>';
  }
  function lines(n, color, w0) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<div style="height:0.55em;border-radius:1em;background:' + color + ';margin:0 0 0.55em;width:' + (i === n - 1 ? (w0 || 62) : 100 - i * 7) + '%"></div>';
    return s;
  }

  // ── ART: drawn pictures, so there are no network images ──
  function phone(b, w) {
    // A phone with the brand's app: a header, a big number card, a list.
    var light = !dark(b);
    var scr = light ? '#ffffff' : '#f6f7fb';
    return '<div style="width:' + w + 'em;height:' + (w * 1.9) + 'em;border-radius:' + (w * 0.16) + 'em;background:#0c0c0e;padding:' + (w * 0.045) + 'em;box-shadow:0 2em 4em rgba(0,0,0,0.35)">' +
      '<div style="width:100%;height:100%;border-radius:' + (w * 0.12) + 'em;background:' + scr + ';overflow:hidden;font-family:' + SANS + ';position:relative">' +
      '<div style="height:28%;background:' + grad(b, 160) + ';padding:' + (w * 0.09) + 'em;color:#fff">' +
      '<div style="font-size:' + (w * 0.075) + 'em;opacity:0.8;font-weight:600">' + esc(b.name) + '</div>' +
      '<div style="font-size:' + (w * 0.12) + 'em;font-weight:700;margin-top:0.3em;line-height:1.1">' + esc(b.copy.stat[0]) + '</div></div>' +
      '<div style="padding:' + (w * 0.08) + 'em">' +
      [0, 1, 2, 3].map(function (i) {
        return '<div style="display:flex;align-items:center;gap:' + (w * 0.05) + 'em;margin-bottom:' + (w * 0.06) + 'em"><span style="width:' + (w * 0.13) + 'em;height:' + (w * 0.13) + 'em;border-radius:' + (w * 0.04) + 'em;background:' + (i % 2 ? b.bg2 : b.accent) + ';opacity:' + (0.9 - i * 0.12) + '"></span>' +
          '<span style="flex:1"><span style="display:block;height:' + (w * 0.035) + 'em;border-radius:1em;background:#1a1a22;opacity:0.75;width:' + (80 - i * 12) + '%"></span><span style="display:block;height:' + (w * 0.028) + 'em;border-radius:1em;background:#1a1a22;opacity:0.25;width:' + (60 - i * 6) + '%;margin-top:' + (w * 0.025) + 'em"></span></span></div>';
      }).join('') + '</div></div></div>';
  }
  function bars(b, w, h, color) {
    var v = [38, 52, 46, 64, 58, 78, 92], s = '';
    for (var i = 0; i < v.length; i++) s += '<span style="flex:1;height:' + v[i] + '%;border-radius:0.5em 0.5em 0 0;background:' + (i === v.length - 1 ? b.accent : (color || b.ink)) + ';opacity:' + (i === v.length - 1 ? 1 : 0.28 + i * 0.07) + '"></span>';
    return '<div style="display:flex;align-items:flex-end;gap:' + (w * 0.04) + 'em;width:' + w + 'em;height:' + h + 'em">' + s + '</div>';
  }
  function curve(b, w, h, color) {
    return '<svg viewBox="0 0 100 50" preserveAspectRatio="none" style="width:' + w + 'em;height:' + h + 'em;display:block">' +
      '<defs><linearGradient id="mpsg-' + b.id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (color || b.accent) + '" stop-opacity="0.45"/><stop offset="1" stop-color="' + (color || b.accent) + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M0 42 C12 40 18 30 28 31 S44 38 54 26 S72 14 82 15 S94 6 100 4 L100 50 L0 50 Z" fill="url(#mpsg-' + b.id + ')"/>' +
      '<path d="M0 42 C12 40 18 30 28 31 S44 38 54 26 S72 14 82 15 S94 6 100 4" fill="none" stroke="' + (color || b.accent) + '" stroke-width="1.6" vector-effect="non-scaling-stroke" style="stroke-width:3px"/></svg>';
  }
  function figure(b, w) {
    // An abstract portrait: a soft gradient disc with a head-and-shoulders
    // silhouette -- a person, never a face.
    return '<div style="width:' + w + 'em;height:' + w + 'em;border-radius:50%;background:radial-gradient(circle at 35% 30%,' + b.bg2 + ',' + b.accent + ');position:relative;overflow:hidden">' +
      '<svg viewBox="0 0 100 100" style="position:absolute;inset:0;width:100%;height:100%"><circle cx="50" cy="40" r="17" fill="rgba(255,255,255,0.88)"/><path d="M14 100 C16 72 32 62 50 62 C68 62 84 72 86 100 Z" fill="rgba(255,255,255,0.88)"/></svg></div>';
  }
  // PHOTOS: a brand's own picture for the photo slot (generated images,
  // uploaded to the film) -- set by a component from its data (setPhotos).
  var PHOTOS = {};
  function scene(b, w, h) {
    var ph = PHOTOS[b.id];
    if (ph) return '<div style="width:' + w + 'em;height:' + h + 'em;border-radius:1.2em;overflow:hidden;background:' + b.bg2 + ' url(\'' + String(ph).replace(/'/g, '%27') + '\') center/cover no-repeat"></div>';
    // No photo: a drawn still life -- a sun, two hills and a stem.
    return '<div style="width:' + w + 'em;height:' + h + 'em;border-radius:1.2em;overflow:hidden;position:relative;background:linear-gradient(180deg,' + b.bg2 + ',' + b.bg + ')">' +
      '<svg viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">' +
      '<circle cx="70" cy="24" r="12" fill="' + b.accent + '" opacity="0.9"/>' +
      '<path d="M0 52 C20 40 36 42 54 50 S86 56 100 46 L100 70 L0 70 Z" fill="' + b.ink + '" opacity="0.18"/>' +
      '<path d="M0 60 C24 52 44 56 62 62 S90 64 100 58 L100 70 L0 70 Z" fill="' + b.ink + '" opacity="0.3"/>' +
      '<path d="M30 62 C30 46 34 36 40 28" stroke="' + b.ink + '" stroke-width="1.2" fill="none" opacity="0.55"/>' +
      '<ellipse cx="37" cy="36" rx="5" ry="2.4" transform="rotate(-35 37 36)" fill="' + (b.accent2 || b.accent) + '" opacity="0.8"/>' +
      '<ellipse cx="42" cy="30" rx="4.4" ry="2" transform="rotate(30 42 30)" fill="' + (b.accent2 || b.accent) + '" opacity="0.7"/></svg></div>';
  }

  // ── THE ASSETS ──
  function slide(b) {
    var d = dark(b), sub = d ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.6)';
    var right = b.display === COND ? '<div style="transform:rotate(-4deg)">' + bars(b, 30, 30) + '</div>' : phone(b, 17);
    return '<div style="position:absolute;inset:0;background:' + (b.id === 'nimbus' ? grad(b) : b.bg) + ';color:' + b.ink + ';padding:5em 6em;display:flex;align-items:center;gap:4em;overflow:hidden">' +
      '<div style="position:absolute;right:-12em;top:-14em;width:44em;height:44em;border-radius:50%;background:' + b.bg2 + ';opacity:0.55"></div>' +
      '<div style="flex:1.25;position:relative">' + logo(b, 1.6) +
      '<div style="margin-top:3.2em">' + pill(b.copy.eyebrow, b.accent, dark({ bg: b.accent }) ? '#fff' : '#111', 1.3) + '</div>' +
      '<div style="' + disp(b, 7.2, 'margin-top:0.35em') + '">' + esc(b.copy.slide) + '</div>' +
      '<div style="font-family:' + SANS + ';font-size:1.7em;line-height:1.4;color:' + sub + ';margin-top:1.1em;max-width:22em">' + esc(b.copy.sub) + '</div>' +
      '<div style="margin-top:2.4em;font-family:' + SANS + ';font-size:1.25em;color:' + sub + '">Prepared for Coffee Co · March 2026</div></div>' +
      '<div style="flex:1;display:flex;justify-content:center;position:relative">' + right + '</div></div>';
  }
  function social(b) {
    var d = dark(b);
    if (b.display === COND) {
      // Each line as big as the widest word allows (a condensed face runs
      // ~0.5em a letter; the card leaves 86em for the type).
      var words = b.copy.social, longest = words.reduce(function (m, w3) { return Math.max(m, w3.length); }, 1);
      var size = Math.min(words.length > 3 ? 15 : 19, 86 / (longest * 0.55));
      var glow = b.id === 'bloom' ? 'radial-gradient(circle at 70% 75%,' + b.bg2 + ' 0%,rgba(255,90,31,0.35) 32%,' + b.bg + ' 68%)' : b.bg;
      return '<div style="position:absolute;inset:0;background:' + glow + ';color:' + b.ink + ';padding:7em;overflow:hidden">' +
        '<div style="font-family:' + SANS + ';font-weight:700;font-size:2.4em;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85">' + esc(b.name) + '</div>' +
        '<div style="margin-top:3em">' + words.map(function (w2, i) { return '<div style="white-space:nowrap;' + disp(b, size) + (b.id === 'lumen' && i < words.length - 1 ? 'color:transparent;-webkit-text-stroke:0.022em ' + b.ink + ';' : '') + '">' + esc(w2) + '</div>'; }).join('') + '</div>' +
        '<div style="position:absolute;right:7em;bottom:9em;width:34em;height:42em;border-radius:3em;overflow:hidden;transform:rotate(4deg);box-shadow:0 2em 5em rgba(0,0,0,0.4)">' + scene(b, 34, 42) + '</div>' +
        '<div style="position:absolute;left:7em;bottom:6em;font-family:' + SANS + ';font-size:2.2em;opacity:0.8">link in bio</div></div>';
    }
    if (b.display === SERIF) {
      return '<div style="position:absolute;inset:0;background:' + b.bg + ';color:' + b.ink + ';overflow:hidden">' +
        '<div style="position:absolute;left:12%;right:12%;top:12%;bottom:30%;border-radius:40em 40em 1.5em 1.5em;overflow:hidden">' + scene(b, 76, 58) + '</div>' +
        '<div style="position:absolute;left:0;right:0;bottom:9%;text-align:center"><div style="' + disp(b, 11) + '">' + esc(b.copy.social.join(' ')) + '</div>' +
        '<div style="font-family:' + SANS + ';font-size:2.2em;letter-spacing:0.2em;text-transform:uppercase;margin-top:1em;opacity:0.7">' + esc(b.name) + '</div></div></div>';
    }
    return '<div style="position:absolute;inset:0;background:' + grad(b, 150) + ';color:' + b.ink + ';padding:8em;overflow:hidden">' +
      logo(b, 2.6, '#fff') +
      '<div style="' + disp(b, 12, 'margin-top:0.8em;color:#fff') + '">' + esc(b.copy.social.slice(0, 2).join(' ')) + '</div>' +
      '<div style="font-family:' + SANS + ';font-size:4em;font-weight:500;opacity:0.85;margin-top:0.2em">' + esc(b.copy.social.slice(2).join(' ')) + '</div>' +
      '<div style="position:absolute;left:8em;right:8em;bottom:8em;height:30em;border-radius:2.5em;background:rgba(255,255,255,0.95);padding:4em;box-shadow:0 2em 5em rgba(0,0,0,0.25)">' +
      '<div style="font-family:' + SANS + ';font-weight:700;font-size:6em;color:#15152a">' + esc(b.copy.stat[0]) + '</div>' +
      '<div style="font-family:' + SANS + ';font-size:2.6em;color:#6a6a80;margin-bottom:1.5em">' + esc(b.copy.stat[1]) + '</div>' + curve(b, 68, 9, b.bg) + '</div></div>';
  }
  function email(b) {
    var d = dark(b), cardBg = d ? '#ffffff' : '#ffffff', ink = '#17171c';
    return '<div style="position:absolute;inset:0;background:' + (d ? b.bg : b.bg2) + ';padding:5em;font-family:' + SANS + '">' +
      '<div style="background:' + cardBg + ';border-radius:2em;overflow:hidden;height:100%;box-shadow:0 1em 3em rgba(0,0,0,0.18);display:flex;flex-direction:column">' +
      '<div style="padding:4.5em 6em 3em">' + logo(b, 3, ink) + '</div>' +
      '<div style="margin:0 6em;height:52em;border-radius:1.6em;overflow:hidden;position:relative;background:' + grad(b, 160) + '">' +
      (b.display === COND ? '<div style="position:absolute;right:-8em;top:-10em;width:46em;height:46em;border-radius:50%;background:' + b.accent + ';opacity:0.18"></div>' +
        '<div style="position:absolute;right:6em;top:6em;width:26em;height:34em;border-radius:2em;overflow:hidden;transform:rotate(5deg);box-shadow:0 1.5em 3em rgba(0,0,0,0.3)">' + scene(b, 26, 34) + '</div>' +
        '<div style="position:absolute;left:5em;bottom:4em"><div style="' + disp(b, 13, 'color:' + b.ink) + '">' + esc(b.copy.hero || b.copy.social.join(' ')) + '</div></div>' : scene(b, 78, 52)) + '</div>' +
      '<div style="padding:5em 6em 0;flex:1">' +
      '<div style="font-size:2.3em;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:' + (b.accent === '#ffffff' ? b.bg : b.accent) + '">' + esc(b.copy.eyebrow) + '</div>' +
      '<div style="' + disp(b, 8.4, 'color:' + ink + ';margin-top:0.35em') + '">' + esc(b.copy.email) + '</div>' +
      '<div style="font-size:3.2em;line-height:1.45;color:#5a5a68;margin-top:0.8em">' + esc(b.copy.sub) + '</div>' +
      '<div style="margin-top:4em">' + pill(b.display === COND ? 'Shop now' : 'Take a look', b.accent === '#ffffff' ? b.bg : b.accent, '#fff', 3.2) + '</div></div>' +
      '<div style="padding:4em 6em;font-size:2.2em;color:#9a9aa8;border-top:0.1em solid #eee;margin-top:4em">' + esc(b.name) + ' · Unsubscribe</div></div></div>';
  }
  function landing(b) {
    var d = dark(b), bg = b.id === 'nimbus' ? grad(b) : b.bg, sub = d ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.6)';
    var btnBg = b.accent === '#ffffff' ? '#ffffff' : b.accent, btnFg = dark({ bg: btnBg }) ? '#fff' : '#111';
    return '<div style="position:absolute;inset:0;background:' + bg + ';color:' + b.ink + ';overflow:hidden;font-family:' + SANS + '">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:3em 5em">' + logo(b, 1.7) +
      '<div style="display:flex;gap:3em;font-size:1.4em;opacity:0.8"><span>Product</span><span>Customers</span><span>Pricing</span><span>Blog</span></div>' + pill('Get started', btnBg, btnFg, 1.3) + '</div>' +
      '<div style="text-align:center;padding:4.5em 10em 0"><div style="' + disp(b, 6.6, 'max-width:13em;margin:0 auto') + '">' + esc(b.copy.landing) + '</div>' +
      '<div style="font-size:1.7em;color:' + sub + ';margin-top:1em">' + esc(b.copy.sub) + '</div>' +
      '<div style="margin-top:2.4em;display:flex;gap:1.2em;justify-content:center">' + pill('Start free', btnBg, btnFg, 1.5) + pill('Watch demo', 'transparent', b.ink, 1.5) + '</div></div>' +
      '<div style="position:absolute;left:12%;right:12%;bottom:-6em;height:24em;border-radius:1.6em 1.6em 0 0;background:#ffffff;box-shadow:0 -1em 4em rgba(0,0,0,0.2);padding:3em;display:flex;gap:3em">' +
      '<div style="width:16em">' + lines(5, '#dfe1ea', 50) + '</div>' +
      '<div style="flex:1;display:flex;flex-direction:column;gap:2em"><div style="display:flex;gap:2em">' +
      [0, 1, 2].map(function (i) { return '<div style="flex:1;border-radius:1em;background:#f4f5f9;padding:1.5em"><div style="font-weight:700;font-size:2.2em;color:#17171c">' + ['2.4k', '68%', '$1.2m'][i] + '</div><div style="font-size:1.1em;color:#8a8a98">' + ['Leads', 'Win rate', 'Pipeline'][i] + '</div></div>'; }).join('') +
      '</div>' + curve(b, 60, 8, b.accent === '#ffffff' ? b.bg : b.accent) + '</div></div></div>';
  }
  function eventCard(b) {
    var d = dark(b), e = b.copy.event, sub = d ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)';
    return '<div style="position:absolute;inset:0;background:' + (b.id === 'volt' || b.id === 'nimbus' ? grad(b, 160) : b.bg) + ';color:' + b.ink + ';padding:8em;overflow:hidden;font-family:' + SANS + '">' +
      '<div style="font-size:2.4em;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;opacity:0.85">Keynote speaker</div>' +
      '<div style="margin:6em 0 0">' + figure(b, 48) + '</div>' +
      '<div style="position:absolute;left:8em;right:8em;bottom:10em"><div style="' + disp(b, 9) + '">' + esc(e.name) + '</div>' +
      '<div style="font-size:3em;color:' + sub + ';margin-top:0.5em">' + esc(e.role) + '</div>' +
      '<div style="margin-top:2.4em">' + pill(e.title, b.accent === '#ffffff' ? '#ffffff' : b.accent, dark({ bg: b.accent }) ? '#fff' : '#111', 2.6) + '</div></div></div>';
  }
  function stat(b) {
    var d = dark(b), sub = d ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.6)';
    return '<div style="position:absolute;inset:0;background:' + (b.id === 'nimbus' ? grad(b) : b.bg) + ';color:' + b.ink + ';padding:9em;overflow:hidden;font-family:' + SANS + '">' +
      logo(b, 3) +
      '<div style="' + disp(b, 24, 'margin-top:0.25em') + '">' + esc(b.copy.stat[0]) + '</div>' +
      '<div style="font-size:4em;color:' + sub + ';margin-top:0.3em">' + esc(b.copy.stat[1]) + '</div>' +
      '<div style="position:absolute;left:9em;right:9em;bottom:9em">' + bars(b, 82, 26) + '</div></div>';
  }
  var RENDER = { slide: slide, social: social, email: email, landing: landing, event: eventCard, stat: stat };

  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  window.mpSamples = {
    brands: BRANDS,
    kinds: KINDS,
    ratio: function (kind) { return RATIO[kind] || 1; },
    brand: function (id) { return BY_ID[id] || BRANDS[0]; },
    // {brandId: imageUrl}: photos for the brands' picture slots.
    setPhotos: function (map) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach(function (id) { if (BY_ID[id] && typeof map[id] === 'string' && map[id]) PHOTOS[id] = map[id]; });
    },
    asset: function (kind, brandId) {
      var b = BY_ID[brandId] || BRANDS[0], fn = RENDER[kind] || slide;
      return '<div class="mps mps-' + kind + '" style="position:absolute;inset:0;overflow:hidden;-webkit-font-smoothing:antialiased">' + fn(b) + '</div>';
    },
    // n varied picks: every kind x brand pairing, shuffled (seeded), so the
    // same card never sits next to itself; past one full deck it deals again.
    pick: function (n, opts) {
      opts = opts || {};
      var kinds = (opts.kinds && opts.kinds.length ? opts.kinds : KINDS).filter(function (k) { return RENDER[k]; });
      var brands = (opts.brands && opts.brands.length ? opts.brands : BRANDS.map(function (b) { return b.id; })).filter(function (id) { return BY_ID[id]; });
      if (!kinds.length) kinds = KINDS;
      if (!brands.length) brands = [BRANDS[0].id];
      var r = rng(opts.seed || 7), deck = [], out = [];
      kinds.forEach(function (k) { brands.forEach(function (b) { deck.push({ kind: k, brand: b }); }); });
      while (out.length < n) {
        var d = deck.slice();
        for (var i = d.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = d[i]; d[i] = d[j]; d[j] = t; }
        out = out.concat(d);
      }
      return out.slice(0, n);
    },
    // The same brand as a quotient-email-editor email: brand + blocks.
    emailBlocks: function (brandId) {
      var b = BY_ID[brandId] || BRANDS[0], c = b.copy, accent = b.accent === '#ffffff' || b.accent === '#111111' || b.accent === '#0d0d0d' ? b.bg2 : b.accent;
      return {
        brand: { name: b.name, color: accent, color_2: b.bg2 === accent ? b.bg : b.bg2 },
        blocks: [
          { kind: 'logo', text: b.name, layer: 'Logo' },
          PHOTOS[b.id] ? { kind: 'hero', label: c.eyebrow, layer: 'Hero', image: PHOTOS[b.id] } : { kind: 'hero', label: c.eyebrow, layer: 'Hero', steps: [
            { icon: 'pen', title: 'Draft', sub: 'from your brief' },
            { icon: 'zap', title: 'Design', sub: 'on brand' },
            { icon: 'send', title: 'Send', sub: 'to every list' }] },
          { kind: 'eyebrow', text: c.eyebrow, layer: 'Eyebrow' },
          { kind: 'headline', text: c.email, layer: 'Headline' },
          { kind: 'text', text: c.sub, layer: 'Body' },
          { kind: 'button', text: b.display === COND ? 'Shop the drop' : 'Take a look', layer: 'Button' },
          { kind: 'footer', copyright: '© 2026 ' + b.name, social: ['x', 'linkedin', 'instagram'], layer: 'Footer' },
        ],
      };
    },
  };
})();
