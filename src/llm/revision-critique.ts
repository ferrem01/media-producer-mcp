/**
 * Revision-Aware Critique Loop
 *
 * Unlike the standard critique loop (which regenerates components from scratch),
 * this version feeds critique issues back through the SEARCH/REPLACE pipeline
 * to preserve content while fixing visual issues.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { LLMConfig } from "./client.js";
import { reviseComponent } from "./component-revise.js";
import { critiqueScene, type CritiqueResult } from "./critiquer.js";
import { assembleScene, type ComponentSource } from "../core/scene-assembler.js";
import { captureSingleFrame } from "../core/capture.js";
import { config } from "../config.js";
import { tenantComponentsDir } from "../persistence/paths.js";
import type { BrandKit, Canvas, OutputFormat, Scene } from "../core/types.js";
import type { TraceBuilder } from "../trace/index.js";

export interface RevisionCritiqueOpts {
  scene: Scene;
  /** Map of custom component type -> HTML source */
  customSources: Map<string, string>;
  /** Original revision prompt */
  prompt: string;
  format: OutputFormat;
  llmConfig: LLMConfig;
  brandKit: BrandKit;
  canvas: Canvas;
  tenantId: string;
  projectId: string;
  compDir: string;
  maxRetries?: number;
  trace?: TraceBuilder;
}

export interface RevisionCritiqueResult {
  scene: Scene;
  customSources: Map<string, string>;
  critiqueResult?: CritiqueResult;
  accepted: boolean;
}

/**
 * Critique a revised scene and fix issues via SEARCH/REPLACE (not regeneration).
 */
