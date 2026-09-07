/**
 * Command orchestration. The order here is the contract:
 *
 *   load config -> collect answers -> build plan -> check conflicts -> write
 *                                                -> verify -> revert if red
 *
 * Nothing touches the disk until the entire plan exists and is known to be
 * conflict-free, which is what makes --dry-run exact rather than an estimate.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { ArgError, HELP, parseArgs, type ParsedArgs } from "./args.js";
import { applyPlan, revert, type ApplyResult } from "./apply.js";
import { findConflicts, formatConflicts } from "./conflict.js";
import { ConfigError, loadConfig, validateConfig } from "./config/load.js";
import { DEFAULT_PRESET, PRESETS } from "./config/presets.js";
import { draftFrom, observe } from "./init.js";
import { renderDraft } from "./init.js";
import { buildPlan, PlanError } from "./plan.js";
import { createPrompter, isInteractive, NonInteractiveError } from "./prompt.js";
import { render, TemplateError } from "./template.js";
import { formatVerifyFailure, verifyPlan } from "./verify.js";
import type { Answers, Config, LoadedConfigLike } from "./cli-types.js";

const out = (message: string) => process.stdout.write(`${message}\n`);
const err = (message: string) => process.stderr.write(`${message}\n`);

function readVersion(): string {
  // dist/src/cli.js -> ../../package.json ; src/cli.ts -> ../package.json
  // fileURLToPath, not URL.pathname: the latter yields "/C:/..." on Windows.
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    path.join(here, "..", "package.json"),
    path.join(here, "..", "..", "package.json"),
  ]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8"));
      if (pkg.name === "@mj_yu/react-generate-page") {
        return String(pkg.version);
      }
    } catch {
      /* keep looking */
    }
  }
  return "unknown";
}

async function resolveConfig(args: ParsedArgs, cwd: string) {
  if (args.preset) {
    const preset = PRESETS[args.preset];
    if (!preset) {
      throw new ConfigError(
        `unknown preset "${args.preset}". Available: ${Object.keys(PRESETS).sort().join(", ")}`
      );
    }
    validateConfig(preset);
    return { config: preset, presetName: args.preset, file: undefined };
  }
  if (args.config) {
    const file = path.resolve(cwd, args.config);
    if (!fs.existsSync(file)) {
      throw new ConfigError(`config file not found: ${file}`);
    }
    return loadConfig(path.dirname(file));
  }
  return loadConfig(cwd);
}

async function collectAnswers(
  args: ParsedArgs,
  config: Config
): Promise<Answers> {
  const declared = new Set((config.flags ?? []).map((f) => f.id));
  for (const name of Object.keys(args.flagOverrides)) {
    if (!declared.has(name)) {
      throw new ArgError(
        `unknown option: --${name}. Flags declared by this config: ${
          [...declared].sort().map((f) => `--${f}`).join(", ") || "(none)"
        }`
      );
    }
  }

  let pagePath = args.positional[0];
  let pageName = args.positional[1];
  const flags: Record<string, boolean> = { ...args.flagOverrides };

  const needsPrompting =
    pagePath === undefined ||
    pageName === undefined ||
    (!args.yes &&
      (config.flags ?? []).some((f) => !(f.id in flags)));

  if (!needsPrompting) {
    for (const flag of config.flags ?? []) {
      if (!(flag.id in flags)) {
        flags[flag.id] = flag.default ?? false;
      }
    }
    return { pagePath, pageName, flags };
  }

  if (!isInteractive()) {
    throw new NonInteractiveError(
      "stdin is not a terminal, so there is nobody to answer the questions.\n" +
        "Pass everything on the command line instead:\n" +
        "  npx @mj_yu/react-generate-page <path> <Name> --yes\n" +
        "Add --<flag> / --no-<flag> to set each option" +
        ((config.flags ?? []).length > 0
          ? `, e.g. ${(config.flags ?? []).map((f) => `--${f.id}`).join(" ")}`
          : ".")
    );
  }

  const prompter = createPrompter();
  try {
    out("");
    if (pagePath === undefined) {
      pagePath = await prompter.ask("Page path (e.g. test/path): ");
    }
    if (pageName === undefined) {
      pageName = await prompter.ask("Page name (e.g. TestPage): ");
    }
    const labelVars = { path: pagePath.trim(), Name: pageName.trim() };
    for (const flag of config.flags ?? []) {
      if (flag.id in flags) {
        continue;
      }
      if (args.yes) {
        flags[flag.id] = flag.default ?? false;
        continue;
      }
      let label = flag.label;
      try {
        label = render(flag.label, labelVars, {}, `flag "${flag.id}" label`);
      } catch {
        // A label referencing something we cannot resolve yet is shown raw
        // rather than blocking the run.
      }
      flags[flag.id] = await prompter.confirm(label, flag.default ?? false);
    }
  } finally {
    prompter.close();
  }

  return { pagePath, pageName, flags };
}

