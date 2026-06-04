/**
 * Component Exemplars
 *
 * Hand-crafted reference components injected into the component generator
 * prompt as few-shot examples. These set the quality bar for generated output.
 */

export const COMPONENT_EXEMPLARS = `
## Reference Examples

Study these hand-crafted components. Match their quality, patterns, and attention to detail.
Key patterns to absorb:
- Use \`:empty { display: none }\` for optional elements
- Set initial states with \`gsap.set()\`, animate with \`tl.to()\`
- Respect \`ctx.motion\` for speed scaling
- Add exit animations when \`ctx.duration > 2\`
- Use SplitText for character-level text reveals when available
- Build dynamic DOM in createTimeline when needed
- Use \`autoAlpha\` (not \`opacity\`) for show/hide so display is handled

### Example 1: title-slide (clean structure, SplitText, staggered entrance)

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

### Example 2: stat-card (counter animation, dynamic DOM, auto-scaling)

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
