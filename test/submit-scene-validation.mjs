/**
 * Regression test for executeSubmitScene's remote-media guard.
 *
 * Root cause of the b-roll render failures: when the pipeline supplies no local
 * b-roll clip, the agent (which has no search tool) invents a remote stock-footage
 * URL (e.g. a Pexels clip from training) to satisfy a "real footage" brief. Remote
 * media breaks render -- a streaming <video> stalls networkidle, dead URLs 403.
 * The submission guard rejects any remote media URL so it never reaches the HTML.
 *
 * Usage: node test/submit-scene-validation.mjs   (run after `npm run build`)
 */
import { executeSubmitScene } from "../dist/llm/agentic-codegen.js";

const results = [];
function ok(name, cond) { results.push(cond); console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); }

const SHELL = (body) => `<template>${body}</template><style scoped>.x{}</style><script>1</script>`;

// Rejected: remote video URL (the actual failure mode)
const r1 = executeSubmitScene(SHELL(`<video src="https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4"></video>`));
ok("rejects remote .mp4 in <video> src", !r1.valid && /Remote media URL not allowed/.test(r1.error || ""));

// Rejected: remote video URL embedded in a JS data object
const r2 = executeSubmitScene(SHELL(`<div></div><script>var d={"src":"https://videos.pexels.com/x/y-uhd.mp4"};</script>`));
ok("rejects remote .mp4 inside JS data object", !r2.valid);

// Rejected: remote image
const r3 = executeSubmitScene(SHELL(`<img src="https://images.unsplash.com/photo-123.jpg">`));
ok("rejects remote image URL", !r3.valid);

// Accepted: local /assets b-roll path (the legit case)
const r4 = executeSubmitScene(SHELL(`<video src="/assets/tenant/projects/p/assets/broll_scene_5.mp4"></video>`));
ok("accepts local /assets b-roll path", r4.valid);

// Accepted: remote font/GSAP CDN (no media extension) is left alone
const r5 = executeSubmitScene(`<template><div>hi</div></template><style scoped>@import url(https://fonts.googleapis.com/css2?family=Inter);</style><script>1</script>`);
ok("accepts remote font CDN (no media extension)", r5.valid);

const pass = results.every(Boolean);
console.log(`\n=== executeSubmitScene remote-media guard: ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
