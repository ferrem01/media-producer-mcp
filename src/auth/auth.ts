/**
 * Token-based authentication for media-producer-mcp.
 *
 * Reads AUTH_TOKENS env var in format: "token1:tenant1,token2:tenant2"
 * When AUTH_TOKENS is not set, all requests are allowed (dev mode).
 * Also supports JWT tokens from Google OAuth.
 *
 * TENANT SCOPING: a token maps to exactly one tenant, and every tenant-scoped
 * route/tool must act only on that tenant (enforced via tenantAllowed /
 * requireTenant below). The special tenant "*" (an AUTH_TOKENS entry like
 * "opstoken:*") is an ADMIN scope that may act cross-tenant -- reserve it for
 * operator tooling, never hand it to users.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyToken } from "./jwt.js";

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
 * Tries static AUTH_TOKENS first, then JWT verification.
 */
export function validateToken(token: string): string | null {
  if (!tokenMap) {
    tokenMap = loadAuthTokens();
  }
  // Try static tokens
  if (tokenMap) {
    const tenantId = tokenMap.get(token);
    if (tenantId) return tenantId;
  }
  // Try JWT
  const jwtPayload = verifyToken(token);
  if (jwtPayload) return jwtPayload.tenant_id;
  return null;
}

/**
 * Check if auth is enabled (AUTH_TOKENS or SESSION_SECRET is set).
 */
export function isAuthEnabled(): boolean {
  if (!tokenMap) {
    tokenMap = loadAuthTokens();
  }
  return tokenMap !== null || !!process.env.SESSION_SECRET;
}

/**
 * Extract bearer token from a request.
 * Checks Authorization header first, then ?token= query param.
 */
export function extractToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  try {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // invalid URL
  }

  // Browser session cookie (set by the Google login callback): lets Studio
  // work on a bare /studio URL with no token in the address bar.
  const cookies = req.headers.cookie;
  if (cookies) {
    const m = /(?:^|;\s*)mp_session=([^;]+)/.exec(cookies);
    if (m) return decodeURIComponent(m[1]);
  }

  return null;
}

/**
 * Auth middleware for HTTP routes.
 * Tries static AUTH_TOKENS first, then JWT verification.
 * Skips auth when neither is configured (dev mode).
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

  // Try static AUTH_TOKENS first
  if (!tokenMap) {
    tokenMap = loadAuthTokens();
  }
  if (tokenMap) {
    const tenantId = tokenMap.get(token);
    if (tenantId) {
      (req as any).tenantId = tenantId;
      next();
      return;
    }
  }

  // Try JWT token
  const jwtPayload = verifyToken(token);
  if (jwtPayload) {
    (req as any).tenantId = jwtPayload.tenant_id;
    (req as any).user = {
      email: jwtPayload.email,
      name: jwtPayload.name,
      picture: jwtPayload.picture,
    };
    next();
    return;
  }

  // Neither worked
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Invalid token" }));
}

/**
 * May a principal authenticated as `authedTenant` act on `tenantId`?
 * Pure decision core of tenant enforcement -- exported for tests.
 * - auth disabled (dev mode): everything passes.
 * - "*" is the admin scope: cross-tenant allowed.
 * - otherwise: exact match only.
 */
export function tenantAllowed(
  authedTenant: string | undefined,
  tenantId: string,
  authEnabled: boolean = isAuthEnabled(),
): boolean {
  if (!authEnabled) return true;
  if (!authedTenant) return false;
  if (authedTenant === "*") return true;
  return authedTenant === tenantId;
}

/**
 * Route guard: 403 (and return false) unless the authenticated principal may
 * act on `tenantId`. Call AFTER authMiddleware (which stamps req.tenantId).
 */
export function requireTenant(
  req: IncomingMessage,
  res: ServerResponse,
  tenantId: string,
): boolean {
  const authed = (req as any).tenantId as string | undefined;
  if (tenantAllowed(authed, tenantId)) return true;
  res.writeHead(403, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    error: `Forbidden: this token is scoped to tenant "${authed || "(none)"}", not "${tenantId}"`,
  }));
  return false;
}
