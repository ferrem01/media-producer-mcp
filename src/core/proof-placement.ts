/**
 * PROOF USE (SPEC-creator-formats.md): where a beat's proof sits relative to
 * the person -- the "where the proof lives" half of the talking-head types.
 * A proof need's `use`. The four that existed (cutaway, split, card, clip)
 * plus ten more. One function, placeProof, turns the full-bleed proof the
 * build casts (or the slate standing in for it) into its placed form, so
 * every caller -- provided proofs, slates, a pick applied to a built scene --
 * places it the same way.
 */

export type ProofUse =
  | "cutaway" | "split" | "card" | "clip"
  | "green" | "tv" | "laptop" | "phone" | "whiteboard" | "point" | "react"
  | "prop" | "demo" | "clone";

export interface ProofUseInfo {
  id: ProofUse;
  name: string;
  /** The layout the build gives it. */
  layout: string;
  /** What the booth tells the person, when the beat asks something of them. */
  booth?: string;
}

export const PROOF_USES: ProofUseInfo[] = [
  { id: "cutaway", name: "Cutaway", layout: "full frame, hard cut in on the word and out (the default)" },
  { id: "split", name: "Split Screen", layout: "tall frame: the screen owns the top, the person under it" },
  { id: "card", name: "Card", layout: "a plated card beside the person" },
  { id: "clip", name: "Clip", layout: "a live-action moment on a film no person carries", booth: "Record the moment." },
  { id: "green", name: "Green Screen", layout: "the proof is the ground for the whole beat; the person plays cut out over it" },
  { id: "tv", name: "TV", layout: "the proof on a TV set beside the person" },
  { id: "laptop", name: "Laptop", layout: "the proof on a laptop beside the person" },
  { id: "phone", name: "Phone", layout: "the proof in a phone frame beside the person" },
  { id: "whiteboard", name: "Whiteboard", layout: "the proof pinned to a whiteboard beside the person, a marker title" },
  { id: "point", name: "Point & Explain", layout: "a card on the side the person points to", booth: "Point to it as you say it: it appears on the side away from your face." },
  { id: "react", name: "React", layout: "the proof on top (tall frame) or to the side (wide), the person reacting", booth: "Watch it and react; stop to comment." },
  { id: "prop", name: "Prop", layout: "nothing is drawn: the person holds the thing up", booth: "Hold it up to the lens as you say it." },
  { id: "demo", name: "Demonstrate", layout: "nothing is drawn: the person shows it with their hands", booth: "Show it with your hands as you say it." },
  { id: "clone", name: "Clone", layout: "a second take of the same person fills the other half of the frame", booth: "Lock the phone in one place. Take A: sit on the left half of the frame. Take B: same spot of the phone, sit on the right half and answer yourself." },
];

export const PROOF_USE_IDS: ProofUse[] = PROOF_USES.map((u) => u.id);

