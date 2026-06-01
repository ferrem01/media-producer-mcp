/**
 * Refresh token store.
 * Maps opaque refresh tokens to email. Persisted to disk.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

interface RefreshTokenEntry {
  email: string;
  tenantId: string;
  createdAt: string;
}

interface RefreshTokenData {
  tokens: Record<string, RefreshTokenEntry>;
}

const STORE_PATH = join(process.env.MP_DATA_DIR || "/data/media-producer", "_system", "refresh-tokens.json");
const tokens = new Map<string, RefreshTokenEntry>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw) as RefreshTokenData;
    for (const [token, entry] of Object.entries(data.tokens)) {
      tokens.set(token, entry);
    }
  } catch {
    // No existing data
  }
  loaded = true;
}

function persist(): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const data: RefreshTokenData = { tokens: Object.fromEntries(tokens) };
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

/** Create a new refresh token for a user. */
export function createRefreshToken(email: string, tenantId: string): string {
  ensureLoaded();
  const token = randomBytes(48).toString("base64url");
  tokens.set(token, { email, tenantId, createdAt: new Date().toISOString() });
  persist();
  return token;
}

/** Validate a refresh token. Returns the entry or null. */
export function validateRefreshToken(token: string): RefreshTokenEntry | null {
  ensureLoaded();
  return tokens.get(token) ?? null;
}

/** Rotate: invalidate old token, issue new one for same user. */
export function rotateRefreshToken(oldToken: string): { newToken: string; email: string; tenantId: string } | null {
  ensureLoaded();
  const entry = tokens.get(oldToken);
  if (!entry) return null;
  tokens.delete(oldToken);
  const newToken = randomBytes(48).toString("base64url");
  tokens.set(newToken, { email: entry.email, tenantId: entry.tenantId, createdAt: new Date().toISOString() });
  persist();
  return { newToken, email: entry.email, tenantId: entry.tenantId };
}
