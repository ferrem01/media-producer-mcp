/**
 * The tenant LIBRARY: find a film without remembering its name.
 *
 * 251 films in one tenant and the only way in was a project id. This builds
 * the card a person recognises (a still, the name, how long, what state) and
 * a haystack of everything they might search on -- not just the title, but
 * the words ON SCREEN, the narrative, and the prompt that started it.
 * Searching "what if" or "sales call" has to find the film that says it.
 *
 * The index is held in memory and re-read per project only when that
 * project.json's mtime moves, so a search over the whole tenant costs one
 * stat per project after the first pass.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { projectsDir, projectJsonPath } from "../persistence/paths.js";
import { loadProject } from "../persistence/project.js";
import type { Project } from "./types.js";

export interface LibraryCard {
  project_id: string;
  name: string;
  status: string;
  format: string;
  frame: string;
  scene_count: number;
  duration_seconds: number;
  rendered: boolean;
  render_stale?: boolean;
  render_size_bytes?: number;
  film_grammar?: string;
  created_at?: string;
  updated_at?: string;
  archived_at?: string;
  /** Best guess at "when did this last change", always present: the project's
   *  own updated_at/created_at when it has one (111 of 251 did not), else the
   *  file's mtime. Sorting a library by date cannot have holes in it. */
  touched_at: string;
}

interface Entry {
  mtime: number;
  card: LibraryCard;
  haystack: { name: string; intent: string; screen: string };
}

const index = new Map<string, Entry>();

/** Strings that are data, not language: asset urls, data URIs, ids, colors. */
function isProse(s: string): boolean {
  if (s.length < 2 || s.length > 4000) return false;
  if (/^(data:|https?:|\/assets\/|\/output\/|#[0-9a-f]{3,8}$)/i.test(s)) return false;
  if (/^[a-z0-9_-]{16,}$/i.test(s)) return false;       // ids, tokens
  return /[a-z]{2}/i.test(s);
}

function collectStrings(value: unknown, out: string[], budget = { left: 24000 }, depth = 0): void {
  if (budget.left <= 0 || depth > 8) return;
  if (typeof value === "string") {
    if (isProse(value)) { out.push(value); budget.left -= value.length; }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, budget, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out, budget, depth + 1);
    }
  }
}

function buildEntry(project: Project, mtime: number): Entry {
  const scenes = project.scenes || [];
  const duration = scenes.reduce((sum, s) => sum + (Number(s.duration_seconds) || 0), 0);
  const p = project as unknown as Record<string, any>;

  // What the film is ABOUT, in the words the person used.
  const intent: string[] = [];
  if (p.prompt) intent.push(String(p.prompt));
  if (p.storyboard?.narrative) intent.push(String(p.storyboard.narrative));
  if (p.treatment?.concept) intent.push(String(p.treatment.concept));
  for (const s of scenes) {
    const sc = s as unknown as Record<string, any>;
    for (const k of ["label", "purpose", "visual_notes"]) if (sc[k]) intent.push(String(sc[k]));
  }
  for (const s of (p.storyboard?.scenes || [])) {
    for (const k of ["label", "purpose", "visual_notes", "voiceover_text"]) {
      if (s?.[k]) intent.push(String(s[k]));
    }
  }

  // What is ON SCREEN: every string a component carries.
  const screen: string[] = [];
  const budget = { left: 24000 };
  for (const s of scenes) {
    for (const c of (s.components || [])) collectStrings((c as any).data, screen, budget);
    if (budget.left <= 0) break;
  }

  const card: LibraryCard = {
    project_id: project.project_id,
    name: project.name,
    status: project.status,
    format: project.format,
    frame: (project.canvas as any)?.frame || "16x9",
    scene_count: scenes.length,
    duration_seconds: Math.round(duration * 10) / 10,
    rendered: !!p.rendered,
    render_stale: p.render_stale || undefined,
    render_size_bytes: p.render_size_bytes || undefined,
    film_grammar: p.treatment?.filmGrammar || p.film_grammar || undefined,
    created_at: p.created_at || undefined,
    updated_at: p.updated_at || undefined,
    archived_at: p.archived_at || undefined,
    touched_at: p.updated_at || p.created_at || new Date(mtime).toISOString(),
  };

  return {
    mtime,
    card,
    haystack: {
      name: project.name.toLowerCase(),
      intent: intent.join(" \n ").toLowerCase().slice(0, 24000),
      screen: screen.join(" \n ").toLowerCase().slice(0, 24000),
    },
  };
}

