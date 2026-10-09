// ── shared/samples.js ──
// SAMPLE BRANDS AND THEIR WORK: made-up brands (Flowpath, Oliva Terra, Lumen
// AI, Studio Bloom, Volt Run, Nimbus, Maré, Bonsai, Kiln Coffee, Atlas Trips,
// Penny, Fern & Co) and the house sample work made for them -- finished deck
// slides, landing pages, full-length emails, social posts for each platform
// (LinkedIn, Instagram feed and story, TikTok, X, YouTube, Pinterest), blog
// articles and blog home pages, event cards -- generated once with the image
// model and committed (core/sample-work.ts serves them). Quotient's three
// areas are email, social and blog: every film can show beautiful work in
// each. The Moda launch film (Mar 2026) sold its
// product with a wall of beautiful work drifting past; Marc (Oct 9): "the
// color and design makes any video pop" -- and, of the first HTML-drawn
// cards, "they need to look like really nice assets".
//
//   mpSamples.work                      the house pieces: {src, kind, brand, ratio,
//                                       platform (social), page (blog: post | index)}
//   mpSamples.pick(n, opts)             n pieces, shuffled (seeded); opts.kinds,
//                                       opts.brands, opts.platforms filter, opts.items
//                                       replaces the house set
//   mpSamples.brands                    the brands (name, colours, email copy)
//   mpSamples.emailBlocks(brandId)      a quotient-email-editor email for the brand
//   mpSamples.setPhotos({id: url})      a brand's photo, for its email's hero
(function () {
  var BRANDS = [
    { id: 'flowpath', name: 'Flowpath', bg: '#0f2f3a', bg2: '#1b5262', accent: '#e2187b',
      copy: { email: 'Your Q3 plan, built in seconds', sub: 'The project app that turns scattered ideas into a clear plan in seconds.', eyebrow: 'Sales proposal', button: 'Take a look' } },
    { id: 'oliva', name: 'Oliva Terra', bg: '#f3eee2', bg2: '#e7dcc4', accent: '#6f8a2e',
      copy: { email: 'The new harvest is here', sub: 'Single-estate olive oil from the hills above Kalamata.', eyebrow: 'Autumn 2026', button: 'Take a look' } },
    { id: 'lumen', name: 'Lumen AI', bg: '#e3191f', bg2: '#ff4d3d', accent: '#e3191f',
      copy: { email: 'Your signals, in one place', sub: 'Real-time intelligence for revenue teams.', eyebrow: 'Launch week', button: 'See it live' } },
    { id: 'bloom', name: 'Studio Bloom', bg: '#140a07', bg2: '#ff5a1f', accent: '#ff7a2f',
      copy: { email: 'Open studio night, Thursday', sub: 'Designers, makers and storytellers, Brooklyn NY.', eyebrow: 'Careers', button: 'Save your spot' } },
    { id: 'volt', name: 'Volt Run', bg: '#d6ff3b', bg2: '#0d0d0d', accent: '#7fb800',
      copy: { email: 'Your new pair just dropped', sub: 'Engineered for the last rep.', eyebrow: 'New drop', button: 'Shop the drop' } },
    { id: 'nimbus', name: 'Nimbus', bg: '#4f6bff', bg2: '#a259ff', accent: '#4f6bff',
      copy: { email: 'Welcome to Nimbus', sub: 'Deploy in one click, scale without thinking.', eyebrow: 'Product update', button: 'Deploy your first app' } },
    { id: 'mare', name: 'Maré', bg: '#ffd8cc', bg2: '#ffb3a1', accent: '#ff4f3d',
      copy: { email: 'Meet the summer edit', sub: 'Clean skincare made with marine botanicals.', eyebrow: 'Summer edit', button: 'Discover the edit' } },
    { id: 'bonsai', name: 'Bonsai', bg: '#2a241d', bg2: '#4a3d2e', accent: '#7f9a52',
      copy: { email: 'Your tree needs you this week', sub: 'Hand-shaped trees and the tools to keep them.', eyebrow: 'Workshop', button: 'Book a seat' } },
    { id: 'kiln', name: 'Kiln Coffee', bg: '#f4ece0', bg2: '#3b2418', accent: '#d9622b',
      copy: { email: 'The Roast Report, No. 14', sub: 'Small-batch coffee, roasted every Monday.', eyebrow: 'Bean of the month', button: 'Shop the roast' } },
    { id: 'atlas', name: 'Atlas Trips', bg: '#ffd23f', bg2: '#0b4f8a', accent: '#0b4f8a',
      copy: { email: '48-hour sale: Lisbon from $399', sub: 'Real places, brighter days.', eyebrow: 'Flash sale', button: 'Grab a seat' } },
    { id: 'penny', name: 'Penny', bg: '#d9f7e6', bg2: '#0f3d2e', accent: '#0f3d2e',
      copy: { email: 'Your money, on autopilot', sub: 'Round-ups, smart goals and zero fees.', eyebrow: 'New in Penny', button: 'Start saving' } },
    { id: 'fern', name: 'Fern & Co', bg: '#eef0e4', bg2: '#7d8f69', accent: '#c4673f',
      copy: { email: 'We miss you (and so do your plants)', sub: 'Hard to kill. Easy to love.', eyebrow: 'Come back', button: 'Shop plants' } },
  ];
  var BY_ID = {};
  BRANDS.forEach(function (b) { BY_ID[b.id] = b; });

  // THE HOUSE WORK (src/sample-work/). Full literal paths: the render rewrites
  // every /assets/... string in the page to its file.
  // @@WORK@@
  var WORK = [
    {src: '/assets/_system/sample-work/atlas-blog-post.webp', kind: 'blog', brand: 'atlas', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/atlas-email-promo.webp', kind: 'email', brand: 'atlas', ratio: 1.7872},
    {src: '/assets/_system/sample-work/atlas-social-instagram.webp', kind: 'social', brand: 'atlas', ratio: 1.0, platform: 'instagram'},
    {src: '/assets/_system/sample-work/bloom-blog-post.webp', kind: 'blog', brand: 'bloom', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/bloom-email-event.webp', kind: 'email', brand: 'bloom', ratio: 1.7872},
    {src: '/assets/_system/sample-work/bloom-landing.webp', kind: 'landing', brand: 'bloom', ratio: 0.5595},
    {src: '/assets/_system/sample-work/bloom-social-tiktok.webp', kind: 'social', brand: 'bloom', ratio: 1.7872, platform: 'tiktok'},
    {src: '/assets/_system/sample-work/bloom-social.webp', kind: 'social', brand: 'bloom', ratio: 1.25, platform: 'instagram'},
    {src: '/assets/_system/sample-work/bonsai-email-newsletter.webp', kind: 'email', brand: 'bonsai', ratio: 1.7872},
    {src: '/assets/_system/sample-work/bonsai-slide.webp', kind: 'slide', brand: 'bonsai', ratio: 0.5595},
    {src: '/assets/_system/sample-work/bonsai-social-youtube.webp', kind: 'social', brand: 'bonsai', ratio: 0.5595, platform: 'youtube'},
    {src: '/assets/_system/sample-work/bonsai-social.webp', kind: 'social', brand: 'bonsai', ratio: 1.25, platform: 'instagram'},
    {src: '/assets/_system/sample-work/fern-blog-post.webp', kind: 'blog', brand: 'fern', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/fern-email-winback.webp', kind: 'email', brand: 'fern', ratio: 1.7872},
    {src: '/assets/_system/sample-work/fern-social-instagram.webp', kind: 'social', brand: 'fern', ratio: 1.25, platform: 'instagram'},
    {src: '/assets/_system/sample-work/flowpath-blog-post.webp', kind: 'blog', brand: 'flowpath', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/flowpath-email-launch.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872},
    {src: '/assets/_system/sample-work/flowpath-slide-1.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {src: '/assets/_system/sample-work/flowpath-slide-2.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {src: '/assets/_system/sample-work/flowpath-slide-3.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {src: '/assets/_system/sample-work/flowpath-slide-4.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {src: '/assets/_system/sample-work/flowpath-slide-5.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {src: '/assets/_system/sample-work/flowpath-slide-6.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {src: '/assets/_system/sample-work/flowpath-social-linkedin.webp', kind: 'social', brand: 'flowpath', ratio: 1.25, platform: 'linkedin'},
    {src: '/assets/_system/sample-work/kiln-blog-post.webp', kind: 'blog', brand: 'kiln', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/kiln-email-newsletter.webp', kind: 'email', brand: 'kiln', ratio: 1.7872},
    {src: '/assets/_system/sample-work/kiln-social-instagram.webp', kind: 'social', brand: 'kiln', ratio: 1.25, platform: 'instagram'},
    {src: '/assets/_system/sample-work/kiln-social-tiktok.webp', kind: 'social', brand: 'kiln', ratio: 1.7872, platform: 'tiktok'},
    {src: '/assets/_system/sample-work/lumen-blog-post.webp', kind: 'blog', brand: 'lumen', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/lumen-email-webinar.webp', kind: 'email', brand: 'lumen', ratio: 1.7872},
    {src: '/assets/_system/sample-work/lumen-slide.webp', kind: 'slide', brand: 'lumen', ratio: 0.5595},
    {src: '/assets/_system/sample-work/lumen-social-x.webp', kind: 'social', brand: 'lumen', ratio: 0.5595, platform: 'x'},
    {src: '/assets/_system/sample-work/lumen-social.webp', kind: 'social', brand: 'lumen', ratio: 1.25, platform: 'instagram'},
    {src: '/assets/_system/sample-work/mare-blog-post.webp', kind: 'blog', brand: 'mare', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/mare-email-welcome.webp', kind: 'email', brand: 'mare', ratio: 1.7872},
    {src: '/assets/_system/sample-work/mare-landing.webp', kind: 'landing', brand: 'mare', ratio: 0.5595},
    {src: '/assets/_system/sample-work/mare-social-story.webp', kind: 'social', brand: 'mare', ratio: 1.7872, platform: 'story'},
    {src: '/assets/_system/sample-work/mare-social.webp', kind: 'social', brand: 'mare', ratio: 1.25, platform: 'instagram'},
    {src: '/assets/_system/sample-work/nimbus-blog-index.webp', kind: 'blog', brand: 'nimbus', ratio: 0.5595, page: 'index'},
    {src: '/assets/_system/sample-work/nimbus-email-changelog.webp', kind: 'email', brand: 'nimbus', ratio: 1.7872},
    {src: '/assets/_system/sample-work/nimbus-email.webp', kind: 'email', brand: 'nimbus', ratio: 1.4884},
    {src: '/assets/_system/sample-work/nimbus-event.webp', kind: 'event', brand: 'nimbus', ratio: 1.25},
    {src: '/assets/_system/sample-work/nimbus-landing.webp', kind: 'landing', brand: 'nimbus', ratio: 0.5595},
    {src: '/assets/_system/sample-work/nimbus-social-linkedin.webp', kind: 'social', brand: 'nimbus', ratio: 0.5595, platform: 'linkedin'},
    {src: '/assets/_system/sample-work/oliva-email-recipes.webp', kind: 'email', brand: 'oliva', ratio: 1.7872},
    {src: '/assets/_system/sample-work/oliva-email.webp', kind: 'email', brand: 'oliva', ratio: 1.4884},
    {src: '/assets/_system/sample-work/oliva-landing.webp', kind: 'landing', brand: 'oliva', ratio: 0.5595},
    {src: '/assets/_system/sample-work/oliva-social-pinterest.webp', kind: 'social', brand: 'oliva', ratio: 1.4884, platform: 'pinterest'},
    {src: '/assets/_system/sample-work/oliva-social-x.webp', kind: 'social', brand: 'oliva', ratio: 0.5595, platform: 'x'},
    {src: '/assets/_system/sample-work/oliva-social.webp', kind: 'social', brand: 'oliva', ratio: 1.25, platform: 'instagram'},
    {src: '/assets/_system/sample-work/penny-blog-post.webp', kind: 'blog', brand: 'penny', ratio: 1.7872, page: 'post'},
    {src: '/assets/_system/sample-work/penny-email-product.webp', kind: 'email', brand: 'penny', ratio: 1.7872},
    {src: '/assets/_system/sample-work/penny-social-linkedin.webp', kind: 'social', brand: 'penny', ratio: 1.0, platform: 'linkedin'},
    {src: '/assets/_system/sample-work/volt-blog-index.webp', kind: 'blog', brand: 'volt', ratio: 0.5595, page: 'index'},
    {src: '/assets/_system/sample-work/volt-email-recap.webp', kind: 'email', brand: 'volt', ratio: 1.7872},
    {src: '/assets/_system/sample-work/volt-email.webp', kind: 'email', brand: 'volt', ratio: 1.4884},
    {src: '/assets/_system/sample-work/volt-landing.webp', kind: 'landing', brand: 'volt', ratio: 0.5595},
    {src: '/assets/_system/sample-work/volt-social-story.webp', kind: 'social', brand: 'volt', ratio: 1.7872, platform: 'story'},
    {src: '/assets/_system/sample-work/volt-social.webp', kind: 'social', brand: 'volt', ratio: 1.25, platform: 'instagram'},
  ];
  // @@END@@

  var PHOTOS = {};
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  window.mpSamples = {
    brands: BRANDS,
    work: WORK,
    brand: function (id) { return BY_ID[id] || BRANDS[0]; },
    // n pieces: the set filtered by kind / brand, shuffled with the seed and
    // dealt again past one deck, so a piece never sits next to itself.
    pick: function (n, opts) {
      opts = opts || {};
      var pool = Array.isArray(opts.items) && opts.items.length ? opts.items.map(function (it) {
        return typeof it === 'string' ? { src: it, kind: 'piece', brand: '', ratio: 0 } : it;
      }).filter(function (it) { return it && it.src; }) : WORK.filter(function (w) {
        return (!opts.kinds || !opts.kinds.length || opts.kinds.indexOf(w.kind) >= 0) && (!opts.brands || !opts.brands.length || opts.brands.indexOf(w.brand) >= 0)
          && (!opts.platforms || !opts.platforms.length || opts.platforms.indexOf(w.platform) >= 0);
      });
      if (!pool.length) pool = WORK.slice();
      if (!pool.length) return [];
      var r = rng(opts.seed || 7), out = [];
      while (out.length < n) {
        var d = pool.slice();
        if (opts.shuffle !== false) for (var i = d.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = d[i]; d[i] = d[j]; d[j] = t; }
        if (out.length && d.length > 1 && d[0].src === out[out.length - 1].src) d.push(d.shift());
        out = out.concat(d);
      }
      return out.slice(0, n);
    },
    setPhotos: function (map) {
      if (!map || typeof map !== 'object') return;
      Object.keys(map).forEach(function (id) { if (BY_ID[id] && typeof map[id] === 'string' && map[id]) PHOTOS[id] = map[id]; });
    },
    // The brand as a quotient-email-editor email: brand + blocks.
    emailBlocks: function (brandId) {
      var b = BY_ID[brandId] || BRANDS[0], c = b.copy;
      return {
        brand: { name: b.name, color: b.accent, color_2: b.bg2 === b.accent ? b.bg : b.bg2 },
        blocks: [
          { kind: 'logo', text: b.name, layer: 'Logo' },
          PHOTOS[b.id] ? { kind: 'hero', label: c.eyebrow, layer: 'Hero', image: PHOTOS[b.id] } : { kind: 'hero', label: c.eyebrow, layer: 'Hero', steps: [
            { icon: 'pen', title: 'Draft', sub: 'from your brief' },
            { icon: 'zap', title: 'Design', sub: 'on brand' },
            { icon: 'send', title: 'Send', sub: 'to every list' }] },
          { kind: 'eyebrow', text: c.eyebrow, layer: 'Eyebrow' },
          { kind: 'headline', text: c.email, layer: 'Headline' },
          { kind: 'text', text: c.sub, layer: 'Body' },
          { kind: 'button', text: c.button, layer: 'Button' },
          { kind: 'footer', copyright: '© 2026 ' + b.name, social: ['x', 'linkedin', 'instagram'], layer: 'Footer' },
        ],
      };
    },
  };
})();
