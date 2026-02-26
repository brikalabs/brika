import { github } from './config';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
}

const REVALIDATE = 600;

export async function fetchLatestRelease(): Promise<{ version: string; url: string } | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${github.owner}/${github.repo}/releases/latest`,
      { next: { revalidate: REVALIDATE } }
    );
    if (!res.ok) return null;
    const data: GitHubRelease = await res.json();
    return { version: data.tag_name, url: data.html_url };
  } catch {
    return null;
  }
}
