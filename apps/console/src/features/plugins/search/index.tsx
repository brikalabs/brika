import type React from 'react';
import { useState } from 'react';
import type { RegistrySearchResult } from '../../../shared/cli/api/registry';
import { RegistryDetail } from './detail';
import { SearchList } from './list';
import { useRegistrySearch } from './useRegistrySearch';

/**
 * Search tab — type to search the registry, Enter on a hit to load
 * its details/README into a panel, Ctrl+Enter to install. Two-stage
 * so a misfired Enter never installs something the user didn't mean.
 *
 * Owns its own copy of the installed-name set (refetched on tab
 * focus) so the "installed" badge stays accurate without needing the
 * Installed tab to be mounted.
 */
export function SearchTab(): React.ReactElement {
  const {
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
  } = useRegistrySearch();

  const [selected, setSelected] = useState<RegistrySearchResult | null>(null);

  if (selected) {
    return (
      <RegistryDetail
        item={selected}
        installed={isInstalled(selected)}
        installing={installingName === selected.name}
        progress={installingName === selected.name ? progress : null}
        error={installingName === selected.name ? installError : null}
        onInstall={() => startInstall(selected)}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <SearchList
      query={query}
      onQueryChange={setQuery}
      results={results}
      searching={searching}
      searchError={searchError}
      isInstalled={isInstalled}
      onSelect={setSelected}
    />
  );
}
