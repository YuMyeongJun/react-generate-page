/**
 * End-to-end tests. These spawn the compiled CLI with piped stdio, so every one
 * of them runs in exactly the non-interactive condition that 0.1.37 could not
 * handle at all.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "generate-page.js");

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  all: string;
}

function run(args: string[], cwd: string, input = ""): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    input,
    encoding: "utf-8",
    // stdin is a pipe, never a TTY.
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { status: result.status, stdout, stderr, all: stdout + stderr };
}

const project = (files: Record<string, string> = {}): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rgp-cli-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture", version: "1.0.0" })
  );
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
};

const tree = (dir: string): string[] => {
  const found: string[] = [];
  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next);
      else found.push(next);
    }
  };
  walk("");
  return found.filter((f) => f !== "package.json").sort();
};

/* ---------------------------------------------------------------- basics */

test("--help exits 0 and describes the commands", () => {
  const r = run(["--help"], project());
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--dry-run/);
  assert.match(r.stdout, /init/);
});

test("--version prints the package version", () => {
  const r = run(["--version"], project());
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test("an unknown option is refused instead of ignored", () => {
  // --dryrun silently ignored would write files while the user believed they
  // were previewing them.
  const dir = project();
  const r = run(["a/b", "Thing", "--dryrun"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /unknown option/);
  assert.deepEqual(tree(dir), []);
});

test("too many positional arguments are refused", () => {
  const r = run(["a", "B", "c"], project());
  assert.notEqual(r.status, 0);
  assert.match(r.all, /at most 2 positional/);
});

/* -------------------------------------------------- bug 1: CLI arguments */

test("positional arguments are actually used (0.1.37 ignored them)", () => {
  // 0.1.37 guarded on `process.argv.length < 2`, which is never true, then
  // overwrote its own parameters with prompt results. The documented
  // command-line mode prompted anyway and never used the arguments.
  const dir = project();
  const r = run(["test/path", "TestPage", "--yes"], dir);
  assert.equal(r.status, 0, r.all);
  assert.deepEqual(tree(dir), [
    "src/components/pages/test/index.ts",
    "src/components/pages/test/path/TestPageComponent.tsx",
    "src/components/pages/test/path/TestPageViewModel.tsx",
    "src/components/pages/test/path/index.ts",
    "src/pages/test/index.ts",
    "src/pages/test/path/TestPagePage.tsx",
    "src/pages/test/path/index.ts",
  ]);
});

test("a lowercase name is PascalCased in file names", () => {
  const dir = project();
  assert.equal(run(["admin/user", "user-list", "--yes"], dir).status, 0);
  assert.ok(
    fs.existsSync(path.join(dir, "src/components/pages/admin/user/UserListComponent.tsx"))
  );
});

test("a config flag can be set from the command line", () => {
  const dir = project();
  assert.equal(run(["a/b", "Thing", "--searchCondition", "--yes"], dir).status, 0);
  assert.ok(fs.existsSync(path.join(dir, "src/components/pages/a/b/ThingCondition.tsx")));

  const off = project();
  assert.equal(run(["a/b", "Thing", "--no-searchCondition", "--yes"], off).status, 0);
  assert.ok(!fs.existsSync(path.join(off, "src/components/pages/a/b/ThingCondition.tsx")));
});

test("a flag the config never declared is refused, with the real list", () => {
  const dir = project();
  const r = run(["a/b", "Thing", "--nonsense", "--yes"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /--searchCondition/);
  assert.deepEqual(tree(dir), []);
});

/* ----------------------------------------- bug 3: non-interactive stdin */

test("a non-interactive run with missing answers fails loudly", () => {
  // 0.1.37's readline handling made this exit 0 having written nothing at all.
  const dir = project();
  const r = run([], dir, "a/b\nThing\nn\nn\nn\nn\n");
  assert.notEqual(r.status, 0, "must not report success");
  assert.match(r.all, /not a terminal/);
  assert.match(r.all, /--yes/);
  assert.deepEqual(tree(dir), []);
});

test("answering only some questions non-interactively fails loudly too", () => {
  // Taking the defaults for the rest would be a silent guess about what the
  // user wanted generated.
  const dir = project();
  const r = run(["a/b", "Thing", "--searchCondition"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /not a terminal/);
  assert.deepEqual(tree(dir), []);
});

/* ------------------------------------------------------------- --dry-run */

test("--dry-run lists every file and writes none of them", () => {
  const dir = project();
  const r = run(["test/path", "TestPage", "--searchCondition", "--yes", "--dry-run"], dir);
  assert.equal(r.status, 0, r.all);
  assert.match(r.stdout, /src\/components\/pages\/test\/path\/TestPageComponent\.tsx/);
  assert.match(r.stdout, /src\/components\/pages\/test\/path\/TestPageCondition\.tsx/);
  assert.match(r.stdout, /src\/pages\/test\/path\/TestPagePage\.tsx/);
  assert.deepEqual(tree(dir), [], "--dry-run must not touch the disk");
});

test("--dry-run says so when a real run would hit a conflict", () => {
  const dir = project();
  assert.equal(run(["a/b", "Thing", "--yes"], dir).status, 0);
  const r = run(["a/b", "Thing", "--yes", "--dry-run"], dir);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /CONFLICT/);
  assert.match(r.stdout, /already exist/);
});

test("--dry-run reports that nothing would be checked when no commands are set", () => {
  const r = run(["a/b", "Thing", "--yes", "--dry-run"], project());
  assert.match(r.stdout, /No verify\.commands configured/);
});

/* --------------------------------------------- bug 2: never overwrite */

test("a re-run refuses to overwrite and leaves the existing file untouched", () => {
  // 0.1.37 called writeFileSync unconditionally, so a second run silently
  // destroyed hand-written component code.
  const dir = project();
  assert.equal(run(["a/b", "Thing", "--yes"], dir).status, 0);

  const target = path.join(dir, "src/components/pages/a/b/ThingComponent.tsx");
  const mine = "// my real component\nexport const ThingComponent = () => <main />;\n";
  fs.writeFileSync(target, mine);

  const r = run(["a/b", "Thing", "--yes"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /Refusing to generate/);
  assert.match(r.all, /ThingComponent\.tsx/);
  assert.equal(fs.readFileSync(target, "utf-8"), mine, "my code must survive");
});

test("the conflict report is complete before anything is written", () => {
  const dir = project();
  assert.equal(run(["a/b", "Thing", "--yes"], dir).status, 0);
  const r = run(["a/b", "Thing", "--yes"], dir);
  // Every generated file collides, and all of them are named.
  for (const name of ["ThingComponent.tsx", "ThingViewModel.tsx", "ThingPage.tsx"]) {
    assert.match(r.all, new RegExp(name.replace(".", "\\.")));
  }
  assert.match(r.all, /Nothing was written/);
});

test("--force overwrites when the user says so", () => {
  const dir = project();
  assert.equal(run(["a/b", "Thing", "--yes"], dir).status, 0);
  const target = path.join(dir, "src/components/pages/a/b/ThingComponent.tsx");
  fs.writeFileSync(target, "// mine\n");
  assert.equal(run(["a/b", "Thing", "--yes", "--force"], dir).status, 0);
  assert.notEqual(fs.readFileSync(target, "utf-8"), "// mine\n");
});

test("an existing barrel gains an export rather than being replaced", () => {
  const dir = project();
  assert.equal(run(["shop/cart", "Cart", "--yes"], dir).status, 0);
  const barrel = path.join(dir, "src/pages/shop/index.ts");
  assert.equal(fs.readFileSync(barrel, "utf-8"), "export * from './cart';\n");

  assert.equal(run(["shop/orders", "Orders", "--yes"], dir).status, 0);
  const after = fs.readFileSync(barrel, "utf-8");
  assert.match(after, /export \* from '\.\/cart';/);
  assert.match(after, /export \* from '\.\/orders';/);
});

test("a barrel export is not duplicated, and a substring name is not mistaken for it", () => {
  // 0.1.37 tested `content.includes(childDir)`, so a child named "detail"
  // counted as already exported when the barrel only mentioned "detailView" -
  // and the real export was never added, leaving the page unimportable.
  const dir = project();
  fs.mkdirSync(path.join(dir, "src/pages/user"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "src/pages/user/index.ts"),
    "export * from './detailView';\n"
  );

  assert.equal(run(["user/detail/edit", "Edit", "--yes"], dir).status, 0);
  const barrel = fs.readFileSync(path.join(dir, "src/pages/user/index.ts"), "utf-8");
  assert.match(barrel, /export \* from '\.\/detailView';/, "existing export kept");
  assert.match(barrel, /export \* from '\.\/detail';/, "new export added");

  // Running again adds nothing: the export is already there, matched as a whole
  // statement rather than as a substring.
  assert.equal(run(["user/detail/other", "Other", "--yes"], dir).status, 0);
  const after = fs.readFileSync(path.join(dir, "src/pages/user/index.ts"), "utf-8");
  assert.equal(after.match(/export \* from '\.\/detail';/g)?.length, 1);
});

/* -------------------------------------------------------- path safety */

test("a page path that would escape the project is refused", () => {
  const dir = project();
  const r = run(["../../escape", "Thing", "--yes"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /outside the project/);
  assert.deepEqual(tree(dir), []);
});

test("a page path that would reach a shell is refused", () => {
  const dir = project();
  const r = run(["a;touch pwned", "Thing", "--yes"], dir);
  assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, "pwned")));
});

/* ------------------------------------------------------------ config */

test("a config file redirects where files are written", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({
      root: "app",
      flags: [],
      targets: [
        {
          id: "screen",
          dir: "screens/{{path}}",
          files: [
            { name: "{{Name}}.tsx", template: "export const {{Name}} = () => null;\n" },
            { name: "index.ts", template: "export * from './{{Name}}';\n" },
          ],
        },
      ],
    }),
  });
  const r = run(["billing", "Invoice"], dir);
  assert.equal(r.status, 0, r.all);
  assert.deepEqual(tree(dir).filter((f) => f !== "generate-page.config.json"), [
    "app/screens/billing/Invoice.tsx",
    "app/screens/billing/index.ts",
  ]);
  assert.equal(
    fs.readFileSync(path.join(dir, "app/screens/billing/Invoice.tsx"), "utf-8"),
    "export const Invoice = () => null;\n"
  );
});

