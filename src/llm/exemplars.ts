/**
 * Component Exemplars
 *
 * Hand-crafted reference components injected into the component generator
 * prompt as few-shot examples. These set the quality bar for generated output.
 *
 * Organized by scene archetype so the generator can match patterns to intent.
 */

// ── Shared patterns doc ─────────────────────────────────────────────
export const EXEMPLAR_PATTERNS = `
## Universal Component Patterns

Master these before writing any component:

### Lifecycle
1. Populate DOM from \`data\` (textContent, innerHTML, src, etc.)
2. Set initial states with \`gsap.set()\` — everything hidden/offset
3. Build entrance timeline keyed to \`ctx.motion\`
4. If \`ctx.duration > 2\`, add exit animations at \`ctx.duration - 0.7\`
5. Return the timeline

### Motion Tiers
- \`ctx.motion === 'minimal'\`: subtle fades, small y offsets (10-15px), short durations
- \`ctx.motion === 'cinematic'\`: dramatic reveals, blur-to-sharp, scale shifts, stagger cascades
- \`ctx.motion === 'punchy'\`: elastic/back easing, snap-in, slight overshoot

### Text Hierarchy
- One \`<h1>\` per scene, 64-100px, weight 700-800, tight letter-spacing (-0.03em)
- Subtitles 22-32px, weight 400, wider line-height (1.4)
- Badges/labels 12-14px, weight 600, letter-spacing 0.12-0.16em, uppercase
- Use \`:empty { display: none }\` on every optional text element

### Color System
- Background: \`var(--mp-color-background, #0f172a)\`
- Surface: \`var(--mp-color-surface, #1e293b)\`
- Text: \`var(--mp-color-text, #ffffff)\`
- Primary: \`var(--mp-color-primary, #6366f1)\`
- Accent: \`var(--mp-color-accent, #10b981)\`
- Muted: \`var(--mp-color-text-muted, #64748b)\`

### Premium Touches
- Use \`autoAlpha\` (never raw \`opacity\`) so GSAP handles \`visibility\`
- SplitText for headline character reveals when available
- Gradient text: \`background: linear-gradient(...); -webkit-background-clip: text; -webkit-text-fill-color: transparent;\`
- Glassmorphism: \`backdrop-filter: blur(12px); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);\`
- Subtle glow: \`box-shadow: 0 0 60px rgba(99,102,241,0.15);\`
- Film grain / noise overlay for cinematic depth
- Animate \`filter: blur()\` from 6px to 0 on reveals for focus-pull effect
`;

// ── Individual exemplar components ──────────────────────────────────

