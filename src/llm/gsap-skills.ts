/**
 * GSAP Animation Skills
 *
 * Curated from GSAP's official skills (greensock/gsap-skills)
 * and our own video production best practices.
 * Injected into the component generator prompt.
 */

export const GSAP_ANIMATION_SKILLS = `
## GSAP Animation Reference

### Easing Guide
Use easing to make animations feel natural. Never use "none" (linear) for element entrances/exits.

**Recommended eases by use case:**
- Entrance (elements appearing): \`power3.out\` or \`back.out(1.2)\`
- Exit (elements disappearing): \`power2.in\`
- Emphasis (attention-grabbing): \`elastic.out(1, 0.3)\` or \`bounce.out\`
- Smooth movement: \`power2.inOut\`
- Cinematic/dramatic: \`power4.out\`
- Snappy/punchy: \`back.out(1.7)\`
- Subtle: \`power1.out\`

**Custom easing with GSAP:**
\`\`\`javascript
// If needed, register CustomEase (it's free)
// gsap.registerPlugin(CustomEase);
// CustomEase.create("myEase", "M0,0 C0.126,0.382 0.282,1.158 0.5,1.158 0.718,1.158 0.874,0.382 1,0");
\`\`\`

### Stagger Patterns
Stagger creates cascading animations. Essential for lists, grids, and multi-element reveals.

\`\`\`javascript
// Basic stagger (each element 0.1s after previous)
tl.to(items, { autoAlpha: 1, y: 0, stagger: 0.1 });

// Stagger from center outward
tl.to(items, { autoAlpha: 1, stagger: { each: 0.08, from: "center" } });

// Stagger with random order
tl.to(items, { autoAlpha: 1, stagger: { each: 0.1, from: "random" } });

// Grid stagger (for grid layouts)
tl.to(gridItems, { autoAlpha: 1, stagger: { grid: [rows, cols], from: "center", amount: 0.5 } });
\`\`\`

### autoAlpha (Critical)
Always use \`autoAlpha\` instead of \`opacity\` alone. It sets \`visibility: hidden\` when opacity is 0, preventing invisible elements from blocking clicks.

\`\`\`javascript
// GOOD: uses autoAlpha
gsap.set(el, { autoAlpha: 0 });
tl.to(el, { autoAlpha: 1 });

// BAD: element stays interactive even when invisible
gsap.set(el, { opacity: 0 });
\`\`\`

### Timeline Position Parameter
Control when animations start relative to each other:

\`\`\`javascript
tl.to(a, { x: 100 })           // starts after previous ends
  .to(b, { y: 50 }, "-=0.3")   // starts 0.3s BEFORE previous ends (overlap)
  .to(c, { scale: 2 }, "<")    // starts at SAME TIME as previous
  .to(d, { rotation: 90 }, "<0.1") // starts 0.1s after previous STARTS
  .to(e, { autoAlpha: 0 }, 2.5);   // starts at absolute time 2.5s
\`\`\`

Use \`"<"\` for parallel animations. Use \`"-=0.2"\` for overlapping sequences (most natural feel).

### Timeline Defaults
Set defaults to avoid repeating the same duration/ease:

\`\`\`javascript
var tl = gsap.timeline({
  defaults: { duration: 0.6, ease: "power3.out" }
});
// All children inherit duration: 0.6 and ease: power3.out
tl.to(a, { autoAlpha: 1 })
  .to(b, { y: 0 });
\`\`\`

### SplitText (Text Animation)
Split text into characters, words, or lines for per-element animation.
SplitText is FREE (included in gsap package).

\`\`\`javascript
// Note: SplitText must be loaded. In our system, it's available if
// we include it in the GSAP vendor bundle.
// var split = new SplitText(el, { type: "words,chars" });
// tl.from(split.chars, { autoAlpha: 0, y: 20, stagger: 0.02, ease: "power2.out" });
\`\`\`

For now, implement text splitting manually:
\`\`\`javascript
// Manual word splitting
var text = el.querySelector('.text');
var words = text.textContent.split(' ');
text.innerHTML = '';
words.forEach(function(word) {
  var span = document.createElement('span');
  span.textContent = word + ' ';
  span.style.display = 'inline-block';
  text.appendChild(span);
});
tl.from(text.querySelectorAll('span'), {
  autoAlpha: 0, y: 30, stagger: 0.06, ease: "power3.out"
}, 0.3);
\`\`\`

### Performance Rules
- Animate \`x\`, \`y\`, \`scale\`, \`rotation\`, \`autoAlpha\` (GPU-accelerated transforms + opacity)
- AVOID animating \`width\`, \`height\`, \`top\`, \`left\`, \`margin\`, \`padding\` (cause layout thrashing)
- Use \`gsap.set()\` for initial states, not CSS
- Use \`will-change: transform\` in CSS for frequently animated elements

### Number Counter Animation
Animate a number counting up (for stat cards, metrics):

\`\`\`javascript
var counter = { val: 0 };
var target = data.value;
var display = el.querySelector('.number');
tl.to(counter, {
  val: target,
  duration: 1.5,
  ease: "power2.out",
  onUpdate: function() {
    display.textContent = Math.round(counter.val).toLocaleString();
  }
}, 0.3);
\`\`\`

### SVG Drawing Effect
Draw an SVG path on-screen:

\`\`\`javascript
var path = el.querySelector('path');
var length = path.getTotalLength();
gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
tl.to(path, { strokeDashoffset: 0, duration: 2, ease: "power2.inOut" });
\`\`\`

### Motion Style Adaptation
Always respect ctx.motion to match the user's preference:

\`\`\`javascript
var speed = ctx.motion === 'minimal' ? 0.3 : ctx.motion === 'punchy' ? 0.5 : 0.7;
var stagger = ctx.motion === 'minimal' ? 0.05 : ctx.motion === 'punchy' ? 0.08 : 0.12;
var ease = ctx.motion === 'punchy' ? 'back.out(1.4)' : 'power3.out';
var exitEase = 'power2.in';
\`\`\`

### MorphSVG (SVG Shape Morphing)
Morph between SVG paths:
\`\`\`javascript
gsap.to("#circle", { morphSVG: "#star", duration: 1, ease: "power2.inOut" });
\`\`\`

### DrawSVG (SVG Path Drawing)
Animate SVG stroke drawing:
\`\`\`javascript
gsap.from("path", { drawSVG: "0%", duration: 2, ease: "power2.inOut" });
// Partial draw:
gsap.to("path", { drawSVG: "20% 80%", duration: 1 });
\`\`\`

### ScrambleText (Text Decode Effect)
Scramble/decode text like a terminal or cipher:
\`\`\`javascript
gsap.to(".text", { scrambleText: { text: "REVEALED", chars: "XO@#", speed: 0.3 }, duration: 1 });
\`\`\`

### Standard Animation Pattern
Every component should follow this structure:

\`\`\`javascript
function createTimeline(el, data, ctx) {
  var tl = gsap.timeline();

  // 1. Query DOM elements
  var title = el.querySelector('.title');
  var items = el.querySelectorAll('.item');

  // 2. Set initial states (invisible)
  gsap.set([title, items], { autoAlpha: 0, y: 30 });

  // 3. Determine speed from motion style
  var speed = ctx.motion === 'minimal' ? 0.3 : ctx.motion === 'punchy' ? 0.5 : 0.7;

  // 4. Entrance animation (starts at 0.2-0.4s)
  tl.to(title, { autoAlpha: 1, y: 0, duration: speed, ease: 'power3.out' }, 0.3);
  tl.to(items, { autoAlpha: 1, y: 0, stagger: 0.1, duration: speed * 0.8, ease: 'power3.out' }, '-=0.2');

  // 5. Hold (content stays visible)

  // 6. Exit animation (starts before ctx.duration ends)
  if (ctx.duration > 2) {
    var exitAt = ctx.duration - 0.6;
    tl.to([title, items], { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, exitAt);
  }

  return tl;
}
\`\`\`

### Shared Utilities (available globally in every component)

**Spring Physics Presets:**
Use the global \`SPRING\` object for natural motion:
\`\`\`javascript
tl.to(el, { y: 0, ...SPRING.bouncy });  // elastic.out(1, 0.3)
tl.to(el, { scale: 1, ...SPRING.stiff });  // back.out(1.7)
tl.to(el, { x: 0, ...SPRING.gentle });  // power3.out
tl.to(el, { y: 0, ...SPRING.snappy });  // back.out(1.2)
tl.to(el, { scale: 1, ...SPRING.wobbly });  // elastic.out(0.8, 0.4)
\`\`\`

**Text Emphasis Effects:**
\`\`\`javascript
// Animated highlight behind text (like a marker pen)
highlightDraw(tl, element, at, duration, color);
// Example: highlightDraw(tl, el.querySelector('.keyword'), 2.0, 0.5, 'rgba(167,139,250,0.3)');

// Hand-drawn circle annotation around text
circleAnnotation(tl, element, at, duration, color);

// Animated underline
underlineDraw(tl, element, at, duration, color);
\`\`\`

**Parallax Depth:**
\`\`\`javascript
// Create layers that move at different speeds for depth
var layers = createParallaxLayers(container, [
  { selector: '.bg-element', depth: 0.2 },   // slow (background)
  { selector: '.mid-element', depth: 0.5 },   // medium
  { selector: '.fg-element', depth: 1.0 },    // fast (foreground)
]);
animateParallax(tl, layers, 'horizontal', 50, 3.0, 0.5);
\`\`\`

### MorphSVG (SVG Shape Morphing)
\`\`\`javascript
gsap.to('#circle', { morphSVG: '#star', duration: 1, ease: 'power2.inOut' });
\`\`\`

### DrawSVG (SVG Path Drawing)
\`\`\`javascript
gsap.from('path', { drawSVG: '0%', duration: 2, ease: 'power2.inOut' });
// Partial draw:
gsap.to('path', { drawSVG: '20% 80%', duration: 1 });
\`\`\`

### ScrambleText (Text Decode/Cipher Effect)
\`\`\`javascript
gsap.to('.text', { scrambleText: { text: 'REVEALED', chars: 'XO@#', speed: 0.3 }, duration: 1 });
\`\`\`

### Film Polish Options
The film-polish component supports color grading:
\`\`\`json
{ "type": "film-polish", "data": { "vignette": 0.08, "grain": 0.04, "color_grade": "warm" } }
\`\`\`
Grades: \"warm\" (orange tint), \"cool\" (blue tint), \"vintage\" (desaturated warm), \"none\"
`;
