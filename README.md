# @mj_yu/react-generate-page

Generate a React page — component, view model, route entry, barrel exports — from
**your** folder conventions, then check that what came out actually compiles.

- **Zero runtime dependencies.** Installing this adds one package to your tree.
- **Config-driven.** Folder names, file names, file bodies and the questions it
  asks all come from a config file. Nothing is hardcoded to one team's layout.
- **It checks its own output.** The generated paths are handed to your `tsc` /
  `eslint` / test command. If that comes back red, the files do not survive.
- **It never overwrites your code.** If anything in the plan already exists,
  nothing is written and you are told what collided.

한국어 문서는 [README.ko.md](./README.ko.md).

## Install

```bash
npm install -D @mj_yu/react-generate-page
# or
yarn add -D @mj_yu/react-generate-page
```

Requires Node 18 or newer.

## Quick start

```bash
# 1. Read your repo and draft a config. Anything it cannot read is left as TODO.
npx @mj_yu/react-generate-page init

# 2. See what would be created. Nothing is written.
npx @mj_yu/react-generate-page --dry-run admin/user UserList

# 3. Create it.
npx @mj_yu/react-generate-page admin/user UserList
```

With no arguments it asks instead:

```bash
npx @mj_yu/react-generate-page
```

## Why this and not plop or hygen

Those are good tools and this does not try to out-feature them. Two things are
different.

**It verifies what it generated.** plop and hygen emit files and stop; whether
the result compiles is your problem, discovered later. Here, `verify.commands`
runs your own toolchain against just the new paths. A red result reverts the
files, and the error message points at the *template* — because every page
generated from that template will carry the same defect, so patching the output
by hand only hides it until the next run.

**It reads your repo instead of asking you to describe it.** `init` looks at your
`package.json` scripts and measures the file-naming conventions actually present
in your source, then writes a config draft. What it could not read it marks
`TODO:` rather than filling in something plausible — a guessed value reads as a
confirmed one, and you would skip past it.

And it stays small: no runtime dependencies, so it fits places where a heavier
generator does not.

## Commands

```
npx @mj_yu/react-generate-page [<path> <Name>] [options]
npx @mj_yu/react-generate-page init [options]
npx @mj_yu/react-generate-page check <path>... [options]
```

| Option | What |
|---|---|
| `--dry-run` | Print what would be created; write nothing |
| `-y`, `--yes` | Take the default answer for every question |
| `--<flag>` / `--no-<flag>` | Set a config flag, e.g. `--searchCondition` |
| `--preset <name>` | Use a built-in preset instead of the config's |
| `--config <file>` | Use this config file |
| `--cwd <dir>` | Treat this directory as the project root |
| `--out <file>` | (`init`) Write the draft here |
| `--force` | Overwrite existing files instead of stopping |
| `--base <ref>` | (`check`) check the files changed since this git ref |
| `--fix` | Run `verify.fixCommands` and re-check. Required for `check` |
| `--print-config` | Print the effective config (preset merge included) and exit |
| `--list-presets` | List the built-in presets and exit |
| `--no-verify` | Skip `verify.commands` |
| `--no-fix` | Do not run `verify.fixCommands` when a check fails |
| `--keep-on-fail` | Keep the generated files when verification fails |
| `-h`, `--help` / `-v`, `--version` | |

Passing `<path> <Name>` skips the prompts, so it works in scripts and CI. Add
`--yes` to accept the defaults for the remaining questions — without it, a
non-interactive run stops and tells you what is unanswered rather than guessing.

## Checking code you did not generate

The gate could only ever run on files it had just written, so there was no way
to point it at code you migrated or wrote by hand. `check` fixes that:

```bash
npx @mj_yu/react-generate-page check src/pages/admin
npx @mj_yu/react-generate-page check --base main      # what changed since main
```

It generates nothing and runs the same `verify.commands`. This is the useful
half when moving a project onto React: the *structure* is generated, but the
logic is carried over, and it is the carried-over part that breaks the house
rules.

`check` will not edit your files unless you pass `--fix`. Repairing generated
code is fine — it was ours a moment ago — but these files are yours, and editing
them because a check went red is a change nobody asked for. The failure message
differs for the same reason: for generated files it tells you to fix the
template, which would be the wrong advice here.

## Already using universe-harness?

If your repo has a `fe-harness.config.json`, `init` reads it: what "passing"
means is already written down there, and writing it twice invites the two copies
to disagree. Its command strings are translated under one rule — **keep the
flags that change the judgement, drop the ones that only change the output**:

