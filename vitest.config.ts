import { defineConfig } from "vitest/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Every code path that defaults its data dir (MP_DATA_DIR ||
// "/data/media-producer") must land in a scratch dir under test -- the
// production default is only creatable by root, which is exactly why these
// suites passed in the root sandbox and failed CI's non-root runner with
// EACCES on the first day CI existed. Set BEFORE any test imports config.ts.
const scratchDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mp-vitest-data-"));

export default defineConfig({
  test: {
    env: { MP_DATA_DIR: scratchDataDir },
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
