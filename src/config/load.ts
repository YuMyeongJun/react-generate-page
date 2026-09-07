/**
 * Finding, loading, merging and validating the config file.
 *
 * Zero runtime dependencies, so: JSON is parsed directly, and .js/.mjs/.cjs are
 * loaded with a plain dynamic import. .ts works only where the running Node can
 * strip types on its own (Node 22.6+); rather than pull in a loader we say so.
 */
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import { referenced } from "../template.js";
import { DEFAULT_PRESET, PRESETS } from "./presets.js";
import type { Config, FileSpec, TargetSpec } from "./types.js";

export class ConfigError extends Error {}

export const CONFIG_BASENAME = "generate-page.config";
export const CONFIG_EXTENSIONS = [".json", ".mjs", ".js", ".cjs", ".ts"] as const;

/** Built-in tokens every template may use without declaring anything. */
const BUILTIN_VARS = ["Name", "name", "kebab", "path", "root"];

export function findConfigFile(cwd: string): string | undefined {
  for (const ext of CONFIG_EXTENSIONS) {
    const candidate = path.join(cwd, CONFIG_BASENAME + ext);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function readConfigFile(file: string): Promise<unknown> {
  const ext = path.extname(file);
  if (ext === ".json") {
    const text = fs.readFileSync(file, "utf-8");
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new ConfigError(
        `${file} is not valid JSON: ${(error as Error).message}`
      );
    }
  }
  try {
    const mod = (await import(pathToFileURL(file).href)) as {
      default?: unknown;
      config?: unknown;
    };
    return mod.default ?? mod.config ?? mod;
  } catch (error) {
    if (ext === ".ts") {
      throw new ConfigError(
        `Could not load ${file}.\n` +
          `Node ${process.versions.node} could not import it directly. This package has no\n` +
          `runtime dependencies, so there is no TypeScript loader to fall back on.\n` +
          `Use generate-page.config.mjs (you keep code and comments) or .json,\n` +
          `or run on Node 22.6+ where type stripping is built in.\n` +
          `Original error: ${(error as Error).message}`
      );
    }
    throw new ConfigError(
      `Could not load ${file}: ${(error as Error).message}`
    );
  }
}

function asObject(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ConfigError(`${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** Shallow merge. Arrays replace rather than concatenate — see README. */
function mergeConfig(base: Config, override: Record<string, unknown>): Config {
  const merged: Config = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key === "preset" || key === "$schema") {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    if (key === "vars") {
      merged.vars = { ...(base.vars ?? {}), ...asObject(value, "vars") } as Record<
        string,
        string
      >;
      continue;
    }
    if (key === "verify") {
      merged.verify = { ...(base.verify ?? {}), ...asObject(value, "verify") };
      continue;
    }
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  return merged;
}

function resolveTemplates(config: Config, configDir: string): Config {
  const targets = config.targets.map((target: TargetSpec) => ({
    ...target,
    files: target.files.map((file: FileSpec) => {
      if (file.template !== undefined && file.templateFile !== undefined) {
        throw new ConfigError(
          `target "${target.id}" file "${file.name}": set template or templateFile, not both`
        );
      }
      if (file.templateFile === undefined) {
        return file;
      }
      const abs = path.resolve(configDir, file.templateFile);
      if (!fs.existsSync(abs)) {
        throw new ConfigError(
          `target "${target.id}" file "${file.name}": templateFile not found: ${abs}`
        );
      }
      return { ...file, template: fs.readFileSync(abs, "utf-8") };
    }),
  }));
  return { ...config, targets };
}

export function validateConfig(config: Config): void {
  if (typeof config.root !== "string" || config.root.trim() === "") {
    throw new ConfigError('"root" must be a non-empty string, e.g. "src"');
  }
  if (path.isAbsolute(config.root) || config.root.split("/").includes("..")) {
    throw new ConfigError(`"root" must be inside the project: ${config.root}`);
  }
  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw new ConfigError('"targets" must be a non-empty array');
  }

  const flagIds = new Set<string>();
  for (const flag of config.flags ?? []) {
    if (!flag.id || typeof flag.id !== "string") {
      throw new ConfigError("every flag needs a string id");
    }
    if (!/^[A-Za-z0-9_]+$/.test(flag.id)) {
      throw new ConfigError(
        `flag id "${flag.id}" may only contain letters, digits and underscores — templates reference it as {{#if ${flag.id}}}`
      );
    }
    if (flagIds.has(flag.id)) {
      throw new ConfigError(`duplicate flag id "${flag.id}"`);
    }
    flagIds.add(flag.id);
  }

  const knownVars = new Set([...BUILTIN_VARS, ...Object.keys(config.vars ?? {})]);
  const targetIds = new Set<string>();

  for (const target of config.targets) {
    if (!target.id || typeof target.id !== "string") {
      throw new ConfigError("every target needs a string id");
    }
    if (targetIds.has(target.id)) {
      throw new ConfigError(`duplicate target id "${target.id}"`);
    }
    targetIds.add(target.id);
    if (typeof target.dir !== "string" || target.dir.trim() === "") {
      throw new ConfigError(`target "${target.id}" needs a non-empty dir`);
    }
    if (target.when !== undefined && !flagIds.has(target.when)) {
      throw new ConfigError(
        `target "${target.id}" is gated on flag "${target.when}", which is not declared`
      );
    }
    if (!Array.isArray(target.files) || target.files.length === 0) {
      throw new ConfigError(`target "${target.id}" needs a non-empty files array`);
    }

    for (const file of target.files) {
      const where = `target "${target.id}" file "${file.name}"`;
      if (typeof file.name !== "string" || file.name.trim() === "") {
        throw new ConfigError(`target "${target.id}" has a file with no name`);
      }
      if (file.template === undefined) {
        throw new ConfigError(`${where} needs template or templateFile`);
      }
      if (file.when !== undefined && !flagIds.has(file.when)) {
        throw new ConfigError(
          `${where} is gated on flag "${file.when}", which is not declared`
        );
      }
      // Catch typos now, while nothing has been written. A generator that emits
      // {{Nmae}} into a component has failed while reporting success.
      for (const source of [
        { text: file.name, label: `${where} (name)` },
        { text: file.template, label: where },
      ]) {
        const used = referenced(source.text, source.label);
        for (const v of used.vars) {
          if (!knownVars.has(v)) {
            throw new ConfigError(
              `${source.label}: unknown token {{${v}}}. Known: ${[...knownVars].sort().join(", ")}`
            );
          }
        }
        for (const f of used.flags) {
          if (!flagIds.has(f)) {
            throw new ConfigError(
              `${source.label}: {{#if ${f}}} references an undeclared flag`
            );
          }
        }
      }
    }
  }

  for (const command of config.verify?.commands ?? []) {
    if (typeof command !== "string" || command.trim() === "") {
      throw new ConfigError("verify.commands entries must be non-empty strings");
    }
  }
}

export interface LoadedConfig {
  config: Config;
  /** Absolute path of the config file, or undefined when the default preset is used. */
  file?: string;
  presetName: string;
}

export async function loadConfig(cwd: string): Promise<LoadedConfig> {
  const file = findConfigFile(cwd);

  if (!file) {
    const config = resolveTemplates(PRESETS[DEFAULT_PRESET], cwd);
    validateConfig(config);
    return { config, presetName: DEFAULT_PRESET };
  }

  const raw = asObject(await readConfigFile(file), path.basename(file));
  const presetName =
    typeof raw.preset === "string" ? raw.preset : DEFAULT_PRESET;
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new ConfigError(
      `unknown preset "${presetName}". Available: ${Object.keys(PRESETS).sort().join(", ")}`
    );
  }

  const merged = resolveTemplates(mergeConfig(preset, raw), path.dirname(file));
  validateConfig(merged);
  return { config: merged, file, presetName };
}
