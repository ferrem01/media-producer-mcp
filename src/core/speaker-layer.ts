/**
 * THE SPEAKER IS A COMPONENT (Marc, 2026-09-20: "make speaker track be
 * something that is only shown via a video component ... if the video
 * clip is set to alpha or transparent then we get what we want").
 *
 * Every speaker scene carries ONE `video` component on the "speaker"
 * token with a `background` setting:
 *
 *   room  -- the raw take. The camera stays the BASE under a transparent
 *            scene (core/speaker-mode.ts); the component draws nothing.
 *   blur  -- the blurred copy (<name>-blur.mp4) as the base, same way.
 *   alpha -- the person on a transparent frame (<name>-alpha.webm),
 *            played INSIDE the scene at the component's place in the
 *            stack; the scene renders opaque. Whatever lies under the
 *            component -- a mock, footage, a still, the brand colour --
 *            is the room behind the person.
 *
 * The copies are made once per take by the matte (core/take-matte.ts),
 * on request: when a scene's component already asks for blur or alpha
 * as the take lands, or when the setting is flipped later in Studio. The
 * raw take is always kept; the clips of the speaker track point at the
 * copy the scene's setting wants (syncSpeakerClips).
 *
 * One token, one rule, one cast -- pipeline (build), take attach, the
 * background route, preview, thumbnail, cards and render all read it.
 */

export const SPEAKER_SRC = "speaker";
/** The older token of the alpha layer; read as background "alpha". */
export const SPEAKER_ALPHA_SRC = "speaker-alpha";
/** The component's id. */
export const SPEAKER_LAYER_ID = "speaker";

export type SpeakerBackground = "room" | "blur" | "alpha";
export const SPEAKER_BACKGROUNDS: readonly SpeakerBackground[] = ["room", "blur", "alpha"];

type Comp = { id?: string; type?: string; z_index?: number; position?: any; data?: Record<string, any>; enter?: any; exit?: any };
type SceneLike = { components?: Array<Comp | null> | null; duration_seconds?: number; transparent_background?: boolean };
type TakeLike = { source: string; blur?: string; alpha?: string; background?: { mode?: string; source_raw?: string } | null; scene_index?: number };
type ClipLike = { source: string; alpha?: string; scene_index?: number };
type ProjectLike = { scenes?: SceneLike[] | null; takes?: TakeLike[] | null; speaker_track?: { clips: ClipLike[] } | null };

export function asSpeakerBackground(v: unknown): SpeakerBackground | null {
  if (v === "none") return "room";
  return (SPEAKER_BACKGROUNDS as readonly string[]).includes(String(v)) ? (v as SpeakerBackground) : null;
}

/** True when the component is the speaker: the marker, or the older alpha token. */
export function isSpeakerLayer(c: Comp | null | undefined): boolean {
  return !!c && !!c.data && (c.data.speaker_layer === true || c.data.src === SPEAKER_ALPHA_SRC);
}

/** The component's background setting (room when unset). */
export function speakerBackgroundOf(c: Comp | null | undefined): SpeakerBackground {
  if (!c || !c.data) return "room";
  return asSpeakerBackground(c.data.background) || (c.data.src === SPEAKER_ALPHA_SRC ? "alpha" : "room");
}

/** The scene's speaker component, when cast. */
export function speakerLayerOf(scene: SceneLike | null | undefined): Comp | undefined {
  return ((scene?.components || []) as Comp[]).find((c) => isSpeakerLayer(c)) || undefined;
}

/** The scene's background setting for the speaker (room when no component). */
export function sceneSpeakerBackground(scene: SceneLike | null | undefined): SpeakerBackground {
  return speakerBackgroundOf(speakerLayerOf(scene));
}

/** True when the scene plays the speaker INSIDE it (background alpha) --
 *  it then renders opaque over the camera base, which would otherwise
 *  double the person. */
export function speakerRendersInside(scene: SceneLike | null | undefined): boolean {
  return sceneSpeakerBackground(scene) === "alpha";
}

function fullStage(p: any): boolean {
  if (!p || typeof p !== "object") return false;
  const n = (v: unknown) => parseFloat(String(v));
  return n(p.x) === 0 && n(p.y) === 0 && n(p.width) === 100 && n(p.height) === 100;
}

/**
 * The scene's GROUND: a full-stage `video` or `image` that holds the whole
 * beat (no cut window, or one that opens at the start and runs to the
 * end). A clip cut in mid-beat is a cutaway, not a ground. A ground under
 * the person is what asks for the alpha background by default.
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
    if (!src || src === SPEAKER_SRC) return false;
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
 * Cast the speaker component on a scene. Idempotent; returns true when it
 * was added. Over a ground it sits right above it (ground z 1, speaker
 * z 2, anything that stood at or under those rises above them, so the
 * graphics that rode over the person keep riding over them); with no
 * ground it sits at the bottom of the stack. The default background is
 * alpha over a ground, room otherwise, unless one is given.
 */
export function castSpeakerLayer(scene: SceneLike | null | undefined, opts: { background?: SpeakerBackground } = {}): boolean {
  if (!scene || !Array.isArray(scene.components)) return false;
  if (speakerLayerOf(scene)) return false;
  const comps = scene.components as Comp[];
  const ground = groundOf(scene);
  const background = opts.background || (ground ? "alpha" : "room");
  const layer: Comp = {
    id: SPEAKER_LAYER_ID,
    type: "video",
    z_index: ground ? 2 : 1,
    position: { x: 0, y: 0, width: "100%", height: "100%" },
    data: { src: SPEAKER_SRC, object_fit: "cover", speaker_layer: true, background },
  };
  for (const c of comps) {
    if (!c || c === ground) continue;
    const z = Number(c.z_index);
    const floor = ground ? 2 : 1;
    if (!Number.isFinite(z) || z <= floor) c.z_index = (Number.isFinite(z) ? z : 0) + floor + 1;
  }
  if (ground) {
    ground.z_index = 1;
    comps.splice(comps.indexOf(ground) + 1, 0, layer);
  } else {
    comps.unshift(layer);
  }
  return true;
}