test("a config typo is reported before any file is written", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({
      flags: [],
      targets: [{ id: "t", dir: "d/{{path}}", files: [{ name: "f.ts", template: "{{Nmae}}" }] }],
    }),
  });
  const r = run(["a", "Thing"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /unknown token \{\{Nmae\}\}/);
  assert.deepEqual(tree(dir).filter((f) => f !== "generate-page.config.json"), []);
});

test("--preset overrides the config file's preset", () => {
  const r = run(["a/b", "Thing", "--yes", "--preset", "react-mvvm", "--dry-run"], project());
  assert.equal(r.status, 0, r.all);
});

test("an unknown --preset lists the available ones", () => {
  const r = run(["a/b", "Thing", "--yes", "--preset", "nope"], project());
  assert.notEqual(r.status, 0);
  assert.match(r.all, /unknown preset "nope"/);
});

/* ------------------------------------------------------------ verify */

test("a red verify command reverts the generated files", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({
      verify: { commands: ["exit 3"] },
    }),
  });
  const r = run(["a/b", "Thing", "--yes"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /FAILED \(exit 3\)/);
  assert.match(r.all, /Fix the template, not the output/);
  assert.match(r.all, /Reverted/);
  assert.deepEqual(
    tree(dir).filter((f) => f !== "generate-page.config.json"),
    [],
    "a failed verification must leave the tree as it was found"
  );
});

