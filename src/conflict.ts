/**
 * Nothing is written until the whole plan is known to be safe.
 *
 * 0.1.37 called fs.writeFileSync unconditionally on every generated file, so
 * re-running it on an existing page silently destroyed hand-written
 * Component/ViewModel/Page code. This is the fix, and it is all-or-nothing on
 * purpose: a half-generated page is worse than no page, because you cannot tell
 * by looking which half is yours.
 */
import * as fs from "fs";
import * as path from "path";

import type { Plan } from "./config/types.js";

export interface Conflict {
  path: string;
  reason: "file exists" | "path is a directory";
}

export function findConflicts(plan: Plan, cwd: string): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const file of plan.files) {
    const abs = path.resolve(cwd, file.path);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue; // does not exist — nothing to protect
    }
    if (stat.isDirectory()) {
      conflicts.push({ path: file.path, reason: "path is a directory" });
      continue;
    }
    // Barrels are additive: an existing index.ts gets a new export line appended
    // rather than being replaced, so it is not a conflict.
    if (file.role === "barrel") {
      continue;
    }
    conflicts.push({ path: file.path, reason: "file exists" });
  }
  return conflicts;
}

export function formatConflicts(conflicts: Conflict[]): string {
  const lines = [
    `Refusing to generate: ${conflicts.length} path${conflicts.length === 1 ? "" : "s"} already exist.`,
    "",
  ];
  for (const c of conflicts) {
    lines.push(`  ${c.path}  (${c.reason})`);
  }
  lines.push(
    "",
    "Nothing was written. Delete or move these, or generate under a different",
    "page path. Use --dry-run to see the full list of files first."
  );
  return lines.join("\n");
}
