/**
 * Team access to a tenant (SPEC-team.md).
 *
 * A tenant used to be one email: login slugified the address into a tenant
 * id, and two people from the same company landed in two unrelated tenants.
 * Now a tenant has MEMBERS, and login resolves your tenant through
 * membership:
 *
 *  1. an INVITE for your email (someone in a tenant invited you) -- you
 *     join that tenant; the invite is consumed;
 *  2. an existing MEMBERSHIP for your email;
 *  3. your COMPANY DOMAIN: everyone at acme.com shares the acme tenant.
 *     The first person from a domain founds it -- and if they already had
 *     a per-email tenant from before, THAT tenant becomes the company's
 *     (their projects, brand kit and links carry over untouched);
 *  4. a CONSUMER domain (gmail and the like) stays one tenant per email.
 *
 * Removing a member blocks the domain rule for them, so they do not walk
 * straight back in on their next login. Persisted to team.json next to
 * tenants.json; the per-email tenant record keeps pointing at the tenant
 * the person is actually in, so every existing reader of tenant-store
 * (/auth/me, the MCP flow) sees the team tenant.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { findOrCreateTenant, getTenant, setTenantIdForEmail, type Tenant } from "./tenant-store.js";

export const CONSUMER_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "outlook.com", "hotmail.com", "live.com",
  "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
  "hey.com", "fastmail.com", "zoho.com", "gmx.com", "gmx.de", "mail.com", "yandex.com", "qq.com", "163.com",
]);

export type MemberVia = "founder" | "domain" | "invite";
export interface Member { email: string; tenantId: string; via: MemberVia; addedAt: string; invitedBy?: string }
export interface Invite { email: string; tenantId: string; invitedBy: string; at: string }
export interface Org { domain: string; tenantId: string; createdAt: string; foundedBy: string }

interface TeamData {
  orgs: Record<string, Org>;          // company domain -> the tenant it shares
  members: Record<string, Member>;    // email -> membership
  invites: Record<string, Invite>;    // email -> pending invite
  removed: Record<string, string>;    // email -> tenant they were removed from (blocks the domain rule)
}

let storePath: string | null = null;
let data: TeamData = { orgs: {}, members: {}, invites: {}, removed: {} };
let loaded = false;

export function initTeamStoreFromFile(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  storePath = filePath;
  loaded = false;
  data = { orgs: {}, members: {}, invites: {}, removed: {} };
}

function ensureLoaded(): void {
  if (loaded || !storePath) return;
  try {
    const raw = JSON.parse(readFileSync(storePath, "utf-8")) as Partial<TeamData>;
    data = { orgs: raw.orgs || {}, members: raw.members || {}, invites: raw.invites || {}, removed: raw.removed || {} };
  } catch { /* fresh */ }
  loaded = true;
}
function persist(): void {
  if (!storePath) return;
  writeFileSync(storePath, JSON.stringify(data, null, 2));
}

export function normalizeEmail(email: string): string { return String(email || "").trim().toLowerCase(); }
export function domainOf(email: string): string { return normalizeEmail(email).split("@")[1] || ""; }
export function isConsumerDomain(domain: string): boolean { return CONSUMER_DOMAINS.has(String(domain || "").toLowerCase()); }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
/** The tenant id a brand-new company domain gets: "acme-com". */
export function domainTenantId(domain: string): string { return slug(domain); }
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Which tenant this login lands in, and why (pure decision, exported for tests). */
export function resolveTenantId(
  email: string,
  legacyTenantId: string | undefined,
  d: TeamData = data,
): { tenantId: string; via: MemberVia | "consumer"; founds?: string } {
  const e = normalizeEmail(email);
  const inv = d.invites[e];
  if (inv) return { tenantId: inv.tenantId, via: "invite" };
  const m = d.members[e];
  if (m) return { tenantId: m.tenantId, via: m.via };
  const domain = domainOf(e);
  if (domain && !isConsumerDomain(domain)) {
    const org = d.orgs[domain];
    if (org) {
      if (d.removed[e] === org.tenantId) return { tenantId: legacyTenantId || slug(e.replace("@", "-")), via: "consumer" };
      return { tenantId: org.tenantId, via: "domain" };
    }
    return { tenantId: legacyTenantId || domainTenantId(domain), via: "founder", founds: domain };
  }
  return { tenantId: legacyTenantId || slug(e.replace("@", "-")), via: "consumer" };
}

/** Login: find or create the person's record, resolve their TEAM tenant,
 *  and point the record at it. */
