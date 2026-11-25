// Licensed under the GNU General Public License v2 or later. See LICENSE.
// A fit's own function (2026-11-18): a formula such as `a * exp(-b * x) + c`, read by a small parser of its own and
// evaluated as a tree of closures. A formula is saved in documents, so it is never run as code: it can name x, its
// parameters, the numbers pi and e, and the functions below, and nothing else.

/** The functions a formula may call, each of one argument. */
const FUNCTIONS: Record<string, (value: number) => number> = {
  exp: Math.exp, ln: Math.log, log: Math.log10, sqrt: Math.sqrt, abs: Math.abs,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
};
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };
export const EXPRESSION_FUNCTIONS = Object.keys(FUNCTIONS);

/** A read formula: its parameters, in the order they first appear, and its value at x for their values. */
export interface FitExpression { text: string; parameters: string[]; evaluate: (x: number, values: readonly number[]) => number }

type Node = (x: number, values: readonly number[]) => number;
interface Token { kind: "number" | "name" | "op"; text: string; at: number }

function tokens(text: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (/\s/.test(char)) { i++; continue; }
    const number = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (number) { out.push({ kind: "number", text: number[0], at: i }); i += number[0].length; continue; }
    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
    if (name) { out.push({ kind: "name", text: name[0], at: i }); i += name[0].length; continue; }
    // A typed minus or times sign reads as its keyboard form.
    const op = char === "−" ? "-" : char === "×" || char === "·" ? "*" : char;
    if (!"+-*/^(),".includes(op)) return `The formula cannot hold ${char}.`;
    out.push({ kind: "op", text: op, at: i });
    i++;
  }
  return out;
}

/** Read a formula in x, or say what is wrong with it. Names other than x, pi, e and the functions are its parameters. */
export function parseExpression(text: string): FitExpression | string {
  const read = tokens(text);
  if (typeof read === "string") return read;
  const list: Token[] = read;
  if (!list.length) return "The formula is empty.";
  const parameters: string[] = [];
  let at = 0;
  const peek = () => list[at];
  const fail = (message: string): never => { throw new Error(message); };
  const expect = (op: string) => { if (peek()?.text !== op) fail(peek() ? `Expected ${op} before ${peek().text}.` : `Expected ${op} at the end.`); at++; };

  // sum := product (('+'|'-') product)*; product := unary (('*'|'/') unary)*; unary := '-' unary | power;
  // power := atom ('^' unary)?, so that 2^-x and -x^2 = -(x^2) read as in mathematics.
  function sum(): Node {
    let left = product();
    while (peek()?.text === "+" || peek()?.text === "-") {
      const op = list[at++].text, right = product(), a = left;
      left = op === "+" ? (x, v) => a(x, v) + right(x, v) : (x, v) => a(x, v) - right(x, v);
    }
    return left;
  }
  function product(): Node {
    let left = unary();
    while (peek()?.text === "*" || peek()?.text === "/") {
      const op = list[at++].text, right = unary(), a = left;
      left = op === "*" ? (x, v) => a(x, v) * right(x, v) : (x, v) => a(x, v) / right(x, v);
    }
    return left;
  }
  function unary(): Node {
    if (peek()?.text === "-") { at++; const inner = unary(); return (x, v) => -inner(x, v); }
    if (peek()?.text === "+") { at++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek()?.text !== "^") return base;
    at++;
    const exponent = unary();
    return (x, v) => base(x, v) ** exponent(x, v);
  }
  function atom(): Node {
    const token = peek();
    if (!token) return fail("The formula ends too soon.");
    at++;
    if (token.kind === "number") { const value = Number(token.text); return () => value; }
    if (token.text === "(") { const inner = sum(); expect(")"); return inner; }
    if (token.kind !== "name") return fail(`Unexpected ${token.text}.`);
    const name = token.text;
    if (peek()?.text === "(") {
      const f = FUNCTIONS[name.toLowerCase()];
      if (!f) return fail(`${name} is not a function; the functions are ${EXPRESSION_FUNCTIONS.join(", ")}.`);
      at++;
      const argument = sum();
      expect(")");
      return (x, v) => f(argument(x, v));
    }
    if (name === "x") return (x) => x;
    if (name in CONSTANTS) { const value = CONSTANTS[name]; return () => value; }
    if (name.toLowerCase() in FUNCTIONS) return fail(`${name} needs its value in brackets, as ${name}(x).`);
    let index = parameters.indexOf(name);
    if (index < 0) { index = parameters.length; parameters.push(name); }
    const slot = index;
    return (_x, v) => v[slot];
  }

  try {
    const root = sum();
    if (at < list.length) fail(`Unexpected ${list[at].text}.`);
    if (!parameters.length) return "The formula has no parameter to fit; name one, as a in a * x.";
    if (parameters.length > 12) return "A formula takes at most 12 parameters.";
    return { text: text.trim(), parameters, evaluate: root };
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
