import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';

const STORAGE_KEY = 'clay-mode';

function readInitialMode(): Mode {
  if (typeof document === 'undefined') {
    return 'light';
  }
  return document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
}

/**
 * Toggles the root `data-mode` attribute between `light` and `dark`, persisting
 * the choice to `localStorage`. The initial mode is set by an inline script in
 * BaseLayout so the first paint doesn't flash the wrong scheme.
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMode(readInitialMode());
    setMounted(true);
  }, []);

  const next: Mode = mode === 'light' ? 'dark' : 'light';

  const toggle = () => {
    setMode(next);
    document.documentElement.dataset.mode = next;
    localStorage.setItem(STORAGE_KEY, next);
  };

  const label = mounted ? `Switch to ${next} mode` : 'Toggle theme';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded text-clay-subtle transition-colors hover:bg-clay-control hover:text-clay-default"
    >
      {mounted && mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
