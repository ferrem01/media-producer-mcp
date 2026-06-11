# Reference Image Pipeline

Spec for adding reference image support to media-producer-mcp so the LLM planner and scene generator can **see** visual references instead of hallucinating from text descriptions.

## Problem

When a user says "make it look like Claude's UI" or "match the style of this screenshot," the planner writes a text description from imagination. The freeform-agentic scene generator then writes HTML from that text — two layers of telephone. Reference images fix this by giving both stages direct vision access to the target visuals.

---

## 1. Type Definitions

Add to `src/core/types.ts`:

```ts
// ── Reference Images ──

export type ReferenceImageRole =
  | "ui_reference"       // Screenshot of a UI to replicate
  | "style_reference"    // Visual style/aesthetic to match
  | "brand_reference"    // Brand materials (not logos — those go in BrandKit)
  | "screenshot";        // Generic screenshot for context

export interface ReferenceImage {
  /** HTTPS URL or base64 data URI (data:image/png;base64,...) */
  url: string;
  /** How to use this image */
  role: ReferenceImageRole;
  /** Optional human label, e.g. "Claude chat interface" */
  label?: string;
  /** Local cached path (set after download, not user-provided) */
  _cachedPath?: string;
  /** Base64 data for Anthropic API (set after processing, not user-provided) */
  _base64Data?: string;
  /** MIME type (set after processing) */
  _mediaType?: string;
}
```

---

## 2. Generate Tool Schema

In `src/server.ts`, add `reference_images` to the `generate` tool's Zod schema:

```ts
reference_images: z.array(z.object({
  url: z.string().describe("HTTPS URL or base64 data URI (data:image/...)"),
  role: z.enum(["ui_reference", "style_reference", "brand_reference", "screenshot"]),
  label: z.string().optional().describe("Human label for this reference, e.g. 'Claude chat UI'"),
})).max(10).optional().describe(
  "Reference images the LLM can see while planning and generating scenes. " +
  "Use for UI screenshots, style references, or brand materials."
),
```

Thread into `PipelineOpts` when calling `runGeneratePipeline`:

```ts
reference_images: params.reference_images,
```

---

## 3. Pipeline Threading

### `PipelineOpts` (`src/llm/pipeline.ts`)

```ts
export interface PipelineOpts {
  // ... existing fields ...
  /** Reference images for vision-aware generation */
  referenceImages?: ReferenceImage[];
}
```

### `runUnifiedPipeline` changes

Before calling `planStoryboard`, download and cache all reference images:

```ts
// Download and cache reference images
let processedRefs: ReferenceImage[] | undefined;
if (opts.referenceImages?.length) {
  processedRefs = await processReferenceImages(
    opts.referenceImages,
    opts.tenant_id,
    projectId,
  );
}
```

Pass to planner:

```ts
const storyboard = await planStoryboard({
  // ... existing fields ...
  referenceImages: processedRefs,
});
```

Pass to scene generator (per scene):

```ts
const generated = await generateScene({
  // ... existing fields ...
  referenceImages: processedRefs,
});
```

---

## 4. Image Handling Module

New file: `src/llm/reference-images.ts`

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { projectDir } from "../persistence/paths.js";
import type { ReferenceImage } from "../core/types.js";
import type { LLMContentPart } from "./client.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5MB per image
const MAX_IMAGES = 10;
const SUPPORTED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif",
]);

/**
 * Download, validate, cache, and base64-encode reference images.
 * Populates _cachedPath, _base64Data, and _mediaType on each image.
 */
