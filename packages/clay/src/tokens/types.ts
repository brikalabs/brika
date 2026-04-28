/**
 * Shape of Clay's token registry.
 *
 * The registry at `./registry.ts` is the single source of truth for every CSS
 * custom property that participates in Clay's theming system. The Tailwind v4
 * plugin in `../tailwind.ts` reads it at compile time and emits, in one pass:
 *
 *   1. `:root { --token: default; … }` for every Layer 0 (scalars) and
 *      Layer 1 (roles) entry, plus any Layer 2 entry whose default is a
 *      literal or that hand-authored CSS reads directly via `var(--token)`.
 *   2. A dark-mode override block for tokens with a distinct `defaultDark`.
 *   3. `theme.extend` mappings (colors, borderRadius, boxShadow, fontFamily,
 *      fontSize, opacity, blur, transitionDuration, transitionTimingFunction)
 *      so utilities like `bg-slider-fill`, `rounded-card`, `shadow-button`
 *      resolve through namespaced tokens.
 *
 * The registry has three layers; see `TokenLayer`.
 */

/**
 * Three-layer hierarchy. Layer 0 scalars cascade into Layer 1 roles which
 * cascade into Layer 2 component-scoped tokens. A theme can override at any
 * layer, but the most specific override wins.
 */
export type TokenLayer = 'scalar' | 'role' | 'component';

/**
 * Coarse visual category used to group tokens in docs tables and theme
 * sub-trees. Multiple `TokenType`s can share a category (e.g. `border-width`
 * and `border-style` both belong to `border`). Adding a new type rarely
 * requires a new category — categories are about how docs READ, types are
 * about what the value IS.
 */
export type TokenCategory =
  | 'color'
  | 'geometry'
  | 'border'
  | 'typography'
  | 'elevation'
  | 'focus'
  | 'motion'
  | 'state';

/**
 * Granular value type. Tells a consumer exactly what shape of value the
 * token holds — useful for runtime validation, auto-complete in theme
 * editors, generating typed override APIs, and rendering preview swatches.
 *
 * Inferred from the token name's suffix in the great majority of cases
 * (see `inferTokenType` in `./infer.ts`). Tokens whose name doesn't follow
 * the suffix convention (Layer-0 scalars like `radius`, `spacing`, role-
 * level color tokens) set `type` explicitly.
 *
 * Add a new type when adding a new PRIMITIVE value-shape (gradient, filter,
 * cubic-bezier alias, etc.) — not for every new component.
 */
export type TokenType =
  | 'color'
  | 'size' // height, width, gap, padding, offset — generic length
  | 'radius' // corner radius
  | 'border-width' // explicit border / outline / ring thickness
  | 'border-style' // solid / dashed / double / none
  | 'shadow' // box-shadow value
  | 'duration' // motion time
  | 'easing' // cubic-bezier or linear
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'line-height'
  | 'letter-spacing'
  | 'text-transform'
  | 'corner-shape' // round / bevel / squircle / scoop / notch
  | 'opacity' // 0-1
  | 'blur'; // blur length

/**
 * Tailwind v4 namespace prefix used by `@theme inline { ... }` to expose a
 * token as a utility. Codegen reads this to decide whether (and how) to
 * register the token with Tailwind.
 *
 *   `color`   → `bg-<name>`, `text-<name>`, `border-<name>` (for `--color-*`)
 *   `radius`  → `rounded-<name>` (for `--radius-*`)
 *   `shadow`  → `shadow-<name>` (for `--shadow-*`)
 *   `text`    → `text-<name>` size+line-height pair (for `--text-*`)
 *   `font`    → `font-<name>` (for `--font-*`)
 *   `motion`  → `duration-<name>` / `ease-<name>` (for `--motion-*-duration`/`-easing`)
 *   `opacity` → `opacity-<name>` and color modifier `<class>/<name>`
 *   `blur`    → `blur-<name>` / `backdrop-blur-<name>`
 *   `default` → bare name; Tailwind picks up `--default-*-width` etc.
 *   `none`    — token is consumed only by component CSS, not as a utility.
 */
export type TailwindNamespace =
  | 'color'
  | 'radius'
  | 'shadow'
  | 'text'
  | 'font'
  | 'motion'
  | 'opacity'
  | 'blur'
  | 'default'
  | 'none';

/**
 * One token in the registry, as authored.
 *
 *   name           — CSS custom property minus the leading `--`.
 *                    e.g. `'button-radius'` for `--button-radius`.
 *
 *   layer          — `'scalar'` | `'role'` | `'component'`.
 *
 *   category       — coarse grouping for docs (color / geometry / border /
 *                    typography / elevation / focus / motion / state).
 *
 *   type           — OPTIONAL granular value type. When omitted, derived
 *                    from `name` via `inferTokenType` (see `./infer.ts`).
 *                    Set explicitly only when the name doesn't follow the
 *                    suffix convention (Layer-0 scalars, role-level color
 *                    tokens whose name doesn't suffix-match).
 *
 *   appliesTo      — required when `layer === 'component'`. Identifies which
 *                    component owns the token. Multiple specs may share an
 *                    `appliesTo` (e.g. button has many tokens).
 *
 *   defaultLight   — value used in light mode when no theme overrides.
 *
 *   defaultDark    — light-mode value remains in effect when omitted.
 *
 *   description    — one-sentence prose. Shown in docs tables.
 *
 *   themePath      — dotted camelCase path inside `ThemeConfig` that targets
 *                    this token. Omitted for derived tokens that have no
 *                    direct theme entry.
 *
 *   tailwindNamespace — if set, codegen emits this token in `@theme inline`
 *                    so it becomes a Tailwind utility; see `TailwindNamespace`.
 *
 *   utilityAlias   — name registered with the namespace, defaulting to
 *                    `name`. Set when the utility name differs from the var
 *                    name (e.g. `--motion-instant-duration` →
 *                    `duration-instant`).
 *
 *   lineHeight     — companion line-height for `text-*` size tokens.
 *                    When set, the plugin emits a paired
 *                    `--<name>--line-height` declaration alongside the
 *                    size so Tailwind v4's `text-*` utility resolves
 *                    both font-size AND line-height in one class.
 */
export interface TokenSpec {
  readonly name: string;
  readonly layer: TokenLayer;
  readonly category: TokenCategory;
  readonly type?: TokenType;
  readonly appliesTo?: string;
  readonly defaultLight: string;
  readonly defaultDark?: string;
  readonly description: string;
  readonly themePath?: string;
  readonly tailwindNamespace?: TailwindNamespace;
  readonly utilityAlias?: string;
  readonly lineHeight?: string;
}

/**
 * Token spec after `type` has been filled in. The registry export and every
 * downstream consumer (codegen, docs, validators) work with this resolved
 * shape so `type` is always present.
 */
export interface ResolvedTokenSpec extends TokenSpec {
  readonly type: TokenType;
}