/**
 * Print the plan, grouped by target.
 *
 * `result` distinguishes the two callers: a preview annotates against what is on
 * disk now, whereas a report annotates against what the apply actually did.
 * Re-stating after writing would label every file we just created a conflict.
 */
function printPlan(
  plan: ReturnType<typeof buildPlan>,
  cwd: string,
  result?: ApplyResult
): void {
  const appended = new Set(result?.appended ?? []);
  const unchanged = new Set(result?.unchanged ?? []);

  const groups = new Map<string, typeof plan.files>();
  for (const file of plan.files) {
    const list = groups.get(file.targetId) ?? [];
    list.push(file);
    groups.set(file.targetId, list);
  }

  for (const [targetId, files] of groups) {
    out(`  ${targetId}`);
    for (const file of files) {
      let note = "";
      if (result) {
        if (appended.has(file.path)) note = " (export appended)";
        else if (unchanged.has(file.path)) note = " (already exported)";
      } else {
        const exists = fs.existsSync(path.resolve(cwd, file.path));
        if (file.role === "barrel") {
          note = exists ? " (append export)" : " (new barrel)";
        } else if (exists) {
          note = " (CONFLICT: exists)";
        }
      }
      out(`    ${file.path}${note}`);
    }
  }
}

async function runInit(args: ParsedArgs, cwd: string): Promise<number> {
  const observation = observe(cwd);

  out("");
  out("Read this repository:");
  out(
    `  package manager: ${observation.packageManager}${observation.workspaces ? " (workspaces declared)" : ""}`
  );
  out(
    `  top-level folders containing code: ${observation.codeDirs.join(", ") || "(none found)"}`
  );

  let root: string | undefined;
  if (observation.workspaces) {
    // Top-level folders in a monorepo are workspace containers, not source.
    // Choosing one here would point root at `apps/`, which is wrong.
    out("");
    out(
      "  workspaces are declared, so source lives inside one of the packages."
    );
    out("  Not guessing a root - it will be left as TODO.");
  } else if (observation.codeDirs.length === 1) {
    root = observation.codeDirs[0];
    out(`  only one code folder, so root: ${root}`);
  } else if (observation.codeDirs.length > 1 && isInteractive()) {
    const prompter = createPrompter();
    try {
      out("");
      out("Which folder holds the source you generate pages into?");
      observation.codeDirs.forEach((dir, i) => out(`  ${i + 1}) ${dir}`));
      const answer = (
        await prompter.ask(`Choose 1-${observation.codeDirs.length} (blank to skip): `)
      ).trim();
      const index = Number(answer) - 1;
      if (Number.isInteger(index) && index >= 0 && index < observation.codeDirs.length) {
        root = observation.codeDirs[index];
      }
    } finally {
      prompter.close();
    }
  } else if (observation.codeDirs.length > 1) {
    out("  more than one candidate and no terminal to ask - leaving root as TODO.");
  }

  if (observation.suffixes.length > 0) {
    out("");
    out("File-name conventions measured in your code:");
    for (const s of observation.suffixes) {
      out(`  ${String(s.count).padStart(4)} x *${s.suffix}.*   e.g. ${s.dirs[0]}`);
    }
  }

  const draft = draftFrom(observation, root);
  const target = path.resolve(cwd, args.out ?? "generate-page.config.mjs");
  if (fs.existsSync(target) && !args.force) {
    err("");
    err(`Refusing to overwrite ${path.relative(cwd, target) || target}.`);
    err("Move it aside, pass --out <file>, or re-run with --force.");
    return 1;
  }

  const contents = renderDraft(draft, DEFAULT_PRESET);
  if (args.dryRun) {
    out("");
    out(`--dry-run: would write ${path.relative(cwd, target)}:`);
    out("");
    out(contents);
    return 0;
  }

  fs.writeFileSync(target, contents);
  out("");
  out(`Wrote ${path.relative(cwd, target)}`);
  out("");
  out("It extends the default preset and overrides only what was read from this");
  out("repository. Search it for TODO - those are the parts init refused to guess.");
  return 0;
}

