import { useEffect, useState } from 'react';

type Manager = 'bun' | 'npm' | 'pnpm' | 'yarn';

const MANAGERS: readonly Manager[] = ['bun', 'npm', 'pnpm', 'yarn'];

const STORAGE_KEY = 'clay-pkg-manager';
const SYNC_EVENT = 'clay-pkg-manager-change';

function isManager(value: unknown): value is Manager {
  return value === 'bun' || value === 'npm' || value === 'pnpm' || value === 'yarn';
}

function readInitial(): Manager {
  if (typeof localStorage === 'undefined') {
    return 'bun';
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return isManager(stored) ? stored : 'bun';
}

interface ManagerSpec {
  readonly install: string;
  readonly devFlag: string;
  /** When `null`, global installs use a separate `${install} global add` form. */
  readonly globalFlag: string | null;
}

const SPECS: Readonly<Record<Manager, ManagerSpec>> = {
  npm: { install: 'npm install', devFlag: '-D', globalFlag: '-g' },
  pnpm: { install: 'pnpm add', devFlag: '-D', globalFlag: '-g' },
  bun: { install: 'bun add', devFlag: '-d', globalFlag: '-g' },
  yarn: { install: 'yarn add', devFlag: '-D', globalFlag: null },
};

/**
 * Build the install command for the chosen package manager.
 *
 * Handles flag differences between managers:
 * - npm / pnpm / bun: `-D` (`-d` for bun) for dev, `-g` for global.
 * - yarn: `-D` for dev, but `yarn global add` for global (no `-g` flag).
 */
function buildCommand(manager: Manager, pkg: string, dev: boolean, isGlobal: boolean): string {
  const spec = SPECS[manager];
  const target = pkg.trim();
  if (isGlobal && spec.globalFlag === null) {
    return `${spec.install.split(' ')[0]} global add ${target}`;
  }
  const flags: string[] = [];
  if (isGlobal && spec.globalFlag) {
    flags.push(spec.globalFlag);
  }
  if (dev) {
    flags.push(spec.devFlag);
  }
  return [spec.install, ...flags, target].join(' ');
}

interface PackageManagerProps {
  /** Package specifier — e.g. `@brika/clay` or `react react-dom tailwindcss`. */
  readonly package: string;
  /** Install as a devDependency (`-D` / `-d`). */
  readonly dev?: boolean;
  /** Install globally (`-g` / `yarn global add`). */
  readonly global?: boolean;
}

/**
 * Renders a tabbed install command block. The active manager is shared
 * across every `<PackageManager />` on the page via `localStorage` and a
 * custom `clay-pkg-manager-change` event — picking `pnpm` in one block
 * flips every other block simultaneously.
 */
export function PackageManager(props: PackageManagerProps) {
  const { package: pkg, dev = false, global: isGlobal = false } = props;
  const [manager, setManager] = useState<Manager>('bun');
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setManager(readInitial());
    setMounted(true);

    const handler = (event: Event) => {
      if (event instanceof CustomEvent && isManager(event.detail)) {
        setManager(event.detail);
      }
    };
    globalThis.addEventListener(SYNC_EVENT, handler);
    return () => globalThis.removeEventListener(SYNC_EVENT, handler);
  }, []);

  const select = (next: Manager) => {
    if (next === manager) {
      return;
    }
    setManager(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — keep the in-memory selection.
    }
    globalThis.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
  };

  const command = buildCommand(manager, pkg, dev, isGlobal);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked — keep the visible command intact.
    }
  };

  return (
    <div className="not-prose my-6 overflow-hidden rounded-lg border border-clay-hairline bg-clay-elevated">
      <div
        role="tablist"
        aria-label="Package manager"
        className="flex border-clay-hairline border-b"
      >
        {MANAGERS.map((candidate) => {
          const active = mounted && manager === candidate;
          return (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="package-manager-command"
              onClick={() => select(candidate)}
              className={
                active
                  ? 'relative border-clay-brand border-b-2 px-4 py-2 font-medium font-mono text-clay-strong text-xs'
                  : 'border-transparent border-b-2 px-4 py-2 font-mono text-clay-subtle text-xs transition-colors hover:text-clay-default'
              }
            >
              {candidate}
            </button>
          );
        })}
      </div>
      <div id="package-manager-command" role="tabpanel" className="relative bg-clay-base">
        <pre className="overflow-x-auto p-4 pr-20 font-mono text-clay-default text-sm">
          <code>
            <span aria-hidden="true" className="mr-2 select-none text-clay-inactive">
              $
            </span>
            {command}
          </code>
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy install command"
          className="absolute top-2 right-2 rounded border border-clay-hairline bg-clay-elevated px-2 py-1 font-mono text-clay-subtle text-xs transition-colors hover:bg-clay-control hover:text-clay-default"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
