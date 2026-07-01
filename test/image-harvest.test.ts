/**
 * Unit tests for the site image-harvesting helpers (pure functions only --
 * no Playwright / network). Covers URL filtering, crawl-link selection, and
 * candidate ranking used by extract_brand_from_website's include_images path.
 */

import { describe, it, expect } from "vitest";
import {
  isHarvestableImageUrl,
  pickCrawlLinks,
  rankImageCandidates,
  canonicalImageKey,
  parseSitemapLocs,
  type RawImageCandidate,
} from "../src/tools/brand-extractor.js";

describe("isHarvestableImageUrl", () => {
  it("accepts raster images over http(s)", () => {
    expect(isHarvestableImageUrl("https://x.com/hero.png")).toBe(true);
    expect(isHarvestableImageUrl("https://x.com/shot.jpg")).toBe(true);
    expect(isHarvestableImageUrl("https://x.com/a.webp")).toBe(true);
    expect(isHarvestableImageUrl("https://cdn.x.com/img/abc123")).toBe(true); // no extension (CDN)
  });

  it("rejects data URIs, svg, gif/ico, and non-http", () => {
    expect(isHarvestableImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isHarvestableImageUrl("https://x.com/logo.svg")).toBe(false);
    expect(isHarvestableImageUrl("https://x.com/anim.gif")).toBe(false);
    expect(isHarvestableImageUrl("https://x.com/fav.ico")).toBe(false);
    expect(isHarvestableImageUrl("/relative/path.png")).toBe(false);
    expect(isHarvestableImageUrl("")).toBe(false);
  });

  it("rejects sprite/favicon/tracking-pixel patterns and non-image extensions", () => {
    expect(isHarvestableImageUrl("https://x.com/sprite.png")).toBe(false);
    expect(isHarvestableImageUrl("https://x.com/tracking.png")).toBe(false);
    expect(isHarvestableImageUrl("https://x.com/1x1.png")).toBe(false);
    expect(isHarvestableImageUrl("https://x.com/style.css")).toBe(false);
  });
});

