/**
 * @author Vikash Sharma <vikashsharma2039@gmail.com>
 * @file vitest.config
 * @description Vitest config: discovers __tests__/ at root, enforces ≥80% line coverage on src/.
 * @see CLAUDE.md §"Testing rules"
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Set NODE_ENV=test so src/env.ts skips .env autoload during tests
    // (tests fully control process.env per CLAUDE.md §"No silent env coupling").
    env: { NODE_ENV: "test" },
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // spike.ts is a one-off demo not shipped to users; exclude from coverage gate.
      exclude: ["src/spike.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
