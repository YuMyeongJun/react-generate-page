/**
 * `init` - read the repository and write a config draft.
 *
 * The wall for anyone installing this package is that the default preset encodes
 * one company's folder conventions, so the first run puts files in the wrong
 * place. Most of what a correct config needs is already observable in the repo.
 *
 * Three rules, borrowed from a harness that learned them the hard way:
 *
 * 1. Never invent. Fill in what was read; leave everything else as a `TODO:`.
 *    A guessed value looks confirmed, so the human skips past it and the
 *    generator writes into the wrong folder anyway.
 * 2. Never enumerate human-chosen names. Folder names like `pages`, `features`,
 *    `screens` are somebody's taste and any list of them goes stale. Show the
 *    candidates that actually contain code and let the human choose.
 * 3. Read package.json scripts only on an exact name match, and reject npm's
 *    `no test specified` placeholder - writing that in as a real command means
 *    the verify gate runs a command that always fails.
 */
import * as fs from "fs";
import * as path from "path";

import type { Prompter } from "./prompt.js";

const CODE_FILE = /\.(ts|tsx|js|jsx|vue|svelte)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".yarn",
]);
/** npm init -y writes a fake test script. Reading it as real breaks the gate. */
const NPM_PLACEHOLDER = /no test specified/;

export interface Observation {
  /** Directories at the repo top that actually contain code. */
  codeDirs: string[];
  /** True when package.json declares workspaces - source lives inside a package. */
  workspaces: boolean;
  packageManager: "yarn" | "npm";
  scripts: Record<string, string>;
  /** Recurring `*<Suffix>.tsx` naming, measured rather than assumed. */
  suffixes: { suffix: string; count: number; dirs: string[] }[];
  /** dependencies and devDependencies merged, for framework detection. */
  dependencies: Record<string, string>;
  /** Read from fe-harness.config.json when this repo already uses the harness. */
  harness?: HarnessConfig;
}

/** Which preset fits this repository, and what in the repo says so. */
export interface FrameworkGuess {
  preset: string;
  /** What was read. Shown to the human so the choice is checkable. */
  evidence: string;
  /** Root that puts the preset's target dirs in the right place, if readable. */
  root?: string;
  rootEvidence?: string;
  /** Set when two frameworks are present and neither is obviously the one. */
  ambiguous?: string[];
}

/**
 * Framework package names, most specific first.
 *
 * ⛔ Unlike folder names, these do not go stale: they are chosen by the
 * framework's publisher, not by whoever laid out this repository. That is the
 * same exception that lets us read package.json scripts, and it is why this
 * list is allowed to be a list at all.
 *
 * Order is significant. A Next app also depends on `react`, so `react` sits
 * last as the fallback rather than competing with the framework above it.
 */
const FRAMEWORK_PACKAGES: { pkg: string; preset: string }[] = [
  { pkg: "next", preset: "next-app" },
  { pkg: "@remix-run/react", preset: "remix" },
  { pkg: "@react-router/dev", preset: "remix" },
  { pkg: "nuxt", preset: "vue" },
  { pkg: "vue", preset: "vue" },
  { pkg: "react", preset: "react-mvvm" },
];

/** The fallback: present in every React project, so it proves nothing specific. */
const FALLBACK_PACKAGE = "react";

function hasCode(repo: string, dir: string, budget = 400): boolean {
  const stack = [dir];
  let seen = 0;
  while (stack.length > 0 && seen < budget) {
    const here = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(repo, here), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          stack.push(path.posix.join(here, entry.name));
        }
      } else if (CODE_FILE.test(entry.name)) {
        return true;
      }
    }
  }
  return false;
}

function walkFiles(repo: string, dir: string, budget = 5000): string[] {
  const found: string[] = [];
  const stack = [dir];
  let seen = 0;
  while (stack.length > 0 && seen < budget) {
    const here = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(repo, here), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      seen += 1;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          stack.push(path.posix.join(here, entry.name));
        }
      } else if (CODE_FILE.test(entry.name)) {
        found.push(path.posix.join(here, entry.name));
      }
    }
  }
  return found;
}

