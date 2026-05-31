/**
 * Configuration for the media-producer-mcp server.
 *
 * Directory layout per tenant:
 *   {dataDir}/{tenant-id}/
 *     brand-kit/
 *       brand-kit.json     - raw brand kit data + asset registry
 *       brand-kit.css      - compiled CSS custom properties
 *       assets/            - brand asset files (logos, fonts, music, etc.)
 *     components/          - tenant custom components
 *     projects/
 *       proj_{id}/
 *         project.json
 *         assets/
 *         output/
 */

import path from "node:path";

export interface LLMConfig {
  provider: "anthropic" | "openai";
  model: string;
  apiKey: string;
}

export interface Config {
  /** Root data directory for all tenant data */
  dataDir: string;
  /** HTTP port (health check / playground) */
  port: number;
  /** Path to built-in component library */
  componentLibDir: string;
  /** Path to GSAP vendor files */
  gsapDir: string;
  /** LLM configuration */
  llm: LLMConfig;
}

const ROOT_DIR = path.dirname(new URL(import.meta.url).pathname);

const llmProvider = (process.env.MP_LLM_PROVIDER || "anthropic") as "anthropic" | "openai";

export const config: Config = {
  dataDir: process.env.MP_DATA_DIR || "/data/media-producer",
  port: parseInt(process.env.MP_PORT || "3200", 10),
  // Point to src/components (HTML files aren't copied by tsc to dist/)
  componentLibDir: process.env.MP_COMPONENT_LIB_DIR || path.resolve(ROOT_DIR, "../src/components"),
  gsapDir: process.env.MP_GSAP_DIR || path.resolve(ROOT_DIR, "../vendor/gsap"),
  llm: {
    provider: llmProvider,
    model: process.env.MP_LLM_MODEL || (llmProvider === "anthropic" ? "claude-sonnet-4-20250514" : "gpt-4o"),
    apiKey: (llmProvider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || "",
  },
};
