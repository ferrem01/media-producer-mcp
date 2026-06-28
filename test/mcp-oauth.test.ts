/**
 * Unit tests for the MCP connector OAuth surface:
 *  - token lifecycle (refresh rotation + JWT round-trip)
 *  - redirect-URI validation (loopback port-agnostic, Claude callback, DCR)
 *  - discovery document shape (S256 / refresh_token / offline_access)
 *  - Dynamic Client Registration
 *
 * These set env + a temp data dir BEFORE importing the modules (the stores
 * compute their paths / secrets at import time), so they use dynamic import.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let mcpOauth: typeof import("../src/auth/mcp-oauth.js");
let refresh: typeof import("../src/auth/refresh-tokens.js");
let jwtMod: typeof import("../src/auth/jwt.js");

const ISSUER = "https://example.test";

beforeAll(async () => {
  process.env.MP_DATA_DIR = mkdtempSync(join(tmpdir(), "mcp-oauth-test-"));
  process.env.SESSION_SECRET = "test-secret-please-ignore";
  mcpOauth = await import("../src/auth/mcp-oauth.js");
  refresh = await import("../src/auth/refresh-tokens.js");
  jwtMod = await import("../src/auth/jwt.js");
});

describe("redirect-URI validation", () => {
  it("allows the Claude hosted callback", () => {
    expect(mcpOauth.redirectUriAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(true);
  });
  it("allows loopback on any port (RFC 8252)", () => {
    expect(mcpOauth.redirectUriAllowed("http://localhost:54321/callback")).toBe(true);
    expect(mcpOauth.redirectUriAllowed("http://127.0.0.1:7777/callback")).toBe(true);
  });
  it("allows an exactly-registered URI", () => {
    expect(mcpOauth.redirectUriAllowed("https://app.example.com/cb", ["https://app.example.com/cb"])).toBe(true);
  });
  it("rejects an unregistered non-loopback URI", () => {
    expect(mcpOauth.redirectUriAllowed("https://evil.example.com/cb")).toBe(false);
    expect(mcpOauth.redirectUriAllowed("")).toBe(false);
  });
});

describe("discovery documents", () => {
  it("protected-resource metadata points at the auth server", () => {
    const m = mcpOauth.protectedResourceMetadata(ISSUER) as any;
    expect(m.resource).toBe(`${ISSUER}/mcp`);
    expect(m.authorization_servers).toContain(ISSUER);
  });
  it("authorization-server metadata advertises S256, refresh_token, offline_access", () => {
    const m = mcpOauth.authorizationServerMetadata(ISSUER) as any;
    expect(m.code_challenge_methods_supported).toContain("S256");
    expect(m.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
    expect(m.scopes_supported).toContain("offline_access");
    expect(m.registration_endpoint).toBe(`${ISSUER}/register`);
    expect(m.token_endpoint).toBe(`${ISSUER}/token`);
  });
  it("WWW-Authenticate points at the protected-resource metadata", () => {
    expect(mcpOauth.wwwAuthenticateChallenge(ISSUER))
      .toBe(`Bearer resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`);
  });
});

describe("Dynamic Client Registration", () => {
  it("registers a client and persists it", () => {
    const reg = mcpOauth.registerClient({ redirect_uris: ["http://localhost/callback"], client_name: "Claude" }) as any;
    expect(reg.client_id).toMatch(/^mcp_/);
    expect(reg.redirect_uris).toEqual(["http://localhost/callback"]);
    expect(reg.grant_types).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
    const got = mcpOauth.getRegisteredClient(reg.client_id);
    expect(got?.redirect_uris).toEqual(["http://localhost/callback"]);
  });
});

describe("refresh-token lifecycle", () => {
  it("create -> validate -> rotate -> old invalid, new valid", () => {
    const tok = refresh.createRefreshToken("a@b.com", "tenantA");
    expect(refresh.validateRefreshToken(tok)?.tenantId).toBe("tenantA");

    const rotated = refresh.rotateRefreshToken(tok);
    expect(rotated?.newToken).toBeTruthy();
    expect(rotated?.newToken).not.toBe(tok);

    // old token is now invalid (rotation), new one works
    expect(refresh.validateRefreshToken(tok)).toBeNull();
    expect(refresh.validateRefreshToken(rotated!.newToken)?.email).toBe("a@b.com");
  });
  it("rotating an unknown token returns null (-> invalid_grant)", () => {
    expect(refresh.rotateRefreshToken("nope-not-a-real-token")).toBeNull();
  });
});

describe("JWT access tokens", () => {
  it("sign -> verify round-trips the tenant (stateless, survives restart)", () => {
    const token = jwtMod.signToken({ email: "a@b.com", tenant_id: "tenantA" });
    const payload = jwtMod.verifyToken(token);
    expect(payload?.tenant_id).toBe("tenantA");
    expect(payload?.email).toBe("a@b.com");
  });
  it("rejects a garbage token", () => {
    expect(jwtMod.verifyToken("not.a.jwt")).toBeNull();
  });
});
