/**
 * Public surface of the `{{ }}` expression engine, for tooling that needs to
 * parse or lint expressions without running them (the editor's config-field
 * validation, docs generators). The runtime resolver stays internal.
 */
export {
  type ExpressionOperand,
  hasTemplate,
  parseExpression,
  resolveTemplate,
  type TemplateScope,
} from './internal/template';