/** Set the scene's speaker background (casting the component when
 *  missing). Returns the component, or null when the scene cannot carry
 *  one (no components list). */
export function setSpeakerBackground(scene: SceneLike | null | undefined, background: SpeakerBackground): Comp | null {
  if (!scene || !Array.isArray(scene.components)) return null;
  castSpeakerLayer(scene, { background });
  const layer = speakerLayerOf(scene)!;
  layer.data = { ...(layer.data || {}), src: layer.data?.src === SPEAKER_ALPHA_SRC ? SPEAKER_SRC : (layer.data?.src || SPEAKER_SRC), speaker_layer: true, background };
  return layer;
}

/** The files a take has: the raw recording, and the copies the matte
 *  wrote. Older takes stored the blurred copy AS the source with the raw
 *  at background.source_raw; both shapes read the same here. */
export function takeCopies(take: TakeLike | null | undefined): { raw: string; blur?: string; alpha?: string } {
  if (!take) return { raw: "" };
  const legacyBlur = take.background && take.background.mode === "blur" && take.background.source_raw ? take.source : undefined;
  const raw = (take.background && take.background.mode === "blur" && take.background.source_raw) || take.source;
  return { raw, ...((take.blur || legacyBlur) ? { blur: take.blur || legacyBlur } : {}), ...(take.alpha ? { alpha: take.alpha } : {}) };
}

/** True when the url is one of the take's files. */
export function takeOwns(take: TakeLike | null | undefined, url: string | undefined): boolean {
  if (!take || !url) return false;
  const c = takeCopies(take);
  return url === c.raw || url === c.blur || url === c.alpha;
}

/** The newest take behind a clip. */
export function takeForClip(project: ProjectLike, clip: ClipLike): TakeLike | undefined {
  return [...(project.takes || [])].reverse().find((t) => t.scene_index === clip.scene_index && takeOwns(t, clip.source));
}

/**
 * Point every clip of the speaker track at the copy its scene's setting
 * wants: the blurred copy as the base under a blur scene, the raw take
 * otherwise; the alpha copy carried on the clip for an alpha scene. A
 * copy that does not exist yet leaves the raw take in place. Returns how
 * many clips changed.
 */
export function syncSpeakerClips(project: ProjectLike): number {
  let changed = 0;
  for (const clip of project.speaker_track?.clips || []) {
    if (clip.scene_index === undefined) continue;
    const take = takeForClip(project, clip);
    if (!take) continue;
    const copies = takeCopies(take);
    const mode = sceneSpeakerBackground((project.scenes || [])[clip.scene_index]);
    const wantSource = mode === "blur" && copies.blur ? copies.blur : copies.raw;
    if (clip.source !== wantSource) { clip.source = wantSource; changed++; }
    if (copies.alpha && clip.alpha !== copies.alpha) { clip.alpha = copies.alpha; changed++; }
    if (!copies.alpha && clip.alpha) { delete clip.alpha; changed++; }
  }
  return changed;
}

/** The copies a take still lacks for the settings of the scenes it
 *  covers: what the matte must make. */
export function missingSpeakerCopies(project: ProjectLike, take: TakeLike): { blur: boolean; alpha: boolean } {
  const copies = takeCopies(take);
  let blur = false, alpha = false;
  for (const clip of project.speaker_track?.clips || []) {
    if (clip.scene_index === undefined || !takeOwns(take, clip.source)) continue;
    const mode = sceneSpeakerBackground((project.scenes || [])[clip.scene_index]);
    if (mode === "blur" && !copies.blur) blur = true;
    if (mode === "alpha" && !copies.alpha) alpha = true;
  }
  return { blur, alpha };
}

/**
 * Bind the speaker component's data for assembly (background alpha): the
 * token becomes the take's alpha copy -- or the plain take while none
 * exists -- seeked to the take's trim so it runs on the same clock as
 * the base. Returns null when there is no take at all: the caller leaves
 * the component out (a black window would bury the ground). Any other
 * component's data comes back untouched.
 */
export function bindSpeakerLayerData(
  data: Record<string, any>,
  speaker: { alphaUrl?: string; url?: string; offset?: number } | null | undefined,
): Record<string, any> | null {
  if (!data || !(data.speaker_layer === true || data.src === SPEAKER_ALPHA_SRC)) return data;
  // Already a file (the render binds before the worker assembles): keep it
  // -- binding twice swapped the alpha copy for the opaque base (measured).
  if (data.src !== SPEAKER_SRC && data.src !== SPEAKER_ALPHA_SRC) return data;
  const src = speaker?.alphaUrl || speaker?.url;
  if (!src) return null;
  // `speaker_layer` keeps the component recognisable once the token is a
  // file (the render resolves it before the compositing rule runs);
  // `alpha` tells the video component not to paint under the clip.
  return { ...data, src, start_at: Math.max(0, Number(speaker?.offset) || 0), speaker_layer: true, background: "alpha", ...(speaker?.alphaUrl ? { alpha: true } : { speaker_opaque: true }) };
}
