/**
 * Writing the plan. Runs only after findConflicts() has come back empty.
 */
import * as fs from "fs";
import * as path from "path";

import type { Plan, PlannedFile } from "./config/types.js";

export interface ApplyResult {
  written: string[];
  appended: string[];
  unchanged: string[];
}

/**
 * A barrel already containing this export is left alone. 0.1.37 tested this with
 * `content.includes(childDir)`, a bare substring check, so a child named `user`
 * counted as present when the file only exported `userList` — and the real
 * export was never added, leaving the page unimportable. Matching the whole
 * export statement fixes that.
 */
function barrelHasExport(content: string, exportLine: string): boolean {
  const wanted = exportLine.trim();
  return content
    .split("\n")
    .some((line) => line.trim() === wanted);
}

export function applyPlan(plan: Plan, cwd: string): ApplyResult {
  const result: ApplyResult = { written: [], appended: [], unchanged: [] };

  for (const dir of plan.dirs) {
    fs.mkdirSync(path.resolve(cwd, dir), { recursive: true });
  }

  for (const file of plan.files) {
    const abs = path.resolve(cwd, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });

    if (file.role === "barrel" && fs.existsSync(abs)) {
      const existing = fs.readFileSync(abs, "utf-8");
      if (barrelHasExport(existing, file.content)) {
        result.unchanged.push(file.path);
        continue;
      }
      const separator = existing === "" || existing.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(abs, separator + file.content);
      result.appended.push(file.path);
      continue;
    }

    fs.writeFileSync(abs, file.content);
    result.written.push(file.path);
  }

  return result;
}

/** Undo an apply. Used when verification fails and the caller wants a clean tree. */
export function revert(result: ApplyResult, plan: Plan, cwd: string): void {
  for (const p of result.written) {
    try {
      fs.unlinkSync(path.resolve(cwd, p));
    } catch {
      /* already gone */
    }
  }
  for (const p of result.appended) {
    const file = plan.files.find((f: PlannedFile) => f.path === p);
    if (!file) continue;
    const abs = path.resolve(cwd, p);
    try {
      const content = fs.readFileSync(abs, "utf-8");
      const trimmed = content.endsWith(file.content)
        ? content.slice(0, content.length - file.content.length)
        : content;
      fs.writeFileSync(abs, trimmed);
    } catch {
      /* nothing to undo */
    }
  }
  // Remove directories we created, deepest first, but only if empty.
  const dirs = [...new Set(plan.files.map((f) => path.dirname(path.resolve(cwd, f.path))))]
    .sort((a, b) => b.length - a.length);
  for (const dir of dirs) {
    try {
      fs.rmdirSync(dir);
    } catch {
      /* not empty, or not ours */
    }
  }
}
