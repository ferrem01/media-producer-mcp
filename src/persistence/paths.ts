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
