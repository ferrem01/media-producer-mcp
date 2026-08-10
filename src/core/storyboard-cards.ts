/**
 * THE TRUE STORYBOARD (golden workflow step 2's working surface): one card
 * per draft scene -- a real assembled frame on top, the full record beneath
 * (purpose, VO, timed beats, each component's performance script) -- plus a
 * contact sheet for the film. "A visual plus text", the thing the film
 * industry always meant by a storyboard.
 *
 * The frames are honest, not artist's impressions: post-refactor every
 * storyboard scene arrives component-cast with full data, so the SAME
 * deterministic assembly the build will use (buildAuthoredCompositionScene ->
 * assembleScene) runs here with zero LLM calls, and the still is captured at
 * the scene's SETTLED MOMENT. What you approve on the card is what builds.
 *
 * Cards exist so the iterate-round-and-round loop happens against pictures --
 * both of the tenant's best films were storyboard-iterated first, and Jake
 * Moran's workflow is "storyboard as stills first". Codegen scenes (rare) get
 * a labeled schematic placeholder: no HTML exists before the LLM writes it.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { assembleScene } from "./scene-assembler.js";
import { LAUNCH_OPTS } from "./capture.js";
import { buildAuthoredCompositionScene } from "../llm/scene-generator.js";
import type { Project } from "./types.js";

/**
 * When to photograph the scene: after its slowest performer has landed, but
 * never so late the exits have begun. Derived from the draft's own timing
 * data (component data.at + script action times), so it is deterministic and
 * costs nothing. Fixed-time sampling shipped a near-black card for a terminal
 * scene whose content landed at 12s of 14 -- the settled moment is the fix.
 */
export function settledMoment(draft: {
  duration_seconds?: number;
  components?: Array<{ data?: Record<string, unknown> }>;
}): number {
  const dur = Number(draft.duration_seconds) || 6;
  let maxAt = 0;
  for (const c of draft.components || []) {
    const d = (c && c.data) || {};
    const at = Number((d as any).at);
    if (isFinite(at)) maxAt = Math.max(maxAt, at);
    const script = (d as any).script;
    if (Array.isArray(script)) {
      for (const a of script) {
        const t = Number(a?.at);
        if (isFinite(t)) maxAt = Math.max(maxAt, t);
      }
    }
  }
  const want = maxAt > 0 ? maxAt + 0.8 : dur * 0.6;
  return Math.min(dur * 0.85, Math.max(dur * 0.5, want));
}

/** Recursive `${type}.component.html` index of the component library. */
async function indexComponents(dir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  async function walk(d: string) {
    let entries: import("node:fs").Dirent[] = [];
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith(".component.html")) map.set(e.name.replace(".component.html", ""), p);
    }
  }
  await walk(dir);
  return map;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cardHtml(scenes: Array<Record<string, any>>, stills: Array<string | null>, title: string): string {
  const cards = scenes.map((ss, i) => {
    let t = 0;
    const beats = (ss.beats || []).map((b: any) => {
      const head = `<div class="bt"><span class="tc">${t.toFixed(1)}s</span> ${esc(b.label)} <span class="bd">(${b.duration_seconds}s)</span></div>`;
      t += Number(b.duration_seconds) || 0;
      const vo = b.voiceover_text ? `<div class="bv">VO: &ldquo;${esc(b.voiceover_text)}&rdquo;</div>` : "";
      return `${head}<div class="ba">${esc(b.action)}</div>${vo}`;
    }).join("");
    const comps = (ss.components || []).map((c: any) => {
      const script = ((c.data || {}).script || []) as any[];
      const rows = script.length
        ? script.map((a) => {
            const extra = a.text ?? a.result ?? a.tool ?? a.target ?? a.published_date ?? "";
            return `<div class="sc">@${esc(a.at)} ${esc(a.action)}${extra ? ` &ldquo;${esc(String(extra).slice(0, 64))}&rdquo;` : ""}</div>`;
          }).join("")
        : `<div class="sc mut">(static data, no script)</div>`;
      return `<div class="ct">${esc(c.type)}</div>${rows}`;
    }).join("");
    const frame = stills[i]
      ? `<img class="frame" src="${path.basename(stills[i]!)}">`
      : `<div class="frame ph">codegen scene &mdash; frame appears after build</div>`;
    return `<div class="card">${frame}
      <div class="head"><span class="num">${String(i + 1).padStart(2, "0")}</span> ${esc(ss.label)} <span class="dur">${esc(ss.duration_seconds)}s</span></div>
      <div class="purpose">${esc(ss.purpose)}</div>
      ${ss.voiceover_text ? `<div class="vo">VO: &ldquo;${esc(ss.voiceover_text)}&rdquo;</div>` : ""}
      <div class="sect">BEATS</div>${beats || '<div class="sc mut">(no beats)</div>'}
      <div class="sect">COMPONENTS &amp; SCRIPTS</div>${comps || '<div class="sc mut">(none cast)</div>'}
    </div>`;
  }).join("");
  return `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#e8e2d4;font-family:'DejaVu Sans',system-ui,sans-serif;color:#17171c;width:2440px}
  h1{font-size:30px;margin:20px 28px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:0 24px 24px;align-items:start}
  .card{background:#f5f2ea;border:2px solid #c9c2b2;padding:22px}
  .frame{width:100%;aspect-ratio:16/9;object-fit:cover;border:2px solid #111;display:block}
  .frame.ph{display:flex;align-items:center;justify-content:center;background:#dedad0;color:#8a8374;font-size:20px;border-style:dashed}
  .head{font-size:29px;font-weight:700;margin:16px 0 8px;display:flex;align-items:center;gap:10px}
  .num{color:#8a8374}.dur{margin-left:auto;background:#393bf5;color:#fff;padding:2px 12px;font-size:26px}
  .purpose{font-size:20px;color:#43392c;margin-bottom:4px}
  .vo{font-size:17px;color:#8a8374;margin-bottom:6px}
  .sect{font-size:17px;font-weight:700;border-top:1px solid #c9c2b2;margin-top:12px;padding-top:10px;letter-spacing:.04em}
  .bt{font-size:17px;font-weight:700;color:#393bf5;margin-top:8px}.tc{color:#8a8374;font-weight:400}.bd{color:#8a8374;font-weight:400}
  .ba{font-size:17px;color:#43392c;margin-left:22px}.bv{font-size:15px;color:#8a8374;margin-left:22px}
  .ct{font-size:19px;font-weight:700;margin-top:8px}
  .sc{font-family:'DejaVu Sans Mono',monospace;font-size:15px;color:#43392c;margin-left:20px}.mut{color:#8a8374}
  </style><h1>${esc(title)}</h1><div class="grid">${cards}</div>`;
}