export async function processReferenceImages(
  images: ReferenceImage[],
  tenantId: string,
  projectId: string,
): Promise<ReferenceImage[]> {
  var capped = images.slice(0, MAX_IMAGES);
  var cacheDir = path.join(
    projectDir(tenantId, projectId), "_assets", "references"
  );
  await fs.mkdir(cacheDir, { recursive: true });

  var results: ReferenceImage[] = [];

  for (var i = 0; i < capped.length; i++) {
    var img = { ...capped[i] };
    try {
      if (img.url.startsWith("data:")) {
        // Parse data URI
        var match = img.url.match(
          /^data:(image\/[^;]+);base64,(.+)$/
        );
        if (!match) throw new Error("Invalid data URI");
        img._mediaType = match[1];
        img._base64Data = match[2];
        // Also save to disk for caching
        var ext = img._mediaType.split("/")[1] || "png";
        var cachePath = path.join(cacheDir, `ref_${i}.${ext}`);
        await fs.writeFile(cachePath, Buffer.from(img._base64Data, "base64"));
        img._cachedPath = cachePath;
      } else {
        // Download from URL
        var response = await fetch(img.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        var contentType = response.headers.get("content-type") || "";
        var mediaType = contentType.split(";")[0].trim();
        if (!SUPPORTED_TYPES.has(mediaType)) {
          // Try to infer from URL extension
          mediaType = inferMediaType(img.url) || "image/png";
        }
        var buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_IMAGE_BYTES) {
          throw new Error(
            `Image too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB (max 5MB)`
          );
        }
        var ext = mediaType.split("/")[1] || "png";
        if (ext === "jpeg") ext = "jpg";
        var cachePath = path.join(cacheDir, `ref_${i}.${ext}`);
        await fs.writeFile(cachePath, buffer);
        img._cachedPath = cachePath;
        img._base64Data = buffer.toString("base64");
        img._mediaType = mediaType;
      }
      results.push(img);
      console.log(
        `  [ref-images] Cached reference ${i}: ${img.label || img.role} (${img._mediaType})`
      );
    } catch (e: any) {
      console.warn(
        `  [ref-images] Failed to process reference ${i}: ${e.message}`
      );
      // Skip failed images, don't block the pipeline
    }
  }

  return results;
}

function inferMediaType(url: string): string | null {
  var ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  var map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  return ext ? map[ext] || null : null;
}

/**
 * Build LLM content parts (image_url blocks) for reference images.
 * Used to inject into planner and agentic generator messages.
 */
