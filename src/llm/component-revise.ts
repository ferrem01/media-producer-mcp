/**
 * Component Revise Pipeline
 *
 * Surgically edits existing .component.html files using SEARCH/REPLACE blocks.
 * The LLM receives the full existing HTML and specific instructions, then
 * outputs targeted edits rather than rewriting the entire file.
 *
 * Based on the proven pattern from video-producer-mcp's component-pipeline.ts.
 */

import { callLLM, type LLMConfig } from "./client.js";
import type { BrandKit, Canvas } from "../core/types.js";

export interface ReviseComponentOpts {
  /** Full HTML source of the existing component */
  existingSource: string;
  /** Specific instructions for what to change */
  instructions: string;
  /** Component type name */
  componentName: string;
  /** Context */
  llmConfig: LLMConfig;
  brandKit?: BrandKit;
  canvas?: Canvas;
}

export interface ReviseComponentResult {
  /** The revised HTML source */
  source: string;
  /** Number of SEARCH/REPLACE blocks applied */
  blocksApplied: number;
  /** Whether it fell back to full rewrite */
  fullRewrite: boolean;
}

/**
 * Revise a .component.html by applying targeted SEARCH/REPLACE edits.
 * Falls back to full rewrite if SEARCH/REPLACE fails.
 */
export async function reviseComponent(opts: ReviseComponentOpts): Promise<ReviseComponentResult> {
  // First attempt: SEARCH/REPLACE
  const srResult = await attemptSearchReplace(opts);
  if (srResult) {
    return srResult;
  }

  // Fallback: full rewrite with strong preservation instructions
  console.log(`  [revise] SEARCH/REPLACE failed for ${opts.componentName}, falling back to full rewrite`);
  return await fullRewriteFallback(opts);
}

// ── SEARCH/REPLACE Approach ──

async function attemptSearchReplace(opts: ReviseComponentOpts): Promise<ReviseComponentResult | null> {
  const systemPrompt = `You are a surgical code editor for HTML components. You receive an existing .component.html file and specific change instructions.

Your job is to output ONLY the minimal SEARCH/REPLACE blocks needed to make the requested changes. Do NOT rewrite the entire file.

## SEARCH/REPLACE Format

For each change, output a block like this:

<<<<<<< SEARCH
(exact text to find in the current file)
=======
(replacement text)
>>>>>>> REPLACE

## RULES
1. SEARCH content must match the EXACT text in the current file (including whitespace, quotes, semicolons).
2. Each SEARCH block must be unique -- it should match exactly ONE location.
3. Make the MINIMUM number of changes. If the instruction says "change font-size from 18px to 24px", output ONE block that changes just that property.
4. NEVER change text content (headlines, labels, button text, body copy) unless the instructions EXPLICITLY ask for it.
5. NEVER change colors unless the instructions EXPLICITLY ask for it.
6. Keep blocks small and focused. Prefer multiple small blocks over one large block.
7. Include enough context in SEARCH to be unique, but don't include entire sections unnecessarily.

## Example

If the existing component has:
\`\`\`
.headline {
  font-size: 48px;
  line-height: 1.4;
  font-weight: 800;
}
\`\`\`

And the instruction is "tighten headline line-height to 1.1", output:

<<<<<<< SEARCH
  line-height: 1.4;
=======
  line-height: 1.1;
>>>>>>> REPLACE

That's it. Don't touch font-size or font-weight.

Output ONLY SEARCH/REPLACE blocks. No commentary, no explanation.`;

  const userPrompt = `## Existing Component: ${opts.componentName}

\`\`\`html
${opts.existingSource}
\`\`\`

## Changes Required
${opts.instructions}

Output the SEARCH/REPLACE blocks to make these changes.`;

  try {
    const raw = await callLLM(opts.llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { temperature: 0.2, maxTokens: 8192 });

    const blocks = parseSearchReplaceBlocks(raw);
    if (blocks.length === 0) {
      console.log(`  [revise] No SEARCH/REPLACE blocks found in LLM response`);
      return null;
    }

    const applied = applySearchReplaceBlocks(opts.existingSource, blocks);
    if (applied.failures > 0) {
      console.log(`  [revise] ${applied.failures}/${blocks.length} SEARCH/REPLACE blocks failed to match`);
      if (applied.successes === 0) {
        return null; // All failed, fall back
      }
    }

    console.log(`  [revise] Applied ${applied.successes}/${blocks.length} SEARCH/REPLACE blocks for ${opts.componentName}`);

    return {
      source: applied.result,
      blocksApplied: applied.successes,
      fullRewrite: false,
    };
  } catch (e: any) {
    console.error(`  [revise] SEARCH/REPLACE attempt failed: ${e.message}`);
    return null;
  }
}