const EXEMPLAR_TITLE_SLIDE = `
### Exemplar: title-slide (hero opener, SplitText cascade, focus-pull)

\\\`\\\`\\\`html
<template>
  <div class="title-slide">
    <div class="title-content">
      <span class="badge"></span>
      <h1 class="title"></h1>
      <p class="subtitle"></p>
    </div>
  </div>
</template>

<style scoped>
  .title-slide {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 80px;
    font-family: var(--mp-font-family, 'Inter', system-ui, -apple-system, sans-serif);
  }

  .title-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 85%;
  }

  .badge {
    display: inline-block;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mp-color-accent, #A78BFA);
    background: linear-gradient(135deg, rgba(167, 139, 250, 0.12) 0%, rgba(139, 92, 246, 0.06) 100%);
    border: 1px solid rgba(167, 139, 250, 0.18);
    padding: 10px 24px;
    border-radius: 999px;
    margin-bottom: 36px;
    backdrop-filter: blur(8px);
  }

  .badge:empty { display: none; }

  .title {
    font-size: 76px;
    font-weight: 700;
    color: var(--mp-color-text, #ffffff);
    margin: 0;
    line-height: 1.05;
    letter-spacing: -0.025em;
    max-width: 90%;
  }

  .subtitle {
    font-size: 26px;
    font-weight: 400;
    color: #cbd5e1;
    margin-top: 28px;
    line-height: 1.4;
    max-width: 70%;
  }

  .subtitle:empty { display: none; }
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    var badge = el.querySelector('.badge');
    var titleEl = el.querySelector('.title');
    var subtitle = el.querySelector('.subtitle');

    if (data.badge) badge.textContent = data.badge;
    if (data.title) titleEl.textContent = data.title;
    if (data.subtitle) subtitle.textContent = data.subtitle;

    var elements = [];
    if (badge && badge.textContent) elements.push(badge);
    if (titleEl && titleEl.textContent) elements.push(titleEl);
    if (subtitle && subtitle.textContent) elements.push(subtitle);

    gsap.set(elements, { autoAlpha: 0 });
    if (badge && badge.textContent) gsap.set(badge, { scale: 0.9, y: 15 });
    if (titleEl && titleEl.textContent) gsap.set(titleEl, { scale: 1.08, y: 20, filter: 'blur(6px)' });
    if (subtitle && subtitle.textContent) gsap.set(subtitle, { y: 20 });

    var speed = ctx.motion === 'minimal' ? 0.4 : ctx.motion === 'punchy' ? 0.6 : 0.9;
    var t = 0.3;

    if (badge && badge.textContent) {
      tl.to(badge, { autoAlpha: 1, scale: 1, y: 0, duration: speed * 0.7, ease: 'power3.out' }, t);
      t += speed * 0.3;
    }

    if (titleEl && titleEl.textContent) {
      if (typeof SplitText !== 'undefined' && titleEl.textContent.length > 0) {
        var splitTitle = new SplitText(titleEl, { type: 'chars' });
        gsap.set(splitTitle.chars, { autoAlpha: 0, y: 20, scale: 0.9 });
        gsap.set(titleEl, { autoAlpha: 1, scale: 1, filter: 'blur(0px)' });
        tl.to(splitTitle.chars, { autoAlpha: 1, y: 0, scale: 1, stagger: 0.02, duration: speed * 0.7, ease: 'power3.out' }, t);
      } else {
        tl.to(titleEl, { autoAlpha: 1, scale: 1, y: 0, filter: 'blur(0px)', duration: speed, ease: 'power3.out' }, t);
      }
      t += speed * 0.4;
    }

    if (subtitle && subtitle.textContent) {
      tl.to(subtitle, { autoAlpha: 1, y: 0, duration: speed * 0.7, ease: 'power2.out' }, t);
    }

    if (ctx.duration > 2) {
      var exitStart = ctx.duration - 0.7;
      tl.to(elements, { autoAlpha: 0, y: -15, duration: 0.5, stagger: 0.04, ease: 'power2.in' }, exitStart);
    }

    return tl;
  }
</script>
\\\`\\\`\\\`
`;

const EXEMPLAR_STAT_CARD = `
### Exemplar: stat-card (counter animation, gradient text, elastic entrance)

\\\`\\\`\\\`html
<template>
  <div class="stat-card">
    <div class="stat-number-wrap">
      <span class="stat-prefix"></span>
      <span class="stat-number">0</span>
      <span class="stat-suffix"></span>
    </div>
    <div class="stat-label"></div>
  </div>
</template>

<style scoped>
  .stat-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 80px;
    font-family: var(--mp-font-family, 'Inter', system-ui, sans-serif);
    position: relative;
  }

  .stat-number-wrap {
    display: flex;
    align-items: baseline;
    gap: 4px;
    position: relative;
  }

  .stat-number {
    font-size: 160px;
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    background: linear-gradient(135deg, #ffffff 0%, var(--mp-color-accent, #A78BFA) 50%, #c4b5fd 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .stat-prefix, .stat-suffix {
    font-size: 100px;
    font-weight: 300;
    line-height: 1;
    background: linear-gradient(135deg, var(--mp-color-accent, #A78BFA) 0%, #c4b5fd 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .stat-prefix:empty, .stat-suffix:empty { display: none; }

  .stat-label {
    font-size: 20px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-top: 36px;
  }

  .stat-label:empty { display: none; }
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    var numberEl = el.querySelector('.stat-number');
    var prefixEl = el.querySelector('.stat-prefix');
    var suffixEl = el.querySelector('.stat-suffix');
    var labelEl = el.querySelector('.stat-label');
    var wrap = el.querySelector('.stat-number-wrap');

    if (data.prefix) prefixEl.textContent = data.prefix;
    if (data.suffix) suffixEl.textContent = data.suffix;
    if (data.label) labelEl.textContent = data.label;

    var targetValue = data.value || 0;
    var decimals = data.decimals !== undefined ? data.decimals : 0;

    gsap.set([wrap, labelEl], { autoAlpha: 0 });
    gsap.set(wrap, { scale: 0.8, y: 40 });
    gsap.set(labelEl, { y: 20 });

    var speed = ctx.motion === 'minimal' ? 0.5 : ctx.motion === 'punchy' ? 0.7 : 1.0;

    tl.to(wrap, { autoAlpha: 1, scale: 1, y: 0, duration: speed, ease: ctx.motion === 'punchy' ? 'back.out(1.3)' : 'power3.out' }, 0.3);

    var counter = { val: 0 };
    tl.to(counter, {
      val: targetValue, duration: speed * 1.8, ease: 'power2.out',
      onUpdate: function() {
        numberEl.textContent = decimals > 0 ? counter.val.toFixed(decimals) : Math.round(counter.val).toLocaleString();
      }
    }, 0.3);

    tl.to(labelEl, { autoAlpha: 1, y: 0, duration: speed * 0.5, ease: 'power2.out' }, 0.3 + speed * 0.6);

    if (ctx.duration > 2) {
      var exitAt = ctx.duration - 0.7;
      tl.to([wrap, labelEl], { autoAlpha: 0, y: -25, duration: 0.4, stagger: 0.05, ease: 'power2.in' }, exitAt);
    }

    return tl;
  }
</script>
\\\`\\\`\\\`
`;