export function buildReferenceImageParts(
  images: ReferenceImage[],
): LLMContentPart[] {
  var parts: LLMContentPart[] = [];

  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    if (!img._base64Data || !img._mediaType) continue;

    // Label text block before each image
    parts.push({
      type: "text",
      text: `Reference image ${i + 1}${img.label ? ` — "${img.label}"` : ""} (${img.role}):`,
    });

    // Image content block as data URI
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${img._mediaType};base64,${img._base64Data}`,
      },
    });
  }

  return parts;
}

/**
 * Build a text summary of available reference images (for system prompts).
 */
export function buildReferenceImageSummary(
  images: ReferenceImage[],
): string {
  if (!images.length) return "";

  var lines = [
    "\n## Reference Images",
    `You have ${images.length} reference image(s). They are included as vision content in this conversation.`,
    "Study them carefully and match the visual style, layout, and design patterns you see.",
    "",
  ];

  for (var i = 0; i < images.length; i++) {
    var img = images[i];
    lines.push(
      `- **Reference ${i + 1}**: ${img.label || "unlabeled"} (${img.role})`
    );
  }

  lines.push("");
  lines.push(
    "When writing freeform_brief descriptions or HTML, explicitly reference these images: " +
    '"Match the layout from reference image 1", "Use the color palette from reference 2", etc.'
  );

  return lines.join("\n");
}
```

---

## 5. Planner Integration

### `UnifiedPlannerOpts` (`src/llm/unified-planner.ts`)

```ts
export interface UnifiedPlannerOpts {
  // ... existing fields ...
  referenceImages?: ReferenceImage[];
}
```

### Changes to `planStoryboard`

1. Append reference image summary to the system prompt:

```ts
import {
  buildReferenceImageParts,
  buildReferenceImageSummary,
} from "./reference-images.js";

// In planStoryboard(), after existing system prompt construction:
if (opts.referenceImages?.length) {
  systemPrompt += buildReferenceImageSummary(opts.referenceImages);
}
```

2. Convert the user message to a multi-part message with vision content:

```ts
// Replace the simple string user message with a content array:
var userContent: LLMContentPart[];

if (opts.referenceImages?.length) {
  var refParts = buildReferenceImageParts(opts.referenceImages);
  userContent = [
    { type: "text", text: userPrompt },
    ...refParts,
  ];
} else {
  userContent = [{ type: "text", text: userPrompt }];
}

var raw = await callLLM(opts.llmConfig, [
  { role: "system", content: systemPrompt },
  { role: "user", content: userContent },
], { temperature: 0.5, maxTokens: 8192 });
```

### Effect on Planner Output

With reference images visible, the planner can write freeform_brief storyboards that say:

> "A chat interface matching the layout from reference image 1 — the same left sidebar with rounded nav items, the central message area with soft message bubbles, and the input bar with rounded corners at the bottom. Match the exact border-radius and spacing patterns. BG: warm cream (#faf9f6). MG: Chat messages staggering in with gentle 0.3s fade..."

Instead of the current hallucinated descriptions based on guessing what "Claude's UI" looks like.

---

## 6. Freeform-Agentic Integration

### `AgenticFreeformOpts` (`src/llm/freeform-agentic.ts`)

```ts
export interface AgenticFreeformOpts {
  // ... existing fields ...
  referenceImages?: ReferenceImage[];
}
```

### System prompt changes in `buildAgenticSystemPrompt`

Append reference image context:

```ts
import { buildReferenceImageSummary } from "./reference-images.js";

// At end of buildAgenticSystemPrompt():
if (opts.referenceImages?.length) {
  prompt += buildReferenceImageSummary(opts.referenceImages);
  prompt += `\nYou can call the compare_to_reference tool to view any reference image during your work.\n`;
}
```

### Inject reference images into the initial user message

In `generateFreeformAgentic`, convert the user message to include vision content:

```ts
import { buildReferenceImageParts } from "./reference-images.js";

// In generateFreeformAgentic(), when building messages:
var userContent: LLMContentPart[];
if (opts.referenceImages?.length) {
  var refParts = buildReferenceImageParts(opts.referenceImages);
  userContent = [
    { type: "text", text: userPrompt },
    ...refParts,
  ];
} else {
  userContent = [{ type: "text", text: userPrompt }];
}

var messages: LLMMessage[] = [
  { role: "system", content: systemPrompt },
  { role: "user", content: userContent },
];
```

### New tool: `compare_to_reference`

Add to the `TOOLS` array. This lets the LLM re-request a specific reference image mid-conversation (since images in early messages may fall out of the context window in long agentic loops):

```ts
{
  name: "compare_to_reference",
  description:
    "View a specific reference image again. Use this when you need to " +
    "check details of a reference image while writing or revising your HTML.",
  input_schema: {
    type: "object",
    properties: {
      index: {
        type: "number",
        description: "1-based reference image index (e.g. 1 for 'Reference image 1')",
      },
    },
    required: ["index"],
  },
}
```

Tool execution (add to the tool dispatch in the agentic loop):

```ts
} else if (toolCall.name === "compare_to_reference") {
  var refIndex = (toolCall.input.index as number) - 1;  // 0-based
  if (opts.referenceImages && refIndex >= 0 && refIndex < opts.referenceImages.length) {
    var refImg = opts.referenceImages[refIndex];
    if (refImg._base64Data && refImg._mediaType) {
      // Return as a structured content block with the image
      // The tool result includes both text and an image re-injection
      toolResult = `Reference image ${refIndex + 1}: "${refImg.label || refImg.role}". The image is shown below. Study it carefully and match the visual details in your HTML.`;
      // NOTE: For the image to actually appear, we need to inject it as a
      // separate user message after the tool_result. See implementation note below.
    } else {
      toolResult = `Reference image ${refIndex + 1} is not available (failed to process).`;
    }
  } else {
    toolResult = `Invalid reference index. Available: 1-${opts.referenceImages?.length || 0}`;
  }
}
```

**Implementation note for `compare_to_reference`:** Anthropic tool_result blocks only support text content. To re-show the image, append a follow-up user message with the image content block after the tool_result message:

```ts
// After adding the tool results message:
if (hasCompareToReference) {
  // Add a follow-up user message with the image
  messages.push({
    role: "user",
    content: [
      { type: "text", text: `Here is reference image ${refIndex + 1} again:` },
      {
        type: "image_url",
        image_url: {
          url: `data:${refImg._mediaType};base64,${refImg._base64Data}`,
        },
      },
    ] as LLMContentPart[],
  });
}
```

---

## 7. Scene Generator Threading

The `generateScene` function in `src/llm/scene-generator.ts` dispatches to `generateFreeformAgentic` for freeform scenes. Thread `referenceImages` through:

```ts
// In generateScene() opts interface:
export interface SceneGenOpts {
  // ... existing fields ...
  referenceImages?: ReferenceImage[];
}

// When calling generateFreeformAgentic:
var html = await generateFreeformAgentic({
  // ... existing fields ...
  referenceImages: opts.referenceImages,
});
```

---

## 8. Critiquer Integration (Future/Optional)

Not in scope for the initial implementation, but the architecture supports it. The critiquer (`src/llm/critiquer.ts` / `multi-pass-critiquer.ts`) already captures screenshots of rendered scenes. A future enhancement could:

1. Pass reference images to the critiquer LLM alongside the rendered screenshot
2. Add a critique dimension: "visual fidelity to reference"
3. Score how well the rendered output matches the reference
4. Generate targeted revision feedback: "The sidebar is 300px but the reference shows ~250px. The message bubbles use sharp corners but the reference uses rounded corners."

This would close the loop: reference → plan → generate → critique against reference → revise.

---

## 9. Data Flow Summary

```
User provides reference_images in generate tool call
  │
  ▼
server.ts: validate, pass to runGeneratePipeline
  │
  ▼
pipeline.ts: processReferenceImages() → download, cache, base64 encode
  │
  ├──▶ planStoryboard(): images in user message as vision content
  │     Planner writes freeform_brief with "match reference image 1" directions
  │
  └──▶ generateScene() → generateFreeformAgentic():
        Images in initial user message as vision content
        compare_to_reference tool for mid-conversation re-viewing
        LLM writes HTML while seeing the actual reference
```

---

## 10. Files to Change

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `ReferenceImage`, `ReferenceImageRole` |
| `src/llm/reference-images.ts` | **New file**: download, cache, base64, content part builders |
| `src/server.ts` | Add `reference_images` param to `generate` tool schema |
| `src/llm/pipeline.ts` | Add `referenceImages` to `PipelineOpts`, call `processReferenceImages`, thread to planner + generator |
| `src/llm/unified-planner.ts` | Add `referenceImages` to `UnifiedPlannerOpts`, inject into system prompt + user message |
| `src/llm/freeform-agentic.ts` | Add `referenceImages` to `AgenticFreeformOpts`, inject into prompts + messages, add `compare_to_reference` tool |
| `src/llm/scene-generator.ts` | Thread `referenceImages` through to freeform-agentic |

---

## 11. Constraints

- **Max 10 images**, **5MB each** — Anthropic API limits
- Download timeout: 10 seconds per image
- Failed downloads are skipped (logged, not blocking)
- GIF support: first frame only (Anthropic handles this natively)
- Cached files go to `{project_dir}/_assets/references/` — cleaned up with project deletion
- No new npm dependencies — uses native `fetch` and `Buffer`

---

## 12. Testing Plan

1. **Unit test**: `processReferenceImages` — mock fetch, verify caching and base64 encoding
2. **Unit test**: `buildReferenceImageParts` — verify correct LLM content block format
3. **Integration test**: `planStoryboard` with reference images — verify the storyboard brief mentions reference images
4. **Integration test**: `generateFreeformAgentic` with reference images — verify HTML output reflects visual references
5. **E2E test**: `generate` tool call with `reference_images` parameter — full pipeline run
