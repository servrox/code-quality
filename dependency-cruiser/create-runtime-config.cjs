const path = require("node:path");

const core = require("./core.cjs");

/** @param {string} baseDir - Absolute directory used for graph paths. */
const qualityPackagePaths = (baseDir) => {
  const paths = ["(^|/)node_modules/@servrox/code-quality(/|$)"];

  const linkedRoot = path
    .relative(baseDir, path.resolve(__dirname, ".."))
    .replaceAll(path.sep, "/");

  if (linkedRoot !== "") {
    const escapedRoot = linkedRoot.replaceAll(/[.*+?^$(){}|[\]\\]/gu, "\\$&");

    paths.push(`^${escapedRoot}(/|$)`);
  }

  return paths;
};

/** @param {{ baseDir?: string }} [settings] - Consumer analysis root. */
module.exports = function createRuntimeConfig({ baseDir = process.cwd() } = {}) {
  const resolvedBaseDir = path.resolve(baseDir);

  return {
    options: { ...core.options, baseDir: resolvedBaseDir },
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
        to: { path: qualityPackagePaths(resolvedBaseDir) },
      },
    ],
  };
};
