import assert from "node:assert/strict";
import { test } from "node:test";

import { referenced, render, TemplateError } from "../src/template.js";

const V = { Name: "Login", path: "auth/login", root: "src" };

test("substitutes tokens", () => {
  assert.equal(render("{{Name}}Page in {{path}}", V, {}), "LoginPage in auth/login");
});

test("keeps a conditional body verbatim, including indentation", () => {
  const tpl = "a\n  {{#if on}}<div>\n    x\n  </div>{{/if}}\nb";
  assert.equal(render(tpl, V, { on: true }), "a\n  <div>\n    x\n  </div>\nb");
  // Removing the body leaves the two spaces that preceded it. That is not a bug:
  // the whitespace belongs to the template, not to the conditional.
  assert.equal(render(tpl, V, { on: false }), "a\n  \nb");
});

test("unless is the inverse of if", () => {
  assert.equal(render("{{#unless on}}no{{/unless}}", V, { on: false }), "no");
  assert.equal(render("{{#unless on}}no{{/unless}}", V, { on: true }), "");
});

test("nests conditionals without mis-pairing the closing tags", () => {
  const tpl = "{{#if outer}}O{{#if inner}}I{{/if}}O{{/if}}";
  assert.equal(render(tpl, V, { outer: true, inner: true }), "OIO");
  assert.equal(render(tpl, V, { outer: true, inner: false }), "OO");
  assert.equal(render(tpl, V, { outer: false, inner: true }), "");
});

test("leaves JSX double braces alone", () => {
  // The shipped ViewModel template contains `value={{ ... }}`. A naive engine
  // treats that as a token and either throws or eats the JSX.
  const tpl = "<X.Provider\n  value={{\n    // TODO\n  }}\n>{{Name}}</X.Provider>";
  assert.equal(
    render(tpl, V, {}),
    "<X.Provider\n  value={{\n    // TODO\n  }}\n>Login</X.Provider>"
  );
});

test("an unknown token is an error, not an empty string", () => {
  // Emitting {{Nmae}} into somebody's component and reporting success is worse
  // than failing.
  assert.throws(() => render("{{Nmae}}", V, {}), TemplateError);
  assert.throws(() => render("{{Nmae}}", V, {}), /unknown token \{\{Nmae\}\}/);
});

test("an undeclared flag is an error", () => {
  assert.throws(() => render("{{#if nope}}x{{/if}}", V, { on: true }), /unknown flag "nope"/);
});

test("unbalanced tags are reported with the offending flag", () => {
  assert.throws(() => render("{{#if on}}x", V, { on: true }), /never closed/);
  assert.throws(() => render("x{{/if}}", V, {}), /without a matching open tag/);
  assert.throws(
    () => render("{{#if on}}x{{/unless}}", V, { on: true }),
    /use \{\{\/if\}\}/
  );
});

test("referenced() reports the tokens and flags a template uses", () => {
  const { vars, flags } = referenced("{{a}}{{#if f}}{{b}}{{/if}}");
  assert.deepEqual(vars, ["a", "b"]);
  assert.deepEqual(flags, ["f"]);
});
