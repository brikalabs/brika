/**
 * Token-name conversion helpers.
 *
 * Clay's component-token registry surfaces token suffixes in kebab-case
 * (`padding-x`, `border-radius`), but Clay's flatten walker requires keys
 * under `components.<name>` to be camelCase (it kebabs them at emit time:
 * `paddingX` → `--button-padding-x`). Storage uses camelCase; the UI uses
 * kebab when reading from Clay's registry.
 */

export function kebabToCamel(input: string): string {
  return input.replaceAll(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

export function camelToKebab(input: string): string {
  return input.replaceAll(/([A-Z])/g, (ch) => `-${ch.toLowerCase()}`);
}
