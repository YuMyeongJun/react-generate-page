/**
 * Name conversions.
 *
 * These are byte-for-byte the functions that shipped in 0.1.37 and are covered
 * by tests/naming.test.ts against fixtures captured from that release. Changing
 * them renames files in every existing user's repository — don't.
 */

export function toCamelCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

export function toPascalCase(str: string): string {
  // Already PascalCase — keep it as typed.
  if (/^[A-Z][a-zA-Z0-9]*$/.test(str)) {
    return str;
  }

  return str
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
    .join("-");
}
