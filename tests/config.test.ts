import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { loadConfig, validateConfig, ConfigError } from "../src/config/load.js";
import { DEFAULT_PRESET, PRESETS } from "../src/config/presets.js";
import type { Config } from "../src/config/types.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rgp-config-"));

const minimal = (over: Partial<Config> = {}): Config => ({
  root: "src",
  targets: [{ id: "t", dir: "d/{{path}}", files: [{ name: "f.ts", template: "" }] }],
  ...over,
});

test("the shipped preset is valid", () => {
  validateConfig(PRESETS[DEFAULT_PRESET]);
});

test("with no config file, the default preset is used", async () => {
  const dir = tmp();
  const loaded = await loadConfig(dir);
  assert.equal(loaded.presetName, DEFAULT_PRESET);
  assert.equal(loaded.file, undefined);
});

test("a JSON config overrides the preset it extends", async () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, "generate-page.config.json"),
    JSON.stringify({ root: "app" })
  );
  const loaded = await loadConfig(dir);
  assert.equal(loaded.config.root, "app");
  // and inherits everything it did not mention
  assert.ok(loaded.config.targets.some((t) => t.id === "component"));
});

test("an .mjs config is loaded via a plain dynamic import", async () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, "generate-page.config.mjs"),
    'export default { root: "source" };\n'
  );
  const loaded = await loadConfig(dir);
  assert.equal(loaded.config.root, "source");
});

test("templateFile is read relative to the config file", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "body.tpl"), "hello {{Name}}");
  fs.writeFileSync(
    path.join(dir, "generate-page.config.json"),
    JSON.stringify({
      targets: [
        { id: "t", dir: "d/{{path}}", files: [{ name: "f.ts", templateFile: "body.tpl" }] },
      ],
    })
  );
  const loaded = await loadConfig(dir);
  assert.equal(loaded.config.targets[0].files[0].template, "hello {{Name}}");
});

test("malformed JSON is reported as such, with the file name", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "generate-page.config.json"), "{ not json");
  await assert.rejects(() => loadConfig(dir), /is not valid JSON/);
});

test("an unknown preset lists the ones that exist", async () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, "generate-page.config.json"),
    JSON.stringify({ preset: "svelte-something" })
  );
  await assert.rejects(() => loadConfig(dir), /unknown preset "svelte-something"/);
});

test("validation rejects a root outside the project", () => {
  assert.throws(() => validateConfig(minimal({ root: "../elsewhere" })), ConfigError);
  assert.throws(() => validateConfig(minimal({ root: "/abs" })), /inside the project/);
});

test("validation rejects empty roots and target lists", () => {
  assert.throws(() => validateConfig(minimal({ root: "" })), /non-empty string/);
  assert.throws(() => validateConfig(minimal({ targets: [] })), /non-empty array/);
});

test("validation rejects duplicate ids", () => {
  assert.throws(
    () =>
      validateConfig(
        minimal({
          targets: [
            { id: "same", dir: "a/{{path}}", files: [{ name: "f.ts", template: "" }] },
            { id: "same", dir: "b/{{path}}", files: [{ name: "f.ts", template: "" }] },
          ],
        })
      ),
    /duplicate target id/
  );
  assert.throws(
    () =>
      validateConfig(
        minimal({
          flags: [
            { id: "f", label: "?" },
            { id: "f", label: "?" },
          ],
        })
      ),
    /duplicate flag id/
  );
});

test("validation catches a token typo before anything is written", () => {
  assert.throws(
    () =>
      validateConfig(
        minimal({
          targets: [
            { id: "t", dir: "d/{{path}}", files: [{ name: "f.ts", template: "{{Nmae}}" }] },
          ],
        })
      ),
    /unknown token \{\{Nmae\}\}/
  );
});

test("validation catches a when: clause naming an undeclared flag", () => {
  assert.throws(
    () =>
      validateConfig(
        minimal({
          targets: [
            {
              id: "t",
              dir: "d/{{path}}",
              when: "missing",
              files: [{ name: "f.ts", template: "" }],
            },
          ],
        })
      ),
    /gated on flag "missing", which is not declared/
  );
});

test("validation rejects a flag id templates could not reference", () => {
  assert.throws(
    () => validateConfig(minimal({ flags: [{ id: "has-dash", label: "?" }] })),
    /letters, digits and underscores/
  );
});

test("validation rejects setting both template and templateFile", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "b.tpl"), "x");
  fs.writeFileSync(
    path.join(dir, "generate-page.config.json"),
    JSON.stringify({
      targets: [
        {
          id: "t",
          dir: "d/{{path}}",
          files: [{ name: "f.ts", template: "x", templateFile: "b.tpl" }],
        },
      ],
    })
  );
  await assert.rejects(() => loadConfig(dir), /not both/);
});

test("every shipped preset validates and plans a non-empty page", async () => {
  const { buildPlan } = await import("../src/plan.js");
  for (const [name, preset] of Object.entries(PRESETS)) {
    validateConfig(preset);
    const plan = buildPlan(preset, {
      pagePath: "a/b",
      pageName: "Thing",
      flags: {},
    });
    assert.ok(plan.files.length > 0, `${name} planned no files`);
    for (const file of plan.files) {
      // Nothing may escape the configured root, and no unresolved token may
      // reach a file the user is going to open.
      assert.ok(file.path.startsWith(`${preset.root}/`), `${name}: ${file.path} escapes root`);
      assert.ok(!/\{\{\s*[A-Za-z0-9_]+\s*\}\}/.test(file.path), `${name}: unresolved token in ${file.path}`);
    }
  }
});

test("every preset's flags all reachable, and every flag on plans more, not less", async () => {
  const { buildPlan } = await import("../src/plan.js");
  for (const [name, preset] of Object.entries(PRESETS)) {
    const allOff = buildPlan(preset, {
      pagePath: "a/b",
      pageName: "Thing",
      flags: Object.fromEntries((preset.flags ?? []).map((f) => [f.id, false])),
    });
    const allOn = buildPlan(preset, {
      pagePath: "a/b",
      pageName: "Thing",
      flags: Object.fromEntries((preset.flags ?? []).map((f) => [f.id, true])),
    });
    assert.ok(
      allOn.files.length >= allOff.files.length,
      `${name}: turning flags on produced fewer files`
    );
    // A declared flag that changes nothing is a question with no consequence.
    if ((preset.flags ?? []).length > 0) {
      const offText = allOff.files.map((f) => f.path + f.content).join("");
      const onText = allOn.files.map((f) => f.path + f.content).join("");
      assert.notEqual(offText, onText, `${name}: no flag changes the output`);
    }
  }
});
