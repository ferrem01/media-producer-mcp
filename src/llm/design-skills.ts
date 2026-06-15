/**
 * Design Skills Loader
 *
 * Loads the visual storytelling guide and design skills document
 * for injection into planner and scene generator prompts.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _storytellingGuide: string | null = null;
let _designSkills: string | null = null;

/**
 * Load the visual storytelling guide (injected into planner context).
 * Teaches the planner to think like a creative director.
 */
export function getStorytellingGuide(): string {
  if (!_storytellingGuide) {
    var guidePath = path.join(__dirname, "visual-storytelling-guide.md");
    try {
      _storytellingGuide = fs.readFileSync(guidePath, "utf-8");
    } catch {
      console.warn("Visual storytelling guide not found at", guidePath);
      _storytellingGuide = "";
    }
  }
  return _storytellingGuide;
}

/**
 * Load the design skills document (injected into scene generator context).
 * Teaches the LLM to write polished CSS and GSAP.
 */
export function getDesignSkills(): string {
  if (!_designSkills) {
    var skillsPath = path.join(__dirname, "design-skills.md");
    try {
      _designSkills = fs.readFileSync(skillsPath, "utf-8");
    } catch {
      console.warn("Design skills document not found at", skillsPath);
      _designSkills = "";
    }
  }
  return _designSkills;
}
