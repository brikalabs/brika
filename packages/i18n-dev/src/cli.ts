#!/usr/bin/env bun
/// <reference types="bun-types" />

/**
 * brika-i18n — unified CLI for @brika/i18n-devtools.
 *
 * Subcommands:
 *   types  Generate type declarations (resource interfaces, namespace list,
 *          and a registry augmentation) for a locales directory.
 *   check  Validate locale parity for core + workspace plugin translations.
 *          Exits non-zero on errors. Use --ci to make warnings fatal too.
 *
 * Both subcommands auto-discover the workspace root from the current cwd,
 * so running via `bun --filter <pkg>` works regardless of which package
 * directory bun ends up in.
 */

const argv = process.argv.slice(2);
const subcommand = argv[0] ?? 'help';

switch (subcommand) {
  case 'types':
    await import('./generate-types');
    break;
  case 'check':
    await import('./check');
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    printHelp();
    process.exit(1);
}

function printHelp(): void {
  console.log(`brika-i18n — i18n developer tools

Usage: bunx @brika/i18n-devtools <command> [flags]

Commands:
  types          Generate TypeScript declarations from a reference-locale folder
                   --locales <dir>             Reference-locale folder (default: <cwd>/src/locales/<reference-locale>)
                   --reference-locale <code>   Locale used to derive types (default: en)
                   --out <dir>                 Output directory (default: <cwd>/node_modules/.cache/@brika/i18n-devtools)
                   --module <name>             Augment a custom module (default: @brika/i18n/registry)
                   --default-namespace <ns>    i18next default namespace (default: translation)

  check          Validate locale parity using union semantics
                   --locales <dir>             Core locales directory (default: <cwd>/src/locales)
                   --reference-locale <code>   Display-language hint for error messages (default: en)
                   --ci                        Treat warnings as errors

Examples:
  bunx @brika/i18n-devtools check
  bunx @brika/i18n-devtools check --ci
  bunx @brika/i18n-devtools types --locales ./locales/en --out ./dist/types
`);
}
