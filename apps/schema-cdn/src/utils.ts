import type { PackageMetadata } from './types';

// CDN URL builders
export const CDN_URLS = {
  unpkg: (pkg: string, v: string, p: string) => `https://unpkg.com/${pkg}${v}${p}`,
  jsdelivr: (pkg: string, v: string, p: string) => `https://cdn.jsdelivr.net/npm/${pkg}${v}${p}`,
} as const;

// Version utilities
const parseVer = (v: string): [number, number, number] => {
  const p = v.replace(/^\D*/, '').split('.').map(Number);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
};

const isPreRelease = (v: string) => /^\d+\.\d+\.\d+-/.test(v);

export const satisfiesVersion = (ver: string, range: string): boolean => {
  const [maj, min, pat] = parseVer(ver);
  const r = range.trim();

  if (r.startsWith('^')) {
    const [rMaj, rMin, rPat] = parseVer(r.slice(1));
    return maj === rMaj && (min > rMin || (min === rMin && pat >= rPat));
  }
  if (r.startsWith('~')) {
    const [rMaj, rMin, rPat] = parseVer(r.slice(1));
    return maj === rMaj && min === rMin && pat >= rPat;
  }
  if (r.startsWith('>=')) {
    const [rMaj, rMin, rPat] = parseVer(r.slice(2));
    return maj > rMaj || (maj === rMaj && (min > rMin || (min === rMin && pat >= rPat)));
  }
  const [rMaj, rMin, rPat] = parseVer(r);
  return maj === rMaj && min === rMin && pat === rPat;
};

export const sortVersions = (versions: string[]): string[] =>
  [...versions].sort((a, b) => {
    const [aMaj, aMin, aPat] = parseVer(a);
    const [bMaj, bMin, bPat] = parseVer(b);
    return bMaj - aMaj || bMin - aMin || bPat - aPat;
  });

export const getStableVersions = (meta: PackageMetadata): string[] =>
  Object.keys(meta.versions).filter((v) => meta.versions[v]?.dist && !isPreRelease(v));

// npm registry
export const fetchPackageMetadata = async (pkg: string): Promise<PackageMetadata | null> => {
  const res = await fetch(`https://registry.npmjs.org/${pkg}`);
  return res.ok ? res.json() : null;
};

// Path parsing
export const parseVersion = async (
  pathname: string,
  pkg: string
): Promise<{ version: string; path: string }> => {
  const path = decodeURIComponent(pathname).replace(/^\/latest\//, '/');

  // Range: /^0.1.1/, /~0.1.0/, />=0.1.0/
  const rangeMatch = path.match(/^\/([\^~>=]+)(\d+\.\d+\.\d+[^/]*)\//);
  if (rangeMatch) {
    const [, prefix, ver] = rangeMatch;
    const meta = await fetchPackageMetadata(pkg);
    if (!meta) return { version: '', path };

    const stable = getStableVersions(meta);
    const matching = stable.filter((v) => satisfiesVersion(v, `${prefix}${ver}`));
    if (!matching.length) return { version: '', path };

    return { version: `@${sortVersions(matching)[0]}`, path: path.replace(/^\/[^/]+/, '') };
  }

  // Exact: /0.1.0/
  const exactMatch = path.match(/^\/(\d+\.\d+\.\d+[^/]*)\//);
  if (exactMatch) {
    return { version: `@${exactMatch[1]}`, path: path.replace(/^\/[^/]+/, '') };
  }

  // Latest
  return { version: '', path };
};

// Path builder
export const buildFullPath = (base: string, file: string): string => {
  if (!base?.trim()) return file;
  const cleanBase = base.replace(/\/$/, '');
  const cleanFile = file.startsWith('/') ? file : `/${file}`;
  return `${cleanBase}${cleanFile}`;
};