const EXEMPLAR_FEATURE_GRID = `
### Exemplar: feature-grid (glassmorphic cards, staggered cascade, icon accent)

\\\`\\\`\\\`html
<template>
  <div class="feature-grid">
    <h2 class="grid-headline"></h2>
    <div class="grid"></div>
  </div>
</template>

<style scoped>
  .feature-grid {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 80px 100px;
    font-family: var(--mp-font-family, 'Inter', system-ui, sans-serif);
  }

  .grid-headline {
    font-size: 48px;
    font-weight: 700;
    color: var(--mp-color-text, #ffffff);
    letter-spacing: -0.02em;
    margin: 0 0 48px 0;
    text-align: center;
    max-width: 80%;
  }

  .grid-headline:empty { display: none; }

  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    width: 100%;
    max-width: 1400px;
  }

  .card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 36px 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    background: linear-gradient(135deg, var(--mp-color-primary, #6366f1) 0%, var(--mp-color-accent, #10b981) 100%);
    margin-bottom: 4px;
    flex-shrink: 0;
  }

  .card-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--mp-color-text, #ffffff);
    letter-spacing: -0.01em;
  }

  .card-desc {
    font-size: 15px;
    font-weight: 400;
    color: var(--mp-color-text-muted, #94a3b8);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    var headline = el.querySelector('.grid-headline');
    var grid = el.querySelector('.grid');

    if (data.headline) headline.textContent = data.headline;

    var items = data.items || [];
    items.forEach(function(item) {
      var card = document.createElement('div');
      card.className = 'card';
      var icon = document.createElement('div');
      icon.className = 'card-icon';
      icon.textContent = item.icon || '✦';
      var title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = item.title || '';
      var desc = document.createElement('div');
      desc.className = 'card-desc';
      desc.textContent = item.description || '';
      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(desc);
      grid.appendChild(card);
    });

    var cards = grid.querySelectorAll('.card');
    gsap.set(headline, { autoAlpha: 0, y: 20 });
    gsap.set(cards, { autoAlpha: 0, y: 30, scale: 0.95 });

    var speed = ctx.motion === 'minimal' ? 0.4 : ctx.motion === 'punchy' ? 0.55 : 0.7;

    tl.to(headline, { autoAlpha: 1, y: 0, duration: speed, ease: 'power3.out' }, 0.2);
    tl.to(cards, {
      autoAlpha: 1, y: 0, scale: 1,
      stagger: { each: 0.08, from: 'start' },
      duration: speed * 0.8,
      ease: ctx.motion === 'punchy' ? 'back.out(1.2)' : 'power3.out'
    }, 0.4);

    if (ctx.duration > 3) {
      var exitAt = ctx.duration - 0.8;
      tl.to(cards, { autoAlpha: 0, y: -20, stagger: 0.04, duration: 0.4, ease: 'power2.in' }, exitAt);
      tl.to(headline, { autoAlpha: 0, y: -15, duration: 0.3, ease: 'power2.in' }, exitAt + 0.1);
    }

    return tl;
  }
</script>
\\\`\\\`\\\`
`;

