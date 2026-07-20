/**
 * Tenant store for OAuth users.
 * Persists tenant data to a JSON file on disk.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Tenant {
  email: string;
  name: string;
  picture?: string;
  tenantId: string;
  createdAt: string;
  lastLogin: string;
}

interface TenantData {
  tenants: Record<string, Tenant>;
}

let storePath: string | null = null;
const cache = new Map<string, Tenant>();
let loaded = false;

/** Initialize with a JSON file path. */
export function initTenantStoreFromFile(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  storePath = filePath;
  loaded = false;
  cache.clear();
}

function ensureLoaded(): void {
  if (loaded || !storePath) return;
  try {
    const raw = readFileSync(storePath, "utf-8");
    const data = JSON.parse(raw) as TenantData;
    for (const [email, tenant] of Object.entries(data.tenants)) {
      cache.set(email, tenant);
    }
    console.log(`Loaded ${cache.size} tenants from storage`);
  } catch {
    // No existing data, start fresh
  }
  loaded = true;
}

function persist(): void {
  if (!storePath) return;
  const data: TenantData = { tenants: {} };
  for (const [email, tenant] of cache) {
    data.tenants[email] = tenant;
  }
  writeFileSync(storePath, JSON.stringify(data, null, 2));
}

/** Create a tenant ID from an email address (slugified). */
function createTenantId(email: string): string {
  const [local, domain] = email.split("@");
  const slugLocal = (local ?? "").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const slugDomain = (domain ?? "").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  return `${slugLocal}-${slugDomain}`.replace(/^-|-$/g, "");
}

/** Find or create a tenant on login. Auto-persists. */
export async function findOrCreateTenant(
  email: string,
  name: string,
  picture?: string,
): Promise<Tenant> {
  ensureLoaded();
  const now = new Date().toISOString();

  let tenant = cache.get(email);
  if (tenant) {
    tenant.lastLogin = now;
    if (name) tenant.name = name;
    if (picture) tenant.picture = picture;
  } else {
    tenant = {
      email,
      name,
      picture,
      tenantId: createTenantId(email),
      createdAt: now,
      lastLogin: now,
    };
    cache.set(email, tenant);
  }

  persist();
  return tenant;
}

/** Get a tenant by email. */
export async function getTenant(email: string): Promise<Tenant | undefined> {
  ensureLoaded();
  return cache.get(email);
}

/** Get a tenant by tenant ID. */
export async function getTenantById(tenantId: string): Promise<Tenant | undefined> {
  ensureLoaded();
  for (const tenant of cache.values()) {
    if (tenant.tenantId === tenantId) return tenant;
  }
  return undefined;
}

/** All registered (OAuth) tenants. Admin listing only. */
export async function listTenants(): Promise<Tenant[]> {
  ensureLoaded();
  return [...cache.values()];
}
