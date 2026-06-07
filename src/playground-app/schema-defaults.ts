/**
 * Generate realistic default/sample data from a component schema.
 * Handles both schema formats:
 *   Format A (custom): { data: { field: { type, default, placeholder, ... } } }
 *   Format B (JSON Schema): { properties: { field: { type, description, ... } }, required: [...] }
 */

interface SchemaField {
  type?: string;
  label?: string;
  default?: unknown;
  placeholder?: string;
  optional?: boolean;
  required?: boolean | string[];
  enum?: string[];
  items?: SchemaField;
  properties?: Record<string, SchemaField>;
  description?: string;
  data?: Record<string, SchemaField>;
}

export function generateDefaultsFromSchema(schema: SchemaField): Record<string, unknown> {
  // Format A: { data: { field: { type, ... } } }
  if (schema.data && typeof schema.data === "object" && !schema.data.type) {
    return generateFromFieldMap(schema.data as Record<string, SchemaField>);
  }

  // Format B: { properties: { field: { type, ... } } }
  if (schema.properties) {
    return generateFromFieldMap(schema.properties);
  }

  return {};
}

function generateFromFieldMap(fields: Record<string, SchemaField>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(fields)) {
    result[key] = generateFieldValue(key, field);
  }

  return result;
}

function generateFieldValue(key: string, field: SchemaField): unknown {
  // Use explicit default first
  if (field.default !== undefined) return field.default;

  // Use placeholder as fallback for strings
  if (field.placeholder !== undefined && field.type === "string" && key !== "suffix") return field.placeholder;

  // Use first enum value
  if (field.enum && field.enum.length > 0) return field.enum[0];

  const k = key.toLowerCase();

  switch (field.type) {
    case "string":
      return generateStringValue(k, field);

    case "number":
      return generateNumberValue(k);

    case "boolean":
      return generateBooleanValue(k);

    case "array":
      return generateArrayValue(k, field);

    case "object":
      if (field.properties) {
        return generateFromFieldMap(field.properties);
      }
      return {};

    default:
      // No type specified -- guess from key name
      return generateStringValue(k, field);
  }
}

function generateStringValue(key: string, field: SchemaField): string {
  // Skip placeholder for suffix to avoid combos like "$2,847%"
  if (field.placeholder && key !== "suffix") return field.placeholder;


  // Smart defaults by key name
  if (key === "headline" || key === "title" || key === "heading" || key === "name") return "Your Headline Here";
  if (key === "subtitle" || key === "subheading" || key === "sub_title") return "Supporting text goes here";
  if (key === "description" || key === "desc" || key === "body" || key === "text" || key === "content")
    return "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
  if (key === "label" || key === "tag" || key === "badge" || key === "eyebrow" || key === "category")
    return "Featured";
  if (key === "button" || key === "cta" || key === "button_text" || key === "cta_text") return "Get Started";
  if (key === "author" || key === "speaker" || key === "person" || key === "user" || key === "username")
    return "Jane Smith";
  if (key === "role" || key === "job_title" || key === "position") return "CEO & Founder";
  if (key === "company" || key === "org" || key === "organization") return "Acme Inc";
  if (key === "quote" || key === "testimonial")
    return "This product transformed our workflow completely.";
  if (key === "url" || key === "link" || key === "href") return "https://example.com";
  if (key === "page_title") return "Dashboard";
  if (key === "suffix") return "";
  if (key === "prefix") return "$";
  if (key === "email") return "hello@example.com";
  if (key === "phone") return "+1 (555) 123-4567";
  if (key === "time" || key === "timestamp") return "10:32 AM";
  if (key === "date") return "June 7, 2026";
  if (key === "avatar_color" || key.includes("color")) return "#6366f1";
  if (key === "channel") return "general";
  if (key === "platform") return "slack";
  if (key === "language" || key === "lang") return "javascript";
  if (key === "filename" || key === "file") return "index.ts";
  if (key === "subject") return "Quick Update";
  if (key === "from" || key === "sender") return "team@company.com";
  if (key === "to" || key === "recipient") return "you@example.com";
  if (key.includes("image") || key.includes("img") || key === "src" || key === "screenshot_url" || key === "logo")
    return "";
  if (key.includes("html") || key === "content_html")
    return '<div style="padding:40px;text-align:center;"><h1 style="color:#e2e8f0;margin:0 0 16px;">Welcome</h1><p style="color:#94a3b8;margin:0;">Your content here</p></div>';
  if (key.includes("code") || key === "snippet")
    return 'const greeting = "Hello, World!";\nconsole.log(greeting);';

  return "Sample Value";
}

function generateNumberValue(key: string): number {
  const k = key.toLowerCase();
  if (k === "value" || k === "stat") return 2847;
  if (k === "percentage" || k === "percent" || k === "progress") return 75;
  if (k === "price" || k === "amount" || k === "cost") return 49;
  if (k === "rating") return 4.9;
  if (k === "count" || k === "total") return 12;
  if (k === "max_value" || k === "max") return 100;
  if (k === "min_value" || k === "min") return 0;
  if (k === "duration") return 5;
  if (k === "delay" || k === "speed") return 1;
  if (k === "columns" || k === "rows") return 3;
  if (k === "opacity") return 1;
  if (k === "scale") return 1;
  if (k === "decimals") return 0;
  return 42;
}

function generateBooleanValue(key: string): boolean {
  const k = key.toLowerCase();
  if (k === "show" || k === "visible" || k === "enabled" || k === "active") return true;
  if (k === "dark" || k === "inverted" || k === "reversed") return false;
  return true;
}

