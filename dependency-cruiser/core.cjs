module.exports = {
  forbidden: [
    {
      name: "no-runtime-cycles",
      severity: "error",
      comment: "Keep runtime imports acyclic; type-only references are excluded.",
      from: {},
      to: {
        circular: true,
        dependencyTypesNot: ["type-only"],
        viaOnly: { dependencyTypesNot: ["type-only"] },
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: "specify",
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
