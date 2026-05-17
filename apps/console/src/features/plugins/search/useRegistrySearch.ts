import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPlugins, type PluginListItem } from '../../../shared/cli/api/plugins';
import {
  type InstallProgress,
  installFromRegistry,
  type RegistrySearchResult,
  searchRegistry,
} from '../../../shared/cli/api/registry';
import { useHubResource } from '../../../shared/hooks/useHubResource';

export interface UseRegistrySearch {
  readonly query: string;
  readonly setQuery: (q: string) => void;
  readonly results: ReadonlyArray<RegistrySearchResult>;
  readonly searching: boolean;
  readonly searchError: string | null;
  readonly isInstalled: (r: RegistrySearchResult) => boolean;
  readonly installingName: string | null;
  readonly progress: InstallProgress | null;
  readonly installError: string | null;
  readonly startInstall: (pkg: RegistrySearchResult) => void;
}

export function useRegistrySearch(): UseRegistrySearch {
  // Own copy of the installed-name set (refetched on tab focus) so the
  // "installed" badge stays accurate without needing the Installed tab
  // to be mounted.
  const installed = useHubResource<PluginListItem[]>(fetchPlugins, []);
  const installedNames = useMemo(
    () => new Set((installed.data ?? []).map((p) => p.name)),
    [installed.data]
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReadonlyArray<RegistrySearchResult>>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installingName, setInstallingName] = useState<string | null>(null);

  // Debounced async search.
  useEffect(() => {
    if (query.trim().length === 0) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const hits = await searchRegistry(query);
          if (!cancelled) {
            setResults(hits);
            setSearchError(null);
          }
        } catch (e) {
          if (!cancelled) {
            setSearchError(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) {
            setSearching(false);
          }
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const isInstalled = useCallback(
    (r: RegistrySearchResult): boolean => r.installed || installedNames.has(r.name),
    [installedNames]
  );

  const startInstall = useCallback(
    (pkg: RegistrySearchResult): void => {
      if (isInstalled(pkg) || installingName !== null) {
        return;
      }
      setInstallingName(pkg.name);
      setInstallError(null);
      setProgress({ phase: 'starting', message: pkg.name });
      void (async () => {
        try {
          for await (const event of installFromRegistry(pkg.name, pkg.version)) {
            setProgress(event);
            if (event.phase === 'complete') {
              installed.refresh();
              setInstallingName(null);
              return;
            }
            if (event.phase === 'error') {
              setInstallError(event.message ?? 'install failed');
              setInstallingName(null);
              return;
            }
          }
        } catch (e) {
          setInstallError(e instanceof Error ? e.message : String(e));
          setInstallingName(null);
        }
      })();
    },
    [installed, installingName, isInstalled]
  );

  return {
    query,
    setQuery,
    results,
    searching,
    searchError,
    isInstalled,
    installingName,
    progress,
    installError,
    startInstall,
  };
}
