/**
 * Component schema pairing tests.
 *
 * A saved component must be paired with a `{type}.schema.json` so the planner
 * catalog can see it. These tests lock in the deriving + pairing behavior.
 */

import { describe, it, expect } from "vitest";
import { buildComponentSchema, deriveDataFields } from "../src/core/component-schema.js";

const SAMPLE = `<template>
  <div class="pricing">
    <h2 class="title" data-bind="title">Plans</h2>
    <p>{{headline}}</p>
    <span>{{pro_price}}</span>
  </div>
</template>
<script>
function createTimeline(el, data, gsap) {
  el.querySelector('.title').textContent = data.headline;
  var color = data.accent_color || '#fff';
  var n = data["count"];
  return gsap.timeline();
}
</script>`;

describe("deriveDataFields", () => {
  it("collects fields from mustache, data.x, data['x'], and data-bind", () => {
    const data = deriveDataFields(SAMPLE);
    const keys = Object.keys(data).sort();
    expect(keys).toContain("headline");
    expect(keys).toContain("pro_price");
    expect(keys).toContain("title"); // data-bind
    expect(keys).toContain("accent_color"); // data.x
    expect(keys).toContain("count"); // data["x"]
  });

  it("shapes each field like a catalog field", () => {
    const data = deriveDataFields(SAMPLE) as Record<string, any>;
    expect(data.headline).toMatchObject({ type: "string", optional: true });
    expect(data.pro_price.label).toBe("Pro Price");
  });
});

describe("buildComponentSchema", () => {
  it("produces a planner-visible schema with type/label/category/data", () => {
    const schema = buildComponentSchema("can-you-pricing", "custom", SAMPLE);
    expect(schema.type).toBe("can-you-pricing");
    expect(schema.label).toBe("Can You Pricing");
    expect(schema.category).toBe("custom");
    expect(Object.keys(schema.data).length).toBeGreaterThan(0);
  });

  it("prefers an embedded component-schema meta when present", () => {
    const withMeta =
      `<meta name="component-schema" content='{"value":{"type":"number"}}'>` + SAMPLE;
    const schema = buildComponentSchema("x", "custom", withMeta);
    expect(schema.data).toMatchObject({ value: { type: "number" } });
  });
});
