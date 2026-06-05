/**
 * Scene Template Catalog
 *
 * Metadata for each scene template. The planner uses this to select
 * the right template for each scene moment. Templates are full
 * .component.html files with premium visuals baked in -- the LLM
 * only needs to adapt content via SEARCH/REPLACE, not write CSS/GSAP.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

export interface TemplateSlot {
  name: string;
  type: "string" | "number" | "array" | "svg";
  required: boolean;
  description: string;
  example?: string;
}

export interface SceneTemplate {
  id: string;
  name: string;
  category: "opening" | "content" | "data" | "closing";
  /** When the planner should pick this template */
  when: string;
  /** What it feels like */
  feel: string;
  /** Content the planner needs to fill */
  slots: TemplateSlot[];
  /** Recommended duration range in seconds */
  duration: [number, number];
  /** File name in templates/ dir */
  file: string;
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  // ── OPENINGS ──
  {
    id: "O1-big-statement",
    name: "Big Statement",
    category: "opening",
    when: "Opening scene. One powerful headline that sets the tone.",
    feel: "Apple WWDC title card. Dramatic, confident, minimal.",
    slots: [
      { name: "badge", type: "string", required: false, description: "Optional eyebrow text", example: "INTRODUCING" },
      { name: "headline", type: "string", required: true, description: "Main statement, max 5-6 words", example: "The Future of Marketing" },
      { name: "subtitle", type: "string", required: false, description: "Supporting line", example: "AI-powered demand generation" },
    ],
    duration: [4, 5],
    file: "O1-big-statement.scene.html",
  },
  {
    id: "O3-provocation",
    name: "Provocation",
    category: "opening",
    when: "Opening with a question, challenge, or bold claim that creates tension.",
    feel: "TED talk opening. Draws the viewer in.",
    slots: [
      { name: "question", type: "string", required: true, description: "Provocative question or statement", example: "What if your pipeline built itself?" },
      { name: "attribution", type: "string", required: false, description: "Context or source line", example: "The question every CMO is asking" },
    ],
    duration: [4, 5],
    file: "O3-provocation.scene.html",
  },

  // ── CONTENT ──
  {
    id: "C1-feature-spotlight",
    name: "Feature Spotlight",
    category: "content",
    when: "Highlighting a single feature or benefit with supporting detail.",
    feel: "Clean, editorial, focused attention on one idea.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Category label", example: "ANALYTICS" },
      { name: "headline", type: "string", required: true, description: "Feature name or benefit, 3-8 words", example: "Real-Time Pipeline Analytics" },
      { name: "body", type: "string", required: false, description: "1-2 sentence description", example: "See every touchpoint, conversion, and revenue signal in one dashboard." },
      { name: "icon_svg", type: "svg", required: false, description: "Inline SVG icon (24x24 viewBox)", example: '<svg viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3"/></svg>' },
    ],
    duration: [4, 6],
    file: "C1-feature-spotlight.scene.html",
  },
  {
    id: "C3-feature-grid",
    name: "Feature Grid",
    category: "content",
    when: "Showcasing 3-4 features or benefits as glassmorphic cards.",
    feel: "Modern SaaS, clean information architecture, bento-style.",
    slots: [
      { name: "heading", type: "string", required: false, description: "Optional section heading", example: "Everything You Need" },
      { name: "features", type: "array", required: true, description: "Array of 3-4 features with title, description, icon_svg", example: '[{"title":"Analytics","description":"Track every metric"},{"title":"Automation","description":"Set it and forget it"}]' },
    ],
    duration: [5, 7],
    file: "C3-feature-grid.scene.html",
  },
  {
    id: "C5-testimonial",
    name: "Testimonial",
    category: "content",
    when: "Customer quote, social proof, endorsement.",
    feel: "Authentic, warm, credible.",
    slots: [
      { name: "quote", type: "string", required: true, description: "Testimonial text", example: "Quotient transformed how we think about demand gen." },
      { name: "author", type: "string", required: true, description: "Person's name", example: "Sarah Chen" },
      { name: "role", type: "string", required: false, description: "Title and company", example: "VP Marketing, Acme Corp" },
      { name: "avatar_url", type: "string", required: false, description: "Headshot URL" },
    ],
    duration: [5, 6],
    file: "C5-testimonial.scene.html",
  },

  // ── DATA ──
  {
    id: "D1-hero-stat",
    name: "Hero Stat",
    category: "data",
    when: "Showcasing a single impressive number or metric.",
    feel: "Dramatic reveal of a powerful data point.",
    slots: [
      { name: "prefix", type: "string", required: false, description: "e.g. $ or #" },
      { name: "value", type: "number", required: true, description: "The number to count up to", example: "3.2" },
      { name: "suffix", type: "string", required: false, description: "e.g. %, x, M, +", example: "x" },
      { name: "decimals", type: "number", required: false, description: "Decimal places (default 0)" },
      { name: "label", type: "string", required: true, description: "What the number means", example: "PIPELINE GROWTH" },
    ],
    duration: [4, 5],
    file: "D1-hero-stat.scene.html",
  },
  {
    id: "D2-metric-trio",
    name: "Metric Trio",
    category: "data",
    when: "Three related stats side by side. Social proof, KPIs.",
    feel: "Data-driven confidence. Clean grid of proof points.",
    slots: [
      { name: "metrics", type: "array", required: true, description: "Array of 3 metrics with value, suffix?, prefix?, label", example: '[{"value":99,"suffix":"%","label":"UPTIME"},{"value":3,"suffix":"x","label":"FASTER"},{"value":50,"suffix":"K+","label":"USERS"}]' },
    ],
    duration: [5, 6],
    file: "D2-metric-trio.scene.html",
  },

  // ── CLOSING ──
  {
    id: "E1-cta-finale",
    name: "CTA Finale",
    category: "closing",
    when: "Final call to action. Drive the viewer to do something.",
    feel: "Confident, energetic, clear single action.",
    slots: [
      { name: "headline", type: "string", required: true, description: "The ask, 3-6 words", example: "Start Your Free Trial" },
      { name: "subtitle", type: "string", required: false, description: "Supporting urgency line", example: "Join 10,000+ marketers already using Quotient" },
      { name: "cta_text", type: "string", required: true, description: "Button label", example: "Get Started Free" },
      { name: "cta_url", type: "string", required: false, description: "URL displayed below button", example: "getquotient.ai" },
    ],
    duration: [4, 5],
    file: "E1-cta-finale.scene.html",
  },
];

