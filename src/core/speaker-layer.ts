/**
 * THE TAKE AS A LAYER (Marc, 2026-09-20: "have the background just be
 * alpha ... if the component that's underneath the speaker video is a
 * video of the product or an image, it would make the speaker look like
 * it had that as the background").
 *
 * The camera is normally the BASE of a speaker film: every scene renders
 * transparent and rides over it (core/speaker-mode.ts). Nothing can lie
 * under the person there. A scene that carries a GROUND -- a full-stage
 * clip, still or mock that holds the whole beat -- gets the take placed
 * INSIDE the scene instead: a `video` component whose src is the
 * "speaker-alpha" token, cast right above the ground and under every
 * graphic. The assembler resolves the token to the take's alpha copy
 * (<name>-alpha.webm, core/take-matte.ts) and the scene renders OPAQUE, so
 * the base is not doubled underneath. Without an alpha copy yet (the matte
 * still running, or a browser that cannot play it) the token resolves to
 * the plain take: the person still shows, the ground waits.
 *
 * One token, one rule, one cast -- pipeline (build), take attach (a board
 * built before this), preview, thumbnail, cards and render all read it.
 */

export const SPEAKER_ALPHA_SRC = "speaker-alpha";
/** The layer's component id. */
export const SPEAKER_LAYER_ID = "speaker";

type Comp = { id?: string; type?: string; z_index?: number; position?: any; data?: Record<string, any>; enter?: any; exit?: any };
type SceneLike = { components?: Array<Comp | null> | null; duration_seconds?: number; transparent_background?: boolean };

/** True when the component is the take-as-a-layer: the token, or the
 *  marker that survives the token's resolution to a file. */
export function isSpeakerLayer(c: Comp | null | undefined): boolean {
  return !!c && !!c.data && (c.data.src === SPEAKER_ALPHA_SRC || c.data.speaker_layer === true);
}

/** The scene's take layer, when cast. */
export function speakerLayerOf(scene: SceneLike | null | undefined): Comp | undefined {
  return (scene?.components || []).find((c) => isSpeakerLayer(c)) || undefined;
}

/** True when the scene carries the take inside it (and so renders opaque
 *  over the camera base rather than transparent on it). */
export function sceneCarriesSpeakerLayer(scene: SceneLike | null | undefined): boolean {
  return !!speakerLayerOf(scene);
}

function fullStage(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  const n = (v: unknown) => parseFloat(String(v));
  return n(p.x) === 0 && n(p.y) === 0 && n(p.width) === 100 && n(p.height) === 100;
}

/**
 * The scene's GROUND: a full-stage `video` or `image` that holds the whole
 * beat (no cut window, or one that opens at the start and runs to the
 * end). A clip cut in mid-beat is a cutaway, not a ground -- the person
 * stays on the base for those.
 */
export function groundOf(scene: SceneLike | null | undefined): Comp | undefined {
  const comps = (scene?.components || []) as Comp[];
  const dur = Number(scene?.duration_seconds) || 0;
  return comps.find((c) => {
    if (!c || (c.type !== "video" && c.type !== "image") || isSpeakerLayer(c)) return false;
    if (!fullStage(c.position)) return false;
    const d = c.data || {};
    if (d.ground === false) return false;
    if (d.ground === true) return true;
    const src = String(d.src || "");
    if (!src || src === "speaker") return false;
    const at = Number(d.at), exitAt = Number(d.exit_at);
    if (Number.isFinite(at) && at > 0.25) return false;
    if (Number.isFinite(exitAt) && dur > 0 && exitAt < dur - 0.25) return false;
    const enter = c.enter && typeof c.enter === "object" ? c.enter : null;
    if (enter && Number(enter.at) > 0.25) return false;
    const exit = c.exit && typeof c.exit === "object" ? c.exit : null;
    if (exit && dur > 0 && Number.isFinite(Number(exit.at)) && Number(exit.at) < dur - 0.25) return false;
    return true;
  });
}

/**
 * Cast the take as a layer over the scene's ground. Idempotent; returns
 * true when the layer was added. The ground drops to z 1, the layer sits
 * at z 2, and anything that stood at or under those rises above them, so
 * the graphics that rode over the person keep riding over them.
 */
export function castSpeakerLayer(scene: SceneLike | null | undefined): boolean {
  if (!scene || !Array.isArray(scene.components)) return false;
  if (speakerLayerOf(scene)) return false;
  const ground = groundOf(scene);
  if (!ground) return false;
  for (const c of scene.components as Comp[]) {
    if (!c || c === ground) continue;
    const z = Number(c.z_index);
    if (!Number.isFinite(z) || z <= 2) c.z_index = (Number.isFinite(z) ? z : 0) + 3;
  }
  ground.z_index = 1;
  const layer: Comp = {
    id: SPEAKER_LAYER_ID,
    type: "video",
    z_index: 2,
    position: { x: 0, y: 0, width: "100%", height: "100%" },
    data: { src: SPEAKER_ALPHA_SRC, object_fit: "cover", speaker_layer: true },
  };
  const gi = (scene.components as Comp[]).indexOf(ground);
  (scene.components as Comp[]).splice(gi + 1, 0, layer);
  return true;
}

/**
 * Bind the layer's data for assembly: the token becomes the take's alpha
 * copy (or the plain take while none exists), seeked to the take's trim
 * so it runs on the same clock as the base. Returns null when there is
 * no take at all -- the caller leaves the layer out (a black window
 * would bury the ground).
 */
export function bindSpeakerLayerData(
  data: Record<string, any>,
  speaker: { alphaUrl?: string; url?: string; offset?: number } | null | undefined,
): Record<string, any> | null {
  if (!data || data.src !== SPEAKER_ALPHA_SRC) return data;
  const src = speaker?.alphaUrl || speaker?.url;
  if (!src) return null;
  // `speaker_layer` keeps the component recognisable once the token is a
  // file (the render resolves it before the compositing rule runs);
  // `alpha` tells the video component not to paint under the clip.
  return { ...data, src, start_at: Math.max(0, Number(speaker?.offset) || 0), speaker_layer: true, ...(speaker?.alphaUrl ? { alpha: true } : { speaker_opaque: true }) };
}
