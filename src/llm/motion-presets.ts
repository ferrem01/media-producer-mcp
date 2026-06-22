/**
 * Motion Preset Library (roadmap #2)
 *
 * The codegen invents GSAP motion from scratch each scene, which is the main
 * source of variance and the occasional janky/off result. This is a curated set
 * of named, vetted motion recipes the codegen is told to COMPOSE FROM (by name)
 * rather than improvise -- the same idea as HyperFrames' "pull animations from
 * the repo." Consistency + cinematic quality at the source.
 *
 * Each preset is a concrete GSAP recipe described in prose the codegen can apply.
 * Durations scale with ctx.motion (minimal < cinematic < punchy).
 */

export interface MotionPreset {
  name: string;
  /** entrance | emphasis | exit | background | transition */
  kind: string;
  /** One-line description of the motion. */
  desc: string;
  /** Concrete GSAP recipe (what to animate, from -> to, ease, timing). */
  recipe: string;
}

export const MOTION_PRESETS: MotionPreset[] = [
  // ── Entrances ──
  { name: "slam-in", kind: "entrance", desc: "heavy headline arrives with weight",
    recipe: "gsap.from(el, { y: 60, autoAlpha: 0, scale: 0.94, duration: 0.6, ease: 'back.out(1.4)' }). For per-character impact, SplitText the headline and stagger 0.025s." },
  { name: "fade-rise", kind: "entrance", desc: "calm, premium rise into place",
    recipe: "gsap.from(el, { y: 24, autoAlpha: 0, duration: 0.7, ease: 'power3.out' }). Good default for body text, subtitles, labels." },
  { name: "blur-reveal", kind: "entrance", desc: "soft focus-in (cinematic)",
    recipe: "gsap.from(el, { autoAlpha: 0, filter: 'blur(8px)', scale: 1.04, duration: 0.7, ease: 'power2.out' }). Great for hero images / logos." },
  { name: "stagger-cascade", kind: "entrance", desc: "a set of items arrives in sequence",
    recipe: "gsap.from(items, { y: 20, autoAlpha: 0, duration: 0.5, ease: 'power2.out', stagger: 0.08 }). Use for stat cards, lists, logo rows, grids." },
  { name: "draw-line", kind: "entrance", desc: "a connector/underline draws on",
    recipe: "gsap.fromTo(line, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.6, ease: 'power2.inOut' })." },

  // ── Emphasis ──
  { name: "count-up", kind: "emphasis", desc: "a number rolls up to its value",
    recipe: "Animate a {v:0} proxy to the target with gsap.to(proxy, { v: target, duration: 1.0, ease: 'power1.out', onUpdate: () => el.textContent = format(proxy.v) })." },
  { name: "pulse-glow", kind: "emphasis", desc: "a soft accent pulse to draw the eye",
    recipe: "gsap.to(el, { filter: 'drop-shadow(0 0 24px var(--mp-color-glow))', duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut' }). Use sparingly, once." },

  // ── Backgrounds (ambient, looping) ──
  { name: "ambient-drift", kind: "background", desc: "slow background motion so the frame never feels static",
    recipe: "gsap.to(bgLayer, { backgroundPosition: '+=40px +=20px', duration: ctx.duration, ease: 'none' }) or drift two large soft color blobs in opposite directions. Subtle -- it should breathe, not distract." },
  { name: "ken-burns", kind: "background", desc: "slow zoom/pan on an image background",
    recipe: "gsap.fromTo(img, { scale: 1.0 }, { scale: 1.06, x: 12, y: -8, duration: ctx.duration, ease: 'none' })." },

  // ── Exits (only when ctx.duration allows a clean out) ──
  { name: "settle-out", kind: "exit", desc: "gentle fade/scale out near the end",
    recipe: "gsap.to(el, { autoAlpha: 0, scale: 0.97, duration: 0.4, ease: 'power2.in' }, ctx.duration - 0.5)." },
];

/** Format the preset library for injection into the codegen prompt. */
export function buildMotionPresetGuide(): string {
  const byKind: Record<string, MotionPreset[]> = {};
  for (const p of MOTION_PRESETS) (byKind[p.kind] ||= []).push(p);
  const lines: string[] = [
    "## Motion Presets (compose animations FROM THESE -- don't reinvent motion)",
    "Build the scene's GSAP timeline from these vetted presets by name. They are consistent, on-brand, and tuned. Combine them (e.g. an entrance + a background + an emphasis); only deviate when the brief needs something a preset can't express.",
  ];
  for (const kind of ["entrance", "emphasis", "background", "exit"]) {
    if (!byKind[kind]) continue;
    lines.push(`\n### ${kind}`);
    for (const p of byKind[kind]) lines.push(`- **${p.name}** -- ${p.desc}. ${p.recipe}`);
  }
  lines.push("\nEvery scene should have at least one ENTRANCE and a BACKGROUND preset so nothing pops in flat or sits static.");
  return lines.join("\n");
}
