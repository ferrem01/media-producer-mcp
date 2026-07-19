#!/usr/bin/env node
/**
 * Studio smoke: post-deploy invariants, driven through a real browser.
 * The unit suite proves the math; this proves the deployed Studio actually
 * renders and reacts. Run after every deploy:
 *
 *   SMOKE_BASE=http://159.203.115.164:3200 SMOKE_TOKEN=... \
 *   SMOKE_TENANT=marc-getquotient-ai SMOKE_PROJECT=proj_xxx \
 *   node scripts/studio-smoke.mjs [--edit]
 *
 * --edit additionally runs a speaker cut/restore round-trip through the
 * API (mutates the project transiently; captions inside the cut span are
 * permanently dropped -- use a designated test film).
 *
 * NOTE: does NOT replace watching a rendered mp4 -- only a rendered file
 * proves the audio mix (see TESTPLAN.md step 6).
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3200";
const TOKEN = process.env.SMOKE_TOKEN || "";
const TENANT = process.env.SMOKE_TENANT || "marc-getquotient-ai";
const PROJECT = process.env.SMOKE_PROJECT;
const EDIT = process.argv.includes("--edit");
if (!PROJECT) { console.error("SMOKE_PROJECT required"); process.exit(2); }

const q = TOKEN ? `&token=${encodeURIComponent(TOKEN)}` : "";
const qq = TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : "";
let failures = 0;
const ok = (name, cond, detail) => {
  console.log(`${cond ? "  ok " : "FAIL "}${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};
const api = async (method, path, body) => {
  const r = await fetch(`${BASE}/api${path}${path.includes("?") ? q : qq}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`);
  return r.json();
};

const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
  args: ["--no-sandbox", "--mute-audio"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await page.goto(`${BASE}/studio?tenant=${TENANT}&project=${PROJECT}${q.replace("&", "&")}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  // Wait for the composite preview (it gates the media + word lanes); a cold
  // server or slow pipe can take tens of seconds. Cap at 75s, then assert on
  // whatever state we reached.
  for (let waited = 0; waited < 75000; waited += 3000) {
    await page.waitForTimeout(3000);
    const ready = await page.evaluate(() =>
      !!(window.state && window.state.compositeLoaded) && document.querySelectorAll(".wl-word").length > 0);
    if (ready) break;
  }
  await page.waitForTimeout(2000);

  // ── 1. Boot + no JS errors ──
  ok("no page errors", consoleErrors.length === 0, consoleErrors[0]);

  // ── 2. Lane geometry: beds present, content beds identical ──
  const beds = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".lane-bed")).map((b) => ({
      cls: b.className.replace("lane-bed ", ""), h: parseInt(b.style.height, 10),
    })));
  ok("ruler bed", beds.some((b) => b.cls === "ruler"));
  const content = beds.filter((b) => ["fx", "screen", "speaker"].includes(b.cls));
  ok("content beds uniform", content.length > 0 && content.every((b) => b.h === content[0].h),
    JSON.stringify(content));

  // ── 3. Gutter: one icon per visible lane, every icon labeled ──
  const gut = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#lane-gutter .lg-ic")).map((i) => i.title));
  ok("gutter icons labeled", gut.length >= 2 && gut.every((t) => t.length > 10), JSON.stringify(gut.map((t) => t.slice(0, 12))));
  ok("gutter matches lanes", gut.length === content.length + (beds.some((b) => b.cls === "music") ? 1 : 0),
    `${gut.length} icons vs ${content.length} content + music`);

  // ── 4. Effects blocks clickable -> popover ──
  const fxCount = await page.evaluate(() => document.querySelectorAll(".fx-seg").length);
  if (fxCount) {
    await page.click(".fx-seg");
    await page.waitForTimeout(500);
    ok("effect click opens editor", await page.evaluate(() => document.getElementById("cam-pop").style.display === "block"));
    await page.evaluate(() => document.getElementById("cam-pop").style.display = "none");
  } else console.log("  -- no effects on this film; skipping fx click");

  // ── 5. Screen block -> media popover ──
  const mlCount = await page.evaluate(() => document.querySelectorAll(".ml-seg").length);
  if (mlCount) {
    await page.click(".ml-seg");
    await page.waitForTimeout(500);
    ok("screen block opens media editor", await page.evaluate(() => document.getElementById("cam-pop").style.display === "block"));
    await page.evaluate(() => document.getElementById("cam-pop").style.display = "none");
  }

  // ── 6. Speaker lane: clip pieces + words sane ──
  const spk = await page.evaluate(() => ({
    pieces: document.querySelectorAll(".spk-clip").length,
    words: Array.from(document.querySelectorAll(".wl-word")).length,
  }));
  ok("speaker clip rendered", spk.pieces >= 1, `${spk.pieces} pieces`);
  ok("word lane populated", spk.words > 10, `${spk.words} words`);

  const tr = await api("GET", `/speaker-transcript/${TENANT}/${PROJECT}`);
  if (tr.available) {
    let maxRegress = 0;
    for (let i = 1; i < tr.segments.length; i++) {
      maxRegress = Math.max(maxRegress, tr.segments[i - 1].start - tr.segments[i].start);
    }
    ok("transcript order sane", maxRegress < 0.5, `max regression ${maxRegress.toFixed(2)}s`);
  }

  // ── 7. Playhead structure ──
  ok("playhead line present", await page.evaluate(() => {
    const ph = document.getElementById("playhead-line");
    return !!ph && ph.style.display !== "none";
  }));

  // ── 8. (--edit) referee round-trip through the API ──
  if (EDIT) {
    const before = await api("GET", `/projects/${TENANT}/${PROJECT}`);
    const bp = before.project || before;
    const scenes = bp.scenes || [];
    let sceneStart = 0, target = null;
    for (const s of scenes) {
      if (s.media_edits) { target = s; break; }
      sceneStart += s.duration_seconds || 0;
    }
    if (!target || !(bp.speaker && bp.speaker.clips && bp.speaker.clips.length === 1)) {
      ok("edit round-trip preconditions", false, "no narrated scene or speaker lane");
    } else {
      const durBefore = target.duration_seconds;
      const screenCutsBefore = JSON.stringify((target.media_edits.screencast || {}).cuts || []);
      const from = sceneStart + Math.min(10, durBefore / 3);
      const cut = await api("POST", `/speaker-cut/${TENANT}/${PROJECT}`, { from, to: from + 2 });
      const cScene = cut.project.scenes.find((s) => s.media_edits);
      ok("cut shrinks scene", Math.abs(cScene.duration_seconds - (durBefore - 2)) < 0.15,
        `${durBefore} -> ${cScene.duration_seconds}`);
      ok("screen cuts unchanged", JSON.stringify((cScene.media_edits.screencast || {}).cuts || []) === screenCutsBefore);
      ok("re-fit anchors tagged", ((cScene.media_edits.screencast || {}).pins || []).some((p) => p.auto));
      const rest = await api("POST", `/speaker-restore/${TENANT}/${PROJECT}`, {
        src_start: cut.speaker_cut.src_start, src_end: cut.speaker_cut.src_end,
      });
      const rScene = rest.project.scenes.find((s) => s.media_edits);
      ok("restore returns duration", Math.abs(rScene.duration_seconds - durBefore) < 0.15,
        `${rScene.duration_seconds} vs ${durBefore}`);
      ok("restore lifts anchors", !((rScene.media_edits.screencast || {}).pins || [])
        .some((p) => p.auto && p.auto !== "refit-end"));
    }
  } else console.log("  -- read-only run; pass --edit for the referee round-trip");
} finally {
  await browser.close();
}

console.log(failures ? `\nSMOKE FAILED: ${failures} check(s)` : "\nSMOKE PASSED");
process.exit(failures ? 1 : 0);
