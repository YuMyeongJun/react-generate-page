/**
 * Planning is pure: (config, answers) -> Plan. Nothing here touches the disk.
 *
 * That split is what makes `--dry-run` free (print the plan, don't apply it) and
 * what makes the output testable as plain strings.
 */
import * as path from "path";

import { render } from "./template.js";
import { toCamelCase, toKebabCase, toPascalCase } from "./naming.js";
import type { Answers, Config, Plan, PlannedFile } from "./config/types.js";

export class PlanError extends Error {}

/**
 * The page path becomes a filesystem path, so it has to be checked. Without
 * this, `../../etc` writes outside the project.
 */
export function normalizePagePath(raw: string): string {
  const trimmed = raw.trim().split("\\").join("/");
  // A leading slash is ambiguous - "under the source root" or "the filesystem
  // root"? Refuse it rather than pick one. Trailing slashes mean nothing, so
  // they are simply dropped.
  if (trimmed.startsWith("/") || path.isAbsolute(trimmed)) {
    throw new PlanError(
      `page path must be relative to the source root, with no leading slash: ${raw}`
    );
  }
  const value = trimmed.replace(/\/+$/g, "");
  if (!value) {
    throw new PlanError("page path is empty");
  }
  const segments = value.split("/").filter((s) => s !== "");
  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new PlanError(
        `page path may not contain "${segment}" — it would write outside the project: ${raw}`
      );
    }
    // A whitelist, not a blacklist. These segments become directory names that
    // are later interpolated into verify commands run through a shell, so
    // anything clever (spaces, ;, $, backticks, quotes) is rejected outright.
    if (!/^[A-Za-z0-9._-]+$/.test(segment)) {
      throw new PlanError(
        `page path segment "${segment}" may only contain letters, digits, dot, dash and underscore`
      );
    }
  }
  if (segments.length === 0) {
    throw new PlanError("page path is empty");
  }
  return segments.join("/");
}

export function validatePageName(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new PlanError("page name is empty");
  }
  if (/[/\\]/.test(value)) {
    throw new PlanError(`page name may not contain a path separator: ${raw}`);
  }
  const pascal = toPascalCase(value);
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(pascal)) {
    throw new PlanError(
      `page name must become a valid identifier; "${raw}" became "${pascal}"`
    );
  }
  return pascal;
}

/** Strip the trailing page-path segment to find where barrel-writing stops. */
function parentIndexBase(target: { dir: string; parentIndexBase?: string }): string {
  if (target.parentIndexBase !== undefined) {
    return target.parentIndexBase;
  }
  const base = target.dir.replace(/\/*\{\{\s*path\s*\}\}\/*$/, "");
  if (base === target.dir) {
    throw new PlanError(
      `target dir "${target.dir}" does not end in {{path}}, so parentIndex has no base — set parentIndexBase explicitly`
    );
  }
  return base;
}

export function buildPlan(config: Config, answers: Answers): Plan {
  const pagePath = normalizePagePath(answers.pagePath);
  const Name = validatePageName(answers.pageName);

  const declared = new Set((config.flags ?? []).map((f) => f.id));
  for (const id of Object.keys(answers.flags)) {
    if (!declared.has(id)) {
      throw new PlanError(`answer given for undeclared flag "${id}"`);
    }
  }
  const flags: Record<string, boolean> = {};
  for (const flag of config.flags ?? []) {
    flags[flag.id] = answers.flags[flag.id] ?? flag.default ?? false;
  }

  const baseVars: Record<string, string> = {
    Name,
    name: toCamelCase(Name),
    kebab: toKebabCase(Name),
    path: pagePath,
    root: config.root,
  };
  const vars: Record<string, string> = { ...baseVars };
  for (const [key, value] of Object.entries(config.vars ?? {})) {
    if (key in baseVars) {
      throw new PlanError(`config var "${key}" shadows a built-in token`);
    }
    vars[key] = render(value, baseVars, flags, `vars.${key}`);
  }

  const files: PlannedFile[] = [];
  const dirs: string[] = [];

  const requireFlag = (name: string | undefined, where: string): boolean => {
    if (name === undefined) {
      return true;
    }
    if (!(name in flags)) {
      throw new PlanError(`${where}: when: "${name}" is not a declared flag`);
    }
    return flags[name];
  };

  for (const target of config.targets) {
    if (!requireFlag(target.when, `target "${target.id}"`)) {
      continue;
    }
    const dir = path.posix.join(
      config.root,
      render(target.dir, vars, flags, `target "${target.id}".dir`)
    );
    dirs.push(dir);

    for (const file of target.files) {
      if (!requireFlag(file.when, `target "${target.id}" file "${file.name}"`)) {
        continue;
      }
      if (file.template === undefined) {
        throw new PlanError(
          `target "${target.id}" file "${file.name}" has no template (templateFile is resolved before planning)`
        );
      }
      const where = `target "${target.id}" file "${file.name}"`;
      const name = render(file.name, vars, flags, `${where} (name)`);
      files.push({
        path: path.posix.join(dir, name),
        content: render(file.template, vars, flags, where),
        targetId: target.id,
        role: "file",
      });
    }

    if (target.parentIndex) {
      const base = path.posix.join(
        config.root,
        render(parentIndexBase(target), vars, flags, `target "${target.id}".parentIndexBase`)
      );
      const segments = pagePath.split("/");
      // The last segment is the target's own directory, which already gets its
      // own index.ts from `files`. Only ancestors are wired here — matching
      // 0.1.37, a single-segment path produces no parent barrels at all.
      let current = base;
      for (let i = 0; i < segments.length - 1; i++) {
        current = path.posix.join(current, segments[i]);
        files.push({
          path: path.posix.join(current, "index.ts"),
          content: `export * from './${segments[i + 1]}';\n`,
          targetId: target.id,
          role: "barrel",
        });
      }
    }
  }

  return { files, dirs };
}
