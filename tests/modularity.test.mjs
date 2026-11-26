import assert from "node:assert/strict";
import test from "node:test";

import { lintFixture } from "./helpers.mjs";

/** @param {number} count - Input to validate or compare. */
const declarations = (count) =>
  Array.from({ length: count }, (_, i) => `function f${i}() { return ${i}; }`).join("\n");
/** @param {number} count - Input to validate or compare. */
const exports = (count) =>
  Array.from({ length: count }, (_, i) => `export const v${i} = ${i};`).join("\n");

void test("eight top-level functions pass; a ninth and tenth each add a finding", () => {
  assert.equal(lintFixture(declarations(8)).length, 0);
  assert.equal(lintFixture(declarations(9)).length, 1);
  assert.equal(lintFixture(declarations(10)).length, 2);
});

void test("callbacks do not spend the module function budget; direct arrows do", () => {
  assert.equal(lintFixture(`${declarations(8)}\n[1].map((x) => x + 1);`).length, 0);
  assert.equal(lintFixture(`${declarations(8)}\nconst ninth = () => 9;`).length, 1);
});

void test("five ESM exports pass; sixth fails, including type/default exports", () => {
  assert.equal(lintFixture(exports(5)).length, 0);
  assert.equal(lintFixture(exports(6)).length, 1);
  assert.equal(lintFixture(`${exports(5)}\nexport type Extra = string;`).length, 1);
  assert.equal(lintFixture(`${exports(5)}\nexport default 6;`).length, 1);
});

void test("grouped, destructured and wildcard exports cannot bypass the budget", () => {
  for (const source of [
    "const a = 1, b = 2; export { a, b };",
    "export const { a, b } = { a: 1, b: 2 };",
    'export * from "./other.js";',
  ]) {
    assert.ok(lintFixture(source).length > 0, source);
  }
});

void test("physical line limits include comments and blank lines", () => {
  assert.equal(lintFixture("// comment\n".repeat(300)).length, 0);
  assert.equal(lintFixture("// comment\n".repeat(301)).length, 1);
  assert.equal(lintFixture("// comment\n".repeat(500), "example.test.ts").length, 0);
  assert.equal(lintFixture("// comment\n".repeat(501), "example.test.ts").length, 1);
});

void test("TypeScript wrappers and default functions still spend the function budget", () => {
  for (const ninth of [
    "const ninth = (() => 9) as () => number;",
    "const ninth = (() => 9) satisfies () => number;",
    "export default (() => 9) satisfies () => number;",
  ]) {
    assert.equal(lintFixture(`${declarations(8)}\n${ninth}`).length, 1);
  }
});

void test("adding bindings to an existing grouped or destructured export adds findings", () => {
  assert.equal(lintFixture("const a=1,b=2; export {a,b};").length, 2);
  assert.equal(lintFixture("const a=1,b=2,c=3; export {a,b,c};").length, 3);
  assert.equal(lintFixture("export const {a,b} = source;").length, 2);
  assert.equal(lintFixture("export const {a,b,c} = source;").length, 3);
  assert.equal(lintFixture("export const [a,b,c] = source;").length, 3);
});

void test("CommonJS literal exports enforce five keys with monotonic findings", () => {
  assert.equal(lintFixture("module.exports = {a,b,c,d,e};", "example.cjs").length, 0);
  assert.equal(lintFixture("module.exports = {a,b,c,d,e,f};", "example.cjs").length, 6);
  assert.equal(lintFixture("module['exports'] = {a,b,c,d,e,f,g};", "example.cjs").length, 7);
});

void test("uncountable CommonJS exports are marked; inline functions pass", () => {
  for (const source of [
    "exports.a = 1;",
    "module.exports.a = 1;",
    "module.exports = api;",
    "module.exports = {...api};",
    "Object.assign(module.exports, api);",
  ]) {
    assert.ok(lintFixture(source, "example.cjs").length > 0, source);
  }
  assert.equal(lintFixture("module.exports = () => 1;", "example.cjs").length, 0);
  assert.equal(
    lintFixture(`${declarations(8)}\nmodule.exports = () => 1;`, "example.cjs").length,
    1
  );
});

void test(
  "nested functions and large ordinary objects do not trigger sibling backtracking",
  { timeout: 10_000 },
  () => {
    const source = `function outer() {\n${declarations(150)}\n}\nconst data = {${Array.from({ length: 150 }, (_, i) => `p${i}: ${i}`).join(",")}};`;
    assert.equal(lintFixture(source).length, 0);
  }
);
