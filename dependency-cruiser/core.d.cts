import type { IConfiguration } from "dependency-cruiser" with { "resolution-mode": "import" };

declare const config: IConfiguration & {
  forbidden: NonNullable<IConfiguration["forbidden"]>;
  options: NonNullable<IConfiguration["options"]>;
};

export = config;
