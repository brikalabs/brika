export interface Plugin {
  name: string;
  displayName: string;
  description: string;
  version: string;
  downloads: number;
  verified: boolean;
  iconUrl: string;
}

interface NpmSearchResult {
  objects: {
    package: {
      name: string;
      description: string;
      version: string;
    };
  }[];
}

interface NpmDownloads {
  downloads: number;
}

interface PluginPackageJson {
  displayName?: string;
}

interface VerifiedList {
  plugins: {
    name: string;
  }[];
}

import { npm, registry } from '@/lib/config';

/** Revalidate every 10 minutes */
const REVALIDATE = 600;

const EXCLUDED = new Set([
  '@brika/plugin-example-echo',
  '@brika/plugin-demo-config',
]);

function iconUrl(name: string) {
  return `${npm.unpkgUrl}/${name}/icon.svg`;
}

function fallbackDisplayName(name: string) {
  return name.replace(/^@brika\/(plugin-)?/, '');
}

export async function fetchPlugins(): Promise<Plugin[]> {
  const [npmRes, registryRes] = await Promise.all([
    fetch(npm.searchUrl, {
      next: {
        revalidate: REVALIDATE,
      },
    }),
    fetch(registry.verifiedPluginsUrl, {
      next: {
        revalidate: REVALIDATE,
      },
    }),
  ]);

  const verified = new Set<string>();
  if (registryRes.ok) {
    const data: VerifiedList = await registryRes.json();
    for (const p of data.plugins) verified.add(p.name);
  }

  if (!npmRes.ok) return [];
  const { objects }: NpmSearchResult = await npmRes.json();

  const packages = objects.map((o) => o.package).filter((p) => !EXCLUDED.has(p.name));

  // Fetch download counts and package.json (for displayName) in parallel
  const [downloadResults, pkgJsonResults] = await Promise.all([
    Promise.allSettled(
      packages.map((p) =>
        fetch(`${npm.downloadsUrl}/${p.name}`, {
          next: {
            revalidate: REVALIDATE,
          },
        })
          .then((r) =>
            r.ok
              ? r.json()
              : {
                  downloads: 0,
                }
          )
          .then((d: NpmDownloads) => d.downloads)
      )
    ),
    Promise.allSettled(
      packages.map((p) =>
        fetch(`${npm.unpkgUrl}/${p.name}/package.json`, {
          next: {
            revalidate: REVALIDATE,
          },
        }).then((r) => (r.ok ? (r.json() as Promise<PluginPackageJson>) : {}))
      )
    ),
  ]);

  return packages
    .map((p, i) => {
      const pkgJson = pkgJsonResults[i]?.status === 'fulfilled' ? pkgJsonResults[i].value : {};

      return {
        name: p.name,
        displayName: (pkgJson as PluginPackageJson).displayName ?? fallbackDisplayName(p.name),
        description: p.description,
        version: p.version,
        downloads: downloadResults[i]?.status === 'fulfilled' ? downloadResults[i].value : 0,
        verified: verified.has(p.name),
        iconUrl: iconUrl(p.name),
      };
    })
    .sort((a, b) => b.downloads - a.downloads);
}
