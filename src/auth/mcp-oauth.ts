/**
 * MCP connector OAuth discovery + Dynamic Client Registration.
 *
 * Claude's custom-connector auth needs more than the raw token flow:
 *  - a 401 with a WWW-Authenticate challenge pointing at the resource metadata,
 *  - RFC 9728 protected-resource metadata,
 *  - RFC 8414 authorization-server metadata (advertising S256, refresh_token,
 *    offline_access),
 *  - RFC 7591 Dynamic Client Registration.
 *
 * The actual /authorize + /token endpoints are the existing Google-backed flow
 * (google-oauth.ts); this module only adds the discovery/registration surface
 * and a redirect-URI validator. Registered clients are persisted to disk so a
 * restart doesn't invalidate them.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ── Persisted client registry (RFC 7591) ──

interface RegisteredClient {
  client_id: string;
  redirect_uris: string[];
  client_name?: string;
  created_at: string;
}

const STORE_PATH = join(process.env.MP_DATA_DIR || "/data/media-producer", "_system", "oauth-clients.json");
const clients = new Map<string, RegisteredClient>();
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw) as { clients: Record<string, RegisteredClient> };
    for (const [id, c] of Object.entries(data.clients || {})) clients.set(id, c);
  } catch { /* none yet */ }
  loaded = true;
}

function persist(): void {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify({ clients: Object.fromEntries(clients) }, null, 2));
}

export function getRegisteredClient(clientId: string): RegisteredClient | null {
  ensureLoaded();
  return clients.get(clientId) ?? null;
}

/** RFC 7591 Dynamic Client Registration. Returns the registration response body. */
export function registerClient(body: any): Record<string, unknown> {
  ensureLoaded();
  const redirectUris: string[] = Array.isArray(body?.redirect_uris)
    ? body.redirect_uris.filter((u: unknown) => typeof u === "string")
    : [];
  const clientId = `mcp_${randomBytes(16).toString("hex")}`;
  const client: RegisteredClient = {
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: typeof body?.client_name === "string" ? body.client_name : undefined,
    created_at: new Date().toISOString(),
  };
  clients.set(clientId, client);
  persist();
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none", // public client (PKCE)
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: client.client_name,
  };
}

// ── Redirect-URI validation (RFC 8252: loopback is port-agnostic) ──

const CLAUDE_HOSTED_CALLBACK = "https://claude.ai/api/mcp/auth_callback";

function isLoopback(u: URL): boolean {
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
}

/**
 * Allow a redirect URI if: it's exactly a registered URI, the Claude hosted
 * callback, or a loopback URI (any port — Claude Code binds a random port).
 */
export function redirectUriAllowed(uri: string, registered: string[] = []): boolean {
  if (!uri) return false;
  if (uri === CLAUDE_HOSTED_CALLBACK) return true;
  if (registered.includes(uri)) return true;
  try {
    const u = new URL(uri);
    if (isLoopback(u)) {
      // Match a registered loopback URI ignoring the port; else allow any loopback.
      for (const r of registered) {
        try { const ru = new URL(r); if (isLoopback(ru) && ru.pathname === u.pathname) return true; } catch { /* skip */ }
      }
      return true;
    }
  } catch { /* not a URL */ }
  return false;
}

// ── Discovery documents ──

/** RFC 9728 protected-resource metadata. */
export function protectedResourceMetadata(issuer: string): Record<string, unknown> {
  return {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
  };
}

/** RFC 8414 authorization-server metadata. */
export function authorizationServerMetadata(issuer: string): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: ["openid", "email", "profile", "offline_access"],
  };
}

/** The WWW-Authenticate challenge value for an unauthenticated /mcp 401. */
export function wwwAuthenticateChallenge(issuer: string): string {
  return `Bearer resource_metadata="${issuer}/.well-known/oauth-protected-resource"`;
}
