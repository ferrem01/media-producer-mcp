/**
 * ONE WRITER AT A TIME PER FILM. A background job (a take's grade) loads
 * the project, works, then saves the WHOLE file back -- two of them on one
 * film, or a job beside a Studio edit, and the later save wipes the
 * earlier one's change (Marc, Oct 8, proj_3bd9cad6: "I tried to unclick
 * [the soft look] and it claims to have removed it ... when I open the
 * inspector again it is checked again"). Writers that go through here load,
 * change and save with no other locked writer on that film in between.
 * In-process only: the server is one process.
 */
const tails = new Map<string, Promise<void>>();

export async function withProjectLock<T>(tenantId: string, projectId: string, fn: () => Promise<T>): Promise<T> {
  const key = `${tenantId}/${projectId}`;
  const prev = tails.get(key) || Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
