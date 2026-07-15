/**
 * Regression tests for the camera/speaker PiP single-source-of-truth contract.
 *
 * These lock three things that broke in the field (black PiP + duplicate camera
 * reference), each at the layer where it actually failed:
 *
 *  1. resolveAssetUrls: in preview, a component's `pip_source: "speaker"` MUST
 *     resolve to the speaker clip URL. If it stays the literal "speaker", the
 *     Studio PiP is a black <video> (the visible bug).
 *
 *  2. normalizeSpeakerPipRefs (Option-A guardrail): a PiP that points at the
 *     speaker clip BY URL is rewritten to the "speaker" token, so there is one
 *     camera reference (no duplicate media, render-synced).
 *
 *  3. The MCP `update` tool: `speaker_track` is a PROJECT-level field and MUST
 *     persist on a project-level update (no scene_id). It was gated behind the
 *     scene branch and silently dropped while still reporting "updated" -- the
 *     root cause of the black PiP (getSpeakerUrl -> undefined -> nothing to
 *     resolve "speaker" to). We drive the real tool handler in-process to prove
 *     it persists, and that duplicate-by-URL PiP auto-corrects with a warning.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { config } from "../src/config.js";
import { resolveAssetUrls, normalizeSpeakerPipRefs } from "../src/core/scene-assembler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(__dirname, "../test-output/speaker-pip");
const TENANT = "spk-tenant";
const CAM = `/assets/${TENANT}/projects/library/assets/camera.mp4`;

// ── 1. Pure: preview resolution of the "speaker" token ──

describe("resolveAssetUrls — speaker token (preview contract)", () => {
  it("resolves pip_source:'speaker' to the speaker clip URL in preview", () => {
    const out = resolveAssetUrls({ pip_source: "speaker" }, true, CAM);
    expect(out.pip_source).toBe(CAM);
  });

  it("leaves 'speaker' literal when no speakerUrl is available (the black-PiP condition)", () => {
    // This is exactly what happened when speaker_track failed to persist:
    // getSpeakerUrl -> undefined -> preview gets no speakerUrl -> black PiP.
    const out = resolveAssetUrls({ pip_source: "speaker" }, true, undefined);
    expect(out.pip_source).toBe("speaker");
  });

  it("does not resolve 'speaker' in render mode (render.ts owns that swap + sync)", () => {
    const out = resolveAssetUrls({ pip_source: "speaker" }, false, CAM);
    expect(out.pip_source).toBe("speaker");
  });
});

// ── 2. Pure: Option-A guardrail (dedup a by-URL PiP to the token) ──

describe("normalizeSpeakerPipRefs — Option-A guardrail", () => {
  it("rewrites a pip_source that equals the speaker clip (exact match) to 'speaker'", () => {
    const { data, corrected } = normalizeSpeakerPipRefs({ pip_source: CAM }, CAM);
    expect(data.pip_source).toBe("speaker");
    expect(corrected).toEqual(["pip_source"]);
  });

  it("matches by basename across /assets vs file:// vs http forms of the same file", () => {
    const { data, corrected } = normalizeSpeakerPipRefs(
      { pip_source: "file:///data/media-producer/spk-tenant/projects/library/assets/camera.mp4" },
      CAM,
    );
    expect(data.pip_source).toBe("speaker");
    expect(corrected).toEqual(["pip_source"]);
  });

  it("leaves an already-'speaker' pip_source untouched (idempotent, no false 'corrected')", () => {
    const { data, corrected } = normalizeSpeakerPipRefs({ pip_source: "speaker" }, CAM);
    expect(data.pip_source).toBe("speaker");
    expect(corrected).toEqual([]);
  });

  it("does NOT touch a PiP that points at a different camera", () => {
    const other = `/assets/${TENANT}/projects/library/assets/other-cam.mp4`;
    const { data, corrected } = normalizeSpeakerPipRefs({ pip_source: other }, CAM);
    expect(data.pip_source).toBe(other);
    expect(corrected).toEqual([]);
  });

  it("never rewrites the main footage key `source` (st-screencast footage != camera)", () => {
    // Even if the footage happened to share the camera's basename, `source` is
    // the screencast, not the PiP -- only pip_source is in scope.
    const { data, corrected } = normalizeSpeakerPipRefs({ source: CAM }, CAM);
    expect(data.source).toBe(CAM);
    expect(corrected).toEqual([]);
  });

  it("is a no-op when there is no speaker track", () => {
    const { data, corrected } = normalizeSpeakerPipRefs({ pip_source: CAM }, undefined);
    expect(data.pip_source).toBe(CAM);
    expect(corrected).toEqual([]);
  });
});

// ── 3. In-process MCP `update` handler (the persistence + guardrail bug) ──

describe("update tool — speaker_track persistence + PiP guardrail", () => {
  let createMcpServer: typeof import("../src/server.js")["createMcpServer"];
  let loadProject: typeof import("../src/persistence/project.js")["loadProject"];
  let client: import("@modelcontextprotocol/sdk/client/index.js").Client;
  let projectId: string;

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const res: any = await client.callTool({ name, arguments: { tenant_id: TENANT, ...args } });
    const text = res?.content?.[0]?.text ?? "";
    let json: any = undefined;
    try { json = JSON.parse(text); } catch { /* err() returns plain text */ }
    return { isError: !!res?.isError, text, json };
  };
  const callUpdate = (args: Record<string, unknown>) => callTool("update", args);
  const callAdd = (args: Record<string, unknown>) => callTool("add", args);

  beforeAll(async () => {
    // Auth is enforced at the transport, not the tool layer; keep it off so the
    // in-memory client can call tools without a token.
    delete process.env.SESSION_SECRET;
    delete process.env.AUTH_TOKENS;
    config.dataDir = TEST_DATA_DIR;
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });

    const persistence = await import("../src/persistence/project.js");
    loadProject = persistence.loadProject;
    ({ createMcpServer } = await import("../src/server.js"));

    // Seed a project with a screencast-frame component (status 'generated' so
    // it's a normal editable project, mirroring the real one).
    const project = await persistence.createProject({ tenant_id: TENANT, name: "PiP Regression", format: "video" });
    projectId = project.project_id;
    await persistence.addScene(TENANT, projectId, {
      id: "s_main", label: "Walkthrough", duration_seconds: 20, components: [],
    });
    await persistence.addComponent(TENANT, projectId, "s_main", {
      id: "sc", type: "screencast-frame",
      data: { video_url: `/assets/${TENANT}/projects/library/assets/screencast.mp4` },
      z_index: 10,
    });

    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const server = createMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    try { await client?.close(); } catch { /* ignore */ }
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it("add tool persists speaker_track at the project level (the proven path)", async () => {
    // The `add` tool has been the correct entry point since day one; lock it so
    // it can never silently regress the way the `update` path did.
    const altCam = `/assets/${TENANT}/projects/library/assets/camera-add.mp4`;
    const r = await callAdd({ project_id: projectId, speaker_track: { clips: [{ source: altCam, start: 0 }] } });
    expect(r.isError).toBe(false);
    const persisted = await loadProject(TENANT, projectId);
    expect(persisted?.speaker_track?.clips?.[0]?.source).toBe(altCam);
  });

  it("persists speaker_track on a PROJECT-level update (no scene_id) — the regression", async () => {
    const r = await callUpdate({
      project_id: projectId,
      speaker_track: { clips: [{ source: CAM, start: 0 }] },
    });
    expect(r.isError).toBe(false);
    const persisted = await loadProject(TENANT, projectId);
    expect(persisted?.speaker_track?.clips?.[0]?.source).toBe(CAM);
  });

  it("also persists speaker_track when paired with an unrelated field (canvas)", async () => {
    // The historical false-positive: canvas set updated=true so the call
    // reported success while speaker_track was dropped. Now both stick.
    const r = await callUpdate({
      project_id: projectId,
      canvas: { background: "#ffffff" },
      speaker_track: { clips: [{ source: CAM, start: 0 }] },
    });
    expect(r.isError).toBe(false);
    const persisted = await loadProject(TENANT, projectId);
    expect(persisted?.speaker_track?.clips?.[0]?.source).toBe(CAM);
  });

  it("persists scene transparent_background:false (opaque screencast over a speaker track)", async () => {
    // The hand-build gap that broke Studio: with a speaker_track set, scenes
    // default to transparent (camera shows through). An opaque full-frame
    // screencast (camera only in its PiP) needs transparent_background:false,
    // and the update tool must be able to SET it. Lock both true and false.
    const rFalse = await callUpdate({ project_id: projectId, scene_id: "s_main", transparent_background: false });
    expect(rFalse.isError).toBe(false);
    let persisted = await loadProject(TENANT, projectId);
    expect(persisted?.scenes?.[0]?.transparent_background).toBe(false);

    const rTrue = await callUpdate({ project_id: projectId, scene_id: "s_main", transparent_background: true });
    expect(rTrue.isError).toBe(false);
    persisted = await loadProject(TENANT, projectId);
    expect(persisted?.scenes?.[0]?.transparent_background).toBe(true);
  });

  it("accepts string 'false'/'true' from clients that serialize booleans as strings", async () => {
    // The observed failure: an MCP client sent the boolean as the string
    // "false", which a strict z.boolean() rejected. It must coerce to a real
    // boolean so the flag actually persists.
    const rs = await callUpdate({ project_id: projectId, scene_id: "s_main", transparent_background: "false" as unknown as boolean });
    expect(rs.isError).toBe(false);
    let persisted = await loadProject(TENANT, projectId);
    expect(persisted?.scenes?.[0]?.transparent_background).toBe(false);

    const rs2 = await callUpdate({ project_id: projectId, scene_id: "s_main", transparent_background: "true" as unknown as boolean });
    expect(rs2.isError).toBe(false);
    persisted = await loadProject(TENANT, projectId);
    expect(persisted?.scenes?.[0]?.transparent_background).toBe(true);
  });

  it("auto-corrects a by-URL PiP to 'speaker' and warns (Option A)", async () => {
    const r = await callUpdate({
      project_id: projectId,
      scene_id: "s_main",
      component_id: "sc",
      data: { pip_source: CAM, pip_position: "bottom-right" },
    });
    expect(r.isError).toBe(false);
    expect(r.json?.warning).toMatch(/speaker/i);

    const persisted = await loadProject(TENANT, projectId);
    const comp = persisted?.scenes?.[0]?.components?.[0];
    expect((comp?.data as any)?.pip_source).toBe("speaker");
    // The unrelated field on the same update still lands.
    expect((comp?.data as any)?.pip_position).toBe("bottom-right");
  });

  // ── Parity pass: knobs the update tool was missing (media_edits, pose,
  //    audio_hints, speaker_track clear). Same class of hand-build gap. ──

  it("sets and clears scene media_edits (null and {} both drop the media lane)", async () => {
    const edit = { 'video[src*="camera.mp4"]': { segments: [{ src_start: 0, src_end: 10, rate: 1 }] } };
    let r = await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: edit });
    expect(r.isError).toBe(false);
    let p = await loadProject(TENANT, projectId);
    expect(p?.scenes?.[0]?.media_edits).toBeDefined();

    r = await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: null });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect(p?.scenes?.[0]?.media_edits).toBeUndefined();

    // {} also clears (robust against clients that strip null).
    await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: edit });
    r = await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: {} });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect(p?.scenes?.[0]?.media_edits).toBeUndefined();
  });

  it("sets and clears a component pose", async () => {
    let r = await callUpdate({ project_id: projectId, scene_id: "s_main", component_id: "sc", pose: { rotate_y: 12 } });
    expect(r.isError).toBe(false);
    let p = await loadProject(TENANT, projectId);
    expect((p?.scenes?.[0]?.components?.[0] as any)?.pose?.rotate_y).toBe(12);

    r = await callUpdate({ project_id: projectId, scene_id: "s_main", component_id: "sc", pose: null });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect((p?.scenes?.[0]?.components?.[0] as any)?.pose).toBeUndefined();
  });

  it("sets and clears scene audio_hints", async () => {
    let r = await callUpdate({ project_id: projectId, scene_id: "s_main", audio_hints: { voiceover_text: "hello" } });
    expect(r.isError).toBe(false);
    let p = await loadProject(TENANT, projectId);
    expect((p?.scenes?.[0] as any)?.audio_hints?.voiceover_text).toBe("hello");

    r = await callUpdate({ project_id: projectId, scene_id: "s_main", audio_hints: null });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect((p?.scenes?.[0] as any)?.audio_hints).toBeUndefined();
  });

  it("clears the speaker_track via null and via an empty clips array", async () => {
    // seed a track first
    await callUpdate({ project_id: projectId, speaker_track: { clips: [{ source: CAM, start: 0 }] } });
    let p = await loadProject(TENANT, projectId);
    expect(p?.speaker_track?.clips?.[0]?.source).toBe(CAM);

    // null clears
    let r = await callUpdate({ project_id: projectId, speaker_track: null });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect(p?.speaker_track).toBeUndefined();

    // empty clips also clears
    await callUpdate({ project_id: projectId, speaker_track: { clips: [{ source: CAM, start: 0 }] } });
    r = await callUpdate({ project_id: projectId, speaker_track: { clips: [] } });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect(p?.speaker_track).toBeUndefined();
  });

  it("coerces string-serialized object/null params (clients that stringify)", async () => {
    // Observed: this client sends media_edits:{} as the STRING "{}" and
    // media_edits:null as "null". Both must parse and clear.
    const edit = { 'video[src*="camera.mp4"]': { segments: [{ src_start: 0, src_end: 10, rate: 1 }] } };

    await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: edit });
    let r = await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: "null" as unknown as Record<string, unknown> });
    expect(r.isError).toBe(false);
    let p = await loadProject(TENANT, projectId);
    expect(p?.scenes?.[0]?.media_edits).toBeUndefined();

    await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: edit });
    r = await callUpdate({ project_id: projectId, scene_id: "s_main", media_edits: "{}" as unknown as Record<string, unknown> });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect(p?.scenes?.[0]?.media_edits).toBeUndefined();

    // a pose passed as a JSON string still sets
    r = await callUpdate({ project_id: projectId, scene_id: "s_main", component_id: "sc", pose: '{"rotate_y":8}' as unknown as Record<string, unknown> });
    expect(r.isError).toBe(false);
    p = await loadProject(TENANT, projectId);
    expect((p?.scenes?.[0]?.components?.[0] as any)?.pose?.rotate_y).toBe(8);
  });
});
