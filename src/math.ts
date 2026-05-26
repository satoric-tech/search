import { parse, OperatorNode, FunctionNode, SymbolNode, ConstantNode } from "mathjs";
import type { MathNode } from "mathjs";

const MATH_FUNS: Record<string, string> = {
  log: "Math.log",
  ln: "Math.log",
  log2: "Math.log2",
  log10: "Math.log10",
  sqrt: "Math.sqrt",
  exp: "Math.exp",
  abs: "Math.abs",
  max: "Math.max",
  min: "Math.min",
  pow: "Math.pow",
  floor: "Math.floor",
  ceil: "Math.ceil",
  round: "Math.round",
};

function toNode(node: MathNode): string {
  if (node instanceof OperatorNode) {
    const args = node.args.map(toNode);
    if (args.length === 1) return `(${node.op}${args[0]})`;
    return `(${args[0]} ${node.op} ${args[1]})`;
  }
  if (node instanceof FunctionNode) {
    const args = node.args.map(toNode).join(", ");
    const fnName = (node.fn as SymbolNode).name;
    const name = MATH_FUNS[fnName] ?? `Math.${fnName}`;
    return `${name}(${args})`;
  }
  if (node instanceof SymbolNode) {
    return `(doc['${node.name}'].size() > 0 ? doc['${node.name}'].value : 0.0)`;
  }
  if (node instanceof ConstantNode) {
    return String(node.value);
  }
  throw new Error(`unsupported expression type: ${node.type}`);
}

export function toPainless(expr: string): string {
  try {
    return toNode(parse(expr));
  } catch (e) {
    throw new Error(`invalid boost expression "${expr}": ${(e as Error).message}`);
  }
}