/**
 * Format the template catalog for the planner prompt.
 */
export function formatTemplateCatalogForPrompt(): string {
  let out = `## Scene Templates\n\nPre-built premium scenes with Apple-level visual quality baked in.\nSelect a template when it fits the narrative moment. Fill the content slots.\nThe visual design, animations, and layout are handled -- you only provide content.\n\n`;

  const byCategory = new Map<string, SceneTemplate[]>();
  for (const t of SCENE_TEMPLATES) {
    const list = byCategory.get(t.category) || [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  const order: Array<[string, string]> = [
    ["opening", "OPENINGS"],
    ["content", "CONTENT"],
    ["data", "DATA"],
    ["closing", "CLOSINGS"],
  ];

  for (const [cat, label] of order) {
    const templates = byCategory.get(cat);
    if (!templates?.length) continue;

    out += `### ${label}\n\n`;
    for (const t of templates) {
      out += `**${t.id}** - ${t.name}\n`;
      out += `  When: ${t.when}\n`;
      out += `  Feel: ${t.feel}\n`;
      out += `  Duration: ${t.duration[0]}-${t.duration[1]}s\n`;
      out += `  Slots:\n`;
      for (const s of t.slots) {
        const req = s.required ? "required" : "optional";
        out += `    - ${s.name} (${s.type}, ${req}): ${s.description}`;
        if (s.example) out += ` — e.g. ${s.example}`;
        out += `\n`;
      }
      out += `\n`;
    }
  }

  return out;
}
