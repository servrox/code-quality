import assert from "node:assert/strict";
import test from "node:test";

import { lintFixture } from "./helpers.mjs";

/** @param {number} count - Input to validate or compare. */
const declarations = (count) =>
  Array.from({ length: count }, (_, i) => `function f${i}() { return ${i}; }`).join("\n");
/** @param {number} count - Input to validate or compare. */
const exports = (count) =>
  Array.from({ length: count }, (_, i) => `export const v${i} = ${i};`).join("\n");
/** @param {string} source - Source to lint. @param {string} filename - Parser selection. */
const functionFindings = (source, filename = "example.ts") =>
  lintFixture(source, filename).filter(
    ({ message }) => message === "Maximum 8 top-level functions per file."
  );

void test("eight top-level functions pass; a ninth and tenth each add a finding", () => {
  assert.equal(lintFixture(declarations(8)).length, 0);
  assert.equal(lintFixture(declarations(9)).length, 1);
  assert.equal(lintFixture(declarations(10)).length, 2);
});

void test("callbacks do not spend the module function budget; direct arrows do", () => {
  assert.equal(lintFixture(`${declarations(8)}\n[1].map((x) => x + 1);`).length, 0);
  assert.equal(lintFixture(`${declarations(8)}\nconst ninth = () => 9;`).length, 1);
});

void test("exported arrows spend the function budget independently of the export budget", () => {
  for (const filename of ["example.mjs", "example.ts"]) {
    for (const [count, expected] of [
      [8, 0],
      [9, 1],
      [10, 2],
    ]) {
      const source = Array.from(
        { length: count },
        (_, i) => `export const f${i} = () => ${i};`
      ).join("\n");
      assert.equal(functionFindings(source, filename).length, expected, `${filename}: ${count}`);
    }
  }
});

void test("exported JSX arrows retain the eight-function boundary and monotonic findings", () => {
  for (const [count, expected] of [
    [8, 0],
    [9, 1],
    [10, 2],
  ]) {
    const source = Array.from(
      { length: count },
      (_, i) => `export const View${i} = () => <span>${i}</span>;`
    ).join("\n");
    assert.equal(functionFindings(source, "example.tsx").length, expected, `${count} JSX arrows`);
  }
});

void test("exported function expressions and single TypeScript wrappers consume one slot", () => {
  for (const binding of [
    "() => 9",
    "function () { return 9; }",
    "(() => 9) as () => number",
    "(() => 9) satisfies () => number",
    "(() => 9)!",
    "(function () { return 9; }) as () => number",
    "(function () { return 9; }) satisfies () => number",
    "(function () { return 9; })!",
  ]) {
    const exported = `export const extra = ${binding};`;
    assert.equal(functionFindings(`${declarations(7)}\n${exported}`).length, 0, binding);
    assert.equal(functionFindings(`${declarations(8)}\n${exported}`).length, 1, binding);
  }
});

void test("mixed private and exported functions count at every module position", () => {
  const ordinary = declarations(8).split("\n");
  for (const position of [0, 4, 8]) {
    const source = ordinary.toSpliced(position, 0, "export const extra = () => 9;").join("\n");
    assert.equal(functionFindings(source).length, 1, `position ${position}`);
    assert.equal(functionFindings(`${source}\nexport const tenth = () => 10;`).length, 2);
  }
});

void test("nested callbacks and methods in exported values do not spend module slots", () => {
  for (const exported of [
    "export const mapped = [1].map((value) => value + 1);",
    "export const object = { arrow: () => 1, method() { return 1; } };",
    "export const factory = create(() => () => 1);",
  ]) {
    assert.equal(functionFindings(`${declarations(8)}\n${exported}`).length, 0, exported);
  }
  const outer = `export const outer = () => {\n${declarations(20)}\nreturn () => 1;\n};`;
  assert.equal(functionFindings(`${declarations(7)}\n${outer}`).length, 0);
  assert.equal(functionFindings(`${declarations(8)}\n${outer}`).length, 1);
});

void test("grouped exported function bindings keep monotonic markers without nested matches", () => {
  for (const [source, expected] of [
    ["export const a = () => 1, b = () => 2;", 2],
    ["export const a = () => 1, b = () => 2, c = () => 3;", 3],
    ["export const a = [1].map(() => 1), b = { callback: () => 2 };", 0],
    ["export const outer = () => { const a = () => 1, b = () => 2; return a() + b(); };", 0],
  ]) {
    const findings = lintFixture(source).filter(
      ({ message }) => message === "Declare module-level function bindings separately."
    );
    assert.equal(findings.length, expected, source);
  }
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

void test("literal computed mutation helpers cannot bypass CommonJS export checks", () => {
  for (const source of [
    'Object["assign"](module.exports, {a,b,c,d,e,f});',
    'Object["defineProperty"](exports, "sixth", {value: 6});',
    'Object["defineProperties"](module["exports"], {sixth: {value: 6}});',
    'Reflect["set"](exports, "sixth", 6);',
    'Reflect["defineProperty"](module.exports, "sixth", {value: 6});',
  ]) {
    assert.equal(lintFixture(source, "example.cjs").length, 1, source);
  }

  assert.equal(lintFixture('Object["keys"](module.exports);', "example.cjs").length, 0);
  assert.equal(lintFixture("Object[assign](module.exports, api);", "example.cjs").length, 0);
});

void test("TypeScript CommonJS exports share the object and function budgets", () => {
  assert.equal(lintFixture("export = {a,b,c,d,e};", "example.cts").length, 0);
  assert.equal(lintFixture("export = {a,b,c,d,e,f};", "example.cts").length, 6);
  assert.equal(lintFixture("export = {a,b,c,d,e,f,g};", "example.cts").length, 7);
  assert.equal(lintFixture("export = () => 1;", "example.cts").length, 0);
  assert.equal(lintFixture(`${declarations(8)}\nexport = () => 9;`, "example.cts").length, 1);

  for (const source of ["export = api;", "export = {...api};"]) {
    assert.ok(lintFixture(source, "example.cts").length > 0, source);
  }
});

void test(
  "nested functions and large ordinary objects do not trigger sibling backtracking",
  { timeout: 10_000 },
  () => {
    const source = `function outer() {\n${declarations(150)}\n}\nconst data = {${Array.from({ length: 150 }, (_, i) => `p${i}: ${i}`).join(",")}};`;
    assert.equal(lintFixture(source).length, 0);
  }
);
