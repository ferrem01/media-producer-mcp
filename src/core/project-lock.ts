/**
 * ONE WRITER AT A TIME PER FILM. A writer loads the project, works, then
 * saves the WHOLE file back -- two of them on one film, and the later save
 * wipes the earlier one's change (Marc, Oct 8, proj_3bd9cad6: the soft
 * look "removed" and back again; Oct 24, four email ads: a storyboard
 * update that ran past the client's 60 s timeout landed after a burst of
 * component adds and deletes and saved the film it had loaded before
 * them). Writers that go through here load, change and save with no other
 * locked writer on that film in between: the MCP edit tools, Studio's edit
 * routes, the persistence helpers, the storyboard tool's job, a scene's
 * performance, a take's attach, matte and grade, the render's status.
 *
 * Re-entrant: a writer already holding a film's lock (an MCP update that
 * calls updateComponent, a locked route that runs a take edit) runs the
 * inner one straight through instead of waiting on itself. A job started
 * inside a lock and still running after it is released waits like anyone.
 * In-process only: the server is one process.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const tails = new Map<string, Promise<void>>();
/** The films this async context holds, each with a flag cleared on release. */
const held = new AsyncLocalStorage<Map<string, { held: boolean }>>();

export async function withProjectLock<T>(tenantId: string, projectId: string, fn: () => Promise<T>): Promise<T> {
  const key = `${tenantId}/${projectId}`;
  const mine0 = held.getStore();
  if (mine0?.get(key)?.held) return fn();
  const prev = tails.get(key) || Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  await prev;
  const token = { held: true };
  const store = new Map(mine0 || []);
  store.set(key, token);
  try {
    return await held.run(store, fn);
  } finally {
    token.held = false;
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

/** Studio's EDIT routes: the requests that load a film, change it and save
 *  it in the request itself. The film they name is held for the request
 *  (index.ts) -- not the routes that start a job (render, generate,
 *  revise), whose jobs run long and take the lock where they save. */
const STUDIO_EDIT_ROUTES: RegExp[] = [
  /^\/api\/projects\/([^/]+)\/([^/]+)(?:\/(?:archive|reorder|scenes(?:\/[^/]+(?:\/components(?:\/[^/]+)?)?)?))?$/,
  /^\/api\/storyboard\/([^/]+)\/([^/]+)\/(?:order|scenes\/\d+)$/,
  /^\/api\/(?:storyboard-scene|camera-moves|scene-sfx|media-edits|speaker-level|music-level|take-edit|speaker-cut|speaker-restore|timelapse)\/([^/]+)\/([^/]+)$/,
];

export function studioEditFilm(method: string, urlPath: string): { tenant: string; project: string } | null {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  for (const re of STUDIO_EDIT_ROUTES) {
    const m = urlPath.match(re);
    if (m) {
      try { return { tenant: decodeURIComponent(m[1]), project: decodeURIComponent(m[2]) }; } catch { return null; }
    }
  }
  return null;
}