export function asProofUse(v: unknown): ProofUse | undefined {
  const s = String(v ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const alias: Record<string, ProofUse> = { "green-screen": "green", "behind": "green", "split-screen": "split", "point-and-explain": "point", "demonstrate": "demo", "dual-role": "clone", "television": "tv", "monitor": "tv" };
  const id = (alias[s] || s) as ProofUse;
  return (PROOF_USE_IDS as string[]).includes(id) ? id : undefined;
}

/** The uses drawn in a proof-frame (a self-placing frame around the proof). */
export const FRAMED_USES = new Set<ProofUse>(["tv", "laptop", "phone", "whiteboard", "card", "point", "react"]);
/** Directions, not files: the person performs them; nothing is drawn. */
export const DIRECTION_USES = new Set<ProofUse>(["prop", "demo"]);
export function isDirectionUse(v: unknown): boolean { const u = asProofUse(v); return !!u && DIRECTION_USES.has(u); }

export const PROOF_FRAME_TYPE = "proof-frame";

/** The half of the frame a clone take fills (Take B; right unless the need
 *  says left). */
export function clonePosition(side?: unknown): { x: string; y: string; width: string; height: string } {
  return { x: side === "left" ? "0%" : "50%", y: "0%", width: "50%", height: "100%" };
}

type Comp = Record<string, any>;

function timeOf(anim: unknown): unknown {
  return anim && typeof anim === "object" ? (anim as any).at : undefined;
}

/**
 * The proof placed as its use says. `comp` is what the build casts for a
 * proof today: a full-bleed `image` / `video` with `data.at` / `data.exit_at`,
 * or the slate (`asset-placeholder`, timed by `enter`/`exit` cuts or data).
 * Returns the placed component, or null when the use draws nothing (prop,
 * demo). cutaway / clip / undefined pass through unchanged; split marks the
 * data (the tall-frame layout reads it). Pure.
 */
export function placeProof(comp: Comp, use: unknown, opts: { side?: unknown } = {}): Comp | null {
  const u = asProofUse(use);
  if (!u || u === "cutaway" || u === "clip") return comp;
  if (DIRECTION_USES.has(u)) return null;
  const data: Comp = { ...(comp.data || {}) };
  if (u === "split") { data.use = "split"; return { ...comp, data }; }
  if (u === "green") {
    // THE GROUND FOR THE WHOLE BEAT: the person is cut out over it (the
    // speaker component reads a ground and plays the alpha copy). A green
    // proof that came and went mid-beat would leave the cut-out person over
    // nothing, so it holds the beat.
    delete data.at; delete data.exit_at;
    data.ground = true;
    if (comp.type === "image") data.drift = false;
    const out: Comp = { ...comp, data, z_index: 1, position: { x: "0%", y: "0%", width: "100%", height: "100%" } };
    delete out.enter; delete out.exit;
    return out;
  }
  if (u === "clone") {
    // Take B LISTENS: the scene's own take is the voice, so the clone plays
    // silent (its room tone would double the speaker's).
    const left = opts.side === "left";
    const cd: Comp = { ...data, object_position: left ? "left center" : "right center" };
    if (comp.type === "video") cd.volume = 0;
    return { ...comp, data: cd, position: clonePosition(opts.side) };
  }
  // A FRAMED USE: one self-placing proof-frame around the file (or the
  // slate's words), timed on its data so the cut-in camera rules (which
  // frame a full-bleed cutaway) leave it alone.
  const isSlate = comp.type === "asset-placeholder";
  const at = data.at !== undefined ? data.at : timeOf(comp.enter);
  const exitAt = data.exit_at !== undefined ? data.exit_at : timeOf(comp.exit);
  const fd: Comp = {
    chrome: u === "react" ? "none" : u === "point" ? "card" : u,
    place: u === "react" ? "split" : "side",
  };
  if (opts.side === "left" || opts.side === "right") fd.side = opts.side;
  if (isSlate) {
    for (const k of ["need", "text", "asset_type", "hint"]) if (data[k] !== undefined) fd[k] = data[k];
  } else {
    fd.src = data.src;
    fd.media = comp.type === "video" ? "video" : "image";
  }
  if (u === "whiteboard" && typeof data.title === "string") fd.title = data.title;
  if (at !== undefined) fd.at = at;
  if (exitAt !== undefined) fd.exit_at = exitAt;
  const out: Comp = { type: PROOF_FRAME_TYPE, data: fd, position: { x: "0%", y: "0%", width: "100%", height: "100%" } };
  if (comp.id) out.id = comp.id;
  if (comp.anchors && typeof comp.anchors === "object") {
    // The wrapper's cut anchors become the frame's data anchors (its clock).
    const a: Comp = {};
    for (const [k, v] of Object.entries(comp.anchors)) {
      if (k === "enter.at") { if (!("at" in a)) a.at = v; }
      else if (k === "exit.at") { if (!("exit_at" in a)) a.exit_at = v; }
      else if (k === "at" || k === "exit_at") a[k] = v;
    }
    if (Object.keys(a).length) out.anchors = a;
  }
  return out;
}
