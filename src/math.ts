// Converts a simple JS-style boost expression to a Painless script for OpenSearch.
// Supports: numeric literals, identifiers (mapped to doc field values), +, -, *, /, parens.
// Example: "1 - rank/1000000" → "1.0 - doc['rank'].value / 1000000.0"

type Token =
  | { type: "num"; val: string }
  | { type: "id"; val: string }
  | { type: "op"; val: string }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }
    if (/[0-9]/.test(expr[i]) || (expr[i] === "." && /[0-9]/.test(expr[i + 1] ?? ""))) {
      let s = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) s += expr[i++];
      tokens.push({ type: "num", val: s });
    } else if (/[a-zA-Z_]/.test(expr[i])) {
      let s = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) s += expr[i++];
      tokens.push({ type: "id", val: s });
    } else if ("+-*/".includes(expr[i])) {
      tokens.push({ type: "op", val: expr[i++] });
    } else if (expr[i] === "(") {
      tokens.push({ type: "lparen" });
      i++;
    } else if (expr[i] === ")") {
      tokens.push({ type: "rparen" });
      i++;
    } else {
      throw new Error(`unexpected character '${expr[i]}' in boost expression`);
    }
  }
  return tokens;
}

function toPainlessToken(tok: Token): string {
  if (tok.type === "num") return tok.val.includes(".") ? tok.val : tok.val + ".0";
  if (tok.type === "id") return `doc['${tok.val}'].value`;
  if (tok.type === "op") return tok.val;
  if (tok.type === "lparen") return "(";
  return ")";
}

export function toPainless(expr: string): string {
  return tokenize(expr).map(toPainlessToken).join(" ");
}
