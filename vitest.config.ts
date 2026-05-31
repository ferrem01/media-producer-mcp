import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // All tests live in test/
    include: ["test/**/*.test.ts"],
    // Longer timeout for render tests (Playwright + ffmpeg)
    testTimeout: 300_000,
    // Run serially -- render tests use shared browser/ffmpeg resources
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