const EXEMPLAR_PRODUCT_SHOWCASE = `
### Exemplar: product-showcase (browser frame, layered depth, glow accent)

\\\`\\\`\\\`html
<template>
  <div class="showcase">
    <div class="showcase-text">
      <span class="showcase-badge"></span>
      <h2 class="showcase-title"></h2>
      <p class="showcase-desc"></p>
    </div>
    <div class="showcase-frame">
      <div class="frame-chrome">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
      <div class="frame-viewport"></div>
    </div>
  </div>
</template>

<style scoped>
  .showcase {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 64px;
    width: 100%;
    height: 100%;
    padding: 80px 100px;
    font-family: var(--mp-font-family, 'Inter', system-ui, sans-serif);
  }

  .showcase-text {
    flex: 0 0 38%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .showcase-badge {
    display: inline-block;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mp-color-primary, #6366f1);
    align-self: flex-start;
  }

  .showcase-badge:empty { display: none; }

  .showcase-title {
    font-size: 44px;
    font-weight: 700;
    color: var(--mp-color-text, #ffffff);
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin: 0;
    max-width: 100%;
  }

  .showcase-desc {
    font-size: 18px;
    font-weight: 400;
    color: var(--mp-color-text-muted, #94a3b8);
    line-height: 1.5;
    max-width: 95%;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .showcase-desc:empty { display: none; }

  .showcase-frame {
    flex: 0 0 52%;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 80px rgba(99, 102, 241, 0.12), 0 24px 48px rgba(0, 0, 0, 0.3);
    position: relative;
  }

  .frame-chrome {
    background: #1a1a2e;
    padding: 12px 16px;
    display: flex;
    gap: 8px;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
  }

  .frame-viewport {
    background: #0f172a;
    min-height: 360px;
    padding: 32px;
    color: #e2e8f0;
    font-size: 14px;
    line-height: 1.6;
    overflow: hidden;
  }
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    var badge = el.querySelector('.showcase-badge');
    var title = el.querySelector('.showcase-title');
    var desc = el.querySelector('.showcase-desc');
    var frame = el.querySelector('.showcase-frame');
    var viewport = el.querySelector('.frame-viewport');

    if (data.badge) badge.textContent = data.badge;
    if (data.title) title.textContent = data.title;
    if (data.description) desc.textContent = data.description;
    if (data.content_html) viewport.innerHTML = data.content_html;

    var textEls = [badge, title, desc].filter(function(e) { return e && e.textContent; });
    gsap.set(textEls, { autoAlpha: 0, x: -30 });
    gsap.set(frame, { autoAlpha: 0, x: 40, scale: 0.96 });

    var speed = ctx.motion === 'minimal' ? 0.5 : ctx.motion === 'punchy' ? 0.7 : 1.0;

    tl.to(textEls, {
      autoAlpha: 1, x: 0,
      stagger: 0.12,
      duration: speed * 0.8,
      ease: 'power3.out'
    }, 0.3);

    tl.to(frame, {
      autoAlpha: 1, x: 0, scale: 1,
      duration: speed,
      ease: 'power3.out'
    }, 0.5);

    if (ctx.duration > 3) {
      var exitAt = ctx.duration - 0.8;
      tl.to(frame, { autoAlpha: 0, x: 30, scale: 0.97, duration: 0.5, ease: 'power2.in' }, exitAt);
      tl.to(textEls, { autoAlpha: 0, x: -20, stagger: 0.04, duration: 0.4, ease: 'power2.in' }, exitAt + 0.1);
    }

    return tl;
  }
</script>
\\\`\\\`\\\`
`;