/** Split PascalCase into its words, so LoginComponent -> [Login, Component]. */
function camelWords(stem: string): string[] {
  return stem.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ").filter(Boolean);
}

/**
 * Measure recurring file-name suffixes.
 *
 * Derived from the repo's own files, so it does not depend on a list of names we
 * thought of in advance. Trailing *sequences* are counted, not just the last
 * word: "LoginViewModel" splits to [Login, View, Model], so counting only the
 * last word would report "Model" and miss the convention entirely.
 */
export function measureSuffixes(files: string[]): Observation["suffixes"] {
  const byS = new Map<string, { count: number; dirs: Set<string> }>();

  for (const file of files) {
    const base = path.posix.basename(file).replace(CODE_FILE, "");
    if (!/^[A-Z]/.test(base)) continue;
    const words = camelWords(base);
    // Every trailing sequence except the whole name - a file name is not a
    // suffix convention.
    for (let k = 1; k < words.length; k++) {
      const suffix = words.slice(words.length - k).join("");
      const entry = byS.get(suffix) ?? { count: 0, dirs: new Set<string>() };
      entry.count += 1;
      entry.dirs.add(path.posix.dirname(file));
      byS.set(suffix, entry);
    }
  }

  const seen = [...byS.entries()].filter(([, v]) => v.count >= 2);
  // Prefer the longest form: if "ViewModel" and "Model" occur equally often,
  // the convention is "ViewModel" and "Model" is an artefact of the split.
  const kept = seen.filter(
    ([suffix, v]) =>
      !seen.some(
        ([other, ov]) =>
          other !== suffix && other.endsWith(suffix) && ov.count === v.count
      )
  );

  return kept
    .map(([suffix, v]) => ({
      suffix,
      count: v.count,
      dirs: [...v.dirs].sort().slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count || a.suffix.localeCompare(b.suffix))
    .slice(0, 8);
}

/**
 * What a repository already using universe-harness tells us.
 *
 * `fe-harness.config.json` is the file that lands in a *consuming* repo, and it
 * already answers the question this generator's `verify` needs answered: what
 * does "passing" mean here. Reading it means the answer is written down once
 * rather than twice.
 *
 * Its command strings use a different placeholder syntax (`<TARGET>`, `<OUT>`,
 * `<PATH>`) and are shaped for a harness that needs machine-readable output. We
 * only need an exit code, so the translation below has one rule: keep the flags
 * that change the *judgement*, drop the ones that only change the *output*.
 * Anything that cannot be translated under that rule is left as a note, not
 * guessed at.
 */
export interface HarnessConfig {
  /** Scoped lint command, translated. Absent when it could not be scoped. */
  lintCommand?: string;
  /** Project-wide typecheck, derived from the declared tsconfig. */
  typecheckCommand?: string;
  /** Law presets the harness enforces. This generator cannot run these. */
  lawPresets: string[];
  /** Whether a per-file test command exists, which we deliberately do not adopt. */
  hasTestFile: boolean;
}

/** Flags that shape output rather than judgement, so they are dropped. */
const OUTPUT_ONLY_FLAGS = [
  /\s--format[= ]\S+/g,
  /\s(?:-o|--output-file)[= ]\S+/g,
];

export function readHarnessConfig(repo: string): HarnessConfig | undefined {
  const file = path.join(repo, "fe-harness.config.json");
  if (!fs.existsSync(file)) {
    return undefined;
  }
  let raw: Record<string, any>;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    // A harness config we cannot parse is not a reason to fail init; it is a
    // reason to say nothing about it.
    return undefined;
  }

  const commands = (raw.commands ?? {}) as Record<string, string>;
  const project = (raw.project ?? {}) as Record<string, string>;
  const result: HarnessConfig = {
    lawPresets: Array.isArray(raw.contract?.presets) ? raw.contract.presets : [],
    hasTestFile: typeof commands.testFile === "string",
  };

  const lintJson = commands.lintJson;
  if (typeof lintJson === "string" && lintJson.includes("<TARGET>")) {
    let translated = lintJson;
    for (const pattern of OUTPUT_ONLY_FLAGS) {
      translated = translated.replace(pattern, "");
    }
    result.lintCommand = translated.split("<TARGET>").join("{{files}}").trim();
  }

  const tsconfig = project.appTsconfig;
  if (typeof tsconfig === "string" && tsconfig.trim() !== "") {
    const appDir = project.appDir && project.appDir !== "." ? project.appDir : "";
    const configPath = appDir ? `${appDir}/${tsconfig}` : tsconfig;
    // -p takes a project, so this is unavoidably whole-project. Said out loud
    // in the notes rather than presented as a scoped check.
    result.typecheckCommand = `tsc --noEmit -p ${configPath}`;
  }

  return result;
}

export function observe(repo: string): Observation {
  const pkgPath = path.join(repo, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `No package.json in ${repo}. Run init from the root of your project.`
    );
  }
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch (error) {
    throw new Error(`${pkgPath} is not valid JSON: ${(error as Error).message}`);
  }

  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const topDirs = fs
    .readdirSync(repo, { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)
    )
    .map((e) => e.name);

  const codeDirs = topDirs.filter((dir) => hasCode(repo, dir));
  const workspaces = Boolean(pkg.workspaces);

  const files = codeDirs.flatMap((dir) => walkFiles(repo, dir));

  return {
    codeDirs,
    workspaces,
    packageManager: String(pkg.packageManager ?? "").startsWith("yarn")
      ? "yarn"
      : "npm",
    scripts,
    suffixes: measureSuffixes(files),
    dependencies: {
      ...((pkg.devDependencies ?? {}) as Record<string, string>),
      ...((pkg.dependencies ?? {}) as Record<string, string>),
    },
    harness: readHarnessConfig(repo),
  };
}