export interface StoryboardCardsResult {
  /** Contact sheet PNG path (the deliverable). */
  sheet: string;
  /** Per-scene still paths, null where the scene is codegen (no preview). */
  stills: Array<string | null>;
}

/**
 * Render the true storyboard for a project sitting at the storyboard
 * stop-point. Writes per-scene stills (`storyboard_card_scene_N.png`) and the
 * contact sheet (`storyboard-cards.png`) into outDir. Throws only on total
 * failure; a single scene failing degrades to its schematic placeholder.
 */
export async function renderStoryboardCards(project: Project, opts: {
  componentLibDir: string;
  gsapDir: string;
  outDir: string;
}): Promise<StoryboardCardsResult> {
  const sb: any = (project as any).storyboard;
  const scenes: any[] = sb?.scenes || [];
  if (!scenes.length) throw new Error("project has no storyboard scenes");
  await fs.mkdir(opts.outDir, { recursive: true });
  const lib = await indexComponents(opts.componentLibDir);
  const canvas: any = (project as any).canvas || { width: 1920, height: 1080, fps: 30 };
  const browser = await chromium.launch(LAUNCH_OPTS);
  const stills: Array<string | null> = [];
  try {
    const page = await browser.newPage({ viewport: { width: canvas.width, height: canvas.height } });
    for (let i = 0; i < scenes.length; i++) {
      const draft = scenes[i];
      const authored = (draft.components || []).filter(
        (c: any) => c && typeof c === "object" && c.data && typeof c.type === "string");
      if (!authored.length) { stills.push(null); continue; }
      try {
        const { scene } = buildAuthoredCompositionScene(`card_s${i}`, draft, authored, {
          sceneIndex: i, totalScenes: scenes.length,
          brandKit: (project as any).brand_kit || { colors: {}, fonts: [] },
          canvas, world: (project as any).world,
          tenantId: (project as any).tenant_id, projectId: (project as any).project_id,
          prompt: sb?.narrative || "", format: "video",
        } as any);
        const types = [...new Set((scene.components || []).map((c: any) => c.type))] as string[];
        const comps = await Promise.all(types.map(async (t) => {
          const p = lib.get(t);
          return p ? { type: t, source: await fs.readFile(p, "utf-8") } : null;
        }));
        const html = await assembleScene({
          scene, components: comps.filter(Boolean),
          brandKit: (project as any).brand_kit || { colors: {}, fonts: [] },
          canvas, gsapDir: opts.gsapDir,
        } as any);
        const f = path.join(opts.outDir, `card_work_${i}.html`);
        await fs.writeFile(f, html);
        await page.goto(`file://${f}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
        try { await page.waitForFunction(() => (window as any).__MP_READY === true, { timeout: 15_000 }); } catch {}
        // Seek with time(t), NOT pause(t): pause(t) suppresses GSAP callbacks,
        // and every performable surface builds its story through tl.call() --
        // pause-seeking shot an empty terminal as a near-black card. time(t)
        // fires the calls in order, exactly how capture.ts renders frames.
        // The trailing `undefined` matters too: returning the timeline makes
        // Playwright serialize the whole cyclic GSAP graph and hang forever.
        await page.evaluate(
          `var __tl = window.__MP_TIMELINE; if (__tl) { __tl.pause(); try { __tl.time(${settledMoment(draft)}); } catch (e) {} } undefined`);
        const still = path.join(opts.outDir, `storyboard_card_scene_${i + 1}.png`);
        await page.screenshot({ path: still });
        stills.push(still);
        await fs.rm(f, { force: true }).catch(() => {});
      } catch (e: any) {
        console.warn(`  storyboard-cards: scene ${i + 1} still failed (${e?.message}), using placeholder`);
        stills.push(null);
      }
    }
    // The sheet: one HTML page, full-page screenshot.
    const title = `STORYBOARD — “${sb?.narrative || (project as any).name || "Untitled"}” · ${(project as any).project_id} · ${scenes.length} scenes · ~${Math.round(sb?.estimated_duration || 0)}s`;
    const sheetHtml = path.join(opts.outDir, "storyboard-cards.html");
    await fs.writeFile(sheetHtml, cardHtml(scenes, stills, title));
    const sheetPage = await browser.newPage({ viewport: { width: 2440, height: 1200 } });
    await sheetPage.goto(`file://${sheetHtml}`, { waitUntil: "load", timeout: 45_000 });
    await sheetPage.waitForTimeout(400);
    const sheet = path.join(opts.outDir, "storyboard-cards.png");
    await sheetPage.screenshot({ path: sheet, fullPage: true });
    return { sheet, stills };
  } finally {
    await browser.close();
  }
}
