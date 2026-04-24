/**
 * @brika/clay — Brika's React component library and first-party themes.
 *
 * Public entry point. The package is currently in scaffolding phase: only
 * Button, Input, and Card are migrated. More components land in later PRs.
 *
 * Consumers should import from `@brika/clay` rather than reaching into
 * individual component folders.
 */

export type { ButtonProps, ButtonTokenKey } from './components/Button';
export { Button, buttonTokens, buttonVariants } from './components/Button';
export type { CardProps, CardTokenKey } from './components/Card';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardTokens,
  cardVariants,
} from './components/Card';
export type { InputProps, InputTokenKey } from './components/Input';
export { Input, inputTokens } from './components/Input';
export { cn } from './primitives/cn';
export { cssVars } from './primitives/cssVars';
