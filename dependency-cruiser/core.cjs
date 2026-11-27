module.exports = {
  forbidden: [
    {
      name: "no-runtime-cycles",
      severity: "error",
      comment: "Keep runtime imports acyclic; type-only references are excluded.",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Remove erased imports before cycle detection; filtering one reported cycle can hide another.
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
