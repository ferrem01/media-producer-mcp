/**
 * THE CAST PLAN: who performs each person-carried scene, how, with which
 * engine and where (SPEC-cast-scenes.md), on each scene:
 * `storyboard.scenes[i].performer` -- every scene can be someone else, so the
 * film holds no plan of its own (a legacy `storyboard.cast_plan` fills in for
 * old films until their next plan edit). Two functions, three choices:
 *
 *   me            record                      (the booth)
 *   a cast member recast my recording         Genjutsu (higgsfield), Kling, HeyGen, Runway
 *   a cast member generate, no recording      Seedance (in a Location), HeyGen (the look is the setting)
 *
 * The plan says what is wanted; nothing is made by a plan edit. Each scene's
 * STATE is derived: ready (its take answers the plan), todo (nothing made
 * yet), stale (made, but for another plan) -- re-performing is always asked.
 */
import type { CastPlan, Project } from "./types.js";
import type { CastActor } from "./cast.js";

export type PlanHow = NonNullable<CastPlan["how"]>;
export const HOWS: PlanHow[] = ["record", "recast", "generate"];
export const ENGINES: Record<PlanHow, string[]> = {
  record: [],
  recast: ["higgsfield", "kling", "heygen", "runway"],
  generate: ["seedance", "heygen"],
};
export const ENGINE_LABEL: Record<string, string> = {
  higgsfield: "Genjutsu", kling: "Kling", heygen: "HeyGen", runway: "Runway", seedance: "Seedance",
};

/** The engine when the plan names none: HeyGen for a HeyGen look (its look
 *  is its setting), else Genjutsu to recast (one-to-one, Marc's pick on Oct 4)
 *  and Seedance to generate. */
export function defaultEngine(how: PlanHow, actor?: CastActor | null): string | undefined {
  if (how === "record") return undefined;
  if (actor?.heygen_look_id) return "heygen";
  return how === "recast" ? "higgsfield" : "seedance";
}

export interface ResolvedPlan {
  actor: string | null;
  how: PlanHow;
  engine?: string;
  location?: string;
  /** The fields this scene takes from the film's plan. */
  from_film: Array<keyof CastPlan>;
  /** No plan anywhere: read off what the scene already plays (a film made
   *  before plans existed reads as what it is, not as stale). */
  inferred?: boolean;
}

/** A scene's plan: its own fields (a legacy film-wide plan fills in). No how anywhere: a cast
 *  member recasts the scene's recording when there is one, else generates;
 *  nobody named is me, recording. */
export function resolvePlan(project: Project, si: number, actors: CastActor[] = [], hasRecording = false): ResolvedPlan {
  const film: CastPlan = (project as any).storyboard?.cast_plan || {};
  const own: CastPlan = (project as any).storyboard?.scenes?.[si]?.performer || {};
  const from_film: Array<keyof CastPlan> = [];
  const pick = <K extends keyof CastPlan>(k: K): CastPlan[K] => {
    if (own[k] !== undefined) return own[k];
    if (film[k] !== undefined) { from_film.push(k); return film[k]; }
    return undefined;
  };
  let actor = pick("actor") ?? null;
  let how = pick("how") as PlanHow | undefined;
  // Nothing planned at all: what the scene already is -- its performance
  // (generated), else the recast it plays.
  const sc: any = (project as any).storyboard?.scenes?.[si] || {};
  const planned = Object.keys(own).length || Object.keys(film).length;
  let inferred = false;
  if (!planned) {
    const perf = sc.performance;
    const cast = sc.cast !== undefined ? sc.cast : (project as any).speaker_cast ?? null;
    if (perf?.actor && (perf.draft || perf.final)) {
      inferred = true; actor = perf.actor; how = "generate";
      const made = perf.made_with?.engine || "seedance";
      const loc = perf.made_with?.location || perf.location;
      const out = { actor, how, engine: made, ...(made === "seedance" && loc ? { location: loc } : {}), from_film, inferred };
      return out as ResolvedPlan;
    }
    if (cast) { inferred = true; actor = cast; how = "recast"; }
  }
  if (!how) how = actor ? (hasRecording ? "recast" : "generate") : "record";
  if (how === "record") actor = null;
  const actorObj = actor ? actors.find((a) => a.id === actor) || null : null;
  const named = pick("engine");
  const engine = how === "record" ? undefined : (named && ENGINES[how].includes(named) ? named : defaultEngine(how, actorObj));
  const loc = pick("location");
  const location = how === "generate" && engine === "seedance" && loc ? loc : undefined;
  return { actor, how, ...(engine ? { engine } : {}), ...(location ? { location } : {}), from_film, ...(inferred ? { inferred } : {}) };
}