describe("pickCrawlLinks", () => {
  const origin = "https://acme.com";

  it("keeps same-origin content pages and drops the home page + externals", () => {
    const links = [
      "https://acme.com/",
      "https://acme.com/about",
      "https://other.com/product",
      "https://acme.com/pricing",
    ];
    const out = pickCrawlLinks(links, origin, 10);
    expect(out).toContain("https://acme.com/about");
    expect(out).toContain("https://acme.com/pricing");
    expect(out).not.toContain("https://acme.com/"); // home skipped
    expect(out.some((u) => u.includes("other.com"))).toBe(false); // external skipped
  });

  it("prioritizes product/feature pages ahead of generic ones", () => {
    const links = [
      "https://acme.com/team",
      "https://acme.com/products/widget",
      "https://acme.com/features",
    ];
    const out = pickCrawlLinks(links, origin, 10);
    expect(out.indexOf("https://acme.com/products/widget")).toBeLessThan(out.indexOf("https://acme.com/team"));
    expect(out.indexOf("https://acme.com/features")).toBeLessThan(out.indexOf("https://acme.com/team"));
  });

  it("ranks product/feature pages above integrations so they aren't crowded out", () => {
    const links = [
      "https://acme.com/integrations/salesforce",
      "https://acme.com/integrations/hubspot",
      "https://acme.com/integrations/shopify",
      "https://acme.com/features/flows",
    ];
    const out = pickCrawlLinks(links, origin, 2);
    expect(out[0]).toBe("https://acme.com/features/flows"); // tier-1 wins the cap
    expect(out).not.toContain("https://acme.com/integrations/shopify");
  });

  it("drops legal/auth/utility pages and dedupes + caps", () => {
    const links = [
      "https://acme.com/privacy",
      "https://acme.com/login",
      "https://acme.com/terms",
      "https://acme.com/product#top",  // same path as below after hash strip
      "https://acme.com/product",
      "https://acme.com/solutions",
    ];
    const out = pickCrawlLinks(links, origin, 2);
    expect(out).not.toContain("https://acme.com/privacy");
    expect(out).not.toContain("https://acme.com/login");
    expect(out.length).toBe(2); // capped
    // /product appears once despite hash duplicate
    expect(out.filter((u) => u.replace(/#.*/, "").endsWith("/product")).length).toBeLessThanOrEqual(1);
  });
});

describe("rankImageCandidates", () => {
  const mk = (url: string, area: number): RawImageCandidate => ({
    url, page: "https://acme.com", alt: "", width: Math.round(Math.sqrt(area)), height: Math.round(Math.sqrt(area)), kind: "img", area,
  });

  it("sorts largest-first and caps to maxImages", () => {
    const out = rankImageCandidates([mk("https://a/x.png", 100), mk("https://a/y.png", 900), mk("https://a/z.png", 400)], 2);
    expect(out.map((c) => c.url)).toEqual(["https://a/y.png", "https://a/z.png"]);
    expect(out.length).toBe(2);
  });

  it("dedupes by URL keeping the largest occurrence and filters junk", () => {
    const out = rankImageCandidates([
      mk("https://a/dup.png", 100),
      mk("https://a/dup.png", 500),
      mk("https://a/logo.svg", 999),   // filtered by isHarvestableImageUrl
    ], 10);
    expect(out.length).toBe(1);
    expect(out[0].url).toBe("https://a/dup.png");
    expect(out[0].area).toBe(500);
  });

  it("collapses www/apex + Next.js-optimizer variants of the same image", () => {
    const out = rankImageCandidates([
      mk("https://www.acme.com/homepage/marc.jpeg", 100),
      mk("https://acme.com/homepage/marc.jpeg", 400),
      mk("https://acme.com/_next/image?url=%2Fhomepage%2Fmarc.jpeg&w=1920&q=75", 900),
    ], 10);
    expect(out.length).toBe(1);       // all three are the same underlying asset
    expect(out[0].area).toBe(900);    // keeps the largest
  });
});

describe("canonicalImageKey", () => {
  it("strips www and query, lowercases host+path", () => {
    expect(canonicalImageKey("https://www.Acme.com/Foo/Bar.png?w=100")).toBe("acme.com/foo/bar.png");
    expect(canonicalImageKey("https://acme.com/foo/bar.png")).toBe("acme.com/foo/bar.png");
  });

  it("unwraps Next.js image-optimizer URLs (relative and absolute inner url)", () => {
    expect(canonicalImageKey("https://acme.com/_next/image?url=%2Fhomepage%2Fx.png&w=640&q=75"))
      .toBe("acme.com/homepage/x.png");
    expect(canonicalImageKey("https://acme.com/_next/image?url=https%3A%2F%2Fcdn.acme.com%2Fy.jpg&w=1920"))
      .toBe("cdn.acme.com/y.jpg");
  });

  it("returns the input unchanged for non-URLs", () => {
    expect(canonicalImageKey("not a url")).toBe("not a url");
  });
});

describe("parseSitemapLocs", () => {
  it("extracts <loc> entries from a urlset sitemap", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://acme.com/features/flows</loc></url>
      <url><loc> https://acme.com/pricing </loc></url>
    </urlset>`;
    expect(parseSitemapLocs(xml)).toEqual(["https://acme.com/features/flows", "https://acme.com/pricing"]);
  });

  it("extracts child sitemap URLs from a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://acme.com/sitemap-0.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemapLocs(xml)).toEqual(["https://acme.com/sitemap-0.xml"]);
  });

  it("returns [] for empty or malformed input", () => {
    expect(parseSitemapLocs("")).toEqual([]);
    expect(parseSitemapLocs("<urlset></urlset>")).toEqual([]);
  });
});
