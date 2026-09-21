import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const read = (p: string) => fs.readFile(path.join(process.cwd(), p), "utf8");

describe("the sources: every need is collected its own way, in the board", () => {
  it("names how each kind of need is collected; the build's draw prompt is shared; the frame decides portrait", async () => {
    const { NEED_SOURCES, needSources, drawPrompt, tallFrame } = await import("../src/core/need-sources.js");
    expect(NEED_SOURCES.camera_video).toEqual(["record", "upload"]); // the server's table; Studio splits record into here / phone
    expect(NEED_SOURCES.screen_recording).toEqual(["recorder", "upload"]);
    expect(NEED_SOURCES.stock_footage).toEqual(["find", "upload"]);
    expect(NEED_SOURCES.illustration).toEqual(["draw", "upload"]);
    expect(needSources("mockup")).toContain("draw");
    expect(drawPrompt({ description: "a tangle of string", focus: "the knot" })).toMatch(/^a tangle of string\. The eye goes to: the knot\. A single clear subject, flat illustrated art/);
    expect(drawPrompt({ description: "x" }, "a kite")).toMatch(/^a kite\. A single/);
    expect(tallFrame({ treatment: { frame: "4x5" } as any })).toBe(true);
    expect(tallFrame({ treatment: { frame: "16x9" } as any })).toBe(false);
    expect(tallFrame(null)).toBe(false);
    // The pipeline draws with the same prompt.
    expect(await read("src/llm/pipeline.ts")).toMatch(/const prompt = drawPrompt\(need\);/);
  });

  describe("Pexels: candidates to pick from, then one clip by id", () => {
    const realFetch = globalThis.fetch, realKey = process.env.PEXELS_API_KEY;
    afterEach(() => { globalThis.fetch = realFetch; if (realKey) process.env.PEXELS_API_KEY = realKey; else delete process.env.PEXELS_API_KEY; });
    const video = { id: 42, image: "https://img/42.jpg", duration: 9, width: 1920, height: 1080, url: "https://pexels/42",
      video_files: [{ link: "https://v/360.mp4", width: 640, height: 360 }, { link: "https://v/720.mp4", width: 1280, height: 720 }, { link: "https://v/1080.mp4", width: 1920, height: 1080 }] };
    it("search returns poster, duration and a small preview; nothing without a key", async () => {
      const { searchStockFootage } = await import("../src/media/stock-footage.js");
      delete process.env.PEXELS_API_KEY;
      expect(await searchStockFootage({ query: "office" })).toEqual([]);
      process.env.PEXELS_API_KEY = "k";
      const calls: string[] = [];
      globalThis.fetch = (async (url: any) => { calls.push(String(url)); return { ok: true, json: async () => ({ videos: [video] }) }; }) as any;
      const hits = await searchStockFootage({ query: "office", orientation: "portrait", perPage: 3 });
      expect(calls[0]).toMatch(/videos\/search\?query=office&per_page=3&orientation=portrait/);
      expect(hits).toEqual([{ id: 42, image: "https://img/42.jpg", duration: 9, width: 1920, height: 1080, preview: "https://v/360.mp4", url: "https://pexels/42" }]);
    });
    it("download by id takes the smallest rendition at or above the target width", async () => {
      const { downloadStockFootage } = await import("../src/media/stock-footage.js");
      process.env.PEXELS_API_KEY = "k";
      const calls: string[] = [];
      globalThis.fetch = (async (url: any) => {
        calls.push(String(url));
        if (/videos\/videos\/42/.test(String(url))) return { ok: true, json: async () => video };
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      }) as any;
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), "stock-"));
      const r = await downloadStockFootage({ id: 42, outputDir: dir, filename: "b.mp4", targetWidth: 1080 });
      expect(calls[1]).toBe("https://v/720.mp4");
      expect(r).toMatchObject({ width: 1280, height: 720, duration: 9 });
      expect((await fs.readFile(path.join(dir, "b.mp4"))).length).toBe(3);
    });
  });

  it("the server: a search route and one find/draw route that ends in provideAsset, tenant-guarded", async () => {
    const index = await read("src/index.ts");
    expect(index).toMatch(/\|generate-image\|need-source\|stock-search\|/);
    expect(index).toMatch(/\/api\\\/stock-search\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/\/api\\\/need-source\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/if \(!needSources\(nsNeed\.type\)\.includes\(source\)\)/);
    expect(index).toMatch(/downloadStockFootage\(\{ id: pickId, outputDir: nsDir, filename: file, targetWidth \}\)/);
    expect(index).toMatch(/generateImage\(\{ prompt: drawPrompt\(nsNeed, /);
    expect(index).toMatch(/const need = provideAsset\(nsProj, nsScene, nsIndex, url\);/);
  });

  it("Studio: the desktop card and the phone card offer each need its sources, inline", async () => {
    const desktop = await read("src/preview-app/preview-app.ts");
    expect(desktop).toMatch(/var NP_SOURCES = \{ camera_video: \['booth', 'phone', 'upload'\], screen_recording: \['recorder', 'upload'\], screenshot: \['recorder', 'upload'\], stock_footage: \['find', 'upload'\], illustration: \['draw', 'upload'\], mockup: \['draw', 'upload'\] \};/);
    expect(desktop).toMatch(/'\/stock-search\/' \+ encodeURIComponent\(state\.tenantId\)/);
    expect(desktop).toMatch(/'\/need-source\/' \+ encodeURIComponent\(state\.tenantId\)/);
    expect(desktop).toMatch(/data-np-src="' \+ src \+ '"/);
    expect(desktop).toMatch(/Quotient Recorder/);
    const phone = await read("src/studio-phone.ts");
    expect(phone).toMatch(/var EV_SOURCES = \{ screen_recording: \['recorder'\], screenshot: \['recorder'\], stock_footage: \['find'\], illustration: \['draw'\], mockup: \['draw'\] \};/);
    expect(phone).toMatch(/'\/need-source\/' \+ encodeURIComponent\(tenant\)/);
    expect(phone).toMatch(/'\/stock-search\/' \+ encodeURIComponent\(tenant\)/);
  });

  it("Studio: what is in the slot can be watched -- a provided need's row leads with View, and the panel plays the file itself (a clip with controls, a still as an image), folding away on a second click", async () => {
    const desktop = await read("src/preview-app/preview-app.ts");
    // Both rows (the scene card and the popover's need row) lead with View when the file is in.
    expect(desktop.match(/var acts = have \? '<button class="np-btn np-view" data-np-src="view" data-np-scene="' \+ si \+ '" data-np-asset="' \+ (r\.ai|ai) \+ '">View<\/button>' : '';/g)?.length).toBe(2);
    expect(desktop).toMatch(/if \(src === 'view'\) \{\n\s*\/\/ WHAT IS IN THE SLOT/);
    expect(desktop).toMatch(/panel\.innerHTML = npViewHtml\(need\);/);
    expect(desktop).toMatch(/'<video class="np-view-el" src="' \+ escAttr\(src\) \+ '" controls playsinline preload="metadata"><\/video>'/);
    expect(desktop).toMatch(/'<img class="np-view-el" src="' \+ escAttr\(src\) \+ '" alt="">'/);
    expect(desktop).toMatch(/var src = pth\.charAt\(0\) === '\/' \? withToken\(pth\) : pth;/);
    expect(desktop).toMatch(/if \(src === 'view'\) \{ panel\.style\.display = 'none'; panel\.dataset\.src = ''; panel\.innerHTML = ''; return; \}/);
    // The page script parses: the regexes inside the template literal carry their backslashes.
    const { getPreviewHtml } = await import("../src/preview-app/preview-app.js");
    const html = getPreviewHtml({} as any);
    const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const sc of scripts) expect(() => new Function(sc)).not.toThrow();
    expect(html).toMatch(/\/\\\.\(mp4\|webm\|mov\|m4v\)\(\\\?\|\$\)\/i\.test/);
  });

  it("the Recorder: a For picker of the project's open screen needs; a recording made for one fills it and takes its slot", async () => {
    const popup = await read("recorder-extension/popup.js");
    expect(popup).toMatch(/type: "qr-needs", project: projectId/);
    expect(popup).toMatch(/opt\.value = n\.scene_index \+ ":" \+ n\.asset_index;/);
    expect(await read("recorder-extension/popup.html")).toMatch(/<select id="need">/);
    const bg = await read("recorder-extension/background.js");
    expect(bg).toMatch(/msg\.type === "qr-needs"/);
    expect(bg).toMatch(/a\.type === "screen_recording" \|\| a\.type === "screenshot"\) && a\.status === "needed"/);
    // The armed slot is the server's truth at stop: a live arm wins over the popup's cached choice.
    expect(bg).toMatch(/let destNeed = \(s\.settings\.destProject && s\.settings\.destNeed\) \|\| "";/);
    expect(bg).toMatch(/destNeed = `\$\{a\.scene_index\}:\$\{a\.asset_index\}`;/);
    const off = await read("recorder-extension/offscreen.js");
    // A recording for a project (a need, or an appended scene) lands in that project's assets.
    expect(off).toMatch(/const uploadProject = upload\.destProjectId \? upload\.destProjectId : upload\.project;/);
    expect(off).toMatch(/\/api\/provide-asset\/\$\{encodeURIComponent\(upload\.tenant\)\}\/\$\{encodeURIComponent\(upload\.destProjectId\)\}/);
  });

  it("the slot is the need: in a built scene the click offers the board's need card, scrolled to the row", async () => {
    const desktop = await read("src/preview-app/preview-app.ts");
    expect(desktop).toMatch(/function needForSelection\(project, sel\)/);
    expect(desktop).toMatch(/comp\.type === 'asset-placeholder' && d\.need/);
    expect(desktop).toMatch(/\(comp\.type === 'image' \|\| comp\.type === 'video'\) && d\.src\) found = needs\.findIndex/);
    // The sources are INLINE in the popover (Marc: "why not just replace
    // directly from the popover?"): the canvas popover and the timeline's
    // footage popover both carry the need's buttons and its find/draw panel.
    // One "Replace b-roll..." button on the popover (canvas and timeline) opens
    // THE PICKER in the dialog, the find/draw panel already open (Marc: the
    // grid needs room the popover lacks).
    expect(desktop).toMatch(/function needSourcesHtml\(project, si, ai\)/);
    expect(desktop).toMatch(/function openNeedPicker\(project, si, ai\) \{[\s\S]*?studioModalOpen\([\s\S]*?needSourcesHtml\(project, si, ai\)[\s\S]*?bindSceneNeeds\(project, card\);[\s\S]*?npOpenPanel\(project, card, first, si, ai\);/);
    expect(desktop).toMatch(/slotRowHtml\(sel\) \+/);
    expect(desktop).toMatch(/needSlotLineHtml\(state\.currentProject, hit\.si, hit\.ai, 'rv-pop-slot'\)/);
    expect(desktop).toMatch(/item\(\(have \? 'Replace the ' : 'Provide the '\)[\s\S]*?openNeedPicker\(state\.currentProject, hit\.si, hit\.ai\)/);
    expect(desktop).toMatch(/function needForVideoSrc\(project, si, src\)/);
    expect(desktop).toMatch(/needSlotLineHtml\(p, needHit\.si, needHit\.ai, 'mp-slot'\)/);
    expect(desktop).toMatch(/openNeedPicker\(p, needHit\.si, needHit\.ai\)/);
  });

  it("a b-roll provided on the board is the scene's ground on the next build of a film nobody carries", async () => {
    const pipeline = await read("src/llm/pipeline.ts");
    expect(pipeline).toMatch(/if \(!personFilm\) \{\s*\(storyboard\.scenes as any\[\]\)\.forEach\(\(d, i\) => \{[\s\S]*?need\.type === "stock_footage" && need\.status === "provided"[\s\S]*?needFootage\.set\(i, need\.path\); break;/);
    // ...and it is seeded BEFORE the fetch block, so it holds without a stock key.
    expect(pipeline.indexOf("needFootage.set(i, need.path); break;")).toBeLessThan(pipeline.indexOf("if ((personFilm && (canDraw || canFetchStock)) || canFetchStock) {"));
  });

  it("the dashed block is an open slot: every need still waiting is a block on its lane in the built film, and the click is the picker", async () => {
    const desktop = await read("src/preview-app/preview-app.ts");
    expect(desktop).toMatch(/function openNeedsOf\(project\)/);
    expect(desktop).toMatch(/a\.status === 'needed' && !a\.path && a\.priority !== 'nice_to_have'/);
    expect(desktop).toMatch(/if \(openNeeds\.some\(function\(n\) \{ return n\.need\.type === 'camera_video' && n\.need\.use !== 'clip'; \}\)\) hasSpk = true;/); // a clip need is a media need, not the speaker lane
    expect(desktop).toMatch(/var hasMedia = !!\(\(state\.mediaClips \|\| \[\]\)\.length\) \|\| hasOpenMedia;/);
    expect(desktop).toMatch(/b\.className = 'ml-seg ml-need';[\s\S]*?openNeedPicker\(p, n\.si, n\.ai\)/);
    expect(desktop).toMatch(/nb\.className = 'spk-clip spk-need';[\s\S]*?openNeedPicker\(p, n\.si, n\.ai\)/);
    expect(desktop).toMatch(/\.ml-seg\.ml-need, \.spk-clip\.spk-need \{/);
  });

  it("the armed need: Studio points the Recorder at a slot, the popup opens set to it, the landing recording disarms it", async () => {
    const index = await read("src/index.ts");
    expect(index).toMatch(/\|music-options\|arm-need\|armed-need\|/);
    expect(index).toMatch(/\/api\\\/arm-need\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/\/api\\\/armed-need\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/if \(anNeed\.type !== "screen_recording" && anNeed\.type !== "screenshot"\)/);
    expect(index).toMatch(/const evDisarmed = await clearArmedNeed\(evTenant, \{ project_id: evProject, scene_index: evScene, asset_index: evIndex \}\);/);
    expect(index).toMatch(/const ARMED_TTL_MS = 2 \* 60 \* 60 \* 1000;/);
    const bg = await read("recorder-extension/background.js");
    expect(bg).toMatch(/msg\.type === "qr-armed"/);
    expect(bg).toMatch(/\/api\/armed-need\/\$\{encodeURIComponent\(settings\.tenant\)\}/);
    expect(bg).toMatch(/msg\.type === "qr-disarm"[\s\S]*?method: "DELETE"/);
    const popup = await read("recorder-extension/popup.js");
    expect(popup).toMatch(/async function applyArmed\(\)[\s\S]*?chrome\.storage\.sync\.set\(\{ destProject: a\.project_id, destNeed: needVal \}\)/);
    expect(await read("recorder-extension/popup.html")).toMatch(/id="armed"/);
    const desktop = await read("src/preview-app/preview-app.ts");
    expect(desktop).toMatch(/api\('POST', '\/arm-need\/' \+ encodeURIComponent\(state\.tenantId\)/);
    expect(await read("src/studio-phone.ts")).toMatch(/api\('POST', '\/arm-need\/' \+ encodeURIComponent\(tenant\)/);
  });

  it("the camera picker: record here (the take page in the dialog) or on your phone (a QR of the take link)", async () => {
    const desktop = await read("src/preview-app/preview-app.ts");
    expect(desktop).toMatch(/if \(src === 'booth'\) \{[\s\S]*?<iframe class="np-booth" src="' \+ escAttr\(takeUrl\) \+ '" allow="camera; microphone; autoplay"/);
    expect(desktop).toMatch(/'&scene=' \+ si \+ '&embed=1'/);
    expect(desktop).toMatch(/if \(src === 'phone'\) \{[\s\S]*?\/api\/take-qr\//);
    expect(desktop).toMatch(/ev\.data\.type !== 'mp-take-attached'/);
    const take = await read("src/take-page.ts");
    expect(take).toMatch(/var embedded = qp\.get\('embed'\) === '1';/);
    expect(take).toMatch(/window\.parent\.postMessage\(\{ type: 'mp-take-attached'/);
    const index = await read("src/index.ts");
    expect(index).toMatch(/\|arm-need\|armed-need\|take-qr\|traces\|/);
    expect(index).toMatch(/\/api\\\/take-qr\\\/\(\[\^\/\]\+\)\\\/\(\[\^\/\]\+\)\$\//);
    expect(index).toMatch(/"Content-Type": "image\/svg\+xml; charset=utf-8"/);
  });
});
