/**
 * The template engine. Zero dependencies, by design — see README "Why this and
 * not plop/hygen".
 *
 * Syntax, deliberately tiny:
 *   {{Name}}                       token substitution
 *   {{#if flag}} ... {{/if}}       keep body when flag is on
 *   {{#unless flag}} ... {{/unless}}
 *
 * Two rules that matter:
 *
 * 1. Whitespace is never trimmed. Conditional bodies are spliced in verbatim,
 *    because the output is source code a human will read and the indentation is
 *    part of it.
 * 2. An unknown token or flag is an error, not an empty string. A generator that
 *    quietly writes `{{Nmae}}` into somebody's component has produced broken
 *    code and told them it succeeded.
 */

export class TemplateError extends Error {}

export type TemplateVars = Record<string, string>;
export type TemplateFlags = Record<string, boolean>;

type Node =
  | { kind: "text"; value: string }
  | { kind: "var"; name: string }
  | { kind: "cond"; negate: boolean; name: string; body: Node[] };

const TAG = /\{\{(#if|#unless|\/if|\/unless)?\s*([A-Za-z0-9_]*)\s*\}\}/g;

function parse(tpl: string, where: string): Node[] {
  const root: Node[] = [];
  const stack: { node: Extract<Node, { kind: "cond" }>; list: Node[] }[] = [];
  let list = root;
  let last = 0;

  const text = (value: string) => {
    if (value) list.push({ kind: "text", value });
  };

  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(tpl)) !== null) {
    text(tpl.slice(last, m.index));
    last = m.index + m[0].length;
    const [, tag, name] = m;

    if (tag === "#if" || tag === "#unless") {
      if (!name) {
        throw new TemplateError(`${where}: ${tag} needs a flag name`);
      }
      const node: Extract<Node, { kind: "cond" }> = {
        kind: "cond",
        negate: tag === "#unless",
        name,
        body: [],
      };
      list.push(node);
      stack.push({ node, list });
      list = node.body;
    } else if (tag === "/if" || tag === "/unless") {
      const open = stack.pop();
      if (!open) {
        throw new TemplateError(`${where}: {{${tag}}} without a matching open tag`);
      }
      const expected = open.node.negate ? "/unless" : "/if";
      if (tag !== expected) {
        throw new TemplateError(
          `${where}: {{${tag}}} closes {{#${open.node.negate ? "unless" : "if"} ${open.node.name}}} — use {{${expected}}}`
        );
      }
      list = open.list;
    } else {
      if (!name) {
        throw new TemplateError(`${where}: empty {{}} token`);
      }
      list.push({ kind: "var", name });
    }
  }
  text(tpl.slice(last));

  if (stack.length > 0) {
    const open = stack[stack.length - 1].node;
    throw new TemplateError(
      `${where}: {{#${open.negate ? "unless" : "if"} ${open.name}}} is never closed`
    );
  }
  return root;
}

function emit(
  nodes: Node[],
  vars: TemplateVars,
  flags: TemplateFlags,
  where: string
): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") {
      out += node.value;
    } else if (node.kind === "var") {
      if (!Object.prototype.hasOwnProperty.call(vars, node.name)) {
        throw new TemplateError(
          `${where}: unknown token {{${node.name}}}. Available: ${Object.keys(vars).sort().join(", ")}`
        );
      }
      out += vars[node.name];
    } else {
      if (!Object.prototype.hasOwnProperty.call(flags, node.name)) {
        throw new TemplateError(
          `${where}: unknown flag "${node.name}". Declared flags: ${Object.keys(flags).sort().join(", ") || "(none)"}`
        );
      }
      const on = node.negate ? !flags[node.name] : flags[node.name];
      if (on) {
        out += emit(node.body, vars, flags, where);
      }
    }
  }
  return out;
}

export function render(
  tpl: string,
  vars: TemplateVars,
  flags: TemplateFlags,
  where = "template"
): string {
  return emit(parse(tpl, where), vars, flags, where);
}

/** Tokens and flags a template references — used by `validateConfig`. */
export function referenced(tpl: string, where = "template"): {
  vars: string[];
  flags: string[];
} {
  const vars = new Set<string>();
  const flags = new Set<string>();
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.kind === "var") vars.add(n.name);
      else if (n.kind === "cond") {
        flags.add(n.name);
        walk(n.body);
      }
    }
  };
  walk(parse(tpl, where));
  return { vars: [...vars].sort(), flags: [...flags].sort() };
}
