/**
 * @brika/clay — Brika's React component library and first-party themes.
 *
 * Public entry point. The package is currently in scaffolding phase: only
 * Button, Input, and Card are migrated. More components land in later PRs.
 *
 * Consumers should import from `@brika/clay` rather than reaching into
 * individual component folders.
 */

export type { ButtonProps, ButtonTokenKey } from './components/button';
export { Button, buttonTokens, buttonVariants } from './components/button';
export type { CardProps, CardTokenKey } from './components/card';
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardTokens,
  cardVariants,
} from './components/card';
export type { InputProps, InputTokenKey } from './components/input';
export { Input, inputTokens } from './components/input';
export { cn } from './primitives/cn';
export { cssVars } from './primitives/cssVars';
