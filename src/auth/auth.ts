/**
 * Token-based authentication for media-producer-mcp.
 *
 * Reads AUTH_TOKENS env var in format: "token1:tenant1,token2:tenant2"
 * When AUTH_TOKENS is not set, all requests are allowed (dev mode).
 */

import type { IncomingMessage, ServerResponse } from "node:http";

export interface AuthToken {
  token: string;
  tenantId: string;
}

let tokenMap: Map<string, string> | null = null;

/**
 * Parse AUTH_TOKENS env var into a Map of token -> tenantId.
 * Returns null if AUTH_TOKENS is not set (dev mode).
 */
export function loadAuthTokens(): Map<string, string> | null {
  const raw = process.env.AUTH_TOKENS;
  if (!raw) return null;

  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 1) continue;
    const token = trimmed.slice(0, colonIdx);
    const tenantId = trimmed.slice(colonIdx + 1);
    if (token && tenantId) {
      map.set(token, tenantId);
    }
  }
  return map.size > 0 ? map : null;
}

/**
 * Validate a token. Returns tenantId if valid, null otherwise.
 * In dev mode (no AUTH_TOKENS), returns null (caller should allow).
 */
export function validateToken(token: string): string | null {
  if (!tokenMap) {
    tokenMap = loadAuthTokens();
  }
  if (!tokenMap) return null; // dev mode -- handled by caller
  return tokenMap.get(token) || null;
}

/**
 * Check if auth is enabled (AUTH_TOKENS is set).
 */
export function isAuthEnabled(): boolean {
  if (!tokenMap) {
    tokenMap = loadAuthTokens();
  }
  return tokenMap !== null;
}

/**
 * Extract bearer token from a request.
 * Checks Authorization header first, then ?token= query param.
 */
export function extractToken(req: IncomingMessage): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  // Check query param
  try {
    const url = new URL(req.url || "", `http://localhost`);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // invalid URL
  }

  return null;
}

/**
 * Express-style auth middleware for HTTP routes.
 * Skips auth when AUTH_TOKENS is not set (dev mode).
 */
export function authMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  if (!isAuthEnabled()) {
    next();
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Authentication required" }));
    return;
  }

  const tenantId = validateToken(token);
  if (!tenantId) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid token" }));
    return;
  }

  // Attach tenant info to request for downstream use
  (req as any).tenantId = tenantId;
  next();
}
