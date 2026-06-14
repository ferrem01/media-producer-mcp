/**
 * Sequence Converter
 *
 * Post-planner step that detects when the planner output contains
 * scenes referencing known library components that should be
 * orchestrated as a sequence, and converts them into a single
 * component-based sequence scene with auto-generated choreography.
 *
 * This is the code-enforced version of what the planner prompt
 * tries to encourage but LLMs unreliably follow.
 */

import type { PlannedScene, StoryboardResult, PlannedBeat } from "./unified-planner.js";
import type { ComponentCatalogEntry } from "./catalog.js";

/** Components that are known scriptable mockups -- good sequence candidates */
const SEQUENCE_COMPONENT_TYPES = new Set([
  "quotient-chat",
  "canva-editor",
  "quotient-social",
  "chat-simulator",
  "browser-frame",
  "code-editor",
]);

interface SequenceCandidate {
  sceneIndices: number[];
  components: Array<{
    type: string;
    data: Record<string, any>;
    fromScene: number;
    label: string;
  }>;
}

/**
 * Analyze a storyboard and convert consecutive scenes that reference
 * known library components into a single component-based sequence.
 *
 * Rules:
 * - Only converts when 2+ consecutive scenes reference SEQUENCE_COMPONENT_TYPES
 * - Skips bookend scenes (intro/outro/video)
 * - Preserves non-sequence scenes as-is
 * - Generates choreography with sequential reveal + slide transitions
 */
export function convertToSequences(
  storyboard: StoryboardResult,
  catalog: ComponentCatalogEntry[],
): StoryboardResult {
  var catalogTypes = new Set(catalog.map(c => c.type));
  var scenes = storyboard.scenes;

  // Find runs of consecutive scenes that use sequence-eligible components
  var candidates: SequenceCandidate[] = [];
  var currentRun: SequenceCandidate | null = null;

  for (var i = 0; i < scenes.length; i++) {
    var scene = scenes[i];
    var sequenceComponents = findSequenceComponents(scene, catalogTypes);

    if (sequenceComponents.length > 0) {
      if (!currentRun) {
        currentRun = { sceneIndices: [], components: [] };
      }
      currentRun.sceneIndices.push(i);
      for (var comp of sequenceComponents) {
        currentRun.components.push({
          type: comp.type!,
          data: comp.data || {},
          fromScene: i,
          label: scene.label,
        });
      }
    } else {
      if (currentRun && currentRun.sceneIndices.length >= 2) {
        candidates.push(currentRun);
      }
      currentRun = null;
    }
  }
  // Don't forget the last run
  if (currentRun && currentRun.sceneIndices.length >= 2) {
    candidates.push(currentRun);
  }

  if (candidates.length === 0) {
    return storyboard;
  }

  // Convert the largest candidate into a sequence
  var best = candidates.reduce((a, b) =>
    b.components.length > a.components.length ? b : a
  );

  console.log(`  [sequence-converter] Converting ${best.sceneIndices.length} scenes into one sequence (${best.components.length} components)`);
  for (var bcomp of best.components) {
    console.log(`    - ${bcomp.type} (from scene "${bcomp.label}")`);
  }

  // Build the sequence scene
  var sequenceScene = buildSequenceFromScenes(scenes, best);

  // Replace the consecutive scenes with the single sequence
  var newScenes: PlannedScene[] = [];
  var replaced = new Set(best.sceneIndices);
  var sequenceInserted = false;

  for (var i = 0; i < scenes.length; i++) {
    if (replaced.has(i)) {
      if (!sequenceInserted) {
        newScenes.push(sequenceScene);
        sequenceInserted = true;
      }
    } else {
      newScenes.push(scenes[i]);
    }
  }

  return { ...storyboard, scenes: newScenes };
}

/**
 * Find components in a scene that are sequence-eligible.
 */
function findSequenceComponents(
  scene: PlannedScene,
  catalogTypes: Set<string>,
): Array<{ type?: string; data?: Record<string, any> }> {
  // Skip bookend scenes
  var labelLower = (scene.label || "").toLowerCase();
  if (labelLower.includes("intro") || labelLower.includes("outro") ||
      labelLower.includes("cta") || labelLower.includes("closing")) {
    return [];
  }

  // Skip video-only scenes
  if (scene.components?.length === 1 && scene.components[0].type === "video") {
    return [];
  }

  // Check for sequence-eligible components
  var eligible = (scene.components || []).filter(c =>
    c.type && SEQUENCE_COMPONENT_TYPES.has(c.type) && catalogTypes.has(c.type)
  );

  // Also check freeform scenes that mention component names
  if (eligible.length === 0 && scene.freeform) {
    var brief = (scene.freeform_brief || scene.description || "").toLowerCase();
    for (var type of SEQUENCE_COMPONENT_TYPES) {
      if (brief.includes(type.replace("-", " ")) || brief.includes(type)) {
        eligible.push({ type, data: {} });
      }
    }
  }

  return eligible;
}

