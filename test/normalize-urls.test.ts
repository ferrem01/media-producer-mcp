import { describe, it, expect } from "vitest";
import {
  normalizeAssetUrl,
  normalizeAllUrls,
  normalizeHtmlUrls,
} from "../src/core/normalize-urls.js";

describe("normalizeAssetUrl", () => {
  it("strips http://localhost:3200 prefix", () => {
    expect(normalizeAssetUrl("http://localhost:3200/assets/t/logo.png")).toBe(
      "/assets/t/logo.png",
    );
  });

  it("strips https://localhost:3200 prefix", () => {
    expect(normalizeAssetUrl("https://localhost:3200/assets/t/logo.png")).toBe(
      "/assets/t/logo.png",
    );
  });

  it("strips other ports", () => {
    expect(normalizeAssetUrl("http://localhost:8080/assets/t/logo.png")).toBe(
      "/assets/t/logo.png",
    );
  });

  it("strips localhost without port", () => {
    expect(normalizeAssetUrl("http://localhost/assets/t/logo.png")).toBe(
      "/assets/t/logo.png",
    );
  });

  it("leaves relative paths unchanged", () => {
    expect(normalizeAssetUrl("/assets/t/logo.png")).toBe("/assets/t/logo.png");
  });

  it("leaves external URLs unchanged", () => {
    expect(normalizeAssetUrl("https://cdn.example.com/img.png")).toBe(
      "https://cdn.example.com/img.png",
    );
  });

  it("handles empty string", () => {
    expect(normalizeAssetUrl("")).toBe("");
  });
});

describe("normalizeAllUrls", () => {
  it("normalizes nested object URLs", () => {
    const input = {
      name: "test",
      data: {
        src: "http://localhost:3200/assets/t/bg.png",
        label: "Background",
      },
      items: [
        { url: "http://localhost:3200/assets/t/logo.png" },
        { url: "/assets/t/icon.svg" },
      ],
    };

    const result = normalizeAllUrls(input);
    expect(result.data.src).toBe("/assets/t/bg.png");
    expect(result.items[0].url).toBe("/assets/t/logo.png");
    expect(result.items[1].url).toBe("/assets/t/icon.svg");
    expect(result.name).toBe("test");
  });

  it("does not mutate the input", () => {
    const input = { src: "http://localhost:3200/assets/t/bg.png" };
    const result = normalizeAllUrls(input);
    expect(input.src).toBe("http://localhost:3200/assets/t/bg.png");
    expect(result.src).toBe("/assets/t/bg.png");
  });
});

describe("normalizeHtmlUrls", () => {
  it("normalizes URLs in HTML attributes", () => {
    const html = '<img src="http://localhost:3200/assets/t/logo.png" />';
    expect(normalizeHtmlUrls(html)).toBe('<img src="/assets/t/logo.png" />');
  });

  it("normalizes URLs in CSS url() references", () => {
    const html =
      'background-image: url(http://localhost:3200/assets/t/bg.png);';
    expect(normalizeHtmlUrls(html)).toBe(
      "background-image: url(/assets/t/bg.png);",
    );
  });

  it("normalizes multiple occurrences", () => {
    const html =
      '<img src="http://localhost:3200/a.png"><img src="http://localhost:3200/b.png">';
    expect(normalizeHtmlUrls(html)).toBe(
      '<img src="/a.png"><img src="/b.png">',
    );
  });

  it("leaves external URLs unchanged", () => {
    const html = '<img src="https://cdn.example.com/logo.png" />';
    expect(normalizeHtmlUrls(html)).toBe(html);
  });
});
