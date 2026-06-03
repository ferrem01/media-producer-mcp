/**
 * LLM Pipeline - public API
 */

export { callLLM, llmConfigFromEnv, type LLMConfig, type LLMMessage, type LLMContentPart } from "./client.js";
export { componentSystemPrompt, scenePlannerSystemPrompt, projectPlannerSystemPrompt, critiquerSystemPrompt, sceneComponentSystemPrompt } from "./prompts.js";
export { generateComponentLLM, extractComponentSource, deriveTypeName } from "./component-gen.js";
export { enrichProjectMedia, type MediaEnrichmentOpts, type MediaEnrichmentResult } from "./media-enrichment.js";
export { critiqueScene, type CritiqueResult } from "./critiquer.js";
export { buildComponentCatalog, formatCatalogForPrompt, type ComponentCatalogEntry } from "./catalog.js";
export { runGeneratePipeline, type PipelineOpts, type PipelineResult, type PipelineTarget } from "./pipeline.js";
export { planStoryboard, type UnifiedPlannerOpts, type PlannedScene, type StoryboardResult } from "./unified-planner.js";
export { generateScene, type SceneGeneratorOpts, type GeneratedScene } from "./scene-generator.js";
