import type { IConfiguration } from "dependency-cruiser" with { "resolution-mode": "import" };

declare function createRuntimeConfig(settings?: { baseDir?: string }): IConfiguration & {
  forbidden: NonNullable<IConfiguration["forbidden"]>;
  options: NonNullable<IConfiguration["options"]> & { baseDir: string };
};

export = createRuntimeConfig;