const EXEMPLAR_QUOTE = `
### Exemplar: quote-card (testimonial, oversized quotation mark, subtle float)

\\\`\\\`\\\`html
<template>
  <div class="quote-card">
    <div class="quote-mark">"</div>
    <blockquote class="quote-text"></blockquote>
    <div class="quote-attribution">
      <div class="quote-author"></div>
      <div class="quote-role"></div>
    </div>
  </div>
</template>

<style scoped>
  .quote-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 100px 160px;
    font-family: var(--mp-font-family, 'Inter', system-ui, sans-serif);
    text-align: center;
    position: relative;
  }

  .quote-mark {
    font-size: 180px;
    font-weight: 800;
    line-height: 0.6;
    background: linear-gradient(135deg, var(--mp-color-primary, #6366f1) 0%, var(--mp-color-accent, #10b981) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    opacity: 0.3;
    margin-bottom: 16px;
    user-select: none;
  }

  .quote-text {
    font-size: 32px;
    font-weight: 500;
    color: var(--mp-color-text, #ffffff);
    line-height: 1.4;
    letter-spacing: -0.01em;
    margin: 0;
    max-width: 85%;
    font-style: italic;
  }

  .quote-attribution {
    margin-top: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .quote-author {
    font-size: 18px;
    font-weight: 600;
    color: var(--mp-color-text, #ffffff);
  }

  .quote-author:empty { display: none; }

  .quote-role {
    font-size: 14px;
    font-weight: 400;
    color: var(--mp-color-text-muted, #94a3b8);
  }

  .quote-role:empty { display: none; }
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    var mark = el.querySelector('.quote-mark');
    var text = el.querySelector('.quote-text');
    var author = el.querySelector('.quote-author');
    var role = el.querySelector('.quote-role');
    var attrib = el.querySelector('.quote-attribution');

    if (data.quote) text.textContent = data.quote;
    if (data.author) author.textContent = data.author;
    if (data.role) role.textContent = data.role;

    gsap.set(mark, { autoAlpha: 0, scale: 0.7, y: 20 });
    gsap.set(text, { autoAlpha: 0, y: 25 });
    gsap.set(attrib, { autoAlpha: 0, y: 15 });

    var speed = ctx.motion === 'minimal' ? 0.4 : ctx.motion === 'punchy' ? 0.6 : 0.9;

    tl.to(mark, { autoAlpha: 0.3, scale: 1, y: 0, duration: speed * 0.7, ease: 'power3.out' }, 0.2);
    tl.to(text, { autoAlpha: 1, y: 0, duration: speed, ease: 'power3.out' }, 0.4);
    tl.to(attrib, { autoAlpha: 1, y: 0, duration: speed * 0.6, ease: 'power2.out' }, 0.7);

    // Subtle float while visible
    if (ctx.duration > 3) {
      tl.to(text, { y: -4, duration: 2, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 1.2);
    }

    if (ctx.duration > 2) {
      var exitAt = ctx.duration - 0.7;
      tl.to([attrib, text, mark], { autoAlpha: 0, y: -15, stagger: 0.06, duration: 0.4, ease: 'power2.in' }, exitAt);
    }

    return tl;
  }
</script>
\\\`\\\`\\\`
`;

const EXEMPLAR_CTA = `
### Exemplar: cta-scene (call-to-action, pulsing button, converging entrance)

\\\`\\\`\\\`html
<template>
  <div class="cta-scene">
    <h2 class="cta-headline"></h2>
    <p class="cta-sub"></p>
    <div class="cta-button-wrap">
      <div class="cta-button"></div>
    </div>
  </div>
</template>

<style scoped>
  .cta-scene {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 80px;
    font-family: var(--mp-font-family, 'Inter', system-ui, sans-serif);
    text-align: center;
  }

  .cta-headline {
    font-size: 56px;
    font-weight: 700;
    color: var(--mp-color-text, #ffffff);
    letter-spacing: -0.025em;
    margin: 0;
    line-height: 1.1;
    max-width: 75%;
  }

  .cta-sub {
    font-size: 22px;
    font-weight: 400;
    color: var(--mp-color-text-muted, #94a3b8);
    margin-top: 20px;
    max-width: 60%;
    line-height: 1.4;
  }

  .cta-sub:empty { display: none; }

  .cta-button-wrap {
    margin-top: 40px;
    position: relative;
  }

  .cta-button {
    display: inline-block;
    padding: 16px 40px;
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;
    background: linear-gradient(135deg, var(--mp-color-primary, #6366f1) 0%, #8b5cf6 100%);
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(99, 102, 241, 0.35);
    cursor: pointer;
    position: relative;
    letter-spacing: 0.01em;
  }

  .cta-button:empty { display: none; }
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    var headline = el.querySelector('.cta-headline');
    var sub = el.querySelector('.cta-sub');
    var btn = el.querySelector('.cta-button');

    if (data.headline) headline.textContent = data.headline;
    if (data.subtext) sub.textContent = data.subtext;
    if (data.button_text) btn.textContent = data.button_text;

    gsap.set(headline, { autoAlpha: 0, y: 30, scale: 1.05 });
    gsap.set(sub, { autoAlpha: 0, y: 20 });
    gsap.set(btn, { autoAlpha: 0, y: 20, scale: 0.9 });

    var speed = ctx.motion === 'minimal' ? 0.4 : ctx.motion === 'punchy' ? 0.6 : 0.8;

    tl.to(headline, { autoAlpha: 1, y: 0, scale: 1, duration: speed, ease: 'power3.out' }, 0.3);
    tl.to(sub, { autoAlpha: 1, y: 0, duration: speed * 0.7, ease: 'power2.out' }, 0.6);
    tl.to(btn, { autoAlpha: 1, y: 0, scale: 1, duration: speed * 0.7, ease: 'back.out(1.4)' }, 0.8);

    // Gentle pulse on button
    tl.to(btn, { boxShadow: '0 4px 40px rgba(99,102,241,0.55)', duration: 0.8, ease: 'sine.inOut', yoyo: true, repeat: -1 }, 1.2);

    if (ctx.duration > 2) {
      var exitAt = ctx.duration - 0.6;
      tl.to([btn, sub, headline], { autoAlpha: 0, y: -15, stagger: 0.05, duration: 0.4, ease: 'power2.in' }, exitAt);
    }

    return tl;
  }
</script>
\\\`\\\`\\\`
`;