/**
 * Where the app router actually lives.
 *
 * The next-app preset writes into `app/{{path}}`, so `root` has to be the
 * directory *containing* `app`. Both `src/app` and `app` are in the wild, and
 * getting it wrong produces `app/app/...`. Read it rather than assume it.
 */
export function nextAppRoot(repo: string): { root: string; evidence: string } | undefined {
  if (fs.existsSync(path.join(repo, "src", "app"))) {
    return { root: "src", evidence: "src/app/ exists" };
  }
  if (fs.existsSync(path.join(repo, "app"))) {
    // "." keeps the preset's own `app/{{path}}` correct.
    return { root: ".", evidence: "app/ is at the repository root" };
  }
  return undefined;
}

/**
 * Adjust a preset's `root` to what this repository actually looks like.
 *
 * Only next-app needs it: its target dir is `app/{{path}}`, so `root` must be
 * the directory *containing* `app`. Shipping `root: "src"` and meeting a repo
 * whose router is `app/` at the top produces `src/app/...` - a folder Next does
 * not route, which is the wrong-folder failure this package exists to stop.
 */
export function presetRootFor(
  presetName: string,
  repo: string
): { root: string; evidence: string } | undefined {
  return presetName === "next-app" ? nextAppRoot(repo) : undefined;
}

