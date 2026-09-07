/**
 * Name conversions.
 *
 * `toPascalCase` is byte-for-byte the function that shipped in 0.1.37 and is
 * covered by tests/legacy-parity.test.ts against fixtures captured from that
 * release. Changing it renames files in every existing user's repository - don't.
 *
 * `toCamelCase` is *not* preserved. 0.1.37 defined it and never called it, so no
 * released version's output depended on it - and as written it only split on
 * `-`, `_` and spaces, so a PascalCase input collapsed to one lowercase word
 * ("InvoiceList" -> "invoicelist"). It now splits camelCase boundaries too.
 */

/** Split into words on separators *and* camelCase boundaries. */
function words(str: string): string[] {
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean);
}

export function toCamelCase(str: string): string {
  return words(str)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

export function toPascalCase(str: string): string {
  // Already PascalCase - keep it as typed.
  if (/^[A-Z][a-zA-Z0-9]*$/.test(str)) {
    return str;
  }

  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function toKebabCase(str: string): string {
  return words(str)
    .map((word) => word.toLowerCase())
    .join("-");
}
