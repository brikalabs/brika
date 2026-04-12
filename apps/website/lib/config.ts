/** Single source of truth for all site-wide constants. */

export const site = {
  name: 'Brika',
  tagline: 'Self-hosted Automation Hub',
  description: 'Build, run, and integrate automations locally. One binary. No cloud. Full control.',
  url: 'https://brika.dev',
  docsUrl: 'https://docs.brika.dev/',
} as const;

export const github = {
  owner: 'brikalabs',
  repo: 'brika',
  get url() {
    return `https://github.com/${this.owner}/${this.repo}`;
  },
  get licenseUrl() {
    return `${this.url}/blob/main/LICENSE`;
  },
  get rawUrl() {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/main`;
  },
} as const;

export const docker = {
  image: 'ghcr.io/brikalabs/brika',
  port: 3001,
} as const;

export const npm = {
  searchUrl: 'https://registry.npmjs.org/-/v1/search?text=keywords:brika-plugin&size=50',
  downloadsUrl: 'https://api.npmjs.org/downloads/point/last-week',
  unpkgUrl: 'https://unpkg.com',
  packageUrl: 'https://www.npmjs.com/package',
} as const;

export const registry = {
  verifiedPluginsUrl: 'https://registry.brika.dev/verified-plugins.json',
} as const;