export function detectFramework(
  observation: Observation,
  repo: string
): FrameworkGuess | undefined {
  const matched = FRAMEWORK_PACKAGES.filter(
    (entry) => entry.pkg in observation.dependencies
  );
  if (matched.length === 0) {
    return undefined;
  }

  const specific = matched.filter((entry) => entry.pkg !== FALLBACK_PACKAGE);
  const distinct = [...new Set(specific.map((entry) => entry.preset))];

  // Two different frameworks in one package.json. Picking one silently would be
  // the guess this whole command exists to avoid.
  if (distinct.length > 1) {
    return {
      preset: distinct[0],
      evidence: specific
        .map((e) => `${e.pkg}@${observation.dependencies[e.pkg]}`)
        .join(", "),
      ambiguous: distinct,
    };
  }

  const chosen = specific[0] ?? matched[matched.length - 1];
  const guess: FrameworkGuess = {
    preset: chosen.preset,
    evidence: `${chosen.pkg}@${observation.dependencies[chosen.pkg]} in package.json`,
  };

  if (chosen.preset === "next-app") {
    const resolved = nextAppRoot(repo);
    if (resolved) {
      guess.root = resolved.root;
      guess.rootEvidence = resolved.evidence;
    }
  }
  return guess;
}

/** Only an exact script name counts. A near-miss runs the wrong thing. */
export function scriptCommand(
  observation: Observation,
  names: string[]
): string | undefined {
  const found = names.find(
    (n) =>
      typeof observation.scripts[n] === "string" &&
      observation.scripts[n].trim() !== "" &&
      !NPM_PLACEHOLDER.test(observation.scripts[n])
  );
  if (!found) return undefined;
  return observation.packageManager === "yarn"
    ? `yarn ${found}`
    : `npm run ${found}`;
}

export interface Draft {
  root: string | undefined;
  verifyCommands: string[];
  notes: string[];
}

export function draftFrom(
  observation: Observation,
  root: string | undefined,
  framework?: FrameworkGuess,
  presetName = "react-mvvm"
): Draft {
  const notes: string[] = [];
  const verifyCommands: string[] = [];

  if (!framework) {
    notes.push(
      `preset: no framework package found in package.json, so "${presetName}" was ` +
        "used as the fallback. TODO: confirm it matches your conventions."
    );
  } else if (framework.ambiguous) {
    notes.push(
      `preset: found ${framework.evidence} - that is more than one framework, so ` +
        `"${presetName}" is a pick, not a reading. TODO: confirm it.`
    );
  } else {
    notes.push(`preset: "${presetName}", from ${framework.evidence}.`);
  }
  if (framework?.rootEvidence) {
    notes.push(`root: "${framework.root}", because ${framework.rootEvidence}.`);
  }

  const harness = observation.harness;
  if (harness) {
    notes.push(
      "harness: this repo has fe-harness.config.json, so what \"passing\" means " +
        "is already written down there. The commands below were translated from " +
        "it, keeping the flags that change the judgement and dropping the ones " +
        "that only change the output."
    );
    if (harness.lintCommand) {
      verifyCommands.push(harness.lintCommand);
      notes.push(
        `  lint: translated from commands.lintJson, scoped to the generated ` +
          "files via <TARGET>. The JSON reporter was dropped - a gate needs an " +
          "exit code, not a report."
      );
    } else {
      notes.push(
        "  lint: commands.lintJson has no <TARGET>, so it could not be scoped. " +
          "TODO: write a scoped lint command by hand."
      );
    }
    if (harness.typecheckCommand) {
      verifyCommands.push(harness.typecheckCommand);
      notes.push(
        `  typecheck: derived from project.appTsconfig. tsc -p takes a project, ` +
          "so this is whole-project, not just the new page."
      );
    }
    if (harness.hasTestFile) {
      notes.push(
        "  commands.testFile exists but was not adopted: a fresh page has no " +
          "tests yet, so running it would either find nothing or fail. TODO: add " +
          "it once your templates generate a test file."
      );
    }
    if (harness.lawPresets.length > 0) {
      notes.push(
        `  the harness also enforces law presets (${harness.lawPresets.join(", ")}). ` +
          "This generator cannot run those - they read the syntax tree, and it " +
          "only runs commands. Keep using the harness for them; this config covers " +
          "the compile-and-lint half."
      );
    }
  }

  const typecheck = scriptCommand(observation, ["typecheck", "type-check", "tsc"]);
  if (harness?.typecheckCommand) {
    // Already covered, and adding both would typecheck twice per run.
    if (typecheck) {
      notes.push(
        `verify: the "${typecheck}" script was skipped - the harness config ` +
          "already declares the tsconfig to check."
      );
    }
  } else if (typecheck) {
    // Scoping a package.json script to specific files is not generally possible,
    // so this one runs project-wide and we say so rather than pretending.
    verifyCommands.push(typecheck);
    notes.push(
      `verify: found the "${typecheck}" script. It checks the whole project, not just the new page.`
    );
  } else {
    notes.push(
      'verify: no typecheck script found. TODO: add one, e.g. "tsc --noEmit".'
    );
  }

  if (!harness?.lintCommand) {
    const lint = scriptCommand(observation, ["lint"]);
    if (lint) {
      notes.push(
        `verify: found the "${lint}" script, but it lints everything. A scoped ` +
          "check is better: TODO confirm `eslint {{files}}` works here."
      );
    } else {
      notes.push("verify: no lint script found. TODO: add one if you use eslint.");
    }
  }

  if (observation.workspaces) {
    notes.push(
      "root: package.json declares workspaces, so the top-level folders are " +
        "workspace containers, not source. TODO: point root at the app you " +
        "generate pages in."
    );
  }
  if (!root) {
    notes.push("root: TODO - not determined, fill this in.");
  }

  if (observation.suffixes.length > 0) {
    notes.push("Naming conventions measured in your repo:");
    for (const s of observation.suffixes) {
      notes.push(
        `  ${s.count} files end in "${s.suffix}", e.g. under ${s.dirs.slice(0, 2).join(", ")}`
      );
    }
    notes.push(
      `TODO: if these differ from the "${presetName}" preset, override \`targets\` below.`
    );
  } else {
    notes.push(
      "No recurring file-name suffix found, so no target layout could be read " +
        `from the repo. TODO: check that the "${presetName}" targets match your ` +
        "conventions."
    );
  }

  return { root, verifyCommands, notes };
}