test("--keep-on-fail leaves the files in place for inspection", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({ verify: { commands: ["exit 1"] } }),
  });
  const r = run(["a/b", "Thing", "--yes", "--keep-on-fail"], dir);
  assert.notEqual(r.status, 0);
  assert.ok(fs.existsSync(path.join(dir, "src/components/pages/a/b/ThingComponent.tsx")));
});

test("a green verify command is reported as green", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({ verify: { commands: ["exit 0"] } }),
  });
  const r = run(["a/b", "Thing", "--yes"], dir);
  assert.equal(r.status, 0, r.all);
  assert.match(r.stdout, /Green/);
});

test("verify commands receive the generated paths, not the whole repo", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({
      verify: { commands: ["echo CHECKED {{files}} > checked.txt"] },
    }),
  });
  assert.equal(run(["a/b", "Thing", "--yes"], dir).status, 0);
  const checked = fs.readFileSync(path.join(dir, "checked.txt"), "utf-8");
  assert.match(checked, /src\/components\/pages\/a\/b\/ThingComponent\.tsx/);
  assert.ok(!/package\.json/.test(checked), "scope is the new page only");
});

test("a fix command runs once and the check is repeated", () => {
  // The check fails until the marker exists; the fix command creates it.
  const dir = project({
    "generate-page.config.json": JSON.stringify({
      verify: {
        commands: ["test -f fixed.marker"],
        fixCommands: ["touch fixed.marker"],
      },
    }),
  });
  const r = run(["a/b", "Thing", "--yes"], dir);
  assert.equal(r.status, 0, r.all);
  assert.match(r.stdout, /after the repair round/);
  assert.ok(fs.existsSync(path.join(dir, "src/components/pages/a/b/ThingComponent.tsx")));
});

