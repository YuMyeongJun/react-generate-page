# Changelog

## 0.2.0

The generator was hardcoded to one team's folder conventions, so installing it
anywhere else created the wrong folders. It now reads its layout from a config
file, checks that what it generated actually compiles, and has a test suite in
front of publishing.

**Existing behaviour is the default.** With no config file you get the
`react-mvvm` preset, whose output is compared byte for byte against fixtures
captured from 0.1.37 — including two cosmetic quirks of that release, preserved
deliberately so nobody's files churn.

### Added

- **Config file** — `generate-page.config.{json,mjs,js,cjs,ts}` defines folders,
  file names, template bodies and the questions asked. Unknown tokens,
  undeclared flags and bad `when:` clauses are rejected when the config loads,
  before anything is written.
- **`--dry-run`** — prints the plan exactly and writes nothing. Exact rather than
  an estimate, because planning is a pure function of config and answers.
- **Output verification** — `verify.commands` runs your own toolchain against
  only the generated paths, with `./node_modules/.bin` on `PATH`. A red result
  reverts the files and the message points at the *template*, since every page
  from that template carries the same defect. `verify.fixCommands` are yours to
  declare: there is no model in this package, so "self-fix" means running the
  repair tooling your repo already has, then re-checking once.
- **`init`** — reads `package.json` and measures recurring file-name suffixes in
  your source, then drafts a config. It picks the preset from your dependencies
  (`next` → `next-app`, `@remix-run/react` / `@react-router/dev` → `remix`,
  `vue` / `nuxt` → `vue`, `react` → `react-mvvm`), reads the `next-app` root
  instead of assuming it, flags two frameworks as ambiguous, and leaves anything
  it could not read as `TODO:` rather than filling in something plausible.
- **Presets** — `next-app`, `remix` and `vue` alongside the default
  `react-mvvm`. Each was generated into a project with that framework really
  installed and checked with that project's own type checker under `strict`,
  `noUnusedLocals` and `noUnusedParameters`, in every flag state.
- **`check <path>...`** — runs `verify.commands` against files that already
  exist, generating nothing. The gate could only ever run on files it had just
  written, so there was no way to point it at code you migrated or wrote by
  hand — which is the half that matters when moving a project onto React: the
  structure is generated, but the logic is carried over. `--base <ref>` checks
  what changed since a git ref, untracked files included.
  `check` does not edit your files unless `--fix` is passed: repairing
  generated code is fine, but these files are yours. Its failure message omits
  the "fix the template" advice, which would be wrong for code no template
  produced.
- **Reads `fe-harness.config.json`** — if the repo already uses
  universe-harness, `init` translates its commands into `verify`, under one
  rule: keep the flags that change the judgement, drop the ones that only
  change the output. `commands.lintJson`'s `<TARGET>` becomes `{{files}}` and
  its JSON reporter is dropped, because a gate needs an exit code, not a
  report. The draft also records what this generator *cannot* cover — the
  harness's law presets read the syntax tree, and this only runs commands.
- **`--print-config`** — prints the effective config after the preset/file/root
  merge. Config to stdout, commentary to stderr, so it pipes into `jq`.
- **`--list-presets`** — the built-in presets with their target dirs and flags.
- **JSON Schema** at `schema/generate-page.config.schema.json` for editor
  completion.
- **`--force`, `--keep-on-fail`, `--no-verify`, `--no-fix`, `--cwd`,
  `--config`, `--preset`, `--out`.**
- A shebang on the published binary.

### Fixed

- **`<path> <Name>` arguments were ignored.** They were documented, but the guard
  on `process.argv.length < 2` is never true and the values were overwritten by
  the prompt results. Command-line mode always prompted.
- **Non-interactive runs silently did nothing.** A fresh `readline` interface was
  created and closed per question on the shared stdin; on a pipe the first
  `close()` ended the stream, so question two never resolved and the process
  exited `0` having written no files. Piped and scripted use now either works or
  fails loudly.
- **Existing files were overwritten.** Every generated file was written with an
  unconditional `writeFileSync`, so a re-run destroyed hand-edited components.
  Conflicts are now found across the whole plan before any write, and it is
  all-or-nothing: a half-generated page is worse than none, because you cannot
  tell by looking which half is yours. `--force` overrides.
- **Barrel exports were matched by substring.** `content.includes(childDir)`
  treated a child named `detail` as already exported when the barrel only
  mentioned `detailView`, so the real export was never added and the page was
  not importable. Whole export statements are matched now.
- **`toCamelCase` collapsed PascalCase input.** It split only on `-`, `_` and
  whitespace, so `InvoiceList` became `invoicelist`. It was dead code in 0.1.37
  — defined and never called — so no released output depended on it.
- Page paths are validated: no `..`, no leading slash, and no characters that
  could reach a shell through `verify.commands`.

### Changed

- **The interactive questions are asked in English.** Prompt wording only — the
  generated `Condition.tsx` keeps its original Korean strings, pinned by the
  parity tests. Override any `flags[].label` in your own config.
- `README.md` is English for npm; the Korean version is `README.ko.md`.
- `engines.node` is `>=18`, measured by a CI matrix on Node 18, 20 and 22.
- Publishing now depends on a passing test job. Releases were previously cut
  with no tests in front of them.
- The source is split into `src/` modules. The compiled entry stays at
  `dist/generate-page.js`, the path `bin` has always pointed at, so existing
  installs are unaffected.
- **Runtime dependencies remain zero.**

### Fixed in CI

- **`.yarnrc.yml` demanded `NODE_AUTH_TOKEN` on every yarn invocation.** It
  interpolated `${NODE_AUTH_TOKEN}` with no fallback, and yarn reads that file
  on every call - not just during install. So `yarn test`, `yarn typecheck` and
  `yarn build` all failed with "Environment variable not found" for anyone
  without a publish token. The first CI run proved it: four jobs, all red in
  12-17 seconds, none of them having reached a test. It now defaults to empty,
  so a fresh clone can run the suite; publishing still supplies the real token.
- The publish workflow sets the token once at job level instead of per step,
  which is what made a per-step omission fatal in the first place.
- `engines.node >= 18` is now measured rather than claimed: the full pipeline
  was run against real Node 18.20.8, 20.19.0 and 22.14.0 binaries - 181 tests
  pass on each, plus the build and bin checks.

### Notes

- `docs/overlap-with-universe-harness.md` records, with measurements, where this
  package and universe-harness's `bigbang` do the same job — five flags share a
  name and meaning, and both are zero-dependency. It is a proposal for
  discussion, not a decision.

- `generateModelIndex()` existed but was never called, so its
  `// Add model exports here` string was never emitted by any release. The
  optional `models/*` and `hooks/client` barrels are still created empty.

## 0.1.37 and earlier

See the git history.
