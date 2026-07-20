/**
 * Filesystem path helpers for the tenant directory structure.
 *
 * All brand-related files live under {tenant}/brand-kit/:
 *   brand-kit/brand-kit.json   - colors, fonts, style, asset registry
 *   brand-kit/brand-kit.css    - compiled CSS variables
 *   brand-kit/assets/          - logos, intros, outros, music, fonts, watermarks
 */

import path from "node:path";
import { config } from "../config.js";

// ── Tenant ──

export function tenantDir(tenantId: string): string {
  return path.join(config.dataDir, tenantId);
}

/**
 * Eagerly create a tenant's directory skeleton (projects/, brand-kit/assets/,
 * components/). Called on first OAuth login so a tenant is visible on disk
 * from the moment it exists -- lazily-created dirs made login-only tenants
 * invisible to `ls` and read as "no tenant was created". Idempotent.
 */
export async function ensureTenantScaffold(tenantId: string): Promise<void> {
  const fs = await import("node:fs/promises");
  const base = tenantDir(tenantId);
  await fs.mkdir(path.join(base, "projects"), { recursive: true });
  await fs.mkdir(path.join(base, "brand-kit", "assets"), { recursive: true });
  await fs.mkdir(path.join(base, "components"), { recursive: true });
}

// ── Brand Kit ──

export function brandKitDir(tenantId: string): string {
  return path.join(tenantDir(tenantId), "brand-kit");
}

export function brandKitJsonPath(tenantId: string): string {
  return path.join(brandKitDir(tenantId), "brand-kit.json");
}

export function brandKitCssPath(tenantId: string): string {
  return path.join(brandKitDir(tenantId), "brand-kit.css");
}

export function brandKitAssetsDir(tenantId: string): string {
  return path.join(brandKitDir(tenantId), "assets");
}

// ── Components ──

export function tenantComponentsDir(tenantId: string): string {
  return path.join(tenantDir(tenantId), "components");
}

// ── Projects ──

export function projectsDir(tenantId: string): string {
  return path.join(tenantDir(tenantId), "projects");
}

export function projectDir(tenantId: string, projectId: string): string {
  return path.join(projectsDir(tenantId), projectId);
}

export function projectJsonPath(tenantId: string, projectId: string): string {
  return path.join(projectDir(tenantId, projectId), "project.json");
}

export function projectAssetsDir(tenantId: string, projectId: string): string {
  return path.join(projectDir(tenantId, projectId), "assets");
}

export function projectOutputDir(tenantId: string, projectId: string): string {
  return path.join(projectDir(tenantId, projectId), "output");
}
