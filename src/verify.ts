/**
 * Checking what was generated.
 *
 * This is the thing plop and hygen do not do: they emit files and stop. Here the
 * freshly created paths are handed to the repository's own tsc/eslint/test
 * command, and if that comes back red the files do not survive.
 *
 * Two deliberate choices:
 *
 * 1. We run *your* tooling, invoked from your node_modules, never a copy of ours.
 *    That is what keeps this package's runtime dependency count at zero, and it
 *    means the check enforces your rules rather than our opinion of them.
 * 2. Checks are scoped to the generated paths via {{files}} / {{dirs}}. Running a
 *    whole-repo lint and blaming the new page for a pre-existing error teaches
 *    people to ignore the gate.
 *
 * Ordering note: the harness this borrows from gates before writing, which is
 * stricter. tsc and eslint need real files on disk, so instead we write, check,
 * and revert on failure - the end state is the same (nothing survives a red
 * check) without reimplementing a type checker.
 */
import { spawnSync } from "child_process";

import type { Plan, VerifySpec } from "./config/types.js";

/** What a check is pointed at. A generated plan is one source of these. */
export interface VerifyTargets {
  files: string[];
  dirs: string[];
}

export interface CommandResult {
  command: string;
  ok: boolean;
  code: number | null;
  output: string;
}

export interface VerifyResult {
  ran: boolean;
  ok: boolean;
  attemptedFix: boolean;
  results: CommandResult[];
}

/** Single-quote for POSIX shells; paths are already restricted to a safe charset. */
function shellQuote(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`;
}

function expand(command: string, targets: VerifyTargets): string {
  const files = targets.files.map((f) => shellQuote(f)).join(" ");
  const dirs = [...new Set(targets.dirs)].map((d) => shellQuote(d)).join(" ");
  return command
    .split("{{files}}")
    .join(files)
    .split("{{dirs}}")
    .join(dirs);
}

export function targetsOfPlan(plan: Plan): VerifyTargets {
  return { files: plan.files.map((f) => f.path), dirs: plan.dirs };
}

function run(command: string, cwd: string): CommandResult {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf-8",
    // Put the project's own binaries first, so `tsc` means the repo's tsc.
    env: {
      ...process.env,
      PATH: `${cwd}/node_modules/.bin:${process.env.PATH ?? ""}`,
    },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.error) {
    return { command, ok: false, code: null, output: result.error.message };
  }
  return { command, ok: result.status === 0, code: result.status, output };
}

export function verifyTargets(
  spec: VerifySpec | undefined,
  targets: VerifyTargets,
  cwd: string,
  log: (message: string) => void,
  /** What is being checked. `check` did not generate anything. */
  origin: "generated" | "existing" = "generated"
): VerifyResult {
  const commands = spec?.commands ?? [];
  if (commands.length === 0) {
    return { ran: false, ok: true, attemptedFix: false, results: [] };
  }

  const runAll = (): CommandResult[] =>
    commands.map((command) => {
      const expanded = expand(command, targets);
      log(`  - ${expanded}`);
      return run(expanded, cwd);
    });

  log(
    origin === "generated"
      ? "Checking what was generated:"
      : "Checking these files:"
  );
  let results = runAll();
  let attemptedFix = false;

  const failed = () => results.some((r) => !r.ok);
  const selfFix = spec?.selfFix !== false;
  const fixCommands = spec?.fixCommands ?? [];

  if (failed() && selfFix && fixCommands.length > 0) {
    attemptedFix = true;
    log("Red. Running the repair commands you configured, then re-checking:");
    for (const command of fixCommands) {
      const expanded = expand(command, targets);
      log(`  - ${expanded}`);
      run(expanded, cwd);
    }
    results = runAll();
  }

  return { ran: true, ok: !failed(), attemptedFix, results };
}

export function verifyPlan(
  spec: VerifySpec | undefined,
  plan: Plan,
  cwd: string,
  log: (message: string) => void
): VerifyResult {
  return verifyTargets(spec, targetsOfPlan(plan), cwd, log);
}

/**
 * Advice depends on where the code came from.
 *
 * For freshly generated files, the template is at fault and saying so is the
 * whole point. For files that were already there - a migration, a review - the
 * template had nothing to do with it, and pointing at it would send the reader
 * to the wrong place.
 */
export function formatVerifyFailure(
  result: VerifyResult,
  origin: "generated" | "existing" = "generated"
): string {
  const lines: string[] = [];
  for (const r of result.results.filter((x) => !x.ok)) {
    lines.push(`FAILED (exit ${r.code ?? "n/a"}): ${r.command}`);
    if (r.output) {
      lines.push(
        r.output
          .split("\n")
          .map((l) => `    ${l}`)
          .join("\n")
      );
    }
  }
  if (origin === "generated") {
    lines.push(
      "",
      "The generated code does not pass this repository's own checks.",
      "",
      "Fix the template, not the output. Every page generated from this config will",
      "carry the same violation, so patching the files by hand only hides it until",
      "the next run. The templates live in your generate-page.config file (or in the",
      "preset it extends).",
      "",
      "Re-run with --keep-on-fail to inspect the generated files in place."
    );
  } else {
    lines.push(
      "",
      "These files do not pass this repository's own checks.",
      "",
      "Nothing was generated and nothing was changed, so this is a report, not a",
      "failed generation. Fix the files themselves."
    );
    if (!result.attemptedFix) {
      lines.push("", "Add --fix to run verify.fixCommands and re-check.");
    }
  }
  return lines.join("\n");
}