/**
 * Build a sequence scene from consecutive planned scenes.
 */
function buildSequenceFromScenes(
  allScenes: PlannedScene[],
  candidate: SequenceCandidate,
): PlannedScene {
  var beatDuration = 8; // Default beat duration
  var totalDuration = 0;
  var beats: PlannedBeat[] = [];
  var components: Array<any> = [];
  var choreography: Array<any> = [];
  var compIdMap = new Map<string, string>(); // type -> comp_id

  // Build components list (deduplicated by type)
  var compIndex = 0;
  for (var ccomp of candidate.components) {
    if (!compIdMap.has(ccomp.type)) {
      var compId = `comp_${compIndex}`;
      compIdMap.set(ccomp.type, compId);
      components.push({
        type: ccomp.type,
        data: ccomp.data,
        z_index: 10,
        position: { x: "10%", y: "5%", width: "80%", height: "90%" },
      });
      compIndex++;
    }
  }

  // Build beats and choreography from the original scenes
  var startTime = 0;
  var prevVisibleComps: string[] = [];

  for (var i = 0; i < candidate.sceneIndices.length; i++) {
    var sceneIdx = candidate.sceneIndices[i];
    var scene = allScenes[sceneIdx];
    var duration = scene.duration_seconds || beatDuration;

    // Determine which components are visible in this beat
    var beatComps = candidate.components
      .filter(c => c.fromScene === sceneIdx)
      .map(c => compIdMap.get(c.type)!)
      .filter(Boolean);

    // If no specific components for this scene, keep previous
    if (beatComps.length === 0) beatComps = [...prevVisibleComps];

    beats.push({
      label: scene.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, ""),
      brief: scene.description || scene.label,
      duration_seconds: duration,
      voiceover_text: scene.voiceover_text,
    });

    // Build choreography for this beat
    var transitions: Record<string, any> = {};

    for (var compId of beatComps) {
      if (!prevVisibleComps.includes(compId)) {
        // Component enters
        var enterDir = prevVisibleComps.length > 0 ? 300 : 60;
        transitions[compId] = {
          enter: { from: { opacity: 0, x: enterDir }, duration: 0.8, ease: "power2.out" },
        };
      }
    }

    // Components that exit
    for (var prevComp of prevVisibleComps) {
      if (!beatComps.includes(prevComp)) {
        transitions[prevComp] = {
          exit: { to: { opacity: 0, x: -300 }, duration: 0.6, ease: "power2.in" },
        };
      }
    }

    // Move existing components if new ones are entering (make room)
    if (beatComps.length > 1) {
      var persistingComps = beatComps.filter(c => prevVisibleComps.includes(c));
      if (persistingComps.length > 0 && beatComps.length > prevVisibleComps.length) {
        for (var pc of persistingComps) {
          transitions[pc] = {
            move: { to: { left: "3%", width: "45%" }, duration: 1.0, ease: "power2.inOut" },
          };
        }
        // Position new component on the right
        var newComps = beatComps.filter(c => !prevVisibleComps.includes(c));
        for (var nc of newComps) {
          if (!transitions[nc]) transitions[nc] = {};
          // Override position for entering component
        }
      }
    }

    choreography.push({
      label: beats[beats.length - 1].label,
      startTime,
      duration,
      visibleComponents: beatComps,
      transitions: Object.keys(transitions).length > 0 ? transitions : undefined,
    });

    prevVisibleComps = beatComps;
    startTime += duration;
    totalDuration += duration;
  }

  // Assign component IDs
  for (var ci = 0; ci < components.length; ci++) {
    components[ci].id = `comp_${ci}`;
  }

  return {
    label: "Product Walkthrough",
    duration_seconds: totalDuration,
    description: `Continuous sequence: ${candidate.components.map(c => c.type).join(" → ")}`,
    components: components.map(c => ({
      type: c.type,
      data: c.data,
      z_index: c.z_index,
      position: c.position,
    })),
    beats,
    choreography,
    voiceover_text: beats.map(b => b.voiceover_text).filter(Boolean).join(" "),
  } as any;
}
