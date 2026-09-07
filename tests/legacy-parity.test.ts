/**
 * The regression net for "don't break existing users".
 *
 * The fixtures in tests/fixtures/legacy-golden were produced by calling 0.1.37's
 * own template functions - extracted from that release's source, not retyped -
 * and are compared here byte for byte against what the default preset plans.
 *
 * If this file goes red, generated code in somebody's repository is about to
 * change. That is occasionally the intent; it is never an acceptable accident.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildPlan } from "../src/plan.js";
import { toPascalCase } from "../src/naming.js";
import { DEFAULT_PRESET, PRESETS } from "../src/config/presets.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures", "legacy-golden");

interface Case {
  dir: string;
  pagePath: string;
  /** As a user would type it, before PascalCase conversion. */
  rawName: string;
}

const CASES: Case[] = [
  { dir: "TestPage__test-path", pagePath: "test/path", rawName: "TestPage" },
  { dir: "UserList__admin-user", pagePath: "admin/user", rawName: "user-list" },
  { dir: "DeepPage__a-b-c", pagePath: "a/b/c", rawName: "DeepPage" },
  { dir: "SoloPage__solo", pagePath: "solo", rawName: "solo_page" },
];

const preset = PRESETS[DEFAULT_PRESET];

const planFor = (c: Case, searchCondition: boolean) =>
  buildPlan(preset, {
    pagePath: c.pagePath,
    pageName: c.rawName,
    flags: {
      searchCondition,
      createInterface: false,
      createType: false,
      createHooks: false,
    },
  });

const contentAt = (plan: ReturnType<typeof buildPlan>, p: string): string => {
  const file = plan.files.find((f) => f.path === p);
  assert.ok(file, `plan has no file at ${p}\nplanned:\n${plan.files.map((f) => "  " + f.path).join("\n")}`);
  return file.content;
};

const fixture = (c: Case, cond: boolean, name: string) =>
  fs.readFileSync(path.join(FIXTURES, `${c.dir}__cond-${cond ? "y" : "n"}`, name), "utf-8");

for (const c of CASES) {
  for (const cond of [false, true]) {
    const label = `${c.dir} cond=${cond ? "y" : "n"}`;

    test(`${label}: PascalCase conversion matches 0.1.37`, () => {
      assert.equal(toPascalCase(c.rawName), fixture(c, cond, "_pascal.txt"));
    });

    test(`${label}: generated file bodies match 0.1.37 byte for byte`, () => {
      const plan = planFor(c, cond);
      const Name = toPascalCase(c.rawName);
      const componentDir = `src/components/pages/${c.pagePath}`;
      const pageDir = `src/pages/${c.pagePath}`;

      const pairs: [string, string][] = [
        [`${componentDir}/${Name}Component.tsx`, "Component.tsx"],
        [`${componentDir}/${Name}ViewModel.tsx`, "ViewModel.tsx"],
        [`${componentDir}/index.ts`, "component-index.ts"],
        [`${pageDir}/${Name}Page.tsx`, "Page.tsx"],
        [`${pageDir}/index.ts`, "page-index.ts"],
      ];
      if (cond) {
        pairs.push([`${componentDir}/${Name}Condition.tsx`, "Condition.tsx"]);
      }

      for (const [planned, golden] of pairs) {
        assert.equal(
          contentAt(plan, planned),
          fixture(c, cond, golden),
          `${planned} differs from 0.1.37's ${golden}`
        );
      }
    });

    test(`${label}: Condition.tsx exists only when asked for`, () => {
      const plan = planFor(c, cond);
      const Name = toPascalCase(c.rawName);
      const conditionPath = `src/components/pages/${c.pagePath}/${Name}Condition.tsx`;
      assert.equal(
        plan.files.some((f) => f.path === conditionPath),
        cond
      );
    });
  }

  test(`${c.dir}: parent barrels match 0.1.37's placement and format`, () => {
    const plan = planFor(c, false);
    const segments = c.pagePath.split("/");
    // 0.1.37 wired ancestors only, so a single-segment path produced none, and
    // the base directory itself never received an index.ts.
    const expected = segments.slice(0, -1).flatMap((_, i) => [
      {
        path: `src/components/pages/${segments.slice(0, i + 1).join("/")}/index.ts`,
        content: `export * from './${segments[i + 1]}';\n`,
      },
      {
        path: `src/pages/${segments.slice(0, i + 1).join("/")}/index.ts`,
        content: `export * from './${segments[i + 1]}';\n`,
      },
    ]);

    const barrels = plan.files.filter((f) => f.role === "barrel");
    assert.deepEqual(
      barrels.map((b) => ({ path: b.path, content: b.content })).sort((a, b) => a.path.localeCompare(b.path)),
      expected.sort((a, b) => a.path.localeCompare(b.path))
    );

    // And the export statement itself is formatted the way 0.1.37 formatted it.
    const golden = fixture(c, false, "parent-index.ts");
    assert.equal(golden, `export * from './${segments[0]}';\n`);
  });

  test(`${c.dir}: optional directories appear only when their flag is on`, () => {
    const on = buildPlan(preset, {
      pagePath: c.pagePath,
      pageName: c.rawName,
      flags: {
        searchCondition: false,
        createInterface: true,
        createType: true,
        createHooks: true,
      },
    });
    const off = planFor(c, false);

    for (const dir of [
      `src/models/interfaces/${c.pagePath}/index.ts`,
      `src/models/types/${c.pagePath}/index.ts`,
      `src/hooks/client/${c.pagePath}/index.ts`,
    ]) {
      assert.ok(on.files.some((f) => f.path === dir), `${dir} missing when flag on`);
      assert.ok(!off.files.some((f) => f.path === dir), `${dir} present when flag off`);
    }

    // 0.1.37 wrote these three files empty. It also defined a
    // generateModelIndex() returning "// Add model exports here" and never
    // called it, so that string was never emitted by any release.
    for (const dir of [
      `src/models/interfaces/${c.pagePath}/index.ts`,
      `src/models/types/${c.pagePath}/index.ts`,
      `src/hooks/client/${c.pagePath}/index.ts`,
    ]) {
      assert.equal(on.files.find((f) => f.path === dir)?.content, "");
    }
  });
}

test("the two cosmetic quirks of 0.1.37's output are preserved on purpose", () => {
  const plan = planFor(CASES[0], false);
  const component = contentAt(plan, "src/components/pages/test/path/TestPageComponent.tsx");
  assert.ok(component.startsWith("\n\n"), "Component.tsx starts with a blank line");
  assert.ok(
    component.includes("<div>\n      \n    </div>"),
    "the empty-condition branch leaves a line of six spaces"
  );
});