function generateArrayValue(key: string, field: SchemaField): unknown[] {
  const k = key.toLowerCase();
  const itemSchema = field.items;

  // Generate 3 sample items by default
  const count = k === "messages" ? 3 : k === "steps" ? 4 : 3;

  if (!itemSchema) {
    // No item schema -- generate based on key name
    if (k === "items" || k === "list" || k === "features") {
      return ["Feature one", "Feature two", "Feature three"];
    }
    return ["Item 1", "Item 2", "Item 3"];
  }

  if (itemSchema.type === "object" && itemSchema.properties) {
    // Generate sample objects with variation
    return Array.from({ length: count }, (_, i) =>
      generateSampleObjectItem(k, itemSchema.properties!, i)
    );
  }

  if (itemSchema.type === "string") {
    return ["Item 1", "Item 2", "Item 3"];
  }

  if (itemSchema.type === "number") {
    return [65, 42, 78];
  }

  return ["Item 1", "Item 2", "Item 3"];
}

function generateSampleObjectItem(
  parentKey: string,
  properties: Record<string, SchemaField>,
  index: number
): Record<string, unknown> {
  const item: Record<string, unknown> = {};

  // Context-aware sample data based on parent array name
  const sampleData = getSampleDataForArray(parentKey, index);

  for (const [key, field] of Object.entries(properties)) {
    if (sampleData[key] !== undefined) {
      item[key] = sampleData[key];
    } else {
      item[key] = generateFieldValue(key, field);
    }
  }

  return item;
}

function getSampleDataForArray(
  arrayKey: string,
  index: number
): Record<string, unknown> {
  const k = arrayKey.toLowerCase();

  if (k === "messages") {
    const msgs = [
      { user: "Alex", text: "Hey team, check out the new dashboard!", avatar_color: "#6366f1", time: "10:30 AM" },
      { user: "Sarah", text: "Looks amazing! Love the chart animations.", avatar_color: "#ec4899", time: "10:32 AM" },
      {
        user: "Mike",
        text: "Ship it! 🚀 This is exactly what we needed.",
        avatar_color: "#10b981",
        time: "10:33 AM",
      },
    ];
    return msgs[index] || msgs[0];
  }

  if (k === "bars" || k === "data" || k === "chart_data") {
    const bars = [
      { label: "Mon", value: 65, color: "#6366f1" },
      { label: "Tue", value: 42, color: "#8b5cf6" },
      { label: "Wed", value: 78, color: "#a78bfa" },
      { label: "Thu", value: 55, color: "#c4b5fd" },
      { label: "Fri", value: 90, color: "#6366f1" },
    ];
    return bars[index] || bars[0];
  }

  if (k === "features" || k === "items" || k === "cards" || k === "list") {
    const features = [
      { title: "Lightning Fast", description: "Optimized for speed and performance", icon: "⚡" },
      { title: "Secure by Default", description: "Enterprise-grade security built in", icon: "🔒" },
      { title: "Scale Infinitely", description: "Grows with your business needs", icon: "📈" },
    ];
    return features[index] || features[0];
  }

  if (k === "steps" || k === "timeline") {
    const steps = [
      { title: "Discovery", description: "Understanding your needs and goals", number: "1" },
      { title: "Design", description: "Creating the perfect solution", number: "2" },
      { title: "Build", description: "Bringing the design to life", number: "3" },
      { title: "Launch", description: "Deploying to production", number: "4" },
    ];
    return steps[index] || steps[0];
  }

  if (k === "metrics" || k === "stats" || k === "kpis") {
    const metrics = [
      { label: "Revenue", value: 2847000, prefix: "$", suffix: "", change: "+12%" },
      { label: "Users", value: 48200, prefix: "", suffix: "", change: "+8%" },
      { label: "Conversion", value: 3.2, prefix: "", suffix: "%", change: "+0.5%" },
    ];
    return metrics[index] || metrics[0];
  }

  if (k === "notifications") {
    const notifications = [
      { title: "New message", body: "Sarah sent you a message", time: "2m ago", icon: "💬" },
      { title: "Deploy complete", body: "Production build succeeded", time: "15m ago", icon: "🚀" },
      { title: "Milestone reached", body: "10,000 active users!", time: "1h ago", icon: "🎉" },
    ];
    return notifications[index] || notifications[0];
  }

  if (k === "tasks" || k === "columns") {
    const tasks = [
      { title: "Design review", status: "In Progress", assignee: "Alex", priority: "High" },
      { title: "API integration", status: "Todo", assignee: "Sarah", priority: "Medium" },
      { title: "Launch prep", status: "Done", assignee: "Mike", priority: "High" },
    ];
    return tasks[index] || tasks[0];
  }

  if (k === "logos" || k === "integrations") {
    const logos = [
      { name: "Slack", url: "" },
      { name: "GitHub", url: "" },
      { name: "Notion", url: "" },
    ];
    return logos[index] || logos[0];
  }

  if (k === "prices" || k === "plans" || k === "tiers") {
    const plans = [
      { name: "Starter", price: "$9", period: "/mo", features: ["5 projects", "Basic analytics"] },
      { name: "Pro", price: "$29", period: "/mo", features: ["Unlimited projects", "Advanced analytics", "Priority support"] },
      { name: "Enterprise", price: "$99", period: "/mo", features: ["Everything in Pro", "Custom integrations", "Dedicated support"] },
    ];
    return plans[index] || plans[0];
  }

  return {};
}
