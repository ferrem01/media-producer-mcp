// Storyboard-only test for the b-roll-vs-hero_image background strategy guidance.
// Runs the storyboard builder (no render) and asserts:
//   1. No broll_query uses "still / static / locked-off / motionless / frozen / no movement".
//   2. No single scene carries BOTH broll_query and hero_image (mutually exclusive).
//   3. A film with an explicitly CALM/STILL beat reaches for hero_image (intentional still)
//      rather than a slowed b-roll.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";

const DD = process.cwd() + "/test-output/broll-storyboard";
fs.rmSync(DD, { recursive: true, force: true });
const env = { ...process.env, MP_DATA_DIR: DD, MP_PORT: "0" };
delete env.AUTH_TOKENS; delete env.SESSION_SECRET;
const t = new StdioClientTransport({ command: "node", args: [process.cwd() + "/dist/index.js"], env, stderr: "inherit" });
const c = new Client({ name: "bp", version: "1" }, { capabilities: {} });
await c.connect(t);
const J = (x) => JSON.parse(x.content[0].text);

// Flag SHOT/CAMERA-level stillness (the real defect: a frozen-looking clip).
// "still water" / "still lake" are legit SUBJECT descriptors (mist drifts, camera moves),
// so we only ban camera/shot stillness, not subject nouns.
const BANNED = /\b(static shot|locked[- ]?off|camera (is )?stationary|stationary camera|camera (is )?resting|motionless|freeze[- ]?frame|no movement|no motion|photo[- ]?like|still frame)\b/i;

async function storyboard(label, prompt) {
  const r = J(await c.callTool(
    { name: "generate", arguments: { tenant_id: "bp", mode: "storyboard", target: "video", prompt, voiceover: false, brief: { video_type: "brand", target_duration: 18 } } },
    undefined, { timeout: 300000 }));
  if (r.status !== "storyboard") { console.log(`!! ${label}: storyboard failed`, r.error || JSON.stringify(r).slice(0,200)); return []; }
  const scenes = r.storyboard.scenes;
  console.log(`\n=== ${label} (${scenes.length} scenes) ===`);
  scenes.forEach((s, i) => {
    const tags = [];
    if (s.broll_query) tags.push("BROLL");
    if (s.hero_image) tags.push("HERO_IMG");
    console.log(`  scene ${i + 1} [${tags.join("+") || "graphics"}] ${s.label}`);
    if (s.broll_query) console.log(`      broll: "${s.broll_query}"`);
    if (s.hero_image) console.log(`      hero:  "${s.hero_image}"`);
  });
  return scenes;
}

let fails = 0;
const check = (cond, msg) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) fails++; };

// Prompt with an explicitly CALM/STILL opener -> should prefer hero_image over a slow b-roll.
const calm = await storyboard(
  "calm-opener",
  "An 18-second cinematic brand film for a meditation app. Open on a perfectly STILL, calm dawn over a misty mountain lake — quiet, motionless, contemplative. Then introduce the app, show a breathing session, end on a serene aspirational note.");

// Prompt with an explicitly ENERGETIC beat -> should prefer moving b-roll.
const energetic = await storyboard(
  "energetic",
  "An 18-second high-energy brand film for an adventure travel startup. Open on crashing ocean waves and a speeding train through mountains, fast motion, kinetic energy. Introduce the app, show trip planning, end on an exhilarating call to explore.");

const all = [...calm, ...energetic];
console.log("\n=== ASSERTIONS ===");
// 1. No banned still-language in any broll_query.
const badBroll = all.filter((s) => s.broll_query && BANNED.test(s.broll_query));
check(badBroll.length === 0, `no broll_query uses still/static language${badBroll.length ? ` (offenders: ${badBroll.map((s) => `"${s.broll_query}"`).join(", ")})` : ""}`);
// 2. Mutual exclusivity.
const both = all.filter((s) => s.broll_query && s.hero_image);
check(both.length === 0, `no scene carries both broll_query and hero_image${both.length ? ` (${both.length} offenders)` : ""}`);
// 3. The calm film reaches for a hero_image for its still beat.
const calmHero = calm.some((s) => s.hero_image);
check(calmHero, "calm-opener film uses a hero_image (intentional still) somewhere");
// 4. The energetic film uses moving b-roll.
const energBroll = energetic.some((s) => s.broll_query);
check(energBroll, "energetic film uses moving b-roll somewhere");

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAIL(S)"}`);
await c.close();
process.exit(fails === 0 ? 0 : 1);
