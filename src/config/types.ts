/**
 * The config shape.
 *
 * Everything the generator writes — folder names, file names, file bodies, the
 * questions it asks — comes from here. Nothing is hardcoded to one company's
 * conventions any more. The shipped default is the `react-mvvm` preset, which
 * reproduces 0.1.37's output byte for byte.
 */

/** A yes/no question. Its `id` is what templates and `when:` clauses reference. */
export interface FlagSpec {
  id: string;
  /** Question text. `{{path}}` and `{{Name}}` are substituted before asking. */
  label: string;
  /** Answer used when the question is skipped (--yes, --flag, non-interactive). */
  default?: boolean;
}

export interface FileSpec {
  /** File name, templated. e.g. "{{Name}}Component.tsx" */
  name: string;
  /** Body, templated. Mutually exclusive with `templateFile`. */
  template?: string;
  /** Body read from this file, relative to the config file's directory. */
  templateFile?: string;
  /** Only write this file when the named flag is on. */
  when?: string;
}

export interface TargetSpec {
  /** Stable identifier, used in messages and by `--only`. */
  id: string;
  /** Directory under `root`, templated. e.g. "components/pages/{{path}}" */
  dir: string;
  /** Only generate this target when the named flag is on. */
  when?: string;
  /**
   * Write/extend `index.ts` in each ancestor directory up to the target's base,
   * re-exporting the child. This is the "barrel wiring" 0.1.37 did.
   */
  parentIndex?: boolean;
  /**
   * Where ancestor barrel-writing stops, templated, relative to `root`. Defaults
   * to `dir` with the `{{path}}` segment removed.
   */
  parentIndexBase?: string;
  files: FileSpec[];
}

export interface VerifySpec {
  /**
   * Commands run against freshly generated paths. `{{files}}` and `{{dirs}}`
   * expand to the space-separated generated paths.
   *
   * Left empty by default: we cannot know another repo's toolchain without
   * reading it, and guessing means reporting a green light we never measured.
   * `init` fills this in from the repo's actual package.json scripts.
   */
  commands?: string[];
  /**
   * Commands that attempt repair, e.g. `eslint --fix {{files}}`. Run once when
   * `commands` fails, after which `commands` is re-run.
   *
   * There is no model in this package and no dependency that could host one, so
   * "self-fix" means running the repair tooling your repository already has. We
   * do not infer which of your commands can repair - you say so here.
   */
  fixCommands?: string[];
  /** Run `fixCommands` and re-check when verification fails. Default true. */
  selfFix?: boolean;
  /**
   * Delete the generated files when verification still fails after the fix
   * round, so the working tree is left as it was found. Default true; override
   * with --keep-on-fail.
   */
  revertOnFail?: boolean;
}

export interface Config {
  /** For editor completion. Ignored at runtime. */
  $schema?: string;
  /** Built-in preset to start from. Anything else here overrides it. */
  preset?: string;
  /** Source root, relative to the project. e.g. "src" */
  root: string;
  /**
   * Extra tokens available to every template. Values are themselves templated,
   * so `{ "alias": "@components/pages/{{path}}" }` works.
   */
  vars?: Record<string, string>;
  flags?: FlagSpec[];
  targets: TargetSpec[];
  verify?: VerifySpec;
}

/** A single file the generator intends to write. */
export interface PlannedFile {
  /** Project-relative path. */
  path: string;
  content: string;
  /** Which target produced it — for grouping in output. */
  targetId: string;
  /**
   * Barrel files are appended to when they already exist, so an existing one is
   * not a conflict the way a component file is.
   */
  role: "file" | "barrel";
}

export interface Plan {
  files: PlannedFile[];
  dirs: string[];
}

export interface Answers {
  pagePath: string;
  pageName: string;
  flags: Record<string, boolean>;
}
