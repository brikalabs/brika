/**
 * Public surface of the token registry. Imported by the Tailwind plugin
 * (`../tailwind.ts`) that contributes CSS at compile time, by the docs
 * site to render the token table, and by `themes/` to type / flatten
 * theme JSON at runtime.
 */
export { inferTokenType, inferTokenTypeStrict, TOKEN_TYPE_HINT } from './infer';
export { TOKEN_REGISTRY, TOKENS_BY_NAME, tokensByType } from './registry';
export type {
  ResolvedTokenSpec,
  TailwindNamespace,
  TokenCategory,
  TokenLayer,
  TokenSpec,
  TokenType,
} from './types';