export async function resolveTenantForLogin(email: string, name: string, picture?: string): Promise<Tenant> {
  ensureLoaded();
  const e = normalizeEmail(email);
  const legacy = await getTenant(e);
  const r = resolveTenantId(e, legacy?.tenantId);
  const now = new Date().toISOString();
  if (r.via === "invite") {
    const inv = data.invites[e];
    data.members[e] = { email: e, tenantId: r.tenantId, via: "invite", addedAt: now, invitedBy: inv?.invitedBy };
    delete data.invites[e];
    delete data.removed[e];
    persist();
  } else if (r.via === "founder" && r.founds) {
    data.orgs[r.founds] = { domain: r.founds, tenantId: r.tenantId, createdAt: now, foundedBy: e };
    data.members[e] = { email: e, tenantId: r.tenantId, via: "founder", addedAt: now };
    persist();
    console.log(`  team: ${e} founded the ${r.founds} tenant "${r.tenantId}"${legacy ? " (their existing tenant, carried over)" : ""}`);
  } else if (r.via === "domain" && !data.members[e]) {
    data.members[e] = { email: e, tenantId: r.tenantId, via: "domain", addedAt: now };
    persist();
    console.log(`  team: ${e} joined "${r.tenantId}" by domain`);
  }
  const t = await findOrCreateTenant(e, name, picture);
  if (t.tenantId !== r.tenantId) await setTenantIdForEmail(e, r.tenantId);
  return { ...t, tenantId: r.tenantId };
}

export interface TeamView {
  tenant_id: string;
  domains: string[];
  members: Array<{ email: string; name?: string; via: MemberVia; added_at: string; invited_by?: string }>;
  invites: Array<{ email: string; invited_by: string; at: string }>;
}

export async function listTeam(tenantId: string): Promise<TeamView> {
  ensureLoaded();
  const members: TeamView["members"] = [];
  for (const m of Object.values(data.members)) {
    if (m.tenantId !== tenantId) continue;
    const t = await getTenant(m.email);
    members.push({ email: m.email, name: t?.name, via: m.via, added_at: m.addedAt, ...(m.invitedBy ? { invited_by: m.invitedBy } : {}) });
  }
  // A tenant founded before the team store existed has its owner on record
  // in tenant-store only: show them, so the list is never empty.
  if (!members.length) {
    const { listTenants } = await import("./tenant-store.js");
    for (const t of await listTenants()) if (t.tenantId === tenantId) members.push({ email: t.email, name: t.name, via: "founder", added_at: t.createdAt });
  }
  members.sort((a, b) => a.added_at.localeCompare(b.added_at));
  const invites = Object.values(data.invites).filter((i) => i.tenantId === tenantId).map((i) => ({ email: i.email, invited_by: i.invitedBy, at: i.at }));
  const domains = Object.values(data.orgs).filter((o) => o.tenantId === tenantId).map((o) => o.domain);
  return { tenant_id: tenantId, domains, members, invites };
}

/** Invite an email into a tenant. Idempotent; a current member is a no-op. */
export async function inviteMember(tenantId: string, email: string, invitedBy: string): Promise<{ status: "invited" | "already_member" | "already_invited"; email: string }> {
  ensureLoaded();
  const e = normalizeEmail(email);
  if (!isEmail(e)) throw new Error(`"${email}" is not an email address`);
  const m = data.members[e];
  if (m && m.tenantId === tenantId) return { status: "already_member", email: e };
  if (data.invites[e]?.tenantId === tenantId) return { status: "already_invited", email: e };
  data.invites[e] = { email: e, tenantId, invitedBy: normalizeEmail(invitedBy), at: new Date().toISOString() };
  delete data.removed[e];
  persist();
  return { status: "invited", email: e };
}

/** Remove a member (or withdraw an invite). The remover cannot remove
 *  themselves; a removed same-domain member does not rejoin by domain. */
export async function removeMember(tenantId: string, email: string, by: string): Promise<{ status: "removed" | "invite_withdrawn" | "not_a_member" }> {
  ensureLoaded();
  const e = normalizeEmail(email);
  if (e === normalizeEmail(by)) throw new Error("You cannot remove yourself from your own tenant.");
  if (data.invites[e]?.tenantId === tenantId) { delete data.invites[e]; persist(); return { status: "invite_withdrawn" }; }
  const m = data.members[e];
  if (!m || m.tenantId !== tenantId) return { status: "not_a_member" };
  delete data.members[e];
  data.removed[e] = tenantId;
  persist();
  // Their next login lands in a tenant of their own.
  const t = await getTenant(e);
  if (t && t.tenantId === tenantId) await setTenantIdForEmail(e, slug(e.replace("@", "-")));
  return { status: "removed" };
}

/** Test seam. */
export function __teamDataForTests(): TeamData { ensureLoaded(); return data; }