const EXEMPLAR_COMPARISON = `
### Exemplar: comparison-split (before/after, diagonal wipe reveal)

\\\`\\\`\\\`html
<template>
  <div class="comparison">
    <div class="comp-side comp-left">
      <div class="comp-label"></div>
      <div class="comp-content"></div>
    </div>
    <div class="comp-divider"></div>
    <div class="comp-side comp-right">
      <div class="comp-label"></div>
      <div class="comp-content"></div>
    </div>
  </div>
</template>

<style scoped>
  .comparison {
    display: flex;
    align-items: stretch;
    width: 100%;
    height: 100%;
    font-family: var(--mp-font-family, 'Inter', system-ui, sans-serif);
    position: relative;
    overflow: hidden;
  }

  .comp-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 60px;
    gap: 24px;
  }

  .comp-left {
    background: rgba(255, 255, 255, 0.02);
  }

  .comp-right {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%);
  }

  .comp-divider {
    width: 2px;
    background: linear-gradient(180deg, transparent 0%, var(--mp-color-primary, #6366f1) 30%, var(--mp-color-primary, #6366f1) 70%, transparent 100%);
    flex-shrink: 0;
  }

  .comp-label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mp-color-text-muted, #94a3b8);
    padding: 8px 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 999px;
  }

  .comp-content {
    font-size: 28px;
    font-weight: 600;
    color: var(--mp-color-text, #ffffff);
    text-align: center;
    max-width: 80%;
    line-height: 1.3;
  }
</style>

<script>
  function createTimeline(el, data, ctx) {
    var tl = gsap.timeline();
    var left = el.querySelector('.comp-left');
    var right = el.querySelector('.comp-right');
    var divider = el.querySelector('.comp-divider');
    var leftLabel = left.querySelector('.comp-label');
    var rightLabel = right.querySelector('.comp-label');
    var leftContent = left.querySelector('.comp-content');
    var rightContent = right.querySelector('.comp-content');

    if (data.left_label) leftLabel.textContent = data.left_label;
    if (data.right_label) rightLabel.textContent = data.right_label;
    if (data.left_content) leftContent.textContent = data.left_content;
    if (data.right_content) rightContent.textContent = data.right_content;

    gsap.set(left, { autoAlpha: 0, x: -60 });
    gsap.set(right, { autoAlpha: 0, x: 60 });
    gsap.set(divider, { scaleY: 0, transformOrigin: 'center top' });

    var speed = ctx.motion === 'minimal' ? 0.4 : ctx.motion === 'punchy' ? 0.6 : 0.8;

    tl.to(left, { autoAlpha: 1, x: 0, duration: speed, ease: 'power3.out' }, 0.3);
    tl.to(divider, { scaleY: 1, duration: speed * 0.8, ease: 'power2.inOut' }, 0.4);
    tl.to(right, { autoAlpha: 1, x: 0, duration: speed, ease: 'power3.out' }, 0.5);

    if (ctx.duration > 2) {
      var exitAt = ctx.duration - 0.7;
      tl.to([left, divider, right], { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, exitAt);
    }

    return tl;
  }
</script>
\\\`\\\`\\\`
`;

// ── Assembled export ────────────────────────────────────────────────

export const COMPONENT_EXEMPLARS = `
## Reference Component Exemplars

Study these hand-crafted components. Match their quality, patterns, and attention to detail.

${EXEMPLAR_PATTERNS}

${EXEMPLAR_TITLE_SLIDE}

${EXEMPLAR_STAT_CARD}

${EXEMPLAR_FEATURE_GRID}

${EXEMPLAR_PRODUCT_SHOWCASE}

${EXEMPLAR_QUOTE}

${EXEMPLAR_CTA}

${EXEMPLAR_COMPARISON}
`;
