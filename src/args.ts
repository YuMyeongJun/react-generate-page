/**
 * Argument parsing.
 *
 * An unrecognised flag is an error. Silently ignoring `--dryrun` would write
 * files while the person believed they were previewing them.
 *
 * Config-declared flags (`--searchCondition`) cannot be validated here because
 * the config is not loaded yet, so they are collected and checked afterwards.
 */

export class ArgError extends Error {}

export interface ParsedArgs {
  command: "generate" | "init" | "help" | "version" | "print-config" | "list-presets";
  positional: string[];
  dryRun: boolean;
  yes: boolean;
  verify: boolean;
  fix: boolean;
  keepOnFail: boolean;
  config?: string;
  cwd?: string;
  preset?: string;
  out?: string;
  force: boolean;
  /** --someFlag / --no-someFlag, resolved against the config's flags later. */
  flagOverrides: Record<string, boolean>;
}

const VALUE_FLAGS = new Set(["--config", "--cwd", "--preset", "--out"]);
const BOOL_FLAGS = new Set([
  "--print-config",
  "--list-presets",
  "--dry-run",
  "--yes",
  "-y",
  "--verify",
  "--no-verify",
  "--fix",
  "--no-fix",
  "--keep-on-fail",
  "--force",
  "--help",
  "-h",
  "--version",
  "-v",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: "generate",
    positional: [],
    dryRun: false,
    yes: false,
    verify: true,
    fix: true,
    keepOnFail: false,
    force: false,
    flagOverrides: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith("-")) {
      parsed.positional.push(arg);
      continue;
    }

    if (VALUE_FLAGS.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new ArgError(`${arg} needs a value`);
      }
      i += 1;
      if (arg === "--config") parsed.config = value;
      else if (arg === "--cwd") parsed.cwd = value;
      else if (arg === "--preset") parsed.preset = value;
      else if (arg === "--out") parsed.out = value;
      continue;
    }

    if (BOOL_FLAGS.has(arg)) {
      if (arg === "--dry-run") parsed.dryRun = true;
      else if (arg === "--yes" || arg === "-y") parsed.yes = true;
      else if (arg === "--verify") parsed.verify = true;
      else if (arg === "--no-verify") parsed.verify = false;
      else if (arg === "--fix") parsed.fix = true;
      else if (arg === "--no-fix") parsed.fix = false;
      else if (arg === "--keep-on-fail") parsed.keepOnFail = true;
      else if (arg === "--force") parsed.force = true;
      else if (arg === "--print-config") parsed.command = "print-config";
      else if (arg === "--list-presets") parsed.command = "list-presets";
      else if (arg === "--help" || arg === "-h") parsed.command = "help";
      else if (arg === "--version" || arg === "-v") parsed.command = "version";
      continue;
    }

    // A config-declared flag: --searchCondition / --no-searchCondition
    const negated = arg.startsWith("--no-");
    const name = negated ? arg.slice("--no-".length) : arg.replace(/^--/, "");
    if (!/^[A-Za-z0-9_]+$/.test(name) || !arg.startsWith("--")) {
      throw new ArgError(`unknown option: ${arg}`);
    }
    parsed.flagOverrides[name] = !negated;
  }

  if (parsed.positional[0] === "init" && parsed.command === "generate") {
    parsed.command = "init";
    parsed.positional.shift();
  }

  if (parsed.positional.length > 2) {
    throw new ArgError(
      `expected at most 2 positional arguments (<path> <Name>), got ${parsed.positional.length}: ${parsed.positional.join(" ")}`
    );
  }

  return parsed;
}

export const HELP = `@mj_yu/react-generate-page - generate a React page from your own conventions

Usage
  npx @mj_yu/react-generate-page [<path> <Name>] [options]
  npx @mj_yu/react-generate-page init [options]

  With no positional arguments it asks. With them it does not, so it works in
  scripts and CI.

Commands
  init                 read this repository and write a generate-page.config
                       draft. Values it cannot read are left as TODO.

Options
  --dry-run            print what would be created and write nothing
  -y, --yes            take the default answer for every question
  --<flag>             turn a config flag on  (e.g. --searchCondition)
  --no-<flag>          turn a config flag off
  --preset <name>      use a built-in preset instead of the config's
  --config <file>      use this config file
  --cwd <dir>          treat this directory as the project root
  --out <dir>          (init) write the draft here
  --force              overwrite existing files instead of stopping
  --print-config       print the effective config, preset merge included, and exit
  --list-presets       list the built-in presets and exit
  --no-verify          skip the checks configured in verify.commands
  --no-fix             do not run verify.fixCommands when a check fails
  --keep-on-fail       keep generated files when verification fails
  -h, --help           this text
  -v, --version        print the version

Existing files are never overwritten. If anything in the plan is already there,
nothing is written and the conflicts are listed.
`;