test("--no-fix skips the repair round", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({
      verify: {
        commands: ["test -f fixed.marker"],
        fixCommands: ["touch fixed.marker"],
      },
    }),
  });
  const r = run(["a/b", "Thing", "--yes", "--no-fix"], dir);
  assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(dir, "fixed.marker")));
});

test("--no-verify skips checking entirely", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({ verify: { commands: ["exit 1"] } }),
  });
  const r = run(["a/b", "Thing", "--yes", "--no-verify"], dir);
  assert.equal(r.status, 0, r.all);
  assert.match(r.stdout, /Skipped verification/);
  assert.ok(fs.existsSync(path.join(dir, "src/components/pages/a/b/ThingComponent.tsx")));
});

/* -------------------------------------------------------------- init */

test("init writes a draft that extends the default preset", () => {
  const dir = project({ "src/pages/home/HomeComponent.tsx": "export const x = 1;\n" });
  const r = run(["init"], dir);
  assert.equal(r.status, 0, r.all);
  const draft = fs.readFileSync(path.join(dir, "generate-page.config.mjs"), "utf-8");
  assert.match(draft, /preset: "react-mvvm"/);
  assert.match(draft, /root: "src"/);
  assert.match(draft, /TODO/);
});

test("init refuses to overwrite an existing config", () => {
  const dir = project({ "generate-page.config.mjs": "export default {};\n", "src/A.tsx": "" });
  const r = run(["init"], dir);
  assert.notEqual(r.status, 0);
  assert.match(r.all, /Refusing to overwrite/);
  assert.equal(fs.readFileSync(path.join(dir, "generate-page.config.mjs"), "utf-8"), "export default {};\n");
});

test("init --dry-run prints the draft without writing it", () => {
  const dir = project({ "src/A.tsx": "" });
  const r = run(["init", "--dry-run"], dir);
  assert.equal(r.status, 0, r.all);
  assert.match(r.stdout, /export default/);
  assert.ok(!fs.existsSync(path.join(dir, "generate-page.config.mjs")));
});

test("init reports the naming conventions it measured", () => {
  const dir = project({
    "src/a/OneComponent.tsx": "",
    "src/b/TwoComponent.tsx": "",
    "src/c/ThreeComponent.tsx": "",
  });
  const r = run(["init", "--dry-run"], dir);
  assert.match(r.stdout, /3 x \*Component/);
});

test("init leaves root as TODO in a workspace repo instead of guessing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rgp-ws-"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "root", workspaces: ["apps/*"] })
  );
  fs.mkdirSync(path.join(dir, "apps/web/src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "apps/web/src/App.tsx"), "");
  const r = run(["init", "--dry-run"], dir);
  assert.equal(r.status, 0, r.all);
  assert.match(r.stdout, /Not guessing a root/);
  assert.match(r.stdout, /root: "TODO"/);
});

