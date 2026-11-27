import antiSlop from "./oxlint/anti-slop.mjs";
import modularity from "./oxlint/modularity.mjs";
import strict from "./oxlint/strict.mjs";

export default {
  categories: { correctness: "off" },
  env: { node: true, browser: false },
  extends: [strict, modularity, antiSlop],
  ignorePatterns: ["**/*.d.{ts,mts,cts}"],
};
