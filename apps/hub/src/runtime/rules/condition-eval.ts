import type { Json } from "@elia/shared";

/**
 * Safe condition evaluator for rules.
 * Supports simple expressions like:
 *   - event.payload.brightness < 50
 *   - event.type == "motion.detected"
 *   - payload.temperature > 20 && payload.humidity < 80
 *   - true / false
 */

type Context = {
  event?: {
    id: string;
    type: string;
    source: string;
    payload: Json;
    ts: number;
  };
  schedule?: {
    id: string;
    name: string;
  };
};

export function evaluateCondition(expr: string, ctx: Context): boolean {
  if (!expr || expr.trim() === "" || expr.trim() === "true") return true;
  if (expr.trim() === "false") return false;

  try {
    // Create a safe evaluation context
    const safeCtx = {
      event: ctx.event ?? null,
      schedule: ctx.schedule ?? null,
      payload: ctx.event?.payload ?? null,
    };

    // Tokenize and evaluate
    return evaluate(expr, safeCtx);
  } catch {
    return false;
  }
}

type EvalContext = {
  event: { id: string; type: string; source: string; payload: Json; ts: number } | null;
  schedule: { id: string; name: string } | null;
  payload: Json | null;
};

function evaluate(expr: string, ctx: EvalContext): boolean {
  expr = expr.trim();

  // Handle && (AND)
  const andParts = splitLogical(expr, "&&");
  if (andParts.length > 1) {
    return andParts.every((p) => evaluate(p, ctx));
  }

  // Handle || (OR)
  const orParts = splitLogical(expr, "||");
  if (orParts.length > 1) {
    return orParts.some((p) => evaluate(p, ctx));
  }

  // Handle parentheses
  if (expr.startsWith("(") && expr.endsWith(")")) {
    return evaluate(expr.slice(1, -1), ctx);
  }

  // Handle negation
  if (expr.startsWith("!")) {
    return !evaluate(expr.slice(1), ctx);
  }

  // Handle comparison operators
  const compOps = ["===", "!==", "==", "!=", "<=", ">=", "<", ">"];
  for (const op of compOps) {
    const idx = expr.indexOf(op);
    if (idx > 0) {
      const left = resolveValue(expr.slice(0, idx).trim(), ctx);
      const right = resolveValue(expr.slice(idx + op.length).trim(), ctx);
      return compare(left, op, right);
    }
  }

  // Simple truthy check
  const val = resolveValue(expr, ctx);
  return Boolean(val);
}

function splitLogical(expr: string, op: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && expr.slice(i, i + op.length) === op) {
      parts.push(expr.slice(start, i));
      start = i + op.length;
    }
  }

  parts.push(expr.slice(start));
  return parts.filter((p) => p.trim()).map((p) => p.trim());
}

function resolveValue(expr: string, ctx: EvalContext): Json {
  expr = expr.trim();

  // String literal
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
    return expr.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return Number(expr);
  }

  // Boolean
  if (expr === "true") return true;
  if (expr === "false") return false;
  if (expr === "null") return null;

  // Property path (e.g., event.payload.brightness)
  const parts = expr.split(".");
  let current: Json = ctx as unknown as Json;

  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, Json>)[part] ?? null;
  }

  return current;
}

function compare(left: Json, op: string, right: Json): boolean {
  switch (op) {
    case "===":
    case "==":
      return left === right;
    case "!==":
    case "!=":
      return left !== right;
    case "<":
      return typeof left === "number" && typeof right === "number" && left < right;
    case ">":
      return typeof left === "number" && typeof right === "number" && left > right;
    case "<=":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case ">=":
      return typeof left === "number" && typeof right === "number" && left >= right;
    default:
      return false;
  }
}

