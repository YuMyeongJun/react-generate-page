import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPlan, normalizePagePath, PlanError, validatePageName } from "../src/plan.js";
import { DEFAULT_PRESET, PRESETS } from "../src/config/presets.js";
import type { Config } from "../src/config/types.js";

const preset = PRESETS[DEFAULT_PRESET];
const answers = (over: Partial<Parameters<typeof buildPlan>[1]> = {}) => ({
  pagePath: "a/b",
  pageName: "Thing",
  flags: {
    searchCondition: false,
    createInterface: false,
    createType: false,
    createHooks: false,
  },
  ...over,
});

test("trims whitespace and trailing slashes, and accepts backslashes", () => {
  assert.equal(normalizePagePath("  a/b/  "), "a/b");
  assert.equal(normalizePagePath("a\\b"), "a/b");
});

test("refuses a leading slash rather than deciding what it meant", () => {
  assert.throws(() => normalizePagePath("/a/b"), /no leading slash/);
});

test("refuses page paths that would escape the project", () => {
  for (const bad of ["../x", "a/../../x", "/etc/passwd", ".."]) {
    assert.throws(() => normalizePagePath(bad), PlanError, `accepted ${bad}`);
  }
});

test("refuses page path segments that would survive into a shell command", () => {
  // verify.commands interpolate these paths and run through a shell.
  for (const bad of ["a;rm -rf /", "a$(whoami)", "a b", "a`id`", 'a"b']) {
    assert.throws(() => normalizePagePath(bad), PlanError, `accepted ${bad}`);
  }
});

test("refuses an empty path or name", () => {
  assert.throws(() => normalizePagePath("   "), /empty/);
  assert.throws(() => validatePageName("  "), /empty/);
});

test("refuses a page name that cannot become an identifier", () => {
  assert.throws(() => validatePageName("123"), /valid identifier/);
  assert.throws(() => validatePageName("a/b"), /path separator/);
});

test("rejects an answer for a flag the config never declared", () => {
  assert.throws(
    () => buildPlan(preset, answers({ flags: { madeUp: true } })),
    /undeclared flag "madeUp"/
  );
});

test("a flag left unanswered falls back to its declared default", () => {
  const config: Config = {
    root: "src",
    flags: [{ id: "extra", label: "extra?", default: true }],
    targets: [
      {
        id: "t",
        dir: "x/{{path}}",
        files: [
          { name: "on.ts", when: "extra", template: "" },
          { name: "always.ts", template: "" },
        ],
      },
    ],
  };
  const plan = buildPlan(config, { pagePath: "p", pageName: "N", flags: {} });
  assert.deepEqual(plan.files.map((f) => f.path).sort(), [
    "src/x/p/always.ts",
    "src/x/p/on.ts",
  ]);
});

test("config vars are themselves templated", () => {
  const config: Config = {
    root: "src",
    vars: { alias: "@app/{{path}}" },
    targets: [{ id: "t", dir: "d/{{path}}", files: [{ name: "f.ts", template: "{{alias}}" }] }],
  };
  const plan = buildPlan(config, { pagePath: "a/b", pageName: "N", flags: {} });
  assert.equal(plan.files[0].content, "@app/a/b");
});

test("a config var may not shadow a built-in token", () => {
  const config: Config = {
    root: "src",
    vars: { Name: "nope" },
    targets: [{ id: "t", dir: "d/{{path}}", files: [{ name: "f.ts", template: "" }] }],
  };
  assert.throws(
    () => buildPlan(config, { pagePath: "a", pageName: "N", flags: {} }),
    /shadows a built-in token/
  );
});

test("parentIndex needs a dir ending in {{path}}, or an explicit base", () => {
  const bad: Config = {
    root: "src",
    targets: [{ id: "t", dir: "fixed", parentIndex: true, files: [{ name: "f.ts", template: "" }] }],
  };
  assert.throws(() => buildPlan(bad, { pagePath: "a/b", pageName: "N", flags: {} }), /parentIndexBase/);

  const good: Config = {
    root: "src",
    targets: [
      {
        id: "t",
        dir: "fixed",
        parentIndex: true,
        parentIndexBase: "fixed",
        files: [{ name: "f.ts", template: "" }],
      },
    ],
  };
  const plan = buildPlan(good, { pagePath: "a/b", pageName: "N", flags: {} });
  assert.deepEqual(
    plan.files.filter((f) => f.role === "barrel").map((f) => f.path),
    ["src/fixed/a/index.ts"]
  );
});

test("planning is pure - the same input twice gives identical output", () => {
  const a = buildPlan(preset, answers());
  const b = buildPlan(preset, answers());
  assert.deepEqual(a, b);
});
