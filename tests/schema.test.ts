/**
 * Keeps the shipped JSON Schema honest.
 *
 * The schema is hand-written - validating against it would mean a JSON Schema
 * library, and this package has no runtime dependencies. So instead of
 * validating, these tests check for *drift*: every key the real presets use must
 * be described, and every key the schema describes must be one the loader
 * actually reads. That catches the failure that matters, which is a schema that
 * silently stops matching the code.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { PRESETS } from "../src/config/presets.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.join(HERE, "..", "..", "schema", "generate-page.config.schema.json");

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));

const props = (node: Record<string, any>): string[] =>
  Object.keys(node?.properties ?? {});

test("the schema file is shipped and parses", () => {
  assert.equal(schema.type, "object");
  assert.ok(schema.properties);
});

test("every top-level key the presets use is described", () => {
  const described = new Set(props(schema));
  for (const [name, preset] of Object.entries(PRESETS)) {
    for (const key of Object.keys(preset)) {
      assert.ok(described.has(key), `preset "${name}" uses undocumented key "${key}"`);
    }
  }
});

test("every target and file key the presets use is described", () => {
  const targetProps = new Set(props(schema.properties.targets.items));
  const fileProps = new Set(props(schema.properties.targets.items.properties.files.items));
  for (const [name, preset] of Object.entries(PRESETS)) {
    for (const target of preset.targets) {
      for (const key of Object.keys(target)) {
        assert.ok(targetProps.has(key), `${name}: target key "${key}" undocumented`);
      }
      for (const file of target.files) {
        for (const key of Object.keys(file)) {
          assert.ok(fileProps.has(key), `${name}: file key "${key}" undocumented`);
        }
      }
    }
  }
});

test("every flag and verify key the presets use is described", () => {
  const flagProps = new Set(props(schema.properties.flags.items));
  const verifyProps = new Set(props(schema.properties.verify));
  for (const [name, preset] of Object.entries(PRESETS)) {
    for (const flag of preset.flags ?? []) {
      for (const key of Object.keys(flag)) {
        assert.ok(flagProps.has(key), `${name}: flag key "${key}" undocumented`);
      }
    }
    for (const key of Object.keys(preset.verify ?? {})) {
      assert.ok(verifyProps.has(key), `${name}: verify key "${key}" undocumented`);
    }
  }
});

test("the schema's preset enum lists exactly the presets that exist", () => {
  assert.deepEqual(
    [...schema.properties.preset.enum].sort(),
    Object.keys(PRESETS).sort()
  );
});

test("the schema requires targets, since a config without them cannot generate", () => {
  assert.deepEqual(schema.required, ["targets"]);
  assert.equal(schema.additionalProperties, false);
});
