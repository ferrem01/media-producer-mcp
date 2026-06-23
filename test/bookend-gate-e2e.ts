/**
 * Bookend brand-theme gate (isolated).
 *
 * Bookend (intro/outro/title/CTA) scenes used to be fully exempt from critique,
 * so a dark intro/outro on a LIGHT brand could slip through. They now run the
 * correctness + brand-theme gate (`correctnessOnly` mode). This test isolates the
 * two halves of that path so it doesn't depend on the planner producing a dark
 * bookend (which the brand-aware codegen now resists):
 *
 *   A. DETECTION  -- a scene labeled "Outro"/"Intro"/"Title"/"Closing CTA" (and a
 *      video-only brand clip) is classified as a bookend; content scenes are not.
 *   B. THE GATE   -- a DARK final frame, evaluated as an outro scene for a LIGHT
 *      brand, is flagged `off_brand_theme`; a LIGHT frame is not. Since bookends
 *      are now wired to this gate, a dark bookend can no longer pass unchecked.
 *
 * Part A is pure/instant. Part B makes 2 vision-critique calls.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isBookendScene } from "../dist/llm/pipeline.js";
import { critiqueCorrectness } from "../dist/llm/correctness-critique.js";
import { config } from "../dist/config.js";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIX = "/tmp/bookend-gate";

const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (n: string, p: boolean, d = "") => { checks.push({ name: n, pass: p, detail: d }); console.log(`  [${p ? "PASS" : "FAIL"}] ${n}${d ? " -- " + d : ""}`); };

async function main() {
  console.log("=== Bookend brand-theme gate (isolated) E2E ===\n");

  // ── Part A: detection (pure) ──
  console.log("-- A. bookend DETECTION --");
  const N = 5;
  check('"Outro - CTA" (last scene) is a bookend', isBookendScene("Outro - CTA", N - 1, N));
  check('"Intro" (first scene) is a bookend', isBookendScene("Intro", 0, N));
  check('"Title Slide" (first scene) is a bookend', isBookendScene("Title Slide", 0, N));
  check('"Closing CTA" (last scene) is a bookend', isBookendScene("Closing CTA", N - 1, N));
  check('video-only scene is a bookend (brand clip)', isBookendScene("The Brand Lands", 4, N, ["video"]));
  check('"Key Metrics" (mid content) is NOT a bookend', !isBookendScene("Key Metrics", 2, N));
  check('"Feature Showcase" (mid content) is NOT a bookend', !isBookendScene("Feature Showcase", 1, N, ["stat-card", "bento-grid"]));
  // a "title" word only counts as a bookend at the opening, not mid-deck
  check('"Job Titles" mid-deck is NOT a bookend (title only counts at opening)', !isBookendScene("Job Titles", 2, N));

  // ── Part B: the gate catches a DARK bookend on a LIGHT brand ──
  console.log("\n-- B. the wired gate catches a dark bookend (light brand) --");
  await fs.promises.rm(FIX, { recursive: true, force: true });
  await fs.promises.mkdir(FIX, { recursive: true });
  const darkFrame = path.join(FIX, "dark_outro.png");
  const lightFrame = path.join(FIX, "light_outro.png");
  // dark outro on a light brand = off-brand; light outro = on-brand
  await exec("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=#0d0d18:s=1280x720", "-frames:v", "1", darkFrame]);
  await exec("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=#f4f4fb:s=1280x720", "-frames:v", "1", lightFrame]);
  const b64 = (p: string) => fs.readFileSync(p).toString("base64");
  const outroBrief = "The OUTRO / closing CTA scene of a Quotient launch video. Quotient is a LIGHT brand (white background, dark text).";

  const darkRes = await critiqueCorrectness({ finalFrameBase64: b64(darkFrame), briefText: outroBrief, brandTheme: "light", llmConfig: config.critiqueLlm });
  check("gate flags off_brand_theme on a DARK outro (light brand)", darkRes.defects.some((d) => d.type === "off_brand_theme"), darkRes.defects.map((d) => d.type).join(",") || "none");

  const lightRes = await critiqueCorrectness({ finalFrameBase64: b64(lightFrame), briefText: outroBrief, brandTheme: "light", llmConfig: config.critiqueLlm });
  check("gate does NOT flag off_brand_theme on a LIGHT outro", !lightRes.defects.some((d) => d.type === "off_brand_theme"), lightRes.defects.map((d) => d.type).join(",") || "clean");

  const allPass = checks.every((c) => c.pass);
  console.log(`\n=== Bookend gate E2E: ${allPass ? "PASS" : "FAIL"} (${checks.filter((c) => c.pass).length}/${checks.length}) ===`);
  if (!allPass) process.exit(1);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
