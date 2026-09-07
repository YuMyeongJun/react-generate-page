/** Re-exports so cli.ts has one import site for the shapes it passes around. */
export type { Answers, Config, Plan, PlannedFile } from "./config/types.js";
import type { Config } from "./config/types.js";

export interface LoadedConfigLike {
  config: Config;
  file?: string;
  presetName: string;
}
