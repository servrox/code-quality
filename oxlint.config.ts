import { defineConfig } from "oxlint";

import core from "./oxlint/core.mjs";

export default defineConfig({
  extends: [core],
  env: { node: true, browser: false },
  ignorePatterns: [...(core.ignorePatterns ?? []), "tests/consumer/**", "docs/**"],
  options: { typeAware: true, denyWarnings: true, reportUnusedDisableDirectives: "error" },
});