// ── Full Rewrite Fallback ──

async function fullRewriteFallback(opts: ReviseComponentOpts): Promise<ReviseComponentResult> {
  const systemPrompt = `You are revising an existing HTML component. You MUST preserve all content and structure that isn't explicitly asked to change.

CRITICAL PRESERVATION RULES:
1. Keep ALL text content exactly as-is (headlines, body copy, button labels, stats, etc.)
2. Keep ALL colors exactly as-is unless instructed to change them
3. Keep the overall layout structure unless instructed to change it
4. Keep all GSAP animations unless instructed to change them
5. Only modify the specific things listed in the instructions

You are making a MINIMAL edit, not a rewrite. The output should be 95%+ identical to the input.

Output ONLY the complete .component.html source. No markdown fences, no commentary.
Start with <template> and end with </script>.`;

  const userPrompt = `## Existing Component: ${opts.componentName}

\`\`\`html
${opts.existingSource}
\`\`\`

## Changes Required (ONLY change these things, preserve everything else)
${opts.instructions}

Output the COMPLETE revised .component.html with ONLY the listed changes applied.`;

  const raw = await callLLM(opts.llmConfig, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ], { temperature: 0.2, maxTokens: 16384 });

  let source = raw.trim();
  // Strip markdown fences
  const fenceMatch = source.match(/```(?:html)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    source = fenceMatch[1].trim();
  }

  return {
    source,
    blocksApplied: 0,
    fullRewrite: true,
  };
}

// ── SEARCH/REPLACE Parsing ──

interface SearchReplaceBlock {
  search: string;
  replace: string;
}

function parseSearchReplaceBlocks(response: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const lines = response.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === "<<<<<<< SEARCH") {
      const searchLines: string[] = [];
      const replaceLines: string[] = [];
      i++;

      // Collect SEARCH lines until =======
      while (i < lines.length && lines[i].trim() !== "=======") {
        searchLines.push(lines[i]);
        i++;
      }
      i++; // skip =======

      // Collect REPLACE lines until >>>>>>> REPLACE
      while (i < lines.length && lines[i].trim() !== ">>>>>>> REPLACE") {
        replaceLines.push(lines[i]);
        i++;
      }
      i++; // skip >>>>>>> REPLACE

      if (searchLines.length > 0) {
        blocks.push({
          search: searchLines.join("\n"),
          replace: replaceLines.join("\n"),
        });
      }
    } else {
      i++;
    }
  }

  return blocks;
}

// ── SEARCH/REPLACE Application ──

function applySearchReplaceBlocks(
  source: string,
  blocks: SearchReplaceBlock[],
): { result: string; successes: number; failures: number } {
  let result = source;
  let successes = 0;
  let failures = 0;

  for (const block of blocks) {
    // Try exact match first
    if (result.includes(block.search)) {
      result = result.replace(block.search, block.replace);
      successes++;
      continue;
    }

    // Try trimmed match (whitespace flexibility)
    const trimmedSearch = block.search.trim();
    if (trimmedSearch && result.includes(trimmedSearch)) {
      result = result.replace(trimmedSearch, block.replace.trim());
      successes++;
      continue;
    }

    // Try context-anchor matching: use first and last non-empty lines
    const searchLines = block.search.split("\n").filter(l => l.trim().length > 0);
    if (searchLines.length >= 2) {
      const firstLine = searchLines[0].trim();
      const lastLine = searchLines[searchLines.length - 1].trim();

      // Find the region between first and last line in the source
      const firstIdx = result.indexOf(firstLine);
      if (firstIdx >= 0) {
        const searchAfter = firstIdx + firstLine.length;
        const lastIdx = result.indexOf(lastLine, searchAfter);
        if (lastIdx >= 0) {
          const endIdx = lastIdx + lastLine.length;
          const originalRegion = result.substring(firstIdx, endIdx);
          result = result.replace(originalRegion, block.replace.trim());
          successes++;
          console.log(`  [revise] Used context-anchor matching for block`);
          continue;
        }
      }
    }

    // Failed to match
    console.log(`  [revise] Failed to match SEARCH block: "${block.search.substring(0, 80)}..."`);
    failures++;
  }

  return { result, successes, failures };
}
