/**
 * The readline regression.
 *
 * 0.1.37 built a fresh readline interface per question on the shared
 * process.stdin and closed it each time. On a pipe the first close() ended the
 * stream, so question two never resolved and the process exited 0 having
 * written nothing.
 *
 * These tests drive the prompter over an ordinary pipe. Each answer is written
 * after its question has been asked, which is what a person at a terminal
 * actually does.
 */
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import { createPrompter, NonInteractiveError, type Prompter } from "../src/prompt.js";

interface Harness {
  prompter: Prompter;
  input: PassThrough;
  shown: () => string;
}

const harness = (): Harness => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (c) => chunks.push(String(c)));
  return {
    prompter: createPrompter({ input, output }),
    input,
    shown: () => chunks.join(""),
  };
};

/** Ask, then answer, the way a terminal session goes. */
const exchange = async <T,>(
  input: PassThrough,
  pending: Promise<T>,
  answer: string
): Promise<T> => {
  setImmediate(() => input.write(`${answer}\n`));
  return pending;
};

test("answers several questions in a row on one interface", async () => {
  // The bug: with an interface per question, this stopped after the first.
  const { prompter, input } = harness();

  assert.equal(await exchange(input, prompter.ask("path: "), "auth/login"), "auth/login");
  assert.equal(await exchange(input, prompter.ask("name: "), "LoginPage"), "LoginPage");
  assert.equal(await exchange(input, prompter.confirm("condition?", false), "y"), true);
  assert.equal(await exchange(input, prompter.ask("anything else: "), "no"), "no");

  prompter.close();
});

test("confirm() takes the declared default on an empty answer", async () => {
  const { prompter, input } = harness();
  assert.equal(await exchange(input, prompter.confirm("a?", true), ""), true);
  assert.equal(await exchange(input, prompter.confirm("b?", false), ""), false);
  prompter.close();
});

test("confirm() accepts y and yes, and treats anything else as no", async () => {
  const { prompter, input } = harness();
  assert.equal(await exchange(input, prompter.confirm("1", false), "y"), true);
  assert.equal(await exchange(input, prompter.confirm("2", false), "YES"), true);
  assert.equal(await exchange(input, prompter.confirm("3", true), "n"), false);
  assert.equal(await exchange(input, prompter.confirm("4", true), "maybe"), false);
  prompter.close();
});

test("the prompt shows which answer is the default", async () => {
  const h = harness();
  await exchange(h.input, h.prompter.confirm("yes by default", true), "");
  await exchange(h.input, h.prompter.confirm("no by default", false), "");
  h.prompter.close();
  assert.match(h.shown(), /yes by default \(Y\/n\)/);
  assert.match(h.shown(), /no by default \(y\/N\)/);
});

test("stdin ending mid-question rejects instead of hanging", async () => {
  // 0.1.37 exited 0 here, having written nothing, and reported success.
  const { prompter, input } = harness();
  const pending = prompter.ask("path: ");
  input.end();
  await assert.rejects(() => pending, NonInteractiveError);
});

test("an answer split across chunks is still read as one line", async () => {
  const { prompter, input } = harness();
  const pending = prompter.ask("a: ");
  input.write("on");
  input.write("e");
  input.write("\n");
  assert.equal(await pending, "one");
  prompter.close();
});

test("asking after close is refused rather than hanging", async () => {
  const { prompter } = harness();
  prompter.close();
  assert.throws(() => prompter.ask("x: "), /already closed/);
});
