import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // integration.test.ts is a main()-style script (run it directly with tsx),
    // not a vitest suite -- vitest reports "No test suite found" and counts a
    // permanent failure in every run, local and CI.
    exclude: ["test/integration.test.ts", "**/node_modules/**"],
    testTimeout: 300_000,
    // Run serially -- render tests use shared browser/ffmpeg resources
    sequence: { concurrent: false },
  },
});
