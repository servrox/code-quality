import { fileURLToPath } from "node:url";

const functionTypes = "/^(ArrowFunctionExpression|FunctionExpression)$/";

const functionBinding =
  `:matches(` +
  `VariableDeclarator[init.type=${functionTypes}],` +
  `VariableDeclarator[init.type=/^(TSAsExpression|TSSatisfiesExpression|TSNonNullExpression)$/]` +
  `[init.expression.type=${functionTypes}])`;

const functions =
  `:matches(` +
  `FunctionDeclaration[body],` +
  `ExportNamedDeclaration[declaration.type="FunctionDeclaration"][declaration.body],` +
  `ExportDefaultDeclaration[declaration.type=/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/],` +
  `ExportDefaultDeclaration[declaration.type=/^(TSAsExpression|TSSatisfiesExpression|TSNonNullExpression)$/][declaration.expression.type=${functionTypes}],` +
  `ExpressionStatement[expression.type="AssignmentExpression"][expression.left.object.name="module"][expression.right.type=${functionTypes}]:matches([expression.left.computed=false][expression.left.property.name="exports"],[expression.left.computed=true][expression.left.property.value="exports"]),` +
  `VariableDeclaration:has(> ${functionBinding}),` +
  `ExportNamedDeclaration:has(> VariableDeclaration > ${functionBinding}))`;

const exports =
  ":matches(ExportNamedDeclaration[declaration]," +
  "ExportNamedDeclaration[specifiers.length>0],ExportDefaultDeclaration,ExportAllDeclaration[exported])";

const moduleAssignment =
  'AssignmentExpression[left.object.name="module"]:matches([left.computed=false][left.property.name="exports"],[left.computed=true][left.property.value="exports"])';

const leafBindings =
  ':matches(Property[value.type="Identifier"],Property[value.type="AssignmentPattern"][value.left.type="Identifier"],ArrayPattern > Identifier,ArrayPattern > AssignmentPattern[left.type="Identifier"],RestElement[argument.type="Identifier"])';

export const functionRestrictions = [
  {
    selector: Array.from({ length: 9 }, () => `${functions}[parent.type="Program"]`).join(" ~ "),
    message: "Maximum 8 top-level functions per file.",
  },
  {
    selector:
      `Program > VariableDeclaration[declarations.length>1]:has(> ${functionBinding}) > VariableDeclarator,` +
      `Program > ExportNamedDeclaration > VariableDeclaration[declarations.length>1]:has(> ${functionBinding}) > VariableDeclarator`,
    message: "Declare module-level function bindings separately.",
  },
];

export const exportRestrictions = [
  {
    selector: Array.from({ length: 6 }, () => `${exports}[parent.type="Program"]`).join(" ~ "),
    message: "Maximum 5 explicit ESM exports per file.",
  },
  {
    selector:
      "Program > ExportNamedDeclaration[specifiers.length>1] > ExportSpecifier," +
      "Program > ExportNamedDeclaration > VariableDeclaration[declarations.length>1] > VariableDeclarator",
    message: "Export one symbol per statement outside explicit package entrypoints.",
  },
  {
    selector: `Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > :matches(ObjectPattern,ArrayPattern) ${leafBindings}`,
    message: "Export named bindings individually.",
  },
  {
    selector: "Program > ExportAllDeclaration:not([exported])",
    message: "Wildcard exports are restricted to explicit package entrypoints.",
  },
  {
    selector: `${moduleAssignment} > ObjectExpression[properties.length>5] > :matches(Property,SpreadElement)`,
    message: "Maximum 5 properties in a CommonJS export object.",
  },
  {
    selector: `${moduleAssignment} > ObjectExpression > SpreadElement`,
    message: "Export CommonJS properties explicitly so the export budget is checkable.",
  },
  {
    selector:
      'AssignmentExpression[left.object.name="exports"],AssignmentExpression[left.object.object.name="module"]:matches([left.object.computed=false][left.object.property.name="exports"],[left.object.computed=true][left.object.property.value="exports"])',
    message: "Declare CommonJS exports in one explicit export object.",
  },
  {
    selector: `${moduleAssignment}:not([right.type=/^(ObjectExpression|FunctionExpression|ArrowFunctionExpression)$/])`,
    message: "Export an inline CommonJS object or function so its public surface is checkable.",
  },
  {
    selector:
      ':matches(CallExpression[callee.object.name="Object"][callee.property.name=/^(assign|defineProperty|defineProperties)$/],CallExpression[callee.object.name="Reflect"][callee.property.name=/^(set|defineProperty)$/]):matches([arguments.0.name="exports"],[arguments.0.object.name="module"][arguments.0.computed=false][arguments.0.property.name="exports"],[arguments.0.object.name="module"][arguments.0.computed=true][arguments.0.property.value="exports"])',
    message: "Declare CommonJS exports explicitly instead of using mutation helpers.",
  },
];

export default {
  jsPlugins: [
    { name: "eslint-js", specifier: fileURLToPath(import.meta.resolve("oxlint-plugin-eslint")) },
  ],
  rules: {
    "max-lines": ["error", { max: 300, skipBlankLines: false, skipComments: false }],
    "eslint-js/no-restricted-syntax": ["error", ...functionRestrictions, ...exportRestrictions],
  },
  overrides: [
    {
      files: ["**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts,mjs,cjs}"],
      rules: { "max-lines": ["error", { max: 500, skipBlankLines: false, skipComments: false }] },
    },
  ],
};
