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

/* ------------------------------------------------- framework detection */

test("the preset is read from the dependency list", async () => {
  const { detectFramework } = await import("../src/init.js");
  const cases: [Record<string, string>, string][] = [
    [{ next: "15.0.0", react: "19.0.0" }, "next-app"],
    [{ "@remix-run/react": "2.0.0", react: "19.0.0" }, "remix"],
    [{ "@react-router/dev": "7.0.0", react: "19.0.0" }, "remix"],
    [{ vue: "3.5.0" }, "vue"],
    [{ nuxt: "3.0.0", vue: "3.5.0" }, "vue"],
    [{ react: "19.0.0" }, "react-mvvm"],
  ];
  for (const [dependencies, expected] of cases) {
    const dir = repo({ name: "x", dependencies }, { "src/A.tsx": "" });
    const guess = detectFramework(observe(dir), dir);
    assert.equal(guess?.preset, expected, `${JSON.stringify(dependencies)}`);
    assert.match(guess!.evidence, /package\.json|,/);
  }
});

test("a framework in devDependencies counts too", async () => {
  const { detectFramework } = await import("../src/init.js");
  const dir = repo({ name: "x", devDependencies: { vue: "3.5.0" } }, { "src/A.tsx": "" });
  assert.equal(detectFramework(observe(dir), dir)?.preset, "vue");
});

test("react alone does not outrank the framework that depends on it", async () => {
  // Next depends on react, so a naive match would pick react-mvvm for a Next app
  // and generate MVVM folders into an app router project.
  const { detectFramework } = await import("../src/init.js");
  const dir = repo(
    { name: "x", dependencies: { next: "15.0.0", react: "19.0.0", "react-dom": "19.0.0" } },
    { "app/page.tsx": "" }
  );
  assert.equal(detectFramework(observe(dir), dir)?.preset, "next-app");
});

test("no framework package at all yields no guess", async () => {
  const { detectFramework } = await import("../src/init.js");
  const dir = repo({ name: "x" }, { "src/A.ts": "" });
  assert.equal(detectFramework(observe(dir), dir), undefined);
});

test("two frameworks are flagged as ambiguous rather than resolved quietly", async () => {
  const { detectFramework } = await import("../src/init.js");
  const dir = repo({ name: "x", dependencies: { next: "15.0.0", vue: "3.5.0" } }, { "src/A.tsx": "" });
  const guess = detectFramework(observe(dir), dir);
  assert.deepEqual(guess?.ambiguous, ["next-app", "vue"]);
  const draft = draftFrom(observe(dir), "src", guess, guess!.preset);
  assert.ok(draft.notes.some((n) => /more than one framework/.test(n) && /TODO/.test(n)));
});

test("the next-app root is read, because app/ and src/app both exist in the wild", async () => {
  const { detectFramework, presetRootFor } = await import("../src/init.js");
  const atRoot = repo({ name: "x", dependencies: { next: "15.0.0" } }, { "app/page.tsx": "" });
  assert.equal(detectFramework(observe(atRoot), atRoot)?.root, ".");

  const underSrc = repo({ name: "x", dependencies: { next: "15.0.0" } }, { "src/app/page.tsx": "" });
  assert.equal(detectFramework(observe(underSrc), underSrc)?.root, "src");

  // Only next-app needs this; the others' roots do not interact with their dirs.
  assert.equal(presetRootFor("vue", underSrc), undefined);
  assert.equal(presetRootFor("react-mvvm", atRoot), undefined);
});

test("a detected preset is named in the draft, with its evidence", async () => {
  const { detectFramework } = await import("../src/init.js");
  const dir = repo({ name: "x", dependencies: { vue: "3.5.0" } }, { "src/A.vue": "" });
  const observation = observe(dir);
  const guess = detectFramework(observation, dir);
  const rendered = renderDraft(draftFrom(observation, "src", guess, "vue"), "vue");
  assert.match(rendered, /preset: "vue"/);
  assert.match(rendered, /vue@3\.5\.0/);
});

/* ------------------------------------------- reading a harness config */

test("no fe-harness.config.json means nothing is said about the harness", async () => {
  const { readHarnessConfig } = await import("../src/init.js");
  const dir = repo({ name: "x" });
  assert.equal(readHarnessConfig(dir), undefined);
  assert.equal(observe(dir).harness, undefined);
});