/** One field of a scene's plan as written: its own, else the film's (no
 *  defaults, no checks) -- e.g. the location a Seedance perform uses even
 *  when the plan says recast. */
export function planField<K extends keyof CastPlan>(project: Project, si: number, k: K): CastPlan[K] {
  const own: CastPlan = (project as any).storyboard?.scenes?.[si]?.performer || {};
  return own[k] !== undefined ? own[k] : ((project as any).storyboard?.cast_plan || {})[k];
}

/** One line for a board card: "Dana · Generate · Seedance · Loft lounge". */
export function planLine(plan: ResolvedPlan, actors: CastActor[] = [], locations: Array<{ id: string; name: string }> = []): string {
  if (plan.how === "record") return "Me · Record";
  const who = actors.find((a) => a.id === plan.actor)?.name || plan.actor || "?";
  const parts = [who, plan.how === "recast" ? "Recast" : "Generate", ENGINE_LABEL[plan.engine || ""] || plan.engine || ""];
  if (plan.location) parts.push(locations.find((l) => l.id === plan.location)?.name || plan.location);
  return parts.filter(Boolean).join(" · ");
}

export type PlanState = "ready" | "todo" | "stale";

/** Does the scene's take answer its plan? `take` is the take its clip plays
 *  (performed_by for a performance; recast_by the actors it was recast as). */
export function planState(project: Project, si: number, plan: ResolvedPlan,
  take: { performed_by?: { actor: string; engine?: string } | null; recast_by?: string[] } | null, hasRecording: boolean): { state: PlanState; why?: string } {
  const scene: any = (project as any).storyboard?.scenes?.[si] || {};
  const perf = scene.performance || {};
  const cast = scene.cast !== undefined ? scene.cast : (project as any).speaker_cast ?? null;
  if (plan.how === "record") {
    if (take?.performed_by) return { state: "stale", why: `performed by ${take.performed_by.actor}; the plan is your recording` };
    if (!hasRecording) return { state: "todo", why: "record this scene" };
    return cast ? { state: "stale", why: `plays ${cast}'s recast; the plan is your recording` } : { state: "ready" };
  }
  if (plan.how === "recast") {
    if (take?.performed_by) return { state: "stale", why: `generated; the plan is a recast of your recording` };
    if (!hasRecording) return { state: "todo", why: "record this scene first: a recast needs your recording" };
    if (cast === plan.actor && (take?.recast_by || []).includes(plan.actor!)) return { state: "ready" };
    return cast || (take?.recast_by || []).length ? { state: "stale", why: `not recast as ${plan.actor} yet` } : { state: "todo", why: `recast as ${plan.actor}` };
  }
  // generate
  const pb = take?.performed_by;
  if (!pb) return hasRecording || cast ? { state: "stale", why: `your recording plays; the plan is ${plan.actor} generated` } : { state: "todo", why: "perform it" };
  if (pb.actor !== plan.actor) return { state: "stale", why: `performed by ${pb.actor}; the plan is ${plan.actor}` };
  if ((pb.engine || "seedance") !== (plan.engine || "seedance")) return { state: "stale", why: `made with ${ENGINE_LABEL[pb.engine || ""] || pb.engine}; the plan is ${ENGINE_LABEL[plan.engine || ""] || plan.engine}` };
  const made = perf.made_with;
  if (made && (made.location || "") !== (plan.location || "")) return { state: "stale", why: plan.location ? `made ${made.location ? "in another location" : "with no location"}; the plan is ${plan.location}` : "made in a location the plan no longer has" };
  return { state: "ready" };
}

/** A plan as given (MCP, API, Studio), checked against the cast and the
 *  locations. undefined fields stay as they are; "" or null clears one
 *  (actor null = me). Returns the cleaned fields to write. */
