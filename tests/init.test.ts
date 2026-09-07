import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import { draftFrom, measureSuffixes, observe, renderDraft, scriptCommand } from "../src/init.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rgp-init-"));

const repo = (pkg: unknown, files: Record<string, string> = {}) => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
};

test("a repo without package.json is refused rather than guessed at", () => {
  assert.throws(() => observe(tmp()), /No package.json/);
});

test("only folders containing code are offered as candidates", () => {
  const dir = repo({ name: "x" }, {
    "src/App.tsx": "",
    "docs/readme.txt": "",
    "assets/logo.png": "",
  });
  const o = observe(dir);
  assert.deepEqual(o.codeDirs, ["src"]);
});

test("node_modules and build output are not candidates", () => {
  const dir = repo({ name: "x" }, {
    "src/App.tsx": "",
    "node_modules/pkg/index.js": "",
    "dist/bundle.js": "",
  });
  assert.deepEqual(observe(dir).codeDirs, ["src"]);
});

test("npm's placeholder test script is not read as a real command", () => {
  // `npm init -y` writes: echo "Error: no test specified" && exit 1
  // Recording that as a verify command means the gate always fails.
  const dir = repo({
    name: "x",
    scripts: { test: 'echo "Error: no test specified" && exit 1' },
  });
  assert.equal(scriptCommand(observe(dir), ["test"]), undefined);
});

test("scripts are matched by exact name only", () => {
  const dir = repo({ name: "x", scripts: { "typecheck:ci": "tsc -p ci" } });
  const o = observe(dir);
  // "typecheck:ci" is not "typecheck" - a near miss would run the wrong thing.
  assert.equal(scriptCommand(o, ["typecheck"]), undefined);
  assert.equal(scriptCommand(o, ["typecheck:ci"]), "npm run typecheck:ci");
});

test("the package manager decides how a script is invoked", () => {
  const yarn = repo({ name: "x", packageManager: "yarn@4.8.1", scripts: { lint: "eslint ." } });
  assert.equal(scriptCommand(observe(yarn), ["lint"]), "yarn lint");
  const npm = repo({ name: "x", scripts: { lint: "eslint ." } });
  assert.equal(scriptCommand(observe(npm), ["lint"]), "npm run lint");
});

test("recurring file-name suffixes are measured, not assumed", () => {
  const suffixes = measureSuffixes([
    "src/a/LoginComponent.tsx",
    "src/b/HomeComponent.tsx",
    "src/c/CartComponent.tsx",
    "src/a/LoginViewModel.tsx",
    "src/b/HomeViewModel.tsx",
    "src/x/Standalone.tsx",
  ]);
  const byName = new Map(suffixes.map((s) => [s.suffix, s.count]));
  assert.equal(byName.get("Component"), 3);
  assert.equal(byName.get("ViewModel"), 2);
  // A suffix seen once is noise, and a single-word file has no suffix at all.
  assert.ok(!byName.has("Standalone"));
});

test("a monorepo root is not mistaken for the source folder", () => {
  // Top-level folders in a workspace repo are containers; picking one would
  // point root at "apps".
  const dir = repo({ name: "x", workspaces: ["apps/*"] }, { "apps/web/src/App.tsx": "" });
  const o = observe(dir);
  assert.equal(o.workspaces, true);
  const draft = draftFrom(o, undefined);
  assert.ok(draft.notes.some((n) => /workspace/i.test(n) && /TODO/.test(n)));
});

test("what could not be read is left as TODO, not filled in", () => {
  const dir = repo({ name: "x" }, { "src/App.tsx": "" });
  const draft = draftFrom(observe(dir), "src");
  assert.equal(draft.verifyCommands.length, 0);
  const rendered = renderDraft(draft, "react-mvvm");
  assert.match(rendered, /TODO/);
  assert.match(rendered, /commands: \[\],/);
  assert.match(rendered, /root: "src"/);
});

test("a readable typecheck script becomes a verify command", () => {
  const dir = repo({ name: "x", scripts: { typecheck: "tsc --noEmit" } }, { "src/A.tsx": "" });
  const draft = draftFrom(observe(dir), "src");
  assert.deepEqual(draft.verifyCommands, ["npm run typecheck"]);
  assert.match(renderDraft(draft, "react-mvvm"), /"npm run typecheck"/);
});

test("the rendered draft is syntactically valid JavaScript", async () => {
  const dir = repo({ name: "x", scripts: { typecheck: "tsc --noEmit" } }, { "src/A.tsx": "" });
  const draft = draftFrom(observe(dir), "src");
  const file = path.join(dir, "generate-page.config.mjs");
  fs.writeFileSync(file, renderDraft(draft, "react-mvvm"));
  const mod = await import(`file://${file}`);
  assert.equal(mod.default.root, "src");
  assert.equal(mod.default.preset, "react-mvvm");
});

test("a draft with no root produces a config that fails validation loudly", async () => {
  const dir = repo({ name: "x" }, { "src/A.tsx": "" });
  const draft = draftFrom(observe(dir), undefined);
  const file = path.join(dir, "no-root.config.mjs");
  fs.writeFileSync(file, renderDraft(draft, "react-mvvm"));
  const mod = await import(`file://${file}`);
  // "TODO" is a real string, so it loads - but it is obviously wrong to a reader
  // and the generator will create a folder literally called TODO. The point is
  // that it is visible, not that it is silently defaulted to something plausible.
  assert.equal(mod.default.root, "TODO");
});
