import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { z } from "zod";

const invocation = z
  .object({ args: z.array(z.string()), entry: z.string() })
  .strict()
  .parse(JSON.parse(readFileSync(0, "utf-8")));

process.argv = [process.execPath, invocation.entry, ...invocation.args];

await import(pathToFileURL(invocation.entry).href);
