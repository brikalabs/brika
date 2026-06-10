/**
 * Static checks for `{{ }}` expressions in config fields, against the block's
 * actual ports and config keys. Pure; rendered as inline warnings by the
 * config panel so a typo'd port name is caught while typing, not at runtime.
 */

import { type ExpressionOperand, parseExpression } from '@brika/sdk/expressions';

export interface ExpressionWarning {
  /** The raw expression text (without braces). */
  expression: string;
  message: string;
}

const EXPRESSION = /\{\{([^{}]+)\}\}/g;

export function lintExpressions(
  value: string,
  inputPortIds: ReadonlyArray<string>,
  configKeys: ReadonlyArray<string>
): ExpressionWarning[] {
  const warnings: ExpressionWarning[] = [];
  for (const match of value.matchAll(EXPRESSION)) {
    const expression = (match[1] ?? '').trim();
    const operands = parseExpression(expression);
    if (!operands) {
      warnings.push({ expression, message: 'invalid' });
      continue;
    }
    for (const operand of operands) {
      const warning = lintOperand(operand, inputPortIds, configKeys);
      if (warning) {
        warnings.push({ expression, message: warning });
        break;
      }
    }
  }
  return warnings;
}

function lintOperand(
  operand: ExpressionOperand,
  inputPortIds: ReadonlyArray<string>,
  configKeys: ReadonlyArray<string>
): string | null {
  if (operand.kind !== 'path') {
    return null;
  }
  const [root, key] = operand.segments;
  if (root !== 'inputs' && root !== 'config') {
    return `unknown root "${root}"`;
  }
  if (root === 'inputs' && key !== undefined && !inputPortIds.includes(key)) {
    return `unknown input port "${key}"`;
  }
  if (root === 'config' && key !== undefined && !configKeys.includes(key)) {
    return `unknown config key "${key}"`;
  }
  return null;
}
