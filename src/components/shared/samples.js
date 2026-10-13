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
//   mpSamples.work                      the house pieces: {id, title, src, kind, brand,
//                                       ratio, platform (social), page (blog: post |
//                                       index), flow (email: the lifecycle step)}
//   mpSamples.pick(n, opts)             n pieces, shuffled (seeded); opts.kinds,
//                                       opts.brands, opts.platforms, opts.flows filter,
//                                       opts.items replaces the house set
// Flowpath carries a whole B2B SaaS lifecycle (welcome to win-back), Maré a
// whole ecommerce one (welcome, browse, cart, order, shipping ... birthday).
// Server side the same manifest is the Sample library (core/sample-work.ts).
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
    {id: 'atlas-blog-post', title: 'Atlas Trips blog: Lisbon in 48 hours', src: '/assets/_system/sample-work/atlas-blog-post.webp', kind: 'blog', brand: 'atlas', ratio: 1.7872, page: 'post'},
    {id: 'atlas-email-promo', title: 'Atlas Trips email: 48-hour sale, Lisbon from $399', src: '/assets/_system/sample-work/atlas-email-promo.webp', kind: 'email', brand: 'atlas', ratio: 1.7872, flow: 'promo'},
    {id: 'atlas-event-countdown', title: 'Atlas Travel Summit countdown post: 3 days to go', src: '/assets/_system/sample-work/atlas-event-countdown.webp', kind: 'event', brand: 'atlas', ratio: 1.25},
    {id: 'atlas-social-instagram', title: 'Atlas Trips Instagram post: Somewhere new', src: '/assets/_system/sample-work/atlas-social-instagram.webp', kind: 'social', brand: 'atlas', ratio: 1.0, platform: 'instagram'},
    {id: 'bloom-blog-post', title: 'Studio Bloom case study: Rebranding a running club', src: '/assets/_system/sample-work/bloom-blog-post.webp', kind: 'blog', brand: 'bloom', ratio: 1.7872, page: 'post'},
    {id: 'bloom-email-event', title: 'Studio Bloom email: Open Studio Night invite', src: '/assets/_system/sample-work/bloom-email-event.webp', kind: 'email', brand: 'bloom', ratio: 1.7872, flow: 'event'},
    {id: 'bloom-event-recap', title: 'Studio Bloom recap email: Thanks for coming', src: '/assets/_system/sample-work/bloom-event-recap.webp', kind: 'event', brand: 'bloom', ratio: 1.7872},
    {id: 'bloom-landing', title: 'Studio Bloom landing page: Brand worlds, built by hand', src: '/assets/_system/sample-work/bloom-landing.webp', kind: 'landing', brand: 'bloom', ratio: 0.5595},
    {id: 'bloom-social-tiktok', title: 'Studio Bloom TikTok cover: 3 brand mistakes', src: '/assets/_system/sample-work/bloom-social-tiktok.webp', kind: 'social', brand: 'bloom', ratio: 1.7872, platform: 'tiktok'},
    {id: 'bloom-social', title: 'Studio Bloom Instagram post: Join the team', src: '/assets/_system/sample-work/bloom-social.webp', kind: 'social', brand: 'bloom', ratio: 1.25, platform: 'instagram'},
    {id: 'bonsai-email-newsletter', title: 'Bonsai newsletter: The Autumn Guide', src: '/assets/_system/sample-work/bonsai-email-newsletter.webp', kind: 'email', brand: 'bonsai', ratio: 1.7872, flow: 'newsletter'},
    {id: 'bonsai-slide', title: 'Bonsai deck slide', src: '/assets/_system/sample-work/bonsai-slide.webp', kind: 'slide', brand: 'bonsai', ratio: 0.5595},
    {id: 'bonsai-social-youtube', title: 'Bonsai YouTube thumbnail: Save a dying bonsai', src: '/assets/_system/sample-work/bonsai-social-youtube.webp', kind: 'social', brand: 'bonsai', ratio: 0.5595, platform: 'youtube'},
    {id: 'bonsai-social', title: 'Bonsai Instagram post: Pruning workshop', src: '/assets/_system/sample-work/bonsai-social.webp', kind: 'social', brand: 'bonsai', ratio: 1.25, platform: 'instagram'},
    {id: 'fern-blog-post', title: 'Fern & Co blog: 10 plants that survive anything', src: '/assets/_system/sample-work/fern-blog-post.webp', kind: 'blog', brand: 'fern', ratio: 1.7872, page: 'post'},
    {id: 'fern-email-winback', title: 'Fern & Co win-back email: We miss you (and so do your plants)', src: '/assets/_system/sample-work/fern-email-winback.webp', kind: 'email', brand: 'fern', ratio: 1.7872, flow: 'win-back'},
    {id: 'fern-event-speaker', title: 'Fern & Co speaker card: Maya Chen, Plants that thrive on neglect', src: '/assets/_system/sample-work/fern-event-speaker.webp', kind: 'event', brand: 'fern', ratio: 1.25},
    {id: 'fern-social-instagram', title: 'Fern & Co Instagram post: Hard to kill. Easy to love.', src: '/assets/_system/sample-work/fern-social-instagram.webp', kind: 'social', brand: 'fern', ratio: 1.25, platform: 'instagram'},
    {id: 'flowpath-blog-post', title: 'Flowpath blog: How we plan a quarter in one afternoon', src: '/assets/_system/sample-work/flowpath-blog-post.webp', kind: 'blog', brand: 'flowpath', ratio: 1.7872, page: 'post'},
    {id: 'flowpath-email-activation', title: 'Flowpath activation nudge: Quick one, finish your setup', src: '/assets/_system/sample-work/flowpath-email-activation.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'activation'},
    {id: 'flowpath-email-check-in', title: 'Flowpath onboarding check-in: How\'s it going so far?', src: '/assets/_system/sample-work/flowpath-email-check-in.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'check-in'},
    {id: 'flowpath-email-feature-tip', title: 'Flowpath feature tip: Try AI-written timelines', src: '/assets/_system/sample-work/flowpath-email-feature-tip.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'feature-tip'},
    {id: 'flowpath-email-feedback', title: 'Flowpath feedback ask: Got 30 seconds for us?', src: '/assets/_system/sample-work/flowpath-email-feedback.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'feedback'},
    {id: 'flowpath-email-first-win', title: 'Flowpath first-win email: Your first plan is live', src: '/assets/_system/sample-work/flowpath-email-first-win.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'first-win'},
    {id: 'flowpath-email-launch', title: 'Flowpath launch email: Meet Flowpath 3.0', src: '/assets/_system/sample-work/flowpath-email-launch.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'launch'},
    {id: 'flowpath-email-milestone', title: 'Flowpath usage milestone: You\'ve planned 100 projects', src: '/assets/_system/sample-work/flowpath-email-milestone.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'milestone'},
    {id: 'flowpath-email-renewal', title: 'Flowpath renewal reminder: Your plan renews in 7 days', src: '/assets/_system/sample-work/flowpath-email-renewal.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'renewal'},
    {id: 'flowpath-email-social-proof', title: 'Flowpath customer story: How a 5-person team shipped 2x faster', src: '/assets/_system/sample-work/flowpath-email-social-proof.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'social-proof'},
    {id: 'flowpath-email-trial-ending', title: 'Flowpath trial-ending email: Your trial ends in 3 days', src: '/assets/_system/sample-work/flowpath-email-trial-ending.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'trial-ending'},
    {id: 'flowpath-email-upgrade', title: 'Flowpath upgrade email: Unlock unlimited projects', src: '/assets/_system/sample-work/flowpath-email-upgrade.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'upgrade'},
    {id: 'flowpath-email-welcome', title: 'Flowpath welcome email: Welcome to Flowpath', src: '/assets/_system/sample-work/flowpath-email-welcome.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'welcome'},
    {id: 'flowpath-email-win-back', title: 'Flowpath win-back: We miss you at Flowpath', src: '/assets/_system/sample-work/flowpath-email-win-back.webp', kind: 'email', brand: 'flowpath', ratio: 1.7872, flow: 'win-back'},
    {id: 'flowpath-event-booth', title: 'Flowpath trade-show booth: Plans in seconds, Booth 214', src: '/assets/_system/sample-work/flowpath-event-booth.webp', kind: 'event', brand: 'flowpath', ratio: 0.5595},
    {id: 'flowpath-slide-1', title: 'Flowpath deck, slide 1', src: '/assets/_system/sample-work/flowpath-slide-1.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {id: 'flowpath-slide-2', title: 'Flowpath deck, slide 2', src: '/assets/_system/sample-work/flowpath-slide-2.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {id: 'flowpath-slide-3', title: 'Flowpath deck, slide 3', src: '/assets/_system/sample-work/flowpath-slide-3.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {id: 'flowpath-slide-4', title: 'Flowpath deck, slide 4', src: '/assets/_system/sample-work/flowpath-slide-4.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {id: 'flowpath-slide-5', title: 'Flowpath deck, slide 5', src: '/assets/_system/sample-work/flowpath-slide-5.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {id: 'flowpath-slide-6', title: 'Flowpath deck, slide 6', src: '/assets/_system/sample-work/flowpath-slide-6.webp', kind: 'slide', brand: 'flowpath', ratio: 0.5595},
    {id: 'flowpath-social-linkedin', title: 'Flowpath LinkedIn carousel: 5 ways teams lose a week to planning', src: '/assets/_system/sample-work/flowpath-social-linkedin.webp', kind: 'social', brand: 'flowpath', ratio: 1.25, platform: 'linkedin'},
    {id: 'kiln-blog-post', title: 'Kiln Coffee blog: The perfect pour-over, explained', src: '/assets/_system/sample-work/kiln-blog-post.webp', kind: 'blog', brand: 'kiln', ratio: 1.7872, page: 'post'},
    {id: 'kiln-email-newsletter', title: 'Kiln Coffee newsletter: The Roast Report', src: '/assets/_system/sample-work/kiln-email-newsletter.webp', kind: 'email', brand: 'kiln', ratio: 1.7872, flow: 'newsletter'},
    {id: 'kiln-event-invite', title: 'Kiln Coffee invite: Autumn Roast Cupping Night', src: '/assets/_system/sample-work/kiln-event-invite.webp', kind: 'event', brand: 'kiln', ratio: 1.25},
    {id: 'kiln-landing', title: 'Kiln Coffee landing page: The Autumn Roast is here', src: '/assets/_system/sample-work/kiln-landing.webp', kind: 'landing', brand: 'kiln', ratio: 0.5595},
    {id: 'kiln-social-instagram', title: 'Kiln Coffee Instagram post: Ethiopia Guji, now roasting', src: '/assets/_system/sample-work/kiln-social-instagram.webp', kind: 'social', brand: 'kiln', ratio: 1.25, platform: 'instagram'},
    {id: 'kiln-social-tiktok', title: 'Kiln Coffee TikTok cover: How we roast', src: '/assets/_system/sample-work/kiln-social-tiktok.webp', kind: 'social', brand: 'kiln', ratio: 1.7872, platform: 'tiktok'},
    {id: 'lumen-blog-post', title: 'Lumen AI blog: What revenue teams get wrong about signals', src: '/assets/_system/sample-work/lumen-blog-post.webp', kind: 'blog', brand: 'lumen', ratio: 1.7872, page: 'post'},
    {id: 'lumen-email-webinar', title: 'Lumen AI webinar email: Signals that close deals', src: '/assets/_system/sample-work/lumen-email-webinar.webp', kind: 'email', brand: 'lumen', ratio: 1.7872, flow: 'webinar'},
    {id: 'lumen-event-badge', title: 'Lumen AI speaker badge: The Signal Summit', src: '/assets/_system/sample-work/lumen-event-badge.webp', kind: 'event', brand: 'lumen', ratio: 1.4884},
    {id: 'lumen-slide', title: 'Lumen AI deck slide', src: '/assets/_system/sample-work/lumen-slide.webp', kind: 'slide', brand: 'lumen', ratio: 0.5595},
    {id: 'lumen-social-x', title: 'Lumen AI X card: Signals > Noise', src: '/assets/_system/sample-work/lumen-social-x.webp', kind: 'social', brand: 'lumen', ratio: 0.5595, platform: 'x'},
    {id: 'lumen-social', title: 'Lumen AI post: Launch week', src: '/assets/_system/sample-work/lumen-social.webp', kind: 'social', brand: 'lumen', ratio: 1.25, platform: 'instagram'},
    {id: 'mare-blog-post', title: 'Maré blog: Your summer skin routine in four steps', src: '/assets/_system/sample-work/mare-blog-post.webp', kind: 'blog', brand: 'mare', ratio: 1.7872, page: 'post'},
    {id: 'mare-email-back-in-stock', title: 'Maré back in stock: It\'s back, Glow Oil', src: '/assets/_system/sample-work/mare-email-back-in-stock.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'back-in-stock'},
    {id: 'mare-email-birthday', title: 'Maré birthday email: Happy birthday, 25% off', src: '/assets/_system/sample-work/mare-email-birthday.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'birthday'},
    {id: 'mare-email-browse', title: 'Maré browse abandonment: Still thinking it over?', src: '/assets/_system/sample-work/mare-email-browse.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'browse'},
    {id: 'mare-email-cart', title: 'Maré abandoned cart: You left something behind', src: '/assets/_system/sample-work/mare-email-cart.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'cart'},
    {id: 'mare-email-order', title: 'Maré order confirmation: Thank you, your order is confirmed', src: '/assets/_system/sample-work/mare-email-order.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'order'},
    {id: 'mare-email-price-drop', title: 'Maré price drop: The price just dropped', src: '/assets/_system/sample-work/mare-email-price-drop.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'price-drop'},
    {id: 'mare-email-replenish', title: 'Maré replenishment reminder: Running low?', src: '/assets/_system/sample-work/mare-email-replenish.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'replenish'},
    {id: 'mare-email-review', title: 'Maré review request: How\'s your Tide Serum?', src: '/assets/_system/sample-work/mare-email-review.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'review'},
    {id: 'mare-email-shipping', title: 'Maré shipping notification: Your glow is on its way', src: '/assets/_system/sample-work/mare-email-shipping.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'shipping'},
    {id: 'mare-email-vip', title: 'Maré VIP loyalty: Welcome to Maré Circle', src: '/assets/_system/sample-work/mare-email-vip.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'vip'},
    {id: 'mare-email-welcome', title: 'Maré welcome email: Welcome to the tide, 10% off', src: '/assets/_system/sample-work/mare-email-welcome.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'welcome'},
    {id: 'mare-email-win-back', title: 'Maré win-back: It\'s been a while, 20% off', src: '/assets/_system/sample-work/mare-email-win-back.webp', kind: 'email', brand: 'mare', ratio: 1.7872, flow: 'win-back'},
    {id: 'mare-event-story', title: 'Maré story: The Glow Pop-Up', src: '/assets/_system/sample-work/mare-event-story.webp', kind: 'event', brand: 'mare', ratio: 1.7872},
    {id: 'mare-landing', title: 'Maré landing page', src: '/assets/_system/sample-work/mare-landing.webp', kind: 'landing', brand: 'mare', ratio: 0.5595},
    {id: 'mare-social-story', title: 'Maré Instagram story: Glow season is here', src: '/assets/_system/sample-work/mare-social-story.webp', kind: 'social', brand: 'mare', ratio: 1.7872, platform: 'story'},
    {id: 'mare-social', title: 'Maré Instagram post: Glow season', src: '/assets/_system/sample-work/mare-social.webp', kind: 'social', brand: 'mare', ratio: 1.25, platform: 'instagram'},
    {id: 'nimbus-blog-index', title: 'Nimbus blog home: Deploys should be boring', src: '/assets/_system/sample-work/nimbus-blog-index.webp', kind: 'blog', brand: 'nimbus', ratio: 0.5595, page: 'index'},
    {id: 'nimbus-email-changelog', title: 'Nimbus product update email: What\'s new in October', src: '/assets/_system/sample-work/nimbus-email-changelog.webp', kind: 'email', brand: 'nimbus', ratio: 1.7872, flow: 'changelog'},
    {id: 'nimbus-email', title: 'Nimbus email: Welcome to Nimbus', src: '/assets/_system/sample-work/nimbus-email.webp', kind: 'email', brand: 'nimbus', ratio: 1.4884},
    {id: 'nimbus-event-page', title: 'Nimbus Live 2026 registration page', src: '/assets/_system/sample-work/nimbus-event-page.webp', kind: 'event', brand: 'nimbus', ratio: 1.7872},
    {id: 'nimbus-event', title: 'Nimbus Live 2026 event card', src: '/assets/_system/sample-work/nimbus-event.webp', kind: 'event', brand: 'nimbus', ratio: 1.25},
    {id: 'nimbus-landing', title: 'Nimbus landing page', src: '/assets/_system/sample-work/nimbus-landing.webp', kind: 'landing', brand: 'nimbus', ratio: 0.5595},
    {id: 'nimbus-social-linkedin', title: 'Nimbus LinkedIn announcement: We raised our Series B', src: '/assets/_system/sample-work/nimbus-social-linkedin.webp', kind: 'social', brand: 'nimbus', ratio: 0.5595, platform: 'linkedin'},
    {id: 'oliva-email-recipes', title: 'Oliva Terra newsletter: Three autumn suppers', src: '/assets/_system/sample-work/oliva-email-recipes.webp', kind: 'email', brand: 'oliva', ratio: 1.7872, flow: 'recipes'},
    {id: 'oliva-email', title: 'Oliva Terra email: The new harvest is here', src: '/assets/_system/sample-work/oliva-email.webp', kind: 'email', brand: 'oliva', ratio: 1.4884},
    {id: 'oliva-event-menu', title: 'Oliva Terra dinner menu: Harvest Supper', src: '/assets/_system/sample-work/oliva-event-menu.webp', kind: 'event', brand: 'oliva', ratio: 1.4884},
    {id: 'oliva-landing', title: 'Oliva Terra landing page', src: '/assets/_system/sample-work/oliva-landing.webp', kind: 'landing', brand: 'oliva', ratio: 0.5595},
    {id: 'oliva-social-pinterest', title: 'Oliva Terra Pinterest pin: Olive oil focaccia', src: '/assets/_system/sample-work/oliva-social-pinterest.webp', kind: 'social', brand: 'oliva', ratio: 1.4884, platform: 'pinterest'},
    {id: 'oliva-social-x', title: 'Oliva Terra X card: Harvest 2026 is in the bottle', src: '/assets/_system/sample-work/oliva-social-x.webp', kind: 'social', brand: 'oliva', ratio: 0.5595, platform: 'x'},
    {id: 'oliva-social', title: 'Oliva Terra Instagram post: The first press', src: '/assets/_system/sample-work/oliva-social.webp', kind: 'social', brand: 'oliva', ratio: 1.25, platform: 'instagram'},
    {id: 'penny-blog-post', title: 'Penny blog: The founder\'s guide to runway', src: '/assets/_system/sample-work/penny-blog-post.webp', kind: 'blog', brand: 'penny', ratio: 1.7872, page: 'post'},
    {id: 'penny-email-product', title: 'Penny product email: Your money, on autopilot', src: '/assets/_system/sample-work/penny-email-product.webp', kind: 'email', brand: 'penny', ratio: 1.7872, flow: 'product'},
    {id: 'penny-event-webinar', title: 'Penny webinar slide: The founder\'s guide to runway', src: '/assets/_system/sample-work/penny-event-webinar.webp', kind: 'event', brand: 'penny', ratio: 0.5595},
    {id: 'penny-social-linkedin', title: 'Penny LinkedIn post: 2 days to close your books', src: '/assets/_system/sample-work/penny-social-linkedin.webp', kind: 'social', brand: 'penny', ratio: 1.0, platform: 'linkedin'},
    {id: 'volt-blog-index', title: 'Volt Run blog home: The Run Journal', src: '/assets/_system/sample-work/volt-blog-index.webp', kind: 'blog', brand: 'volt', ratio: 0.5595, page: 'index'},
    {id: 'volt-email-recap', title: 'Volt Run email: Your year in miles', src: '/assets/_system/sample-work/volt-email-recap.webp', kind: 'email', brand: 'volt', ratio: 1.7872, flow: 'recap'},
    {id: 'volt-email', title: 'Volt Run email: Your new pair just dropped', src: '/assets/_system/sample-work/volt-email.webp', kind: 'email', brand: 'volt', ratio: 1.4884},
    {id: 'volt-event-bib', title: 'Volt Run race bib: City Night 10K', src: '/assets/_system/sample-work/volt-event-bib.webp', kind: 'event', brand: 'volt', ratio: 1.25},
    {id: 'volt-landing', title: 'Volt Run landing page', src: '/assets/_system/sample-work/volt-landing.webp', kind: 'landing', brand: 'volt', ratio: 0.5595},
    {id: 'volt-social-story', title: 'Volt Run Instagram story: Drops Friday', src: '/assets/_system/sample-work/volt-social-story.webp', kind: 'social', brand: 'volt', ratio: 1.7872, platform: 'story'},
    {id: 'volt-social', title: 'Volt Run Instagram post: Run it back', src: '/assets/_system/sample-work/volt-social.webp', kind: 'social', brand: 'volt', ratio: 1.25, platform: 'instagram'},
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
          && (!opts.platforms || !opts.platforms.length || opts.platforms.indexOf(w.platform) >= 0)
          && (!opts.flows || !opts.flows.length || opts.flows.indexOf(w.flow) >= 0);
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
