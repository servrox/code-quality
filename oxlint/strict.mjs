import { fileURLToPath } from "node:url";

export default {
  jsPlugins: [
    { name: "unicorn-js", specifier: fileURLToPath(import.meta.resolve("eslint-plugin-unicorn")) },
    { name: "sonarjs", specifier: fileURLToPath(import.meta.resolve("eslint-plugin-sonarjs")) },
  ],
  rules: {
    "unicorn-js/prefer-minimal-ternary": "error",
    "unicorn-js/consistent-conditional-object-spread": ["error", "logical"],
    "unicorn-js/prefer-simplified-conditions": "error",
    "unicorn-js/no-useless-re-export": "error",
    "sonarjs/prefer-immediate-return": "error",
    "sonarjs/prefer-single-boolean-return": "error",
    "sonarjs/no-identical-functions": "error",
    "sonarjs/cognitive-complexity": ["error", 10],
    "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
    complexity: ["error", 8],
    "max-depth": ["error", 3],
    "max-params": ["error", 4],
    "max-statements": ["error", 20],
    "max-nested-callbacks": ["error", 3],
    "max-classes-per-file": ["error", 1],
  },
};
