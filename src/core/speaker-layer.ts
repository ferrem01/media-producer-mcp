/**
 * THE SPEAKER IS A VIDEO COMPONENT (Marc, 2026-09-20: "if the video
 * component had the ability to play source speaker or a file, you
 * wouldn't need a special speaker component ... add position and size
 * and you have lots of control").
 *
 * ONE RULE: a `video` component whose src is the "speaker" token is the
 * person. Any position, any size, any place in the stack, any number of
 * them. Its `background` says which copy of the take it plays:
 *
 *   room  -- the raw take.
 *   blur  -- the blurred copy (<name>-blur.mp4).
 *   alpha -- the person on a transparent frame (<name>-alpha.webm):
 *            whatever lies under the component -- a mock, footage, a
 *            still, the brand colour -- is the room behind the person.
 *
 * and `shape` rounds it (rectangle, rounded, circle) for a bubble in a
 * corner over a screencast.
 *
 * THE BASE IS AN OPTIMISATION, NOT A CONCEPT. When the speaker is the
 * usual full-frame person at the bottom of the stack on room or blur,
 * the renderer keeps its fast path: the camera is the ffmpeg base under a
 * transparent scene and the component draws nothing (speakerUsesBase).
 * Anywhere else -- alpha, a ground under it, a corner bubble -- the
 * component draws where it sits and the scene renders opaque
 * (speakerRendersInside). Nobody sees the difference.
 *
 * The copies are made once per take by the matte (core/take-matte.ts),
 * on request: the booth's choice, Studio's Background choice, or a scene
 * that already asks for one when the take lands. The raw take is always
 * kept; the speaker track's clips point at the copy each scene wants
 * (syncSpeakerClips). The speaker TRACK stays what it is -- the film's
 * clock and voice (the take's audio, trims, word timings); the component
 * is only the picture.
 *
 * Older shapes still read as the speaker: the "speaker-alpha" token and
 * the `speaker_layer` marker of the first cut; `pip_source: "speaker"` on
 * a screencast frame and a generated `<video src="speaker">` bubble keep
 * their own paths (scene-assembler.ts) untouched.
 */

export const SPEAKER_SRC = "speaker";
/** The older token of the alpha layer; read as background "alpha". */
export const SPEAKER_ALPHA_SRC = "speaker-alpha";
/** The default component id. */
export const SPEAKER_LAYER_ID = "speaker";

export type SpeakerBackground = "room" | "blur" | "alpha";
export const SPEAKER_BACKGROUNDS: readonly SpeakerBackground[] = ["room", "blur", "alpha"];
export type SpeakerShape = "rectangle" | "rounded" | "circle";
export const SPEAKER_SHAPES: readonly SpeakerShape[] = ["rectangle", "rounded", "circle"];

type Comp = { id?: string; type?: string; z_index?: number; position?: any; data?: Record<string, any>; enter?: any; exit?: any };
type SceneLike = { components?: Array<Comp | null> | null; duration_seconds?: number; transparent_background?: boolean };
type TakeLike = { source: string; blur?: string; alpha?: string; background?: { mode?: string; source_raw?: string } | null; scene_index?: number; silhouette?: { rows: Array<[number, number] | null> } };
type ClipLike = { source: string; alpha?: string; scene_index?: number };
type ProjectLike = { scenes?: SceneLike[] | null; takes?: TakeLike[] | null; speaker_track?: { clips: ClipLike[] } | null };

export function asSpeakerBackground(v: unknown): SpeakerBackground | null {
  if (v === "none") return "room";
  return (SPEAKER_BACKGROUNDS as readonly string[]).includes(String(v)) ? (v as SpeakerBackground) : null;
}
export function asSpeakerShape(v: unknown): SpeakerShape | null {
  return (SPEAKER_SHAPES as readonly string[]).includes(String(v)) ? (v as SpeakerShape) : null;
}

/** True when the data holds the speaker token (either spelling, or the
 *  first cut's marker). */
export function isSpeakerData(data: Record<string, any> | null | undefined): boolean {
  return !!data && (data.src === SPEAKER_SRC || data.src === SPEAKER_ALPHA_SRC || data.speaker_layer === true);
}

/** The speaker in 3D (captions behind and in front of the person, one
 *  camera over both): it IS the person -- it draws the take itself, from the
 *  room copy and the alpha copy -- so it counts as a speaker layer, always
 *  on alpha (it is what asks the matte for the cut-out). */
export const SPEAKER_3D_TYPE = "speaker-3d";

/** True when the component is the person: a video (or speaker-3d) on the
 *  speaker token. */
export function isSpeakerLayer(c: Comp | null | undefined): boolean {
  return !!c && (c.type === "video" || c.type === undefined || c.type === SPEAKER_3D_TYPE) && isSpeakerData(c.data);
}

/** The component's background setting (room when unset). */
export function speakerBackgroundOf(c: Comp | null | undefined): SpeakerBackground {
  if (!c || !c.data) return "room";
  if (c.type === SPEAKER_3D_TYPE) return "alpha";
  return asSpeakerBackground(c.data.background) || (c.data.src === SPEAKER_ALPHA_SRC ? "alpha" : "room");
}

/** Every speaker component of the scene. */
export function speakerLayersOf(scene: SceneLike | null | undefined): Comp[] {
  return ((scene?.components || []) as Comp[]).filter((c) => isSpeakerLayer(c));
}

