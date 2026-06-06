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
  category: "opening" | "content" | "data" | "closing" | "speaker";
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
  /** Speaker template metadata -- sets scene flags when selected */
  speaker?: {
    mode: "full-behind" | "pip";
    content_side?: "left" | "right";
    content_width?: string;
  };
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
  {
    id: "E2-recap-grid",
    name: "Recap Grid",
    category: "closing",
    when: "Summary of key points before CTA. Recap, highlights, takeaways.",
    feel: "Numbered glassmorphic cards in a 2x2 grid. Clean summary.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label", example: "RECAP" },
      { name: "headline", type: "string", required: true, description: "Heading", example: "Key Takeaways" },
      { name: "point_1", type: "string", required: true, description: "Takeaway 1" },
      { name: "point_2", type: "string", required: true, description: "Takeaway 2" },
      { name: "point_3", type: "string", required: false, description: "Takeaway 3" },
      { name: "point_4", type: "string", required: false, description: "Takeaway 4" },
    ],
    duration: [5, 7],
    file: "E2-recap-grid.scene.html",
  },

  // ── CONTENT (wave 3) ──
  {
    id: "C12-icon-list",
    name: "Icon List",
    category: "content",
    when: "Checklist of benefits, capabilities, or selling points with icons.",
    feel: "Left headline, right vertical list with icon badges. Clean and scannable.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label" },
      { name: "headline", type: "string", required: true, description: "Heading", example: "Key Benefits" },
      { name: "icon_1_svg", type: "svg", required: false, description: "Icon SVG for item 1" },
      { name: "item_1_label", type: "string", required: true, description: "Item 1 label" },
      { name: "item_1_desc", type: "string", required: false, description: "Item 1 description" },
      { name: "icon_2_svg", type: "svg", required: false, description: "Icon SVG for item 2" },
      { name: "item_2_label", type: "string", required: true, description: "Item 2 label" },
      { name: "item_2_desc", type: "string", required: false, description: "Item 2 description" },
      { name: "icon_3_svg", type: "svg", required: false, description: "Icon SVG for item 3" },
      { name: "item_3_label", type: "string", required: true, description: "Item 3 label" },
      { name: "item_3_desc", type: "string", required: false, description: "Item 3 description" },
      { name: "icon_4_svg", type: "svg", required: false, description: "Icon SVG for item 4" },
      { name: "item_4_label", type: "string", required: false, description: "Item 4 label" },
      { name: "item_4_desc", type: "string", required: false, description: "Item 4 description" },
      { name: "icon_5_svg", type: "svg", required: false, description: "Icon SVG for item 5" },
      { name: "item_5_label", type: "string", required: false, description: "Item 5 label" },
      { name: "item_5_desc", type: "string", required: false, description: "Item 5 description" },
    ],
    duration: [5, 7],
    file: "C12-icon-list.scene.html",
  },
  {
    id: "C13-phone-mockup",
    name: "Phone Mockup",
    category: "content",
    when: "Mobile product showcase. App demo, mobile-first feature, responsive design.",
    feel: "Left text + right 3D phone with UI skeleton. Premium Apple-style.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Eyebrow label", example: "MOBILE APP" },
      { name: "headline", type: "string", required: true, description: "Feature headline", example: "Works on Mobile" },
      { name: "body", type: "string", required: false, description: "Description text" },
      { name: "app_name", type: "string", required: false, description: "App name shown in screen header" },
    ],
    duration: [5, 7],
    file: "C13-phone-mockup.scene.html",
  },
  {
    id: "C14-team-grid",
    name: "Team Grid",
    category: "content",
    when: "Team introduction, leadership team, advisory board, founders.",
    feel: "Avatar circles with initials, names, and roles. Professional.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label", example: "OUR TEAM" },
      { name: "headline", type: "string", required: true, description: "Heading", example: "Meet the Team" },
      { name: "member_1_initials", type: "string", required: true, description: "Initials", example: "MF" },
      { name: "member_1_name", type: "string", required: true, description: "Full name" },
      { name: "member_1_role", type: "string", required: false, description: "Title" },
      { name: "member_2_initials", type: "string", required: true, description: "Initials" },
      { name: "member_2_name", type: "string", required: true, description: "Full name" },
      { name: "member_2_role", type: "string", required: false, description: "Title" },
      { name: "member_3_initials", type: "string", required: false, description: "Initials" },
      { name: "member_3_name", type: "string", required: false, description: "Full name" },
      { name: "member_3_role", type: "string", required: false, description: "Title" },
      { name: "member_4_initials", type: "string", required: false, description: "Initials" },
      { name: "member_4_name", type: "string", required: false, description: "Full name" },
      { name: "member_4_role", type: "string", required: false, description: "Title" },
    ],
    duration: [4, 6],
    file: "C14-team-grid.scene.html",
  },
  {
    id: "C15-pricing-tiers",
    name: "Pricing Tiers",
    category: "content",
    when: "Pricing page, plan comparison, tier overview.",
    feel: "Three-column glassmorphic cards. Middle tier featured with badge and glow.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label" },
      { name: "headline", type: "string", required: true, description: "Heading", example: "Simple Pricing" },
      { name: "tier_1_name", type: "string", required: true, description: "Tier 1 name", example: "Starter" },
      { name: "tier_1_price", type: "string", required: true, description: "Tier 1 price", example: "$29" },
      { name: "tier_1_period", type: "string", required: false, description: "Billing period", example: "/month" },
      { name: "tier_1_feat_1", type: "string", required: false, description: "Feature line 1" },
      { name: "tier_1_feat_2", type: "string", required: false, description: "Feature line 2" },
      { name: "tier_1_feat_3", type: "string", required: false, description: "Feature line 3" },
      { name: "tier_2_badge", type: "string", required: false, description: "Featured badge", example: "MOST POPULAR" },
      { name: "tier_2_name", type: "string", required: true, description: "Tier 2 name" },
      { name: "tier_2_price", type: "string", required: true, description: "Tier 2 price" },
      { name: "tier_2_period", type: "string", required: false, description: "Billing period" },
      { name: "tier_2_feat_1", type: "string", required: false, description: "Feature line 1" },
      { name: "tier_2_feat_2", type: "string", required: false, description: "Feature line 2" },
      { name: "tier_2_feat_3", type: "string", required: false, description: "Feature line 3" },
      { name: "tier_3_name", type: "string", required: true, description: "Tier 3 name" },
      { name: "tier_3_price", type: "string", required: true, description: "Tier 3 price" },
      { name: "tier_3_period", type: "string", required: false, description: "Billing period" },
      { name: "tier_3_feat_1", type: "string", required: false, description: "Feature line 1" },
      { name: "tier_3_feat_2", type: "string", required: false, description: "Feature line 2" },
      { name: "tier_3_feat_3", type: "string", required: false, description: "Feature line 3" },
    ],
    duration: [5, 7],
    file: "C15-pricing-tiers.scene.html",
  },

  // ── DATA (wave 3) ──
  {
    id: "D3-before-after-stat",
    name: "Before/After Stat",
    category: "data",
    when: "Impact comparison. Before vs after metric with dramatic arrow transition.",
    feel: "Two cards side by side with an arrow between them. After card glows.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label" },
      { name: "headline", type: "string", required: true, description: "Heading", example: "The Impact" },
      { name: "before_value", type: "string", required: true, description: "Before metric", example: "12%" },
      { name: "before_desc", type: "string", required: false, description: "Before label", example: "Conversion Rate" },
      { name: "after_value", type: "string", required: true, description: "After metric", example: "47%" },
      { name: "after_desc", type: "string", required: false, description: "After label", example: "Conversion Rate" },
      { name: "caption", type: "string", required: false, description: "Caption below comparison" },
    ],
    duration: [5, 7],
    file: "D3-before-after-stat.scene.html",
  },
  {
    id: "D4-progress-bars",
    name: "Progress Bars",
    category: "data",
    when: "Multiple metrics as animated horizontal bars. Performance, scores, completion rates.",
    feel: "Left headline, right animated filling bars with gradient. Data dashboard feel.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Section label" },
      { name: "headline", type: "string", required: true, description: "Heading", example: "Performance" },
      { name: "bar_1_label", type: "string", required: true, description: "Bar 1 label" },
      { name: "bar_1_value", type: "string", required: true, description: "Bar 1 display value", example: "85%" },
      { name: "bar_1_pct", type: "string", required: false, description: "Bar 1 CSS width", example: "85%" },
      { name: "bar_2_label", type: "string", required: true, description: "Bar 2 label" },
      { name: "bar_2_value", type: "string", required: true, description: "Bar 2 display value" },
      { name: "bar_2_pct", type: "string", required: false, description: "Bar 2 CSS width" },
      { name: "bar_3_label", type: "string", required: true, description: "Bar 3 label" },
      { name: "bar_3_value", type: "string", required: true, description: "Bar 3 display value" },
      { name: "bar_3_pct", type: "string", required: false, description: "Bar 3 CSS width" },
      { name: "bar_4_label", type: "string", required: false, description: "Bar 4 label" },
      { name: "bar_4_value", type: "string", required: false, description: "Bar 4 display value" },
      { name: "bar_4_pct", type: "string", required: false, description: "Bar 4 CSS width" },
    ],
    duration: [5, 7],
    file: "D4-progress-bars.scene.html",
  },

  // ── OPENINGS (wave 3) ──
  {
    id: "O5-logo-intro",
    name: "Logo Intro",
    category: "opening",
    when: "Brand intro / company opener. Logo reveal with company name and tagline.",
    feel: "Centered logo mark with glow, company name deblurs below. Corner accents.",
    slots: [
      { name: "logo", type: "string", required: true, description: "Logo letter or short text", example: "Q" },
      { name: "company_name", type: "string", required: true, description: "Company name", example: "Quotient" },
      { name: "tagline", type: "string", required: false, description: "Company tagline" },
    ],
    duration: [3, 5],
    file: "O5-logo-intro.scene.html",
  },


  // ── SPEAKER ──
  {
    id: "S1-speaker-spotlight",
    name: "Speaker Spotlight",
    category: "speaker",
    when: "Speaker on camera with key points, stats, or talking points displayed beside them. Requires speaker_source in project assets.",
    feel: "Keynote presentation. Speaker commands attention, content panel reinforces the message.",
    slots: [
      { name: "eyebrow", type: "string", required: false, description: "Category or section label", example: "KEY INSIGHT" },
      { name: "headline", type: "string", required: true, description: "Main point, 3-8 words", example: "10x Faster Pipeline" },
      { name: "body", type: "string", required: false, description: "1-2 sentence supporting detail" },
      { name: "stat_value", type: "string", required: false, description: "Optional big stat number", example: "10x" },
      { name: "stat_label", type: "string", required: false, description: "Stat description", example: "faster" },
    ],
    duration: [5, 8],
    file: "S1-speaker-spotlight.scene.html",
    speaker: { mode: "full-behind", content_side: "right", content_width: "42%" },
  },
  {
    id: "S2-screencast-pip",
    name: "Screencast with Speaker",
    category: "speaker",
    when: "Product demo, walkthrough, or feature showcase. Browser/app frame fills the scene, speaker appears as small PiP circle.",
    feel: "Product tour. Clean browser mockup with subtle speaker presence.",
    slots: [
      { name: "url", type: "string", required: false, description: "URL shown in browser bar", example: "app.quotient.ai/dashboard" },
      { name: "page_title", type: "string", required: false, description: "Page title in browser tab" },
      { name: "headline", type: "string", required: true, description: "Feature or section name", example: "Real-Time Analytics" },
      { name: "body", type: "string", required: false, description: "1-2 sentence feature description" },
      { name: "pip_source", type: "string", required: false, description: "Set to \"speaker\" when speaker_track is active; pipeline resolves to actual video path automatically" },
    ],
    duration: [5, 8],
    file: "S2-screencast-pip.scene.html",
    speaker: { mode: "pip" },
  },
  {
    id: "S3-speaker-lowerthird",
    name: "Speaker with Lower Third",
    category: "speaker",
    when: "Speaker identification, quote attribution, or key message with name card. Interview or presentation style.",
    feel: "Broadcast quality. Speaker dominates, clean name bar at bottom.",
    slots: [
      { name: "main_text", type: "string", required: false, description: "Quote or key message shown above speaker", example: "AI will reshape demand marketing" },
      { name: "name", type: "string", required: true, description: "Speaker name", example: "Marc Ferrentino" },
      { name: "title", type: "string", required: false, description: "Title and company", example: "CEO, Quotient" },
      { name: "logo_text", type: "string", required: false, description: "Company or logo text" },
    ],
    duration: [4, 7],
    file: "S3-speaker-lowerthird.scene.html",
    speaker: { mode: "full-behind" },
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
    ["speaker", "SPEAKER"],
  ];

  // Speaker templates require a speaker video asset in the project (speaker_source).
  // When selected, they automatically set transparent_background and content_region on the scene.
  // The overlay (speaker-video with full-behind or pip segments) is set at the project level.

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