export async function critiqueAndReviseScene(
  opts: RevisionCritiqueOpts,
): Promise<RevisionCritiqueResult> {
  const maxRetries = opts.maxRetries ?? 2;
  let currentScene = opts.scene;
  let currentCustomSources = new Map(opts.customSources);
  let bestScore = 0;
  let bestScene = opts.scene;
  let bestCustomSources = new Map(opts.customSources);
  let lastCritique: CritiqueResult | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    opts.trace?.beginEvent(`revision_critique_attempt_${attempt}`);

    try {
      // 1. Collect component sources
      const componentSources: ComponentSource[] = [];
      for (const comp of currentScene.components) {
        if (currentCustomSources.has(comp.type)) {
          componentSources.push({ type: comp.type, source: currentCustomSources.get(comp.type)! });
        } else {
          const source = await findComponentSource(comp.type, opts.tenantId);
          if (source) {
            componentSources.push({ type: comp.type, source });
          }
        }
      }

      if (componentSources.length === 0) {
        console.log(`  [revision-critique] No component sources found, skipping critique`);
        opts.trace?.endEvent({ skipped: true });
        break;
      }

      // 2. Assemble scene HTML
      const assembledHtml = await assembleScene({
        scene: currentScene,
        components: componentSources,
        brandKit: opts.brandKit,
        canvas: opts.canvas,
        gsapDir: config.gsapDir,
      });

      // 3. Capture preview
      const tmpDir = path.join(os.tmpdir(), `rev_critique_${opts.projectId}_${attempt}`);
      await fs.mkdir(tmpDir, { recursive: true });
      const htmlPath = path.join(tmpDir, "scene.html");
      const previewPath = path.join(tmpDir, "preview.png");

      await fs.writeFile(htmlPath, assembledHtml);
      await captureSingleFrame({
        htmlPath,
        outputPath: previewPath,
        width: opts.canvas.width,
        height: opts.canvas.height,
        atTime: currentScene.duration_seconds / 3,
      });

      // 4. Critique
      const previewBase64 = (await fs.readFile(previewPath)).toString("base64");
      const critiqueResult = await critiqueScene({
        sceneHtml: assembledHtml,
        previewImageBase64: previewBase64,
        prompt: opts.prompt,
        llmConfig: opts.llmConfig,
        format: opts.format,
        trace: opts.trace,
        critiqueRound: attempt,
      });

      lastCritique = critiqueResult;
      console.log(`  [revision-critique] Attempt ${attempt}: score=${critiqueResult.score}, issues=${critiqueResult.issues.length}`);
      if (critiqueResult.issues.length > 0) {
        console.log(`    Issues: ${critiqueResult.issues.join(" | ")}`);
      }

      // Clean up temp files
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      // Track best
      if (critiqueResult.score > bestScore) {
        bestScore = critiqueResult.score;
        bestScene = currentScene;
        bestCustomSources = new Map(currentCustomSources);
      }

      // 5. Accept if score >= 7
      if (critiqueResult.score >= 7) {
        console.log(`  [revision-critique] Score ${critiqueResult.score} accepted`);
        opts.trace?.endEvent({ score: critiqueResult.score, accepted: true });
        return {
          scene: currentScene,
          customSources: currentCustomSources,
          critiqueResult,
          accepted: true,
        };
      }

      // 6. Score < 7: fix via SEARCH/REPLACE (NOT regeneration)
      if (attempt < maxRetries) {
        console.log(`  [revision-critique] Score ${critiqueResult.score} too low, fixing via SEARCH/REPLACE`);

        // Build fix instructions from critique issues + suggestions
        const fixInstructions = buildFixInstructions(critiqueResult);

        // Apply SEARCH/REPLACE fixes to each custom component that might be causing issues
        for (const comp of currentScene.components) {
          const source = currentCustomSources.get(comp.type);
          if (!source) continue; // Only fix custom components

          const reviseResult = await reviseComponent({
            existingSource: source,
            instructions: fixInstructions,
            componentName: comp.type,
            llmConfig: opts.llmConfig,
            brandKit: opts.brandKit,
            canvas: opts.canvas,
          });

          if (reviseResult.blocksApplied > 0 || reviseResult.fullRewrite) {
            console.log(`  [revision-critique] Fixed ${comp.type}: ${reviseResult.blocksApplied} blocks applied`);
            currentCustomSources.set(comp.type, reviseResult.source);
            // Save updated source
            await fs.writeFile(
              path.join(opts.compDir, `${comp.type}.component.html`),
              reviseResult.source,
            );
          }
        }
      }

      opts.trace?.endEvent({ score: critiqueResult.score, accepted: false });
    } catch (e: any) {
      console.error(`  [revision-critique] Attempt ${attempt} failed: ${e.message}`);
      opts.trace?.endEvent({ error: e.message });
      break;
    }
  }

  // Return best-scoring version
  console.log(`  [revision-critique] Returning best attempt (score ${bestScore})`);
  return {
    scene: bestScene,
    customSources: bestCustomSources,
    critiqueResult: lastCritique,
    accepted: bestScore >= 7,
  };
}

// ── Helpers ──

function buildFixInstructions(critique: CritiqueResult): string {
  const lines: string[] = [];
  lines.push("Fix the following visual issues in this component. ONLY fix these specific problems, do NOT change any text content (headlines, body copy, button labels, stats):\n");

  for (let i = 0; i < critique.issues.length; i++) {
    lines.push(`Issue ${i + 1}: ${critique.issues[i]}`);
  }

  if (critique.suggestions.length > 0) {
    lines.push("\nSuggested fixes:");
    for (const s of critique.suggestions) {
      lines.push(`- ${s}`);
    }
  }

  lines.push("\nIMPORTANT: Only change CSS/layout properties. Do NOT modify any text content, headlines, copy, button labels, or data values.");

  return lines.join("\n");
}

async function findComponentSource(
  type: string,
  tenantId: string,
): Promise<string | null> {
  // Check tenant components
  try {
    const filePath = path.join(tenantComponentsDir(tenantId), `${type}.component.html`);
    return await fs.readFile(filePath, "utf-8");
  } catch {}

  // Check component library
  try {
    const categories = await fs.readdir(config.componentLibDir, { withFileTypes: true });
    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      try {
        const filePath = path.join(config.componentLibDir, cat.name, `${type}.component.html`);
        return await fs.readFile(filePath, "utf-8");
      } catch {}
    }
  } catch {}

  return null;
}
