import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ComponentDoc,
  type ParserOptions,
  withCustomConfig,
  withDefaultConfig,
} from 'react-docgen-typescript';

/**
 * Runs react-docgen-typescript over `packages/clay/src/components/<slug>/<slug>.tsx`
 * at build start (and on file change in dev), then exposes the result as a
 * virtual module so the docs site can render a per-component props table without
 * a separate generation step.
 *
 * Props inherited from `node_modules` are filtered out — without that, every
 * native-attribute-passthrough component would surface ~80 HTML props.
 */

export interface ClayDocgenPluginOptions {
  readonly dev: boolean;
}

interface ClayDocgenPlugin {
  readonly name: string;
  resolveId(source: string): string | null;
  load(id: string): string | null;
  configureServer?(server: ViteDevServer): void;
}

interface ViteDevServer {
  readonly watcher: { add(path: string): void };
  readonly moduleGraph: {
    getModuleById(id: string): unknown;
    invalidateModule(mod: unknown): void;
  };
  ws?: { send(payload: { type: 'full-reload' }): void };
}

const VIRTUAL_ID = 'virtual:clay-docgen';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

export interface ClayPropDoc {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly defaultValue: string | null;
  readonly description: string;
}

export interface ClayComponentDoc {
  readonly displayName: string;
  readonly description: string;
  readonly props: readonly ClayPropDoc[];
}

const SKIPPED_PROPS = new Set(['key', 'ref']);

/**
 * Generic description fallback for props that recur across many Radix-based
 * primitives. Lets us document them once globally instead of asking every
 * component to repeat the same TSDoc.
 */
const COMMON_PROP_DESCRIPTIONS: Readonly<Record<string, string>> = {
  asChild:
    'When true, render the child element instead of the default DOM node and merge props. Lets you compose with `<a>`, `<Link>`, or another primitive while keeping behavior and styling.',
};

/**
 * Looks like a hook (camelCase starting with "use"), not a component.
 * react-docgen-typescript picks these up when their argument type is shaped
 * like a React props object; we drop them from the output.
 */
function isHookName(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

function listComponentSlugs(componentsDir: string): readonly string[] {
  return readdirSync(componentsDir).filter((entry) => {
    const full = resolve(componentsDir, entry);
    return statSync(full).isDirectory();
  });
}

function componentEntryFile(componentsDir: string, slug: string): string | null {
  const candidate = resolve(componentsDir, slug, `${slug}.tsx`);
  return existsSync(candidate) ? candidate : null;
}

function buildParser(tsconfigPath: string | null): (files: string[]) => ComponentDoc[] {
  const parserOptions: ParserOptions = {
    savePropValueAsString: true,
    shouldExtractLiteralValuesFromEnum: true,
    shouldRemoveUndefinedFromOptional: true,
    propFilter: (prop) => {
      if (SKIPPED_PROPS.has(prop.name)) {
        return false;
      }
      if (prop.parent) {
        return !prop.parent.fileName.includes('node_modules');
      }
      return true;
    },
  };
  const parser =
    tsconfigPath && existsSync(tsconfigPath)
      ? withCustomConfig(tsconfigPath, parserOptions)
      : withDefaultConfig(parserOptions);
  return (files) => parser.parse(files);
}

function normalizeDocs(docs: readonly ComponentDoc[]): Record<string, ClayComponentDoc> {
  const out: Record<string, ClayComponentDoc> = {};
  for (const doc of docs) {
    if (!doc.displayName || isHookName(doc.displayName)) {
      continue;
    }
    const props = Object.values(doc.props).map<ClayPropDoc>((prop) => {
      const tsdoc = prop.description?.trim() ?? '';
      const fallback = COMMON_PROP_DESCRIPTIONS[prop.name] ?? '';
      return {
        name: prop.name,
        type: prop.type?.name ?? 'unknown',
        required: prop.required,
        defaultValue: prop.defaultValue?.value ?? null,
        description: tsdoc || fallback,
      };
    });
    props.sort((a, b) => {
      if (a.required !== b.required) {
        return a.required ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    out[doc.displayName] = {
      displayName: doc.displayName,
      description: doc.description ?? '',
      props,
    };
  }
  return out;
}

export function clayDocgenPlugin(_options: ClayDocgenPluginOptions): ClayDocgenPlugin {
  const here = dirname(fileURLToPath(import.meta.url));
  const claySrc = resolve(here, '../../../../packages/clay/src');
  const componentsDir = resolve(claySrc, 'components');
  const tsconfigPath = resolve(claySrc, '..', 'tsconfig.json');

  const watchedFiles = new Set<string>();
  let cache: Record<string, ClayComponentDoc> | null = null;

  function generate(): Record<string, ClayComponentDoc> {
    const slugs = listComponentSlugs(componentsDir);
    const files = slugs
      .map((slug) => componentEntryFile(componentsDir, slug))
      .filter((file): file is string => file !== null);
    for (const file of files) {
      watchedFiles.add(file);
    }
    const parse = buildParser(tsconfigPath);
    const docs = parse(files);
    return normalizeDocs(docs);
  }

  function getDocs(): Record<string, ClayComponentDoc> {
    cache ??= generate();
    return cache;
  }

  return {
    name: 'clay-docgen',
    resolveId(source: string): string | null {
      return source === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(id: string): string | null {
      if (id !== RESOLVED_VIRTUAL_ID) {
        return null;
      }
      const docs = getDocs();
      return `export default ${JSON.stringify(docs)};\n`;
    },
    configureServer(server) {
      // Eagerly populate so the watcher knows which files matter.
      getDocs();
      for (const file of watchedFiles) {
        server.watcher.add(file);
      }
      const onChange = (file: string) => {
        if (!watchedFiles.has(file)) {
          return;
        }
        cache = null;
        const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws?.send({ type: 'full-reload' });
      };
      const watcher = server.watcher as unknown as {
        on(event: string, cb: (file: string) => void): void;
      };
      watcher.on('change', onChange);
      watcher.on('add', onChange);
      watcher.on('unlink', onChange);
    },
  };
}