async function runGenerate(args: ParsedArgs, cwd: string): Promise<number> {
  const loaded = (await resolveConfig(args, cwd)) as LoadedConfigLike;
  const { config } = loaded;

  const answers = await collectAnswers(args, config);
  const plan = buildPlan(config, answers);

  out("");
  out(
    loaded.file
      ? `Config: ${path.relative(cwd, loaded.file) || loaded.file}`
      : `Config: none found, using the "${loaded.presetName}" preset`
  );
  out("");

  if (args.dryRun) {
    out("--dry-run: these would be created, and nothing was written.");
    out("");
    printPlan(plan, cwd);
    const conflicts = findConflicts(plan, cwd);
    out("");
    if (conflicts.length > 0) {
      out(
        `${conflicts.length} of these already exist, so a real run would stop.`
      );
    } else {
      out(`${plan.files.length} files, ${new Set(plan.dirs).size} directories.`);
    }
    const commands = config.verify?.commands ?? [];
    out(
      commands.length > 0
        ? `Then it would check: ${commands.join(", ")}`
        : "No verify.commands configured, so nothing would be checked. Run `init` to set that up."
    );
    return 0;
  }

  const conflicts = findConflicts(plan, cwd);
  if (conflicts.length > 0 && !args.force) {
    err(formatConflicts(conflicts));
    return 1;
  }

  const result = applyPlan(plan, cwd);
  const barrels = result.appended.length + result.unchanged.length;
  out(
    `Created ${result.written.length} file${result.written.length === 1 ? "" : "s"}` +
      (barrels > 0 ? `, and touched ${barrels} existing barrel${barrels === 1 ? "" : "s"}` : "") +
      ":"
  );
  printPlan(plan, cwd, result);

  if (!args.verify) {
    out("");
    out("Skipped verification (--no-verify).");
    return 0;
  }

  const spec = args.fix
    ? config.verify
    : { ...(config.verify ?? {}), selfFix: false };
  out("");
  const verification = verifyPlan(spec, plan, cwd, out);

  if (!verification.ran) {
    out("No verify.commands configured, so the generated code was not checked.");
    out("Run `npx @mj_yu/react-generate-page init` to wire up your own checks.");
    return 0;
  }

  if (verification.ok) {
    out("");
    out(
      verification.attemptedFix
        ? "Green, after the repair round."
        : "Green - the generated code passes this repository's own checks."
    );
    return 0;
  }

  err("");
  err(formatVerifyFailure(verification));

  const shouldRevert =
    !args.keepOnFail && config.verify?.revertOnFail !== false;
  if (shouldRevert) {
    revert(result, plan, cwd);
    err("");
    err("Reverted: the generated files were removed and your tree is as it was.");
  }
  return 1;
}

export async function main(argv: string[]): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    err(`${(error as Error).message}`);
    err("");
    err("Run with --help for usage.");
    return 2;
  }

  if (args.command === "help") {
    out(HELP);
    return 0;
  }
  if (args.command === "version") {
    out(readVersion());
    return 0;
  }

  const cwd = path.resolve(args.cwd ?? process.cwd());
  if (!fs.existsSync(cwd)) {
    err(`--cwd does not exist: ${cwd}`);
    return 2;
  }

  try {
    return args.command === "init"
      ? await runInit(args, cwd)
      : await runGenerate(args, cwd);
  } catch (error) {
    if (
      error instanceof ConfigError ||
      error instanceof PlanError ||
      error instanceof TemplateError ||
      error instanceof ArgError ||
      error instanceof NonInteractiveError
    ) {
      err("");
      err((error as Error).message);
      return 1;
    }
    throw error;
  }
}
