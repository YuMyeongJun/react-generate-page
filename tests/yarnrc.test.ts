/**
 * Guards the failure that took CI down on every job at once.
 *
 * .yarnrc.yml is interpolated on *every* yarn invocation, not just during
 * install. A bare `${NODE_AUTH_TOKEN}` therefore made `yarn test`, `yarn build`
 * and `yarn typecheck` all die with "Environment variable not found" for anyone
 * without a publish token - CI included, which needs one only to publish.
 *
 * The invariant: every environment interpolation in that file has a fallback,
 * so yarn runs for someone who just cloned the repo.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");

test("every env interpolation in .yarnrc.yml has a fallback", () => {
  const yarnrc = fs.readFileSync(path.join(ROOT, ".yarnrc.yml"), "utf-8");
  // Comment lines are not interpolated, and a comment explaining this very rule
  // would otherwise trip it.
  const settings = yarnrc
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  const interpolations = [...settings.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(interpolations.length > 0, "expected at least one interpolation");
  for (const body of interpolations) {
    assert.match(
      body,
      /:[-+]/,
      `\${${body}} has no fallback, so every yarn command fails without ${body.split(":")[0]} set`
    );
  }
});

test("the CI workflow does not need a registry token", () => {
  // Needing a fake token to run tests is the smell that preceded the outage.
  const ci = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf-8");
  const assignments = ci
    .split("\n")
    .filter((line) => /^\s*NODE_AUTH_TOKEN\s*:/.test(line));
  assert.deepEqual(assignments, [], "ci.yml should not set NODE_AUTH_TOKEN at all");
});

test("publishing sets the token at job level, not per step", () => {
  // Per-step was the bug: yarn reads .yarnrc.yml on every call, so a step
  // without the variable dies even though the previous step had it.
  const publish = fs.readFileSync(
    path.join(ROOT, ".github", "workflows", "publish.yml"),
    "utf-8"
  );
  const tokenLines = publish
    .split("\n")
    .filter((line) => /NODE_AUTH_TOKEN\s*:/.test(line));
  assert.equal(tokenLines.length, 1, "exactly one place should set the token");
  // and it must be indented as job-level env, not nested inside a step
  assert.match(tokenLines[0], /^ {6}NODE_AUTH_TOKEN:/);
});

test("publishing runs the tests first", () => {
  const publish = fs.readFileSync(
    path.join(ROOT, ".github", "workflows", "publish.yml"),
    "utf-8"
  );
  assert.match(publish, /needs:\s*test/, "the publish job must depend on the test job");
  assert.match(publish, /run:\s*yarn test/, "the test job must actually run the tests");
});
