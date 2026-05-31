import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 300_000,
    // Run serially -- render tests use shared browser/ffmpeg resources
    sequence: { concurrent: false },
  },
});
