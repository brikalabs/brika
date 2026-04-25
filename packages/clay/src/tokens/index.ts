/**
 * Public surface of the token registry. Imported by the build script that
 * generates the CSS files, by the docs site, and (in step 4) by `themes/`
 * to type the `ThemeConfig` JSON.
 */
export { inferTokenType, inferTokenTypeStrict, TOKEN_TYPE_HINT } from './infer';
export { TOKEN_REGISTRY, TOKENS_BY_NAME, tokensByType } from './registry';
export type {
  BorderStyle,
  ResolvedTokenSpec,
  TailwindNamespace,
  TokenCategory,
  TokenLayer,
  TokenSpec,
  TokenType,
} from './types';
