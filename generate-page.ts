#!/usr/bin/env node
/**
 * Entry point. Kept at the package root so the compiled output stays at
 * dist/generate-page.js, which is what `bin` has always pointed at - moving it
 * would break every existing install.
 *
 * Everything real lives in src/. See src/cli.ts for the command flow.
 */
import { main } from "./src/cli.js";

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `\nUnexpected failure: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    );
    process.exitCode = 1;
  });