test("a malformed harness config is ignored, not fatal", async () => {
  const { readHarnessConfig } = await import("../src/init.js");
  const dir = repo({ name: "x" }, { "fe-harness.config.json": "{ not json" });
  assert.equal(readHarnessConfig(dir), undefined);
  // init must still work on the rest of the repo.
  assert.doesNotThrow(() => observe(dir));
});

test("lintJson is translated to a scoped command, output flags dropped", async () => {
  const { readHarnessConfig } = await import("../src/init.js");
  const dir = repo(
    { name: "x" },
    {
      "fe-harness.config.json": JSON.stringify({
        commands: {
          lintJson:
            "npx eslint <TARGET> --report-unused-disable-directives --format json -o <OUT>",
        },
      }),
    }
  );
  const harness = readHarnessConfig(dir);
  // <TARGET> becomes our placeholder; the judgement flag survives; the reporter
  // and output file go, because a gate needs an exit code not a report.
  assert.equal(
    harness?.lintCommand,
    "npx eslint {{files}} --report-unused-disable-directives"
  );
});

test("--format=json and --output-file are dropped too", async () => {
  const { readHarnessConfig } = await import("../src/init.js");
  const dir = repo(
    { name: "x" },
    {
      "fe-harness.config.json": JSON.stringify({
        commands: { lintJson: "eslint <TARGET> --format=json --output-file=<OUT> --max-warnings 0" },
      }),
    }
  );
  assert.equal(readHarnessConfig(dir)?.lintCommand, "eslint {{files}} --max-warnings 0");
});

test("a lint command with no <TARGET> is left untranslated rather than guessed", async () => {
  const { readHarnessConfig } = await import("../src/init.js");
  const dir = repo(
    { name: "x" },
    { "fe-harness.config.json": JSON.stringify({ commands: { lintJson: "eslint ." } }) }
  );
  assert.equal(readHarnessConfig(dir)?.lintCommand, undefined);
});

test("the typecheck command is derived from the declared tsconfig, appDir included", async () => {
  const { readHarnessConfig } = await import("../src/init.js");
  const plain = repo(
    { name: "x" },
    { "fe-harness.config.json": JSON.stringify({ project: { appDir: ".", appTsconfig: "tsconfig.json" } }) }
  );
  assert.equal(readHarnessConfig(plain)?.typecheckCommand, "tsc --noEmit -p tsconfig.json");

  const nested = repo(
    { name: "x" },
    {
      "fe-harness.config.json": JSON.stringify({
        project: { appDir: "apps/web", appTsconfig: "tsconfig.app.json" },
      }),
    }
  );
  assert.equal(
    readHarnessConfig(nested)?.typecheckCommand,
    "tsc --noEmit -p apps/web/tsconfig.app.json"
  );
});

test("law presets are reported as things this generator cannot run", async () => {
  const dir = repo(
    { name: "x", dependencies: { react: "19.0.0" } },
    {
      "src/A.tsx": "",
      "fe-harness.config.json": JSON.stringify({
        contract: { presets: ["toss", "a11y"] },
        commands: { lintJson: "eslint <TARGET> --format json -o <OUT>" },
      }),
    }
  );
  const observation = observe(dir);
  assert.deepEqual(observation.harness?.lawPresets, ["toss", "a11y"]);
  const draft = draftFrom(observation, "src");
  assert.ok(
    draft.notes.some((n) => /cannot run those/.test(n) && /toss, a11y/.test(n)),
    "the draft must say the law presets are not covered here"
  );
});

test("the harness's tsconfig wins over a duplicate typecheck script", async () => {
  const dir = repo(
    { name: "x", scripts: { typecheck: "tsc --noEmit" } },
    {
      "src/A.tsx": "",
      "fe-harness.config.json": JSON.stringify({
        project: { appDir: ".", appTsconfig: "tsconfig.json" },
      }),
    }
  );
  const draft = draftFrom(observe(dir), "src");
  // Adding both would typecheck twice on every generate.
  assert.deepEqual(draft.verifyCommands, ["tsc --noEmit -p tsconfig.json"]);
  assert.ok(draft.notes.some((n) => /script was skipped/.test(n)));
});

test("a testFile command is noted but deliberately not adopted", async () => {
  const dir = repo(
    { name: "x" },
    {
      "src/A.tsx": "",
      "fe-harness.config.json": JSON.stringify({ commands: { testFile: "vitest run <PATH>" } }),
    }
  );
  const draft = draftFrom(observe(dir), "src");
  assert.ok(!draft.verifyCommands.some((c) => /vitest/.test(c)));
  assert.ok(draft.notes.some((n) => /testFile exists but was not adopted/.test(n)));
});