test("init refuses to run outside a package", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rgp-bare-"));
  const r = run(["init"], dir);
  assert.notEqual(r.status, 0);
});

/* ------------------------------------------------------------- misc */

test("--cwd generates into another directory", () => {
  const target = project();
  const elsewhere = project();
  assert.equal(run(["a/b", "Thing", "--yes", "--cwd", target], elsewhere).status, 0);
  assert.ok(fs.existsSync(path.join(target, "src/components/pages/a/b/ThingComponent.tsx")));
  assert.deepEqual(tree(elsewhere), []);
});

/* ------------------------------------------- presets and introspection */

test("--list-presets describes every built-in preset", () => {
  const r = run(["--list-presets"], project());
  assert.equal(r.status, 0, r.all);
  for (const name of ["react-mvvm", "next-app", "remix", "vue"]) {
    assert.match(r.stdout, new RegExp(name));
  }
  assert.match(r.stdout, /\(default\)/);
});

test("--print-config prints the merged config to stdout and notes to stderr", () => {
  const dir = project({
    "generate-page.config.json": JSON.stringify({ root: "app" }),
  });
  const r = run(["--print-config"], dir);
  assert.equal(r.status, 0, r.all);
  // stdout must be pipeable into jq, so commentary belongs on stderr.
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.root, "app");
  assert.ok(parsed.targets.some((t: { id: string }) => t.id === "component"));
  assert.match(r.stderr, /config file/);
});

test("--print-config shows the preset merge when there is no config file", () => {
  const r = run(["--print-config", "--preset", "vue"], project());
  assert.equal(r.status, 0, r.all);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.root, "src");
  assert.match(r.stderr, /"vue" preset/);
});

test("the next-app root is read from the repo, not defaulted to src", () => {
  // Shipping root:"src" and meeting a repo whose router is app/ at the top
  // produces src/app/..., a folder Next does not route.
  const atRoot = project({ "app/page.tsx": "export default function P(){return null}\n" });
  const r = run(["reports", "Sales", "--yes", "--preset", "next-app"], atRoot);
  assert.equal(r.status, 0, r.all);
  assert.ok(fs.existsSync(path.join(atRoot, "app/reports/page.tsx")));
  assert.ok(!fs.existsSync(path.join(atRoot, "src/app/reports/page.tsx")));
  assert.match(r.stdout, /because app\/ is at the repository root/);

  const underSrc = project({ "src/app/page.tsx": "export default function P(){return null}\n" });
  assert.equal(run(["reports", "Sales", "--yes", "--preset", "next-app"], underSrc).status, 0);
  assert.ok(fs.existsSync(path.join(underSrc, "src/app/reports/page.tsx")));
});

test("init on a Next repo drafts the next-app preset, not the default", () => {
  const dir = project({ "app/page.tsx": "" });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "n", version: "1.0.0", dependencies: { next: "15.0.0", react: "19.0.0" } })
  );
  const r = run(["init", "--dry-run"], dir);
  assert.equal(r.status, 0, r.all);
  assert.match(r.stdout, /next@15\.0\.0/);
  assert.match(r.stdout, /preset: "next-app"/);
  assert.match(r.stdout, /root: "\."/);
});

test("every preset generates something that is not empty and lands under root", () => {
  for (const preset of ["react-mvvm", "next-app", "remix", "vue"]) {
    const dir = project();
    const r = run(["a/b", "Thing", "--yes", "--preset", preset], dir);
    assert.equal(r.status, 0, `${preset}: ${r.all}`);
    const files = tree(dir);
    assert.ok(files.length > 0, `${preset} generated nothing`);
    for (const f of files) {
      assert.ok(!/\{\{/.test(f), `${preset}: unresolved token in ${f}`);
      const body = fs.readFileSync(path.join(dir, f), "utf-8");
      assert.ok(!/\{\{\s*[A-Za-z0-9_]+\s*\}\}/.test(body), `${preset}: unresolved token inside ${f}`);
    }
  }
});