```
commands.lintJson: npx eslint <TARGET> --report-unused-disable-directives --format json -o <OUT>
              ↓
verify.commands:   npx eslint {{files}} --report-unused-disable-directives
```

The draft also says what this generator *cannot* cover. The harness's law
presets read the syntax tree; this only runs commands, so those checks stay with
the harness. `init` writes that down rather than leaving you to discover it.

Where `bigbang` and this package overlap is written up, with measurements, in
[docs/overlap-with-universe-harness.md](./docs/overlap-with-universe-harness.md).
That document is a proposal, not a decision.

## Configuration

Drop a `generate-page.config.json`, `.mjs`, `.js`, `.cjs` or `.ts` in your project
root. `.mjs` is the most useful, because templates are multi-line and you get
comments.

> `.ts` is loaded by a plain dynamic `import`, which works only on Node 22.6+
> where type stripping is built in. There is no bundled TypeScript loader — that
> would mean a runtime dependency. Use `.mjs` if you are on an older Node.

```js
// generate-page.config.mjs
export default {
  preset: "react-mvvm",   // start from a built-in preset
  root: "src",            // source root, relative to the project

  vars: {
    // Extra template tokens. Values are themselves templated.
    componentsAlias: "@components/pages",
  },

  flags: [
    // Yes/no questions. The id is what templates and `when:` reference.
    { id: "searchCondition", label: "Does this screen need search filters?", default: false },
  ],

  targets: [
    {
      id: "component",
      dir: "components/pages/{{path}}",  // under `root`
      parentIndex: true,                 // wire up ancestor index.ts barrels
      files: [
        {
          name: "{{Name}}Component.tsx",
          template: "export const {{Name}}Component = () => <div />;\n",
        },
        {
          name: "{{Name}}Condition.tsx",
          when: "searchCondition",       // only when that flag is on
          templateFile: "./templates/condition.tsx.tpl",
        },
      ],
    },
  ],

  verify: {
    // Run from the project root, with ./node_modules/.bin on PATH.
    commands: ["tsc --noEmit {{files}}", "eslint {{files}}"],
    fixCommands: ["eslint --fix {{files}}"],  // tried once, then re-checked
    selfFix: true,
    revertOnFail: true,
  },
};
```

Top-level keys are shallow-merged over the preset; **arrays replace rather than
concatenate**, so providing `targets` replaces the preset's targets entirely.

### Template syntax

| | |
|---|---|
| `{{Name}}` | Page name, PascalCase |
| `{{name}}` | camelCase |
| `{{kebab}}` | kebab-case |
| `{{path}}` | The page path as given |
| `{{root}}` | The configured source root |
| `{{#if flag}}…{{/if}}` | Keep the body when the flag is on |
| `{{#unless flag}}…{{/unless}}` | The inverse |

Two rules worth knowing:

- **Whitespace is never trimmed.** Conditional bodies are spliced in verbatim,
  because the output is source code someone will read.
- **An unknown token is an error, not an empty string.** A typo is caught when
  the config loads, before anything is written — a generator that writes
  `{{Nmae}}` into your component and reports success has failed.

JSX's own double braces (`value={{ ... }}`) are left alone.

### Verify commands

`{{files}}` and `{{dirs}}` expand to the paths just generated, shell-quoted.
Scoping matters: a whole-repo lint that blames the new page for a pre-existing
error teaches people to ignore the gate.

`fixCommands` are yours to declare. There is no model in this package and no
dependency that could host one, so "self-fix" means running the repair tooling
your repo already has — `eslint --fix`, a formatter — after which `commands` is
re-run once. We do not infer which of your commands can repair.

The default config ships with `commands: []`, because we have not read your
repository and so do not know what passing means in it. `init` fills it in.

### Presets

`npx @mj_yu/react-generate-page --list-presets` prints these with their target
directories and flags.

| Name | What | Verified against |
|---|---|---|
| `react-mvvm` | **Default.** Component / ViewModel / Page / Condition plus `models/interfaces`, `models/types`, `hooks/client` | Fixtures captured from 0.1.37, compared byte for byte |
| `next-app` | Next.js app router — `page.tsx`, optional `loading.tsx` / `error.tsx` | Next 15 + React 19, real `tsc` |
| `remix` | Remix / React Router file routes with an optional loader | React Router 7 + React 19, real `tsc` |
| `vue` | Vue 3 SFC with an optional composable | Vue 3, real `vue-tsc` |

Every preset's output was generated into an actual project with that framework
installed and checked with that project's own type checker under `strict`,
`noUnusedLocals` and `noUnusedParameters` — in each flag state, on and off. All
clean. That bar matters because it is the same bar `verify.commands` holds your
generated code to; a template that cannot pass it ships a defect into every page
made from it.