export function cleanPlan(input: Record<string, unknown>, actors: CastActor[], locations: Array<{ id: string }>): Partial<Record<keyof CastPlan, unknown>> {
  const out: Partial<Record<keyof CastPlan, unknown>> = {};
  if (input.actor !== undefined) {
    // null (or "me"): me, even when the film names an actor; "": the film's.
    const a = input.actor === null || input.actor === "me" ? null : String(input.actor);
    if (a && !actors.some((x) => x.id === a)) throw new Error(`No cast actor "${a}"`);
    out.actor = a;
  }
  if (input.how !== undefined) {
    const h = input.how === null || input.how === "" ? "" : String(input.how);
    if (h && !HOWS.includes(h as PlanHow)) throw new Error(`how must be ${HOWS.join(", ")}`);
    out.how = h;
  }
  if (input.engine !== undefined) {
    const e = input.engine === null ? "" : String(input.engine);
    if (e && !ENGINES.recast.includes(e) && !ENGINES.generate.includes(e)) throw new Error(`engine must be one of ${[...new Set([...ENGINES.recast, ...ENGINES.generate])].join(", ")}`);
    out.engine = e;
  }
  if (input.location !== undefined) {
    // null (or "none"): no location, even when the film has one; "": the film's.
    const l = input.location === null || input.location === "none" ? null : String(input.location);
    if (l && !locations.some((x) => x.id === l)) throw new Error(`No location "${l}"`);
    out.location = l;
  }
  return out;
}

/** Write cleaned fields onto a plan object ("" removes a field, back to the
 *  film's; null stays: actor null = me, location null = none, over the
 *  film's). Returns the plan, or undefined when nothing is left. */
export function writePlan(plan: CastPlan | undefined, fields: Partial<Record<keyof CastPlan, unknown>>): CastPlan | undefined {
  const p: any = { ...(plan || {}) };
  for (const [k, v] of Object.entries(fields)) {
    if (v === "" || v === undefined) delete p[k];
    else p[k] = v;
  }
  // Me records: an actor alongside "record" is noise.
  if (p.how === "record") p.actor = null;
  if (p.how && p.how !== "record" && p.engine && !ENGINES[p.how as PlanHow].includes(p.engine)) throw new Error(`${ENGINE_LABEL[p.engine] || p.engine} cannot ${p.how} (use ${ENGINES[p.how as PlanHow].map((e) => ENGINE_LABEL[e]).join(" or ")})`);
  return Object.keys(p).length ? p : undefined;
}

/** Apply a plan edit to a project in memory: the film's plan and/or scenes'
 *  (`performer`: fields to set, or null to follow the film again). Checked
 *  against the tenant's cast and locations. Nothing is made. */
export async function applyPlanEdit(tenant: string, project: Project, edit: {
  /** Applied to EVERY scene (each scene's own plan is written); nothing is
   *  kept on the film -- a film's scenes can each be someone else (Marc,
   *  Oct 5: "it does not make sense to have that data stored at the film
   *  level"). null clears every scene's plan. */
  cast_plan?: Record<string, unknown> | null;
  scenes?: Array<{ index: number; performer: Record<string, unknown> | null }>;
}): Promise<void> {
  const sb: any = (project as any).storyboard;
  if (!sb) throw new Error("The film has no storyboard");
  const { listCast } = await import("./cast.js");
  const { listLocations } = await import("./locations.js");
  const [actors, locations] = await Promise.all([listCast(tenant), listLocations(tenant)]);
  // A film still carrying the old film-level plan: it becomes each scene's
  // own (a scene's own fields win), and the film keeps none.
  if (sb.cast_plan) {
    for (const sc of sb.scenes || []) if (sc) sc.performer = { ...sb.cast_plan, ...(sc.performer || {}) };
    delete sb.cast_plan;
  }
  if (edit.cast_plan !== undefined) {
    const fields = edit.cast_plan === null ? null : cleanPlan(edit.cast_plan, actors, locations);
    for (const sc of sb.scenes || []) {
      if (!sc) continue;
      const next = fields === null ? undefined : writePlan(sc.performer, fields);
      if (next) sc.performer = next; else delete sc.performer;
    }
  }
  for (const e of edit.scenes || []) {
    const sc = sb.scenes?.[e.index];
    if (!sc) throw new Error(`No scene ${e.index + 1}`);
    const next = e.performer === null ? undefined : writePlan(sc.performer, cleanPlan(e.performer, actors, locations));
    if (next) sc.performer = next; else delete sc.performer;
  }
}