/** The scene's first speaker component, when cast. */
export function speakerLayerOf(scene: SceneLike | null | undefined): Comp | undefined {
  return speakerLayersOf(scene)[0];
}

/** The scene's background setting for the speaker (room when no component). */
export function sceneSpeakerBackground(scene: SceneLike | null | undefined): SpeakerBackground {
  return speakerBackgroundOf(speakerLayerOf(scene));
}

/**
 * THE FAST PATH: the scene has exactly one speaker component, full-frame,
 * on room or blur, with nothing under it in the stack (the lowest z, no
 * ground). The camera is then the ffmpeg base under a transparent scene
 * and the component draws nothing -- the picture is the same.
 */
export function speakerUsesBase(scene: SceneLike | null | undefined): boolean {
  const layers = speakerLayersOf(scene);
  if (layers.length !== 1) return false;
  const c = layers[0];
  if (speakerBackgroundOf(c) === "alpha") return false;
  if (!fullStage(c.position)) return false;
  if (asSpeakerShape(c.data?.shape) && c.data!.shape !== "rectangle") return false;
  if (groundOf(scene)) return false;
  const z = Number(c.z_index);
  const zc = Number.isFinite(z) ? z : 0;
  for (const o of (scene?.components || []) as Comp[]) {
    if (!o || o === c) continue;
    const oz = Number(o.z_index);
    if ((Number.isFinite(oz) ? oz : 0) < zc) return false;
  }
  return true;
}

/** True when the scene draws the speaker INSIDE it (any speaker component
 *  off the fast path). The scene then renders opaque over the camera
 *  base, which would otherwise double the person. */
export function speakerRendersInside(scene: SceneLike | null | undefined): boolean {
  return speakerLayersOf(scene).length > 0 && !speakerUsesBase(scene);
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
    if (!src || src === SPEAKER_SRC || src === SPEAKER_ALPHA_SRC) return false;
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
 * Cast the speaker component on a scene (the usual full-frame person).
 * Idempotent; returns true when it was added. Over a ground it sits right above it (ground z 1, speaker
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
    data: { src: SPEAKER_SRC, object_fit: "cover", background },
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
  const d: Record<string, any> = { ...(layer.data || {}), src: layer.data?.src === SPEAKER_ALPHA_SRC ? SPEAKER_SRC : (layer.data?.src || SPEAKER_SRC), background };
  delete d.speaker_layer; // the first cut's marker: the token is the rule now
  layer.data = d;
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
    // speaker-3d tucks its side words behind the person: it carries the
    // take's measured silhouette in its data (every render path reads data).
    changed += stampSilhouette((project.scenes || [])[clip.scene_index], take.silhouette);
    changed += stampSilhouette(((project as any).storyboard?.scenes || [])[clip.scene_index], take.silhouette);
  }
  return changed;
}

/** Put the take's silhouette on the scene's speaker-3d components (or take
 *  a stale one off). Returns how many changed. */
function stampSilhouette(scene: any, silhouette: TakeLike["silhouette"]): number {
  let n = 0;
  for (const c of (scene && Array.isArray(scene.components) ? scene.components : [])) {
    if (!c || typeof c !== "object" || c.type !== SPEAKER_3D_TYPE || !c.data) continue;
    const want = silhouette && Array.isArray(silhouette.rows) ? silhouette : undefined;
    if (JSON.stringify(c.data.silhouette) === JSON.stringify(want)) continue;
    if (want) c.data.silhouette = want; else delete c.data.silhouette;
    n++;
  }
  return n;
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
 * Bind a speaker component's data for assembly, once the scene draws it
 * inside: the token becomes the file to play -- the alpha copy on alpha
 * (or the plain take while none exists), the clip the base plays
 * otherwise -- seeked to where that file stands at the scene's start.
 * Returns null when there is no take at all: the caller leaves the
 * component out (a black window would bury the ground). Any other
 * component's data, and a speaker already bound to a file, come back
 * untouched.
 */
export function bindSpeakerLayerData(
  data: Record<string, any>,
  speaker: { alphaUrl?: string; alphaOffset?: number; url?: string; offset?: number } | null | undefined,
  opts: { type?: string } = {},
): Record<string, any> | null {
  if (!isSpeakerData(data)) return data;
  if (data.src !== SPEAKER_SRC && data.src !== SPEAKER_ALPHA_SRC) return data;
  const is3d = opts.type === SPEAKER_3D_TYPE;
  const background = is3d ? "alpha" : (asSpeakerBackground(data.background) || (data.src === SPEAKER_ALPHA_SRC ? "alpha" : "room"));
  const useAlpha = background === "alpha" && !!speaker?.alphaUrl;
  const src = useAlpha ? speaker!.alphaUrl : speaker?.url;
  // speaker-3d still performs its captions before a take exists.
  if (!src) return is3d ? { ...data, src: "", background } : null;
  const offset = useAlpha ? (speaker!.alphaOffset ?? speaker!.offset) : speaker!.offset;
  const out: Record<string, any> = { ...data, src, start_at: Math.max(0, Number(offset) || 0), background };
  // speaker-3d draws the ROOM too (the raw take under the cut-out).
  if (is3d && speaker?.url) { out.room_src = speaker.url; out.room_start_at = Math.max(0, Number(speaker.offset) || 0); }
  delete out.speaker_layer;
  // `alpha` tells the video component not to paint under the clip;
  // `speaker_opaque` says the clip is the plain take standing in.
  if (useAlpha) out.alpha = true; else if (background === "alpha") out.speaker_opaque = true;
  return out;
}
