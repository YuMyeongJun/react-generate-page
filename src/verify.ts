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

function expand(command: string, plan: Plan): string {
  const files = plan.files.map((f) => shellQuote(f.path)).join(" ");
  const dirs = [...new Set(plan.dirs)].map((d) => shellQuote(d)).join(" ");
  return command
    .split("{{files}}")
    .join(files)
    .split("{{dirs}}")
    .join(dirs);
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

export function verifyPlan(
  spec: VerifySpec | undefined,
  plan: Plan,
  cwd: string,
  log: (message: string) => void
): VerifyResult {
  const commands = spec?.commands ?? [];
  if (commands.length === 0) {
    return { ran: false, ok: true, attemptedFix: false, results: [] };
  }

  const runAll = (): CommandResult[] =>
    commands.map((command) => {
      const expanded = expand(command, plan);
      log(`  - ${expanded}`);
      return run(expanded, cwd);
    });

  log("Checking what was generated:");
  let results = runAll();
  let attemptedFix = false;

  const failed = () => results.some((r) => !r.ok);
  const selfFix = spec?.selfFix !== false;
  const fixCommands = spec?.fixCommands ?? [];

  if (failed() && selfFix && fixCommands.length > 0) {
    attemptedFix = true;
    log("Red. Running the repair commands you configured, then re-checking:");
    for (const command of fixCommands) {
      const expanded = expand(command, plan);
      log(`  - ${expanded}`);
      run(expanded, cwd);
    }
    results = runAll();
  }

  return { ran: true, ok: !failed(), attemptedFix, results };
}

export function formatVerifyFailure(result: VerifyResult): string {
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
  return lines.join("\n");
}