export function renderDraft(draft: Draft, presetName: string): string {
  const lines: string[] = [
    "// generate-page.config.mjs",
    "//",
    "// Drafted by `npx @mj_yu/react-generate-page init`, which read this",
    "// repository. Values it could not read are marked TODO and were left",
    "// unfilled on purpose - a guessed value reads as a confirmed one.",
    "//",
    "// What init observed:",
  ];
  for (const note of draft.notes) {
    lines.push(`//   ${note}`);
  }
  lines.push(
    "//",
    "// Run `npx @mj_yu/react-generate-page --dry-run <path> <Name>` to see what",
    "// this config would produce before it writes anything.",
    "",
    "export default {",
    `  preset: ${JSON.stringify(presetName)},`
  );

  if (draft.root) {
    lines.push(`  root: ${JSON.stringify(draft.root)},`);
  } else {
    lines.push(
      '  // TODO: root was not determined. Set it, e.g. root: "src".',
      '  root: "TODO",'
    );
  }

  lines.push(
    "",
    "  verify: {",
    "    // Commands run from the project root with ./node_modules/.bin on PATH.",
    "    // {{files}} and {{dirs}} expand to the paths just generated."
  );
  if (draft.verifyCommands.length > 0) {
    lines.push("    commands: [");
    for (const command of draft.verifyCommands) {
      lines.push(`      ${JSON.stringify(command)},`);
    }
    lines.push("    ],");
  } else {
    lines.push(
      "    // TODO: nothing readable was found. Add the command that proves a",
      "    // generated page compiles in this repo, e.g. \"tsc --noEmit\".",
      "    commands: [],"
    );
  }
  lines.push(
    "    // Commands that repair, run once before re-checking.",
    "    fixCommands: [],",
    "  },",
    "};",
    ""
  );
  return lines.join("\n");
}