/** Read every project in the tenant, reusing index entries whose file has not moved. */
export async function libraryEntries(tenantId: string): Promise<Entry[]> {
  const dir = projectsDir(tenantId);
  let names: string[];
  try {
    names = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.startsWith("proj_"))
      .map((e) => e.name);
  } catch { return []; }

  const live = new Set<string>();
  const out: Entry[] = [];
  for (const id of names) {
    const key = `${tenantId}/${id}`;
    live.add(key);
    let mtime = 0;
    try { mtime = (await fs.stat(projectJsonPath(tenantId, id))).mtimeMs; } catch { continue; }
    const cached = index.get(key);
    if (cached && cached.mtime === mtime) { out.push(cached); continue; }
    const project = await loadProject(tenantId, id);
    if (!project) continue;
    const entry = buildEntry(project, mtime);
    index.set(key, entry);
    out.push(entry);
  }
  // Drop entries for projects that are gone, so a deleted film leaves no ghost.
  for (const key of [...index.keys()]) {
    if (key.startsWith(`${tenantId}/`) && !live.has(key)) index.delete(key);
  }
  return out;
}

export function forgetProject(tenantId: string, projectId: string): void {
  index.delete(`${tenantId}/${projectId}`);
}

export type LibrarySort = "recent" | "name" | "longest";
export type LibraryFilter = "all" | "rendered" | "built" | "board";

function matchesFilter(card: LibraryCard, filter: LibraryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "rendered") return card.rendered;
  if (filter === "built") return !card.rendered && (card.status === "generated" || card.status === "rendering");
  return !card.rendered && (card.status === "storyboard" || card.status === "draft");
}

/**
 * Score a card against the query. Every token must appear SOMEWHERE (a search
 * is a filter, not a suggestion); where it appears sets the rank -- the title
 * you half-remember beats a word buried in a caption.
 */
function score(entry: Entry, tokens: string[]): number {
  let total = 0;
  for (const t of tokens) {
    const inName = entry.haystack.name.includes(t);
    const inIntent = entry.haystack.intent.includes(t);
    const inScreen = entry.haystack.screen.includes(t);
    if (!inName && !inIntent && !inScreen) return -1;
    total += inName ? 6 : inIntent ? 3 : 1;
  }
  if (entry.haystack.name.includes(tokens.join(" "))) total += 8;  // the whole phrase, in the title
  return total;
}

export interface LibraryQuery {
  q?: string;
  filter?: LibraryFilter;
  sort?: LibrarySort;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface LibraryResult {
  cards: Array<LibraryCard & { copies?: LibraryCard[] }>;
  total: number;
  counts: { all: number; rendered: number; built: number; board: number; archived: number };
}

/** Films that share a name are the norm here (ten copies of one idea). Group
 *  them under the newest, with the rest carried along, so the library shows
 *  IDEAS and the copies stay one click away. */
function groupCopies(cards: LibraryCard[]): Array<LibraryCard & { copies?: LibraryCard[] }> {
  const byName = new Map<string, LibraryCard[]>();
  for (const c of cards) {
    const key = c.name.trim().toLowerCase();
    (byName.get(key) || byName.set(key, []).get(key)!).push(c);
  }
  const out: Array<LibraryCard & { copies?: LibraryCard[] }> = [];
  for (const group of byName.values()) {
    if (group.length === 1) { out.push(group[0]); continue; }
    // The rendered one is the one you want to see first; then the newest.
    const sorted = [...group].sort((a, b) =>
      (Number(b.rendered) - Number(a.rendered)) || b.touched_at.localeCompare(a.touched_at));
    out.push({ ...sorted[0], copies: sorted.slice(1) });
  }
  return out;
}

export async function searchLibrary(tenantId: string, query: LibraryQuery): Promise<LibraryResult> {
  const entries = await libraryEntries(tenantId);
  const wantArchived = !!query.archived;
  const visible = entries.filter((e) => !!e.card.archived_at === wantArchived);

  const counts = {
    all: visible.length,
    rendered: visible.filter((e) => matchesFilter(e.card, "rendered")).length,
    built: visible.filter((e) => matchesFilter(e.card, "built")).length,
    board: visible.filter((e) => matchesFilter(e.card, "board")).length,
    archived: entries.filter((e) => !!e.card.archived_at).length,
  };

  const filter = query.filter || "all";
  let pool = visible.filter((e) => matchesFilter(e.card, filter));

  const q = (query.q || "").trim().toLowerCase();
  let ranked: LibraryCard[];
  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = pool
      .map((e) => ({ e, s: score(e, tokens) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || b.e.card.touched_at.localeCompare(a.e.card.touched_at));
    ranked = scored.map((x) => x.e.card);
  } else {
    const sort = query.sort || "recent";
    ranked = pool.map((e) => e.card).sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name)
      : sort === "longest" ? b.duration_seconds - a.duration_seconds
      : b.touched_at.localeCompare(a.touched_at));
  }

  const grouped = q ? ranked : groupCopies(ranked);
  const offset = Math.max(0, query.offset || 0);
  const limit = Math.min(200, Math.max(1, query.limit || 60));
  return { cards: grouped.slice(offset, offset + limit), total: grouped.length, counts };
}
