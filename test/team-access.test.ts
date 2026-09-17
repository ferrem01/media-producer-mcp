/**
 * Team access to a tenant (SPEC-team.md): login resolves the tenant through
 * an invite, a membership, or the company domain; consumer domains stay
 * one tenant per email; the founder's existing tenant carries over.
 */
import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initTenantStoreFromFile, getTenant, findOrCreateTenant } from "../src/auth/tenant-store.js";
import {
  initTeamStoreFromFile, resolveTenantId, resolveTenantForLogin, listTeam, inviteMember, removeMember,
  isConsumerDomain, domainTenantId,
} from "../src/auth/team-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("resolveTenantId (pure)", () => {
  const empty = { orgs: {}, members: {}, invites: {}, removed: {} } as any;
  it("a company domain founds a tenant; the founder's existing per-email tenant carries over", () => {
    expect(resolveTenantId("marc@getquotient.ai", "marc-getquotient-ai", empty)).toEqual({ tenantId: "marc-getquotient-ai", via: "founder", founds: "getquotient.ai" });
    expect(resolveTenantId("new@acme.com", undefined, empty)).toEqual({ tenantId: "acme-com", via: "founder", founds: "acme.com" });
  });
  it("the second person from the domain joins the founder's tenant", () => {
    const d = { ...empty, orgs: { "getquotient.ai": { domain: "getquotient.ai", tenantId: "marc-getquotient-ai", createdAt: "", foundedBy: "marc@getquotient.ai" } } };
    expect(resolveTenantId("Sam@GetQuotient.ai", undefined, d)).toEqual({ tenantId: "marc-getquotient-ai", via: "domain" });
  });
  it("an invite wins over the domain; a consumer domain stays one tenant per email", () => {
    const d = { ...empty, invites: { "pat@gmail.com": { email: "pat@gmail.com", tenantId: "marc-getquotient-ai", invitedBy: "marc@getquotient.ai", at: "" } } };
    expect(resolveTenantId("pat@gmail.com", undefined, d)).toEqual({ tenantId: "marc-getquotient-ai", via: "invite" });
    expect(resolveTenantId("lee@gmail.com", undefined, empty)).toEqual({ tenantId: "lee-gmail-com", via: "consumer" });
    expect(isConsumerDomain("gmail.com")).toBe(true);
    expect(isConsumerDomain("getquotient.ai")).toBe(false);
    expect(domainTenantId("GetQuotient.ai")).toBe("getquotient-ai");
  });
  it("a removed same-domain member does not walk back in by domain", () => {
    const d = { ...empty, orgs: { "acme.com": { domain: "acme.com", tenantId: "acme-com", createdAt: "", foundedBy: "a@acme.com" } }, removed: { "b@acme.com": "acme-com" } };
    expect(resolveTenantId("b@acme.com", undefined, d)).toEqual({ tenantId: "b-acme-com", via: "consumer" });
  });
});

describe("the team store on disk: login, invite, remove", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "mp-team-"));
    initTenantStoreFromFile(path.join(dir, "tenants.json"));
    initTeamStoreFromFile(path.join(dir, "team.json"));
  });
  it("Marc's tenant becomes the company's; a colleague lands in it; /auth/me style lookups agree", async () => {
    await findOrCreateTenant("marc@getquotient.ai", "Marc"); // the pre-team world
    const marc = await resolveTenantForLogin("marc@getquotient.ai", "Marc");
    expect(marc.tenantId).toBe("marc-getquotient-ai");
    const sam = await resolveTenantForLogin("sam@getquotient.ai", "Sam");
    expect(sam.tenantId).toBe("marc-getquotient-ai");
    expect((await getTenant("sam@getquotient.ai"))!.tenantId).toBe("marc-getquotient-ai");
    const team = await listTeam("marc-getquotient-ai");
    expect(team.domains).toEqual(["getquotient.ai"]);
    expect(team.members.map((m) => [m.email, m.via])).toEqual([["marc@getquotient.ai", "founder"], ["sam@getquotient.ai", "domain"]]);
    // Persisted: a fresh load sees the same
    initTeamStoreFromFile(path.join(dir, "team.json"));
    expect((await listTeam("marc-getquotient-ai")).members).toHaveLength(2);
  });
  it("a colleague signing in FIRST still lands the company on the owner's existing tenant", async () => {
    await findOrCreateTenant("marc@getquotient.ai", "Marc"); // Marc's pre-team tenant holds the projects
    const sam = await resolveTenantForLogin("sam@getquotient.ai", "Sam"); // Sam signs in before Marc does
    expect(sam.tenantId).toBe("marc-getquotient-ai");
    const marc = await resolveTenantForLogin("marc@getquotient.ai", "Marc");
    expect(marc.tenantId).toBe("marc-getquotient-ai");
    expect((await listTeam("marc-getquotient-ai")).domains).toEqual(["getquotient.ai"]);
  });
  it("an invite brings an outside address in, and removal sends them to a tenant of their own", async () => {
    await resolveTenantForLogin("marc@getquotient.ai", "Marc");
    expect(await inviteMember("marc-getquotient-ai", "Pat@Gmail.com", "marc@getquotient.ai")).toEqual({ status: "invited", email: "pat@gmail.com" });
    expect((await listTeam("marc-getquotient-ai")).invites.map((i) => i.email)).toEqual(["pat@gmail.com"]);
    const pat = await resolveTenantForLogin("pat@gmail.com", "Pat");
    expect(pat.tenantId).toBe("marc-getquotient-ai");
    expect((await listTeam("marc-getquotient-ai")).invites).toEqual([]);
    expect(await inviteMember("marc-getquotient-ai", "pat@gmail.com", "marc@getquotient.ai")).toEqual({ status: "already_member", email: "pat@gmail.com" });
    await expect(removeMember("marc-getquotient-ai", "marc@getquotient.ai", "marc@getquotient.ai")).rejects.toThrow(/cannot remove yourself/);
    expect(await removeMember("marc-getquotient-ai", "pat@gmail.com", "marc@getquotient.ai")).toEqual({ status: "removed" });
    expect((await resolveTenantForLogin("pat@gmail.com", "Pat")).tenantId).toBe("pat-gmail-com");
    await expect(inviteMember("marc-getquotient-ai", "not an email", "marc@getquotient.ai")).rejects.toThrow(/not an email/);
  });
  it("the wiring: login goes through the team store, the API route is tenant-enforced, both Studios link the page, the MCP tool exists", async () => {
    const read = (f: string) => fs.readFile(path.join(__dirname, "..", f), "utf-8");
    expect(await read("src/auth/google-oauth.ts")).toMatch(/const user = await resolveTenantForLogin\(userInfo\.email, userInfo\.name, userInfo\.picture\);/);
    const index = await read("src/index.ts");
    expect(index).toMatch(/\|provide-asset\|team\)\\\/\(\[\^\/\]\+\)\//);
    expect(index).toMatch(/urlPath\.match\(\/\^\\\/api\\\/team\\\/\(\[\^\/\]\+\)\$\/\)/);
    expect(index).toMatch(/if \(urlPath === "\/team"\) \{/);
    expect(await read("src/studio-phone.ts")).toMatch(/teamA\.href = '\/team\?tenant='/);
    expect(await read("src/preview-app/preview-app.ts")).toMatch(/id="team-btn"/);
    expect(await read("src/server.ts")).toMatch(/tool\(\s*"team",/);
  });
});
