import assert from "node:assert/strict";
import { test } from "node:test";

import { toCamelCase, toKebabCase, toPascalCase } from "../src/naming.js";

test("toPascalCase keeps an already-PascalCase name as typed", () => {
  // Pinned by tests/legacy-parity.test.ts against 0.1.37 fixtures too.
  assert.equal(toPascalCase("TestPage"), "TestPage");
  assert.equal(toPascalCase("ABCPage"), "ABCPage");
});

test("toPascalCase converts separator-delimited names", () => {
  assert.equal(toPascalCase("user-list"), "UserList");
  assert.equal(toPascalCase("solo_page"), "SoloPage");
  assert.equal(toPascalCase("two words"), "TwoWords");
});

test("toCamelCase splits camelCase boundaries, not just separators", () => {
  // The old implementation returned "invoicelist" here, because it only split
  // on -, _ and whitespace. It was never called, so nothing depended on that.
  assert.equal(toCamelCase("InvoiceList"), "invoiceList");
  assert.equal(toCamelCase("TestPage"), "testPage");
  assert.equal(toCamelCase("user-list"), "userList");
  assert.equal(toCamelCase("solo_page"), "soloPage");
  assert.equal(toCamelCase("already"), "already");
});

test("toKebabCase handles both input styles", () => {
  assert.equal(toKebabCase("InvoiceList"), "invoice-list");
  assert.equal(toKebabCase("user-list"), "user-list");
  assert.equal(toKebabCase("SoloPage"), "solo-page");
});

test("the three conversions agree on word boundaries", () => {
  for (const input of ["InvoiceList", "user-list", "solo_page", "TwoWords"]) {
    const camel = toCamelCase(input);
    const kebab = toKebabCase(input);
    assert.equal(
      kebab.split("-").length,
      camel.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(" ").length,
      `${input}: camel "${camel}" and kebab "${kebab}" disagree on word count`
    );
  }
});
