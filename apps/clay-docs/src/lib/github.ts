export const GITHUB_REPO = 'https://github.com/brikalabs/brika';
export const GITHUB_BRANCH = 'main';

export function componentSourceUrl(slug: string): string {
  return `${GITHUB_REPO}/tree/${GITHUB_BRANCH}/packages/clay/src/components/${slug}`;
}

export function repoTreeUrl(path: string): string {
  return `${GITHUB_REPO}/tree/${GITHUB_BRANCH}/${path}`;
}