What that does **not** cover: no `eslint` run with a real project config (those
vary too much to claim anything useful), and no runtime or rendering check. If
your house style differs, edit the templates — `--dry-run` first.

### `init` picks the preset for you

`init` reads `dependencies` and `devDependencies` to choose: `next` →
`next-app`, `@remix-run/react` or `@react-router/dev` → `remix`, `vue`/`nuxt` →
`vue`, and `react` alone → `react-mvvm`. Package names are chosen by the
framework's publisher rather than by whoever laid out your repo, so unlike folder
names they do not go stale — the same reason `package.json` scripts are safe to
read.

Two frameworks in one `package.json` is reported as ambiguous and marked `TODO`
rather than resolved quietly.

The `next-app` root is read rather than assumed, because both `app/` and
`src/app/` are common and guessing produces `src/app/...` in a repo that routes
`app/` — a directory Next ignores.

### Seeing what will actually run

What executes is a merge of a preset, your config file and a detected root, and
none of that is visible by default:

```console
$ npx @mj_yu/react-generate-page --print-config --preset next-app
# no config file; "next-app" preset
# root read from the repository: app/ is at the repository root
{
  "root": ".",
  ...
}
```

The config goes to stdout and the commentary to stderr, so it pipes into `jq`.

### Editor completion

A JSON Schema ships at `node_modules/@mj_yu/react-generate-page/schema/generate-page.config.schema.json`.
Point at it from a JSON config:

```json
{
  "$schema": "./node_modules/@mj_yu/react-generate-page/schema/generate-page.config.schema.json",
  "root": "src"
}
```

## Existing files are safe

If any file in the plan already exists, nothing is written:

```
Refusing to generate: 2 paths already exist.

  src/components/pages/admin/user/UserListComponent.tsx  (file exists)
  src/pages/admin/user/UserListPage.tsx                  (file exists)

Nothing was written. Delete or move these, or generate under a different
page path. Use --dry-run to see the full list of files first.
```

It is all-or-nothing on purpose: a half-generated page is worse than none,
because you cannot tell by looking which half is yours. `--force` overrides.

Barrel `index.ts` files are the exception — they gain an export line rather than
being replaced, and an export already present is not duplicated.

## Upgrading from 0.1.x

Existing behaviour is the default. With no config file you get the `react-mvvm`
preset, whose output is compared byte for byte against fixtures captured from
0.1.37 — including two cosmetic quirks of that release (`Component.tsx` starts
with a blank line; the no-search-condition variant leaves a line of six spaces),
which are preserved deliberately so nobody's files churn.

What changed on purpose:

- **`<path> <Name>` arguments now work.** They were documented but ignored: a
  guard on `process.argv.length < 2` was never true, and the values were
  overwritten by the prompts. Command-line mode always prompted.
- **Non-interactive runs no longer silently do nothing.** A fresh readline
  interface was created and closed per question on the shared stdin; on a pipe
  the first close ended the stream, so the second question never resolved and
  the process exited `0` having written nothing. Piped or scripted use now
  either works or fails loudly.
- **Existing files are no longer overwritten.** Every generated file was written
  with an unconditional `writeFileSync`, so a re-run destroyed hand-edited
  components. See above.
- **Barrel exports are matched as whole statements.** The old substring check
  (`content.includes(childDir)`) treated a child named `detail` as already
  exported when the barrel only mentioned `detailView`, so the real export was
  never added and the page was not importable.
- Page paths are validated: no `..`, no leading slash, no characters that would
  reach a shell through `verify.commands`.
- The interactive questions are now asked in English. This is **prompt wording
  only** — the generated `Condition.tsx` keeps its original Korean strings, and
  the parity tests pin that. Override any `flags[].label` in your own config.

`generateModelIndex()` existed in the source but was never called, so its
`// Add model exports here` string was never emitted by any release. The optional
`models/*` and `hooks/client` barrels are still created empty, as before.

## Development

```bash
yarn install
yarn typecheck
yarn test          # compiles to dist-test/ and runs node:test
yarn build         # emits dist/
```

Planning is pure — `buildPlan(config, answers)` returns the list of files and
their contents without touching the disk — which is what makes `--dry-run` exact
and the output testable as plain strings.

`tests/legacy-parity.test.ts` is the regression net for released behaviour. If it
goes red, generated code in somebody's repository is about to change; that is
occasionally the intent and never an acceptable accident.

## License

MIT
