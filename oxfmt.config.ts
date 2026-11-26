import { defineConfig } from "oxfmt";

import shared from "./oxfmt/core.mjs";

export default defineConfig({
  ...shared,
  ignorePatterns: [...(shared.ignorePatterns ?? []), "pnpm-lock.yaml", "tests/consumer/**"],
});
