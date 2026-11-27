const path = require("node:path");

const core = require("./core.cjs");

const qualityPackagePaths = ["(^|/)node_modules/@servrox/code-quality(/|$)"];

// Track the linked package without changing resolution of other workspace dependencies.
const linkedRoot = path
  .relative(process.cwd(), path.resolve(__dirname, ".."))
  .replaceAll(path.sep, "/");

if (linkedRoot !== "") {
  const escapedRoot = linkedRoot.replaceAll(/[.*+?^$(){}|[\]\\]/gu, "\\$&");

  qualityPackagePaths.push(`^${escapedRoot}(/|$)`);
}

module.exports = {
  options: core.options,
  forbidden: [
    ...core.forbidden,
    {
      name: "no-unresolved-runtime-imports",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-undeclared-runtime-imports",
      severity: "error",
      from: {},
      to: {
        dependencyTypes: ["npm-no-pkg", "npm-unknown"],
        // Dependency Cruiser checks the #alias rather than its mapped package in the manifest.
        dependencyTypesNot: ["aliased-subpath-import"],
      },
    },
    {
      name: "no-runtime-to-quality-tooling",
      severity: "error",
      from: {},
      to: { path: qualityPackagePaths },
    },
  ],
};
