/**
 * Full 30-component showcase video.
 * Renders every component type in the library.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderProject } from "../src/core/render.js";
import { config } from "../src/config.js";
import type { Project, Scene } from "../src/core/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../test-output/full-showcase");

config.componentLibDir = path.resolve(__dirname, "../src/components");
config.gsapDir = path.resolve(__dirname, "../vendor/gsap");

const BRAND = {
  colors: {
    primary: "#5B21B6",
    secondary: "#7C3AED",
    accent: "#A78BFA",
    background: "#0f172a",
    surface: "#1e293b",
    text: "#ffffff",
    text_muted: "#94a3b8",
  },
  fonts: [{ family: "Inter", source: "google" as const, weights: [400, 500, 600, 700, 800] }],
  style: { border_radius: "12px", motion: "cinematic" as const },
};

const transition = { type: "crossfade" as const, duration_seconds: 0.4 };

function scene(id: string, label: string, dur: number, components: any[], withTransition = true): Scene {
  return {
    id,
    label,
    duration_seconds: dur,
    transition_in: withTransition ? transition : undefined,
    components,
  };
}

// Helper: wrap content with a background + film polish
function withBg(bg: any[], content: any[], polish = true): any[] {
  const layers = [
    ...bg,
    ...content.map((c, i) => ({ ...c, z_index: c.z_index ?? (10 + i) })),
  ];
  if (polish) {
    layers.push({ id: `polish_${Math.random().toString(36).slice(2, 6)}`, type: "film-polish", data: { vignette: 0.1, grain: 0.03 }, z_index: 100 });
  }
  return layers;
}

const darkBg = [{ id: "bg", type: "gradient-background", data: { from: "#0f172a", to: "#1e293b", angle: 165 }, z_index: 0 }];
const purpleBg = [{ id: "bg", type: "mesh-gradient", data: { colors: ["#1a1a2e", "#16213e", "#0f3460"] }, z_index: 0 }];
const accentBg = [{ id: "bg", type: "mesh-gradient", data: { colors: ["#5B21B6", "#7C3AED", "#1e293b"] }, z_index: 0 }];

const scenes: Scene[] = [
  // ── TITLES & TEXT ──

  // 1. Title Slide
  scene("s01", "Title Slide", 3, withBg(darkBg, [
    { id: "c1", type: "title-slide", data: { badge: "MEDIA PRODUCER MCP", title: "Component Showcase", subtitle: "All 30 components in action" } },
  ]), false),

  // 2. Section Header
  scene("s02", "Section Header", 3, withBg(darkBg, [
    { id: "c2", type: "section-header", data: { eyebrow: "TITLES & TEXT", title: "Section Headers", description: "Left-aligned headers with eyebrow text and descriptions. Great for introducing new sections." } },
  ])),

  // 3. Kinetic Text
  scene("s03", "Kinetic Text", 3, withBg(purpleBg, [
    { id: "c3", type: "kinetic-text", data: { text: "Words that move and breathe with energy", mode: "word", effect: "fade-up" } },
  ])),

  // 4. Typewriter
  scene("s04", "Typewriter", 4, withBg(darkBg, [
    { id: "c4", type: "typewriter", data: { text: "npx media-producer create --format video --name \"My First Video\"", speed: 25 } },
  ])),

  // 5. Stat Card
  scene("s05", "Stat Card", 3, withBg(purpleBg, [
    { id: "c5", type: "stat-card", data: { value: 30, suffix: "+", label: "Built-in Components", decimals: 0 } },
  ])),

  // 6. Quote Block
  scene("s06", "Quote Block", 3, withBg(darkBg, [
    { id: "c6", type: "quote-block", data: { quote: "The best way to predict the future is to build it.", author: "Alan Kay", role: "Computer Scientist" } },
  ])),

  // 7. Code Block
  scene("s07", "Code Block", 4, withBg(darkBg, [
    { id: "c7", type: "code-block", data: { code: "import { render } from 'media-producer';\n\nconst video = await render({\n  scenes: project.scenes,\n  format: 'mp4',\n  fps: 30\n});\n\nconsole.log('Done:', video.path);", language: "typescript", highlight_lines: [3, 4, 5] } },
  ])),

  // 8. Text List
  scene("s08", "Text List", 4, withBg(darkBg, [
    { id: "c8", type: "text-list", data: { title: "Key Features", items: ["HTML + GSAP animation engine", "30+ built-in components", "Multi-format output (MP4, PNG, PDF, GIF)", "Brand kit with CSS variables", "AI-native component generation"], style: "check" } },
  ])),

  // ── LAYOUTS & CONTAINERS ──

  // 9. Split Screen
  scene("s09", "Split Screen", 4, withBg([], [
    { id: "c9", type: "split-screen", data: { left_content: "Design", right_content: "Code", split: 0.5, left_bg: "#5B21B6", right_bg: "#1e293b" }, z_index: 0 },
  ], false)),

  // 10. Bento Grid
  scene("s10", "Bento Grid", 4, withBg(darkBg, [
    { id: "c10", type: "bento-grid", data: { cards: [
      { title: "Video", description: "MP4 output", size: "large", color: "#5B21B6" },
      { title: "Image", description: "PNG/JPG", size: "small", color: "#7C3AED" },
      { title: "PDF", description: "Slide decks", size: "small", color: "#A78BFA" },
      { title: "GIF", description: "Animated", size: "medium", color: "#6D28D9" },
      { title: "Social", description: "Batch sizes", size: "small", color: "#8B5CF6" },
      { title: "Email", description: "Headers", size: "small", color: "#4C1D95" },
    ] } },
  ])),

  // 11. Grid Layout
  scene("s11", "Grid Layout", 4, withBg(darkBg, [
    { id: "c11", type: "grid-layout", data: { columns: 3, items: [
      { title: "Fast", description: "GSAP-powered animations", icon: "⚡" },
      { title: "Flexible", description: "Any web technology", icon: "🔧" },
      { title: "Beautiful", description: "Apple-quality output", icon: "✨" },
      { title: "AI-Native", description: "LLM generates components", icon: "🤖" },
      { title: "Multi-Format", description: "Video, image, PDF, GIF", icon: "📦" },
      { title: "Branded", description: "CSS variable theming", icon: "🎨" },
    ] } },
  ])),

  // 12. Browser Frame
  scene("s12", "Browser Frame", 4, withBg(darkBg, [
    { id: "c12", type: "browser-frame", data: { url: "https://media-producer.dev", title: "Media Producer", content_html: "<div style='padding:40px;text-align:center;font-family:Inter,sans-serif;color:#fff;'><h1 style='font-size:48px;margin-bottom:16px;'>Dashboard</h1><p style='font-size:20px;color:#94a3b8;'>Your media production pipeline</p><div style='display:flex;gap:20px;justify-content:center;margin-top:32px;'><div style='background:#5B21B6;padding:20px 32px;border-radius:12px;'>3 Projects</div><div style='background:#7C3AED;padding:20px 32px;border-radius:12px;'>12 Renders</div><div style='background:#4C1D95;padding:20px 32px;border-radius:12px;'>30 Components</div></div></div>" } },
  ])),

  // 13. Device Mockup
  scene("s13", "Device Mockup", 4, withBg(purpleBg, [
    { id: "c13", type: "device-mockup", data: { device: "phone", content_html: "<div style='background:#0f172a;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Inter,sans-serif;color:#fff;padding:20px;'><div style='font-size:32px;font-weight:800;'>Quotient</div><div style='font-size:14px;color:#94a3b8;margin-top:8px;'>AI-powered marketing</div><div style='background:#5B21B6;color:#fff;padding:12px 24px;border-radius:8px;margin-top:24px;font-size:14px;'>Get Started</div></div>" } },
  ])),

  // 14. Terminal
  scene("s14", "Terminal", 5, withBg(darkBg, [
    { id: "c14", type: "terminal", data: { title: "media-producer", lines: [
      { prompt: "$", command: "npx media-producer create my-video", output: "✓ Project created: proj_a1b2c3d4" },
      { prompt: "$", command: "npx media-producer add-scene --type title", output: "✓ Scene added: scene_001" },
      { prompt: "$", command: "npx media-producer render", output: "Rendering... 510 frames captured\n✓ Output: my-video/output.mp4" },
    ] } },
  ])),

  // 15. Picture in Picture
  scene("s15", "Picture in Picture", 4, withBg(darkBg, [
    { id: "c15", type: "picture-in-picture", data: { main_content: "<div style='display:flex;align-items:center;justify-content:center;height:100%;font-family:Inter,sans-serif;color:#fff;font-size:48px;font-weight:800;'>Main Content Area</div>", pip_content: "<div style='display:flex;align-items:center;justify-content:center;height:100%;font-family:Inter,sans-serif;color:#fff;font-size:16px;background:#5B21B6;'>Speaker PiP</div>", pip_position: "bottom-right", pip_size: 25 } },
  ])),

  // ── MEDIA ──

  // 16. Image Showcase
  scene("s16", "Image Showcase", 4, withBg(darkBg, [
    { id: "c16", type: "image-showcase", data: { alt: "Product Screenshot", effect: "zoom-in", caption: "Zoom-in reveal effect" } },
  ])),

  // 17. Logo Intro
  scene("s17", "Logo Intro", 3, withBg(purpleBg, [
    { id: "c17", type: "logo-intro", data: { text: "Quotient", tagline: "AI-Powered Demand Marketing" } },
  ])),

  // 18. Screenshot Zoom
  scene("s18", "Screenshot Zoom", 4, withBg(darkBg, [
    { id: "c18", type: "screenshot-zoom", data: { alt: "Dashboard View", zoom_x: 70, zoom_y: 40, zoom_scale: 2.5, label: "Key Metric" } },
  ])),

  // 19. Logo Outro
  scene("s19", "Logo Outro", 3, withBg(accentBg, [
    { id: "c19", type: "logo-outro", data: { text: "Media Producer", tagline: "Built with HTML + GSAP", cta: "github.com/ferrem01/media-producer-mcp" } },
  ])),

  // ── DATA VISUALIZATION ──

  // 20. Bar Chart
  scene("s20", "Bar Chart", 4, withBg(darkBg, [
    { id: "c20", type: "bar-chart", data: { title: "Monthly Growth", bars: [
      { label: "Jan", value: 45, color: "#5B21B6" },
      { label: "Feb", value: 62, color: "#6D28D9" },
      { label: "Mar", value: 78, color: "#7C3AED" },
      { label: "Apr", value: 95, color: "#8B5CF6" },
      { label: "May", value: 120, color: "#A78BFA" },
    ] } },
  ])),

  // 21. Line Chart
  scene("s21", "Line Chart", 4, withBg(darkBg, [
    { id: "c21", type: "line-chart", data: { title: "Revenue Trend", color: "#A78BFA", points: [
      { x: 0, y: 20 }, { x: 1, y: 35 }, { x: 2, y: 30 }, { x: 3, y: 55 },
      { x: 4, y: 48 }, { x: 5, y: 72 }, { x: 6, y: 85 }, { x: 7, y: 90 },
    ] } },
  ])),

  // 22. Progress Bar
  scene("s22", "Progress Bar", 3, withBg(purpleBg, [
    { id: "c22", type: "progress-bar", data: { value: 87, label: "Project Completion", color: "#A78BFA" } },
  ])),

  // 23. Metric Dashboard
  scene("s23", "Metric Dashboard", 4, withBg(darkBg, [
    { id: "c23", type: "metric-dashboard", data: { columns: 3, metrics: [
      { value: 2400, label: "Active Users", suffix: "", change: 12 },
      { value: 98, label: "Uptime", suffix: "%", change: 0.5 },
      { value: 150, label: "Renders Today", prefix: "", change: 23 },
      { value: 4.8, label: "Avg Rating", suffix: "/5", change: 0.2 },
      { value: 30, label: "Components", suffix: "+", change: 7 },
      { value: 500, label: "API Calls", suffix: "K", change: -3 },
    ] } },
  ])),

  // ── EFFECTS ──

  // 24. Mesh Gradient
  scene("s24", "Mesh Gradient", 3, [
    { id: "c24", type: "mesh-gradient", data: { colors: ["#5B21B6", "#7C3AED", "#EC4899", "#0EA5E9"] }, z_index: 0 },
    { id: "c24t", type: "title-slide", data: { title: "Mesh Gradient", subtitle: "Organic animated backgrounds" }, z_index: 10 },
  ]),

  // 25. Spotlight
  scene("s25", "Spotlight", 3, [
    { id: "c25bg", type: "gradient-background", data: { from: "#0f172a", to: "#1e293b" }, z_index: 0 },
    { id: "c25", type: "spotlight", data: { x: 50, y: 50, radius: 200, color: "#A78BFA" }, z_index: 5 },
    { id: "c25t", type: "title-slide", data: { title: "Spotlight Effect", subtitle: "Draw attention to key areas" }, z_index: 10 },
  ]),

  // ── CALL TO ACTION ──

  // 26. CTA Card
  scene("s26", "CTA Card", 3, withBg(accentBg, [
    { id: "c26", type: "cta-card", data: { headline: "Ready to Build?", description: "Create stunning videos, images, and decks with code.", button_text: "Start Free" } },
  ])),

  // 27. Social Proof
  scene("s27", "Social Proof", 4, withBg(darkBg, [
    { id: "c27", type: "social-proof", data: { title: "Trusted By", layout: "row", items: [
      { text: "Quotient", subtext: "AI Marketing" },
      { text: "Acme Corp", subtext: "Enterprise" },
      { text: "StartupX", subtext: "Series A" },
      { text: "DevTools", subtext: "Developer" },
    ] } },
  ])),

  // 28. Pricing Card
  scene("s28", "Pricing Card", 4, withBg(purpleBg, [
    { id: "c28", type: "pricing-card", data: { name: "Pro", price: "$49", period: "/month", highlighted: true, cta: "Get Started", features: ["Unlimited renders", "30+ components", "Custom brand kit", "API access", "Priority support"] } },
  ])),

  // ── FINALE ──

  // 29. Browser Frame with dashboard
  scene("s29", "Full Dashboard", 4, withBg(darkBg, [
    { id: "c29", type: "browser-frame", data: { url: "https://app.quotient.ai/dashboard", title: "Quotient Dashboard", content_html: "<div style='padding:32px;font-family:Inter,sans-serif;color:#fff;background:#0f172a;height:100%;'><div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;'><h1 style='font-size:28px;margin:0;'>Campaigns</h1><div style='background:#5B21B6;padding:10px 20px;border-radius:8px;font-size:14px;'>+ New Campaign</div></div><div style='display:grid;grid-template-columns:repeat(3,1fr);gap:16px;'><div style='background:#1e293b;padding:24px;border-radius:12px;'><div style='color:#94a3b8;font-size:13px;'>Active</div><div style='font-size:36px;font-weight:800;margin-top:4px;'>12</div></div><div style='background:#1e293b;padding:24px;border-radius:12px;'><div style='color:#94a3b8;font-size:13px;'>Leads</div><div style='font-size:36px;font-weight:800;margin-top:4px;'>2.4K</div></div><div style='background:#1e293b;padding:24px;border-radius:12px;'><div style='color:#94a3b8;font-size:13px;'>ROI</div><div style='font-size:36px;font-weight:800;margin-top:4px;color:#A78BFA;'>340%</div></div></div></div>" } },
  ])),

  // 30. Final outro
  scene("s30", "Outro", 3, withBg(accentBg, [
    { id: "c30", type: "logo-outro", data: { text: "Media Producer MCP", tagline: "30 Components. Infinite Possibilities.", cta: "github.com/ferrem01/media-producer-mcp" } },
  ])),
];

async function main() {
  console.log("=== Full 30-Component Showcase ===\n");
  console.log(`Scenes: ${scenes.length}`);

  await fs.rm(OUTPUT_DIR, { recursive: true, force: true });

  // Fix: each scene needs unique component IDs
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    for (let j = 0; j < s.components.length; j++) {
      s.components[j].id = `s${i}_c${j}`;
    }
  }

  const project: Project = {
    project_id: "proj_showcase_full",
    tenant_id: "showcase",
    name: "Full Component Showcase",
    format: "video",
    status: "draft",
    canvas: { width: 1920, height: 1080, preset: "landscape", fps: 30, background: "#0f172a" },
    brand_kit: BRAND,
    scenes,
  };

  const outputPath = path.join(OUTPUT_DIR, "showcase-full.mp4");

  const result = await renderProject({
    project,
    workDir: path.join(OUTPUT_DIR, "work"),
    componentLibDir: config.componentLibDir,
    gsapDir: config.gsapDir,
    outputPath,
  });

  console.log(`\n✓ Showcase complete!`);
  console.log(`  Output: ${result.outputPath}`);
  console.log(`  Frames: ${result.frameCount}`);
  console.log(`  Time: ${(result.durationMs / 1000).toFixed(1)}s`);

  const stat = await fs.stat(outputPath);
  console.log(`  Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
