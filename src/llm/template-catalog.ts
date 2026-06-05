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

  {
    id: "C6-split-compare",
    name: "Split Compare",
    category: "content",
    when: "Side-by-side comparison. Before/after, old way vs new way, us vs them.",
    feel: "Clean editorial contrast. The right side wins.",
    slots: [
      { name: "left_label", type: "string", required: false, description: "Left panel label", example: "Before" },
      { name: "left_title", type: "string", required: true, description: "Left panel headline", example: "The Old Way" },
      { name: "left_body", type: "string", required: false, description: "Left panel description", example: "Manual processes, scattered data." },
      { name: "left_icon_svg", type: "svg", required: false, description: "Left panel icon SVG" },
      { name: "right_label", type: "string", required: false, description: "Right panel label", example: "After" },
      { name: "right_title", type: "string", required: true, description: "Right panel headline", example: "With Quotient" },
      { name: "right_body", type: "string", required: false, description: "Right panel description", example: "Automated pipelines, instant launches." },
      { name: "right_icon_svg", type: "svg", required: false, description: "Right panel icon SVG" },
    ],
    duration: [5, 7],
    file: "C6-split-compare.scene.html",
  },
  {
    id: "C7-picture-in-picture",
    name: "Picture-in-Picture",
    category: "content",
    when: "Feature or benefit with a floating product/dashboard preview alongside the text.",
    feel: "Left-aligned text with a floating window on the right. Editorial + product shot.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Category label", example: "ANALYTICS" },
      { name: "headline", type: "string", required: true, description: "Feature headline", example: "Real-Time Analytics" },
      { name: "body", type: "string", required: false, description: "1-2 sentence description" },
      { name: "pip_label", type: "string", required: false, description: "Label inside the PiP window", example: "Live Dashboard" },
    ],
    duration: [5, 7],
    file: "C7-picture-in-picture.scene.html",
  },
  {
    id: "C8-device-mockup",
    name: "Device Mockup",
    category: "content",
    when: "Showcasing a product UI in a laptop/device frame. Product demo, walkthrough, dashboard preview.",
    feel: "Apple product page hero. 3D perspective, ambient glow, premium device frame.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Eyebrow label", example: "DASHBOARD" },
      { name: "headline", type: "string", required: true, description: "Headline above device", example: "Built for Every Screen" },
      { name: "screen_label", type: "string", required: false, description: "Label inside screen", example: "Dashboard Preview" },
      { name: "caption", type: "string", required: false, description: "Caption below device" },
    ],
    duration: [5, 7],
    file: "C8-device-mockup.scene.html",
  },
  {
    id: "C9-logo-wall",
    name: "Logo Wall",
    category: "content",
    when: "Social proof. Customer logos, partner logos, integration logos, \"trusted by\" section.",
    feel: "Credibility through association. Clean grid with glassmorphic cards.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label", example: "TRUSTED BY" },
      { name: "headline", type: "string", required: true, description: "Section headline", example: "Industry Leaders Choose Us" },
      { name: "logo_1", type: "string", required: true, description: "Company name 1", example: "Acme Corp" },
      { name: "logo_2", type: "string", required: true, description: "Company name 2", example: "TechStart" },
      { name: "logo_3", type: "string", required: true, description: "Company name 3", example: "DataFlow" },
      { name: "logo_4", type: "string", required: false, description: "Company name 4" },
      { name: "logo_5", type: "string", required: false, description: "Company name 5" },
      { name: "logo_6", type: "string", required: false, description: "Company name 6" },
    ],
    duration: [4, 6],
    file: "C9-logo-wall.scene.html",
  },
  {
    id: "C10-feature-stack",
    name: "Feature Stack",
    category: "content",
    when: "Listing 3-4 features or capabilities as a numbered vertical stack with descriptions.",
    feel: "Editorial, structured, like a premium product page. Left headline, right stack.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label" },
      { name: "headline", type: "string", required: true, description: "Section heading", example: "Everything You Need" },
      { name: "item_1_title", type: "string", required: true, description: "Feature 1 title" },
      { name: "item_1_desc", type: "string", required: false, description: "Feature 1 description" },
      { name: "item_2_title", type: "string", required: true, description: "Feature 2 title" },
      { name: "item_2_desc", type: "string", required: false, description: "Feature 2 description" },
      { name: "item_3_title", type: "string", required: true, description: "Feature 3 title" },
      { name: "item_3_desc", type: "string", required: false, description: "Feature 3 description" },
      { name: "item_4_title", type: "string", required: false, description: "Feature 4 title" },
      { name: "item_4_desc", type: "string", required: false, description: "Feature 4 description" },
    ],
    duration: [5, 7],
    file: "C10-feature-stack.scene.html",
  },
  {
    id: "C11-process-steps",
    name: "Process Steps",
    category: "content",
    when: "How it works. 3-step process, workflow, journey, or timeline visualization.",
    feel: "Connected dots on a horizontal track. Clean, directional, professional.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label", example: "HOW IT WORKS" },
      { name: "headline", type: "string", required: true, description: "Section heading", example: "Three Simple Steps" },
      { name: "step_1_title", type: "string", required: true, description: "Step 1 title", example: "Connect" },
      { name: "step_1_desc", type: "string", required: false, description: "Step 1 description" },
      { name: "step_2_title", type: "string", required: true, description: "Step 2 title", example: "Configure" },
      { name: "step_2_desc", type: "string", required: false, description: "Step 2 description" },
      { name: "step_3_title", type: "string", required: true, description: "Step 3 title", example: "Launch" },
      { name: "step_3_desc", type: "string", required: false, description: "Step 3 description" },
    ],
    duration: [5, 7],
    file: "C11-process-steps.scene.html",
  },

  // ── LOWER THIRDS ──
  {
    id: "L1-lower-third",
    name: "Lower Third",
    category: "content",
    when: "Name card / speaker identification / source attribution. Broadcast-style overlay in bottom third.",
    feel: "News broadcast quality. Glassmorphic bar with accent line and name/title.",
    slots: [
      { name: "main_text", type: "string", required: false, description: "Main text in upper area (quote or key point)", example: "AI will reshape demand marketing" },
      { name: "name", type: "string", required: true, description: "Person's name", example: "Sarah Chen" },
      { name: "title", type: "string", required: false, description: "Title and company", example: "VP Marketing, Acme Corp" },
      { name: "logo_text", type: "string", required: false, description: "Logo or brand text on right side" },
    ],
    duration: [4, 6],
    file: "L1-lower-third.scene.html",
  },

  // ── OPENINGS (additional) ──
  {
    id: "O2-chapter-title",
    name: "Chapter Title",
    category: "opening",
    when: "Section divider between topics. Chapter break, new topic introduction.",
    feel: "Minimal, dramatic. Accent line reveals, then title appears.",
    slots: [
      { name: "number", type: "string", required: false, description: "Chapter number", example: "CHAPTER 02" },
      { name: "title", type: "string", required: true, description: "Section title", example: "The Platform" },
      { name: "subtitle", type: "string", required: false, description: "Supporting line" },
    ],
    duration: [3, 5],
    file: "O2-chapter-title.scene.html",
  },
  {
    id: "O4-product-hero",
    name: "Product Hero",
    category: "opening",
    when: "Product reveal moment. Large floating device with UI preview and dramatic headline below.",
    feel: "Apple product page hero. 3D device, ambient glow, premium reveal.",
    slots: [
      { name: "badge", type: "string", required: false, description: "Badge text", example: "NEW" },
      { name: "headline", type: "string", required: true, description: "Product headline", example: "Meet Quotient" },
      { name: "subtitle", type: "string", required: false, description: "Supporting line" },
      { name: "product_name", type: "string", required: false, description: "Product name shown in device UI", example: "Quotient" },
    ],
    duration: [5, 7],
    file: "O4-product-hero.scene.html",
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

  // Content category includes lower-thirds, overlays, etc. so all non-opening/data/closing are content

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
