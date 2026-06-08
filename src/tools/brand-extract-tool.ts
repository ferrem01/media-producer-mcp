/**
 * MCP Tool: extract_brand_from_website
 *
 * Extracts design tokens from a live website using Playwright,
 * optionally enhances them with LLM analysis, and merges into
 * the tenant's brand kit.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { extractBrandFromUrl, enhanceWithLLM } from "./brand-extractor.js";
import { loadBrandKit, saveBrandKit } from "../persistence/brand-kit.js";
import { llmConfigFromEnv } from "../llm/client.js";
import type { BrandKit } from "../core/types.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

/**
 * Register the extract_brand_from_website tool on an MCP server.
 */
export function registerBrandExtractTool(server: McpServer): void {
  server.tool(
    "extract_brand_from_website",
    "Extract design tokens (colors, typography, spacing, radius, shadows, motion, patterns) from a live website URL. Optionally enhances with LLM analysis. Merges extracted design system into the tenant's brand kit.",
    {
      tenant_id: z.string().describe("Tenant identifier"),
      url: z.string().describe("Website URL to extract brand from"),
      enhance: z.boolean().optional().default(false).describe("Run LLM analysis on extracted tokens for guidelines and refined patterns"),
    },
    async (params) => {
      try {
        // Extract design tokens from the website
        var result = await extractBrandFromUrl(params.url);
        var designSystem = result.design_system;
        var extractedColors = result.colors;

        // Optionally enhance with LLM
        if (params.enhance) {
          try {
            var llmConfig = llmConfigFromEnv();
            var heroScreenshot = designSystem.screenshots?.hero || "";
            var enhanced = await enhanceWithLLM(designSystem, heroScreenshot, llmConfig);
            designSystem.guidelines = enhanced.guidelines;
            designSystem.patterns = enhanced.patterns;
          } catch (llmErr: any) {
            // LLM enhancement is non-fatal -- log and continue
            console.warn("[extract_brand] LLM enhancement failed:", llmErr.message);
          }
        }

        // Strip screenshot data from stored design system (too large for brand-kit.json)
        var storedDesignSystem = { ...designSystem };
        delete storedDesignSystem.screenshots;

        // Load existing brand kit (if any) and merge
        var existing = await loadBrandKit(params.tenant_id);
        var kit: BrandKit;

        if (existing) {
          // Merge: don't overwrite existing colors/fonts unless they were default/empty
          var isDefaultColors = existing.colors.primary === "#5B21B6" && existing.colors.background === "#0f172a";
          kit = {
            ...existing,
            colors: isDefaultColors ? extractedColors : existing.colors,
            design_system: storedDesignSystem,
          };
          // If no fonts were set (only default Inter), use extracted fonts
          if (existing.fonts?.length === 1 && existing.fonts[0].family === "Inter") {
            var extractedFonts = [];
            if (designSystem.typography.font_heading) {
              extractedFonts.push({
                family: designSystem.typography.font_heading,
                source: "google" as const,
                weights: [parseInt(designSystem.typography.heading_weight) || 700],
              });
            }
            if (designSystem.typography.font_body && designSystem.typography.font_body !== designSystem.typography.font_heading) {
              extractedFonts.push({
                family: designSystem.typography.font_body,
                source: "google" as const,
                weights: [parseInt(designSystem.typography.body_weight) || 400, 500, 600, 700],
              });
            }
            if (extractedFonts.length > 0) {
              kit.fonts = extractedFonts;
            }
          }
        } else {
          // Create new brand kit from extracted data
          kit = {
            colors: extractedColors,
            fonts: [
              {
                family: designSystem.typography.font_heading || "Inter",
                source: "google" as const,
                weights: [parseInt(designSystem.typography.heading_weight) || 700],
              },
            ],
            style: {
              border_radius: designSystem.radius.md,
              motion: "cinematic" as const,
            },
            design_system: storedDesignSystem,
          };
          // Add body font if different from heading
          if (designSystem.typography.font_body && designSystem.typography.font_body !== designSystem.typography.font_heading) {
            kit.fonts.push({
              family: designSystem.typography.font_body,
              source: "google" as const,
              weights: [parseInt(designSystem.typography.body_weight) || 400, 500, 600, 700],
            });
          }
        }

        // Save the updated brand kit
        await saveBrandKit(params.tenant_id, kit);

        // Build summary for response
        var summary = {
          status: "extracted",
          url: params.url,
          extracted_at: designSystem.extracted_at,
          colors: {
            primary_bg: designSystem.color_roles.primary_bg,
            primary_action: designSystem.color_roles.primary_action,
            text_primary: designSystem.color_roles.text_primary,
          },
          typography: {
            heading_font: designSystem.typography.font_heading,
            body_font: designSystem.typography.font_body,
            heading_weight: designSystem.typography.heading_weight,
          },
          spacing: {
            base_unit: designSystem.spacing.base_unit,
            density: designSystem.density,
          },
          patterns: designSystem.patterns,
          enhanced: params.enhance && !!designSystem.guidelines,
          guidelines_preview: designSystem.guidelines
            ? designSystem.guidelines.substring(0, 200) + "..."
            : undefined,
        };

        return ok(summary);
      } catch (e: any) {
        return err("Brand extraction failed: " + e.message);
      }
    },
  );
}
