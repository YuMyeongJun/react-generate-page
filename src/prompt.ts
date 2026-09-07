/**
 * Interactive input.
 *
 * 0.1.37 created and closed a fresh readline interface for every question, all
 * on the shared process.stdin. On a TTY that happens to survive; on a pipe the
 * first close() ends the stream, so question two never resolved and the process
 * exited 0 having written nothing. Any non-interactive use - CI, a script, a
 * test - silently did nothing.
 *
 * One interface, opened once, closed once.
 */
import * as readline from "readline";

export interface Prompter {
  ask(question: string): Promise<string>;
  confirm(question: string, fallback: boolean): Promise<boolean>;
  close(): void;
}

export class NonInteractiveError extends Error {}

export interface PrompterStreams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

export function createPrompter(streams?: PrompterStreams): Prompter {
  const rl = readline.createInterface({
    input: streams?.input ?? process.stdin,
    output: streams?.output ?? process.stdout,
  });
  let closed = false;

  return {
    ask(question: string): Promise<string> {
      if (closed) {
        throw new Error("prompter already closed");
      }
      return new Promise((resolve, reject) => {
        // A closed stdin must reject, not hang. This is what used to look like
        // a successful run that produced no files.
        const onClose = () =>
          reject(
            new NonInteractiveError(
              "stdin closed before the question was answered"
            )
          );
        rl.once("close", onClose);
        rl.question(question, (answer) => {
          rl.removeListener("close", onClose);
          resolve(answer);
        });
      });
    },
    async confirm(question: string, fallback: boolean): Promise<boolean> {
      const suffix = fallback ? "(Y/n)" : "(y/N)";
      const answer = (await this.ask(`${question} ${suffix}: `)).trim().toLowerCase();
      if (answer === "") {
        return fallback;
      }
      return answer === "y" || answer === "yes";
    },
    close() {
      if (!closed) {
        closed = true;
        rl.close();
      }
    },
  };
}

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}
