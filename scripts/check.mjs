import { readFileSync } from "node:fs";

import { z } from "zod";

const exportSchema = z.union([
  z.string().transform((path) => ({ default: path, types: undefined })),
  z.object({ default: z.string(), types: z.string().optional() }),
]);

const manifest = z
  .object({ exports: z.record(z.string(), exportSchema) })
  .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")));

await Promise.all(
  Object.values(manifest.exports).map(async (entry) => {
    const path = entry.default;

    if (entry.types !== undefined) {
      readFileSync(new URL(`../${entry.types}`, import.meta.url), "utf-8");
    }

    if (path.endsWith(".json")) {
      JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf-8"));
    } else {
      await import(new URL(`../${path}`, import.meta.url));
    }
  })
);

console.log("All shared quality exports load.");
