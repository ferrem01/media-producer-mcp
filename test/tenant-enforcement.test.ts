/**
 * Tenant-enforcement regression suite.
 *
 * Multi-tenancy was storage layout only: authMiddleware resolved WHO you are,
 * then every route took the tenant from the URL and every MCP tool from a
 * plain param -- nothing ever compared them. This suite guards the fix:
 *  1. tenantAllowed / effectiveTenant decision cores (pure).
 *  2. AUTH_TOKENS parsing incl. the "*" admin scope.
 *  3. Source guards on index.ts: every tenant-scoped /api route name must be
 *     registered in the choke-point alternation (or the tenant-less
 *     allowlist), so ADDING a route without enforcement FAILS this suite.
 *  4. Source guards for the other closed holes: _system serving restricted
 *     to cache/, /mcp stamping req.auth, server.ts registering tools only
 *     through the tenant-enforcing wrapper.
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tenantAllowed, loadAuthTokens } from "../src/auth/auth.js";
import { effectiveTenant } from "../src/server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("tenantAllowed", () => {
  it("auth disabled: everything passes", () => {
    expect(tenantAllowed(undefined, "a", false)).toBe(true);
    expect(tenantAllowed("b", "a", false)).toBe(true);
  });
  it("auth enabled: exact match only", () => {
    expect(tenantAllowed("a", "a", true)).toBe(true);
    expect(tenantAllowed("b", "a", true)).toBe(false);
    expect(tenantAllowed(undefined, "a", true)).toBe(false);
  });
  it('"*" is the admin scope: cross-tenant allowed', () => {
    expect(tenantAllowed("*", "anyone", true)).toBe(true);
  });
});

describe("effectiveTenant (MCP tools)", () => {
  it("authenticated session: the session tenant wins, param ignored", () => {
    expect(effectiveTenant("victim-tenant", "jacob-getquotient-ai"))
      .toEqual({ tenantId: "jacob-getquotient-ai" });
    expect(effectiveTenant(undefined, "jacob-getquotient-ai"))
      .toEqual({ tenantId: "jacob-getquotient-ai" });
  });
  it("admin session: param is honored and required", () => {
    expect(effectiveTenant("some-tenant", "*")).toEqual({ tenantId: "some-tenant" });
    expect(effectiveTenant(undefined, "*")).toHaveProperty("error");
  });
  it("unauthenticated (stdio/dev): param is honored and required", () => {
    expect(effectiveTenant("dev-tenant", undefined)).toEqual({ tenantId: "dev-tenant" });
    expect(effectiveTenant(undefined, undefined)).toHaveProperty("error");
  });
});

describe("AUTH_TOKENS parsing", () => {
  const prev = process.env.AUTH_TOKENS;
  it('parses tenant mappings including the "*" admin scope', () => {
    process.env.AUTH_TOKENS = "usertok:marc-getquotient-ai, opstok:*";
    const map = loadAuthTokens();
    expect(map?.get("usertok")).toBe("marc-getquotient-ai");
    expect(map?.get("opstok")).toBe("*");
    process.env.AUTH_TOKENS = prev;
  });
});

describe("index.ts route coverage (source guards)", () => {
  let src = "";
  beforeAll(async () => {
    src = await fs.readFile(path.resolve(__dirname, "../src/index.ts"), "utf-8");
  });

  it("every /api/<name>/ route is registered as tenant-scoped or tenant-less", () => {
    // The choke-point alternation in index.ts.
    const guard = src.match(/\/\^\\\/api\\\/\(\?:([a-z|-]+)\)\\\/\(\[\^\/\]\+\)\//);
    expect(guard, "choke-point tenant guard regex not found in index.ts").toBeTruthy();
    const scoped = new Set(guard![1].split("|"));
    // Routes that legitimately carry no tenant in the URL. jobs enforce via
    // the job's own tenantId; deploy/server-log use the deploy secret.
    const TENANTLESS_API_ROUTES = new Set(["jobs", "deploy", "server-log", "tenants"]);

    const names = new Set<string>();
    for (const m of src.matchAll(/urlPath\.match\(\/\^\\\/api\\\/([a-z-]+)/g)) names.add(m[1]);
    expect(names.size).toBeGreaterThan(20); // sanity: the scan actually found the routes

    const unregistered = [...names].filter(
      (n) => !scoped.has(n) && !TENANTLESS_API_ROUTES.has(n),
    );
    expect(unregistered, `API route(s) not registered for tenant enforcement: ${unregistered.join(", ")} -- add to the choke-point alternation (tenant-scoped) or TENANTLESS_API_ROUTES in this test (tenant-less, with in-handler enforcement)`).toEqual([]);
  });

  it("the guard runs and 403s via requireTenant", () => {
    expect(src).toMatch(/requireTenant\(req, res, decodeURIComponent\(tenantSeg\[1\]\)\)/);
  });

  it("revise/undo (nested tenant position) is guarded explicitly", () => {
    expect(src).toMatch(/\/\^\\\/api\\\/revise\\\/undo\\\/\(\[\^\/\]\+\)\//);
  });

  it("job reads enforce the job's own tenant", () => {
    // Both the single-job GET and the long-poll wait must vet job.tenantId.
    const hits = src.match(/tenantAllowed\(\(req as any\)\.tenantId, \(j(?:ob|0) as any\)\.tenantId \|\| ""\)/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("_system asset serving is restricted to the cache/ subtree", () => {
    // tenants.json (user emails) and deploy.log live in _system; an
    // unbounded match served them unauthenticated to the open internet.
    expect(src).toContain("/^\\/assets\\/_system\\/cache\\/(.+)$/");
    expect(src).not.toContain("/^\\/assets\\/_system\\/(.+)$/");
  });

  it("/mcp stamps req.auth so tools receive the session tenant", () => {
    expect(src).toMatch(/\(req as any\)\.auth = \{ token, clientId: "mcp", scopes: \[\], extra: \{ tenantId: authedTenant \} \}/);
  });

  it("tenant store path follows config.dataDir", () => {
    expect(src).toContain('initTenantStoreFromFile(path.join(config.dataDir, "_system", "tenants.json"))');
    expect(src).not.toContain('initTenantStoreFromFile("/data/media-producer');
  });
});

describe("first-login tenant scaffold", () => {
  it("creates the on-disk skeleton idempotently", async () => {
    const { config } = await import("../src/config.js");
    const { ensureTenantScaffold, tenantDir } = await import("../src/persistence/paths.js");
    const prev = config.dataDir;
    config.dataDir = path.resolve(__dirname, "../test-output/tenant-scaffold");
    try {
      await ensureTenantScaffold("jacob-getquotient-ai");
      await ensureTenantScaffold("jacob-getquotient-ai"); // idempotent
      const base = tenantDir("jacob-getquotient-ai");
      for (const d of ["projects", "brand-kit/assets", "components"]) {
        const st = await fs.stat(path.join(base, d));
        expect(st.isDirectory()).toBe(true);
      }
    } finally {
      await fs.rm(path.resolve(__dirname, "../test-output/tenant-scaffold"), { recursive: true, force: true });
      config.dataDir = prev;
    }
  });

  it("the OAuth callback scaffolds the tenant on login (source guard)", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/auth/google-oauth.ts"), "utf-8");
    expect(src).toContain("ensureTenantScaffold(user.tenantId)");
  });
});

describe("/api/tenants admin listing (source guards)", () => {
  it("is gated on admin scope or the deploy token, never a per-tenant token", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/index.ts"), "utf-8");
    const route = src.slice(src.indexOf('urlPath === "/api/tenants"'), src.indexOf('urlPath === "/api/tenants"') + 900);
    expect(route).toContain('(req as any).tenantId === "*"');
    expect(route).toContain("Admin scope or deploy token required");
  });
});

describe("playground routes (source guards)", () => {
  it("body-carried tenant_ids are guarded; shared-library saves are admin-only", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/index.ts"), "utf-8");
    // components/save: writes into a tenant dir (guard) or the SHARED
    // library that renders into every tenant's films (admin only).
    expect(src).toContain("if (saveTenantId && !requireTenant(req, res, saveTenantId)) return;");
    expect(src).toContain("Saving to the shared component library requires the admin scope");
    // playground revise: tid pulls that tenant's brand kit into LLM context.
    expect(src).toContain("if (tid && !requireTenant(req, res, tid)) return;");
  });
});

describe("server.ts MCP registration (source guards)", () => {
  it("all tools register through the tenant-enforcing wrapper", async () => {
    const src = await fs.readFile(path.resolve(__dirname, "../src/server.ts"), "utf-8");
    // Exactly ONE direct server.tool( call: the wrapper's own delegation.
    const direct = src.match(/server\.tool\(/g) || [];
    expect(direct.length, "register tools via the tool() wrapper, not server.tool directly").toBe(1);
    // And the wrapper resolves the tenant before every handler.
    expect(src).toContain("effectiveTenant(params?.tenant_id, authed)");
  });
});
